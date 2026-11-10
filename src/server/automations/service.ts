import { randomUUID } from "node:crypto";
import {
  automationInputSchema,
  automationKey,
  mapN8nStatus,
  type AutomationCatalog,
  type AutomationContract,
} from "@/domain/automations";
import { toAutomationRun } from "./records";
export { toAutomationRun } from "./records";
import type {
  AutomationAdapter,
  AutomationExecution,
} from "@/integrations/contracts";
import { IntegrationError } from "@/integrations/errors";
import { Store, DomainError, digest } from "../orchestration/store";
import type { Sql } from "../db/types";
import { canonicalJson } from "../canonical-json";

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;
export interface AutomationSettings {
  configured: boolean;
  configHash: string;
  originHash: string;
  contract: AutomationContract | null;
  enabled: boolean;
  errorCode?: string;
}
export class AutomationService {
  constructor(
    public store: Store,
    private adapter: AutomationAdapter,
    private settings: AutomationSettings,
  ) {}
  private async row(owner: string, id: string, sql: Sql = this.store.db) {
    const r = (
      await sql.query(
        "SELECT * FROM automation_requests WHERE id=$1 AND owner_subject=$2",
        [id, owner],
      )
    ).rows[0];
    if (!r) throw new DomainError(404, "not_found");
    return r;
  }
  decorate(r: Row) {
    const run = toAutomationRun(r);
    // IDs from a previous origin can never turn into links or lookups on a new origin.
    const same = r.origin_hash === this.settings.originHash;
    return {
      ...run,
      errorCode: same ? run.errorCode : "origin_changed",
      workflowUrl: same
        ? this.adapter.workflowUrl(run.contract.workflowId)
        : null,
      executionUrl:
        same && run.externalId
          ? this.adapter.executionUrl(run.contract.workflowId, run.externalId)
          : null,
    };
  }
  async get(owner: string, id: string) {
    return this.decorate(await this.row(owner, id));
  }
  async list(owner: string, conversationId?: string) {
    if (conversationId)
      await this.store.ownedConversation(owner, conversationId);
    const rows = (
      await this.store.db.query(
        "SELECT * FROM automation_requests WHERE owner_subject=$1 AND ($2::uuid IS NULL OR conversation_id=$2) ORDER BY created_at DESC LIMIT 50",
        [owner, conversationId ?? null],
      )
    ).rows;
    return rows.map((r) => this.decorate(r));
  }
  async catalog(owner: string): Promise<AutomationCatalog> {
    const r = (
      await this.store.db.query(
        "SELECT * FROM automation_catalog WHERE owner_subject=$1",
        [owner],
      )
    ).rows[0];
    const current = r?.config_hash === this.settings.configHash;
    const error = current ? (r?.error_code as string | null) : null;
    const checked = current ? iso(r?.synced_at) : null;
    return {
      state: !this.settings.configured
        ? this.settings.errorCode === "not_configured"
          ? "not_configured"
          : "unavailable"
        : error
          ? error === "authentication"
            ? "unauthorized"
            : "unavailable"
          : checked
            ? Date.now() - new Date(checked).getTime() > 90_000
              ? "stale"
              : "connected"
            : "configured",
      workflows: current
        ? ((r?.workflows as AutomationCatalog["workflows"]) ?? [])
        : [],
      syncedAt: checked,
      errorCode: this.settings.errorCode ?? error,
      truncated: current ? !!r?.truncated : false,
      contract: this.settings.contract,
      executionEnabled: this.settings.enabled,
    };
  }
  async syncCatalog(owner: string) {
    if (!this.settings.configured) return this.catalog(owner);
    try {
      const snapshot = await this.adapter.listWorkflows();
      const contract = this.settings.contract;
      for (const w of snapshot.workflows) {
        if (!contract || w.id !== contract.workflowId) continue;
        try {
          await this.adapter.verifyContract(contract);
          w.eligible = true;
          w.reason = null;
          w.versionId = contract.versionId;
        } catch (e) {
          w.reason =
            e instanceof IntegrationError && e.code === "authentication"
              ? "authentication"
              : "contract_changed";
        }
      }
      await this.store.db.query(
        "INSERT INTO automation_catalog(owner_subject,config_hash,workflows,truncated,synced_at,error_code) VALUES($1,$2,$3,$4,now(),NULL) ON CONFLICT(owner_subject) DO UPDATE SET config_hash=EXCLUDED.config_hash,workflows=EXCLUDED.workflows,truncated=EXCLUDED.truncated,synced_at=now(),error_code=NULL,checked_at=now()",
        [
          owner,
          this.settings.configHash,
          JSON.stringify(snapshot.workflows),
          snapshot.truncated,
        ],
      );
      await this.store.recordCheck("n8n", null);
    } catch (e) {
      const code = e instanceof IntegrationError ? e.code : "provider";
      await this.store.db.query(
        "INSERT INTO automation_catalog(owner_subject,config_hash,error_code) VALUES($1,$2,$3) ON CONFLICT(owner_subject) DO UPDATE SET workflows=CASE WHEN automation_catalog.config_hash=EXCLUDED.config_hash THEN automation_catalog.workflows ELSE '[]'::jsonb END,synced_at=CASE WHEN automation_catalog.config_hash=EXCLUDED.config_hash THEN automation_catalog.synced_at ELSE NULL END,config_hash=EXCLUDED.config_hash,error_code=EXCLUDED.error_code,checked_at=now()",
        [owner, this.settings.configHash, code],
      );
      await this.store.recordCheck("n8n", code);
    }
    return this.catalog(owner);
  }
  async prepare(owner: string, key: string, input: unknown) {
    const validated = automationInputSchema.parse(input);
    const c = this.settings.contract;
    if (!this.settings.configured) throw new IntegrationError("configuration");
    if (key !== automationKey || !c || key !== c.key)
      throw new DomainError(409, "not_eligible");
    try {
      await this.adapter.verifyContract(c);
    } catch (e) {
      if (e instanceof IntegrationError && e.code === "malformed")
        throw new DomainError(409, "contract_changed");
      throw e;
    }
    return {
      contract: c,
      input: validated,
      originHash: this.settings.originHash,
    };
  }
  async persistProposal(
    sql: Sql,
    owner: string,
    requestId: string,
    prepared: Awaited<ReturnType<AutomationService["prepare"]>>,
    conversationId: string | null = null,
    turnId: string | null = null,
  ) {
    if (conversationId)
      await this.store.ownedConversation(owner, conversationId, sql);
    const requestHash = digest(
      canonicalJson({
        key: prepared.contract.key,
        input: prepared.input,
        conversationId,
      }),
    );
    const id = randomUUID();
    const actionHash = digest(
      canonicalJson({
        id,
        contract: prepared.contract,
        input: prepared.input,
        originHash: prepared.originHash,
      }),
    );
    await sql.query(
      "INSERT INTO automation_requests(id,owner_subject,request_id,request_hash,origin_hash,conversation_id,turn_id,state,contract,input,action_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'awaiting_confirmation',$8,$9,$10,now()+interval '30 minutes') ON CONFLICT(request_id) DO NOTHING",
      [
        id,
        owner,
        requestId,
        requestHash,
        prepared.originHash,
        conversationId,
        turnId,
        JSON.stringify(prepared.contract),
        JSON.stringify(prepared.input),
        actionHash,
      ],
    );
    const r = (
      await sql.query(
        "SELECT * FROM automation_requests WHERE request_id=$1 AND owner_subject=$2",
        [requestId, owner],
      )
    ).rows[0];
    if (!r) throw new DomainError(404, "not_found");
    if (r.request_hash !== requestHash)
      throw new DomainError(409, "request_conflict");
    return this.decorate(r);
  }
  async propose(
    owner: string,
    requestId: string,
    key: string,
    input: unknown,
    conversationId: string | null = null,
  ) {
    const validated = automationInputSchema.parse(input);
    if (conversationId)
      await this.store.ownedConversation(owner, conversationId);
    const previous = (
      await this.store.db.query(
        "SELECT * FROM automation_requests WHERE request_id=$1",
        [requestId],
      )
    ).rows[0];
    if (previous) {
      if (previous.owner_subject !== owner)
        throw new DomainError(404, "not_found");
      if (
        previous.request_hash !==
        digest(canonicalJson({ key, input: validated, conversationId }))
      )
        throw new DomainError(409, "request_conflict");
      return this.decorate(previous);
    }
    const prepared = await this.prepare(owner, key, validated);
    return this.store.db.transaction((tx) =>
      this.persistProposal(tx, owner, requestId, prepared, conversationId),
    );
  }
  async confirm(owner: string, id: string, hash: string) {
    const row = await this.row(owner, id),
      run = toAutomationRun(row);
    if (run.actionHash !== hash) throw new DomainError(409, "plan_changed");
    if (run.confirmedAt) return this.decorate(row);
    if (run.state !== "awaiting_confirmation")
      throw new DomainError(409, "invalid_state");
    if (Date.now() > new Date(run.expiresAt).getTime())
      throw new DomainError(409, "confirmation_expired");
    if (row.origin_hash !== this.settings.originHash)
      throw new DomainError(409, "origin_changed");
    if (!this.settings.enabled) throw new IntegrationError("disabled");
    const current = await this.prepare(owner, run.contract.key, run.input);
    if (canonicalJson(current.contract) !== canonicalJson(run.contract))
      throw new DomainError(409, "contract_changed");
    const claimed = (
      await this.store.db.query(
        "UPDATE automation_requests SET state='submitting',confirmed_at=now(),confirmed_by=$2,submission_started_at=now(),updated_at=now() WHERE id=$1 AND owner_subject=$2 AND state='awaiting_confirmation' AND confirmed_at IS NULL AND expires_at>now() RETURNING id",
        [id, owner],
      )
    ).rows.length;
    if (!claimed) return this.get(owner, id);
    try {
      const external = await this.adapter.execute(
        run.contract,
        id,
        run.input.text,
      );
      await this.store.db.query(
        "UPDATE automation_requests SET state=$2,external_id=$3,error_code=$4,updated_at=now() WHERE id=$1 AND state='submitting'",
        [
          id,
          external.rejected ? "failed" : external.id ? "accepted" : "unknown",
          external.id,
          external.rejected
            ? "submission_rejected"
            : external.id
              ? null
              : "submission_unknown",
        ],
      );
    } catch (e) {
      const uncertain = !(e instanceof IntegrationError) || e.uncertain;
      await this.store.db.query(
        "UPDATE automation_requests SET state=$2,error_code=$3,updated_at=now() WHERE id=$1 AND state='submitting'",
        [
          id,
          uncertain ? "unknown" : "failed",
          uncertain ? "submission_unknown" : (e as IntegrationError).code,
        ],
      );
      console.error(
        JSON.stringify({
          event: "automation_submission_failed",
          requestId: id,
          code: uncertain ? "submission_unknown" : "rejected",
        }),
      );
    }
    return this.get(owner, id);
  }
  async stop(owner: string, id: string) {
    await this.row(owner, id);
    await this.store.db.query(
      "UPDATE automation_requests SET tracking=false,state=CASE WHEN confirmed_at IS NULL THEN 'cancelled' ELSE state END,updated_at=now() WHERE id=$1 AND owner_subject=$2",
      [id, owner],
    );
    return this.get(owner, id);
  }
  async refresh(owner: string, id: string) {
    await this.row(owner, id);
    await this.reconcileOne(id);
    return this.get(owner, id);
  }
  private async observation(r: Row, external: AutomationExecution) {
    const run = toAutomationRun(r);
    const state = mapN8nStatus(external.status);
    if (
      ["succeeded", "failed", "cancelled"].includes(run.state) &&
      run.state !== state
    )
      return;
    const validResult =
      external.result &&
      external.result.requestId === run.id &&
      external.result.transformedText === run.input.text.trim().toUpperCase();
    await this.store.db.query(
      "UPDATE automation_requests SET state=$2,external_id=$3,external_status=$4,synced_at=now(),started_at=$5,stopped_at=$6,wait_till=$7,result=$8,result_issue=$9,error_code=$10,updated_at=now() WHERE id=$1",
      [
        run.id,
        state,
        external.id,
        external.status,
        external.startedAt,
        external.stoppedAt,
        external.waitTill,
        validResult
          ? JSON.stringify({
              transformedText: external.result!.transformedText,
            })
          : null,
        state === "succeeded" && !validResult ? "malformed_result" : null,
        state === "unknown"
          ? "external_unknown"
          : state === "failed"
            ? "external_failed"
            : null,
      ],
    );
  }
  async reconcileOne(id: string) {
    const r = (
      await this.store.db.query(
        "UPDATE automation_requests SET lease_until=now()+interval '5 minutes' WHERE id=$1 AND confirmed_at IS NOT NULL AND state<>'submitting' AND (lease_until IS NULL OR lease_until<now()) RETURNING *",
        [id],
      )
    ).rows[0];
    if (!r) return;
    try {
      if (r.origin_hash !== this.settings.originHash)
        throw new DomainError(409, "origin_changed");
      const run = toAutomationRun(r);
      let externalId = run.externalId;
      if (!externalId) {
        if (run.errorCode !== "submission_unknown") return;
        const after = new Date(
          new Date(r.submission_started_at as string | Date).getTime() - 30_000,
        ).toISOString();
        const candidates = await this.adapter.findExecutions(
          run.contract.workflowId,
          after,
        );
        if (!candidates.complete) return;
        const matches: AutomationExecution[] = [];
        for (const candidate of candidates.ids) {
          const e = await this.adapter.readExecution(
            run.contract.workflowId,
            candidate,
            true,
          );
          if (
            e.correlation?.requestId === id &&
            e.correlation.text === run.input.text &&
            e.mode === "manual"
          )
            matches.push(e);
        }
        if (matches.length !== 1) return;
        externalId = matches[0].id;
      }
      let external = await this.adapter.readExecution(
        run.contract.workflowId,
        externalId,
      );
      if (external.status === "success") {
        try {
          const data = await this.adapter.readExecution(
            run.contract.workflowId,
            externalId,
            true,
          );
          external = {
            ...external,
            result: data.status === "success" ? data.result : null,
          };
        } catch {
          // Keep the authoritative success observation even if retention/redaction hides the result.
          await this.observation(r, external);
          await this.store.db.query(
            "UPDATE automation_requests SET result_issue='result_unavailable' WHERE id=$1",
            [id],
          );
          return;
        }
      }
      await this.observation(r, external);
    } catch (e) {
      await this.store.db.query(
        "UPDATE automation_requests SET error_code=CASE WHEN external_id IS NULL THEN error_code ELSE $2 END,updated_at=now() WHERE id=$1",
        [id, e instanceof DomainError ? e.code : "sync_error"],
      );
    } finally {
      await this.store.db.query(
        "UPDATE automation_requests SET lease_until=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
    }
  }
  async tick() {
    await this.store.db.query(
      "UPDATE automation_requests SET tracking=false WHERE tracking=true AND created_at<now()-interval '24 hours'",
    );
    await this.store.db.query(
      "UPDATE automation_requests SET state='unknown',error_code='submission_unknown',updated_at=now() WHERE state='submitting' AND submission_started_at<now()-interval '90 seconds'",
    );
    const ids = (
      await this.store.db.query(
        "SELECT id FROM automation_requests WHERE tracking=true AND confirmed_at IS NOT NULL AND state NOT IN ('awaiting_confirmation','submitting','succeeded','failed','cancelled') AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at LIMIT 3",
      )
    ).rows;
    for (const r of ids) await this.reconcileOne(r.id as string);
    return ids.length;
  }
  async offered(owner: string) {
    const catalog = await this.catalog(owner);
    return catalog.state === "connected" &&
      catalog.contract &&
      catalog.workflows.some(
        (w) => w.eligible && w.id === catalog.contract!.workflowId,
      )
      ? [catalog.contract]
      : [];
  }
}
