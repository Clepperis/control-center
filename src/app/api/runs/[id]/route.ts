import { z } from "zod";
import { api, readJson } from "@/server/http";
import { getService, taskUrl } from "@/server/runtime";
const action = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("confirm"), planHash: z.string().length(64) })
    .strict(),
  z.object({ action: z.literal("refresh") }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (owner) => {
    const id = z.uuid().parse((await params).id);
    const body = action.parse(await readJson(request));
    const service = getService();
    const run =
      body.action === "confirm"
        ? await service.confirm(owner, id, body.planHash, request.signal)
        : body.action === "refresh"
          ? await service.refresh(owner, id)
          : await service.stopTracking(owner, id);
    return {
      ...run,
      taskUrl: run.result?.identifier ? taskUrl(run.result.identifier) : null,
    };
  });
}
