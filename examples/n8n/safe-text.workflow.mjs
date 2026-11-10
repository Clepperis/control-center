import { workflow, trigger, node, expr } from "@n8n/workflow-sdk";

const input = trigger({
  type: "n8n-nodes-base.webhook",
  version: 2.2,
  config: {
    name: "Synthetic input",
    parameters: {
      httpMethod: "POST",
      path: "control-center-safe-text",
      authentication: "none",
      responseMode: "lastNode",
      options: {},
    },
  },
  output: [
    {
      json: {
        body: {
          requestId: "00000000-0000-4000-8000-000000000000",
          text: "labas",
        },
      },
    },
  ],
});
const transform = node({
  type: "n8n-nodes-base.set",
  version: 3.5,
  config: {
    name: "Transform text",
    parameters: {
      mode: "manual",
      includeOtherFields: false,
      assignments: {
        assignments: [
          {
            id: "correlation",
            name: "requestId",
            value: expr("{{ $json.body.requestId }}"),
            type: "string",
          },
          {
            id: "transformed",
            name: "transformedText",
            value: expr("{{ String($json.body.text).trim().toUpperCase() }}"),
            type: "string",
          },
        ],
      },
      options: {},
    },
  },
  output: [
    {
      json: {
        requestId: "00000000-0000-4000-8000-000000000000",
        transformedText: "LABAS",
      },
    },
  ],
});
export default workflow(
  "control-center-safe-text",
  "Control Center · Saugus teksto bandymas",
)
  .add(input)
  .to(transform);
