import { beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  mkdtemp,
  rm,
  readFile,
  writeFile,
  rename,
  unlink,
  symlink,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { openTestDatabase } from "./pglite";
import { migrate } from "../src/server/db/migrate";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles, parse, serialize } from "../src/server/knowledge/files";
import { chunks, searchQuery } from "../src/server/knowledge/text";
import { SafeMarkdown } from "../src/components/safe-markdown";
import { OrchestrationService } from "../src/server/orchestration/service";
import { Store } from "../src/server/orchestration/store";
import type { Database } from "../src/server/db/types";
import type { PlanningGateway } from "../src/integrations/nexos";
import type { DelegationAdapter } from "../src/integrations/paperclip";
import type { Grounding } from "../src/domain/knowledge";

let db: Database, s: KnowledgeService, root: string, a: string, b: string;
const owner = "fictional-owner";
const fixture = (name: string) =>
  readFile(resolve(`tests/fixtures/knowledge/${name}.md`), "utf8");
const scope = () => ({ projectId: a, includeGlobal: false });
async function doc(name = "atlas", projectId: string | null = a) {
  return s.create(owner, { projectId, title: name, body: await fixture(name) });
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cc-fictional-knowledge-"));
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
  s = new KnowledgeService(db, new MarkdownFiles(root));
  a = (await s.createProject(owner, "Atlas")).id;
  b = (await s.createProject(owner, "Harbor")).id;
});
afterEach(async () => {
  await db.close();
  await rm(root, { recursive: true, force: true });
});
describe("private authoritative Markdown and rebuildable PostgreSQL search", () => {
  it("retains files, revisions, queued index work and reviewed memory across database close/reopen", async () => {
    await db.close();
    const directory = join(root, "postgres-test");
    db = await openTestDatabase(directory);
    await migrate(db, resolve("db/migrations"));
    s = new KnowledgeService(db, new MarkdownFiles(root));
    a = (await s.createProject(owner, "Durable Atlas")).id;
    const d = await doc();
    const proposal = await s.propose(owner, {
      projectId: a,
      kind: "constraint",
      statement: "Atlas uses Markdown.",
      source: { type: "document", id: d.id, revision: 1 },
    });
    await db.close();
    db = await openTestDatabase(directory);
    s = new KnowledgeService(db, new MarkdownFiles(root));
    expect((await s.read(owner, d.id)).body).toContain("ATLAS-42");
    expect((await s.proposals(owner))[0].state).toBe("pending");
    const accepted = await s.confirmMemory(
      owner,
      proposal.proposal.id,
      proposal.proposal.reviewHash,
      false,
    );
    await s.tick();
    await db.close();
    db = await openTestDatabase(directory);
    s = new KnowledgeService(db, new MarkdownFiles(root));
    expect((await s.owned(owner, accepted.documentId!)).indexStatus).toBe(
      "indexed",
    );
    expect((await s.search(owner, scope(), "Markdown")).length).toBeGreaterThan(
      0,
    );
    expect((await s.revision(owner, d.id, 1)).body).toContain("ATLAS-42");
  });
  it("verifies available language/extension capabilities and measures the synthetic LT/EN lexical baseline", async () => {
    const capabilities = (
      await db.query("SELECT cfgname FROM pg_ts_config ORDER BY cfgname")
    ).rows.map((r) => r.cfgname);
    expect(capabilities).toContain("simple");
    const ext = (
      await db.query(
        "SELECT name FROM pg_available_extensions WHERE name IN ('vector','pg_trgm')",
      )
    ).rows;
    await doc();
    await doc("harbor", b);
    await doc("global", null);
    await s.tick();
    const matrix = [
      ["Aušros", true],
      ["Silver Otter", true],
      ["ATLAS-42", true],
      ["archyvavimo", true],
      ["archyvavimas", true],
      ["Markdown", true],
      ["offline export", true],
      ["Copper Finch", false],
      ["keep notes without the internet", false],
      ["dokumentuose", true],
    ] as const;
    const measured = [];
    for (const [q, hit] of matrix) {
      const results = await s.search(owner, scope(), q);
      expect(results.length > 0, q).toBe(hit);
      expect(results.every((p) => p.projectId === a)).toBe(true);
      measured.push({ query: q, hits: results.length });
    }
    // A natural question rarely repeats every word of the source. Three of four
    // terms is enough; two of four (an unrelated project's name plus generic
    // words) is not.
    const question = await s.search(
      owner,
      scope(),
      "What is the Atlas release codename for the archive?",
    );
    expect(question[0]?.content).toContain("Silver Otter");
    expect(
      await s.search(owner, scope(), "Copper Finch release codename"),
    ).toHaveLength(0);
    expect(await s.search(owner, scope(), "lietuviški")).toHaveLength(0);
    expect(
      await s.search(owner, { ...scope(), includeGlobal: true }, "lietuviški"),
    ).toHaveLength(1);
    expect(
      await s.search(
        "other-owner",
        { projectId: null, includeGlobal: true },
        "lietuviški",
      ),
    ).toHaveLength(0);
    await expect(
      s.search("other-owner", scope(), "Markdown"),
    ).rejects.toMatchObject({ code: "not_found" });
    console.log(
      JSON.stringify({
        event: "synthetic_lexical_baseline",
        languageConfigurations: capabilities,
        optionalExtensions: ext,
        measured,
        semanticParaphraseSupported: false,
      }),
    );
  });
  it("preserves identity on rename and detects concurrent UI/external edits without overwriting either", async () => {
    let d = await doc();
    const first = await s.read(owner, d.id);
    d = await s.update(owner, d.id, {
      hash: d.hash,
      title: "Naujas pavadinimas",
      body: first.body,
    });
    expect(d.id).toBe(first.document.id);
    expect(d.path).not.toBe(first.document.path);
    const base = await s.read(owner, d.id);
    const external = serialize(
      parse(await s.files.read(d.path)).meta,
      "External newer edit",
    );
    await writeFile(join(root, d.path), external);
    await expect(
      s.update(owner, d.id, { hash: base.hash, body: "UI version" }),
    ).rejects.toMatchObject({ code: "revision_conflict" });
    expect(await s.files.read(d.path)).toBe(external);
    expect((await readdir(join(root, "conflicts"))).length).toBeGreaterThan(0);
    const recovered = await s.read(owner, d.id);
    expect(recovered.body).toBe("External newer edit");
    expect(recovered.document.revision).toBe(3);
    const updates = await Promise.allSettled([
      s.update(owner, d.id, { hash: recovered.hash, body: "one" }),
      s.update(owner, d.id, { hash: recovered.hash, body: "two" }),
    ]);
    expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const renamed = `documents/${d.id}/external-name.md`;
    await rename(join(root, d.path), join(root, renamed));
    expect((await s.read(owner, d.id)).document.path).toBe(renamed);
  });
  it("keeps generations honest, indexes only changes, removes deleted/stale passages, retries and rebuilds", async () => {
    let d = await doc();
    expect(await s.search(owner, scope(), "ATLAS-42")).toHaveLength(0);
    await s.tick();
    const before = await s.owned(owner, d.id);
    await s.tick();
    expect((await s.owned(owner, d.id)).revision).toBe(before.revision);
    expect((await s.owned(owner, d.id)).indexedAt).toBe(before.indexedAt);
    const p = parse(await s.files.read(d.path));
    await writeFile(
      join(root, d.path),
      serialize(p.meta, "# New\nOnly NEW-ID remains."),
    );
    expect(await s.search(owner, scope(), "ATLAS-42")).toHaveLength(0);
    expect((await s.owned(owner, d.id)).indexStatus).toBe("stale");
    await s.tick();
    expect(await s.search(owner, scope(), "NEW-ID")).toHaveLength(1);
    await s.rebuild(owner);
    expect(await s.search(owner, scope(), "NEW-ID")).toHaveLength(0);
    await s.tick();
    expect(await s.search(owner, scope(), "NEW-ID")).toHaveLength(1);
    d = await s.owned(owner, d.id);
    await s.update(owner, d.id, { hash: d.hash, archived: true });
    expect(await s.search(owner, scope(), "NEW-ID")).toHaveLength(0);
    await s.tick();
    expect(
      (
        await db.query("SELECT * FROM knowledge_chunks WHERE document_id=$1", [
          d.id,
        ])
      ).rows,
    ).toHaveLength(0);
    d = await s.owned(owner, d.id);
    await s.update(owner, d.id, { hash: d.hash, archived: false });
    await s.tick();
    await unlink(join(root, d.path));
    expect(await s.search(owner, scope(), "NEW-ID")).toHaveLength(0);
    expect((await s.owned(owner, d.id)).indexStatus).toBe("failed");
    await writeFile(join(root, d.path), (await s.revision(owner, d.id, 4)).raw);
    await s.retry(owner, d.id);
    await s.tick();
    expect((await s.owned(owner, d.id)).indexStatus).toBe("indexed");
  });
  it("previews only selected Markdown/text, rejects unsafe paths, and deduplicates overlapping imports", async () => {
    const input = [
      { name: "notes/one.md", content: "# Same\nSelected synthetic content" },
      { name: ".obsidian/config.json", content: "" },
      { name: "../escape.md", content: "" },
      { name: "image.png", content: "" },
      { name: "notes/two.md", content: "# Same\nSelected synthetic content" },
    ];
    const p = await s.previewImport(owner, a, input);
    expect(p.entries.filter((e) => e.excluded)).toHaveLength(4);
    expect((await s.list(owner, scope())).length).toBe(0);
    const second = await s.previewImport(owner, a, [input[0]]);
    await s.confirmImport(owner, p.id, p.digest);
    await s.confirmImport(owner, p.id, p.digest);
    await s.confirmImport(owner, second.id, second.digest);
    expect(await s.list(owner, scope())).toHaveLength(1);
    const duplicate = await s.previewImport(owner, a, [input[0]]);
    expect(duplicate.entries[0].duplicate).toBeTruthy();
    const changed = await s.previewImport(owner, a, [
      { ...input[0], content: "Different same filename" },
    ]);
    expect(changed.entries[0].duplicate).toBeNull();
    await s.confirmImport(owner, changed.id, changed.digest);
    expect(await s.list(owner, scope())).toHaveLength(2);
    await expect(
      s.confirmImport("intruder", p.id, p.digest),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      s.previewImport(owner, a, [
        { name: "huge.md", content: "x".repeat(24001) },
      ]),
    ).rejects.toMatchObject({ code: "import_limit" });
  });
  it("blocks traversal, symlink/junction escape, broad roots and storage inside the public repo", async () => {
    const invalid = new MarkdownFiles(resolve("private-vault"));
    await expect(invalid.ready()).rejects.toMatchObject({
      code: "knowledge_configuration",
    });
    await s.files.ready();
    await expect(s.files.read("../README.md")).rejects.toMatchObject({
      code: "path_boundary",
    });
    const outside = await mkdtemp(join(tmpdir(), "cc-synthetic-outside-"));
    try {
      await writeFile(join(outside, "secret.md"), "must never be consumed");
      await symlink(outside, join(root, "documents", "escape"), "junction");
      await expect(
        s.files.read("documents/escape/secret.md"),
      ).rejects.toMatchObject({ code: "path_boundary" });
    } finally {
      await rm(join(root, "documents", "escape"), {
        force: true,
        recursive: true,
      });
      await rm(outside, { recursive: true, force: true });
    }
  });
  it("renders inert HTML, rejects unsafe URLs, never embeds images or runs code", () => {
    const html = renderToStaticMarkup(
      createElement(SafeMarkdown, {
        text: '# Safe\n<script>alert(1)</script>\n[bad](javascript:alert)\n[good](https://example.com)\n![remote](https://example.com/tracker.png)\n```js\nfetch("https://example.com")\n```',
      }),
    );
    expect(html).not.toContain("<script");
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://example.com/"');
    const body =
      "# One\n\n" + "paragraph sentence. ".repeat(400) + "\n## Two\nTail";
    const c = chunks(body);
    expect(
      c.every(
        (p) =>
          p.end - p.start <= 1800 && body.slice(p.start, p.end) === p.content,
      ),
    ).toBe(true);
    expect(c.map((p) => p.content).join("")).toBe(body);
    expect(searchQuery("'; DROP TABLE projects; --")).not.toContain(";");
  });
});

