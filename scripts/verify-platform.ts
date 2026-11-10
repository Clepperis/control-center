import { z } from "zod";
import { paperclipConfig } from "../src/server/config";
import { PaperclipClient } from "../src/integrations/paperclip";
import { requestJson } from "../src/integrations/errors";
import { GithubRepository } from "../src/server/improvements/repository";
import {
  readRuntimePolicyFile,
  PaperclipCodingExecutor,
} from "../src/server/improvements/executor";
import { configurationFingerprint } from "../src/server/improvements/safety";
import { improvementTarget } from "../src/server/improvements/configured";
// Read-only. Never invokes a model, creates a task, changes external settings,
// enables execution, creates credentials, or touches the owner's working tree.
let failed = false;
const { repository, target } = improvementTarget();
try {
  const repo = new GithubRepository(
    repository,
    target,
    process.env.IMPROVEMENT_GITHUB_READ_TOKEN ?? "",
  );
  const context = await repo.context(["src/components/knowledge.tsx"]);
  console.log(
    JSON.stringify({
      service: "github",
      readVerified: true,
      base: context.base,
      selectedSourceCount: context.sources.length,
      codingVerified: false,
    }),
  );
} catch {
  failed = true;
  console.error(
    JSON.stringify({
      service: "github",
      readVerified: false,
      action:
        "Check allowed repository/target, rate limits and a separate read token if needed.",
    }),
  );
}
try {
  const config = paperclipConfig(process.env),
    file = process.env.IMPROVEMENT_POLICY_FILE ?? "";
  const ids = z
    .object({
      repository: z.literal(repository),
      agentId: z.uuid(),
      projectId: z.uuid(),
    })
    .parse(await readRuntimePolicyFile(file));
  if (!config.agentIds.includes(ids.agentId))
    throw new Error("Agent not allowed");
  const client = new PaperclipClient(config);
  const agents = await client.listAgents();
  const read = (path: string) =>
    requestJson(
      fetch,
      `${config.baseUrl}/api${path}`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
      { timeoutMs: 10000 },
    );
  const agent = await read(`/agents/${ids.agentId}`),
    project = await read(`/projects/${ids.projectId}`);
  console.log(
    JSON.stringify({
      service: "paperclip",
      eligible: agents.some((a) => a.id === ids.agentId && a.eligible),
      agentConfigHash: configurationFingerprint(agent),
      projectConfigHash: configurationFingerprint(project),
      codingVerified: false,
    }),
  );
  if (!process.argv.includes("--fingerprints")) {
    await new PaperclipCodingExecutor(
      { ...config, enabled: true },
      repository,
      file,
      true,
    ).ready();
    console.log(
      "Operator policy and current configuration match. This read-only check is NOT proof of coding, sandbox enforcement, cancellation or a real isolated run. Execution switches were not changed.",
    );
  }
} catch {
  failed = true;
  console.error(
    JSON.stringify({
      service: "paperclip",
      ready: false,
      action:
        "Check separate operator credentials, allowed ready agent, installed contract and external operator policy. No secrets logged.",
    }),
  );
}
if (failed) process.exitCode = 1;
