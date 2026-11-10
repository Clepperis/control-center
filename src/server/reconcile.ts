export interface Reconciler {
  name: string;
  run(): Promise<unknown>;
}
// Each reconciler owns independent records. One failing dependency, such as an
// unavailable knowledge volume, must not withhold another's recovery or an
// owner's cancellation. Only the step name is reported, never error contents.
export async function runReconcilers(
  steps: Reconciler[],
  report: (line: string) => void = console.error,
) {
  const failed: string[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch {
      failed.push(step.name);
      report(
        JSON.stringify({
          event: "reconciliation_failed",
          step: step.name,
          code: "storage_or_configuration",
        }),
      );
    }
  }
  return failed;
}
