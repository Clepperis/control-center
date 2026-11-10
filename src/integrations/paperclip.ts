import { z } from "zod";
import type { Agent } from "@/domain/models";
import type { PaperclipAdapter, ExternalTask } from "./contracts";
import type { PaperclipConfig } from "@/server/config";
import { IntegrationError, requestJson, type Fetcher } from "./errors";
const taskSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  identifier: z.string(),
  status: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  assigneeAgentId: z.uuid().nullable(),
});
const agentSchema = z.object({
  id: z.uuid(),
  companyId: z.uuid(),
  name: z.string(),
  role: z.string(),
  status: z.string(),
  lifecycleState: z.string().optional(),
});
export interface DelegationAdapter extends PaperclipAdapter {
  findByMarker(marker: string, signal?: AbortSignal): Promise<ExternalTask[]>;
  taskUrl(taskId: string): string;
}
export class PaperclipClient implements DelegationAdapter {
  constructor(
    private config: PaperclipConfig,
    private fetcher: Fetcher = fetch,
  ) {}
  private async request(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
  ) {
    if (!this.config.contractVerified)
      throw new IntegrationError("configuration");
    return requestJson(
      this.fetcher,
      `${this.config.baseUrl}/api${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      { timeoutMs: 15000, signal, mutation: method !== "GET" },
    );
  }
  private parseTask(value: unknown): ExternalTask {
    const parsed = taskSchema.safeParse(value);
    if (!parsed.success || parsed.data.companyId !== this.config.companyId)
      throw new IntegrationError("malformed");
    return { ...parsed.data, comments: [] };
  }
  async check(signal?: AbortSignal) {
    const raw = await this.request("/cli-auth/me", "GET", undefined, signal);
    const result = z.object({ companyIds: z.array(z.string()) }).safeParse(raw);
    if (
      !result.success ||
      !result.data.companyIds.includes(this.config.companyId)
    )
      throw new IntegrationError("authentication");
  }
  async listAgents(signal?: AbortSignal): Promise<Agent[]> {
    await this.check(signal);
    const parsed = z
      .array(agentSchema)
      .safeParse(
        await this.request(
          `/companies/${this.config.companyId}/agents`,
          "GET",
          undefined,
          signal,
        ),
      );
    if (
      !parsed.success ||
      parsed.data.some((a) => a.companyId !== this.config.companyId)
    )
      throw new IntegrationError("malformed");
    return parsed.data.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      status: a.status,
      eligible:
        this.config.agentIds.includes(a.id) &&
        ["active", "idle"].includes(a.status) &&
        a.lifecycleState === "ready",
    }));
  }
  async createTask(
    task: { title: string; description: string; agentId: string },
    signal?: AbortSignal,
  ) {
    if (!this.config.enabled) throw new IntegrationError("disabled");
    if (!this.config.agentIds.includes(task.agentId))
      throw new IntegrationError("agent_unavailable");
    const raw = await this.request(
      `/companies/${this.config.companyId}/issues`,
      "POST",
      {
        title: task.title,
        description: task.description,
        status: "todo",
        assigneeAgentId: task.agentId,
      },
      signal,
    );
    try {
      return { id: this.parseTask(raw).id };
    } catch {
      throw new IntegrationError("malformed", true);
    }
  }
  async readTask(id: string, signal?: AbortSignal): Promise<ExternalTask> {
    z.uuid().parse(id);
    const task = this.parseTask(
      await this.request(`/issues/${id}`, "GET", undefined, signal),
    );
    const raw = await this.request(
      `/issues/${id}/comments?order=desc&limit=20`,
      "GET",
      undefined,
      signal,
    );
    const comments = z
      .array(z.object({ body: z.string().max(100000) }))
      .safeParse(raw);
    if (!comments.success) throw new IntegrationError("malformed");
    return { ...task, comments: comments.data.map((c) => c.body) };
  }
  async findByMarker(
    marker: string,
    signal?: AbortSignal,
  ): Promise<ExternalTask[]> {
    const raw = await this.request(
      `/companies/${this.config.companyId}/issues?q=${encodeURIComponent(marker)}&limit=50`,
      "GET",
      undefined,
      signal,
    );
    const parsed = z.array(taskSchema).safeParse(raw);
    if (!parsed.success) throw new IntegrationError("malformed");
    return parsed.data
      .filter(
        (t) =>
          t.companyId === this.config.companyId &&
          t.description?.includes(marker),
      )
      .map((t) => ({ ...t, comments: [] }));
  }
  taskUrl(identifier: string) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/.exec(identifier);
    return match
      ? `${this.config.baseUrl}/${encodeURIComponent(match[1])}/issues/${encodeURIComponent(identifier)}`
      : "";
  }
}
