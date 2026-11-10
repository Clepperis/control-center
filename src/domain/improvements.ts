import { z } from "zod";

export const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const sourcePath = z
  .string()
  .min(1)
  .max(220)
  .refine(
    (p) =>
      (!p.includes("..") &&
        !/AUDIT|credentials|secrets/i.test(p) &&
        !p.includes("\\") &&
        !p.includes("//") &&
        /^(?:src|tests|scripts|docs|db)\/[a-zA-Z0-9_./()[\]@-]+\.(?:ts|tsx|css|md|sql)$/.test(
          p,
        )) ||
      ["AGENTS.md", "README.md", "package.json"].includes(p),
    "Neleidžiamas šaltinio kelias",
  );
export const planSchema = z
  .object({
    problem: z.string().trim().min(10).max(1800),
    behavior: z.string().trim().min(10).max(2400),
    scope: z.array(sourcePath).min(1).max(12),
    exclusions: z.array(z.string().min(1).max(400)).min(1).max(12),
    criteria: z.array(z.string().min(5).max(500)).min(1).max(10),
    tests: z
      .array(z.enum(["lint", "typecheck", "test", "build", "ui"]))
      .min(1)
      .max(5),
    implications: z.string().min(1).max(1200),
    uiChange: z.boolean(),
  })
  .strict();
export type ImprovementPlan = z.infer<typeof planSchema>;
export type ImprovementState =
  | "discussing"
  | "investigating"
  | "awaiting_authorization"
  | "queued"
  | "implementing"
  | "validating"
  | "ready_for_review"
  | "changes_requested"
  | "blocked"
  | "failed"
  | "cancelled"
  | "integration_authorized"
  | "integrated";
export const improvementLabels: Record<ImprovementState, string> = {
  discussing: "Aptariama",
  investigating: "Tiriama",
  awaiting_authorization: "Laukia leidimo įgyvendinti",
  queued: "Eilėje",
  implementing: "Įgyvendinama",
  validating: "Tikrinama",
  ready_for_review: "Paruošta peržiūrai",
  changes_requested: "Prašoma pataisymų",
  blocked: "Reikia jūsų dėmesio",
  failed: "Nepavyko",
  cancelled: "Atmesta",
  integration_authorized: "Leista pateikti integravimui",
  integrated: "Integruota",
};
export interface SourceRevision {
  path: string;
  revision: string;
  content: string;
}
export interface RepositoryContext {
  repository: string;
  base: string;
  target: string;
  sources: SourceRevision[];
  tree: string[];
}
export interface ValidationCheck {
  command: string;
  conclusion: string;
  exitCode: number | null;
  url: string;
}
export interface CandidateEvidence {
  base: string;
  commit: string;
  branch: string;
  target: string;
  targetCommit: string;
  files: {
    path: string;
    previousPath?: string;
    additions: number;
    deletions: number;
    patch: string;
  }[];
  diffHash: string;
  checks: ValidationCheck[];
  validationHash: string;
  passed: boolean;
  captures: string[];
  limitations: string[];
  observedAt: string;
}
export interface RuntimePolicy {
  revision: string;
  repository: string;
  projectId: string;
  agentId: string;
  environmentId: string;
  maxRuntimeSeconds: number;
  maxCostUsd: number;
  diskMb: number;
  logBytes: number;
  network: string[];
  dependencyInstall: "disabled" | "ignore-scripts";
  agentConfigHash: string;
  projectConfigHash: string;
  verifiedAt: string;
  expiresAt: string;
}
export interface Improvement {
  id: string;
  version: number;
  title: string;
  request: string;
  state: ImprovementState;
  projectId: string | null;
  includeGlobal: boolean;
  messages: {
    role: "user" | "assistant" | "system";
    text: string;
    at: string;
  }[];
  context: RepositoryContext | null;
  knowledge: {
    documentId: string;
    revision: number;
    hash: string;
    citation: string;
    title: string;
  }[];
  plan: ImprovementPlan | null;
  planRevision: number;
  planHash: string | null;
  authorization: {
    planHash: string;
    base: string;
    policyHash: string;
    owner: string;
    at: string;
  } | null;
  policy: RuntimePolicy | null;
  submissionAttempted: boolean;
  submittedAt?: string | null;
  syncedAt?: string | null;
  uncertain: boolean;
  external: {
    id: string;
    identifier: string;
    url: string;
    status: string;
    workspaceId: string | null;
    branch: string;
  } | null;
  candidate: CandidateEvidence | null;
  review: {
    candidate: string;
    diffHash: string;
    validationHash: string;
    targetCommit: string;
    findings: string;
    criteria: boolean[];
    security: boolean;
    compatibility: boolean;
    scope: boolean;
    validation: boolean;
    reviewer: "owner-self-review";
    at: string;
  } | null;
  integration: {
    candidate: string;
    target: string;
    targetCommit: string;
    diffHash: string;
    validationHash: string;
    owner: string;
    at: string;
    mode: "manual";
  } | null;
  error: string | null;
  cancellation: string | null;
  outcome: string | null;
  job: string | null;
  readRetries: number;
  createdAt: string;
  updatedAt: string;
  history: { event: string; at: string; owner: string }[];
  signal?: { occurrences: number; lastSeen: string };
  relatedRequestId?: string | null;
}
export const reviewSchema = z
  .object({
    candidate: sha,
    diffHash: hash,
    validationHash: hash,
    criteria: z.array(z.boolean()).min(1).max(10),
    findings: z.string().trim().min(5).max(2400),
    security: z.boolean(),
    compatibility: z.boolean(),
    scope: z.boolean(),
    validation: z.boolean(),
  })
  .strict();
