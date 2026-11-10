import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { GithubRepository } from "../src/server/improvements/repository";
import {
  PaperclipCodingExecutor,
  loadRuntimePolicy,
} from "../src/server/improvements/executor";
import {
  configurationFingerprint,
  fingerprint,
  redact,
} from "../src/server/improvements/safety";
import { sourcePath, improvementCommand } from "../src/domain/improvements";
import {
  base,
  candidate,
  other,
  plan,
  syntheticPolicy,
  syntheticContext,
} from "./improvement-fixtures";
import type { Improvement } from "../src/domain/improvements";
import type { Fetcher } from "../src/integrations/errors";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-policy-boundary-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
const json = (v: unknown) =>
  new Response(JSON.stringify(v), {
    headers: { "Content-Type": "application/json" },
  });
const attestation = {
  authenticatedCodingRuntime: true,
  isolatedFilesystem: true,
  noProductionCredentials: true,
  minimalEnvironment: true,
  networkEnforced: true,
  hardBudgetEnforced: true,
  diskAndLogsEnforced: true,
  cancellationTested: true,
  protectedPathsEnforced: true,
};
it("rejects traversal, arbitrary personal files, endpoint overrides and model-generated executor controls", () => {
  for (const path of [
    "../.env.local",
    "C:\\Users\\owner\\secrets.txt",
    "/etc/passwd",
    "src/../../secret.ts",
    ".env.local",
    "src\\test.ts",
  ])
    expect(sourcePath.safeParse(path).success).toBe(false);
  expect(() => new GithubRepository("../../other", "main")).toThrow();
  expect(
    () =>
      new GithubRepository("Clepperis/control-center", "--upload-pack=evil"),
  ).toThrow();
  expect(
    improvementCommand.safeParse({
      action: "authorize",
      id: randomUUID(),
      version: 1,
      planHash: "a".repeat(64),
      policyHash: "b".repeat(64),
      shell: "rm everything",
      environmentId: randomUUID(),
    }).success,
  ).toBe(false);
});
it("requires operator policy outside the checkout, fresh expiry and explicit hard controls", async () => {
  const path = join(root, "runtime.json"),
    policy = syntheticPolicy();
  await writeFile(path, JSON.stringify({ ...policy, attestation }));
  expect((await loadRuntimePolicy(path, policy.repository)).maxCostUsd).toBe(1);
  await expect(
    loadRuntimePolicy(resolve(".env.example"), policy.repository),
  ).rejects.toMatchObject({ code: "executor_setup" });
  await expect(
    loadRuntimePolicy(path, "unrelated/repository"),
  ).rejects.toMatchObject({ code: "executor_setup" });
  await writeFile(
    path,
    JSON.stringify({
      ...policy,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      attestation,
    }),
  );
  await expect(
    loadRuntimePolicy(path, policy.repository),
  ).rejects.toMatchObject({ code: "executor_setup" });
  await writeFile(
    path,
    JSON.stringify({
      ...policy,
      attestation: { ...attestation, hardBudgetEnforced: false },
    }),
  );
  await expect(loadRuntimePolicy(path, policy.repository)).rejects.toThrow();
});
it("redacts credentials, private paths and selected sensitive error output before persistence/presentation", () => {
  const result = redact(
    "Bearer abcdefghijklmnop password=correcthorse github_pat_123456789 sk-syntheticlongsecret postgres://owner:private@db/vault C:\\Users\\owner\\secret.json",
  );
  for (const secret of [
    "abcdefghijklmnop",
    "correcthorse",
    "123456789",
    "syntheticlongsecret",
    "owner:private",
    "secret.json",
  ])
    expect(result).not.toContain(secret);
  expect(redact("x".repeat(50000))).toHaveLength(12000);
});
it("Paperclip adapter uses only trusted isolation parameters, exact plan/base and configured agent; cancellation requests interrupt", async () => {
  const policy = syntheticPolicy(),
    companyId = randomUUID(),
    taskId = randomUUID(),
    id = randomUUID();
  const agent = {
      id: policy.agentId,
      companyId,
      name: "Synthetic",
      role: "engineer",
      status: "idle",
      lifecycleState: "ready",
    },
    project = { id: policy.projectId, companyId, name: "Synthetic project" };
  policy.agentConfigHash = configurationFingerprint(agent);
  expect(
    configurationFingerprint({
      ...agent,
      status: "active",
      updatedAt: "later",
    }),
  ).toBe(policy.agentConfigHash);
  expect(
    configurationFingerprint({
      ...agent,
      adapterConfig: { status: "changed-policy" },
    }),
  ).not.toBe(policy.agentConfigHash);
  policy.projectConfigHash = configurationFingerprint(project);
  const file = join(root, "policy.json");
  await writeFile(file, JSON.stringify({ ...policy, attestation }));
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  let description = "";
  const fetcher: Fetcher = async (url, init) => {
    const path = new URL(String(url)).pathname,
      body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ path, body });
    if (path.endsWith("/cli-auth/me")) return json({ companyIds: [companyId] });
    if (path.endsWith("/agents")) return json([agent]);
    if (path.endsWith(`/agents/${policy.agentId}`)) return json(agent);
    if (path.endsWith(`/projects/${policy.projectId}`)) return json(project);
    if (init?.method === "POST" && path.endsWith("/issues")) {
      description = body.description;
      return json({
        id: taskId,
        companyId,
        identifier: "SYN-5",
        status: "todo",
        title: `[CC Improve ${id}]`,
        description,
        assigneeAgentId: policy.agentId,
      });
    }
    if (path.endsWith(`/issues/${taskId}/comments`)) return json({});
    if (path.endsWith(`/issues/${taskId}`))
      return json({
        id: taskId,
        companyId,
        identifier: "SYN-5",
        status: "cancelled",
        title: `[CC Improve ${id}]`,
        description,
        assigneeAgentId: policy.agentId,
      });
    throw new Error("Unexpected path " + path);
  };
  const executor = new PaperclipCodingExecutor(
    {
      baseUrl: "https://paperclip.example",
      apiKey: "pcp_board_synthetic",
      companyId,
      agentIds: [policy.agentId],
      enabled: true,
      contractVerified: true,
    },
    policy.repository,
    file,
    true,
    fetcher,
  );
  const request = {
    id,
    request: "Synthetic only",
    messages: [],
    plan,
    planHash: "a".repeat(64),
    context: syntheticContext(),
    policy,
    authorization: {
      planHash: "a".repeat(64),
      base,
      policyHash: fingerprint(policy),
    },
  } as unknown as Improvement;
  const external = await executor.submit(request);
  request.external = external;
  const submit = calls.find((c) => c.body?.title);
  expect(submit?.body?.executionWorkspacePreference).toBe("isolated_workspace");
  expect(submit?.body?.executionWorkspaceSettings).toMatchObject({
    environmentId: policy.environmentId,
    workspaceStrategy: { baseRef: base, branchTemplate: `codex/improve-${id}` },
  });
  expect(submit?.body).not.toHaveProperty("assigneeAdapterOverrides");
  expect(submit?.body?.visibility).toBe("private");
  await expect(
    executor.submit({ ...request, authorization: null }),
  ).rejects.toMatchObject({ code: "plan_changed" });
  expect(await executor.cancel(request)).toContain("dar nepatvirtintas");
  expect(calls.find((c) => c.body?.interrupt)?.body?.interrupt).toBe(true);
});
it("collects exact GitHub commit/diff and actual workflow job-step conclusions; rejects scope expansion and symlinks", async () => {
  const id = randomUUID();
  let expand = false,
    symlink = false,
    fail = false,
    capturesAvailable = true;
  const tree = [
    {
      path: ".github/workflows/platform-validation.yml",
      type: "blob",
      mode: "100644",
      sha: other,
    },
    { path: plan.scope[0], type: "blob", mode: "100644", sha: other },
  ];
  const fetcher: Fetcher = async (url) => {
    const u = new URL(String(url)),
      path = u.pathname;
    if (path.includes("/git/ref/heads/codex/improve-"))
      return json({ object: { sha: candidate } });
    if (path.includes("/git/ref/heads/"))
      return json({ object: { sha: base } });
    if (path.includes(`/compare/${base}...${candidate}`))
      return json({
        status: "ahead",
        total_commits: 1,
        merge_base_commit: { sha: base },
        files: [
          {
            filename: expand ? "src/server/auth/session.ts" : plan.scope[0],
            additions: 1,
            deletions: 1,
            patch: "-Old\n+New",
          },
        ],
      });
    if (path.includes(`/git/trees/`))
      return json({
        truncated: false,
        tree: tree.map((f) => ({
          ...f,
          mode:
            symlink && path.includes(candidate) && f.path === plan.scope[0]
              ? "120000"
              : f.mode,
        })),
      });
    if (path.endsWith("/actions/runs"))
      return json({
        workflow_runs: [
          {
            id: 1,
            head_sha: candidate,
            head_branch: `codex/improve-${id}`,
            path: ".github/workflows/platform-validation.yml",
            status: "completed",
            conclusion: fail ? "failure" : "success",
            html_url:
              "https://github.com/Clepperis/control-center/actions/runs/1",
            run_attempt: 1,
          },
        ],
      });
    if (path.endsWith("/jobs"))
      return json({
        total_count: 1,
        jobs: [
          {
            name: "validate",
            head_sha: candidate,
            conclusion: fail ? "failure" : "success",
            steps: [
              "Lint",
              "Types",
              "Tests",
              "Build",
              "Desktop and mobile",
            ].map((name) => ({
              name,
              status: "completed",
              conclusion: fail && name === "Tests" ? "failure" : "success",
            })),
          },
        ],
      });
    if (path.endsWith("/artifacts"))
      return json({
        artifacts: capturesAvailable
          ? [{ id: 42, name: "synthetic-browser-captures", expired: false }]
          : [],
      });
    throw new Error("Unexpected GitHub path " + path);
  };
  const repo = new GithubRepository(
    "Clepperis/control-center",
    "codex/phase-5-platform-engineer",
    "",
    fetcher,
  );
  let evidence = await repo.evidence(id, base, plan);
  expect(evidence.passed).toBe(true);
  expect(evidence.checks).toHaveLength(5);
  expect(evidence.captures).toHaveLength(1);
  expect(evidence.commit).toBe(candidate);
  fail = true;
  evidence = await repo.evidence(id, base, plan);
  expect(evidence.passed).toBe(false);
  expect(
    evidence.checks.find((c) => c.command === "npm test")?.exitCode,
  ).toBeNull();
  fail = false;
  capturesAvailable = false;
  expect((await repo.evidence(id, base, plan)).passed).toBe(false);
  capturesAvailable = true;
  expand = true;
  await expect(repo.evidence(id, base, plan)).rejects.toMatchObject({
    code: "scope_boundary",
  });
  expand = false;
  symlink = true;
  await expect(repo.evidence(id, base, plan)).rejects.toMatchObject({
    code: "scope_boundary",
  });
});
