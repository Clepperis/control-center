import { afterEach, expect, it, vi } from "vitest";
import {
  configuredImprovements,
  improvementSetup,
} from "../src/server/improvements/configured";
import type { Database } from "../src/server/db/types";

afterEach(() => vi.unstubAllEnvs());
// Construction never queries; the service is only inspected here.
const db = {} as Database;
it("shows the owner the same repository boundary the service actually uses", () => {
  vi.stubEnv("IMPROVEMENT_TARGET_BRANCH", undefined);
  vi.stubEnv("IMPROVEMENT_REPOSITORY", undefined);
  expect(configuredImprovements(db).repo.target).toBe("main");
  expect(improvementSetup().target).toBe("main");
  vi.stubEnv("IMPROVEMENT_TARGET_BRANCH", "release/candidate");
  vi.stubEnv("IMPROVEMENT_REPOSITORY", "example/fork");
  const { repo } = configuredImprovements(db);
  expect(improvementSetup()).toMatchObject({
    repository: repo.repository,
    target: repo.target,
  });
  expect(repo.target).toBe("release/candidate");
});
