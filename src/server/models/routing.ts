// Deterministic model selection. The model never chooses its own model.
export type ModelTier = "fast" | "standard" | "strong";
export type ModelTask = "chat" | "knowledge" | "improvement";
export type ModelRoutes = Partial<Record<ModelTier, string>>;

export interface ModelChoice {
  task: ModelTask;
  tier: ModelTier;
  requestedTier: ModelTier;
  model: string;
  fallback: boolean;
  /** True when the owner picked the tier for this turn. */
  override: boolean;
}

export const MODEL_TIERS: readonly ModelTier[] = ["fast", "standard", "strong"];

export const TASK_TIER: Readonly<Record<ModelTask, ModelTier>> = {
  chat: "fast",
  knowledge: "standard",
  improvement: "strong",
};

/** Cheapest first. Fallback may only move left from the requested tier. */
const TIER_ORDER = MODEL_TIERS;

export function chooseModel(
  defaultModel: string,
  routes: ModelRoutes,
  task: ModelTask,
  available: (model: string) => boolean,
  ownerTier?: ModelTier | null,
): ModelChoice | null {
  const override = !!ownerTier;
  const requestedTier = ownerTier ?? TASK_TIER[task];
  const rejected = new Set<string>();
  for (let i = TIER_ORDER.indexOf(requestedTier); i >= 0; i--) {
    const tier = TIER_ORDER[i];
    const model = routes[tier] ?? defaultModel;
    if (rejected.has(model)) continue;
    if (available(model))
      return {
        task,
        tier,
        requestedTier,
        model,
        fallback: tier !== requestedTier,
        override,
      };
    rejected.add(model);
  }
  return null;
}
