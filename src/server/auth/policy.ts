import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
export interface OwnerSession {
  subject: string;
  mode: "development" | "oidc";
}
export type Env = Record<string, string | undefined>;
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export class AccessError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function resolveSession(
  env: Env,
  authorization: string | null,
  testKey?: JWTVerifyGetKey,
): Promise<OwnerSession> {
  if (
    env.AUTH_MODE === "development" &&
    (env.NODE_ENV === "development" || env.NODE_ENV === "test")
  ) {
    return { subject: "development-owner", mode: "development" };
  }
  if (
    env.AUTH_MODE !== "oidc" ||
    !env.OIDC_ISSUER ||
    !env.OIDC_AUDIENCE ||
    !env.OIDC_JWKS_URL ||
    !env.OWNER_SUBJECT
  ) {
    throw new AccessError(
      503,
      "Prisijungimas nesukonfigūruotas. Kūrimo režimas produkcijoje neleidžiamas.",
    );
  }
  if (!authorization?.startsWith("Bearer "))
    throw new AccessError(401, "Reikia savininko prisijungimo.");
  try {
    const jwksUrl = new URL(env.OIDC_JWKS_URL);
    if (jwksUrl.protocol !== "https:") throw new Error("HTTPS required");
    let key = testKey ?? keySets.get(jwksUrl.href);
    if (!key) {
      const remoteKey = createRemoteJWKSet(jwksUrl, { timeoutDuration: 5000 });
      keySets.set(jwksUrl.href, remoteKey);
      key = remoteKey;
    }
    const { payload } = await jwtVerify(authorization.slice(7), key, {
      issuer: env.OIDC_ISSUER,
      audience: env.OIDC_AUDIENCE,
      algorithms: ["RS256", "ES256"],
      requiredClaims: ["exp", "iat", "sub"],
    });
    if (payload.sub !== env.OWNER_SUBJECT) throw new Error("Not owner");
    return { subject: payload.sub, mode: "oidc" };
  } catch {
    throw new AccessError(
      401,
      "Prisijungimas negalioja arba ši paskyra nėra savininko.",
    );
  }
}
