import { api } from "@/server/http";
import { requireLiveMode } from "@/server/config";
import { chatModelCatalog } from "@/server/runtime";
import { IntegrationError } from "@/integrations/errors";
/**
 * Owner-only, read-only list of chat-capable models for the chat picker.
 * An unavailable catalog is an explicit state, not an error: the picker then
 * offers only tiers, and sending still fails closed on its own checks.
 */
export async function GET() {
  return api(async () => {
    requireLiveMode(process.env);
    try {
      return { models: await chatModelCatalog(), unavailable: null };
    } catch (error) {
      if (!(error instanceof IntegrationError)) throw error;
      return { models: [], unavailable: error.code };
    }
  });
}
