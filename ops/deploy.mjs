import {
  readFile,
  lstat,
  readdir,
  readlink,
  writeFile,
  open,
  statfs,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { requireValue, managed, sha256, json, command } from "./lib.mjs";

const sha = /^[a-f0-9]{40}$/,
  digest = /^[a-f0-9]{64}$/;
export function validateReview(
  review,
  approval,
  packageHash,
  machineHash,
  now = Date.now(),
) {
  requireValue(
    review.version === 1 &&
      sha.test(review.commit) &&
      digest.test(review.artifactSha256) &&
      digest.test(review.manifestSha256),
    "invalid_release_identity",
  );
  requireValue(
    review.targetMachineSha256 === machineHash && digest.test(machineHash),
    "wrong_target",
  );
  requireValue(
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org$/.test(
      review.hostname,
    ),
    "unreviewed_hostname",
  );
  requireValue(
    review.port === 3210 && review.dataRoot === "/var/lib/control-center",
    "unreviewed_layout",
  );
  requireValue(
    review.executionEnabled === false &&
      review.migrationsAppliedSeparately === true,
    "unreviewed_effects",
  );
  requireValue(
    Array.isArray(review.schema) &&
      review.schema.length === 6 &&
      review.schema.every(
        (s) => /^\d{3}_[a-z_]+\.sql$/.test(s.name) && digest.test(s.checksum),
      ),
    "invalid_schema_review",
  );
  requireValue(
    digest.test(review.configSha256?.web) &&
      digest.test(review.configSha256?.worker) &&
      digest.test(review.networkPlanSha256),
    "unreviewed_configuration",
  );
  requireValue(
    review.recovery?.emptyInitialDatabase === true ||
      (digest.test(review.recovery?.proofSha256) &&
        digest.test(review.recovery?.backupReceiptSha256)),
    "recovery_prerequisite_missing",
  );
  requireValue(
    review.previous === null ||
      (sha.test(review.previous.commit) &&
        digest.test(review.previous.manifestSha256) &&
        digest.test(review.previous.configSha256?.web) &&
        digest.test(review.previous.configSha256?.worker) &&
        review.previous.supportsCurrentSchema === true &&
        review.previous.passwordBoundaryVerified === true),
    "unsafe_rollback",
  );
  requireValue(
    approval.approvedBy === "owner" &&
      approval.packageSha256 === packageHash &&
      approval.action === "activate",
    "stale_approval",
  );
  const expiry = Date.parse(approval.expiresAt);
  requireValue(
    expiry > now && expiry <= now + 24 * 60 * 60 * 1000,
    "expired_approval",
  );
}
export async function verifyRelease(
  root,
  commit,
  expectedManifest,
  directory = commit,
) {
  const release = await managed(root, join(root, directory));
  requireValue(
    (await sha256(join(release, "release.json"))) === expectedManifest,
    "manifest_changed",
  );
  const manifest = await json(join(release, "release.json"), 16 * 1024 ** 2);
  requireValue(
    manifest.commit === commit &&
      manifest.architecture === "arm64" &&
      manifest.platform === "linux",
    "wrong_release_architecture",
  );
  const actual = [];
  async function walk(dir) {
    for (const name of await readdir(dir)) {
      const file = join(dir, name),
        rel = relative(release, file).replaceAll("\\", "/"),
        info = await lstat(file);
      if (info.isDirectory()) await walk(file);
      else {
        if (rel === "release.json") continue;
        actual.push(rel);
        const expected = manifest.files[rel];
        requireValue(expected, "unexpected_release_file");
        if (info.isSymbolicLink()) {
          const link = await readlink(file),
            r = relative(release, resolve(dir, link));
          requireValue(
            !isAbsolute(link) &&
              !isAbsolute(r) &&
              !r.startsWith("..") &&
              link === expected.link,
            "unsafe_release_link",
          );
        } else
          requireValue(
            info.isFile() &&
              info.size === expected.bytes &&
              (await sha256(file)) === expected.sha256,
            "release_file_changed",
          );
      }
    }
  }
  await walk(release);
  requireValue(
    actual.length === Object.keys(manifest.files).length,
    "release_file_missing",
  );
  return { release, manifest };
}
export async function verifyConfig(directory, commit, hashes, hostname) {
  const result = {};
  for (const role of ["web", "worker"]) {
    const file = await managed(
      directory,
      join(directory, commit, `${role}.env`),
    );
    const info = await lstat(file);
    requireValue(
      info.uid === 0 && (info.mode & 0o077) === 0,
      "unprotected_configuration",
    );
    requireValue(
      (await sha256(file)) === hashes[role],
      "configuration_changed",
    );
    const env = parseEnv(await readFile(file, "utf8"));
    requireValue(
      !Object.keys(env).some((k) =>
        /^(NODE_|LD_|PATH$|HOME$|PORT$|HOSTNAME$|RELEASE_COMMIT$|OPERATOR_|MIGRATION_|RCLONE_|BACKUP_|DEPLOY_)/.test(
          k,
        ),
      ),
      "privileged_runtime_configuration",
    );
    for (const flag of [
      "LIVE_MODEL_ENABLED",
      "LIVE_DELEGATION_ENABLED",
      "N8N_EXECUTION_ENABLED",
      "IMPROVEMENT_EXECUTOR_ENABLED",
    ])
      requireValue(env[flag] === "false", "execution_must_remain_disabled");
    requireValue(
      env.DATA_MODE === "live" &&
        env.KNOWLEDGE_ROOT === "/var/lib/control-center/knowledge" &&
        env.DATABASE_URL,
      "invalid_runtime_configuration",
    );
    const database = new URL(env.DATABASE_URL);
    requireValue(
      database.hostname === "127.0.0.1" &&
        database.port === "5433" &&
        database.pathname === "/control_center" &&
        database.username === `cc_${role}`,
      "unreviewed_database_target_or_role",
    );
    if (role === "web")
      requireValue(
        env.AUTH_MODE === "password" &&
          env.APP_ORIGIN === `https://${hostname}` &&
          env.AUTH_SECRET?.length >= 32 &&
          /^[A-Za-z0-9:@._-]{3,200}$/.test(env.OWNER_SUBJECT ?? "") &&
          env.OWNER_SUBJECT !== "development-owner",
        "invalid_password_boundary",
      );
    else
      requireValue(
        !env.AUTH_SECRET && !env.AUTH_MODE,
        "worker_auth_credentials",
      );
    result[role] = env;
  }
  return result;
}
export async function transition(review, runner, verify) {
  // A failure is never represented as successful deployment. If rollback fails,
  // leave both services stopped and retain all immutable releases and data.
  const units = (commit) =>
    ["web", "worker"].map((role) => `control-center-${role}@${commit}.service`);
  const run = (action, commit) =>
    runner("systemctl", [action, ...units(commit)]);
  if (review.previous) await run("stop", review.previous.commit);
  try {
    await run("start", review.commit);
    await verify(review.commit);
    return { status: "active", commit: review.commit };
  } catch {
    try {
      await run("stop", review.commit);
    } catch {
      throw new Error("partial_deployment_reconcile_before_retry");
    }
    if (review.previous) {
      try {
        await run("start", review.previous.commit);
        await verify(review.previous.commit);
      } catch {
        try {
          await run("stop", review.previous.commit);
        } catch {}
        throw new Error("rollback_failed_services_stopped");
      }
      return {
        status: "rolled_back",
        commit: review.previous.commit,
        failedCommit: review.commit,
      };
    }
    throw new Error("first_deployment_failed_services_stopped");
  }
}
async function main() {
  requireValue(
    process.argv.length === 5 && process.argv[2] === "activate",
    "usage_activate_review_approval",
  );
  requireValue(
    process.platform === "linux" &&
      process.arch === "arm64" &&
      process.getuid?.() === 0,
    "root_linux_arm64_required",
  );
  const review = await json(process.argv[3]),
    approval = await json(process.argv[4]);
  const machineHash = createHash("sha256")
    .update(await readFile("/etc/machine-id"))
    .digest("hex");
  validateReview(review, approval, await sha256(process.argv[3]), machineHash);
  const disk = await statfs("/var/lib/control-center");
  requireValue(
    disk.bavail * disk.bsize >= 5 * 1024 ** 3,
    "insufficient_disk_reserve",
  );
  // A process-local retry is not safe after ambiguity. Exclusive lock is left
  // behind on failure for manual reconciliation, not automatically removed.
  const lock = await open(
    "/var/lib/control-center/deployment.lock",
    "wx",
    0o600,
  );
  try {
    await lock.writeFile(
      JSON.stringify({
        commit: review.commit,
        startedAt: new Date().toISOString(),
      }),
    );
    const root = "/opt/control-center/releases",
      configs = "/etc/control-center/releases";
    const current = await verifyRelease(
      root,
      review.commit,
      review.manifestSha256,
    );
    requireValue(
      JSON.stringify(current.manifest.schema) === JSON.stringify(review.schema),
      "schema_review_changed",
    );
    requireValue(
      (await sha256(
        `/var/lib/control-center/incoming/${review.commit}.tar.gz`,
      )) === review.artifactSha256,
      "artifact_changed",
    );
    requireValue(
      (await sha256("/etc/control-center/network-plan.json")) ===
        review.networkPlanSha256,
      "network_plan_changed",
    );
    if (!review.recovery.emptyInitialDatabase) {
      requireValue(
        (await sha256("/var/lib/control-center/recovery-proof.json")) ===
          review.recovery.proofSha256,
        "recovery_proof_changed",
      );
      requireValue(
        (await sha256(
          "/var/lib/control-center/prechange-backup-receipt.json",
        )) === review.recovery.backupReceiptSha256,
        "backup_receipt_changed",
      );
    }
    const envs = {};
    envs[review.commit] = await verifyConfig(
      configs,
      review.commit,
      review.configSha256,
      review.hostname,
    );
    if (review.previous) {
      await verifyRelease(
        root,
        review.previous.commit,
        review.previous.manifestSha256,
      );
      envs[review.previous.commit] = await verifyConfig(
        configs,
        review.previous.commit,
        review.previous.configSha256,
        review.hostname,
      );
    }
    const run = async (commit, script, args = []) =>
      command(
        `${root}/${commit}/bin/node`,
        [`${root}/${commit}/dist/${script}.mjs`, ...args],
        {
          cwd: `${root}/${commit}`,
          env: {
            PATH: "/usr/bin:/bin",
            ...envs[commit].web,
            NODE_ENV: "production",
            RELEASE_COMMIT: commit,
          },
          timeout: 120000,
        },
      );
    // Read-only schema compatibility test before stopping the old release.
    await run(review.commit, "migrate", ["--check"]);
    const output = await transition(review, command, async (commit) => {
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          await run(commit, "readiness");
          const health = await fetch(`https://${review.hostname}/api/health`, {
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          });
          requireValue(health.ok, "https_health_failed");
          return;
        } catch {
          if (attempt === 11) throw new Error("health_failed");
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    });
    await writeFile(
      "/var/lib/control-center/deployment-result.json",
      JSON.stringify({
        ...output,
        packageSha256: approval.packageSha256,
        observedAt: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(output));
    if (output.status !== "active") process.exitCode = 1;
    // Operator must inspect result, verify actual units, then remove the lock.
  } finally {
    await lock.close();
  }
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  main().catch(() => {
    console.error(
      JSON.stringify({
        status: "deployment_failed",
        action: "reconcile_units_health_and_lock_before_retry",
      }),
    );
    process.exitCode = 1;
  });
