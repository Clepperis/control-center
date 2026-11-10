import { describe, it, expect } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { resolveSession } from "../src/server/auth/policy";
describe("owner boundary", () => {
  it("requires explicit development access and rejects it in production", async () => {
    await expect(
      resolveSession({ NODE_ENV: "development" }, null),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      resolveSession(
        { NODE_ENV: "development", AUTH_MODE: "development" },
        null,
      ),
    ).resolves.toMatchObject({ mode: "development" });
    await expect(
      resolveSession(
        { NODE_ENV: "production", AUTH_MODE: "development" },
        null,
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("verifies signed owner tokens, rejects other subjects, expiry and unsigned identity headers", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const env = {
      NODE_ENV: "production",
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://identity.example",
      OIDC_AUDIENCE: "control-center",
      OIDC_JWKS_URL: "https://identity.example/jwks",
      OWNER_SUBJECT: "owner",
    };
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(env.OIDC_ISSUER)
      .setAudience(env.OIDC_AUDIENCE)
      .setSubject("owner")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await expect(
      resolveSession(env, `Bearer ${token}`, async () => publicKey),
    ).resolves.toMatchObject({ subject: "owner" });
    await expect(
      resolveSession(
        { ...env, OWNER_SUBJECT: "other" },
        `Bearer ${token}`,
        async () => publicKey,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      resolveSession(
        { ...env, OIDC_AUDIENCE: "wrong" },
        `Bearer ${token}`,
        async () => publicKey,
      ),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      resolveSession(env, "owner", async () => publicKey),
    ).rejects.toMatchObject({ status: 401 });
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(env.OIDC_ISSUER)
      .setAudience(env.OIDC_AUDIENCE)
      .setSubject("owner")
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(privateKey);
    await expect(
      resolveSession(env, `Bearer ${expired}`, async () => publicKey),
    ).rejects.toMatchObject({ status: 401 });
  });
});
