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
import { PageHeading } from "./dashboard";
import { Badge, EmptyState, SectionTitle } from "./ui";
import type { Agent, Dashboard } from "@/domain/models";
export interface Setup {
  database: boolean;
  model: string;
  paperclip: string;
  modelEnabled: boolean;
}
export type DisplayRun = Run & { taskUrl?: string | null };
export interface Snapshot {
  conversation: Conversation;
  messages: Message[];
  runs: DisplayRun[];
  turns: Turn[];
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
}: {
  run: DisplayRun;
  onChange?: (r: DisplayRun) => void;
}) {
  const [current, setCurrent] = useState(run);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Parent snapshots carry worker updates; keyed parent refresh remounts this card.
  const stale = isStale(current.syncedAt);
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
      setCurrent(next);
      onChange?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veiksmas nepavyko.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="run-card">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge tone={current.state === "completed" ? "accent" : "neutral"}>
          {runLabels[current.state]}
        </Badge>
        {current.externalTaskId &&
          stale &&
          !["completed", "cancelled", "failed"].includes(current.state) && (
            <Badge>Duomenys pasenę</Badge>
          )}
        {!current.tracking && <Badge>Stebėjimas sustabdytas</Badge>}
      </div>
      <h3 className="text-lg font-semibold">{current.plan.title}</h3>
      <p className="muted text-sm mt-2">{current.plan.objective}</p>
      <div className="mt-5 text-sm space-y-4">
        <div>
          <p className="overline mb-2">Ribota užduotis</p>
          <p className="whitespace-pre-wrap break-words">
            {current.plan.boundedTask}
          </p>
        </div>
        <div>
          <p className="overline mb-2">Siūlomas agentas</p>
          <p>
            {current.plan.agentName ??
              (current.plan.agentId
                ? "Agentas pažymėtu identifikatoriumi"
                : "Nepriskirtas — reikia parengti agentą")}
          </p>
          {current.plan.agentId && (
            <code className="text-xs text-stone-500 break-all">
              {current.plan.agentId}
            </code>
          )}
        </div>
        <div>
          <p className="overline mb-2">Priėmimo kriterijai</p>
          <ul className="list-disc pl-5 space-y-1">
            {current.plan.completionCriteria.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
        <details open={!current.confirmedAt}>
          <summary className="cursor-pointer font-medium">Apribojimai</summary>
          <ul className="list-disc pl-5 mt-3 space-y-1 text-stone-600">
            {current.plan.constraints.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>
      </div>
      {current.errorCode && (
        <p className="notice mt-5" role="status">
          {errorLabels[current.errorCode] ??
            "Reikia patikrinti vykdymo būseną."}
        </p>
      )}
      {current.externalTaskId && (
        <div className="run-external">
          <p className="text-xs">
            Išorinė būsena:{" "}
            <strong>{current.externalStatus ?? "dar negauta"}</strong>
          </p>
          <p className="text-xs text-stone-500 mt-2">
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
          <p className="text-xs text-stone-500 mt-3">
            Užduoties sukūrimas neįrodo, kad agentas pradėjo dirbti. „Baigta“
            reiškia Paperclip būseną; rezultatus vis tiek peržiūrėkite.
          </p>
        </div>
      )}
      {current.result && (
        <details className="mt-5">
          <summary className="font-medium cursor-pointer">
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
            <summary className="text-sm cursor-pointer">
              Užduoties aprašymas
            </summary>
            <pre className="result-text">
              {current.result.description ?? "Aprašymo nėra."}
            </pre>
          </details>
        </details>
      )}
      <div className="flex flex-wrap gap-2 mt-6">
        {current.state === "awaiting_confirmation" && !current.confirmedAt && (
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
        <p className="text-xs text-stone-500 mt-3">
          Patvirtinimas gali pradėti agento darbą ir naudoti Paperclip nustatytą
          biudžetą. Jokių produkcijos pakeitimų neleidžiama.
        </p>
      )}
      {!current.tracking && current.confirmedAt && (
        <p className="notice mt-4">
          Sustabdytas tik vietinis stebėjimas. Išorinis Paperclip darbas nebuvo
          atšauktas.
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
    </article>
  );
}
export function RunFeed({ runs }: { runs: DisplayRun[] }) {
  return (
    <div className="space-y-5">
      {runs.map((run) => (
        <RunCard
          key={`${run.id}-${run.state}-${run.syncedAt}-${run.errorCode}-${run.tracking}`}
          run={run}
        />
      ))}
    </div>
  );
}
export function LiveOverview({
  data,
  runs,
  error,
}: {
  data: Dashboard;
  runs: DisplayRun[];
  error?: string;
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
  const blocked = runs.filter(
    (r) => r.state === "blocked" || r.state === "failed",
  );
  return (
    <>
      <PageHeading
        eyebrow="Savininko darbo erdvė"
        title="Jūsų darbų eiga — vienoje vietoje."
        description="Išsaugoti pokalbiai, patvirtinimai ir Paperclip pateikta būsena."
        action={
          <Link href="/chat" className="button button-primary">
            <ChatCircle size={18} />
            Atverti pokalbį
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
      <div className="live-grid">
        <section>
          <SectionTitle
            title={
              pending.length
                ? "Jūsų sprendimo laukiantys planai"
                : "Naujausi vykdymo įrašai"
            }
          />
          {runs.length ? (
            <RunFeed
              runs={[
                ...pending,
                ...runs.filter((r) => r.state !== "awaiting_confirmation"),
              ].slice(0, 10)}
            />
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
                  ? "Sukonfigūruokite operacinių duomenų saugyklą. Kol ji nepasiekiama, darbų kiekis nežinomas."
                  : "Aprašykite nedidelę užduotį. Modelis pateiks atsakymą arba ribotą planą jūsų peržiūrai."}
                <div className="mt-5">
                  <Link href="/chat" className="button">
                    Pradėti
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </EmptyState>
            </div>
          )}
        </section>
        <aside>
          <SectionTitle title="Naujausia veikla" />
          <div className="space-y-4">
            {data.activity.map((a) => (
              <div className="border-b border-stone-200 pb-4" key={a.id}>
                <p className="font-medium text-sm">{a.title}</p>
                <p className="muted text-xs mt-2">{a.detail}</p>
                <p className="muted text-xs mt-2">{a.time}</p>
              </div>
            ))}
            {!data.activity.length && (
              <p className="muted text-sm">
                {error
                  ? "Veiklos istorija nepasiekiama."
                  : "Išsaugotų įvykių dar nėra."}
              </p>
            )}
          </div>
          <Link href="/settings" className="text-link mt-6">
            Programos ryšiai
            <ArrowUpRight size={15} />
          </Link>
        </aside>
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
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inflight = useRef<AbortController | null>(null);
  const [attempt, setAttempt] = useState<{
    conversationId: string;
    requestId: string;
    text: string;
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
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (inflight.current || busy || (!attempt && !text.trim())) return;
    const body = attempt ?? {
      conversationId: conversationId ?? crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      text: text.trim(),
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
        title="Aiški mintis. Peržiūrimas kitas žingsnis."
        description="Pokalbio istorija saugoma PostgreSQL. Darbai deleguojami tik po jūsų patvirtinimo."
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
          <div className="chat-setup">
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
          {loading && (
            <p className="p-6 muted" role="status">
              Tikrinama išsaugota būsena…
            </p>
          )}
          <div className="chat-messages">
            {snapshot?.messages.map((m) => (
              <article className={`message message-${m.role}`} key={m.id}>
                <p className="overline mb-3">
                  {m.role === "user" ? "Jūs" : "Modelio atsakymas"}
                </p>
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
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
              <div className="mt-6">
                <RunFeed runs={snapshot.runs} />
              </div>
            )}
          </div>
          <form className="chat-composer" onSubmit={send}>
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
        title="Tikroji agentų parengtis."
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
