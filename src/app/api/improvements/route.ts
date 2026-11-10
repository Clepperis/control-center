import { z } from "zod";
import { api, readJson } from "@/server/http";
import { getImprovementService } from "@/server/runtime";
import { improvementCommand } from "@/domain/improvements";
import { improvementSetup } from "@/server/improvements/configured";
import { fingerprint } from "@/server/improvements/safety";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async (owner) => {
    const s = getImprovementService(),
      q = new URL(request.url).searchParams,
      id = q.get("id");
    if (q.get("op") === "readiness") {
      const policy = await s.executor.ready();
      return { policy, policyHash: fingerprint(policy) };
    }
    return id
      ? {
          request: await s.get(owner, z.uuid().parse(id)),
          setup: improvementSetup(),
        }
      : { requests: await s.list(owner), setup: improvementSetup() };
  });
}
export async function POST(request: Request) {
  return api(async (owner) => ({
    request: await getImprovementService().command(
      owner,
      improvementCommand.parse(await readJson(request, 32000)),
    ),
  }));
}
