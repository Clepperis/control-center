import { z } from "zod";
import { api, readJson } from "@/server/http";
import { getService, getAutomationService } from "@/server/runtime";
import { requireLiveMode } from "@/server/config";
import { scopeSchema } from "@/domain/knowledge";
import { MODEL_TIERS } from "@/server/models/routing";
const schema = z
  .object({
    conversationId: z.uuid(),
    requestId: z.uuid(),
    text: z.string().trim().min(1).max(4000),
    knowledge: scopeSchema.nullable().optional(),
    tier: z.enum(MODEL_TIERS).nullable().optional(),
  })
  .strict();
export async function POST(request: Request) {
  return api(async (owner) => {
    requireLiveMode(process.env);
    const body = schema.parse(await readJson(request));
    const snapshot = await getService().submit(
      owner,
      body.conversationId,
      body.requestId,
      body.text,
      request.signal,
      body.knowledge ?? null,
      body.tier ?? null,
    );
    return {
      ...snapshot,
      automationRuns: await getAutomationService().list(
        owner,
        body.conversationId,
      ),
    };
  });
}
