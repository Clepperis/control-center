import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  realpath,
  open,
  link,
  unlink,
  rename,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError } from "../orchestration/store";
import { hash, validateText } from "./text";

export const headerSchema = z
  .object({
    id: z.uuid(),
    projectId: z.uuid().nullable(),
    title: z.string().min(1).max(160),
    contentType: z.enum(["text/markdown", "text/plain"]),
    kind: z.enum(["document", "preference", "decision", "constraint"]),
    provenance: z.record(z.string(), z.unknown()),
    archived: z.boolean(),
    supersededBy: z.uuid().nullable(),
  })
  .strict();
export type Header = z.infer<typeof headerSchema>;
export function serialize(meta: Header, body: string) {
  validateText(body);
  return `---\ncc: ${JSON.stringify(headerSchema.parse(meta))}\n---\n${body}`;
}
export function parse(raw: string) {
  const match = /^---\r?\ncc: ([^\r\n]+)\r?\n---\r?\n/.exec(raw);
  if (!match) throw new DomainError(409, "metadata_conflict");
  try {
    const meta = headerSchema.parse(JSON.parse(match[1]));
    const body = raw.slice(match[0].length);
    validateText(body);
    return { meta, body, raw, hash: hash(raw) };
  } catch {
    throw new DomainError(409, "metadata_conflict");
  }
}
export function within(root: string, target: string) {
  const relative = path.relative(root, target);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
export function importName(name: string) {
  const parts = name.replaceAll("\\", "/").split("/");
  if (
    parts.some((p) => !p || p.startsWith(".") || /[:\x00-\x1f]/.test(p)) ||
    path.isAbsolute(name) ||
    name.length > 240
  )
    throw new DomainError(400, "path_boundary");
  return parts.join("/");
}
export class MarkdownFiles {
  constructor(
    public root: string,
    private repository = process.cwd(),
  ) {}
  async ready() {
    if (!this.root || !path.isAbsolute(this.root))
      throw new DomainError(503, "knowledge_configuration");
    const root = path.resolve(this.root),
      repo = await realpath(this.repository);
    if (
      within(repo, root) ||
      within(root, repo) ||
      path.parse(root).root === root
    )
      throw new DomainError(503, "knowledge_configuration");
    // Reject junctions/symlinks at every existing ancestor, including root itself.
    await this.noLinks(root);
    await mkdir(root, { recursive: true, mode: 0o700 });
    if ((await realpath(root)) !== root)
      throw new DomainError(400, "path_boundary");
    for (const name of ["documents", "history", "conflicts"]) {
      // Runtime private volume, never a build-time asset to trace or bundle.
      const target = path.join(/* turbopackIgnore: true */ root, name);
      await this.noLinks(target);
      await mkdir(target, { mode: 0o700, recursive: true });
    }
  }
  private async noLinks(target: string) {
    let current = path.parse(target).root;
    for (const part of target
      .slice(current.length)
      .split(path.sep)
      .filter(Boolean)) {
      current = path.join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new DomainError(400, "path_boundary");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
  }
  async safe(relative: string) {
    if (
      !relative ||
      relative.includes("\\") ||
      relative
        .split("/")
        .some((p) => !p || p.startsWith(".") || p.includes(":"))
    )
      throw new DomainError(400, "path_boundary");
    const target = path.resolve(this.root, relative);
    if (!within(this.root, target)) throw new DomainError(400, "path_boundary");
    await this.noLinks(target);
    return target;
  }
  async read(relative: string) {
    const target = await this.safe(relative);
    let file;
    try {
      file = await open(
        target,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      );
      const stat = await file.stat();
      if (!stat.isFile() || stat.size > 30000 || stat.nlink > 1)
        throw new DomainError(400, "file_unavailable");
      // Recheck parent resolution before consuming any bytes.
      if (!within(this.root, await realpath(target)))
        throw new DomainError(400, "path_boundary");
      return await file.readFile("utf8");
    } catch (e) {
      if (e instanceof DomainError) throw e;
      throw new DomainError(409, "file_unavailable");
    } finally {
      await file?.close();
    }
  }
  documentPath(id: string, title: string) {
    z.uuid().parse(id);
    const slug =
      title
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9-]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "document";
    return `documents/${id}/${slug}.md`;
  }
  async prepareDirectory(relative: string) {
    const target = await this.safe(relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await this.safe(relative);
    return target;
  }
  async exclusive(relative: string, raw: string) {
    const target = await this.prepareDirectory(relative);
    const file = await open(target, "wx", 0o600);
    try {
      await file.writeFile(raw, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
  }
  async snapshot(id: string, revision: number, raw: string) {
    const relative = `history/${z.uuid().parse(id)}/${revision}-${hash(raw)}.md`;
    try {
      await this.exclusive(relative, raw);
    } catch (e) {
      if (
        (e as NodeJS.ErrnoException).code !== "EEXIST" ||
        (await this.read(relative)) !== raw
      )
        throw e;
    }
    return relative;
  }
  async conflict(raw: string) {
    const name = `conflicts/${randomUUID()}.md`;
    await this.exclusive(name, raw);
    return name;
  }
  async write(
    relative: string,
    raw: string,
    expected: string | null,
    oldRelative = relative,
  ) {
    const target = await this.prepareDirectory(relative);
    const temporary = `conflicts/${randomUUID()}.md`;
    await this.exclusive(temporary, raw);
    const temp = await this.safe(temporary);
    let backup: string | undefined;
    if (expected !== null) {
      const old = await this.safe(oldRelative);
      // Preserve the actual file removed from the destination, not only a
      // previously read copy. An editor racing this operation cannot be lost.
      backup = `conflicts/${randomUUID()}.md`;
      try {
        await rename(old, await this.safe(backup));
      } catch {
        throw new DomainError(409, "revision_conflict");
      }
      const moved = await this.read(backup);
      if (hash(moved) !== expected) {
        try {
          await link(await this.safe(backup), old);
          await unlink(await this.safe(backup));
        } catch {
          /* Both files retained for review. */
        }
        throw new DomainError(409, "revision_conflict");
      }
    }
    try {
      await this.safe(relative);
      // Hard-link publication is atomic and exclusive: never replaces a file an
      // external editor created during the brief move/install interval.
      await link(temp, target);
      await unlink(temp);
    } catch {
      if (backup) {
        try {
          await link(await this.safe(backup), await this.safe(oldRelative));
          await unlink(await this.safe(backup));
        } catch {
          /* Retain recovery copy. */
        }
      }
      throw new DomainError(409, "revision_conflict");
    }
    if (backup) await unlink(await this.safe(backup));
  }
  async findRenamed(id: string) {
    const folder = await this.safe(`documents/${z.uuid().parse(id)}`);
    const entries = await readdir(folder, { withFileTypes: true });
    if (entries.length > 5) throw new DomainError(409, "metadata_conflict");
    const matches: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) throw new DomainError(400, "path_boundary");
      if (
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        entry.name.endsWith(".md")
      ) {
        const relative = `documents/${id}/${entry.name}`;
        if (parse(await this.read(relative)).meta.id === id)
          matches.push(relative);
      }
    }
    if (matches.length !== 1) throw new DomainError(409, "file_unavailable");
    return matches[0];
  }
}
