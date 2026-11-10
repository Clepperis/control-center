import { randomUUID } from "node:crypto";
import type {
  Improvement,
  ImprovementPlan,
  RuntimePolicy,
  CandidateEvidence,
  RepositoryContext,
} from "../src/domain/improvements";
import type { CodingExecutor } from "../src/server/improvements/executor";
import type { ImprovementRepository } from "../src/server/improvements/repository";
import type { PlatformPlanner } from "../src/server/improvements/planner";
import { fingerprint, managedBranch } from "../src/server/improvements/safety";
export const base = "a".repeat(40),
  candidate = "b".repeat(40),
  other = "c".repeat(40);
export const plan: ImprovementPlan = {
  problem: "Tuščio žinių sąrašo paskirtis neaiški.",
  behavior: "Patikslinti tuščią būseną išsaugant esamą elgesį.",
  scope: ["src/components/knowledge.tsx"],
  exclusions: ["No dependencies, policy, deployment or migration changes."],
  criteria: [
    "Tuščia būsena paaiškina kitą veiksmą.",
    "Esami žinių veiksmai veikia.",
  ],
  tests: ["lint", "typecheck", "test", "build", "ui"],
  implications: "Priklausomybių ir migracijų nereikia.",
  uiChange: true,
};
export function syntheticPolicy(): RuntimePolicy {
  return {
    revision: "synthetic-not-runtime-proof",
    repository: "Clepperis/control-center",
    projectId: randomUUID(),
    agentId: randomUUID(),
    environmentId: randomUUID(),
    maxRuntimeSeconds: 120,
    maxCostUsd: 1,
    diskMb: 512,
    logBytes: 12000,
    network: ["api.openai.com", "github.com"],
    dependencyInstall: "disabled",
    verifiedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    agentConfigHash: "a".repeat(64),
    projectConfigHash: "b".repeat(64),
  };
}
export function syntheticContext(): RepositoryContext {
  return {
    repository: "Clepperis/control-center",
    target: "codex/phase-5-platform-engineer",
    base,
    sources: [
      {
        path: "src/components/knowledge.tsx",
        revision: "d".repeat(40),
        content: "// Synthetic selected implementation",
      },
    ],
    tree: ["src/components/knowledge.tsx"],
  };
}
export function syntheticEvidence(id: string): CandidateEvidence {
  const files = [
      {
        path: "src/components/knowledge.tsx",
        additions: 1,
        deletions: 1,
        patch: "-Empty\n+Add your first document",
      },
    ],
    checks = [
      {
        command: "synthetic-process-substitute",
        conclusion: "success",
        exitCode: 0,
        url: "https://github.com/Clepperis/control-center/actions/runs/1",
      },
    ];
  return {
    base,
    commit: candidate,
    branch: managedBranch(id),
    target: "codex/phase-5-platform-engineer",
    targetCommit: base,
    files,
    diffHash: fingerprint(files),
    checks,
    validationHash: fingerprint(checks),
    passed: true,
    captures: [],
    limitations: ["Deterministic substitute; no live coding runtime was used."],
    observedAt: new Date().toISOString(),
  };
}
export function improvementFixture() {
  const policy = syntheticPolicy();
  const state = {
    creates: 0,
    cancels: 0,
    reconciles: 0,
    modelCalls: 0,
    head: base,
    evidence: null as CandidateEvidence | null,
    external: null as Improvement["external"],
    uncertain: false,
    ready: true,
    failReads: false,
    integrated: false,
  };
  const repo: ImprovementRepository = {
    repository: policy.repository,
    target: "codex/phase-5-platform-engineer",
    async head() {
      return state.head;
    },
    async context() {
      return syntheticContext();
    },
    async evidence(id) {
      if (state.failReads)
        throw new Error("private secret must never be stored");
      return state.evidence ?? syntheticEvidence(id);
    },
    async contains() {
      return state.integrated;
    },
  };
  const planner: PlatformPlanner = {
    async respond(_r, _c, _k, investigate) {
      state.modelCalls++;
      return {
        reply: "Sintetinis tyrimas; tai nėra gyvas modelis ar kodavimas.",
        plan: investigate ? structuredClone(plan) : null,
      };
    },
  };
  const executor: CodingExecutor = {
    async ready() {
      if (!state.ready) throw new Error("not configured");
      return policy;
    },
    async submit(r) {
      state.creates++;
      state.external = {
        id: randomUUID(),
        identifier: "SYN-5",
        url: "https://paperclip.example/SYN/issues/SYN-5",
        status: "todo",
        workspaceId: randomUUID(),
        branch: managedBranch(r.id),
      };
      if (state.uncertain) throw new Error("uncertain synthetic submission");
      return state.external;
    },
    async reconcile() {
      state.reconciles++;
      if (state.failReads) throw new Error("offline");
      return state.external;
    },
    async cancel() {
      state.cancels++;
      return "Synthetic cancellation requested; process stop unverified. Cancellation is not rollback.";
    },
  };
  return { state, policy, repo, planner, executor };
}
