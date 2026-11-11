import { z } from "zod";
import { api, readJson } from "@/server/http";
import { requireLiveMode } from "@/server/config";
import { getLessonService } from "@/server/runtime";

const schema = z
  .object({
    messageId: z.uuid(),
    rating: z.union([z.literal(1), z.literal(-1)]),
    note: z.string().trim().max(400).optional(),
  })
  .strict();
export async function POST(request: Request) {
  return api(async (owner) => {
    requireLiveMode(process.env);
    const body = schema.parse(await readJson(request));
    await getLessonService().feedback(
      owner,
      body.messageId,
      body.rating,
      body.note,
    );
    return { ok: true };
  });
}
