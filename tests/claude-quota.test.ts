import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readClaudeQuota } from "../src/server/observability/local-usage";
import { CombinedUsage } from "../src/components/combined-usage";
import { usageReport } from "../src/server/observability/usage-snapshot";
import { USAGE_MAX_AGE_MS, type UsageSnapshot } from "../src/domain/usage";

const mockHome = vi.hoisted(() => vi.fn());
vi.mock("node:os", async (original) => ({
  ...(await original<typeof import("node:os")>()),
  homedir: mockHome,
}));

const observedAt = "2026-11-11T10:00:00.000Z";
const now = Date.parse(observedAt);
const observation = () => ({
  source: "claude-code-statusline",
  observedAt,
  model: "claude-synthetic",
  fiveHour: { usedPercent: 42.5, resetsAt: "2026-11-11T15:00:00.000Z" },
  sevenDay: { usedPercent: 7, resetsAt: "2026-11-18T10:00:00.000Z" },
});
let root: string, path: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-synthetic-claude-quota-"));
  path = join(root, "quota.json");
  vi.stubEnv("USAGE_CLAUDE_QUOTA_FILE", path);
  mockHome.mockReturnValue(root);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  mockHome.mockReset();
  await rm(root, { recursive: true, force: true });
});
const save = (value: unknown) => writeFile(path, JSON.stringify(value));

