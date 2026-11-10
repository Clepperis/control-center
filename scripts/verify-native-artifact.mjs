import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { verifyRelease } from "../ops/deploy.mjs";
import { sha256 } from "../ops/lib.mjs";
assert(
  process.platform === "linux" && process.arch === "arm64",
  "Actual native ARM64 required",
);
const fixture = JSON.parse(
  await readFile(".local/phase-6/native-fixture.json", "utf8"),
);
const stage = resolve(process.env.ARTIFACT_RUNTIME),
  manifest = JSON.parse(await readFile(join(stage, "release.json"), "utf8"));
await verifyRelease(
  dirname(stage),
  manifest.commit,
  await sha256(join(stage, "release.json")),
  "runtime",
);
const node = join(stage, "bin/node");
const db = new pg.Pool({ connectionString: fixture.adminDatabaseUrl });
let web, worker;
const logs = [];
function start(script, extra = {}) {
  const env = {
    PATH: process.env.PATH,
    NEXT_TELEMETRY_DISABLED: "1",
    ...fixture.env,
    DATA_MODE: "live",
    KNOWLEDGE_ROOT: fixture.knowledge,
    RELEASE_COMMIT: manifest.commit,
    LIVE_MODEL_ENABLED: "false",
    LIVE_DELEGATION_ENABLED: "false",
    N8N_EXECUTION_ENABLED: "false",
    IMPROVEMENT_EXECUTOR_ENABLED: "false",
    HOSTNAME: "127.0.0.1",
    PORT: "3210",
    ...extra,
  };
  if (script.includes("worker"))
    for (const key of [
      "AUTH_MODE",
      "AUTH_SECRET",
      "OWNER_SUBJECT",
      "APP_ORIGIN",
    ])
      delete env[key];
  if (script.includes("worker")) env.DATABASE_URL = fixture.workerDatabaseUrl;
  const child = spawn(node, [join(stage, script)], {
    cwd: stage,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (c) => {
      logs.push(c.toString());
      if (logs.length > 100) logs.shift();
    });
  return child;
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((r) => child.once("exit", r)),
    delay(15000).then(() => {
      child.kill("SIGKILL");
      throw Error("graceful_stop_timeout");
    }),
  ]);
}
async function heartbeat(after = 0) {
  for (let i = 0; i < 30; i++) {
    const r = await db.query(
      "SELECT completed_at,release FROM worker_heartbeat",
    );
    if (
      r.rows[0]?.release === manifest.commit &&
      new Date(r.rows[0].completed_at).getTime() > after
    )
      return;
    await delay(1000);
  }
  throw Error("worker_heartbeat_missing");
}
try {
  web = start("server.js");
  worker = start("dist/worker.mjs", { RECONCILE_INTERVAL_MS: "5000" });
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      if ((await fetch("http://127.0.0.1:3210/api/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert(ready);
  assert.equal(
    (await fetch("http://127.0.0.1:3210/api/workspace")).status,
    401,
  );
  const loginRequest = () =>
    fetch("http://127.0.0.1:3210/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        Origin: fixture.env.APP_ORIGIN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "owner@example.com",
        password: "Synthetic native long passphrase",
      }),
    });
  const resetLock = await db.connect();
  try {
    await resetLock.query("SELECT pg_advisory_lock(718236)");
    assert.equal(
      (await loginRequest()).status,
      429,
      "Native reset/login lock must fence a concurrent sign-in",
    );
  } finally {
    await resetLock.query("SELECT pg_advisory_unlock(718236)");
    resetLock.release();
  }
  const login = await loginRequest();
  assert.equal(login.status, 200);
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.equal(
    (
      await fetch("http://127.0.0.1:3210/api/workspace", {
        headers: { cookie },
      })
    ).status,
    200,
  );
  await heartbeat();
  await stop(worker);
  worker = undefined;
  const stoppedAt = Date.now();
  worker = start("dist/worker.mjs", { RECONCILE_INTERVAL_MS: "5000" });
  await heartbeat(stoppedAt);
  assert.equal(
    Number(
      (await db.query("SELECT count(*) FROM conversations")).rows[0].count,
    ),
    1,
  );
  assert.equal(
    Number(
      (await db.query("SELECT count(*) FROM knowledge_documents")).rows[0]
        .count,
    ),
    1,
  );
  const readiness = await fetch("http://127.0.0.1:3210/api/ready", {
    headers: { cookie },
  });
  assert.equal(readiness.status, 200);
  assert(!logs.join("").includes(fixture.env.AUTH_SECRET));
  const output = {
    status: "passed",
    commit: manifest.commit,
    architecture: process.arch,
    node: process.version,
    nativeExecution: true,
    oracleExecution: false,
    webHealth: true,
    passwordLogin: true,
    persistence: true,
    workerRestart: true,
    runtimeRoles: true,
    loginResetLock: true,
  };
  await writeFile(
    ".local/phase-6/native-artifact.json",
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output));
} finally {
  await stop(worker);
  await stop(web);
  await db.end();
}
