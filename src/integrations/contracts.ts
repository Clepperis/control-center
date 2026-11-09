import type { Agent, ConnectionState } from "@/domain/models";
// Domain-facing contracts, not speculative external API payloads.
export interface PaperclipAdapter {
  listAgents(signal?: AbortSignal): Promise<Agent[]>;
  createTask(
    task: { title: string; description: string; agentId: string },
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
  assigneeAgentId: string | null;
}
export interface AutomationAdapter {
  connection(): Promise<ConnectionState>;
  // Workflow execution and schedules remain owned by n8n.
}
export interface ModelGateway {
  complete(
    messages: { role: "user" | "assistant"; content: string }[],
    agents: Agent[],
    signal?: AbortSignal,
  ): Promise<unknown>;
}
