import { createHash } from "node:crypto";
import { canonicalJson } from "../canonical-json";
import { DomainError } from "../orchestration/store";
import { sourcePath, type ImprovementPlan } from "@/domain/improvements";

export const fingerprint = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex");
// Runtime observations must not invalidate an otherwise unchanged operator
// configuration on every heartbeat. Unknown configuration fields remain bound.
export function configurationFingerprint(value: unknown) {
  const transient = new Set([
    "createdAt",
    "updatedAt",
    "lastHeartbeatAt",
    "lastRunAt",
    "lastActiveAt",
    "lastSeenAt",
    "lastErrorAt",
    "lastSuccessAt",
    "runtimeState",
    "status",
    "lifecycleState",
  ]);
  return fingerprint(
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(([k]) => !transient.has(k)),
        )
      : value,
  );
}
export function redact(text: string, max = 12000) {
  return text
    .replace(
      /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g,
      "[REDACTED KEY]",
    )
    .replace(/\b(?:Bearer\s+)[a-z\d._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(?:sk-[a-z\d_-]{8,}|pcp_board_[a-z\d_-]+|github_pat_[a-z\d_]+|gh[pousr]_[a-z\d_]+)\b/gi,
      "[REDACTED]",
    )
    .replace(
      /((?:api[_ -]?key|password|slaptažodis|token|secret)\s*["']?\s*[:=]\s*)["']?[^\s,"'}]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b(?:postgres(?:ql)?|https?):\/\/[^\s/@]+:[^\s/@]+@[^\s]+/gi,
      "[REDACTED URL]",
    )
    .replace(
      /(?:[A-Z]:\\Users\\[^\s]+|\/(?:home|Users)\/[^\s]+)/g,
      "[PRIVATE PATH]",
    )
    .slice(0, max);
}
export function allowedChange(path: string) {
  const protectedFiles = [
    "src/domain/improvements.ts",
    "src/domain/orchestration.ts",
    "src/domain/automations.ts",
    "src/server/canonical-json.ts",
    "src/server/orchestration/service.ts",
    "src/server/orchestration/store.ts",
    "src/server/automations/service.ts",
    "scripts/worker.ts",
    "scripts/verify-platform.ts",
    "src/components/improvements.tsx",
  ];
  return (
    sourcePath.safeParse(path).success &&
    !/(?:^|\/)(?:AGENTS\.md|[^/]*SKILL\.md|auth|improvements|config\.ts|runtime\.ts|http\.ts)(?:\/|$)/i.test(
      path,
    ) &&
    !path.startsWith("db/") &&
    path !== "package.json" &&
    !protectedFiles.includes(path) &&
    !/AUDIT|credentials|secrets|policy/i.test(path)
  );
}
export function assertScope(plan: ImprovementPlan) {
  if (plan.scope.some((p) => !allowedChange(p)))
    throw new DomainError(403, "scope_boundary");
  // These are mandatory trusted checks; model/owner edits cannot remove them.
  for (const check of ["lint", "typecheck", "test", "build"] as const)
    if (!plan.tests.includes(check))
      throw new DomainError(400, "validation_failed");
  if (plan.uiChange && !plan.tests.includes("ui"))
    throw new DomainError(400, "validation_failed");
  if (
    plan.scope.some(
      (p) =>
        p.startsWith("src/components/") ||
        (p.startsWith("src/app/") && !p.startsWith("src/app/api/")),
    ) &&
    !plan.uiChange
  )
    throw new DomainError(400, "validation_failed");
}
export function managedBranch(id: string) {
  return `codex/improve-${id}`;
}
export function safeBranch(value: string) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,179}$/.test(value) ||
    value.includes("..") ||
    value.includes("//") ||
    value.endsWith("/") ||
    value.endsWith(".lock")
  )
    throw new DomainError(400, "repository_boundary");
  return value;
}
