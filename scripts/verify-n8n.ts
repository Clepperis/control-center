import { n8nConfig } from "../src/server/config";
import { N8nClient } from "../src/integrations/n8n";
import { IntegrationError } from "../src/integrations/errors";
try {
  const config = n8nConfig(process.env),
    client = new N8nClient(config);
  const catalog = await client.listWorkflows();
  let eligible = false;
  if (
    config.contract &&
    catalog.workflows.some((w) => w.id === config.contract!.workflowId)
  ) {
    await client.verifyContract(config.contract);
    eligible = true;
  }
  console.log(
    JSON.stringify({
      event: "n8n_application_read_verified",
      workflowCount: catalog.workflows.length,
      truncated: catalog.truncated,
      curatedContractVerified: eligible,
      executionSwitch: config.enabled,
      effect: "read_only_no_execution",
    }),
  );
} catch (e) {
  console.error(
    JSON.stringify({
      event: "n8n_read_check_failed",
      code:
        e instanceof IntegrationError ? e.code : "configuration_or_contract",
    }),
  );
  process.exitCode = 1;
}