describe("Claude status-line quota observation", () => {
  it("reads the configured file without rescaling percentages or exporting source/model metadata", async () => {
    await save(observation());
    const result = await readClaudeQuota(undefined, now);
    expect(result.status).toBe("available");
    expect(result.quotas).toEqual([
      {
        service: "claude",
        label: "fiveHour",
        usedPercent: 42.5,
        observedAt,
        resetsAt: "2026-11-11T15:00:00.000Z",
      },
      {
        service: "claude",
        label: "sevenDay",
        usedPercent: 7,
        observedAt,
        resetsAt: "2026-11-18T10:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("claude-code-statusline");
    expect(JSON.stringify(result)).not.toContain(root);
  });
  it("defaults to ~/.claude/usage/claude-quota.json and honors an explicit path over the environment", async () => {
    vi.stubEnv("USAGE_CLAUDE_QUOTA_FILE", "");
    const directory = join(root, ".claude", "usage");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "claude-quota.json"),
      JSON.stringify(observation()),
    );
    expect((await readClaudeQuota(undefined, now)).status).toBe("available");
    await save({ ...observation(), fiveHour: null });
    vi.stubEnv("USAGE_CLAUDE_QUOTA_FILE", join(root, "missing.json"));
    expect((await readClaudeQuota(path, now)).quotas).toHaveLength(1);
  });
  it("marks missing files, invalid JSON, oversized data, directories and relative paths unavailable", async () => {
    expect(await readClaudeQuota(path, now)).toMatchObject({
      status: "unavailable",
      quotas: [],
    });
    await writeFile(path, "{partial");
    expect((await readClaudeQuota(path, now)).status).toBe("unavailable");
    await writeFile(path, " ".repeat(16385));
    expect((await readClaudeQuota(path, now)).status).toBe("unavailable");
    expect((await readClaudeQuota(root, now)).status).toBe("unavailable");
    expect((await readClaudeQuota("relative.json", now)).status).toBe(
      "unavailable",
    );
  });
  it.each([
    null,
    [],
    {},
    { ...observation(), source: "" },
    { ...observation(), model: "bad\nmodel" },
    { ...observation(), observedAt: "yesterday" },
    { ...observation(), extra: "private data" },
    { ...observation(), fiveHour: { usedPercent: -1, resetsAt: null } },
    { ...observation(), fiveHour: { usedPercent: 101, resetsAt: null } },
    { ...observation(), fiveHour: { usedPercent: "42", resetsAt: null } },
    { ...observation(), fiveHour: { usedPercent: 42 } },
    { ...observation(), fiveHour: { usedPercent: 42, resetsAt: 1794418800 } },
    { ...observation(), sevenDay: { usedPercent: 7, resetsAt: "invalid" } },
    {
      ...observation(),
      sevenDay: { usedPercent: 7, resetsAt: null, extra: true },
    },
  ])("rejects a malformed observation as a whole (%#)", async (value) => {
    await save(value);
    expect(await readClaudeQuota(path, now)).toMatchObject({
      status: "unavailable",
      quotas: [],
    });
  });
  it("expires exactly at fifteen minutes and rejects future observations", async () => {
    await save(observation());
    expect(
      (await readClaudeQuota(path, now + USAGE_MAX_AGE_MS - 1)).status,
    ).toBe("available");
    expect((await readClaudeQuota(path, now + USAGE_MAX_AGE_MS)).status).toBe(
      "unavailable",
    );
    expect((await readClaudeQuota(path, now - 1)).status).toBe("unavailable");
    expect((await readClaudeQuota(path, NaN)).status).toBe("unavailable");
  });
  it("expires windows independently at reset, even within the fifteen-minute observation lifetime", async () => {
    await save({
      ...observation(),
      fiveHour: { usedPercent: 100, resetsAt: "2026-11-11T10:01:00.000Z" },
    });
    expect((await readClaudeQuota(path, now + 59999)).quotas).toHaveLength(2);
    const result = await readClaudeQuota(path, now + 60000);
    expect(result.quotas.map((q) => q.label)).toEqual(["sevenDay"]);
    await save({ ...observation(), fiveHour: null, sevenDay: null });
    expect((await readClaudeQuota(path, now)).status).toBe("unavailable");
  });
  it("accepts zero and 100 percent, unknown reset times, and normalizes timestamp offsets", async () => {
    await save({
      ...observation(),
      observedAt: "2026-11-11T12:00:00+02:00",
      fiveHour: { usedPercent: 0, resetsAt: null },
      sevenDay: { usedPercent: 100, resetsAt: "2026-11-18T12:00:00+02:00" },
    });
    const result = await readClaudeQuota(path, now);
    expect(result.quotas.map((q) => q.usedPercent)).toEqual([0, 100]);
    expect(result.quotas.every((q) => q.observedAt === observedAt)).toBe(true);
    expect(result.quotas[1].resetsAt).toBe("2026-11-18T10:00:00.000Z");
  });
  it("does not retain a previous valid observation when the next read is malformed", async () => {
    await save(observation());
    expect((await readClaudeQuota(path, now)).status).toBe("available");
    await writeFile(path, "{");
    expect(await readClaudeQuota(path, now)).toMatchObject({
      status: "unavailable",
      quotas: [],
    });
  });
  it("uses the same display/report expiry for Claude and Codex without showing stale percentages", async () => {
    await save(observation());
    const { quotas } = await readClaudeQuota(path, now);
    const snapshot: UsageSnapshot = {
      version: 1,
      generatedAt: observedAt,
      from: observedAt,
      to: observedAt,
      rows: [],
      quotas: [...quotas, { ...quotas[0], service: "codex" }],
    };
    const fresh = renderToStaticMarkup(
      createElement(CombinedUsage, { snapshot, now }),
    );
    expect(fresh).toContain("fiveHour");
    const expiredAt = now + USAGE_MAX_AGE_MS;
    const stale = renderToStaticMarkup(
      createElement(CombinedUsage, { snapshot, now: expiredAt }),
    );
    expect(stale).toContain("Claude quota: Unavailable");
    expect(stale).toContain("Codex quota: Unknown");
    expect(stale).not.toContain("panaudota");
    const report = usageReport({
      ...snapshot,
      generatedAt: new Date(expiredAt).toISOString(),
    });
    expect(report).toContain('"quotas":[]');
    expect(snapshot.quotas).toHaveLength(3);
  });
});
