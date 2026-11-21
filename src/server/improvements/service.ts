import { randomUUID } from "node:crypto";
import type { Database, Sql } from "../db/types";
import { DomainError } from "../orchestration/store";
import type {
  Improvement,
  ImprovementCommand,
  RepositoryContext,
  ImprovementPlan,
} from "@/domain/improvements";
import { improvementCommand, planSchema } from "@/domain/improvements";
import type { KnowledgeService } from "../knowledge/service";
import type { Passage } from "@/domain/knowledge";
import type { CodingExecutor } from "./executor";
import type { ImprovementRepository } from "./repository";
import type { PlatformPlanner } from "./planner";
import { assertScope, fingerprint, redact } from "./safety";
import { IntegrationError } from "@/integrations/errors";
import { rejectSecrets } from "../knowledge/text";

const now = () => new Date().toISOString();
// Three times the validation workflow's own 20 minute limit.
const validationWaitMs = 60 * 60_000;
type Kind =
  "discuss" | "investigate" | "submit" | "sync" | "evidence" | "cancel";
const lockedStates = [
  "queued",
  "implementing",
  "validating",
  "integration_authorized",
  "integrated",
  "cancelled",
];
export class ImprovementService {
  constructor(
    public db: Database,
    public repo: ImprovementRepository,
    public planner: PlatformPlanner,
    public executor: CodingExecutor,
    private knowledge: KnowledgeService | null = null,
  ) {}
  async list(owner: string) {
    return (
      await this.db.query(
        "SELECT r.data,r.version,s.occurrences,s.last_seen FROM improvement_requests r LEFT JOIN improvement_signals s ON s.request_id=r.id AND s.owner_subject=r.owner_subject WHERE r.owner_subject=$1 ORDER BY r.updated_at DESC LIMIT 100",
        [owner],
      )
    ).rows.map((r) => ({
      ...(r.data as Improvement),
      version: Number(r.version),
      ...(r.occurrences
        ? {
            signal: {
              occurrences: Number(r.occurrences),
              lastSeen: new Date(r.last_seen as string).toISOString(),
            },
          }
        : {}),
    }));
  }
  async get(
    owner: string,
    id: string,
    tx: Sql = this.db,
    lock = false,
  ): Promise<Improvement> {
    const r = (
      await tx.query(
        `SELECT data,version FROM improvement_requests WHERE owner_subject=$1 AND id=$2${lock ? " FOR UPDATE" : ""}`,
        [owner, id],
      )
    ).rows[0];
    if (!r) throw new DomainError(404, "not_found");
    return { ...(r.data as Improvement), version: Number(r.version) };
  }
  private async save(tx: Sql, r: Improvement, event: string, owner: string) {
    r.updatedAt = now();
    r.history = [...r.history, { event, at: r.updatedAt, owner }].slice(-100);
    const version = r.version;
    r.version++;
    const saved = await tx.query(
      "UPDATE improvement_requests SET data=$1::jsonb,version=version+1,updated_at=now() WHERE id=$2 AND version=$3 RETURNING id",
      [JSON.stringify(r), r.id, version],
    );
    if (!saved.rows.length) throw new DomainError(409, "improvement_changed");
  }
  private async queue(tx: Sql, r: Improvement, kind: Kind) {
    const id = randomUUID();
    await tx.query(
      "INSERT INTO improvement_jobs(id,request_id,kind) VALUES($1,$2,$3)",
      [id, r.id, kind],
    );
    r.job = kind;
  }
  private invalidate(r: Improvement) {
    r.authorization = null;
    r.review = null;
    r.integration = null;
  }
  private setPlan(r: Improvement, plan: ImprovementPlan) {
    rejectSecrets(JSON.stringify(plan));
    assertScope(plan);
    if (!r.context) throw new DomainError(409, "repository_boundary");
    r.plan = plan;
    r.planRevision++;
    this.invalidate(r);
    r.candidate = null;
    r.planHash = fingerprint({
      plan,
      revision: r.planRevision,
      context: r.context,
      messages: r.messages.filter((m) => m.role === "user"),
      projectId: r.projectId,
      knowledge: r.knowledge,
    });
    r.state = "awaiting_authorization";
    r.error = null;
  }
  async create(
    owner: string,
    key: string,
    text: string,
    projectId: string | null,
    includeGlobal: boolean,
    relatedRequestId: string | null = null,
  ) {
    const inputHash = fingerprint({
      text,
      projectId,
      includeGlobal,
      relatedRequestId,
    });
    return this.db.transaction(async (tx) => {
      // Serializes same-owner intake, including duplicate signal proposals.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `improvement:${owner}`,
      ]);
      const existing = (
        await tx.query(
          "SELECT id,input_hash FROM improvement_requests WHERE owner_subject=$1 AND request_key=$2",
          [owner, key],
        )
      ).rows[0];
      if (existing) {
        if (existing.input_hash !== inputHash)
          throw new DomainError(409, "request_conflict");
        return this.get(owner, existing.id as string, tx);
      }
      const id = randomUUID(),
        at = now();
      const r: Improvement = {
        id,
        version: 1,
        title: redact(text, 90),
        request: redact(text, 4000),
        state: "discussing",
        projectId,
        includeGlobal,
        messages: [{ role: "user", text: redact(text, 4000), at }],
        context: null,
        knowledge: [],
        plan: null,
        planRevision: 0,
        planHash: null,
        authorization: null,
        policy: null,
        submissionAttempted: false,
        uncertain: false,
        external: null,
        candidate: null,
        review: null,
        integration: null,
        error: null,
        cancellation: null,
        outcome: null,
        job: null,
        readRetries: 0,
        createdAt: at,
        updatedAt: at,
        history: [{ event: "created", at, owner }],
        relatedRequestId,
      };
      await tx.query(
        "INSERT INTO improvement_requests(id,owner_subject,request_key,input_hash,data) VALUES($1,$2,$3,$4,$5::jsonb)",
        [id, owner, key, inputHash, JSON.stringify(r)],
      );
      return r;
    });
  }
  async command(
    owner: string,
    input: ImprovementCommand,
  ): Promise<Improvement> {
    const b = improvementCommand.parse(input);
    if (b.action === "create") {
      if (b.relatedRequestId) await this.get(owner, b.relatedRequestId);
      return this.create(
        owner,
        b.key,
        b.text,
        b.projectId,
        b.includeGlobal,
        b.relatedRequestId ?? null,
      );
    }
    if (b.action === "signal") {
      // Enum-only evidence deliberately excludes stack traces, URLs and secrets.
      const fp = fingerprint({ code: b.code, area: b.area });
      const r = await this.create(
        owner,
        b.key,
        `Pastebėtas programos signalas: ${b.code} (${b.area}). Priežastis dar nenustatyta; reikalingas savininko tyrimas.`,
        null,
        false,
      );
      return this.db.transaction(async (tx) => {
        await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
          `signal:${owner}:${fp}`,
        ]);
        const old = (
          await tx.query(
            "SELECT request_id FROM improvement_signals WHERE owner_subject=$1 AND fingerprint=$2",
            [owner, fp],
          )
        ).rows[0];
        if (old) {
          await tx.query(
            "UPDATE improvement_signals SET occurrences=occurrences+1,last_seen=now() WHERE owner_subject=$1 AND fingerprint=$2",
            [owner, fp],
          );
          // The intake key is deterministic in the UI; concurrent different keys
          // must not leave a second suggestion or any queued work.
          if (old.request_id !== r.id)
            await tx.query(
              "DELETE FROM improvement_requests WHERE id=$1 AND data->>'state'='discussing' AND NOT EXISTS(SELECT 1 FROM improvement_jobs WHERE request_id=$1)",
              [r.id],
            );
          return this.get(owner, old.request_id as string, tx);
        }
        await tx.query(
          "INSERT INTO improvement_signals(owner_subject,fingerprint,request_id) VALUES($1,$2,$3)",
          [owner, fp, r.id],
        );
        return r;
      });
    }
    // Network readiness checks happen before locks; approval is still compared
    // against the exact version/plan inside the transaction.
    const policy =
      b.action === "authorize" ? await this.executor.ready() : null;
    const fresh =
      b.action === "integrate" ? await this.freshEvidence(owner, b.id) : null;
    return this.db.transaction(async (tx) => {
      const r = await this.get(owner, b.id, tx, true);
      if (r.version !== b.version)
        throw new DomainError(409, "improvement_changed");
      if (r.job && !["cancel", "reject"].includes(b.action))
        throw new DomainError(409, "turn_pending");
      switch (b.action) {
        case "message":
          if (["queued", "cancelled", "integrated"].includes(r.state))
            throw new DomainError(409, "invalid_state");
          if (r.messages.length >= 40)
            throw new DomainError(409, "invalid_state");
          r.messages.push({
            role: "user",
            text: redact(b.text, 4000),
            at: now(),
          });
          if (r.submissionAttempted) {
            r.review = null;
            r.integration = null;
            if (r.state === "integration_authorized")
              r.state = "ready_for_review";
          } else {
            this.invalidate(r);
            r.planHash = null;
            r.state = "discussing";
          }
          await this.queue(tx, r, "discuss");
          break;
        case "investigate":
          if (lockedStates.includes(r.state) || r.submissionAttempted)
            throw new DomainError(409, "invalid_state");
          this.invalidate(r);
          r.planHash = null;
          r.state = "investigating";
          r.context = {
            repository: this.repo.repository,
            target: this.repo.target,
            base: "",
            sources: [],
            tree: b.paths,
          };
          await this.queue(tx, r, "investigate");
          break;
        case "plan":
          if (lockedStates.includes(r.state) || r.submissionAttempted)
            throw new DomainError(409, "invalid_state");
          if (!r.context?.base)
            throw new DomainError(409, "repository_boundary");
          this.setPlan(r, b.plan);
          break;
        case "authorize":
          if (
            r.state !== "awaiting_authorization" ||
            r.planHash !== b.planHash ||
            !r.context?.base ||
            !r.plan ||
            !policy ||
            b.policyHash !== fingerprint(policy) ||
            r.submissionAttempted
          )
            throw new DomainError(409, "plan_changed");
          assertScope(r.plan);
          r.policy = policy;
          r.authorization = {
            planHash: b.planHash,
            base: r.context.base,
            policyHash: fingerprint(policy),
            owner,
            at: now(),
          };
          r.state = "queued";
          r.error = null;
          await this.queue(tx, r, "submit");
          break;
        case "sync":
          if (r.state === "integrated")
            throw new DomainError(409, "invalid_state");
          if (!r.submissionAttempted && !r.external)
            throw new DomainError(409, "invalid_state");
          if (r.readRetries >= 3) throw new DomainError(409, "retry_limit");
          await this.queue(
            tx,
            r,
            ![
              "integration_authorized",
              "cancelled",
              "changes_requested",
            ].includes(r.state) &&
              r.external &&
              ["done", "in_review"].includes(r.external.status)
              ? "evidence"
              : "sync",
          );
          break;
        case "retry":
          if (!["blocked", "failed"].includes(r.state) || r.readRetries >= 3)
            throw new DomainError(409, "retry_limit");
          r.readRetries++;
          if (r.submissionAttempted)
            await this.queue(
              tx,
              r,
              r.external && ["done", "in_review"].includes(r.external.status)
                ? "evidence"
                : "sync",
            );
          else if (r.authorization && r.planHash === r.authorization.planHash) {
            r.state = "queued";
            await this.queue(tx, r, "submit");
          } else {
            r.state = "discussing";
            r.error = null;
          }
          break;
        case "review": {
          const c = r.candidate;
          if (r.state !== "ready_for_review" || !c?.passed)
            throw new DomainError(409, "validation_failed");
          if (
            b.review.candidate !== c.commit ||
            b.review.diffHash !== c.diffHash ||
            b.review.validationHash !== c.validationHash
          )
            throw new DomainError(409, "candidate_changed");
          if (
            b.review.criteria.length !== r.plan?.criteria.length ||
            !b.review.criteria.every(Boolean) ||
            !b.review.security ||
            !b.review.compatibility ||
            !b.review.scope ||
            !b.review.validation
          )
            throw new DomainError(409, "validation_failed");
          r.review = {
            ...b.review,
            findings: redact(b.review.findings, 2400),
            targetCommit: c.targetCommit,
            reviewer: "owner-self-review",
            at: now(),
          };
          r.integration = null;
          break;
        }
        case "integrate": {
          const c = r.candidate,
            review = r.review;
          if (
            !c?.passed ||
            !review ||
            !fresh ||
            b.target !== c.target ||
            fresh.target !== c.target ||
            b.candidate !== c.commit ||
            b.validationHash !== c.validationHash ||
            review.candidate !== fresh.commit ||
            review.diffHash !== fresh.diffHash ||
            review.validationHash !== fresh.validationHash ||
            review.targetCommit !== fresh.targetCommit ||
            !fresh.passed
          )
            throw new DomainError(409, "candidate_changed");
          r.integration = {
            candidate: c.commit,
            target: c.target,
            targetCommit: c.targetCommit,
            diffHash: c.diffHash,
            validationHash: c.validationHash,
            owner,
            at: now(),
            mode: "manual",
          };
          r.state = "integration_authorized";
          r.outcome =
            "Paruošta rankiniam integravimui. Programa nesukūrė PR ir nesujungė šakų. Integruokite tik nurodytą commit; diegimas yra atskiras 6 etapas.";
          break;
        }
        case "changes":
          if (
            !["ready_for_review", "blocked", "failed", "validating"].includes(
              r.state,
            )
          )
            throw new DomainError(409, "invalid_state");
          r.messages.push({
            role: "user",
            text: redact(b.text, 2400),
            at: now(),
          });
          this.invalidate(r);
          r.state = "changes_requested";
          r.outcome =
            "Šis kandidatas atmestas. Naujam kodavimo bandymui sukurkite susietą naują užklausą ir planą; automatinio mokamo kartojimo nėra.";
          break;
        case "cancel":
        case "reject":
          if (["integrated", "cancelled"].includes(r.state))
            throw new DomainError(409, "invalid_state");
          await tx.query(
            "UPDATE improvement_jobs SET state='failed',lease=NULL WHERE request_id=$1 AND state IN ('queued','running')",
            [r.id],
          );
          r.job = null;
          r.state = "cancelled";
          this.invalidate(r);
          r.cancellation =
            "Sustabdyta vietinė eiga. Atšaukimas nėra pakeitimų atstatymas.";
          if (r.submissionAttempted || r.external)
            await this.queue(tx, r, "cancel");
          break;
      }
      await this.save(tx, r, b.action, owner);
      return r;
    });
  }
  private async freshEvidence(owner: string, id: string) {
    const r = await this.get(owner, id);
    if (!r.context || !r.plan) throw new DomainError(409, "invalid_state");
    return this.repo.evidence(id, r.context.base, r.plan);
  }
  async tick() {
    // Lost leases are never permission to repeat a model call or submission.
    await this.db.transaction(async (tx) => {
      const stale = (
        await tx.query(
          "SELECT j.*,r.owner_subject FROM improvement_jobs j JOIN improvement_requests r ON r.id=j.request_id WHERE j.state='running' AND j.leased_at<now()-interval '5 minutes' FOR UPDATE OF j SKIP LOCKED",
        )
      ).rows;
      for (const j of stale) {
        const r = await this.get(
          j.owner_subject as string,
          j.request_id as string,
          tx,
          true,
        );
        r.job = null;
        r.state = r.state === "cancelled" ? "cancelled" : "blocked";
        r.uncertain = j.kind === "submit" || r.uncertain;
        if (j.kind === "submit") r.submissionAttempted = true;
        r.error = j.kind === "submit" ? "submission_uncertain" : "interrupted";
        if (j.kind === "cancel")
          r.cancellation =
            "Nutraukimo perdavimas nutrūko. Proceso sustojimas nepatvirtintas; patikrinkite Paperclip.";
        await tx.query(
          "UPDATE improvement_jobs SET state='failed',lease=NULL WHERE id=$1",
          [j.id],
        );
        await this.save(tx, r, "interrupted", "worker");
      }
    });
    const claim = await this.db.transaction(async (tx) => {
      const j = (
        await tx.query(
          "SELECT j.*,r.owner_subject FROM improvement_jobs j JOIN improvement_requests r ON r.id=j.request_id WHERE j.state='queued' ORDER BY j.created_at LIMIT 1 FOR UPDATE OF j SKIP LOCKED",
        )
      ).rows[0];
      if (!j) return null;
      const lease = randomUUID(),
        r = await this.get(
          j.owner_subject as string,
          j.request_id as string,
          tx,
          true,
        );
      await tx.query(
        "UPDATE improvement_jobs SET state='running',lease=$1,leased_at=now(),attempts=attempts+1 WHERE id=$2",
        [lease, j.id],
      );
      return {
        id: j.id as string,
        kind: j.kind as Kind,
        owner: j.owner_subject as string,
        lease,
        request: r,
      };
    });
    if (!claim) return 0;
    const r = claim.request;
    let failed = false;
    try {
      switch (claim.kind) {
        case "discuss":
        case "investigate": {
          const previousState = r.state;
          let context: RepositoryContext | null = r.context;
          if (claim.kind === "investigate") {
            context = await this.repo.context(r.context?.tree ?? []);
            r.context = context;
          }
          let knowledge: Passage[] = [];
          if (this.knowledge && (r.projectId || r.includeGlobal)) {
            knowledge = await this.knowledge.search(
              claim.owner,
              { projectId: r.projectId, includeGlobal: r.includeGlobal },
              r.messages.filter((m) => m.role === "user").at(-1)?.text ??
                r.request,
            );
          }
          r.knowledge = knowledge.map(
            ({ documentId, revision, hash, citation, title }) => ({
              documentId,
              revision,
              hash,
              citation,
              title,
            }),
          );
          const reply = await this.planner.respond(
            r,
            context,
            knowledge,
            claim.kind === "investigate",
          );
          r.messages.push({
            role: "assistant",
            text: redact(reply.reply, 4000),
            at: now(),
          });
          if (claim.kind === "investigate" && reply.plan)
            this.setPlan(r, planSchema.parse(reply.plan));
          else {
            r.state = r.submissionAttempted ? previousState : "discussing";
            r.error = null;
          }
          break;
        }
        case "submit": {
          if (r.submissionAttempted)
            throw new DomainError(409, "submission_uncertain");
          if (
            !r.authorization ||
            !r.plan ||
            !r.context ||
            r.authorization.planHash !== r.planHash ||
            (await this.repo.head(r.context.target)) !== r.context.base
          )
            throw new DomainError(409, "plan_changed");
          const policy = await this.executor.ready();
          if (fingerprint(policy) !== r.authorization.policyHash)
            throw new DomainError(409, "plan_changed");
          // Persist the one-attempt boundary BEFORE the external mutation.
          const current = await this.db.transaction(async (tx) => {
            const job = (
              await tx.query(
                "SELECT id FROM improvement_jobs WHERE id=$1 AND lease=$2 AND state='running' FOR UPDATE",
                [claim.id, claim.lease],
              )
            ).rows[0];
            if (!job) throw new DomainError(409, "invalid_state");
            const c = await this.get(claim.owner, r.id, tx, true);
            if (c.version !== r.version || c.state !== "queued")
              throw new DomainError(409, "improvement_changed");
            c.submissionAttempted = true;
            c.submittedAt = now();
            c.state = "implementing";
            await this.save(tx, c, "submission_claimed", "worker");
            return c;
          });
          Object.assign(r, current);
          r.external = await this.executor.submit(r);
          r.syncedAt = now();
          r.state = "implementing";
          r.uncertain = false;
          r.error = null;
          break;
        }
        case "sync": {
          if (
            r.state === "integration_authorized" &&
            r.integration &&
            r.context &&
            r.plan
          ) {
            const target = await this.repo.head(r.integration.target);
            if (await this.repo.contains(target, r.integration.candidate)) {
              r.state = "integrated";
              r.outcome = `Git patvirtina, kad tikslinėje šakoje yra leistas commit ${r.integration.candidate}. Diegimas nepradėtas.`;
              break;
            }
            const fresh = await this.repo.evidence(
              r.id,
              r.context.base,
              r.plan,
            );
            if (
              fresh.commit !== r.integration.candidate ||
              fresh.targetCommit !== r.integration.targetCommit ||
              fresh.validationHash !== r.integration.validationHash ||
              fresh.diffHash !== r.integration.diffHash
            ) {
              r.candidate = fresh;
              r.review = null;
              r.integration = null;
              r.state = fresh.passed ? "ready_for_review" : "validating";
              r.error = "candidate_changed";
            }
            break;
          }
          r.external = await this.executor.reconcile(r);
          r.syncedAt = now();
          r.uncertain = false;
          r.error = null;
          if (r.state === "changes_requested") break;
          if (r.state === "cancelled") {
            r.cancellation =
              "Paperclip būsena: " +
              (r.external?.status ?? "nežinoma") +
              ". Tai neįrodo, kad procesas sustojo; patikrinkite vykdymą Paperclip.";
            break;
          }
          if (r.external?.status === "cancelled") {
            r.state = "cancelled";
            break;
          }
          if (["blocked"].includes(r.external?.status ?? "")) {
            r.state = "blocked";
            r.error = "external_blocked";
            break;
          }
          r.state = ["done", "in_review"].includes(r.external?.status ?? "")
            ? "validating"
            : "implementing";
          break;
        }
        case "evidence": {
          if (!r.context || !r.plan)
            throw new DomainError(409, "invalid_state");
          const candidate = await this.repo.evidence(
            r.id,
            r.context.base,
            r.plan,
          );
          if (
            r.candidate &&
            fingerprint({
              commit: r.candidate.commit,
              diff: r.candidate.diffHash,
              validation: r.candidate.validationHash,
              target: r.candidate.targetCommit,
            }) !==
              fingerprint({
                commit: candidate.commit,
                diff: candidate.diffHash,
                validation: candidate.validationHash,
                target: candidate.targetCommit,
              })
          ) {
            r.review = null;
            r.integration = null;
          }
          r.candidate = candidate;
          // Only unfinished checks justify further polling. A concluded
          // failure is final for this commit until the owner re-reads it.
          r.state = candidate.passed
            ? "ready_for_review"
            : candidate.checks.some(
                  (c) => !["success", "pending"].includes(c.conclusion),
                )
              ? "failed"
              : "validating";
          r.error = candidate.passed ? null : "validation_failed";
          break;
        }
        case "cancel":
          r.cancellation = await this.executor.cancel(r);
          r.state = "cancelled";
          break;
      }
    } catch (e) {
      failed = true;
      r.error =
        e instanceof DomainError
          ? e.code
          : e instanceof IntegrationError
            ? e.code
            : "unavailable";
      r.state = r.state === "cancelled" ? "cancelled" : "blocked";
      if (claim.kind === "submit" && r.submissionAttempted) {
        r.uncertain = true;
        r.error = "submission_uncertain";
      }
      if (claim.kind === "sync" || claim.kind === "evidence") r.readRetries++;
      if (claim.kind === "cancel")
        r.cancellation =
          "Nutraukimo rezultatas nežinomas. Patikrinkite ir sustabdykite procesą Paperclip; vietinė eiga sustabdyta.";
      if (
        ["plan_changed", "candidate_changed", "scope_boundary"].includes(
          r.error,
        )
      )
        this.invalidate(r);
    }
    await this.db.transaction(async (tx) => {
      const job = (
        await tx.query(
          "SELECT id FROM improvement_jobs WHERE id=$1 AND lease=$2 AND state='running' FOR UPDATE",
          [claim.id, claim.lease],
        )
      ).rows[0];
      if (!job) return; // Cancelled/recovered workers cannot overwrite newer state.
      r.job = null;
      await this.save(
        tx,
        r,
        failed ? "step_blocked" : "step_completed",
        "worker",
      );
      await tx.query(
        "UPDATE improvement_jobs SET state=$1,lease=NULL WHERE id=$2",
        [failed ? "failed" : "done", claim.id],
      );
    });
    return 1;
  }
  // Existing worker polls only already-authorized work. Never starts a repair.
  async reconcileTick() {
    await this.db.transaction(async (tx) => {
      const rows = (
        await tx.query(
          "SELECT * FROM improvement_requests WHERE data->>'state' IN ('implementing','validating') AND data->>'job' IS NULL AND (data->>'readRetries')::int<3 AND updated_at<now()-interval '30 seconds' ORDER BY updated_at LIMIT 2 FOR UPDATE SKIP LOCKED",
        )
      ).rows;
      for (const row of rows) {
        const r = {
          ...(row.data as Improvement),
          version: Number(row.version),
        };
        const submittedAt =
          r.submittedAt ??
          r.history.find((h) => h.event === "submission_claimed")?.at;
        if (
          r.state === "implementing" &&
          submittedAt &&
          r.policy &&
          Date.now() - Date.parse(submittedAt) >
            (r.policy.maxRuntimeSeconds + 60) * 1000
        ) {
          r.state = "cancelled";
          r.error = "timeout";
          r.cancellation =
            "Viršytas vykdymo laikas. Perduodamas nutraukimas; išorinio proceso sustojimas dar nepatvirtintas.";
          await this.queue(tx, r, "cancel");
        } else if (
          r.state === "validating" &&
          Date.now() - Date.parse(r.syncedAt ?? submittedAt ?? r.updatedAt) >
            validationWaitMs
        ) {
          // Checks that never start or finish must not be polled indefinitely.
          r.state = "blocked";
          r.error = "validation_timeout";
        } else
          await this.queue(
            tx,
            r,
            r.state === "validating" ? "evidence" : "sync",
          );
        await this.save(tx, r, "read_reconciliation_queued", "worker");
      }
    });
    return this.tick();
  }
}
