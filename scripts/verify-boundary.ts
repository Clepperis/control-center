import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3101";
for (const { mode, nodeEnv } of [
  { mode: "development", nodeEnv: "production" },
  { mode: "oidc", nodeEnv: "production" },
  { mode: "development", nodeEnv: "test" },
] as const) {
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3101",
    ],
    {
      windowsHide: true,
      stdio: "ignore",
      env: {
        ...process.env,
        NODE_ENV: nodeEnv,
        AUTH_MODE: mode,
        DATA_MODE: "demo",
        OIDC_ISSUER: "https://identity.example",
        OIDC_AUDIENCE: "control-center",
        OIDC_JWKS_URL: "https://identity.example/jwks",
        OWNER_SUBJECT: "synthetic-owner",
      },
    },
  );
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(200);
    }
    assert(ready, "Production boundary server did not start");
    for (const path of ["/", "/chat", "/projects", "/settings"]) {
      const html = await (await fetch(base + path)).text();
      assert(html.includes("Reikia sukonfigūruoti prieigą"));
      assert(!html.includes("Namų archyvas"));
    }
    for (const path of [
      "/api/workspace",
      "/api/agents",
      "/api/conversations/22222222-2222-4222-8222-222222222222",
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, mode === "development" ? 503 : 401);
    }
    const mutation = await fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({}),
    });
    assert.equal(mutation.status, mode === "development" ? 503 : 401);
    console.log(
      `Production artifact verified for AUTH_MODE=${mode}, NODE_ENV=${nodeEnv}: pages expose setup only; API reads and mutations deny access.`,
    );
  } finally {
    child.kill();
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
  }
}