export const improvementCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create"),
      key: z.uuid(),
      text: z.string().trim().min(10).max(4000),
      projectId: z.uuid().nullable(),
      includeGlobal: z.boolean(),
      relatedRequestId: z.uuid().nullable().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("signal"),
      key: z.uuid(),
      code: z.enum([
        "model_unavailable",
        "paperclip_unavailable",
        "n8n_unavailable",
        "run_stuck",
        "knowledge_unavailable",
      ]),
      area: z.enum(["chat", "automations", "knowledge", "orchestration"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("message"),
      id: z.uuid(),
      version: z.number().int().positive(),
      text: z.string().trim().min(1).max(4000),
    })
    .strict(),
  z
    .object({
      action: z.literal("investigate"),
      id: z.uuid(),
      version: z.number().int().positive(),
      paths: z.array(sourcePath).max(8),
    })
    .strict(),
  z
    .object({
      action: z.literal("plan"),
      id: z.uuid(),
      version: z.number().int().positive(),
      plan: planSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("authorize"),
      id: z.uuid(),
      version: z.number().int().positive(),
      planHash: hash,
      policyHash: hash,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id: z.uuid(),
      version: z.number().int().positive(),
      review: reviewSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("integrate"),
      id: z.uuid(),
      version: z.number().int().positive(),
      candidate: sha,
      validationHash: hash,
      target: z.string().min(1).max(180),
    })
    .strict(),
  z
    .object({
      action: z.literal("changes"),
      id: z.uuid(),
      version: z.number().int().positive(),
      text: z.string().trim().min(5).max(2400),
    })
    .strict(),
  z
    .object({
      action: z.enum(["sync", "retry", "cancel", "reject"]),
      id: z.uuid(),
      version: z.number().int().positive(),
    })
    .strict(),
]);
export type ImprovementCommand = z.infer<typeof improvementCommand>;
export const improvementErrors: Record<string, string> = {
  improvement_changed: "Įrašas pasikeitė. Atnaujinkite peržiūrą.",
  executor_setup:
    "Vykdytojas neparuoštas. Patikrinkite atskirą Paperclip prieigą, pasirengusį agentą ir izoliuotos aplinkos patikrą.",
  candidate_changed:
    "Kandidatas, patikros arba tikslinė šaka pasikeitė. Reikia naujos peržiūros.",
  validation_failed: "Patikros neužbaigtos arba nepavyko. Integruoti negalima.",
  validation_timeout:
    "Patikros per valandą nepasibaigė, todėl automatinis tikrinimas sustabdytas. Patikrinkite CI vykdymą ir kartokite skaitymą.",
  scope_boundary:
    "Pakeitimas viršija leistiną apimtį arba liečia apsaugotus failus.",
  repository_boundary:
    "Leidžiama tik aiškiai sukonfigūruota saugykla ir jos peržiūrėta bazinė versija.",
  submission_uncertain:
    "Nežinoma, ar užduotis sukurta. Pirmiausia sutikrinkite; pakartotinis siuntimas užblokuotas.",
  retry_limit:
    "Pasiektas trijų skaitymo bandymų limitas. Išspręskite priežastį ir pradėkite naują užklausą.",
};
