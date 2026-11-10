import { api } from "@/server/http";
import { getStore } from "@/server/runtime";
import { readiness } from "@/server/readiness";
export const dynamic = "force-dynamic";
export function GET() {
  return api(async () => {
    await readiness(
      getStore().db,
      process.env.KNOWLEDGE_ROOT ?? "",
      process.env.RELEASE_COMMIT ?? "",
    );
    return { status: "ready" };
  });
}