const noTools: DelegationAdapter = {
  async listAgents() {
    return [];
  },
  async createTask() {
    throw new Error("Tool authority must not expand");
  },
  async readTask() {
    throw new Error();
  },
  async findByMarker() {
    return [];
  },
  taskUrl() {
    return "";
  },
};
function chat(gateway: PlanningGateway) {
  return new OrchestrationService(
    new Store(db),
    gateway,
    noTools,
    false,
    undefined,
    s,
  );
}
describe("grounded orchestration (deterministic model substitutes, not model quality)", () => {
  it("records bounded evidence and validates citations against exact revisions after external edits and missing history", async () => {
    const d = await doc("edited-after-citation");
    await s.tick();
    let evidence: Grounding | undefined;
    const service = chat({
      async complete(messages, agents, signal, automations, grounding) {
        evidence = grounding;
        expect(agents).toEqual([]);
        expect(automations).toEqual([]);
        return {
          reply: {
            kind: "answer",
            reply: "Atlas telescope is amber. [S1] Bad [S99]",
          },
          usage: null,
        };
      },
    });
    const answer = await service.submit(
      owner,
      randomUUID(),
      randomUUID(),
      "Atlas telescope",
      undefined,
      scope(),
    );
    const m = answer.messages.find((m) => m.role === "assistant")!;
    expect(evidence?.passages).toHaveLength(1);
    expect(m.content).toContain("[šaltinis nepatvirtintas]");
    expect(m.grounding?.cited).toEqual(["S1"]);
    const old = await s.citation(owner, m.id, "S1");
    expect(old.passage.content).toContain("amber");
    const file = parse(await s.files.read(d.path));
    await writeFile(
      join(root, d.path),
      serialize(file.meta, file.body.replaceAll("amber", "violet")),
    );
    await s.tick();
    const cited = await s.citation(owner, m.id, "S1");
    expect(cited.revision).toBe(1);
    expect(cited.currentRevision).toBe(2);
    expect(cited.body).toContain("amber");
    await expect(s.citation(owner, m.id, "S99")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(s.citation("intruder", m.id, "S1")).rejects.toMatchObject({
      code: "not_found",
    });
    const r = (
      await db.query(
        "SELECT path FROM knowledge_revisions WHERE document_id=$1 AND revision=1",
        [d.id],
      )
    ).rows[0];
    await unlink(join(root, r.path as string));
    await expect(s.citation(owner, m.id, "S1")).rejects.toMatchObject({
      code: "revision_unavailable",
    });
  });
  it("exposes insufficient/conflicting evidence, preserves scope in idempotency, isolates history and refuses injected tool proposals", async () => {
    await doc();
    await doc("conflict");
    await doc("injection");
    await doc("harbor", b);
    await s.tick();
    const contexts: Grounding[] = [];
    const service = chat({
      async complete(messages, agents, signal, automations, g) {
        contexts.push(g!);
        expect(messages).toHaveLength(1);
        return {
          reply: {
            kind: "answer",
            reply: g?.passages.length
              ? "Šaltiniai prieštarauja; nepakanka tikrumo. [S1] [S2]"
              : "Turimų žinių nepakanka.",
          },
          usage: null,
        };
      },
    });
    const conversation = randomUUID(),
      request = randomUUID();
    await service.submit(
      owner,
      conversation,
      request,
      "Atlas archyvavimo",
      undefined,
      scope(),
    );
    expect(contexts[0].passages.length).toBeGreaterThanOrEqual(2);
    expect(contexts[0].passages.every((p) => p.projectId === a)).toBe(true);
    await expect(
      service.submit(
        owner,
        conversation,
        request,
        "Atlas archyvavimo",
        undefined,
        { projectId: b, includeGlobal: false },
      ),
    ).rejects.toMatchObject({ code: "request_conflict" });
    const empty = await service.submit(
      owner,
      conversation,
      randomUUID(),
      "nonexistent-unicorn",
      undefined,
      scope(),
    );
    expect(empty.messages.at(-1)?.grounding?.status).toBe("empty");
    const injection = chat({
      async complete() {
        return {
          reply: {
            kind: "plan",
            reply: "attempt",
            plan: {
              title: "bad",
              objective: "bad",
              boundedTask: "bad",
              agentId: null,
              completionCriteria: ["bad"],
              constraints: [],
            },
          },
          usage: null,
        };
      },
    });
    const blocked = await injection.submit(
      owner,
      randomUUID(),
      randomUUID(),
      "security exercise",
      undefined,
      scope(),
    );
    expect(blocked.runs).toHaveLength(0);
    expect(blocked.turns[0].status).toBe("failed");
  });
  it("keeps normal chat usable when knowledge is unconfigured and labels uncited responses", async () => {
    await doc();
    await s.tick();
    const service = chat({
      async complete() {
        return {
          reply: { kind: "answer", reply: "Suggestion without a citation" },
          usage: null,
        };
      },
    });
    const uncited = await service.submit(
      owner,
      randomUUID(),
      randomUUID(),
      "Atlas",
      undefined,
      scope(),
    );
    expect(uncited.messages.at(-1)?.grounding?.status).toBe("uncited");
    const unavailable = new OrchestrationService(
      new Store(db),
      {
        async complete() {
          return {
            reply: { kind: "answer", reply: "Ordinary response" },
            usage: null,
          };
        },
      },
      noTools,
      false,
      undefined,
      new KnowledgeService(db, new MarkdownFiles("")),
    );
    const answer = await unavailable.submit(
      owner,
      randomUUID(),
      randomUUID(),
      "Hello",
    );
    expect(answer.messages.at(-1)?.grounding?.status).toBe("off");
    const missing = await unavailable.submit(
      owner,
      randomUUID(),
      randomUUID(),
      "Atlas",
      undefined,
      scope(),
    );
    expect(missing.messages.at(-1)?.grounding?.status).toBe("unavailable");
  });
});
describe("explicit owner-reviewed durable memory", () => {
  async function proposal(
    statement: string,
    kind: "decision" | "preference" | "constraint" = "decision",
    projectId: string | null = a,
    replaces?: string,
  ) {
    const source = await doc(projectId ? "decision-old" : "global", projectId);
    return s.propose(owner, {
      projectId,
      kind,
      statement,
      source: { type: "document", id: source.id, revision: source.revision },
      replaces,
    });
  }
  it("proposes without authority, approves exactly once, rejects secrets/duplicates, and retains superseded history", async () => {
    const old = await proposal("Atlas eksporto formatas yra CSV.");
    expect(
      (await s.list(owner, scope())).filter((d) => d.kind === "decision"),
    ).toHaveLength(0);
    await expect(
      s.confirmMemory(owner, old.proposal.id, "0".repeat(64), false),
    ).rejects.toMatchObject({ code: "review_changed" });
    const approved = await s.confirmMemory(
      owner,
      old.proposal.id,
      old.proposal.reviewHash,
      false,
    );
    expect(
      (
        await s.confirmMemory(
          owner,
          old.proposal.id,
          old.proposal.reviewHash,
          false,
        )
      ).documentId,
    ).toBe(approved.documentId);
    await s.tick();
    expect(
      (await s.search(owner, scope(), "CSV")).some(
        (p) => p.kind === "decision",
      ),
    ).toBe(true);
    const next = await proposal(
      "Atlas eksporto formatas yra Markdown.",
      "decision",
      a,
      approved.documentId!,
    );
    expect(next.peers[0].document.id).toBe(approved.documentId);
    const replacement = await s.confirmMemory(
      owner,
      next.proposal.id,
      next.proposal.reviewHash,
      false,
    );
    expect((await s.owned(owner, approved.documentId!)).supersededBy).toBe(
      replacement.documentId,
    );
    await s.tick();
    expect(
      (await s.search(owner, scope(), "CSV")).filter(
        (p) => p.kind === "decision",
      ),
    ).toHaveLength(0);
    expect((await s.revision(owner, approved.documentId!, 1)).body).toContain(
      "CSV",
    );
    await expect(
      proposal("Atlas eksporto formatas yra Markdown."),
    ).rejects.toMatchObject({ code: "duplicate_memory" });
    await expect(
      proposal("password=fictional-test-secret"),
    ).rejects.toMatchObject({ code: "secret_content" });
    await expect(
      s.update(owner, replacement.documentId!, {
        hash: (await s.owned(owner, replacement.documentId!)).hash,
        body: "Bypass review",
      }),
    ).rejects.toMatchObject({ code: "review_required" });
  });
  it("exposes peer conflicts, requires acknowledgement, invalidates changed reviews and quarantines externally edited memories", async () => {
    const first = await proposal("Atlas kopijos daromos kasdien.");
    const approved = await s.confirmMemory(
      owner,
      first.proposal.id,
      first.proposal.reviewHash,
      false,
    );
    const conflict = await proposal("Atlas kopijos daromos kas mėnesį.");
    expect(conflict.peers).toHaveLength(1);
    await expect(
      s.confirmMemory(
        owner,
        conflict.proposal.id,
        conflict.proposal.reviewHash,
        false,
      ),
    ).rejects.toMatchObject({ code: "review_changed" });
    await s.confirmMemory(
      owner,
      conflict.proposal.id,
      conflict.proposal.reviewHash,
      true,
    );
    const stale = await proposal("Atlas kopijos daromos kas savaitę.");
    const other = await proposal("Atlas kopijos daromos kas valandą.");
    await s.confirmMemory(
      owner,
      other.proposal.id,
      other.proposal.reviewHash,
      true,
    );
    await expect(
      s.confirmMemory(
        owner,
        stale.proposal.id,
        stale.proposal.reviewHash,
        true,
      ),
    ).rejects.toMatchObject({ code: "review_changed" });
    const d = await s.owned(owner, approved.documentId!);
    const parsed = parse(await s.files.read(d.path));
    await writeFile(
      join(root, d.path),
      serialize(parsed.meta, "Unreviewed replacement"),
    );
    await s.tick();
    expect((await s.owned(owner, d.id)).indexError).toBe("metadata_conflict");
    expect((await s.search(owner, scope(), "Unreviewed")).length).toBe(0);
  });
  it("fixes assistant proposals to the selected scope and source; global approval is an explicit separate choice", async () => {
    await doc();
    await s.tick();
    const service = chat({
      async complete() {
        return {
          reply: {
            kind: "memory",
            reply: "Siūlau įsiminti.",
            memory: {
              statement: "Atlas darbams naudoti Markdown.",
              kind: "constraint",
            },
          },
          usage: null,
        };
      },
    });
    await service.submit(
      owner,
      randomUUID(),
      randomUUID(),
      "Atlas",
      undefined,
      scope(),
    );
    const proposals = await s.proposals(owner);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].projectId).toBe(a);
    expect(proposals[0].state).toBe("pending");
    await expect(
      s.propose(owner, {
        projectId: null,
        kind: "preference",
        statement: "A global claim",
        source: proposals[0].source,
      }),
    ).rejects.toMatchObject({ code: "source_scope" });
    const global = await proposal(
      "Atsakymai trumpi ir lietuviški.",
      "preference",
      null,
    );
    await s.confirmMemory(
      owner,
      global.proposal.id,
      global.proposal.reviewHash,
      false,
    );
    await s.tick();
    expect((await s.search(owner, scope(), "trumpi")).length).toBe(0);
    expect(
      (
        await s.search(owner, { ...scope(), includeGlobal: true }, "trumpi")
      ).some((p) => p.kind === "preference"),
    ).toBe(true);
    await s.rejectMemory(owner, proposals[0].id);
    await expect(
      s.confirmMemory(owner, proposals[0].id, proposals[0].reviewHash, false),
    ).rejects.toMatchObject({ code: "review_changed" });
  });
});
