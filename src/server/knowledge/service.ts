import { randomUUID } from "node:crypto";
import type { Database, Sql } from "../db/types";
import { DomainError } from "../orchestration/store";
import {
  MarkdownFiles,
  parse,
  serialize,
  importName,
  type Header,
} from "./files";
import {
  chunks,
  hash,
  lexemes,
  searchTerms,
  requiredMatches,
  validateText,
  rejectSecrets,
} from "./text";
import {
  memoryKind,
  memorySource,
  type KnowledgeDocument,
  type KnowledgeScope,
  type Passage,
  type MemoryProposal,
} from "@/domain/knowledge";
import { z } from "zod";
import { canonicalJson } from "../canonical-json";
import { opendir } from "node:fs/promises";

type Row = Record<string, unknown>;
const iso = (value: unknown) =>
  value ? new Date(value as string).toISOString() : null;
export function toDocument(r: Row): KnowledgeDocument {
  return {
    id: r.id as string,
    projectId: r.project_id as string | null,
    title: r.title as string,
    path: r.path as string,
    contentType: r.content_type as KnowledgeDocument["contentType"],
    kind: r.kind as KnowledgeDocument["kind"],
    provenance: r.provenance as Record<string, unknown>,
    revision: Number(r.revision),
    hash: r.content_hash as string,
    archived: r.archived as boolean,
    supersededBy: r.superseded_by as string | null,
    indexStatus: r.index_status as KnowledgeDocument["indexStatus"],
    indexError: r.index_error as string | null,
    indexedAt: iso(r.indexed_at),
    checkedAt: iso(r.checked_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
  };
}
function header(d: KnowledgeDocument): Header {
  return {
    id: d.id,
    projectId: d.projectId,
    title: d.title,
    contentType: d.contentType,
    kind: d.kind,
    provenance: d.provenance,
    archived: d.archived,
    supersededBy: d.supersededBy,
  };
}
export const importFile = z
  .object({ name: z.string().min(1).max(240), content: z.string().max(24000) })
  .strict();
type ImportEntry = {
  name: string;
  content: string;
  title: string;
  bytes: number;
  hash: string;
  duplicate: string | null;
  excluded: string | null;
  documentId: string;
};
function toProposal(r: Row): MemoryProposal {
  return {
    id: r.id as string,
    projectId: r.project_id as string | null,
    kind: r.kind as string,
    statement: r.statement as string,
    source: r.source as MemoryProposal["source"],
    replaces: r.replaces as string | null,
    reviewHash: r.review_hash as string,
    state: r.state as string,
    documentId: r.document_id as string | null,
    approvedAt: iso(r.approved_at),
    createdAt: iso(r.created_at)!,
  };
}
export class KnowledgeService {
  constructor(
    public db: Database,
    public files: MarkdownFiles,
  ) {}
  async projects(owner: string) {
    return (
      await this.db.query(
        "SELECT id,name,description FROM projects WHERE owner_subject=$1 ORDER BY name LIMIT 100",
        [owner],
      )
    ).rows as unknown as { id: string; name: string; description: string }[];
  }
  async project(owner: string, id: string | null, tx: Sql = this.db) {
    if (
      id &&
      !(
        await tx.query(
          "SELECT id FROM projects WHERE id=$1 AND owner_subject=$2",
          [id, owner],
        )
      ).rows.length
    )
      throw new DomainError(404, "not_found");
  }
  async createProject(owner: string, name: string) {
    name = z.string().trim().min(1).max(160).parse(name);
    const id = randomUUID();
    await this.db.query(
      "INSERT INTO projects(id,name,owner_subject) VALUES($1,$2,$3)",
      [id, name, owner],
    );
    return { id, name, description: "" };
  }
  async owned(owner: string, id: string, tx: Sql = this.db, lock = false) {
    z.uuid().parse(id);
    const r = (
      await tx.query(
        `SELECT * FROM knowledge_documents WHERE id=$1 AND owner_subject=$2${lock ? " FOR UPDATE" : ""}`,
        [id, owner],
      )
    ).rows[0];
    if (!r) throw new DomainError(404, "not_found");
    return toDocument(r);
  }
  async list(owner: string, scope: KnowledgeScope, archived = false) {
    await this.files.ready();
    await this.project(owner, scope.projectId);
    return (
      await this.db.query(
        "SELECT * FROM knowledge_documents WHERE owner_subject=$1 AND (project_id=$2::uuid OR ($3 AND project_id IS NULL)) AND archived=$4 ORDER BY updated_at DESC LIMIT 100",
        [
          owner,
          scope.projectId,
          scope.includeGlobal || !scope.projectId,
          archived,
        ],
      )
    ).rows.map(toDocument);
  }
  async record(
    tx: Sql,
    d: KnowledgeDocument,
    raw: string,
    relative: string,
    initial = false,
  ) {
    const rev = initial ? 1 : d.revision + 1,
      parsed = parse(raw);
    const snapshot = await this.files.snapshot(d.id, rev, raw);
    if (initial)
      await tx.query(
        "INSERT INTO knowledge_documents(id,owner_subject,project_id,title,path,content_type,kind,provenance,content_hash,archived,superseded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [
          d.id,
          d.provenance.owner,
          d.projectId,
          parsed.meta.title,
          relative,
          d.contentType,
          d.kind,
          JSON.stringify(d.provenance),
          hash(raw),
          parsed.meta.archived,
          parsed.meta.supersededBy,
        ],
      );
    else
      await tx.query(
        "UPDATE knowledge_documents SET title=$2,path=$3,revision=$4,content_hash=$5,archived=$6,superseded_by=$7,index_status=CASE WHEN indexed_at IS NULL THEN 'pending' ELSE 'stale' END,index_error=NULL,checked_at=NULL,updated_at=now() WHERE id=$1",
        [
          d.id,
          parsed.meta.title,
          relative,
          rev,
          hash(raw),
          parsed.meta.archived,
          parsed.meta.supersededBy,
        ],
      );
    await tx.query(
      "INSERT INTO knowledge_revisions(document_id,revision,content_hash,path,title) VALUES($1,$2,$3,$4,$5)",
      [d.id, rev, hash(raw), snapshot, parsed.meta.title],
    );
  }
  private async createIn(
    tx: Sql,
    owner: string,
    input: {
      projectId: string | null;
      title: string;
      body: string;
      contentType?: KnowledgeDocument["contentType"];
      kind?: KnowledgeDocument["kind"];
      provenance?: Record<string, unknown>;
      id?: string;
    },
  ) {
    const title = z.string().trim().min(1).max(160).parse(input.title);
    validateText(input.body);
    await this.project(owner, input.projectId, tx);
    const id = input.id ?? randomUUID(),
      meta: Header = {
        id,
        projectId: input.projectId,
        title,
        contentType: input.contentType ?? "text/markdown",
        kind: input.kind ?? "document",
        provenance: { ...input.provenance, owner },
        archived: false,
        supersededBy: null,
      };
    const raw = serialize(meta, input.body),
      relative = this.files.documentPath(id, title);
    await this.files.write(relative, raw, null);
    await this.record(
      tx,
      { ...meta, provenance: meta.provenance } as unknown as KnowledgeDocument,
      raw,
      relative,
      true,
    );
    return id;
  }
  async create(
    owner: string,
    input: { projectId: string | null; title: string; body: string },
  ) {
    await this.files.ready();
    const id = await this.db.transaction((tx) =>
      this.createIn(tx, owner, {
        ...input,
        provenance: { type: "owner-created" },
      }),
    );
    return this.owned(owner, id);
  }
  private async current(d: KnowledgeDocument) {
    let relative = d.path,
      raw: string;
    try {
      raw = await this.files.read(relative);
    } catch (e) {
      if (e instanceof DomainError && e.code === "path_boundary") throw e;
      relative = await this.files.findRenamed(d.id);
      raw = await this.files.read(relative);
    }
    const parsed = parse(raw);
    const expected = header(d);
    // Titles and ordinary document bodies may be edited externally; scope,
    // approval/provenance and lifecycle changes require the application.
    if (
      canonicalJson({ ...parsed.meta, title: expected.title }) !==
      canonicalJson(expected)
    )
      throw new DomainError(409, "metadata_conflict");
    if (d.kind !== "document" && parsed.hash !== d.hash)
      throw new DomainError(409, "metadata_conflict");
    return { ...parsed, path: relative };
  }
  private async reconcile(tx: Sql, d: KnowledgeDocument) {
    const p = await this.current(d);
    if (p.hash !== d.hash) {
      await this.record(tx, d, p.raw, p.path);
      d = await this.owned(String(d.provenance.owner), d.id, tx);
    } else if (p.path !== d.path) {
      await tx.query("UPDATE knowledge_documents SET path=$2 WHERE id=$1", [
        d.id,
        p.path,
      ]);
      d = { ...d, path: p.path };
    }
    return { document: d, ...p };
  }
  async read(owner: string, id: string) {
    await this.files.ready();
    try {
      return await this.db.transaction(async (tx) =>
        this.reconcile(tx, await this.owned(owner, id, tx, true)),
      );
    } catch (e) {
      await this.failure(id, e, owner);
      throw e;
    }
  }
  async history(owner: string, id: string) {
    await this.owned(owner, id);
    return (
      await this.db.query(
        "SELECT revision,content_hash AS hash,title,created_at FROM knowledge_revisions WHERE document_id=$1 ORDER BY revision DESC LIMIT 100",
        [id],
      )
    ).rows;
  }
  async conflicts(owner: string, id: string) {
    await this.owned(owner, id);
    await this.files.ready();
    const entries: { name: string; body: string; title: string }[] = [];
    const directory = await opendir(await this.files.safe("conflicts"));
    let scanned = 0;
    for await (const entry of directory) {
      if (++scanned > 100) break;
      if (!entry.isFile() || !/^[a-f\d-]{36}\.md$/i.test(entry.name)) continue;
      try {
        const p = parse(await this.files.read(`conflicts/${entry.name}`));
        if (p.meta.id === id)
          entries.push({ name: entry.name, body: p.body, title: p.meta.title });
      } catch {}
    }
    return entries;
  }
  private async failure(id: string, e: unknown, owner?: string) {
    const code = e instanceof DomainError ? e.code : "file_unavailable";
    // Never let another owner's failed lookup alter an existing record.
    await this.db.query(
      "UPDATE knowledge_documents SET index_status='failed',index_error=$2,checked_at=now() WHERE id=$1 AND ($3::text IS NULL OR owner_subject=$3)",
      [id, code, owner ?? null],
    );
  }
  async update(
    owner: string,
    id: string,
    input: { hash: string; title?: string; body?: string; archived?: boolean },
  ) {
    await this.files.ready();
    return this.db
      .transaction(async (tx) => {
        const d = await this.owned(owner, id, tx, true);
        if (
          d.kind !== "document" &&
          (input.body !== undefined || input.title !== undefined)
        )
          throw new DomainError(409, "review_required");
        if (input.archived === false && d.supersededBy)
          throw new DomainError(409, "review_required");
        const p = await this.current(d);
        if (input.hash !== d.hash || p.hash !== d.hash) {
          await this.files.conflict(
            serialize(
              { ...header(d), title: input.title ?? d.title },
              input.body ?? p.body,
            ),
          );
          throw new DomainError(409, "revision_conflict");
        }
        const meta = {
          ...header(d),
          title: input.title ?? d.title,
          archived: input.archived ?? d.archived,
        };
        const raw = serialize(meta, input.body ?? p.body),
          relative = this.files.documentPath(id, meta.title);
        if (raw !== p.raw || relative !== p.path) {
          await this.files.write(relative, raw, d.hash, p.path);
          await this.record(tx, d, raw, relative);
        }
        return this.owned(owner, id, tx);
      })
      .catch(async (e) => {
        if (e instanceof DomainError && e.code === "revision_conflict")
          await this.db.query(
            "UPDATE knowledge_documents SET index_status='stale',index_error='revision_conflict',checked_at=NULL WHERE id=$1 AND owner_subject=$2",
            [id, owner],
          );
        else if (
          e instanceof DomainError &&
          ["file_unavailable", "metadata_conflict", "path_boundary"].includes(
            e.code,
          )
        )
          await this.failure(id, e, owner);
        throw e;
      });
  }
  async retry(owner: string, id: string) {
    await this.owned(owner, id);
    await this.db.query(
      "UPDATE knowledge_documents SET index_status=CASE WHEN indexed_at IS NULL THEN 'pending' ELSE 'stale' END,index_error=NULL,checked_at=NULL WHERE id=$1",
      [id],
    );
  }
  async rebuild(owner: string) {
    await this.files.ready();
    await this.db.query(
      "UPDATE knowledge_documents SET index_status='pending',index_error=NULL,checked_at=NULL WHERE owner_subject=$1",
      [owner],
    );
  }
  async tick(limit = 10) {
    await this.files.ready();
    const rows = (
      await this.db.query(
        "SELECT id,owner_subject FROM knowledge_documents ORDER BY checked_at NULLS FIRST,id LIMIT $1",
        [Math.min(10, Math.max(1, limit))],
      )
    ).rows;
    for (const r of rows) {
      try {
        await this.db.transaction(async (tx) => {
          const d = await this.owned(
            r.owner_subject as string,
            r.id as string,
            tx,
            true,
          );
          const current = await this.reconcile(tx, d),
            fresh = current.document;
          if (fresh.indexStatus !== "indexed") {
            await tx.query(
              "DELETE FROM knowledge_chunks WHERE document_id=$1",
              [d.id],
            );
            if (!fresh.archived && !fresh.supersededBy)
              for (const c of chunks(current.body))
                await tx.query(
                  "INSERT INTO knowledge_chunks(document_id,revision,passage,content_hash,heading,start_offset,end_offset,start_line,end_line,content,search_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,setweight(to_tsvector('simple',$11),'A') || to_tsvector('simple',$12))",
                  [
                    d.id,
                    fresh.revision,
                    c.passage,
                    fresh.hash,
                    c.heading,
                    c.start,
                    c.end,
                    c.startLine,
                    c.endLine,
                    c.content,
                    lexemes(`${fresh.title} ${c.heading}`).join(" "),
                    lexemes(c.content).join(" "),
                  ],
                );
            // Verify again before making the derived generation visible.
            if ((await this.current(fresh)).hash !== fresh.hash)
              throw new DomainError(409, "revision_conflict");
            await tx.query(
              "UPDATE knowledge_documents SET index_status='indexed',index_error=NULL,indexed_at=now() WHERE id=$1",
              [d.id],
            );
          }
          await tx.query(
            "UPDATE knowledge_documents SET checked_at=now() WHERE id=$1",
            [d.id],
          );
        });
      } catch (e) {
        await this.failure(r.id as string, e);
      }
    }
    return rows.length;
  }
  async search(
    owner: string,
    scope: KnowledgeScope,
    text: string,
  ): Promise<Passage[]> {
    await this.files.ready();
    await this.project(owner, scope.projectId);
    const terms = searchTerms(z.string().max(4000).parse(text));
    if (!terms.length) return [];
    // Passages matching more of the question's terms always rank first.
    const results = (
      await this.db.query(
        `WITH matches AS (SELECT c.*,d.title,d.project_id,d.kind,
      (SELECT count(*) FROM unnest($5::text[]) t WHERE c.search_text @@ to_tsquery('simple',t)) AS matched,
      ts_rank_cd(c.search_text,to_tsquery('simple',$4)) AS score
      FROM knowledge_chunks c JOIN knowledge_documents d ON d.id=c.document_id
      WHERE d.owner_subject=$1 AND (d.project_id=$2::uuid OR ($3 AND d.project_id IS NULL))
      AND d.archived=false AND d.superseded_by IS NULL AND d.index_status='indexed'
      AND c.revision=d.revision AND c.content_hash=d.content_hash AND c.search_text @@ to_tsquery('simple',$4)
      ), candidates AS (SELECT *,
      row_number() OVER (PARTITION BY document_id ORDER BY matched DESC,score DESC,passage) AS document_rank
      FROM matches WHERE matched>=$6
      ) SELECT * FROM candidates WHERE document_rank<=2 ORDER BY matched DESC,score DESC,document_id,passage LIMIT 16`,
        [
          owner,
          scope.projectId,
          scope.includeGlobal,
          terms.join(" | "),
          terms,
          requiredMatches(terms.length),
        ],
      )
    ).rows;
    const checked = new Map<string, boolean>(),
      out: Passage[] = [];
    for (const r of results) {
      const id = r.document_id as string;
      if (!checked.has(id)) {
        try {
          const current = await this.read(owner, id);
          checked.set(
            id,
            current.document.indexStatus === "indexed" &&
              current.hash === r.content_hash,
          );
        } catch {
          checked.set(id, false);
        }
      }
      if (!checked.get(id)) continue;
      out.push({
        documentId: id,
        revision: Number(r.revision),
        hash: r.content_hash as string,
        passage: Number(r.passage),
        title: r.title as string,
        heading: r.heading as string,
        content: r.content as string,
        start: Number(r.start_offset),
        end: Number(r.end_offset),
        startLine: Number(r.start_line),
        endLine: Number(r.end_line),
        projectId: r.project_id as string | null,
        kind: r.kind as string,
        citation: `S${out.length + 1}`,
      });
      if (out.length === 6) break;
    }
    return out;
  }
  async revision(owner: string, id: string, revision: number) {
    const document = await this.owned(owner, id);
    const r = (
      await this.db.query(
        "SELECT * FROM knowledge_revisions WHERE document_id=$1 AND revision=$2",
        [id, revision],
      )
    ).rows[0];
    if (!r) throw new DomainError(410, "revision_unavailable");
    try {
      await this.files.ready();
      const raw = await this.files.read(r.path as string);
      if (hash(raw) !== r.content_hash) throw new Error();
      return { document, ...parse(raw), revision };
    } catch {
      throw new DomainError(410, "revision_unavailable");
    }
  }
  async citation(owner: string, messageId: string, label: string) {
    const r = (
      await this.db.query(
        "SELECT m.grounding FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.owner_subject=$2",
        [messageId, owner],
      )
    ).rows[0];
    const grounding = r?.grounding as
      { passages: Passage[]; cited: string[] } | undefined;
    const passage = grounding?.cited.includes(label)
      ? grounding.passages.find((p) => p.citation === label)
      : null;
    if (!passage) throw new DomainError(404, "not_found");
    const source = await this.revision(
      owner,
      passage.documentId,
      passage.revision,
    );
    if (
      source.hash !== passage.hash ||
      source.body.slice(passage.start, passage.end) !== passage.content
    )
      throw new DomainError(410, "revision_unavailable");
    return {
      passage,
      body: source.body,
      title: source.meta.title,
      currentRevision: source.document.revision,
      revision: source.revision,
      hash: source.hash,
      provenance: source.meta.provenance,
    };
  }
  async previewImport(
    owner: string,
    projectId: string | null,
    files: z.infer<typeof importFile>[],
  ) {
    await this.files.ready();
    await this.project(owner, projectId);
    if (
      !files.length ||
      files.length > 20 ||
      files.reduce((n, f) => n + Buffer.byteLength(f.content), 0) > 240000
    )
      throw new DomainError(400, "import_limit");
    const seen = new Set<string>(),
      entries: ImportEntry[] = [];
    for (const file of files) {
      let excluded: string | null = null;
      try {
        importName(file.name);
      } catch {
        excluded = "Neleidžiamas arba paslėptas kelias";
      }
      if (!/\.(md|txt)$/i.test(file.name))
        excluded = "Palaikomi tik .md ir .txt";
      validateText(file.content);
      const contentHash = hash(file.content);
      const existing = (
        await this.db.query(
          "SELECT id FROM knowledge_documents WHERE owner_subject=$1 AND project_id IS NOT DISTINCT FROM $2::uuid AND provenance->>'importHash'=$3 AND archived=false",
          [owner, projectId, contentHash],
        )
      ).rows[0];
      const duplicate = existing?.id as string | undefined;
      if (seen.has(contentHash))
        excluded = "Pasikartojantis turinys šiame importe";
      seen.add(contentHash);
      entries.push({
        name: file.name,
        content: file.content,
        title: file.name
          .replaceAll("\\", "/")
          .split("/")
          .at(-1)!
          .replace(/\.(md|txt)$/i, "")
          .slice(0, 160),
        bytes: Buffer.byteLength(file.content),
        hash: contentHash,
        duplicate: duplicate ?? null,
        excluded,
        documentId: randomUUID(),
      });
    }
    const id = randomUUID(),
      digest = hash(JSON.stringify({ projectId, entries }));
    await this.db.query(
      "INSERT INTO knowledge_imports(id,owner_subject,project_id,digest,preview) VALUES($1,$2,$3,$4,$5)",
      [id, owner, projectId, digest, JSON.stringify(entries)],
    );
    return {
      id,
      digest,
      projectId,
      entries: entries.map(({ content, ...rest }) => ({
        ...rest,
        preview: content.slice(0, 500),
      })),
      count: entries.length,
      bytes: entries.reduce((n, e) => n + e.bytes, 0),
      policy:
        "Kopijuoti naujus; praleisti vienodą turinį. Tas pats pavadinimas ir kitas turinys sukurs atskirą dokumentą, nieko neperrašys.",
    };
  }
  async confirmImport(owner: string, id: string, digest: string) {
    await this.files.ready();
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM knowledge_imports WHERE id=$1 AND owner_subject=$2 FOR UPDATE",
          [id, owner],
        )
      ).rows[0];
      if (!row) throw new DomainError(404, "not_found");
      if (
        row.digest !== digest ||
        Date.now() - new Date(row.created_at as string).getTime() > 30 * 60000
      )
        throw new DomainError(409, "review_changed");
      if (row.state === "completed") return { completed: true };
      // Serialize imports per owner/project to prevent overlapping previews from
      // creating duplicate copies, including separate concurrent confirmations.
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${owner}:${row.project_id ?? "global"}:import`,
      ]);
      for (const e of row.preview as ImportEntry[]) {
        if (e.excluded || e.duplicate) continue;
        if (
          (
            await tx.query(
              "SELECT id FROM knowledge_documents WHERE owner_subject=$1 AND project_id IS NOT DISTINCT FROM $2::uuid AND provenance->>'importHash'=$3 AND archived=false",
              [owner, row.project_id, e.hash],
            )
          ).rows.length
        )
          continue;
        await this.createIn(tx, owner, {
          id: e.documentId,
          projectId: row.project_id as string | null,
          title: e.title,
          body: e.content,
          contentType: /\.txt$/i.test(e.name) ? "text/plain" : "text/markdown",
          provenance: {
            type: "selected-file-import",
            source: e.name,
            importHash: e.hash,
          },
        });
      }
      await tx.query(
        "UPDATE knowledge_imports SET state='completed' WHERE id=$1",
        [id],
      );
      return { completed: true };
    });
  }
  async proposals(owner: string) {
    return (
      await this.db.query(
        "SELECT * FROM memory_proposals WHERE owner_subject=$1 ORDER BY created_at DESC LIMIT 100",
        [owner],
      )
    ).rows.map(toProposal);
  }
  private async source(
    owner: string,
    projectId: string | null,
    source: z.infer<typeof memorySource>,
    tx: Sql = this.db,
  ) {
    if (source.type === "document") {
      const d = await this.owned(owner, source.id, tx);
      if (d.projectId !== projectId) throw new DomainError(403, "source_scope");
      await this.revision(owner, source.id, source.revision);
    } else {
      const r = (
        await tx.query(
          "SELECT t.knowledge_scope FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN turns t ON t.id=m.turn_id WHERE m.id=$1 AND c.owner_subject=$2",
          [source.id, owner],
        )
      ).rows[0];
      if (
        !r ||
        ((r.knowledge_scope as KnowledgeScope | null)?.projectId ?? null) !==
          projectId
      )
        throw new DomainError(403, "source_scope");
      // Global preferences are possible only from explicitly global turns.
      if (
        projectId === null &&
        !(r.knowledge_scope as KnowledgeScope | null)?.includeGlobal
      )
        throw new DomainError(403, "source_scope");
    }
  }
  private async peers(
    owner: string,
    projectId: string | null,
    kind: string,
    tx: Sql = this.db,
  ) {
    return (
      await tx.query(
        "SELECT * FROM knowledge_documents WHERE owner_subject=$1 AND project_id IS NOT DISTINCT FROM $2::uuid AND kind=$3 AND archived=false AND superseded_by IS NULL ORDER BY id LIMIT 100",
        [owner, projectId, kind],
      )
    ).rows.map(toDocument);
  }
  async propose(
    owner: string,
    input: {
      projectId: string | null;
      kind: z.infer<typeof memoryKind>;
      statement: string;
      source: z.infer<typeof memorySource>;
      replaces?: string | null;
    },
  ) {
    await this.files.ready();
    await this.project(owner, input.projectId);
    await this.source(owner, input.projectId, input.source);
    const statement = z.string().trim().min(1).max(1800).parse(input.statement);
    rejectSecrets(statement);
    const peers = await this.peers(owner, input.projectId, input.kind);
    if (input.replaces && !peers.some((p) => p.id === input.replaces))
      throw new DomainError(409, "review_changed");
    for (const peer of peers) {
      const read = await this.read(owner, peer.id);
      if (read.body.trim() === statement)
        throw new DomainError(409, "duplicate_memory");
    }
    if (
      (
        await this.db.query(
          "SELECT id FROM memory_proposals WHERE owner_subject=$1 AND project_id IS NOT DISTINCT FROM $2::uuid AND kind=$3 AND statement=$4 AND state='pending'",
          [owner, input.projectId, input.kind, statement],
        )
      ).rows.length
    )
      throw new DomainError(409, "duplicate_memory");
    const id = randomUUID(),
      reviewHash = hash(
        canonicalJson({
          id,
          projectId: input.projectId,
          kind: input.kind,
          statement,
          source: input.source,
          replaces: input.replaces ?? null,
          peers: peers.map((p) => [p.id, p.hash]),
        }),
      );
    await this.db.query(
      "INSERT INTO memory_proposals(id,owner_subject,project_id,kind,statement,source,replaces,replaces_hash,review_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        id,
        owner,
        input.projectId,
        input.kind,
        statement,
        JSON.stringify(input.source),
        input.replaces ?? null,
        input.replaces
          ? peers.find((p) => p.id === input.replaces)!.hash
          : null,
        reviewHash,
      ],
    );
    return this.review(owner, id);
  }
  async review(owner: string, id: string) {
    const r = (
      await this.db.query(
        "SELECT * FROM memory_proposals WHERE id=$1 AND owner_subject=$2",
        [id, owner],
      )
    ).rows[0];
    if (!r) throw new DomainError(404, "not_found");
    const proposal = toProposal(r),
      peers = await this.peers(owner, proposal.projectId, proposal.kind);
    const source =
      proposal.source.type === "message"
        ? (
            await this.db.query(
              "SELECT m.conversation_id,m.content FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.owner_subject=$2",
              [proposal.source.id, owner],
            )
          ).rows[0]
        : null;
    return {
      proposal,
      sourceConversation: source?.conversation_id ?? null,
      sourceText: source?.content ?? null,
      destination: this.files.documentPath(id, proposal.statement.slice(0, 70)),
      peers: await Promise.all(
        peers.map(async (d) => ({
          document: d,
          body: (await this.read(owner, d.id)).body,
        })),
      ),
    };
  }
  async confirmMemory(
    owner: string,
    id: string,
    reviewHash: string,
    acknowledgeConflicts: boolean,
  ) {
    await this.files.ready();
    return this.db.transaction(async (tx) => {
      const row = (
        await tx.query(
          "SELECT * FROM memory_proposals WHERE id=$1 AND owner_subject=$2 FOR UPDATE",
          [id, owner],
        )
      ).rows[0];
      if (!row) throw new DomainError(404, "not_found");
      const p = toProposal(row);
      if (p.reviewHash !== reviewHash)
        throw new DomainError(409, "review_changed");
      if (p.state === "accepted") return { documentId: p.documentId };
      if (
        p.state !== "pending" ||
        Date.now() - new Date(p.createdAt).getTime() > 7 * 86400000
      )
        throw new DomainError(409, "review_changed");
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${owner}:${p.projectId ?? "global"}:memory`,
      ]);
      const peers = await this.peers(owner, p.projectId, p.kind, tx);
      const actual = hash(
        canonicalJson({
          id,
          projectId: p.projectId,
          kind: p.kind,
          statement: p.statement,
          source: p.source,
          replaces: p.replaces,
          peers: peers.map((d) => [d.id, d.hash]),
        }),
      );
      if (
        actual !== reviewHash ||
        (peers.some((d) => d.id !== p.replaces) && !acknowledgeConflicts)
      )
        throw new DomainError(409, "review_changed");
      for (const d of peers)
        if ((await this.current(d)).hash !== d.hash)
          throw new DomainError(409, "review_changed");
      rejectSecrets(p.statement);
      const documentId = await this.createIn(tx, owner, {
        id,
        projectId: p.projectId,
        title: p.statement.slice(0, 70),
        body: p.statement,
        kind: memoryKind.parse(p.kind),
        provenance: {
          type: "owner-approved-memory",
          proposalId: id,
          source: p.source,
          approvedBy: owner,
          approvedAt: new Date().toISOString(),
          replaces: p.replaces,
        },
      });
      if (p.replaces) {
        const d = peers.find((d) => d.id === p.replaces)!;
        const previous = await this.current(d);
        const raw = serialize(
          { ...header(d), archived: true, supersededBy: documentId },
          previous.body,
        );
        await this.files.write(d.path, raw, d.hash);
        await this.record(tx, d, raw, d.path);
      }
      await tx.query(
        "UPDATE memory_proposals SET state='accepted',document_id=$2,approved_by=$3,approved_at=now() WHERE id=$1",
        [id, documentId, owner],
      );
      return { documentId };
    });
  }
  async rejectMemory(owner: string, id: string) {
    await this.db.query(
      "UPDATE memory_proposals SET state='rejected' WHERE id=$1 AND owner_subject=$2 AND state='pending'",
      [id, owner],
    );
  }
}
