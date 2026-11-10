import { describe, it, expect } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  passwordFixture,
  testPassword,
  cookieHeader,
} from "./password-fixture";
import {
  hashOwnerPassword,
  passwordOwner,
  passwordConfig,
  createPasswordAuth,
} from "../src/server/auth/password";
import { setOwnerPassword } from "../src/server/auth/operator";
import { safeDestination } from "../src/server/auth/password-http";
import { Store } from "../src/server/orchestration/store";

describe("single-owner password boundary (real library + pg wire + SQL engine)", () => {
  it("accepts exactly ten characters for bootstrap, login and reset; rejects nine", async () => {
    const f = await passwordFixture();
    try {
      await expect(
        setOwnerPassword(
          f.db,
          f.env,
          "bootstrap",
          "owner@example.com",
          "123456789",
        ),
      ).rejects.toThrow();
      await setOwnerPassword(
        f.db,
        f.env,
        "bootstrap",
        "owner@example.com",
        "TestOnly10",
      );
      expect(
        (
          await f.call("sign-in/email", {
            email: "owner@example.com",
            password: "123456789",
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await f.call("sign-in/email", {
            email: "owner@example.com",
            password: "TestOnly10",
          })
        ).status,
      ).toBe(200);
      await expect(
        setOwnerPassword(
          f.db,
          f.env,
          "reset",
          "owner@example.com",
          "123456789",
        ),
      ).rejects.toThrow();
      await setOwnerPassword(
        f.db,
        f.env,
        "reset",
        "owner@example.com",
        "ResetNew10",
      );
      expect(
        (
          await f.call("sign-in/email", {
            email: "owner@example.com",
            password: "ResetNew10",
          })
        ).status,
      ).toBe(200);
    } finally {
      await f.close();
    }
  });

  it("operator bootstraps once; functional salted Argon2id, login, logout, expiry and revocation", async () => {
    const f = await passwordFixture();
    try {
      await expect(
        passwordOwner(f.auth, f.env, new Headers()),
      ).rejects.toMatchObject({ status: 401 });
      expect((await f.call()).status).toBe(401); // first visitor cannot bootstrap
      for (const route of [
        "sign-up/email",
        "reset-password",
        "request-password-reset",
        "change-password",
        "update-user",
        "get-session",
      ])
        expect((await f.call(route, {})).status).toBe(404);
      await f.bootstrap();
      await expect(f.bootstrap()).rejects.toThrow("already exists");
      await expect(
        f.db.query(
          "INSERT INTO auth_user(id,name,email) VALUES('intruder','Other','other@example.com')",
        ),
      ).rejects.toThrow();
      const encoded = (
        await f.db.query<{ password: string }>(
          "SELECT password FROM auth_account",
        )
      ).rows[0].password;
      expect(encoded).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
      expect(await hashOwnerPassword(testPassword)).not.toBe(encoded);
      expect(
        (
          await f.call("sign-in/email", {
            email: "owner@example.com",
            password: "invalid long password",
          })
        ).status,
      ).toBe(401);
      const signed = await f.call();
      expect(signed.status).toBe(200);
      expect(await signed.clone().json()).toEqual({ ok: true });
      expect(signed.headers.get("set-cookie")).toMatch(/HttpOnly/i);
      expect(signed.headers.get("set-cookie")).toMatch(/Secure/);
      expect(signed.headers.get("set-cookie")).toMatch(/SameSite=Strict/i);
      const expiry = (
        await f.db.query<{ seconds: number }>(
          'SELECT extract(epoch FROM ("expiresAt"-now()))::int AS seconds FROM auth_session',
        )
      ).rows[0].seconds;
      expect(expiry).toBeLessThanOrEqual(43200);
      expect(expiry).toBeGreaterThan(43000);
      const cookie = cookieHeader(signed);
      await expect(
        passwordOwner(f.auth, f.env, new Headers({ cookie })),
      ).resolves.toEqual({ subject: f.env.OWNER_SUBJECT, mode: "password" });
      expect((await f.call("sign-out", {}, { cookie })).status).toBe(200);
      await expect(
        passwordOwner(f.auth, f.env, new Headers({ cookie })),
      ).rejects.toMatchObject({ status: 401 });
      const expired = cookieHeader(await f.call());
      await f.db.query(
        "UPDATE auth_session SET \"expiresAt\"=now()-interval '1 second'",
      );
      await expect(
        passwordOwner(f.auth, f.env, new Headers({ cookie: expired })),
      ).rejects.toMatchObject({ status: 401 });
      const resetCookie = cookieHeader(await f.call());
      await setOwnerPassword(
        f.db,
        f.env,
        "reset",
        "owner@example.com",
        "Replacement long passphrase 2026",
      );
      await expect(
        passwordOwner(f.auth, f.env, new Headers({ cookie: resetCookie })),
      ).rejects.toMatchObject({ status: 401 });
      expect((await f.call()).status).toBe(401);
      expect(
        (
          await f.call("sign-in/email", {
            email: "owner@example.com",
            password: "Replacement long passphrase 2026",
          })
        ).status,
      ).toBe(200);
      await expect(
        passwordOwner(
          f.auth,
          { ...f.env, OWNER_SUBJECT: "different-owner" },
          new Headers({ cookie: cookieHeader(await f.call()) }),
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      await f.close();
    }
  });

  it("rejects CSRF, unsafe redirects, spoofed identities, configuration downgrades and preserves data ownership", async () => {
    const f = await passwordFixture();
    try {
      await f.bootstrap();
      for (const headers of [
        { Origin: "https://attacker.example" },
        { Origin: "" },
        { "Sec-Fetch-Site": "cross-site" },
      ] as Record<string, string>[])
        expect((await f.call("sign-in/email", undefined, headers)).status).toBe(
          403,
        );
      for (const next of [
        "//evil.example",
        "https://evil.example",
        "/%2f%2fevil",
        "/\\evil",
        "javascript:alert(1)",
        "/chat?next=https://evil",
      ]) {
        expect(safeDestination(next)).toBe("/");
        expect(
          (
            await f.call("sign-in/email", {
              email: "owner@example.com",
              password: testPassword,
              callbackURL: next,
            })
          ).status,
        ).toBe(400);
      }
      await expect(
        passwordOwner(
          f.auth,
          f.env,
          new Headers({
            "x-auth-user": "synthetic-owner",
            Authorization: "Bearer synthetic-owner",
          }),
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect(() =>
        passwordConfig({
          ...f.env,
          NODE_ENV: "production",
          APP_ORIGIN: "http://127.0.0.1:3000",
        }),
      ).toThrow();
      expect(() =>
        passwordConfig({ ...f.env, OWNER_SUBJECT: "development-owner" }),
      ).toThrow();
      const store = new Store(f.db);
      await f.db.query(
        "INSERT INTO conversations(id,owner_subject,title) VALUES($1,$2,$3)",
        [
          "11111111-1111-4111-8111-111111111111",
          "development-owner",
          "Private dev conversation",
        ],
      );
      expect(await store.listConversations(f.env.OWNER_SUBJECT)).toEqual([]);
      expect(await store.listConversations("development-owner")).toHaveLength(
        1,
      );
      expect(
        (
          await f.db.query(
            "SELECT * FROM orchestration_runs WHERE confirmed_by IS NOT NULL",
          )
        ).rows,
      ).toEqual([]);
    } finally {
      await f.close();
    }
  });

  it("durable budget survives process/library/DB reopen, ignores attacker IP/email, expires, and fails closed on DB loss", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cc-auth-"));
    let f = await passwordFixture(directory);
    try {
      await f.bootstrap();
      for (let i = 0; i < 10; i++)
        expect(
          (
            await f.call(
              "sign-in/email",
              {
                email: `unknown${i}@example.com`,
                password: "Incorrect passphrase 2026",
              },
              {
                "X-Forwarded-For": `192.0.2.${i}`,
                "X-Real-IP": `192.0.2.${i}`,
              },
            )
          ).status,
        ).toBe(401);
      expect((await f.call()).status).toBe(429);
      await f.close();
      f = await passwordFixture(directory);
      const restarted = createPasswordAuth(f.env, f.pool);
      expect(restarted).toBeDefined();
      expect((await f.call()).status).toBe(429);
      await f.db.query(
        "UPDATE auth_login_budget SET started_at=now()-interval '16 minutes'",
      );
      expect((await f.call()).status).toBe(200);
      await f.db.query("DROP TABLE auth_session");
      await expect(
        passwordOwner(
          f.auth,
          f.env,
          new Headers({ cookie: "control-center.session_token=invalid" }),
        ),
      ).rejects.toMatchObject({ status: 401 });
      expect((await f.call()).status).toBe(503);
    } finally {
      await f.close();
    }
  });
});
