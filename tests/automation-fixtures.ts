import { textContract } from "../src/domain/automations";
import {
  safeTriggerParameters,
  safeTransformParameters,
} from "../src/integrations/n8n";
export const contract = textContract(
  "synthetic-workflow",
  "11111111-1111-4111-8111-111111111111",
);
export const config = {
  origin: "https://n8n.example",
  token: "synthetic-application-token",
  timeoutMs: 1000,
  enabled: true,
  contract,
};
export function definition() {
  return {
    workflow: {
      id: contract.workflowId,
      versionId: contract.versionId,
      active: false,
      activeVersionId: null,
      canExecute: true,
      isArchived: false,
      settings: { availableInMCP: true },
      nodes: [
        {
          name: "Synthetic input",
          type: "n8n-nodes-base.webhook",
          typeVersion: 2.2,
          parameters: structuredClone(safeTriggerParameters),
        },
        {
          name: "Transform text",
          type: "n8n-nodes-base.set",
          typeVersion: 3.5,
          parameters: structuredClone(safeTransformParameters),
        },
      ],
      connections: {
        "Synthetic input": {
          main: [[{ node: "Transform text", type: "main", index: 0 }]],
        },
      },
    },
  };
}
