import { randomUUID } from "node:crypto";
import type { Sql } from "../db/types";
import type { ToolCallRecord, ToolCallSink } from "./server";

export class DatabaseToolCallSink implements ToolCallSink {
  constructor(private db: Sql) {}
  async record(entry: ToolCallRecord): Promise<void> {
    await this.db.query(
      "INSERT INTO tool_calls(id,tool,outcome,error_code,duration_ms,approval_ref) VALUES($1,$2,$3,$4,$5,$6)",
      [
        randomUUID(),
        entry.tool,
        entry.outcome,
        entry.errorCode ?? null,
        entry.durationMs,
        entry.approvalRef ?? null,
      ],
    );
  }
}
