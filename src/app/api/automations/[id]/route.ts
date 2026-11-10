import { z } from "zod";
import { api, readJson } from "@/server/http";
import { getAutomationService } from "@/server/runtime";
const action = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("confirm"), actionHash: z.string().length(64) })
    .strict(),
  z.object({ action: z.literal("refresh") }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (owner) => {
    const id = z.uuid().parse((await params).id),
      b = action.parse(await readJson(request)),
      s = getAutomationService();
    return b.action === "confirm"
      ? s.confirm(owner, id, b.actionHash)
      : b.action === "refresh"
        ? s.refresh(owner, id)
        : s.stop(owner, id);
  });
}
