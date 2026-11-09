import "server-only";
import { z } from "zod";
import { requireOwner } from "./auth/session";
import { AccessError } from "./auth/policy";
import { DomainError } from "./orchestration/store";
import { IntegrationError } from "@/integrations/errors";
import { errorLabels } from "@/domain/orchestration";
export async function readJson(request: Request) {
  const origin = process.env.APP_ORIGIN;
  if (!origin || request.headers.get("origin") !== origin)
    throw new DomainError(403, "origin");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DomainError(415, "content_type");
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError(400, "body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32000) {
        await reader.cancel();
        throw new DomainError(413, "body_size");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new DomainError(400, "body");
  }
}
export async function api(fn: (owner: string) => Promise<unknown>) {
  try {
    const session = await requireOwner();
    const result = await fn(session.subject);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AccessError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError)
      return Response.json(
        { error: "Patikrinkite pateiktus duomenis." },
        { status: 400 },
      );
    if (error instanceof DomainError) {
      const labels: Record<string, string> = {
        not_found: "Įrašas nerastas.",
        request_conflict:
          "Šis užklausos identifikatorius jau panaudotas kitam turiniui.",
        turn_pending: "Pirmiau sulaukite ankstesnio atsakymo.",
        plan_changed: "Planas pasikeitė. Peržiūrėkite jį dar kartą.",
        invalid_state: "Šio veiksmo dabartinėje būsenoje atlikti negalima.",
        origin: "Užklausos kilmė neleidžiama.",
      };
      return Response.json(
        { error: labels[error.code] ?? "Užklausa netinkama." },
        { status: error.status },
      );
    }
    if (error instanceof IntegrationError)
      return Response.json(
        { error: errorLabels[error.code], code: error.code },
        {
          status:
            error.code === "configuration" || error.code === "disabled"
              ? 503
              : 502,
        },
      );
    console.error(
      JSON.stringify({ event: "application_request_failed", code: "internal" }),
    );
    return Response.json(
      {
        error:
          "Duomenų saugykla nepasiekiama arba neatnaujinta. Patikrinkite PostgreSQL ir migracijas.",
      },
      { status: 503 },
    );
  }
}
