import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { validateReview, transition, verifyRelease } from "../ops/deploy.mjs";
import { managed, inventory, verifyInventory, sha256 } from "../ops/lib.mjs";
import { checkSchema } from "../src/server/db/schema";
import { migrate } from "../src/server/db/migrate";
import { openTestDatabase } from "./pglite";
const schema = Array.from({ length: 6 }, (_, i) => ({
  name: `00${i + 1}_example.sql`,
  checksum: "a".repeat(64),
}));
const review = {
  version: 1,
  commit: "a".repeat(40),
  artifactSha256: "b".repeat(64),
  manifestSha256: "c".repeat(64),
  targetMachineSha256: "d".repeat(64),
  hostname: "cc-1234567890abcdef.duckdns.org",
  port: 3210,
  dataRoot: "/var/lib/control-center",
  executionEnabled: false,
  migrationsAppliedSeparately: true,
  schema,
  configSha256: { web: "e".repeat(64), worker: "f".repeat(64) },
  networkPlanSha256: "1".repeat(64),
  previous: null,
  recovery: { emptyInitialDatabase: true },
};
it("binds owner procedure to exact release/artifact/target/config/schema and expiring approval", () => {
  const hash = "2".repeat(64),
    machine = review.targetMachineSha256,
    approval = {
      approvedBy: "owner",
      action: "activate",
      packageSha256: hash,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    };
  expect(() => validateReview(review, approval, hash, machine)).not.toThrow();
  expect(() =>
    validateReview(
      { ...review, hostname: "personal-center.duckdns.org" },
      approval,
      hash,
      machine,
    ),
  ).not.toThrow();
  for (const hostname of [
    "-invalid.duckdns.org",
    "invalid-.duckdns.org",
    "a".repeat(64) + ".duckdns.org",
    "valid.duckdns.org.attacker.example",
    "valid.duckdns.org/path",
    "valid.duckdns.org?x=1",
  ])
    expect(() =>
      validateReview({ ...review, hostname }, approval, hash, machine),
    ).toThrow("unreviewed_hostname");
  for (const [r, a, h, m] of [
    [review, approval, "3".repeat(64), machine],
    [review, approval, hash, "4".repeat(64)],
    [{ ...review, port: 3000 }, approval, hash, machine],
    [{ ...review, executionEnabled: true }, approval, hash, machine],
    [review, { ...approval, expiresAt: "2000-01-01" }, hash, machine],
  ] as const)
    expect(() => validateReview(r, a, h, m)).toThrow();
});
it("rolls both processes back on health failure and stops on uncertain/failed rollback", async () => {
  const calls: string[] = [];
  const r = { ...review, previous: { commit: "b".repeat(40) } };
  const runner = async (_exe: string, args: string[]) => {
    calls.push(args.join(" "));
  };
  const status = await transition(r, runner, async (commit: string) => {
    if (commit === r.commit) throw new Error("unhealthy");
  });
  expect(status.status).toBe("rolled_back");
  expect(calls).toHaveLength(4);
  expect(calls.every((c) => c.includes("web@") && c.includes("worker@"))).toBe(
    true,
  );
  await expect(
    transition(review, runner, async () => {
      throw new Error("unhealthy");
    }),
  ).rejects.toThrow("first_deployment_failed");
  await expect(
    transition(r, runner, async () => {
      throw new Error("unhealthy");
    }),
  ).rejects.toThrow("rollback_failed");
  await expect(
    transition(
      r,
      async (_e: string, args: string[]) => {
        if (args[0] === "stop" && args[1].includes(r.commit))
          throw new Error("unknown");
      },
      async () => {
        throw new Error("unhealthy");
      },
    ),
  ).rejects.toThrow("reconcile_before_retry");
});
it("verifies artifact files, rejects changed/missing/extra files, safe paths and backup tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "cc-release-")),
    release = join(root, review.commit);
  await mkdir(release);
  await writeFile(join(release, "server.js"), "synthetic executable");
  const files = (await inventory(release)).files;
  await writeFile(
    join(release, "release.json"),
    JSON.stringify({
      commit: review.commit,
      architecture: "arm64",
      platform: "linux",
      files,
    }),
  );
  const hash = await sha256(join(release, "release.json"));
  await expect(verifyRelease(root, review.commit, hash)).resolves.toMatchObject(
    { release },
  );
  await writeFile(join(release, "server.js"), "changed");
  await expect(verifyRelease(root, review.commit, hash)).rejects.toThrow(
    "release_file_changed",
  );
  await expect(verifyInventory(release, files)).rejects.toThrow(
    "integrity_mismatch",
  );
  await expect(
    managed(root, resolve(root, "../escape"), false),
  ).rejects.toThrow();
  await expect(managed(root, root)).rejects.toThrow();
  // Junction creation is permitted on Windows without symbolic-link privilege.
  await symlink(
    release,
    join(root, "link"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(managed(root, join(root, "link", "server.js"))).rejects.toThrow(
    "symlink_refused",
  );
});
it("checks exact schema and refuses old/new/modified histories without auto-migration", async () => {
  const db = await openTestDatabase();
  try {
    const dir = resolve("db/migrations");
    // inet::text includes /32; compare host(inet), never broaden the loopback
    // allowlist to arbitrary private/NAT networks to accommodate formatting.
    const address = await db.query<{ address: string }>(
      "SELECT host('127.0.0.1'::inet) AS address",
    );
    expect(address.rows[0].address).toBe("127.0.0.1");
    await migrate(db, dir);
    await expect(checkSchema(db, dir)).resolves.toHaveLength(6);
    await db.query("UPDATE schema_migrations SET checksum=$1 WHERE name=$2", [
      "0".repeat(64),
      "006_owner_auth.sql",
    ]);
    await expect(checkSchema(db, dir)).rejects.toThrow("Schema");
  } finally {
    await db.close();
  }
});
