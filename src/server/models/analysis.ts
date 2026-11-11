import type { ModelTier } from "./routing";

export type TaskReason =
  "planning" | "code" | "long" | "knowledge" | "short" | "default";

export interface TaskAnalysis {
  tier: ModelTier;
  reason: TaskReason;
}

// Free, deterministic signals. No model call is spent on classification.
const PLANNING =
  /(planuok|architekt|strategij|palygink|i[šs]tirk|i[šs]analizuok|i[šs]nagrin[ėe]k|rekomenduok|\bdesign\b|architecture|strategy|compare|investigate|analy[sz]e|trade-?offs?)/iu;
const CODE =
  /(```|\b\w*(Error|Exception)\b:|\b[\w./-]+\.(tsx?|jsx?|py|sql|json|ya?ml|css)\b|=>|\bfunction\s+\w|\b(const|let)\s+\w+\s*[:=]|\bimport\s.+\sfrom\s)/u;
const LONG_CHARS = 1500;
const SHORT_CHARS = 40;

/** Picks the cheapest tier likely to answer the latest user message well. */
export function analyzeTask(text: string, grounded: boolean): TaskAnalysis {
  const message = text.trim();
  if (PLANNING.test(message)) return { tier: "strong", reason: "planning" };
  if (CODE.test(message)) return { tier: "standard", reason: "code" };
  if (message.length > LONG_CHARS) return { tier: "standard", reason: "long" };
  if (grounded) return { tier: "standard", reason: "knowledge" };
  if (message.length <= SHORT_CHARS) return { tier: "fast", reason: "short" };
  return { tier: "fast", reason: "default" };
}
