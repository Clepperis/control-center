import type {
  AutomationRun,
  AutomationContract,
  AutomationInput,
} from "@/domain/automations";
const iso = (v: unknown) =>
  v ? new Date(v as string | Date).toISOString() : null;
export function toAutomationRun(r: Record<string, unknown>): AutomationRun {
  return {
    id: r.id as string,
    conversationId: r.conversation_id as string | null,
    state: r.state as AutomationRun["state"],
    contract: r.contract as AutomationContract,
    input: r.input as AutomationInput,
    actionHash: r.action_hash as string,
    confirmedAt: iso(r.confirmed_at),
    externalId: r.external_id as string | null,
    externalStatus: r.external_status as string | null,
    syncedAt: iso(r.synced_at),
    startedAt: iso(r.started_at),
    stoppedAt: iso(r.stopped_at),
    waitTill: iso(r.wait_till),
    errorCode: r.error_code as string | null,
    result: r.result as AutomationRun["result"],
    resultIssue: r.result_issue as string | null,
    tracking: r.tracking as boolean,
    createdAt: iso(r.created_at)!,
    expiresAt: iso(r.expires_at)!,
  };
}
