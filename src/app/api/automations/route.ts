import { z } from "zod";
import { api, readJson } from "@/server/http";
import { getAutomationService } from "@/server/runtime";
import { automationProposalSchema } from "@/domain/automations";
export const dynamic = "force-dynamic";
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sync") }).strict(),
  z
    .object({
      action: z.literal("propose"),
      requestId: z.uuid(),
      proposal: automationProposalSchema,
      conversationId: z.uuid().optional(),
    })
    .strict(),
]);
export async function GET() {
  return api(async (owner) => {
    const s = getAutomationService();
    return { catalog: await s.catalog(owner), runs: await s.list(owner) };
  });
}
export async function POST(request: Request) {
  return api(async (owner) => {
    const b = action.parse(await readJson(request)),
      s = getAutomationService();
    return b.action === "sync"
      ? s.syncCatalog(owner)
      : s.propose(
          owner,
          b.requestId,
          b.proposal.key,
          b.proposal.input,
          b.conversationId ?? null,
        );
  });
}
