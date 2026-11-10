"use client";
import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeading } from "./dashboard";
import { Badge } from "./ui";
import { SafeMarkdown } from "./safe-markdown";
import {
  knowledgeErrors,
  type KnowledgeDocument,
  type Project,
  type Passage,
  type MemoryProposal,
} from "@/domain/knowledge";

export async function knowledgeRequest<T>(
  query: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const r = await fetch(`/api/knowledge${query}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const value = await r.json();
  if (!r.ok) throw new Error(value.error ?? "Žinių operacija nepavyko.");
  return value;
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const statuses = {
  pending: "Laukia indeksavimo",
  indexed: "Indeksuota",
  stale: "Indeksas pasenęs",
  failed: "Indeksuoti nepavyko",
};
const kinds = {
  document: "Dokumentas",
  preference: "Nuostata",
  decision: "Sprendimas",
  constraint: "Faktas / apribojimas",
};
type DocRead = {
  document: KnowledgeDocument;
  body: string;
  raw: string;
  hash: string;
  revision?: number;
  meta?: { title: string; provenance: Record<string, unknown> };
};
type Review = {
  proposal: MemoryProposal;
  destination: string;
  sourceConversation?: string | null;
  sourceText?: string | null;
  peers: { document: KnowledgeDocument; body: string }[];
};
type Preview = {
  id: string;
  digest: string;
  projectId: string | null;
  count: number;
  bytes: number;
  policy: string;
  entries: {
    name: string;
    title: string;
    bytes: number;
    duplicate: string | null;
    excluded: string | null;
    preview: string;
  }[];
};
type Listing = {
  projects: Project[];
  documents: KnowledgeDocument[];
  proposals: MemoryProposal[];
  results: Passage[];
};

export function ProjectKnowledgeLinks() {
  const [projects, setProjects] = useState<Project[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    knowledgeRequest<{ projects: Project[] }>("?op=projects")
      .then((v) => setProjects(v.projects))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <section className="knowledge-projects">
      <h2 className="overline">Projektų žinios</h2>
      {error && (
        <p role="status" className="notice">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3 mt-3">
        {projects.map((p) => (
          <Link
            className="button"
            key={p.id}
            href={`/knowledge?project=${p.id}`}
          >
            {p.name}
          </Link>
        ))}
        <Link className="button" href="/knowledge">
          Kurti projektą ir tvarkyti žinias
        </Link>
      </div>
    </section>
  );
}
export function KnowledgeWorkspace() {
  const search = useSearchParams();
  const [projectId, setProjectId] = useState(search.get("project") ?? ""),
    [includeGlobal, setIncludeGlobal] = useState(false),
    [archived, setArchived] = useState(false),
    [query, setQuery] = useState("");
  const [listing, setListing] = useState<Listing>({
      projects: [],
      documents: [],
      proposals: [],
      results: [],
    }),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [opened, setOpened] = useState<DocRead | null>(null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [creating, setCreating] = useState(false),
    [historical, setHistorical] = useState(false);
  const [projectName, setProjectName] = useState(""),
    [preview, setPreview] = useState<Preview | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [ack, setAck] = useState(false);
  const [statement, setStatement] = useState(""),
    [kind, setKind] = useState<"preference" | "decision" | "constraint">(
      "decision",
    ),
    [replaces, setReplaces] = useState<string | null>(null),
    [proposing, setProposing] = useState(false);
  const [versions, setVersions] = useState<
      { revision: number; title: string }[]
    >([]),
    [conflictCopies, setConflictCopies] = useState<
      { name: string; body: string; title: string }[]
    >([]);
  const [citation, setCitation] = useState<{
    passage: Passage;
    body: string;
    title: string;
    currentRevision: number;
    revision: number;
    hash: string;
    provenance: Record<string, unknown>;
  } | null>(null);
  const scopeName = projectId
    ? (listing.projects.find((p) => p.id === projectId)?.name ??
      "Pasirinktas projektas")
    : "Bendros žinios";
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const q = new URLSearchParams({
        projectId,
        global: String(includeGlobal || !projectId),
        archived: String(archived),
        q: query,
      });
      const value = await knowledgeRequest<Listing>(`?${q}`, undefined, signal);
      if (!signal?.aborted) {
        setListing(value);
        setLoading(false);
      }
    },
    [projectId, includeGlobal, archived, query],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setCitation(null);
        setOpened(null);
        setVersions([]);
        setConflictCopies([]);
      }
    });
    knowledgeRequest<{ projects: Project[] }>("?op=projects")
      .then((v) => setListing((old) => ({ ...old, projects: v.projects })))
      .catch(() => {});
    const message = search.get("message"),
      label = search.get("citation"),
      doc = search.get("document"),
      revision = search.get("revision");
    if (message && label)
      knowledgeRequest<typeof citation>(
        `?op=citation&message=${encodeURIComponent(message)}&label=${encodeURIComponent(label)}`,
        undefined,
        controller.signal,
      )
        .then((value) => {
          setCitation(value);
          if (value) setProjectId(value.passage.projectId ?? "");
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    else if (doc)
      knowledgeRequest<DocRead>(
        `?op=${revision ? "revision" : "document"}&id=${encodeURIComponent(doc)}${revision ? `&revision=${encodeURIComponent(revision)}` : ""}`,
        undefined,
        controller.signal,
      )
        .then((value) => {
          setOpened(value);
          setTitle(value.meta?.title ?? value.document.title);
          setBody(value.body);
          setHistorical(!!revision);
          setProjectId(value.document.projectId ?? "");
          setArchived(value.document.archived);
        })
        .catch((e) => {
          if (!controller.signal.aborted) setError(e.message);
        });
    // URL initialization is independent of list refreshes and editor state.
    return () => controller.abort();
  }, [search]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operacija nepavyko.");
    } finally {
      setBusy(false);
    }
  }
  async function openDoc(id: string) {
    const value = await knowledgeRequest<DocRead>(`?op=document&id=${id}`);
    setOpened(value);
    setTitle(value.document.title);
    setBody(value.body);
    setCreating(false);
    setHistorical(false);
    setProposing(false);
    setCitation(null);
    setVersions(await knowledgeRequest(`?op=history&id=${id}`));
    setConflictCopies(await knowledgeRequest(`?op=conflicts&id=${id}`));
  }
  async function save() {
    const d = await knowledgeRequest<KnowledgeDocument>(
      "",
      creating
        ? { action: "create", projectId: projectId || null, title, body }
        : {
            action: "update",
            id: opened!.document.id,
            hash: opened!.hash,
            title,
            body,
          },
    );
    await openDoc(d.id);
    await load();
    setNotice(
      "Markdown išsaugotas. Indeksavimą atliks atskiras worker procesas.",
    );
  }
  async function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    await act(async () => {
      if (
        files.length > 20 ||
        files.reduce((n, f) => n + f.size, 0) > 240000 ||
        files.some((f) => f.size > 24000)
      )
        throw new Error(knowledgeErrors.import_limit);
      const selected = [];
      for (const f of files) {
        const name = f.webkitRelativePath || f.name;
        const allowed =
          !name
            .replaceAll("\\", "/")
            .split("/")
            .some((p) => p.startsWith(".") || p.includes(":")) &&
          /\.(md|txt)$/i.test(name);
        // Excluded files are named in preview but their bytes are never read.
        selected.push({ name, content: allowed ? await f.text() : "" });
      }
      setPreview(
        await knowledgeRequest<Preview>("", {
          action: "preview",
          projectId: projectId || null,
          files: selected,
        }),
      );
    });
  }
  const pending = listing.proposals.filter(
    (p) => p.state === "pending" && p.projectId === (projectId || null),
  );
  const readOnly =
    historical ||
    opened?.document.kind !== "document" ||
    opened?.document.archived;
  return (
    <>
      <PageHeading
        eyebrow="Projektų žinios ir atmintis"
        title="Žinios"
        description="Privatūs Markdown dokumentai, tikros versijos ir tik jūsų patvirtinta ilgalaikė atmintis."
      />
      <div className="knowledge-toolbar">
        <label>
          Aprėptis
          <select
            className="input"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setOpened(null);
              setCreating(false);
              setPreview(null);
              setReview(null);
            }}
          >
            <option value="">Bendros žinios</option>
            {listing.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="knowledge-check">
          <input
            type="checkbox"
            checked={includeGlobal}
            disabled={!projectId}
            onChange={(e) => setIncludeGlobal(e.target.checked)}
          />{" "}
          Įtraukti bendras žinias
        </label>
        <label>
          Paieška
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Vardas, identifikatorius, sprendimas…"
          />
        </label>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            act(async () => {
              await load();
              setError("");
            })
          }
        >
          Atnaujinti būseną
        </button>
      </div>
      <p className="muted mb-4">
        Aprėptis: <strong>{scopeName}</strong>
        {projectId && includeGlobal ? " ir bendros žinios" : ""}. Leksinė
        paieška; semantinė paieška neįjungta.
      </p>
      {loading && <p role="status">Įkeliamos žinios…</p>}
      {error && (
        <p role="alert" className="notice notice-warning mb-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice mb-4">
          {notice}
        </p>
      )}
      <details className="knowledge-options mb-4">
        <summary>Projektas ir importas</summary>
        <div className="knowledge-toolbar mt-3">
          <label>
            Naujo projekto pavadinimas
            <input
              className="input"
              value={projectName}
              maxLength={160}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </label>
          <button
            className="button"
            disabled={busy || !projectName.trim()}
            onClick={() =>
              act(async () => {
                const p = await knowledgeRequest<Project>("", {
                  action: "project",
                  name: projectName,
                });
                setListing((old) => ({
                  ...old,
                  projects: [...old.projects, p],
                }));
                setProjectId(p.id);
                setProjectName("");
              })
            }
          >
            Kurti projektą
          </button>
          <label className="knowledge-upload">
            Pasirinkti failus
            <input
              type="file"
              multiple
              accept=".md,.txt"
              disabled={busy}
              onChange={selectFiles}
            />
          </label>
          <label className="knowledge-upload">
            Pasirinkti aplanką
            <input
              type="file"
              multiple
              disabled={busy}
              {...({ webkitdirectory: "" } as Record<string, string>)}
              onChange={selectFiles}
            />
          </label>
        </div>
        <p className="muted mt-3">
          Tik jūsų pasirinkti failai. Iki 20 failų, 24 KB vienam ir 240 KB iš
          viso. Paslėpti keliai ir nepalaikomi failai praleidžiami. Importas
          kopijuoja; Obsidian vėliau gali redaguoti serverio Markdown aplanką.
        </p>
      </details>
      {preview && (
        <section className="knowledge-review" aria-label="Importo peržiūra">
          <h2>Importo peržiūra</h2>
          <p>
            {preview.count} failų · {preview.bytes} baitų ·{" "}
            {listing.projects.find((p) => p.id === preview.projectId)?.name ??
              "Bendros žinios"}
          </p>
          <p className="muted mt-2">{preview.policy}</p>
          <ul className="knowledge-list">
            {preview.entries.map((e, i) => (
              <li key={i}>
                <strong>{e.name}</strong> · {e.bytes} baitų ·{" "}
                {e.excluded ??
                  (e.duplicate ? "Dublikatas, praleisti" : "Naujas dokumentas")}
                <details>
                  <summary>Turinio pradžia</summary>
                  <pre className="knowledge-plain">{e.preview}</pre>
                </details>
              </li>
            ))}
          </ul>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await knowledgeRequest("", {
                  action: "import",
                  id: preview.id,
                  digest: preview.digest,
                });
                setPreview(null);
                await load();
                setNotice("Importas baigtas. Laukiama indeksavimo.");
              })
            }
          >
            Patvirtinti importą
          </button>
          <button className="button ml-3" onClick={() => setPreview(null)}>
            Atšaukti importą
          </button>
        </section>
      )}
      {citation && (
        <section className="knowledge-review" aria-label="Cituotas šaltinis">
          <h2>
            {citation.title} · versija {citation.revision}
          </h2>
          <p>
            Šaltinis [{citation.passage.citation}] · eilutės{" "}
            {citation.passage.startLine}–{citation.passage.endLine}
          </p>
          {citation.currentRevision !== citation.revision && (
            <p className="notice mt-3">
              Dokumentas jau pakeistas. Rodoma originali atsakyme naudota
              versija.
            </p>
          )}
          <blockquote className="knowledge-evidence">
            <SafeMarkdown text={citation.passage.content} />
          </blockquote>
          <details>
            <summary>Visas tos versijos dokumentas ir kilmė</summary>
            <SafeMarkdown text={citation.body} />
            <pre className="knowledge-plain">
              {JSON.stringify(citation.provenance, null, 2)}
            </pre>
            <p className="muted break-all">SHA-256: {citation.hash}</p>
          </details>
          <button
            className="button mt-3"
            onClick={() => act(() => openDoc(citation.passage.documentId))}
          >
            Atverti dabartinį dokumentą
          </button>
        </section>
      )}
      <div className="knowledge-layout">
        <section aria-label="Dokumentai">
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <h2 className="overline">Dokumentai</h2>
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setCreating(true);
                setOpened(null);
                setTitle("");
                setBody("");
                setProposing(false);
              }}
            >
              Naujas dokumentas
            </button>
          </div>
          <label className="knowledge-check mb-3">
            <input
              type="checkbox"
              checked={archived}
              onChange={(e) => setArchived(e.target.checked)}
            />{" "}
            Rodyti atkuriamą archyvą
          </label>
          {!loading && !listing.documents.length && (
            <p className="muted">
              {archived
                ? "Archyvas tuščias."
                : "Dokumentų nėra. Sukurkite arba aiškiai importuokite Markdown."}
            </p>
          )}
          {query && (
            <div className="knowledge-results" role="status">
              <p>
                {listing.results.length
                  ? "Rastos aktualios ištraukos"
                  : "Aktualių indeksuotų ištraukų nerasta. Patikrinkite aprėptį, raktažodžius ir indeksavimo būseną."}
              </p>
              {listing.results.map((p) => (
                <button
                  key={`${p.documentId}-${p.passage}`}
                  className="knowledge-result"
                  onClick={() => act(() => openDoc(p.documentId))}
                >
                  <strong>{p.title}</strong>
                  <span>
                    v{p.revision} · {p.heading} ·{" "}
                    {p.projectId ? "Projektas" : "Bendros"}
                  </span>
                  <span>{p.content.slice(0, 360)}</span>
                </button>
              ))}
            </div>
          )}
          <ul className="knowledge-list">
            {listing.documents.map((d) => (
              <li key={d.id}>
                <button
                  className="text-link"
                  aria-current={
                    opened?.document.id === d.id ? "true" : undefined
                  }
                  onClick={() => act(() => openDoc(d.id))}
                >
                  {d.title}
                </button>
                <div className="knowledge-meta">
                  <Badge
                    tone={d.indexStatus === "indexed" ? "positive" : "warning"}
                  >
                    {statuses[d.indexStatus]}
                  </Badge>
                  <span>
                    v{d.revision} · {kinds[d.kind]} ·{" "}
                    {d.projectId ? "Projektas" : "Bendros"}
                  </span>
                  {d.supersededBy && <span>Pakeista nauju įrašu</span>}
                </div>
                {d.indexError && (
                  <p className="form-error mt-2">
                    {knowledgeErrors[d.indexError] ?? "Indeksavimo klaida"}
                  </p>
                )}
                {d.indexStatus !== "indexed" && (
                  <button
                    className="text-link mt-2"
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await knowledgeRequest("", {
                          action: "retry",
                          id: d.id,
                        });
                        await load();
                        setNotice(
                          "Indeksavimas įtrauktas į eilę. Patikrinkite, ar veikia worker.",
                        );
                      })
                    }
                  >
                    Kartoti indeksavimą
                  </button>
                )}
              </li>
            ))}
          </ul>
          <details className="mt-4">
            <summary>Indekso atkūrimas</summary>
            <p className="muted mt-2">
              Visi jūsų dokumentai bus pažymėti laukiančiais. Worker atkurs
              išvestinį indeksą ribotomis partijomis. Markdown lieka šaltiniu.
            </p>
            <button
              className="button mt-3"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await knowledgeRequest("", { action: "rebuild" });
                  await load();
                  setNotice("Visas indeksas įtrauktas į atkūrimo eilę.");
                })
              }
            >
              Atkurti visą indeksą
            </button>
          </details>
        </section>
        <section
          aria-label="Dokumento redaktorius"
          className="knowledge-editor"
        >
          {opened || creating ? (
            <>
              <p className="overline mb-3">
                {creating
                  ? `Naujas · ${scopeName}`
                  : `${opened!.document.projectId ? (listing.projects.find((p) => p.id === opened!.document.projectId)?.name ?? "Projektas") : "Bendros žinios"} · ${historical ? "Istorinė versija" : "Dabartinė versija"}`}
              </p>
              {historical && (
                <p className="notice mb-3">
                  Istorinis šaltinis skirtas skaityti. Jo tekstas nekeičiamas.
                </p>
              )}
              <label>
                Pavadinimas
                <input
                  className="input"
                  value={title}
                  maxLength={160}
                  readOnly={!creating && readOnly}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="block mt-3">
                Markdown tekstas
                <textarea
                  className="input knowledge-textarea"
                  value={body}
                  maxLength={24000}
                  readOnly={!creating && readOnly}
                  onChange={(e) => setBody(e.target.value)}
                  rows={13}
                />
              </label>
              <div className="flex flex-wrap gap-3 mt-3">
                {(creating || !readOnly) && (
                  <button
                    className="button button-primary"
                    disabled={busy || !title.trim()}
                    onClick={() => act(save)}
                  >
                    Išsaugoti Markdown
                  </button>
                )}
                <button
                  className="button"
                  onClick={() =>
                    download(`${opened?.document.id ?? "juodrastis"}.md`, body)
                  }
                >
                  Eksportuoti tekstą / juodraštį
                </button>
                {opened && (
                  <button
                    className="button"
                    onClick={() =>
                      download(
                        `${opened.document.id}-v${opened.revision ?? opened.document.revision}.md`,
                        opened.raw,
                      )
                    }
                  >
                    Eksportuoti su metaduomenimis
                  </button>
                )}
                {opened && !historical && (
                  <>
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => act(() => openDoc(opened.document.id))}
                    >
                      Iš naujo atverti palyginimui
                    </button>
                    {(!opened.document.archived ||
                      !opened.document.supersededBy) && (
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await knowledgeRequest("", {
                              action: "update",
                              id: opened.document.id,
                              hash: opened.hash,
                              archived: !opened.document.archived,
                            });
                            setOpened(null);
                            await load();
                          })
                        }
                      >
                        {opened.document.archived
                          ? "Atkurti iš archyvo"
                          : "Archyvuoti"}
                      </button>
                    )}
                    {!opened.document.archived && (
                      <button
                        className="button"
                        onClick={() => {
                          setProposing(true);
                          setStatement(
                            opened.document.kind === "document" ? "" : body,
                          );
                          setKind(
                            opened.document.kind === "document"
                              ? "decision"
                              : opened.document.kind,
                          );
                          setReplaces(
                            opened.document.kind === "document"
                              ? null
                              : opened.document.id,
                          );
                        }}
                      >
                        {opened.document.kind === "document"
                          ? "Siūlyti atmintį iš šaltinio"
                          : "Siūlyti atminties pataisą"}
                      </button>
                    )}
                  </>
                )}
              </div>
              <details open className="mt-5">
                <summary>Saugi peržiūra</summary>
                <SafeMarkdown
                  text={body}
                  plain={opened?.document.contentType === "text/plain"}
                />
              </details>
              {opened && (
                <details className="mt-4">
                  <summary>Kilmė, failas ir indeksavimo būsena</summary>
                  <dl className="knowledge-provenance">
                    <dt>Dokumento ID</dt>
                    <dd>{opened.document.id}</dd>
                    <dt>Kelias privačioje saugykloje</dt>
                    <dd>{opened.document.path}</dd>
                    <dt>Versija</dt>
                    <dd>{opened.revision ?? opened.document.revision}</dd>
                    <dt>SHA-256</dt>
                    <dd>{opened.hash}</dd>
                    <dt>Indeksas</dt>
                    <dd>{statuses[opened.document.indexStatus]}</dd>
                    <dt>Paskutinis indeksavimas</dt>
                    <dd>{opened.document.indexedAt ?? "Dar neatliktas"}</dd>
                  </dl>
                  <pre className="knowledge-plain">
                    {JSON.stringify(
                      opened.meta?.provenance ?? opened.document.provenance,
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
              {opened && (
                <details className="mt-4">
                  <summary>Versijų istorija ir konfliktų kopijos</summary>
                  <ul className="knowledge-list">
                    {versions.map((v) => (
                      <li key={v.revision}>
                        <Link
                          className="text-link"
                          href={`/knowledge?document=${opened.document.id}&revision=${v.revision}`}
                        >
                          v{v.revision} · {v.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {!conflictCopies.length && (
                    <p className="muted mt-3">
                      Konfliktų kopijų nerasta (tikrinama iki 100 katalogo
                      įrašų).
                    </p>
                  )}
                  {conflictCopies.map((c) => (
                    <details key={c.name} className="mt-3">
                      <summary>{c.title} · konfliktų kopija</summary>
                      <pre className="knowledge-plain">{c.body}</pre>
                      <button
                        className="button"
                        onClick={() => download(c.name, c.body)}
                      >
                        Eksportuoti konflikto tekstą
                      </button>
                    </details>
                  ))}
                </details>
              )}
              {proposing && opened && (
                <form
                  className="knowledge-review"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      const r = await knowledgeRequest<Review>("", {
                        action: "propose",
                        projectId: opened.document.projectId,
                        kind,
                        statement,
                        replaces,
                        source: {
                          type: "document",
                          id: opened.document.id,
                          revision: opened.document.revision,
                        },
                      });
                      setReview(r);
                      setAck(false);
                      setProposing(false);
                      await load();
                    });
                  }}
                >
                  <h3>Atminties pasiūlymas</h3>
                  <p className="muted">
                    Aprėptis paveldima iš šaltinio. Bendrą nuostatą kurkite iš
                    aiškiai bendro šaltinio.
                  </p>
                  <label>
                    Tipas
                    <select
                      className="input"
                      value={kind}
                      onChange={(e) => setKind(e.target.value as typeof kind)}
                    >
                      <option value="preference">Savininko nuostata</option>
                      <option value="decision">Projekto sprendimas</option>
                      <option value="constraint">Faktas / apribojimas</option>
                    </select>
                  </label>
                  <label>
                    Tikslus teiginys
                    <textarea
                      className="input"
                      value={statement}
                      onChange={(e) => setStatement(e.target.value)}
                      maxLength={1800}
                      rows={4}
                    />
                  </label>
                  <label>
                    Aiškiai pakeičiamas įrašas
                    <select
                      className="input"
                      value={replaces ?? ""}
                      onChange={(e) => setReplaces(e.target.value || null)}
                    >
                      <option value="">Nekeisti esamo įrašo</option>
                      {listing.documents
                        .filter(
                          (d) =>
                            d.kind === kind &&
                            d.projectId === opened.document.projectId,
                        )
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="button mt-3"
                    disabled={busy || !statement.trim()}
                  >
                    Paruošti savininko peržiūrą
                  </button>
                </form>
              )}
            </>
          ) : (
            <p className="muted">
              Pasirinkite dokumentą arba sukurkite naują. Pakeitimai įrašomi tik
              paspaudus išsaugojimą.
            </p>
          )}
        </section>
      </div>
      <section
        className="knowledge-memory mt-6"
        aria-label="Atminties pasiūlymai"
      >
        <h2 className="overline mb-3">Laukianti atmintis · {scopeName}</h2>
        <p className="muted">
          Pokalbiai ir užduočių rezultatai automatiškai netampa atmintimi.
          Pasiūlymas autoritetingas tik po jūsų patvirtinimo.
        </p>
        {!pending.length && (
          <p className="muted mt-3">
            Laukiančių pasiūlymų šioje aprėptyje nėra.
          </p>
        )}
        <ul className="knowledge-list">
          {pending.map((p) => (
            <li key={p.id}>
              <p>{p.statement}</p>
              <button
                className="button mt-2"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    setReview(
                      await knowledgeRequest<Review>(`?op=review&id=${p.id}`),
                    );
                    setAck(false);
                  })
                }
              >
                Peržiūrėti pasiūlymą
              </button>
            </li>
          ))}
        </ul>
        {review && (
          <div className="knowledge-review">
            <h3>Tiksli savininko peržiūra</h3>
            <blockquote className="knowledge-evidence">
              {review.proposal.statement}
            </blockquote>
            <p>
              Aprėptis:{" "}
              <strong>
                {listing.projects.find(
                  (p) => p.id === review.proposal.projectId,
                )?.name ?? "Bendros žinios"}
              </strong>{" "}
              · {review.proposal.kind}
            </p>
            <p className="muted break-all">Paskirtis: {review.destination}</p>
            <p className="mt-3">
              Šaltinis:{" "}
              {review.proposal.source.type === "document" ? (
                <Link
                  className="text-link"
                  href={`/knowledge?document=${review.proposal.source.id}&revision=${review.proposal.source.revision}`}
                >
                  Dokumentas v{review.proposal.source.revision}
                </Link>
              ) : (
                <Link
                  className="text-link"
                  href={`/chat?conversation=${review.sourceConversation}#message-${review.proposal.source.id}`}
                >
                  Pokalbio žinutė
                </Link>
              )}
            </p>
            {review.sourceText && (
              <details className="mt-3">
                <summary>Šaltinio žinutė</summary>
                <p className="whitespace-pre-wrap break-words">
                  {review.sourceText}
                </p>
              </details>
            )}
            {review.peers.map((p) => (
              <div className="notice mt-3" key={p.document.id}>
                <strong>
                  {p.document.id === review.proposal.replaces
                    ? "Bus aiškiai pakeistas (istorija išliks)"
                    : "Galimas konfliktas — lieka atskiras teiginys"}
                </strong>
                <p>{p.body}</p>
              </div>
            ))}
            {!!review.peers.filter(
              (p) => p.document.id !== review.proposal.replaces,
            ).length && (
              <label className="knowledge-check mt-3">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />{" "}
                Peržiūrėjau galimus konfliktus ir aiškiai palieku abu teiginius.
              </label>
            )}
            <div className="flex flex-wrap gap-3 mt-3">
              <button
                className="button button-primary"
                disabled={
                  busy ||
                  review.proposal.state !== "pending" ||
                  (review.peers.some(
                    (p) => p.document.id !== review.proposal.replaces,
                  ) &&
                    !ack)
                }
                onClick={() =>
                  act(async () => {
                    await knowledgeRequest("", {
                      action: "accept",
                      id: review.proposal.id,
                      reviewHash: review.proposal.reviewHash,
                      acknowledgeConflicts: ack,
                    });
                    setReview(null);
                    await load();
                    setNotice(
                      "Atmintis patvirtinta ir išsaugota Markdown. Laukiama indeksavimo.",
                    );
                  })
                }
              >
                Patvirtinti ir įrašyti atmintį
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await knowledgeRequest("", {
                      action: "reject",
                      id: review.proposal.id,
                    });
                    setReview(null);
                    await load();
                  })
                }
              >
                Atmesti pasiūlymą
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
