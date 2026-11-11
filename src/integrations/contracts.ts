import type { Agent } from "@/domain/models";
import type { ExternalApproval } from "@/domain/orchestration";
import type { AutomationContract, CatalogWorkflow } from "@/domain/automations";
// Domain-facing contracts, not speculative external API payloads.
export interface PaperclipAdapter {
  listAgents(signal?: AbortSignal): Promise<Agent[]>;
  createTask(
    task: { title: string; description: string; agentId?: string },
    signal?: AbortSignal,
  ): Promise<{ id: string }>;
  readTask(id: string, signal?: AbortSignal): Promise<ExternalTask>;
}
export interface ExternalTask {
  id: string;
  companyId: string;
  identifier: string;
  status: string;
  title: string;
  description: string | null;
  comments: string[];
  /** null: approvals could not be read; undefined: not requested. */
  approvals?: ExternalApproval[] | null;
  assigneeAgentId: string | null;
}
export interface AutomationAdapter {
  listWorkflows(): Promise<{
    workflows: CatalogWorkflow[];
    truncated: boolean;
  }>;
  verifyContract(contract: AutomationContract): Promise<void>;
  execute(
    contract: AutomationContract,
    requestId: string,
    text: string,
  ): Promise<{ id: string | null; rejected: boolean }>;
  readExecution(
    workflowId: string,
    id: string,
    data?: boolean,
  ): Promise<AutomationExecution>;
  findExecutions(
    workflowId: string,
    startedAfter: string,
  ): Promise<{ ids: string[]; complete: boolean }>;
  workflowUrl(id: string): string;
  executionUrl(workflowId: string, id: string): string;
}
export interface AutomationExecution {
  id: string;
  workflowId: string;
  status: string;
  mode: string;
  startedAt: string | null;
  stoppedAt: string | null;
  waitTill: string | null;
  correlation: { requestId: string; text: string } | null;
  result: { requestId: string; transformedText: string } | null;
}
export interface ModelGateway {
  complete(
    messages: { role: "user" | "assistant"; content: string }[],
    agents: Agent[],
    signal?: AbortSignal,
    automations?: AutomationContract[],
  ): Promise<unknown>;
}
