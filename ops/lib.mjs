import { lstat, realpath, readdir, readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute, sep, join, parse } from "node:path";
import { spawn } from "node:child_process";
export function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
export async function sha256(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}
export async function managed(root, target, existing = true) {
  requireValue(
    isAbsolute(root) && isAbsolute(target) && parse(root).root !== root,
    "absolute_managed_root_required",
  );
  root = resolve(root);
  target = resolve(target);
  const rel = relative(root, target);
  requireValue(
    rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep),
    "path_outside_managed_root",
  );
  let part = parse(target).root;
  for (const segment of target.slice(part.length).split(sep)) {
    part = join(part, segment);
    try {
      requireValue(!(await lstat(part)).isSymbolicLink(), "symlink_refused");
    } catch (e) {
      if (e.code !== "ENOENT" || existing) throw e;
    }
  }
  if (existing)
    requireValue(
      (await realpath(target)) === target,
      "path_resolution_changed",
    );
  return target;
}
export async function inventory(root, maxBytes = 4 * 1024 ** 3) {
  const items = {};
  let bytes = 0;
  async function walk(directory) {
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const file = join(directory, entry.name),
        name = relative(root, file).split(sep).join("/");
      requireValue(!entry.isSymbolicLink(), "symlink_refused");
      if (entry.isDirectory()) await walk(file);
      else {
        const info = await lstat(file);
        requireValue(info.isFile() && info.nlink === 1, "special_file_refused");
        bytes += info.size;
        requireValue(bytes <= maxBytes, "storage_limit");
        items[name] = { bytes: info.size, sha256: await sha256(file) };
      }
    }
  }
  await walk(root);
  return { files: items, bytes };
}
export async function verifyInventory(root, expected) {
  requireValue(
    JSON.stringify((await inventory(root)).files) === JSON.stringify(expected),
    "integrity_mismatch",
  );
}
export async function json(file, max = 2 * 1024 ** 2) {
  requireValue((await lstat(file)).size <= max, "metadata_size");
  return JSON.parse(await readFile(file, "utf8"));
}
export function command(executable, args, options = {}) {
  // No shell. No credentials in arguments. Child output may contain private
  // document names, connection strings, SQL or tokens and is not echoed.
  return new Promise((resolvePromise, reject) => {
    const { timeout = 120000, ...spawnOptions } = options;
    let expired = false;
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: "ignore",
      ...spawnOptions,
    });
    const timer = setTimeout(() => {
      expired = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5000).unref();
    }, timeout);
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("command_unavailable"));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && !expired) resolvePromise();
      else reject(new Error(expired ? "command_timeout" : "command_failed"));
    });
  });
}
