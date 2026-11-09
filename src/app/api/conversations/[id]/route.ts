import { z } from "zod";
import { api } from "@/server/http";
import { getStore, taskUrl } from "@/server/runtime";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return api(async (owner) => {
    const id = z.uuid().parse((await params).id);
    const snapshot = await getStore().snapshot(owner, id);
    return {
      ...snapshot,
      runs: snapshot.runs.map((run) => ({
        ...run,
        taskUrl: run.result?.identifier ? taskUrl(run.result.identifier) : null,
      })),
    };
  });
}
