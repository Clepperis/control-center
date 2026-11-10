import {
  cp,
  mkdir,
  writeFile,
  readdir,
  lstat,
  readlink,
  rm,
  readFile,
} from "node:fs/promises";
import { resolve, join, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { requireValue, sha256, command } from "../ops/lib.mjs";
import { schemaManifest } from "../dist/schema-manifest.mjs";
import { verifyRelease } from "../ops/deploy.mjs";

requireValue(
  process.platform === "linux" && process.arch === "arm64",
  "native_linux_arm64_required",
);
const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
requireValue(
  !git(["status", "--porcelain", "--untracked-files=all"]),
  "clean_checkout_required",
);
const commit = git(["rev-parse", "HEAD"]);
const directory = resolve(".local/releases", commit);
await mkdir(directory, { recursive: true, mode: 0o700 });
const stage = join(directory, "runtime");
await mkdir(stage); // exclusive: retain previous artifacts and failure evidence.
await cp(".next/standalone", stage, {
  recursive: true,
  verbatimSymlinks: true,
});
await cp(".next/static", join(stage, ".next/static"), { recursive: true });
for (const name of ["package.json", "package-lock.json"])
  await cp(name, join(stage, name));
await command(
  "npm",
  ["ci", "--omit=dev", "--ignore-scripts", "--prefix", stage],
  { timeout: 300000 },
);
await rm(join(stage, "node_modules/.bin"), { recursive: true, force: true });
await cp("dist", join(stage, "dist"), { recursive: true });
await cp("db/migrations", join(stage, "db/migrations"), { recursive: true });
await cp("ops", join(stage, "ops"), { recursive: true });
await mkdir(join(stage, "bin"));
await cp(process.execPath, join(stage, "bin/node"));
const files = {};
async function walk(dir) {
  for (const name of (await readdir(dir)).sort()) {
    const file = join(dir, name),
      rel = relative(stage, file).replaceAll("\\", "/"),
      info = await lstat(file);
    requireValue(
      !/(^|\/)(\.env[^/]*|\.git|\.local|\.data|private|audit|.*AUDIT.*\.md|.*\.log)$/i.test(
        rel,
      ),
      "private_build_input",
    );
    if (info.isSymbolicLink()) {
      const link = await readlink(file),
        target = resolve(dir, link),
        r = relative(stage, target);
      if (isAbsolute(link) || r.startsWith("..") || isAbsolute(r))
        console.error(
          JSON.stringify({ event: "artifact_link_refused", path: rel }),
        );
      requireValue(
        !isAbsolute(link) && !r.startsWith("..") && !isAbsolute(r),
        "external_artifact_link",
      );
      files[rel] = { link };
    } else if (info.isDirectory()) await walk(file);
    else {
      requireValue(info.isFile(), "special_artifact_input");
      files[rel] = { bytes: info.size, sha256: await sha256(file) };
    }
  }
}
await walk(stage);
const manifest = {
  version: 1,
  commit,
  platform: process.platform,
  architecture: process.arch,
  node: process.version,
  schema: await schemaManifest(resolve("db/migrations")),
  files,
};
await writeFile(
  join(stage, "release.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
const artifact = join(directory, `control-center-${commit}-linux-arm64.tar.gz`);
await command(
  "tar",
  [
    "--sort=name",
    `--mtime=@${git(["show", "-s", "--format=%ct", commit])}`,
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "-czf",
    artifact,
    "-C",
    stage,
    ".",
  ],
  { timeout: 300000 },
);
const identity = {
  commit,
  architecture: "arm64",
  artifact: relative(process.cwd(), artifact),
  sha256: await sha256(artifact),
  manifestSha256: createHash("sha256")
    .update(await readFile(join(stage, "release.json")))
    .digest("hex"),
};
await writeFile(
  join(directory, "artifact.json"),
  JSON.stringify(identity, null, 2) + "\n",
);
// Verify exactly the staged payload via a matching directory name without
// mutating it. The containing directory's basename is the reviewed commit.
await verifyRelease(directory, commit, identity.manifestSha256, "runtime");
console.log(JSON.stringify(identity));
