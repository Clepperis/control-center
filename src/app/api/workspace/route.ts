import { api } from "@/server/http";
import { getStore, setupStatus } from "@/server/runtime";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async (owner) => ({
    conversations: await getStore().listConversations(owner),
    setup: setupStatus(),
  }));
}
