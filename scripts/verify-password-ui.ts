import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { createServer as httpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { spawn } from "node:child_process";
import { generate } from "selfsigned";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { passwordFixture, testPassword } from "../tests/password-fixture";
import { setOwnerPassword } from "../src/server/auth/operator";

const base = "https://127.0.0.1:3443";
const fixture = await passwordFixture(undefined, base);
await fixture.bootstrap();
const knowledge = await mkdtemp(join(tmpdir(), "cc-login-knowledge-"));
for (const name of ["documents", "history", "conflicts"])
  await mkdir(join(knowledge, name));
await mkdir(".local/phase-6", { recursive: true });
const tls = await generate([{ name: "commonName", value: "localhost" }], {
  algorithm: "sha256",
  keySize: 2048,
});
const proxy = httpsServer({ key: tls.private, cert: tls.cert }, (req, res) => {
  const upstream = httpRequest(
    {
      hostname: "127.0.0.1",
      port: 3211,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (reply) => {
      res.writeHead(reply.statusCode ?? 502, reply.headers);
      reply.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    if (!res.writableEnded) res.end();
  });
  req.pipe(upstream);
});
await new Promise<void>((r) => proxy.listen(3443, "127.0.0.1", r));
const env: NodeJS.ProcessEnv = {
  ...process.env,
  ...fixture.env,
  NODE_ENV: "production",
  DATA_MODE: "live",
  KNOWLEDGE_ROOT: knowledge,
  RELEASE_COMMIT: "synthetic-password-ui",
  LIVE_MODEL_ENABLED: "false",
  LIVE_DELEGATION_ENABLED: "false",
  N8N_EXECUTION_ENABLED: "false",
  IMPROVEMENT_EXECUTOR_ENABLED: "false",
  NEXOS_API_KEY: "",
  NEXOS_MODEL: "",
  PAPERCLIP_BOARD_API_KEY: "",
  PAPERCLIP_BASE_URL: "",
  N8N_MCP_TOKEN: "",
  N8N_ORIGIN: "",
  IMPROVEMENT_GITHUB_READ_TOKEN: "",
  IMPROVEMENT_POLICY_FILE: "",
};
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3211",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let logs = "";
for (const stream of [child.stdout, child.stderr])
  stream?.on("data", (c: Buffer) => {
    logs = (logs + c.toString()).slice(-50000);
  });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
const protectedPaths = [
  "/api/workspace",
  "/api/agents",
  "/api/automations",
  "/api/knowledge",
  "/api/improvements",
  "/api/ready",
  "/api/conversations/22222222-2222-4222-8222-222222222222",
];
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3211/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  assert(ready, "Production server did not start");
  for (const path of protectedPaths)
    expect(
      (
        await context.request.get(base + path, {
          headers: {
            "X-Auth-User": "synthetic-owner",
            "X-Forwarded-For": "127.0.0.1",
          },
        })
      ).status(),
    ).toBe(401);
  for (const path of [
    "/api/chat",
    "/api/knowledge",
    "/api/improvements",
    "/api/automations",
    "/api/runs/22222222-2222-4222-8222-222222222222",
    "/api/automations/22222222-2222-4222-8222-222222222222",
  ])
    expect(
      (
        await context.request.post(base + path, {
          data: {},
          headers: { Origin: base },
        })
      ).status(),
    ).toBe(401);
  expect(
    (
      await context.request.post(base + "/api/auth/sign-up/email", {
        data: {
          email: "attacker@example.com",
          password: testPassword,
          name: "Attacker",
        },
        headers: { Origin: base },
      })
    ).status(),
  ).toBe(404);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/knowledge");
    await expect(page).toHaveURL(base + "/login");
    await expect(
      page.getByRole("heading", { name: "Savininko prisijungimas" }),
    ).toBeVisible();
    assert.equal(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze()
      ).violations.length,
      0,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    await page.screenshot({
      path: `.local/phase-6/login-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByLabel("El. paštas").fill("owner@example.com");
  await page.getByLabel("Slaptažodis").fill("Invalid synthetic passphrase");
  await page.getByRole("button", { name: "Prisijungti", exact: true }).click();
  await expect(page.locator('p[role="alert"]')).toContainText(
    "Prisijungti nepavyko",
  );
  await page.getByLabel("Slaptažodis").fill(testPassword);
  await page.getByRole("button", { name: "Prisijungti", exact: true }).click();
  await expect(page).toHaveURL(base + "/");
  const cookies = await context.cookies();
  assert(
    cookies.some(
      (c) =>
        c.name.includes("session_token") &&
        c.secure &&
        c.httpOnly &&
        c.sameSite === "Strict",
    ),
  );
  expect((await context.request.get(base + "/api/workspace")).status()).toBe(
    200,
  );
  const project = await context.request.post(base + "/api/knowledge", {
    data: { action: "project", name: "Sintetinis Phase 6 projektas" },
    headers: { Origin: base },
  });
  expect(project.status()).toBe(200);
  for (const path of [
    "/chat",
    "/knowledge",
    "/automations",
    "/improve",
    "/settings",
  ]) {
    await page.goto(base + path);
    await expect(
      page.getByRole("button", { name: "Atsijungti", exact: true }),
    ).toBeVisible();
    assert(!(await page.content()).includes("Reikia sukonfigūruoti prieigą"));
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + "/knowledge");
    await page
      .getByRole("combobox", { name: "Aprėptis", exact: true })
      .selectOption({ label: "Sintetinis Phase 6 projektas" });
    await expect(
      page
        .locator("strong")
        .filter({ hasText: "Sintetinis Phase 6 projektas" })
        .first(),
    ).toBeVisible();
    await page.screenshot({
      path: `.local/phase-6/owner-${width}.png`,
      fullPage: true,
    });
  }
  const foreign = await context.request.post(base + "/api/knowledge", {
    data: { action: "project", name: "CSRF" },
    headers: { Origin: "https://attacker.example" },
  });
  expect(foreign.status()).toBe(403);
  await page.getByRole("button", { name: "Atsijungti", exact: true }).click();
  await expect(page).toHaveURL(base + "/login");
  expect((await context.request.get(base + "/api/workspace")).status()).toBe(
    401,
  );
  await page.getByLabel("El. paštas").fill("owner@example.com");
  await page.getByLabel("Slaptažodis").fill(testPassword);
  await page.getByRole("button", { name: "Prisijungti", exact: true }).click();
  await expect(page).toHaveURL(base + "/");
  await setOwnerPassword(
    fixture.db,
    fixture.env,
    "reset",
    "owner@example.com",
    "Replacement synthetic passphrase",
  );
  expect((await context.request.get(base + "/api/workspace")).status()).toBe(
    401,
  );
  await page.goto(base + "/knowledge");
  await expect(page).toHaveURL(base + "/login");
  assert.deepEqual(errors, []);
  assert(
    !logs.includes(testPassword) && !logs.includes(fixture.env.AUTH_SECRET),
    "Credential appeared in server diagnostics",
  );
  // All static browser bundles must exclude synthetic server credentials.
  for (const file of await readdir(".next/static", { recursive: true }))
    if (file.endsWith(".js")) {
      const content = await readFile(join(".next/static", file), "utf8");
      assert(
        !content.includes(fixture.env.AUTH_SECRET) &&
          !content.includes(fixture.env.DATABASE_URL),
      );
    }
  await writeFile(
    resolve(".local/phase-6/password-ui.json"),
    JSON.stringify(
      {
        status: "passed",
        productionProcess: true,
        tls: "synthetic_self_signed_loopback",
        widths: [1440, 390],
        unauthorizedApi: protectedPaths.length,
        externalCalls: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    "Production password HTTPS browser checks passed: login/logout, owner pages/API, CSRF, reset revocation, desktop/mobile, AA login scan and bundle/log exclusions. Synthetic TLS only.",
  );
} finally {
  await context.close();
  await browser.close();
  child.kill();
  await new Promise<void>((r) => {
    if (child.exitCode !== null) r();
    else child.once("exit", () => r());
  });
  await new Promise<void>((r) => proxy.close(() => r()));
  await fixture.close();
}
