import { paperclipConfig, gatewayConfig } from "../src/server/config";
import { PaperclipClient } from "../src/integrations/paperclip";
import { NexosGateway } from "../src/integrations/nexos";
// Explicit read-only contract probes. Does not create credentials, tasks, runs or paid completions.
let failed = false;
try {
  const config = paperclipConfig(process.env);
  const client = new PaperclipClient({ ...config, contractVerified: true });
  const agents = await client.listAgents();
  await client.findByMarker("CONTROL_CENTER_READ_ONLY_CONTRACT_PROBE");
  console.log(
    JSON.stringify({
      service: "paperclip",
      operatorAndReadShapesVerified: true,
      eligibleAgentCount: agents.filter((a) => a.eligible).length,
      agentCount: agents.length,
    }),
  );
  console.log(
    "Create-task and result/comment contracts still require the separately approved bounded test. Do not enable delegation based only on this read probe.",
  );
} catch {
  failed = true;
  console.error(
    JSON.stringify({
      service: "paperclip",
      verified: false,
      action:
        "Check separate operator credentials, company and installed REST contract. No secrets logged.",
    }),
  );
}
try {
  const nexos = new NexosGateway(gatewayConfig(process.env));
  await nexos.check();
  const tiers = await nexos.routeStatus();
  console.log(
    JSON.stringify({
      service: "nexos",
      modelCatalogVerified: true,
      tiers,
      completionVerified: false,
    }),
  );
  if (Object.values(tiers).some((t) => !t.available)) failed = true;
} catch {
  failed = true;
  console.error(
    JSON.stringify({
      service: "nexos",
      verified: false,
      action:
        "Check application API key and exact model ID. No model completion was requested.",
    }),
  );
}
if (failed) process.exitCode = 1;
