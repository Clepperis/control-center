import { z } from "zod";
import { requestJson, type Fetcher } from "@/integrations/errors";
import {
  sha,
  sourcePath,
  type RepositoryContext,
  type ImprovementPlan,
  type CandidateEvidence,
} from "@/domain/improvements";
import { DomainError } from "../orchestration/store";
import {
  allowedChange,
  assertScope,
  fingerprint,
  managedBranch,
  redact,
  safeBranch,
} from "./safety";

export interface ImprovementRepository {
  repository: string;
  target: string;
  context(paths: string[]): Promise<RepositoryContext>;
  head(branch: string): Promise<string>;
  evidence(
    id: string,
    base: string,
    plan: ImprovementPlan,
  ): Promise<CandidateEvidence>;
  contains(target: string, commit: string): Promise<boolean>;
}
const file = z.object({
  path: z.string(),
  mode: z.string(),
  type: z.string(),
  sha,
});
const workflowPath = ".github/workflows/platform-validation.yml";
const stepNames = ["Lint", "Types", "Tests", "Build"];
export class GithubRepository implements ImprovementRepository {
  constructor(
    public repository: string,
    public target: string,
    private token = "",
    private fetcher: Fetcher = fetch,
  ) {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(repository))
      throw new DomainError(400, "repository_boundary");
    safeBranch(target);
  }
  private async get(path: string) {
    return requestJson(
      this.fetcher,
      `https://api.github.com/repos/${this.repository}${path}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      },
      { timeoutMs: 10000 },
    );
  }
  async head(branch: string) {
    safeBranch(branch);
    return z
      .object({ object: z.object({ sha }) })
      .parse(
        await this.get(
          `/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
        ),
      ).object.sha;
  }
  async tree(commit: string) {
    sha.parse(commit);
    const result = z
      .object({ truncated: z.boolean(), tree: z.array(file).max(4000) })
      .parse(await this.get(`/git/trees/${commit}?recursive=1`));
    if (result.truncated) throw new DomainError(409, "repository_boundary");
    return result.tree;
  }
  private async blob(revision: string) {
    sha.parse(revision);
    const b = z
      .object({
        encoding: z.literal("base64"),
        size: z.number().max(60000),
        content: z.string().max(85000),
      })
      .parse(await this.get(`/git/blobs/${revision}`));
    return Buffer.from(b.content, "base64").toString("utf8");
  }
  async context(paths: string[]) {
    paths.forEach((p) => sourcePath.parse(p));
    const base = await this.head(this.target),
      tree = await this.tree(base);
    const instructions = tree
      .filter(
        (f) =>
          /(^|\/)AGENTS\.md$/.test(f.path) &&
          (f.path === "AGENTS.md" ||
            paths.some((p) => p.startsWith(f.path.slice(0, -9)))),
      )
      .map((f) => f.path);
    const selected = [
      ...new Set([
        ...instructions,
        "docs/ARCHITECTURE.md",
        "docs/ROADMAP.md",
        ...paths,
      ]),
    ];
    if (selected.length > 16) throw new DomainError(400, "scope_boundary");
    const sources: RepositoryContext["sources"] = [];
    let size = 0;
    for (const path of selected) {
      const f = tree.find(
        (f) =>
          f.path === path &&
          f.type === "blob" &&
          ["100644", "100755"].includes(f.mode),
      );
      if (!f) throw new DomainError(400, "repository_boundary");
      const content = redact(await this.blob(f.sha), 8000);
      size += content.length;
      if (size > 32000) throw new DomainError(400, "scope_boundary");
      sources.push({ path, revision: f.sha, content });
    }
    return {
      repository: this.repository,
      base,
      target: this.target,
      sources,
      tree: tree
        .filter(
          (f) => sourcePath.safeParse(f.path).success && f.type === "blob",
        )
        .map((f) => f.path)
        .slice(0, 400),
    };
  }
  async contains(target: string, commit: string) {
    sha.parse(target);
    sha.parse(commit);
    const result = z
      .object({ status: z.string() })
      .parse(await this.get(`/compare/${commit}...${target}`));
    return ["ahead", "identical"].includes(result.status);
  }
  async evidence(
    id: string,
    base: string,
    plan: ImprovementPlan,
  ): Promise<CandidateEvidence> {
    assertScope(plan);
    sha.parse(base);
    z.uuid().parse(id);
    const branch = managedBranch(id),
      commit = await this.head(branch),
      targetCommit = await this.head(this.target);
    const compare = z
      .object({
        status: z.string(),
        total_commits: z.number().max(20),
        merge_base_commit: z.object({ sha }),
        files: z
          .array(
            z.object({
              filename: z.string(),
              previous_filename: z.string().optional(),
              additions: z.number(),
              deletions: z.number(),
              patch: z.string().max(120000).optional(),
            }),
          )
          .min(1)
          .max(40),
      })
      .parse(await this.get(`/compare/${base}...${commit}`));
    if (compare.status !== "ahead" || compare.merge_base_commit.sha !== base)
      throw new DomainError(409, "candidate_changed");
    if (!(await this.contains(commit, targetCommit)))
      throw new DomainError(409, "candidate_changed");
    if (
      compare.files.some(
        (f) =>
          !allowedChange(f.filename) ||
          !plan.scope.includes(f.filename) ||
          (f.previous_filename && !plan.scope.includes(f.previous_filename)) ||
          !f.patch,
      )
    )
      throw new DomainError(403, "scope_boundary");
    const files = compare.files.map((f) => ({
      path: f.filename,
      ...(f.previous_filename ? { previousPath: f.previous_filename } : {}),
      additions: f.additions,
      deletions: f.deletions,
      patch: redact(f.patch!, 120000),
    }));
    // No symlinks/submodules, and no changed validation workflow is trusted.
    const baseTree = await this.tree(base),
      candidateTree = await this.tree(commit);
    if (
      files.some((f) =>
        candidateTree.some(
          (t) => t.path === f.path && !["100644", "100755"].includes(t.mode),
        ),
      )
    )
      throw new DomainError(403, "scope_boundary");
    const workflow = baseTree.find((t) => t.path === workflowPath);
    if (
      !workflow ||
      candidateTree.find((t) => t.path === workflowPath)?.sha !== workflow.sha
    )
      throw new DomainError(409, "validation_failed");
    const runs = z
      .object({
        workflow_runs: z
          .array(
            z.object({
              id: z.number().int(),
              head_sha: sha,
              head_branch: z.string(),
              path: z.string(),
              status: z.string(),
              conclusion: z.string().nullable(),
              html_url: z.url(),
              run_attempt: z.number().int(),
            }),
          )
          .max(30),
      })
      .parse(
        await this.get(
          `/actions/runs?head_sha=${commit}&event=push&per_page=30`,
        ),
      );
    const run = runs.workflow_runs
      .filter(
        (r) =>
          r.head_sha === commit &&
          r.head_branch === branch &&
          r.path === workflowPath,
      )
      .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)[0];
    const checks: CandidateEvidence["checks"] = [];
    const captures: string[] = [];
    if (run) {
      const jobs = z
        .object({
          total_count: z.number().max(20),
          jobs: z.array(
            z.object({
              name: z.string(),
              head_sha: sha,
              conclusion: z.string().nullable(),
              steps: z.array(
                z.object({
                  name: z.string(),
                  conclusion: z.string().nullable(),
                  status: z.string(),
                }),
              ),
            }),
          ),
        })
        .parse(
          await this.get(
            `/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=30`,
          ),
        );
      for (const name of [
        ...stepNames,
        ...(plan.uiChange ? ["Desktop and mobile"] : []),
      ]) {
        const step = jobs.jobs
          .find((j) => j.name === "validate" && j.head_sha === commit)
          ?.steps.find((s) => s.name === name);
        checks.push({
          command:
            name === "Desktop and mobile"
              ? "npm run test:ui:live (1440px / 390px)"
              : (
                  {
                    Lint: "npm run lint",
                    Types: "npm run typecheck",
                    Tests: "npm test",
                    Build: "npm run build",
                  } as Record<string, string>
                )[name],
          conclusion: step?.conclusion ?? "pending",
          exitCode: step?.conclusion === "success" ? 0 : null,
          url: `https://github.com/${this.repository}/actions/runs/${run.id}/attempts/${run.run_attempt}`,
        });
      }
      if (plan.uiChange) {
        const artifacts = z
          .object({
            artifacts: z
              .array(
                z.object({
                  id: z.number().int().positive(),
                  name: z.string(),
                  expired: z.boolean(),
                }),
              )
              .max(30),
          })
          .parse(
            await this.get(`/actions/runs/${run.id}/artifacts?per_page=30`),
          );
        for (const artifact of artifacts.artifacts.filter(
          (a) => a.name === "synthetic-browser-captures" && !a.expired,
        ))
          captures.push(
            `https://github.com/${this.repository}/actions/runs/${run.id}/artifacts/${artifact.id}`,
          );
      }
    }
    const passed =
      !!run &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      checks.length > 0 &&
      (!plan.uiChange || captures.length > 0) &&
      checks.every((c) => c.exitCode === 0);
    const validationHash = fingerprint({
      commit,
      checks,
      run: run?.id,
      attempt: run?.run_attempt,
      captures,
    });
    return {
      base,
      commit,
      branch,
      target: this.target,
      targetCommit,
      files,
      diffHash: fingerprint(files),
      checks,
      validationHash,
      passed,
      captures,
      limitations: [
        "CI proceso rezultatai tikrinami per GitHub API; vykdytojo pasakojimas nelaikomas įrodymu.",
        ...(plan.uiChange
          ? [
              "Atverkite CI naršyklės artefaktus ir vizualiai peržiūrėkite darbalaukio bei telefono vaizdus.",
            ]
          : []),
      ],
      observedAt: new Date().toISOString(),
    };
  }
}
