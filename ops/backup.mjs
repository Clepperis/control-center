import {
  mkdir,
  cp,
  writeFile,
  lstat,
  statfs,
  readdir,
  open,
} from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  managed,
  inventory,
  verifyInventory,
  requireValue,
  json,
  command,
  sha256,
} from "./lib.mjs";
import { verifyRelease } from "./deploy.mjs";
const capture = promisify(execFile);
export const backupId =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export async function checkRclone(
  config,
  root,
  requireDrive = false,
  run = capture,
) {
  requireValue((await lstat(config)).isFile(), "rclone_configuration_missing");
  if (process.platform !== "win32")
    requireValue(
      ((await lstat(config)).mode & 0o077) === 0,
      "unprotected_rclone_config",
    );
  requireValue(
    !Object.keys(process.env).some(
      (k) => k.startsWith("RCLONE_") && k !== "RCLONE_CONFIG_PASS",
    ),
    "rclone_environment_override",
  );
  // Capture sensitive configuration in memory only, never stdout/log files.
  const { stdout } = await run(
    "rclone",
    ["config", "dump", "--config", config],
    { maxBuffer: 256 * 1024, timeout: 10000, windowsHide: true },
  );
  const remotes = JSON.parse(stdout);
  const local = remotes["cc-local"],
    drive = remotes["cc-drive"];
  requireValue(
    local?.type === "crypt" &&
      local.filename_encryption === "standard" &&
      local.directory_name_encryption === "true" &&
      isAbsolute(local.remote) &&
      resolve(local.remote) === join(root, "encrypted") &&
      local.password,
    "local_encryption_configuration",
  );
  if (requireDrive)
    requireValue(
      drive?.type === "drive" &&
        drive.scope === "drive.file" &&
        drive.client_id &&
        drive.client_secret &&
        drive.token,
      "drive_scope_or_authorization",
    );
  return remotes;
}
function environment(service) {
  requireValue(
    !Object.keys(process.env).some((k) =>
      /^PG(HOST|HOSTADDR|PORT|DATABASE|USER|PASSWORD|OPTIONS|SERVICE)$/.test(k),
    ),
    "ambiguous_pg_environment",
  );
  requireValue(
    process.env.PGSERVICEFILE && process.env.PGPASSFILE,
    "protected_pg_service_files_required",
  );
  return { ...process.env, PGSERVICE: service };
}
async function stopped(commit) {
  requireValue(/^[a-f0-9]{40}$/.test(commit), "invalid_release");
  for (const role of ["web", "worker"]) {
    const { stdout } = await capture(
      "systemctl",
      [
        "show",
        `control-center-${role}@${commit}.service`,
        "--property=ActiveState",
        "--value",
      ],
      { timeout: 5000, maxBuffer: 1024 },
    );
    requireValue(
      ["inactive", "failed"].includes(stdout.trim()),
      "writers_must_be_stopped",
    );
  }
}
export async function snapshot(options, run = command, checkStopped = stopped) {
  const { root, knowledge, release, externalWritersStopped } = options;
  requireValue(
    externalWritersStopped === true,
    "external_writers_not_quiesced",
  );
  requireValue(
    /^[a-f0-9]{40}$/.test(release.commit) &&
      /^[a-f0-9]{64}$/.test(release.manifestSha256) &&
      Array.isArray(release.schema),
    "reviewed_release_metadata_required",
  );
  await managed(root, join(root, "runs"), true);
  await managed(root, knowledge, true);
  const free = await statfs(root);
  requireValue(free.bavail * free.bsize >= 5 * 1024 ** 3, "insufficient_disk");
  await checkStopped(release.commit);
  const id = randomUUID(),
    runRoot = await managed(root, join(root, "runs", id), false),
    plain = join(runRoot, "plain");
  await mkdir(runRoot, { mode: 0o700 });
  await mkdir(plain, { mode: 0o700 });
  const before = await inventory(knowledge, 2 * 1024 ** 3);
  const env = environment("cc-backup");
  await run(
    "pg_dump",
    [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--file",
      join(plain, "database.dump"),
    ],
    { env, timeout: 300000 },
  );
  await cp(knowledge, join(plain, "knowledge"), {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  await verifyInventory(knowledge, before.files);
  await verifyInventory(join(plain, "knowledge"), before.files);
  await checkStopped(release.commit);
  const metadata = {
    version: 1,
    id,
    createdAt: new Date().toISOString(),
    release: {
      commit: release.commit,
      manifestSha256: release.manifestSha256,
      schema: release.schema,
      architecture: release.architecture,
      node: release.node,
    },
    consistent: "web_worker_and_external_writers_quiesced",
    schema: release.schema,
  };
  await writeFile(
    join(plain, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    { mode: 0o600 },
  );
  const manifest = await inventory(plain, 4 * 1024 ** 3);
  await writeFile(
    join(runRoot, "plaintext-manifest.json"),
    JSON.stringify(manifest),
    { mode: 0o600 },
  );
  // Manifest is encrypted with the payload. Never publish plaintext metadata.
  await cp(
    join(runRoot, "plaintext-manifest.json"),
    join(plain, "manifest.json"),
  );
  return { id, runRoot, plain };
}
export async function encrypt(root, id, config, run = command) {
  requireValue(backupId.test(id), "invalid_backup_id");
  const runRoot = await managed(root, join(root, "runs", id));
  const plain = await managed(root, join(runRoot, "plain"));
  await checkRclone(config, root);
  requireValue(
    !(await readdir(join(root, "encrypted"))).includes(id),
    "backup_already_exists",
  );
  const common = [
    "--config",
    config,
    "--retries",
    "1",
    "--low-level-retries",
    "1",
    "--contimeout",
    "10s",
    "--timeout",
    "60s",
  ];
  await run(
    "rclone",
    [
      "copy",
      plain,
      "cc-local:",
      "--crypt-remote",
      join(root, "encrypted", id),
      "--immutable",
      ...common,
    ],
    { timeout: 300000 },
  );
  await run(
    "rclone",
    [
      "cryptcheck",
      plain,
      "cc-local:",
      "--crypt-remote",
      join(root, "encrypted", id),
      ...common,
    ],
    { timeout: 300000 },
  );
  const encrypted = await managed(root, join(root, "encrypted", id));
  const files = await inventory(encrypted, 4 * 1024 ** 3);
  const receipt = {
    version: 1,
    id,
    encrypted: files,
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    join(runRoot, "encrypted-receipt.json"),
    JSON.stringify(receipt),
    { mode: 0o600 },
  );
  return receipt;
}
export async function upload(root, id, config, approval, run = command) {
  requireValue(backupId.test(id), "invalid_backup_id");
  const runRoot = await managed(root, join(root, "runs", id));
  const receiptFile = join(runRoot, "encrypted-receipt.json");
  requireValue(
    approval.approvedBy === "owner" &&
      approval.action === "upload-one-backup" &&
      approval.id === id &&
      approval.receiptSha256 === (await sha256(receiptFile)) &&
      approval.rcloneConfigSha256 === (await sha256(config)) &&
      approval.destination ===
        `cc-drive:control-center-encrypted-backups/${id}` &&
      Date.parse(approval.expiresAt) > Date.now() &&
      Date.parse(approval.expiresAt) <= Date.now() + 24 * 60 * 60 * 1000,
    "upload_approval_required",
  );
  await checkRclone(config, root, true);
  const receipt = await json(receiptFile);
  const source = await managed(root, join(root, "encrypted", id));
  await verifyInventory(source, receipt.encrypted.files);
  const commonCapture = {
    maxBuffer: 256 * 1024,
    timeout: 20000,
    windowsHide: true,
  };
  const quota = JSON.parse(
    (
      await capture(
        "rclone",
        ["about", "cc-drive:", "--json", "--config", config],
        commonCapture,
      )
    ).stdout,
  );
  requireValue(
    Number.isFinite(quota.free) && quota.free >= receipt.encrypted.bytes,
    "drive_capacity_unverified_or_insufficient",
  );
  const rootDirs = (
    await capture(
      "rclone",
      [
        "lsf",
        "cc-drive:",
        "--dirs-only",
        "--max-depth",
        "1",
        "--config",
        config,
      ],
      commonCapture,
    )
  ).stdout.split("\n");
  let storedBytes = 0,
    versions = 0;
  if (rootDirs.includes("control-center-encrypted-backups/")) {
    const remote = "cc-drive:control-center-encrypted-backups";
    const size = JSON.parse(
      (
        await capture(
          "rclone",
          ["size", remote, "--json", "--config", config],
          commonCapture,
        )
      ).stdout,
    );
    const dirs = JSON.parse(
      (
        await capture(
          "rclone",
          [
            "lsjson",
            remote,
            "--dirs-only",
            "--max-depth",
            "1",
            "--config",
            config,
          ],
          commonCapture,
        )
      ).stdout,
    );
    storedBytes = size.bytes;
    versions = dirs.length;
    requireValue(
      !dirs.some((d) => d.Name === id),
      "remote_version_exists_reconcile_before_retry",
    );
  }
  requireValue(
    versions < 30 && storedBytes + receipt.encrypted.bytes <= 20 * 1024 ** 3,
    "retention_or_storage_limit_manual_review_required",
  );
  const attempt = await open(join(runRoot, "upload-attempt.json"), "wx", 0o600);
  await attempt.writeFile(
    JSON.stringify({
      id,
      startedAt: new Date().toISOString(),
      receiptSha256: approval.receiptSha256,
    }),
  );
  await attempt.close();
  const common = [
    "--config",
    config,
    "--retries",
    "1",
    "--low-level-retries",
    "1",
    "--contimeout",
    "10s",
    "--timeout",
    "60s",
  ];
  // Fixed dedicated path, unique version. No sync, remote deletion or schedule.
  const destination = `cc-drive:control-center-encrypted-backups/${id}`;
  await run("rclone", ["copy", source, destination, "--immutable", ...common], {
    timeout: 300000,
  });
  await run("rclone", ["check", source, destination, "--one-way", ...common], {
    timeout: 300000,
  });
  return {
    status: "uploaded_and_ciphertext_checked",
    id,
    restoreVerified: false,
  };
}
export async function retrieve(root, id, config, run = command) {
  requireValue(backupId.test(id), "invalid_backup_id");
  await checkRclone(config, root, true);
  const receipt = await json(
    await managed(root, join(root, "runs", id, "encrypted-receipt.json")),
  );
  const destination = await managed(root, join(root, "retrieved", id), false);
  await mkdir(destination, { mode: 0o700 });
  await run(
    "rclone",
    [
      "copy",
      `cc-drive:control-center-encrypted-backups/${id}`,
      destination,
      "--immutable",
      "--config",
      config,
      "--retries",
      "1",
      "--low-level-retries",
      "1",
    ],
    { timeout: 300000 },
  );
  await verifyInventory(destination, receipt.encrypted.files);
  return { status: "retrieved_and_verified", id };
}
export async function decrypt(
  root,
  id,
  config,
  run = command,
  source = "encrypted",
) {
  requireValue(backupId.test(id), "invalid_backup_id");
  const runRoot = await managed(root, join(root, "runs", id));
  await checkRclone(config, root);
  const receipt = await json(join(runRoot, "encrypted-receipt.json"));
  requireValue(
    ["encrypted", "retrieved"].includes(source),
    "invalid_ciphertext_source",
  );
  const encrypted = await managed(root, join(root, source, id));
  await verifyInventory(encrypted, receipt.encrypted.files);
  const destination = await managed(
    root,
    join(root, "restores", randomUUID()),
    false,
  );
  await mkdir(destination, { mode: 0o700 });
  await run(
    "rclone",
    [
      "copy",
      "cc-local:",
      destination,
      "--crypt-remote",
      encrypted,
      "--crypt-strict-names",
      "--immutable",
      "--config",
      config,
      "--retries",
      "1",
      "--low-level-retries",
      "1",
    ],
    { timeout: 300000 },
  );
  const manifest = await json(join(destination, "manifest.json"));
  const restored = await inventory(destination, 4 * 1024 ** 3);
  delete restored.files["manifest.json"];
  requireValue(
    JSON.stringify(restored.files) === JSON.stringify(manifest.files),
    "decrypted_integrity_mismatch",
  );
  return { destination, runRoot };
}
export async function restore(
  root,
  id,
  config,
  run = command,
  source = "encrypted",
  releaseRoot = "/opt/control-center/releases",
) {
  const { destination, runRoot } = await decrypt(root, id, config, run, source);
  const dbName = `cc_restore_${randomUUID().replaceAll("-", "")}`;
  const restoreUrl = new URL(process.env.RESTORE_DATABASE_URL ?? "");
  requireValue(
    ["127.0.0.1", "localhost", "[::1]"].includes(restoreUrl.hostname),
    "restore_application_url_must_be_loopback",
  );
  restoreUrl.pathname = "/" + dbName;
  const env = environment("cc-restore");
  // A dedicated cc-restore service must be loopback-only. Confirm the effective
  // server address BEFORE creating anything; service names alone are not proof.
  const effective = await capture(
    "psql",
    [
      "-X",
      "-At",
      "--command",
      "SELECT coalesce(host(inet_server_addr()),'local')",
    ],
    { env, maxBuffer: 1024, timeout: 10000 },
  );
  requireValue(
    ["127.0.0.1", "::1", "local"].includes(effective.stdout.trim()),
    "restore_server_must_be_loopback",
  );
  await run("createdb", [dbName], { env, timeout: 15000 });
  await run(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--dbname",
      dbName,
      join(destination, "database.dump"),
    ],
    { env, timeout: 300000 },
  );
  const metadata = await json(join(destination, "metadata.json"));
  await verifyRelease(
    releaseRoot,
    metadata.release.commit,
    metadata.release.manifestSha256,
  );
  const release = await managed(
    releaseRoot,
    join(releaseRoot, metadata.release.commit),
  );
  await run(
    join(release, "bin/node"),
    [join(release, "dist/restore-check.mjs")],
    {
      cwd: release,
      env: {
        ...env,
        DATABASE_URL: restoreUrl.href,
        KNOWLEDGE_ROOT: join(destination, "knowledge"),
      },
      timeout: 120000,
    },
  );
  // Evidence is retained on success or failure, including the disposable DB.
  const output = {
    status: "restore_verified",
    id,
    disposableDatabase: dbName,
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    join(runRoot, `restore-${dbName}.json`),
    JSON.stringify(output),
    { mode: 0o600 },
  );
  return output;
}
async function main() {
  const [action, configFile, id, approvalFile] = process.argv.slice(2);
  const options = await json(configFile);
  const { root, rcloneConfig } = options;
  requireValue(
    root === "/var/lib/control-center",
    "fixed_managed_root_required",
  );
  if (action === "snapshot")
    console.log(JSON.stringify(await snapshot(options)));
  else if (action === "encrypt")
    console.log(JSON.stringify(await encrypt(root, id, rcloneConfig)));
  else if (action === "upload")
    console.log(
      JSON.stringify(
        await upload(root, id, rcloneConfig, await json(approvalFile)),
      ),
    );
  else if (action === "retrieve")
    console.log(JSON.stringify(await retrieve(root, id, rcloneConfig)));
  else if (action === "restore")
    console.log(
      JSON.stringify(
        await restore(
          root,
          id,
          rcloneConfig,
          command,
          options.restoreSource ?? "encrypted",
        ),
      ),
    );
  else throw new Error("unknown_backup_action");
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  main().catch(() => {
    console.error(
      JSON.stringify({
        status: "backup_operation_failed",
        action: "retain_evidence_and_reconcile_before_retry",
      }),
    );
    process.exitCode = 1;
  });
