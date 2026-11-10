import { getPasswordRuntime } from "@/server/auth/password-runtime";
import { passwordHttp } from "@/server/auth/password-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(request: Request) {
  if (process.env.AUTH_MODE !== "password")
    return new Response(null, { status: 404 });
  try {
    const { auth, env, pool } = getPasswordRuntime();
    return await passwordHttp(request, env, auth, pool);
  } catch {
    return Response.json(
      { error: "Prisijungimo paslauga nepasiekiama." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const POST = handle;
export const GET = handle;
