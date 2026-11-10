import type { Database } from "../db/types";
import { gatewayConfig, paperclipConfig } from "../config";
import { GithubRepository } from "./repository";
import {
  NexosPlatformPlanner,
  unavailablePlanner,
  type PlatformPlanner,
} from "./planner";
import {
  PaperclipCodingExecutor,
  unavailableExecutor,
  type CodingExecutor,
} from "./executor";
import { ImprovementService } from "./service";
import type { KnowledgeService } from "../knowledge/service";

export function configuredImprovements(
  db: Database,
  knowledge: KnowledgeService | null = null,
) {
  const repo = new GithubRepository(
    process.env.IMPROVEMENT_REPOSITORY ?? "Clepperis/control-center",
    process.env.IMPROVEMENT_TARGET_BRANCH ?? "codex/phase-5-platform-engineer",
    process.env.IMPROVEMENT_GITHUB_READ_TOKEN ?? "",
  );
  let planner: PlatformPlanner = unavailablePlanner,
    executor: CodingExecutor = unavailableExecutor;
  try {
    planner = new NexosPlatformPlanner(gatewayConfig(process.env));
  } catch {}
  try {
    executor = new PaperclipCodingExecutor(
      paperclipConfig(process.env),
      repo.repository,
      process.env.IMPROVEMENT_POLICY_FILE ?? "",
      process.env.IMPROVEMENT_EXECUTOR_ENABLED === "true",
    );
  } catch {}
  return new ImprovementService(db, repo, planner, executor, knowledge);
}
export function improvementSetup() {
  return {
    repository:
      process.env.IMPROVEMENT_REPOSITORY ?? "Clepperis/control-center",
    target:
      process.env.IMPROVEMENT_TARGET_BRANCH ??
      "codex/phase-5-platform-engineer",
    executorEnabled: process.env.IMPROVEMENT_EXECUTOR_ENABLED === "true",
    blockers: [
      ...(process.env.IMPROVEMENT_EXECUTOR_ENABLED !== "true"
        ? [
            "Kodavimo vykdytojas išjungtas (IMPROVEMENT_EXECUTOR_ENABLED=false).",
          ]
        : []),
      ...(!process.env.IMPROVEMENT_POLICY_FILE
        ? [
            "Trūksta už saugyklos ribų laikomo izoliuotos aplinkos ir privalomų limitų patikros įrašo.",
          ]
        : []),
      ...(process.env.PAPERCLIP_CONTRACT_VERIFIED !== "true"
        ? [
            "Paperclip programos sutartis ir autentifikuotas kodavimo kelias dar nepatikrinti.",
          ]
        : []),
      ...(process.env.LIVE_MODEL_ENABLED !== "true"
        ? [
            "Modelio atsakymai išjungti. Užklausas galima išsaugoti; po tyrimo planą galite parengti patys.",
          ]
        : []),
    ],
  };
}
