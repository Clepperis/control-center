import { api } from "@/server/http";
import { getService } from "@/server/runtime";
export async function GET() {
  return api(async () => ({ agents: await getService().agents() }));
}
