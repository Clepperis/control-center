import { build } from "esbuild";
await build({
  entryPoints: [
    "worker",
    "migrate",
    "owner-password",
    "knowledge-index",
    "readiness",
    "restore-check",
  ].map((name) => `scripts/${name}.ts`),
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  sourcemap: false,
});
await build({
  entryPoints: ["src/server/db/schema.ts"],
  outfile: "dist/schema-manifest.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
});
