import { randomUUID } from "node:crypto";
import {
  assertTransition,
  mapPaperclipStatus,
  replySchema,
  terminalStates,
} from "@/domain/orchestration";
import type { Agent } from "@/domain/models";
import type { PlanningGateway } from "@/integrations/nexos";
import type { DelegationAdapter } from "@/integrations/paperclip";
import { IntegrationError } from "@/integrations/errors";
import { Store, DomainError, digest, marker, toRun } from "./store";
import type { AutomationService } from "../automations/service";

export class OrchestrationService {
  constructor(
    public store: Store,
    private gateway: PlanningGateway,
    private paperclip: DelegationAdapter,
    private delegationEnabled: boolean,
    private automations?: AutomationService,
  ) {}
  async agents(): Promise<Agent[]> {
    try {
      const agents = await this.paperclip.listAgents();
      await this.store.recordCheck("paperclip", null);
      return agents;
    } catch (error) {
      await this.store.recordCheck(
        "paperclip",
        error instanceof IntegrationError ? error.code : "provider",
      );
      throw error;
    }
  }
  async submit(
    owner: string,
    conversationId: string,
    requestId: string,
    text: string,
    signal?: AbortSignal,
  ) {
    const turn = await this.store.beginTurn(
      owner,
      conversationId,
      requestId,
      text,
    );
    if (!turn.created) return this.store.snapshot(owner, conversationId);
    try {
      // Gateway conversation is bounded. External task results are never inserted as instructions.
      const snapshot = await this.store.snapshot(owner, conversationId);
      const messages = snapshot.messages
        .slice(-20)
        .map(({ role, content }) => ({ role, content }));
      let agents: Agent[] = [];
      try {
        agents = await this.agents();
      } catch {
        /* Ordinary answers and an explicitly unassigned proposal remain possible. */
      }
      const offered = (await this.automations?.offered(owner)) ?? [];
      const result = await this.gateway.complete(
        messages,
        agents,
        signal,
        offered,
      );
      const reply = replySchema.parse(result.reply);
      const automation =
        reply.kind === "automation" &&
        this.automations &&
        offered.some((a) => a.key === reply.automation.key)
          ? await this.automations.prepare(
              owner,
              reply.automation.key,
              reply.automation.input,
            )
          : null;
      if (reply.kind === "automation" && !automation)
        throw new IntegrationError("malformed");
      if (
        reply.kind === "plan" &&
        reply.plan.agentId &&
        !agents.some((a) => a.id === reply.plan.agentId && a.eligible)
      )
        throw new IntegrationError("malformed");
      await this.store.db.transaction(async (tx) => {
        const current = await tx.query(
          "UPDATE turns SET status='completed' WHERE id=$1 AND status='pending' RETURNING id",
          [turn.id],
        );
        if (!current.rows.length) return;
        await tx.query(
          "INSERT INTO messages(id,conversation_id,turn_id,role,content,usage) VALUES($1,$2,$3,'assistant',$4,$5)",
          [
            randomUUID(),
            conversationId,
            turn.id,
            reply.reply,
            result.usage ? JSON.stringify(result.usage) : null,
          ],
        );
        if (reply.kind === "plan") {
          const plan = {
            ...reply.plan,
            agentName: agents.find((a) => a.id === reply.plan.agentId)?.name,
            constraints: [
              ...reply.plan.constraints,
              "Tik ši peržiūrėta užduotis. Jokių produkcijos pakeitimų, naujų prieigų ar išorinių pranešimų.",
              "Laikytis Paperclip biudžetų, leidimų ir peržiūros taisyklių. Rezultatus pateikti peržiūrai.",
            ],
          };
          await tx.query(
            "INSERT INTO orchestration_runs(id,conversation_id,turn_id,state,plan,plan_hash,error_code) VALUES($1,$2,$3,$4,$5,$6,$7)",
            [
              randomUUID(),
              conversationId,
              turn.id,
              plan.agentId ? "awaiting_confirmation" : "blocked",
              JSON.stringify(plan),
              digest(JSON.stringify(plan)),
              plan.agentId ? null : "agent_unavailable",
            ],
          );
        }
        if (automation)
          await this.automations!.persistProposal(
            tx,
            owner,
            turn.id,
            automation,
            conversationId,
            turn.id,
          );
      });
      await this.store.recordCheck("nexos", null);
    } catch (error) {
      const code = error instanceof IntegrationError ? error.code : "provider";
      await this.store.db.query(
        "UPDATE turns SET status='failed',error_code=$2 WHERE id=$1 AND status='pending'",
        [turn.id, code],
      );
      await this.store.recordCheck("nexos", code);
      // Never log prompts, provider bodies, endpoints or credentials.
      console.error(
        JSON.stringify({ event: "turn_failed", turnId: turn.id, code }),
      );
    }
    return this.store.snapshot(owner, conversationId);
  }
  async confirm(
    owner: string,
    id: string,
    planHash: string,
    signal?: AbortSignal,
  ) {
    const run = await this.store.ownedRun(owner, id);
    if (run.planHash !== planHash) throw new DomainError(409, "plan_changed");
    if (run.confirmedAt) return run; // Repeated confirmation never repeats the POST.
    if (run.state !== "awaiting_confirmation")
      throw new DomainError(409, "invalid_state");
    if (!this.delegationEnabled) throw new IntegrationError("disabled");
    const agents = await this.agents();
    if (!agents.some((a) => a.id === run.plan.agentId && a.eligible))
      throw new IntegrationError("agent_unavailable");
    assertTransition(run.state, "delegating");
    const claimed = await this.store.db.query(
      "UPDATE orchestration_runs SET state='delegating',confirmed_at=now(),confirmed_by=$2,delegation_started_at=now(),updated_at=now() WHERE id=$1 AND state='awaiting_confirmation' AND confirmed_at IS NULL RETURNING id",
      [id, owner],
    );
    if (!claimed.rows.length) return this.store.ownedRun(owner, id);
    const description = [
      marker(id),
      run.plan.objective,
      run.plan.boundedTask,
      "Priėmimo kriterijai:",
      ...run.plan.completionCriteria.map((s) => `- ${s}`),
      "Apribojimai:",
      ...run.plan.constraints.map((s) => `- ${s}`),
    ].join("\n\n");
    try {
      const task = await this.paperclip.createTask(
        { title: run.plan.title, description, agentId: run.plan.agentId! },
        signal,
      );
      await this.store.db.query(
        "UPDATE orchestration_runs SET state='delegated',external_task_id=$2,error_code=NULL,updated_at=now() WHERE id=$1 AND state='delegating'",
        [id, task.id],
      );
    } catch (error) {
      const uncertain = !(error instanceof IntegrationError) || error.uncertain;
      await this.store.db.query(
        "UPDATE orchestration_runs SET state=$2,error_code=$3,updated_at=now() WHERE id=$1 AND state='delegating'",
        [
          id,
          uncertain ? "blocked" : "failed",
          uncertain ? "creation_uncertain" : error.code,
        ],
      );
    }
    const fresh = await this.store.ownedRun(owner, id);
    if (fresh.externalTaskId) await this.reconcileOne(id);
    return this.store.ownedRun(owner, id);
  }
  async stopTracking(owner: string, id: string) {
    const run = await this.store.ownedRun(owner, id);
    if (!run.tracking) return run;
    if (!run.confirmedAt) {
      assertTransition(run.state, "cancelled");
      await this.store.db.query(
        "UPDATE orchestration_runs SET state='cancelled',tracking=false,updated_at=now() WHERE id=$1 AND confirmed_at IS NULL",
        [id],
      );
    } else
      await this.store.db.query(
        "UPDATE orchestration_runs SET tracking=false,updated_at=now() WHERE id=$1",
        [id],
      );
    return this.store.ownedRun(owner, id);
  }
  async refresh(owner: string, id: string) {
    await this.store.ownedRun(owner, id);
    await this.reconcileOne(id);
    return this.store.ownedRun(owner, id);
  }
  async reconcileOne(id: string) {
    const claimed = await this.store.db.query(
      "UPDATE orchestration_runs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND confirmed_at IS NOT NULL AND (lease_until IS NULL OR lease_until<now()) RETURNING *",
      [id],
    );
    if (!claimed.rows.length) return;
    const run = toRun(claimed.rows[0]);
    try {
      let externalId = run.externalTaskId;
      if (!externalId) {
        if (run.state === "delegating") return; // Worker first marks expired create attempts uncertain.
        if (
          run.errorCode !== "creation_uncertain" &&
          run.errorCode !== "multiple_matches"
        )
          return;
        const matches = (await this.paperclip.findByMarker(marker(id))).filter(
          (t) =>
            t.title === run.plan.title &&
            t.assigneeAgentId === run.plan.agentId,
        );
        if (matches.length !== 1) {
          await this.store.db.query(
            "UPDATE orchestration_runs SET error_code=$2,updated_at=now() WHERE id=$1",
            [
              id,
              matches.length > 1 ? "multiple_matches" : "creation_uncertain",
            ],
          );
          return;
        }
        externalId = matches[0].id;
      }
      const task = await this.paperclip.readTask(externalId);
      const state = mapPaperclipStatus(task.status);
      // Terminal observations are retained; an externally reopened task needs a new reviewed tracking policy.
      if (terminalStates.includes(run.state) && state !== run.state) return;
      if (run.state !== state) assertTransition(run.state, state);
      await this.store.db.query(
        "UPDATE orchestration_runs SET state=$2,external_task_id=$3,external_status=$4,synced_at=now(),result=$5,error_code=$6,updated_at=now() WHERE id=$1",
        [
          id,
          state,
          externalId,
          task.status,
          JSON.stringify({
            identifier: task.identifier,
            title: task.title,
            description: task.description,
            comments: task.comments,
          }),
          state === "blocked"
            ? task.status === "blocked"
              ? "external_blocked"
              : "external_unknown"
            : null,
        ],
      );
      await this.store.recordCheck("paperclip", null);
    } catch (error) {
      await this.store.db.query(
        "UPDATE orchestration_runs SET error_code=CASE WHEN external_task_id IS NULL THEN error_code ELSE 'sync_error' END,updated_at=now() WHERE id=$1",
        [id],
      );
      await this.store.recordCheck(
        "paperclip",
        error instanceof IntegrationError ? error.code : "provider",
      );
    } finally {
      await this.store.db.query(
        "UPDATE orchestration_runs SET lease_until=NULL WHERE id=$1",
        [id],
      );
    }
  }
  async tick() {
    // Model requests are not retried after restart. No paid side effect is hidden in recovery.
    await this.store.db.query(
      "UPDATE turns SET status='failed',error_code='interrupted' WHERE status='pending' AND created_at<now()-interval '3 minutes'",
    );
    await this.store.db.query(
      "UPDATE orchestration_runs SET state='blocked',error_code='creation_uncertain',updated_at=now() WHERE state='delegating' AND delegation_started_at<now()-interval '90 seconds'",
    );
    const ids = (
      await this.store.db.query(
        "SELECT id FROM orchestration_runs WHERE tracking=true AND confirmed_at IS NOT NULL AND state NOT IN ('completed','failed','cancelled','delegating') AND (lease_until IS NULL OR lease_until<now()) ORDER BY updated_at LIMIT 10",
      )
    ).rows;
    for (const r of ids) await this.reconcileOne(r.id as string);
    return ids.length;
  }
}
