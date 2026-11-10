import { N8nClient } from "@/integrations/n8n";
import type { AutomationAdapter } from "@/integrations/contracts";
import { IntegrationError } from "@/integrations/errors";
import { n8nConfig } from "../config";
import type { Env } from "../auth/policy";
import { digest, type Store } from "../orchestration/store";
import { AutomationService } from "./service";

export function configuredAutomations(store: Store, env: Env = process.env) {
  try {
    const c = n8nConfig(env);
    return new AutomationService(store, new N8nClient(c), {
      configured: true,
      enabled: c.enabled,
      contract: c.contract,
      originHash: digest(c.origin),
      configHash: digest(JSON.stringify(c)),
    });
  } catch {
    const unavailable = async (): Promise<never> => {
      throw new IntegrationError("configuration");
    };
    const adapter: AutomationAdapter = {
      listWorkflows: unavailable,
      verifyContract: unavailable,
      execute: unavailable,
      readExecution: unavailable,
      findExecutions: unavailable,
      workflowUrl: () => "",
      executionUrl: () => "",
    };
    return new AutomationService(store, adapter, {
      configured: false,
      enabled: false,
      contract: null,
      configHash: "unconfigured",
      originHash: "unconfigured",
      errorCode:
        env.N8N_ORIGIN || env.N8N_MCP_TOKEN
          ? "configuration"
          : "not_configured",
    });
  }
}
