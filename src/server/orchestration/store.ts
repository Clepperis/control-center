import { createHash, randomUUID } from "node:crypto";
import type { Database, Sql } from "../db/types";
import { toAutomationRun } from "../automations/records";
import type {
  Conversation,
  Message,
  Plan,
  Run,
  RunState,
  Turn,
  Usage,
} from "@/domain/orchestration";
export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
export function marker(id: string) {
  return `[CC:${id}]`;
}
type Row = Record<string, unknown>;
const iso = (value: unknown) =>
  value ? new Date(value as string | Date).toISOString() : null;
export function toRun(r: Row): Run {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string,
    state: r.state as RunState,
    plan: r.plan as Plan,
    planHash: r.plan_hash as string,
    confirmedAt: iso(r.confirmed_at),
    externalTaskId: r.external_task_id as string | null,
    externalStatus: r.external_status as string | null,
    syncedAt: iso(r.synced_at),
    errorCode: r.error_code as string | null,
    tracking: r.tracking as boolean,
    result: r.result as Run["result"],
    createdAt: iso(r.created_at)!,
  };
}
export class Store {
  constructor(public db: Database) {}
  async listConversations(owner: string): Promise<Conversation[]> {
    return (
      await this.db.query(
        "SELECT id,title,created_at FROM conversations WHERE owner_subject=$1 ORDER BY created_at DESC LIMIT 100",
        [owner],
      )
    ).rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      createdAt: iso(r.created_at)!,
    }));
  }
  async ownedConversation(owner: string, id: string, tx: Sql = this.db) {
    const row = (
      await tx.query(
        "SELECT * FROM conversations WHERE id=$1 AND owner_subject=$2",
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new DomainError(404, "not_found");
    return row;
  }
  async ownedRun(owner: string, id: string) {
    const row = (
      await this.db.query(
        "SELECT r.* FROM orchestration_runs r JOIN conversations c ON c.id=r.conversation_id WHERE r.id=$1 AND c.owner_subject=$2",
        [id, owner],
      )
    ).rows[0];
    if (!row) throw new DomainError(404, "not_found");
    return toRun(row);
  }
  async snapshot(owner: string, conversationId: string) {
    const c = await this.ownedConversation(owner, conversationId);
    const messages = (
      await this.db.query(
        "SELECT * FROM messages WHERE conversation_id=$1 ORDER BY created_at,id",
        [conversationId],
      )
    ).rows.map((r) => ({
      id: r.id as string,
      role: r.role as Message["role"],
      content: r.content as string,
      usage: r.usage as Usage | null,
      createdAt: iso(r.created_at)!,
    }));
    const runs = (
      await this.db.query(
        "SELECT * FROM orchestration_runs WHERE conversation_id=$1 ORDER BY created_at",
        [conversationId],
      )
    ).rows.map(toRun);
    const turns = (
      await this.db.query(
        "SELECT * FROM turns WHERE conversation_id=$1 ORDER BY created_at",
        [conversationId],
      )
    ).rows.map((r) => ({
      id: r.id as string,
      conversationId,
      status: r.status as Turn["status"],
      errorCode: r.error_code as string | null,
    }));
    return {
      conversation: {
        id: conversationId,
        title: c.title as string,
        createdAt: iso(c.created_at)!,
      },
      messages,
      runs,
      automationRuns: (
        await this.db.query(
          "SELECT * FROM automation_requests WHERE conversation_id=$1 AND owner_subject=$2 ORDER BY created_at",
          [conversationId, owner],
        )
      ).rows.map(toAutomationRun),
      turns,
    };
  }
  async beginTurn(
    owner: string,
    conversationId: string,
    requestId: string,
    text: string,
  ) {
    const inputHash = digest(`${conversationId}\n${text}`);
    return this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO conversations(id,owner_subject,title) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
        [conversationId, owner, text.slice(0, 100)],
      );
      await this.ownedConversation(owner, conversationId, tx);
      await tx.query("SELECT id FROM conversations WHERE id=$1 FOR UPDATE", [
        conversationId,
      ]);
      const existing = (
        await tx.query("SELECT * FROM turns WHERE request_id=$1", [requestId])
      ).rows[0];
      if (existing) {
        if (existing.input_hash !== inputHash)
          throw new DomainError(409, "request_conflict");
        return { created: false, id: existing.id as string };
      }
      if (
        (
          await tx.query(
            "SELECT id FROM turns WHERE conversation_id=$1 AND status='pending'",
            [conversationId],
          )
        ).rows.length
      )
        throw new DomainError(409, "turn_pending");
      const id = randomUUID();
      const inserted = await tx.query(
        "INSERT INTO turns(id,conversation_id,request_id,input_hash,status) VALUES($1,$2,$3,$4,'pending') ON CONFLICT(request_id) DO NOTHING RETURNING id",
        [id, conversationId, requestId, inputHash],
      );
      if (!inserted.rows.length) throw new DomainError(409, "request_conflict");
      await tx.query(
        "INSERT INTO messages(id,conversation_id,turn_id,role,content) VALUES($1,$2,$3,'user',$4)",
        [randomUUID(), conversationId, id, text],
      );
      return { created: true, id };
    });
  }
  async recordCheck(service: string, errorCode: string | null) {
    await this.db.query(
      "INSERT INTO connection_checks(service,checked_at,error_code) VALUES($1,CASE WHEN $2::text IS NULL THEN now() ELSE NULL END,$2) ON CONFLICT(service) DO UPDATE SET checked_at=CASE WHEN EXCLUDED.error_code IS NULL THEN now() ELSE connection_checks.checked_at END,error_code=EXCLUDED.error_code",
      [service, errorCode],
    );
  }
}
