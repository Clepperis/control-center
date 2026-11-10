import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  cp,
  readdir,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  encrypt,
  decrypt,
  snapshot,
  restore,
  upload,
  checkRclone,
} from "../ops/backup.mjs";
import { inventory, command, sha256 } from "../ops/lib.mjs";
const capture = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "cc-backup-test-"));
for (const name of ["runs", "encrypted", "restores", "retrieved", "knowledge"])
  await mkdir(join(root, name), { mode: 0o700 });
const { stdout: obscured } = await capture(
  "rclone",
  ["obscure", randomBytes(32).toString("hex")],
  { maxBuffer: 4096, windowsHide: true },
);
const config = join(root, "rclone.conf");
await writeFile(
  config,
  `[cc-local]\ntype = crypt\nremote = ${join(root, "encrypted")}\nfilename_encryption = standard\ndirectory_name_encryption = true\npassword = ${obscured.trim()}\n`,
  { mode: 0o600 },
);
let id = randomUUID();
if (process.env.BACKUP_TEST_POSTGRES === "true") {
  const stage = resolve(process.env.ARTIFACT_RUNTIME);
  const release = JSON.parse(
    await readFile(join(stage, "release.json"), "utf8"),
  );
  release.manifestSha256 = await sha256(join(stage, "release.json"));
  const fixtures = JSON.parse(
    await readFile(process.env.BACKUP_FIXTURE_JSON, "utf8"),
  );
  await cp(fixtures.knowledge, join(root, "knowledge"), { recursive: true });
  // Synthetic fixture has no running web/worker/editor. This substitutes only
  // systemd's quiescence observation; dump/encryption/restore use real tools.
  ({ id } = await snapshot(
    {
      root,
      knowledge: join(root, "knowledge"),
      release,
      externalWritersStopped: true,
    },
    command,
    async () => {},
  ));
  const releases = join(root, "releases");
  await mkdir(releases);
  await cp(stage, join(releases, release.commit), {
    recursive: true,
    verbatimSymlinks: true,
  });
  await encrypt(root, id, config);
  const restored = await restore(
    root,
    id,
    config,
    command,
    "encrypted",
    releases,
  );
  assert.equal(restored.status, "restore_verified");
} else {
  const runRoot = join(root, "runs", id),
    plain = join(runRoot, "plain");
  await mkdir(plain, { recursive: true, mode: 0o700 });
  await writeFile(
    join(plain, "synthetic.txt"),
    "Synthetic backup encryption round trip. No real database dump.",
  );
  await writeFile(
    join(plain, "manifest.json"),
    JSON.stringify(await inventory(plain)),
  );
  const receipt = await encrypt(root, id, config);
  assert(receipt.encrypted.bytes > 0);
  const { destination } = await decrypt(root, id, config);
  assert.equal(
    await readFile(join(destination, "synthetic.txt"), "utf8"),
    "Synthetic backup encryption round trip. No real database dump.",
  );
}
await assert.rejects(upload(root, id, config, {}), /upload_approval_required/);
await assert.rejects(encrypt(root, id, config), /backup_already_exists/);
const { stdout: wrongKey } = await capture(
  "rclone",
  ["obscure", randomBytes(32).toString("hex")],
  { maxBuffer: 4096, windowsHide: true },
);
const wrongConfig = join(root, "wrong-key.conf");
await writeFile(
  wrongConfig,
  (await readFile(config, "utf8")).replace(obscured.trim(), wrongKey.trim()),
  { mode: 0o600 },
);
await assert.rejects(decrypt(root, id, wrongConfig), /command_failed/);
await assert.rejects(
  checkRclone(config, root, true, async () => ({
    stdout: JSON.stringify({
      "cc-local": {
        type: "crypt",
        filename_encryption: "standard",
        directory_name_encryption: "true",
        remote: join(root, "encrypted"),
        password: "synthetic",
      },
      "cc-drive": {
        type: "drive",
        scope: "drive",
        client_id: "synthetic",
        client_secret: "synthetic",
        token: "synthetic",
      },
    }),
  })),
  /drive_scope_or_authorization/,
);
// Change an encrypted payload; integrity checks must stop before decryption.
async function firstFile(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) return firstFile(p);
    return p;
  }
}
const target = await firstFile(join(root, "encrypted", id));
await writeFile(target, Buffer.from("tampered ciphertext"));
await assert.rejects(decrypt(root, id, config), /integrity_mismatch/);
await assert.rejects(decrypt(root, "../escape", config), /invalid_backup_id/);
await mkdir(resolve(".local/phase-6"), { recursive: true });
await writeFile(
  resolve(".local/phase-6/backup-test.json"),
  JSON.stringify(
    {
      status: "passed",
      rclone: "1.76.0",
      databaseRestore: process.env.BACKUP_TEST_POSTGRES === "true",
      scope: "synthetic-local-only",
      evidenceRetained: true,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    status: "backup_checks_passed",
    databaseRestore: process.env.BACKUP_TEST_POSTGRES === "true",
    offHostUpload: false,
    evidenceRetained: true,
  }),
);
