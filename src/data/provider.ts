import "server-only";
import { demoDashboard } from "./demo";
import type { Dashboard } from "@/domain/models";

export interface DashboardRepository { getDashboard(): Promise<Dashboard> }
export const demoRepository: DashboardRepository = {
  async getDashboard() { return structuredClone(demoDashboard); },
};
export async function getDashboard(): Promise<Dashboard> {
  if (process.env.DATA_MODE === "demo") return demoRepository.getDashboard();
  return { mode: "live", projects: [], tasks: [], decisions: [], activity: [], agents: [],
    connections: demoDashboard.connections.map(c => ({ ...c, state: { kind: "disconnected", detail: "Programos ryšys dar nepatikrintas." } })) };
}
