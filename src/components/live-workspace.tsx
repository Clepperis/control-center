"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChatCircle,
  PaperPlaneTilt,
  Plus,
  ArrowClockwise,
  WarningCircle,
  CaretRight,
  Circle,
} from "@phosphor-icons/react";
import {
  errorLabels,
  isStale,
  runLabels,
  type Conversation,
  type Message,
  type Run,
  type Turn,
} from "@/domain/orchestration";
import { PageHeading, WorkspaceStatus, RecentActivity } from "./dashboard";
import { Badge, EmptyState, SectionTitle } from "./ui";
import type { Agent, Dashboard } from "@/domain/models";
import type { AutomationRun } from "@/domain/automations";
import { AutomationFeed } from "./automations";
import { knowledgeRequest } from "./knowledge";
import type { Project, KnowledgeScope } from "@/domain/knowledge";
export interface Setup {
  database: boolean;
  model: string;
  paperclip: string;
  modelEnabled: boolean;
  n8nExecutionEnabled?: boolean;
}
export type DisplayRun = Run & { taskUrl?: string | null };
export interface Snapshot {
  conversation: Conversation;
  messages: Message[];
  runs: DisplayRun[];
  turns: Turn[];
  automationRuns?: AutomationRun[];
}
async function request<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Nepavyko gauti atsakymo.");
  return value;
}
export function RunCard({
  run,
  onChange,
  defaultOpen = false,
}: {
  run: DisplayRun;
  onChange?: (r: DisplayRun) => void;
  defaultOpen?: boolean;
}) {
  const version = [
    run.state,
    run.syncedAt,
    run.errorCode,
    run.tracking,
    run.confirmedAt,
    run.externalTaskId,
  ].join("|");
  const [update, setUpdate] = useState<{
    source: string;
    value: DisplayRun;
  } | null>(null);
  const current = update?.source === version ? update.value : run;
  const [expanded, setExpanded] = useState(defaultOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stale = isStale(current.syncedAt);
  const tone =
    current.state === "completed"
      ? "positive"
      : current.state === "failed"
        ? "danger"
        : ["blocked", "awaiting_confirmation"].includes(current.state)
          ? "warning"
          : ["running", "review"].includes(current.state)
            ? "accent"
            : "muted";
  async function act(action: "confirm" | "refresh" | "stop") {
    setBusy(true);
    setError("");
    try {
      const next = await request<DisplayRun>(
        `/api/runs/${current.id}`,
        action === "confirm"
          ? { action, planHash: current.planHash }
          : { action },
      );
      setUpdate({ source: version, value: next });
      onChange?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veiksmas nepavyko.");
    } finally {
      setBusy(false);
    }
  }
  const agent =
    current.plan.agentName ??
    (current.plan.agentId ? "Pasirinktas agentas" : "Agentas nepriskirtas");
  return (
    <details
      id={`run-${current.id}`}
      className="run-card"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="run-summary">
        <Circle size={14} className={`run-state-${current.state}`} />
        <div className="min-w-0">
          <h3>{current.plan.title}</h3>
          <div className="run-row-meta">
            <Badge tone={tone}>{runLabels[current.state]}</Badge>
            <span>{agent}</span>
            <time dateTime={current.syncedAt ?? current.createdAt}>
              {new Date(current.syncedAt ?? current.createdAt).toLocaleString(
                "lt-LT",
                { timeZone: "Europe/Vilnius" },
              )}
            </time>
            {current.externalTaskId &&
              stale &&
              !["completed", "cancelled", "failed"].includes(current.state) && (
                <Badge tone="warning">Duomenys pasenę</Badge>
              )}
            {!current.tracking && (
              <Badge tone="muted">Stebėjimas sustabdytas</Badge>
            )}
          </div>
        </div>
        <CaretRight size={16} className="run-chevron" />
      </summary>
      <div className="run-detail">
        <p className="run-objective">{current.plan.objective}</p>
        <div className="plan-fields">
          <div>
            <h4>Ribota užduotis</h4>
            <p className="whitespace-pre-wrap break-words">
              {current.plan.boundedTask}
            </p>
          </div>
          <div className="plan-pair">
            <div>
              <h4>Siūlomas agentas</h4>
              <p>{agent}</p>
              {!current.plan.agentId && (
                <p className="muted mt-2">
                  Prieš deleguojant reikia parengti ir leisti agentą.
                </p>
              )}
              {current.plan.agentId && (
                <details className="mt-3">
                  <summary className="muted text-xs">
                    Agento identifikatorius
                  </summary>
                  <code className="text-xs break-all">
                    {current.plan.agentId}
                  </code>
                </details>
              )}
            </div>
            <div>
              <h4>Priėmimo kriterijai</h4>
              <ul className="list-disc pl-5 space-y-1">
                {current.plan.completionCriteria.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
          <details open={!current.confirmedAt}>
            <summary className="text-sm font-medium">Apribojimai</summary>
            <ul className="list-disc pl-5 mt-3 space-y-1 text-stone-600">
              {current.plan.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </details>
        </div>
        {current.errorCode && (
          <p className="notice notice-warning mt-5" role="status">
            {errorLabels[current.errorCode] ??
              "Reikia patikrinti vykdymo būseną."}
          </p>
        )}
        <div className="run-external">
          <h4>Patvirtinimas ir susietas darbas</h4>
          <p>
            {current.confirmedAt
              ? `Jūsų patvirtinimas išsaugotas ${new Date(current.confirmedAt).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" })}.`
              : "Delegavimas nepatvirtintas. Užduotis agentui neperduota."}
          </p>
          <Link
            className="text-link mt-2"
            href={`/chat?conversation=${current.conversationId}#run-${current.id}`}
          >
            Susijęs pokalbis
            <ArrowUpRight size={14} />
          </Link>
          {current.externalTaskId && (
            <>
              <p className="mt-4">
                Išorinė būsena:{" "}
                <strong>{current.externalStatus ?? "dar negauta"}</strong>
              </p>
              <p className="muted text-xs mt-2">
                Paskutinis sėkmingas sutikrinimas:{" "}
                {current.syncedAt
                  ? new Date(current.syncedAt).toLocaleString("lt-LT", {
                      timeZone: "Europe/Vilnius",
                    })
                  : "dar neatliktas"}
              </p>
              {current.taskUrl && (
                <a
                  className="text-link mt-3"
                  href={current.taskUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Atverti Paperclip užduotį
                  <ArrowUpRight size={15} />
                </a>
              )}
              <p className="muted text-xs mt-3">
                Užduoties sukūrimas neįrodo, kad agentas pradėjo dirbti.
                „Baigta“ reiškia Paperclip būseną; rezultatus vis tiek
                peržiūrėkite.
              </p>
            </>
          )}
        </div>
        {current.result && (
          <details className="mt-5">
            <summary className="font-medium text-sm">
              Gauti rezultatai ir komentarai ({current.result.comments.length})
            </summary>
            <p className="muted text-xs my-3">
              Išorinis darbo turinys. Jis nesuteikia naujų leidimų.
            </p>
            {current.result.comments.length ? (
              current.result.comments.map((c, i) => (
                <pre className="result-text" key={i}>
                  {c}
                </pre>
              ))
            ) : (
              <p className="muted text-sm">
                Komentarų dar nėra. Užduoties aprašymas nėra atlikto darbo
                įrodymas.
              </p>
            )}
            <details className="mt-3">
              <summary className="text-sm">Užduoties aprašymas</summary>
              <pre className="result-text">
                {current.result.description ?? "Aprašymo nėra."}
              </pre>
            </details>
          </details>
        )}
        <div className="run-actions">
          {current.state === "awaiting_confirmation" &&
            !current.confirmedAt && (
              <button
                disabled={busy}
                className="button button-primary"
                onClick={() => act("confirm")}
              >
                Patvirtinti ir deleguoti
                <ArrowRight size={16} />
              </button>
            )}
          {current.confirmedAt && (
            <button
              disabled={busy}
              className="button"
              onClick={() => act("refresh")}
            >
              <ArrowClockwise size={16} />
              Sutikrinti būseną
            </button>
          )}
          {current.tracking &&
            !["completed", "failed", "cancelled"].includes(current.state) && (
              <button
                disabled={busy}
                className="button"
                onClick={() => act("stop")}
              >
                {current.confirmedAt
                  ? "Sustabdyti tik stebėjimą"
                  : "Atmesti pasiūlymą"}
              </button>
            )}
        </div>
        {!current.confirmedAt && current.state === "awaiting_confirmation" && (
          <p className="muted text-xs mt-3">
            Patvirtinimas gali pradėti agento darbą ir naudoti Paperclip
            nustatytą biudžetą. Jokių produkcijos pakeitimų neleidžiama.
          </p>
        )}
        {!current.tracking && current.confirmedAt && (
          <p className="notice mt-4">
            Sustabdytas tik vietinis stebėjimas. Išorinis Paperclip darbas
            nebuvo atšauktas.
          </p>
        )}
        {busy && (
          <p className="muted text-sm mt-3" role="status">
            Tikrinama ir išsaugoma…
          </p>
        )}
        {error && (
          <p className="form-error mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}

export function RunFeed({
  runs,
  conversation = false,
}: {
  runs: DisplayRun[];
  conversation?: boolean;
}) {
  const groups = [
    { title: "Laukia jūsų sprendimo", states: ["awaiting_confirmation"] },
    { title: "Reikia dėmesio", states: ["blocked", "failed"] },
    {
      title: "Aktyvūs darbai",
      states: ["delegating", "delegated", "running", "review"],
    },
    { title: "Užbaigti ir atšaukti", states: ["completed", "cancelled"] },
  ];
  const cards = (items: DisplayRun[]) =>
    items.map((run) => (
      <RunCard key={run.id} run={run} defaultOpen={conversation} />
    ));
  if (conversation) return <div className="run-list">{cards(runs)}</div>;
  return (
    <div className="run-groups">
      {groups.map((group) => {
        const items = runs.filter((r) => group.states.includes(r.state));
        return items.length ? (
          <section key={group.title} aria-label={group.title}>
            <div className="run-group-title">
              {group.title}
              <span>{items.length}</span>
            </div>
            <div className="run-list">{cards(items)}</div>
          </section>
        ) : null;
      })}
    </div>
  );
}

export function LiveOverview({
  data,
  runs,
  error,
  automationRuns = [],
  automationEnabled = false,
}: {
  data: Dashboard;
  runs: DisplayRun[];
  error?: string;
  automationRuns?: AutomationRun[];
  automationEnabled?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  const pending = runs.filter((r) => r.state === "awaiting_confirmation");
  const active = runs.filter((r) =>
    ["delegating", "delegated", "running", "review"].includes(r.state),
  );
  const blocked = runs.filter((r) => ["blocked", "failed"].includes(r.state));
  return (
    <>
      <PageHeading
        eyebrow="Savininko darbo erdvė"
        title="Apžvalga"
        description="Sprendimai, darbai ir paskutinė išsaugota jų būsena."
        action={
          <Link href="/chat" className="button button-primary">
            <ChatCircle size={17} />
            Atverti pokalbį
            <ArrowUpRight size={15} />
          </Link>
        }
      />
      {error && (
        <p role="status" className="notice mb-6">
          {error}
        </p>
      )}
      <div className="live-summary">
        <div>
          <strong>{error ? "—" : pending.length}</strong>
          <span>Laukia patvirtinimo</span>
        </div>
        <div>
          <strong>{error ? "—" : active.length}</strong>
          <span>Perduoti ir stebimi darbai</span>
        </div>
        <div>
          <strong>{error ? "—" : blocked.length}</strong>
          <span>Reikia dėmesio</span>
        </div>
      </div>
      <div className="overview-layout">
        <div className="overview-main">
          <section>
            <SectionTitle
              title="Darbų eiga"
              href="/projects"
              action="Visi įrašai"
            />
            {runs.length ? (
              <RunFeed runs={runs} />
            ) : (
              <div className="panel">
                <EmptyState
                  title={
                    error
                      ? "Darbo būsena kol kas nepasiekiama"
                      : "Pirmas žingsnis — pokalbis"
                  }
                >
                  {error
                    ? "Kol duomenų saugykla nepasiekiama, darbų kiekis nežinomas."
                    : "Aprašykite nedidelę užduotį. Modelis pateiks atsakymą arba ribotą planą jūsų peržiūrai."}
                  <div className="mt-5">
                    <Link href="/chat" className="button">
                      Atverti pokalbį
                      <ArrowRight size={16} />
                    </Link>
                  </div>
                </EmptyState>
              </div>
            )}
          </section>
          {!!automationRuns.length && (
            <AutomationFeed runs={automationRuns} enabled={automationEnabled} />
          )}
          <RecentActivity activity={data.activity} error={error} />
        </div>
        <WorkspaceStatus data={data} />
      </div>
    </>
  );
}

export function LiveChat({ setup }: { setup: Setup }) {
  const search = useSearchParams();
  const firstId = search.get("conversation");
  const [conversationId, setConversationId] = useState<string | null>(
    firstId && /^[\da-f-]{36}$/i.test(firstId) ? firstId : null,
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [text, setText] = useState("");
  const [projects, setProjects] = useState<Project[]>([]),
    [projectId, setProjectId] = useState(""),
    [useKnowledge, setUseKnowledge] = useState(false),
    [includeGlobal, setIncludeGlobal] = useState(false),
    [knowledgeError, setKnowledgeError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inflight = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState<{
    conversationId: string;
    requestId: string;
    text: string;
    knowledge: KnowledgeScope | null;
  } | null>(null);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!setup.database) return;
      const workspace = await request<{ conversations: Conversation[] }>(
        "/api/workspace",
        undefined,
        signal,
      );
      setConversations(workspace.conversations);
      if (conversationId) {
        const next = await request<Snapshot>(
          `/api/conversations/${conversationId}`,
          undefined,
          signal,
        );
        setSnapshot(next);
      }
    },
    [conversationId, setup.database],
  );
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted)
        load(controller.signal)
          .then(() => setLoading(false))
          .catch((e) => {
            if (!controller.signal.aborted) {
              setError(e.message);
              setLoading(false);
            }
          });
    });
    const timer = setInterval(() => {
      load(controller.signal).catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    }, 10000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => () => inflight.current?.abort(), []);
  useEffect(() => {
    knowledgeRequest<{ projects: Project[] }>("?op=projects")
      .then((v) => setProjects(v.projects))
      .catch((e) => setKnowledgeError(e.message));
  }, []);
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (inflight.current || busy || (!attempt && !text.trim())) return;
    const body = attempt ?? {
      conversationId: conversationId ?? crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      text: text.trim(),
      knowledge: useKnowledge
        ? { projectId: projectId || null, includeGlobal }
        : null,
    };
    setAttempt(body);
    setConversationId(body.conversationId);
    window.history.replaceState(
      null,
      "",
      `/chat?conversation=${body.conversationId}`,
    );
    setBusy(true);
    setError("");
    const controller = new AbortController();
    inflight.current = controller;
    try {
      const next = await request<Snapshot>(
        "/api/chat",
        body,
        controller.signal,
      );
      setSnapshot(next);
      setAttempt(null);
      setText("");
      setError("");
      await load();
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Laukimas nutrauktas. Patikrinkite išsaugotą užklausos būseną; naujas kvietimas nekuriamas."
          : e instanceof Error
            ? e.message
            : "Užklausa nutrūko.",
      );
    } finally {
      setBusy(false);
      inflight.current = null;
    }
  }
  const pending = snapshot?.turns.some((t) => t.status === "pending");
  function choose(id: string | null) {
    if (busy || attempt) return;
    setConversationId(id);
    window.history.replaceState(
      null,
      "",
      id ? `/chat?conversation=${id}` : "/chat",
    );
    setSnapshot(null);
    setError("");
    setText("");
  }
  return (
    <>
      <PageHeading
        eyebrow="Pokalbis ir planavimas"
        title="Pokalbis"
        description="Atsakymai, planai ir deleguotų darbų eiga."
      />
      <div className="chat-layout">
        <aside className="chat-history">
          <button
            className="button w-full mb-5"
            disabled={busy || !!attempt}
            onClick={() => choose(null)}
          >
            <Plus size={17} />
            Naujas pokalbis
          </button>
          <p className="overline mb-3">Pokalbių istorija</p>
          {conversations.map((c) => (
            <button
              className={`history-item ${conversationId === c.id ? "history-selected" : ""}`}
              key={c.id}
              onClick={() => choose(c.id)}
              disabled={busy || !!attempt}
            >
              {c.title}
            </button>
          ))}
          {!conversations.length && (
            <p className="muted text-xs">Išsaugotų pokalbių dar nėra.</p>
          )}
        </aside>
        <section className="panel chat-main">
          <details
            className="chat-setup"
            open={!setup.database || !setup.modelEnabled}
          >
            <summary>
              Ryšio parengtis
              <CaretRight size={15} />
            </summary>
            <div>
              <p>
                <strong>Modelis:</strong> {setup.model}
              </p>
              <p className="mt-2">
                <strong>Paperclip:</strong> {setup.paperclip}
              </p>
              {!setup.database && (
                <p className="mt-2">
                  <strong>PostgreSQL:</strong> nurodykite DATABASE_URL ir
                  pritaikykite migracijas.
                </p>
              )}
            </div>
          </details>
          {loading && (
            <p className="p-6 muted" role="status">
              Tikrinama išsaugota būsena…
            </p>
          )}
          <div className="chat-messages">
            {snapshot?.messages.map((m) => (
              <article
                id={`message-${m.id}`}
                className={`message message-${m.role}`}
                key={m.id}
              >
                <p className="overline mb-3">
                  {m.role === "user" ? "Jūs" : "Modelio atsakymas"}
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {m.content.split(/(\[S[1-6]\])/g).map((part, i) =>
                    m.grounding?.cited.includes(part.slice(1, -1)) ? (
                      <Link
                        className="text-link"
                        key={i}
                        href={`/knowledge?message=${m.id}&citation=${part.slice(1, -1)}`}
                      >
                        {part}
                      </Link>
                    ) : (
                      part
                    ),
                  )}
                </p>
                {m.role === "assistant" && (
                  <div className="knowledge-chat-status mt-3">
                    <p className="muted text-xs">
                      {m.grounding?.scope
                        ? `Aprėptis: ${projects.find((p) => p.id === m.grounding!.scope!.projectId)?.name ?? (m.grounding.scope.projectId ? "Projektas" : "Bendros žinios")}${m.grounding.scope.projectId && m.grounding.scope.includeGlobal ? " ir bendros žinios" : ""}. `
                        : ""}
                      {m.grounding?.status === "used"
                        ? "Atsakymui pateiktos šaltinių ištraukos; citatas patikrinkite."
                        : m.grounding?.status === "uncited"
                          ? "Ištraukos pateiktos, bet atsakymas jų necituoja. Šaltinių pagrindimas nepatvirtintas."
                          : m.grounding?.status === "empty"
                            ? "Tinkamų indeksuotų ištraukų nerasta. Atsakymas be projekto žinių pagrindimo."
                            : m.grounding?.status === "unavailable"
                              ? "Žinių paieška nepasiekiama. Atsakymas pateiktas be projekto žinių."
                              : "Atsakymas pateiktas be projekto žinių paieškos."}
                    </p>
                    <Link className="text-link text-xs mt-2" href="/knowledge">
                      Žinios ir laukiantys atminties pasiūlymai
                    </Link>
                  </div>
                )}
                {m.usage &&
                  Object.values(m.usage).some((v) => v !== undefined) && (
                    <p className="text-xs text-stone-500 mt-3">
                      Gauta naudojimo ataskaita:{" "}
                      {m.usage.totalTokens !== undefined
                        ? `${m.usage.totalTokens} žetonų`
                        : "bendras žetonų kiekis nenurodytas"}
                      {m.usage.credits !== undefined
                        ? ` · ${m.usage.credits} nexos kreditų`
                        : ""}
                    </p>
                  )}
              </article>
            ))}
            {!snapshot?.messages.length && !busy && (
              <EmptyState title="Ką norėtumėte nuveikti?">
                Pradėkite nuo vienos nedidelės užduoties. Galėsite peržiūrėti
                siūlomą agentą, apimtį ir priėmimo kriterijus.
              </EmptyState>
            )}
            {(busy || pending) && (
              <p className="notice" role="status">
                Laukiama modelio atsakymo. Delegavimas nepradėtas.
              </p>
            )}
            {snapshot?.turns
              .filter((t) => t.status === "failed")
              .map((t) => (
                <p className="notice mt-3" key={t.id}>
                  {errorLabels[t.errorCode ?? "provider"] ??
                    "Atsakymo gauti nepavyko."}{" "}
                  Išsaugotas tekstas nekartojamas automatiškai.
                </p>
              ))}
            {snapshot && (
              <section
                className="mt-6"
                aria-label="Pokalbio pasiūlymai ir vykdymai"
              >
                {snapshot.runs.length > 0 && (
                  <h2 className="overline mb-4">Delegavimo planai</h2>
                )}
                <RunFeed runs={snapshot.runs} conversation />
                {!!snapshot.automationRuns?.length && (
                  <div className="mt-5">
                    <AutomationFeed
                      runs={snapshot.automationRuns}
                      enabled={setup.n8nExecutionEnabled}
                    />
                  </div>
                )}
              </section>
            )}
          </div>
          <form className="chat-composer" onSubmit={send}>
            <div className="knowledge-toolbar mb-4">
              <label className="knowledge-check">
                <input
                  type="checkbox"
                  checked={useKnowledge}
                  disabled={busy || !!attempt}
                  onChange={(e) => setUseKnowledge(e.target.checked)}
                />{" "}
                Naudoti projekto žinias
              </label>
              {useKnowledge && (
                <>
                  <label>
                    Aktyvus projektas
                    <select
                      className="input"
                      value={projectId}
                      disabled={busy || !!attempt}
                      onChange={(e) => setProjectId(e.target.value)}
                    >
                      <option value="">
                        Pasirinkite projektą arba bendras žinias
                      </option>
                      {projects.map((p) => (
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
                      disabled={busy || !!attempt}
                      onChange={(e) => setIncludeGlobal(e.target.checked)}
                    />{" "}
                    Leisti bendras žinias
                  </label>
                  <p className="muted text-xs">
                    Aprėptis:{" "}
                    {projects.find((p) => p.id === projectId)?.name ??
                      "Tik aiškiai leistos bendros žinios"}
                    . Žinių klausimas nesiūlo agentų ar automatizacijų vykdymo.
                  </p>
                </>
              )}
            </div>
            {useKnowledge && knowledgeError && (
              <p className="notice mb-3">{knowledgeError}</p>
            )}
            <label
              htmlFor="live-message"
              className="block font-medium text-sm mb-2"
            >
              Jūsų žinutė
            </label>
            <textarea
              id="live-message"
              className="input"
              rows={3}
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Aprašykite tikslą ir apribojimus…"
              disabled={
                busy ||
                pending ||
                !!attempt ||
                !setup.database ||
                !setup.modelEnabled
              }
            />
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                type="submit"
                className="button button-primary"
                disabled={
                  busy ||
                  pending ||
                  !!attempt ||
                  !text.trim() ||
                  (useKnowledge && !projectId && !includeGlobal) ||
                  !setup.database ||
                  !setup.modelEnabled
                }
              >
                <PaperPlaneTilt size={16} />
                Siųsti modeliui
              </button>
              {busy && (
                <button
                  type="button"
                  className="button"
                  onClick={() => inflight.current?.abort()}
                >
                  Nutraukti laukimą
                </button>
              )}
              {attempt && !busy && (
                <button type="button" className="button" onClick={() => send()}>
                  Gauti tos pačios užklausos būseną
                </button>
              )}
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  load()
                    .then(() => setError(""))
                    .catch((e) => setError(e.message))
                }
              >
                <ArrowClockwise size={16} />
                Atnaujinti peržiūrą
              </button>
            </div>
            <p className="text-xs text-stone-500 mt-3">
              Siuntimas gali naudoti pasirinkto modelio kreditus. Delegavimas
              patvirtinamas atskirai.
            </p>
            {error && (
              <p className="form-error mt-4" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>
      </div>
    </>
  );
}
export function LiveAgents() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function check() {
    setBusy(true);
    setError("");
    try {
      setAgents((await request<{ agents: Agent[] }>("/api/agents")).agents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ryšio patikrinti nepavyko.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Agentai"
        title="Agentai"
        description="Tikrinama programos operatoriaus prieiga ir leidžiamų agentų sąrašas. Agentai neaktyvuojami ir jų nustatymai nekeičiami."
        action={
          <button className="button" disabled={busy} onClick={check}>
            <ArrowClockwise size={17} />
            Patikrinti agentus
          </button>
        }
      />
      {error && (
        <p className="notice mb-5" role="alert">
          {error}
        </p>
      )}
      <div className="panel">
        {agents?.map((a) => (
          <div className="project-row" key={a.id}>
            <div className="flex-1">
              <h2 className="font-semibold">{a.name}</h2>
              <p className="muted text-sm">
                {a.role} · Paperclip būsena: {a.status}
              </p>
            </div>
            <Badge tone={a.eligible ? "accent" : "neutral"}>
              {a.eligible
                ? "Galima siūlyti delegavimui"
                : "Neparengtas arba neleidžiamas"}
            </Badge>
          </div>
        ))}
        {!agents?.length && (
          <EmptyState
            title={agents ? "Agentų nėra" : "Parengtis dar nepatikrinta"}
            icon={<WarningCircle size={28} />}
          >
            Prieiga tikrinama tik naudojant atskirus šios programos prisijungimo
            duomenis. Pauzė, nežinoma parengtis ar tuščias leidimų sąrašas
            blokuoja delegavimą.
          </EmptyState>
        )}
      </div>
    </>
  );
}
