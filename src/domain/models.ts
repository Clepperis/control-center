export type ConnectionState =
  | { kind: "demo"; detail: string }
  | { kind: "disconnected"; detail: string }
  | { kind: "unavailable"; detail: string }
  | { kind: "verified"; detail: string; checkedAt: string };
export interface Connection { id: string; name: string; purpose: string; state: ConnectionState }
export interface Project { id: string; name: string; description: string; stage: string; code: string }
export interface Task { id: string; title: string; projectId: string; state: "planned" | "review" | "waiting" }
export interface Decision { id: string; title: string; detail: string; project: string }
export interface Activity { id: string; title: string; detail: string; time: string }
export interface Agent { id: string; name: string; role: string; status: string; eligible: boolean }
export interface Dashboard {
  mode: "demo" | "live";
  projects: Project[]; tasks: Task[]; decisions: Decision[]; activity: Activity[];
  connections: Connection[]; agents: Agent[];
}
