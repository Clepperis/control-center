import { z } from "zod";
import { api, readJson } from "@/server/http";
import { requireLiveMode } from "@/server/config";
import { getLessonService } from "@/server/runtime";

export async function GET() {
  return api(async (owner) => {
    requireLiveMode(process.env);
    return { lessons: await getLessonService().list(owner) };
  });
}

const action = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("propose"),
      text: z.string().trim().min(3).max(400),
    })
    .strict(),
  z
    .object({
      action: z.enum(["approved", "rejected", "retired"]),
      id: z.uuid(),
    })
    .strict(),
]);
export async function POST(request: Request) {
  return api(async (owner) => {
    requireLiveMode(process.env);
    const body = action.parse(await readJson(request));
    const service = getLessonService();
    const lesson =
      body.action === "propose"
        ? await service.propose(owner, { text: body.text, source: "owner" })
        : await service.decide(owner, body.id, body.action);
    return { lesson };
  });
}
