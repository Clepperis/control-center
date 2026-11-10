"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowClockwise, Plus, Wrench } from "@phosphor-icons/react";
import { PageHeading } from "./dashboard";
import { Badge, EmptyState, Modal, SectionTitle } from "./ui";
import { DraftForm } from "./secondary-pages";
import { SafeMarkdown } from "./safe-markdown";
import { isStale } from "@/domain/orchestration";
import {
  improvementLabels,
  improvementErrors,
  type Improvement,
  type ImprovementPlan,
  type RuntimePolicy,
} from "@/domain/improvements";

interface Setup {
  repository: string;
  target: string;
  executorEnabled: boolean;
  blockers: string[];
}
export async function improvementRequest<T>(
  body?: unknown,
  id?: string,
  op?: string,
): Promise<T> {
  const response = await fetch(
    `/api/improvements${id ? `?id=${encodeURIComponent(id)}` : op ? `?op=${op}` : ""}`,
    {
      method: body ? "POST" : "GET",
      cache: "no-store",
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Nepavyko pasiekti tobulinimo erdvės.");
  return result;
}
const time = (value: string) => new Date(value).toLocaleString("lt-LT");
export function ImprovementWorkspace({ live }: { live: boolean }) {
  const [items, setItems] = useState<Improvement[]>([]),
    [selected, setSelected] = useState<string | null>(null),
    [setup, setSetup] = useState<Setup | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [text, setText] = useState(""),
    [project, setProject] = useState(""),
    [global, setGlobal] = useState(false),
    [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const intakeKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    try {
      const result = await improvementRequest<{
        requests: Improvement[];
        setup: Setup;
      }>();
      setItems(result.requests);
      setSetup(result.setup);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    if (!live) return;
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 5000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [live, load]);
  useEffect(() => {
    if (!live) return;
    void fetch("/api/knowledge?op=projects", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((r) => setProjects(r.projects ?? []))
      .catch(() => {});
  }, [live]);
  const current = items.find((i) => i.id === selected) ?? items[0] ?? null;
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await improvementRequest<{ request: Improvement }>(body);
      setSelected(result.request.id);
      setItems((old) => [
        result.request,
        ...old.filter((r) => r.id !== result.request.id),
      ]);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    intakeKey.current ??= crypto.randomUUID();
    if (
      await act({
        action: "create",
        key: intakeKey.current,
        text,
        projectId: project || null,
        includeGlobal: global,
      })
    ) {
      setText("");
      intakeKey.current = null;
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="Tobulinti sistemą"
        title="Tobulinti sistemą"
        description="Atskiras platformos inžinieriaus pokalbis. Aptarkite, ištirkite ir peržiūrėkite tikslų pakeitimą. Įgyvendinimas, integravimas ir diegimas turi atskiras ribas."
        action={
          live ? (
            <button
              className="button"
              disabled={busy}
              onClick={() => {
                setError("");
                void load();
              }}
            >
              <ArrowClockwise size={16} />
              Atnaujinti
            </button>
          ) : undefined
        }
      />
      {!live ? (
        <div className="panel p-5">
          <Badge>Demonstracija · vykdymas neprijungtas</Badge>
          <p className="muted my-4">
            Tikram pokalbiui ir pakeitimų istorijai įjunkite programos duomenų
            režimą ir PostgreSQL. Kodavimo vykdytojas įjungiamas atskirai.
          </p>
          <DraftForm
            kind="improve"
            label="Ką norėtumėte patobulinti?"
            placeholder="Aprašykite problemą ir norimą rezultatą…"
          />
        </div>
      ) : (
        <>
          {error && (
            <p className="notice mb-4" role="alert">
              {error}
            </p>
          )}
          {setup && (
            <details className="improve-setup mb-4">
              <summary>
                Vykdytojo parengtis ·{" "}
                {setup.executorEnabled
                  ? "bus tikrinama prieš leidimą"
                  : "išjungtas"}
              </summary>
              <p className="muted mt-3">
                {setup.repository} → {setup.target}
              </p>
              {setup.blockers.map((b) => (
                <p className="muted mt-2" key={b}>
                  {b}
                </p>
              ))}
              <p className="muted mt-3">
                Vienas Paperclip kodavimo kelias. Aplinkos patikros įrašas yra
                operatoriaus patvirtinimas, o ne automatinis vykdymo įrodymas.
                Produkcija nekeičiama.
              </p>
            </details>
          )}
          <div className="improve-layout">
            <aside className="improve-list" aria-label="Pakeitimų užklausos">
              <SectionTitle title="Pakeitimai" />
              <form onSubmit={create} className="space-y-3">
                <label htmlFor="improve-intake">
                  Ką norėtumėte patobulinti?
                </label>
                <textarea
                  id="improve-intake"
                  className="input"
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={4}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    intakeKey.current = null;
                  }}
                  placeholder="Pavyzdžiui: patikslink žinių puslapio tuščią būseną…"
                />
                <label htmlFor="improve-project">
                  Susietos projekto žinios
                </label>
                <select
                  id="improve-project"
                  className="input"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">Be projekto žinių</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="improve-check">
                  <input
                    type="checkbox"
                    checked={global}
                    onChange={(e) => setGlobal(e.target.checked)}
                  />
                  Įtraukti atrinktas bendras žinias
                </label>
                <button
                  className="button button-primary"
                  disabled={busy}
                  type="submit"
                >
                  <Plus size={15} />
                  Sukurti užklausą
                </button>
              </form>
              <div className="mt-5 space-y-1">
                {items.map((r) => (
                  <button
                    className={`improve-item ${r.id === current?.id ? "is-selected" : ""}`}
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                  >
                    <span>{r.title}</span>
                    <span className="muted">{improvementLabels[r.state]}</span>
                  </button>
                ))}
              </div>
              <details className="mt-6">
                <summary>Pranešti apie pastebėtą sutrikimą</summary>
                <p className="muted my-3">
                  Pasirinktas signalas sukurs vieną aptarimo pasiūlymą.
                  Priežastis dar nežinoma; pasikartojimai grupuojami. Kodavimas
                  nepradedamas.
                </p>
                {[
                  {
                    code: "n8n_unavailable",
                    area: "automations",
                    label: "n8n ryšys nepasiekiamas",
                  },
                  {
                    code: "run_stuck",
                    area: "orchestration",
                    label: "Vykdymas atrodo užstrigęs",
                  },
                  {
                    code: "knowledge_unavailable",
                    area: "knowledge",
                    label: "Žinių saugykla nepasiekiama",
                  },
                ].map((s) => (
                  <button
                    key={s.code}
                    className="button mt-2"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action: "signal",
                        key: crypto.randomUUID(),
                        code: s.code,
                        area: s.area,
                      })
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </details>
            </aside>
            <div className="min-w-0">
              {current ? (
                <ChangeRequest
                  key={current.id}
                  request={current}
                  busy={busy}
                  act={act}
                  selectRelated={setSelected}
                />
              ) : (
                <EmptyState
                  title="Viena vieta platformos pakeitimams"
                  icon={<Wrench size={28} />}
                >
                  Pradėkite nuo konkrečios problemos. Aptarimas ir tyrimas
                  nesuteikia leidimo keisti kodą.
                </EmptyState>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
function ChangeRequest({
  request: r,
  busy,
  act,
  selectRelated,
}: {
  request: Improvement;
  busy: boolean;
  act: (body: unknown) => Promise<boolean>;
  selectRelated: (id: string) => void;
}) {
  const [message, setMessage] = useState(""),
    [paths, setPaths] = useState("src/components/knowledge.tsx"),
    [feedback, setFeedback] = useState("");
  const command = (action: string, extra: object = {}) =>
    act({ action, id: r.id, version: r.version, ...extra });
  const editable =
    !r.submissionAttempted &&
    !["queued", "cancelled", "integrated", "integration_authorized"].includes(
      r.state,
    );
  return (
    <article className="space-y-5" aria-label="Pakeitimo darbo erdvė">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold break-words">{r.title}</h2>
        <Badge tone={r.state === "blocked" ? "warning" : "neutral"}>
          {improvementLabels[r.state]}
        </Badge>
      </div>
      <p className="muted">
        Platformos inžinierius · {time(r.updatedAt)} · diegimas nepradėtas
      </p>
      {r.signal && (
        <p className="muted">
          Grupuotas signalas · {r.signal.occurrences} kart. · paskutinį kartą{" "}
          {time(r.signal.lastSeen)}. Priežastis nepatvirtinta.
        </p>
      )}
      {r.job && (
        <p role="status" className="notice">
          {
            (
              {
                discuss: "Rengiamas atsakymas",
                investigate: "Tiriamas pasirinktas kodas",
                submit: "Laukiama kodavimo vykdytojo",
                sync: "Sutikrinama išorinė būsena",
                evidence: "Tikrinamas kandidatas ir CI",
                cancel: "Perduodamas nutraukimas",
              } as Record<string, string>
            )[r.job]
          }
          . Darbą tęsia atskiras patvarus worker.
        </p>
      )}
      {r.error && (
        <p className="notice" role="status">
          {improvementErrors[r.error] ??
            `Žingsnis sustabdytas (${r.error}). Patikrinkite konfigūraciją arba išorinę užduotį.`}
        </p>
      )}
      {r.uncertain && (
        <p className="notice">
          Užduoties sukūrimo rezultatas nežinomas. Naujas siuntimas draudžiamas;
          sutikrinimas tik skaito esamą būseną.
        </p>
      )}
      {r.cancellation && <p className="notice">{r.cancellation}</p>}
      <section
        aria-label="Platformos inžinieriaus pokalbis"
        className="improve-conversation"
      >
        {r.messages.map((m, i) => (
          <div key={i} className={`improve-message improve-message-${m.role}`}>
            <span className="muted text-xs">
              {m.role === "user"
                ? "Jūs"
                : m.role === "assistant"
                  ? "Platformos inžinierius"
                  : "Sistema"}
            </span>
            <SafeMarkdown text={m.text} />
          </div>
        ))}
      </section>
      {!["queued", "cancelled", "integrated"].includes(r.state) && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await command("message", { text: message })) setMessage("");
          }}
        >
          <label htmlFor="improve-message">Patikslinimas arba klausimas</label>
          <textarea
            id="improve-message"
            className="input"
            maxLength={4000}
            required
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <button className="button" disabled={busy || !!r.job}>
            Aptarti su inžinieriumi
          </button>
        </form>
      )}
      {editable && (
        <section className="improve-section space-y-3">
          <SectionTitle title="Tyrimas" />
          <label htmlFor="improve-paths">
            Susiję failai (po vieną eilutėje, iki 8)
          </label>
          <textarea
            id="improve-paths"
            className="input font-mono"
            rows={2}
            value={paths}
            onChange={(e) => setPaths(e.target.value)}
          />
          <p className="muted">
            Bus skaitomi tik pasirinkti šaltiniai, taikomos instrukcijos ir
            architektūros dokumentai. Bazinė Git versija išsaugoma.
          </p>
          <button
            className="button"
            disabled={busy || !!r.job}
            onClick={() =>
              void command("investigate", {
                paths: paths
                  .split("\n")
                  .map((p) => p.trim())
                  .filter(Boolean),
              })
            }
          >
            Ištirti ir parengti planą
          </button>
        </section>
      )}
      {r.context?.base && (
        <details className="improve-section">
          <summary>
            Tyrimo šaltiniai · bazė {r.context.base.slice(0, 12)}
          </summary>
          <p className="muted mt-3">
            {r.context.repository} · {r.context.target}
          </p>
          {r.context.sources.map((s) => (
            <details key={s.path} className="mt-3">
              <summary>
                {s.path} · {s.revision.slice(0, 12)}
              </summary>
              <pre className="improve-code">{s.content}</pre>
            </details>
          ))}
          {r.knowledge.map((k) => (
            <p className="muted mt-2" key={k.citation}>
              [{k.citation}] {k.title} · rev. {k.revision} ·{" "}
              {k.hash.slice(0, 12)} ·{" "}
              <a
                className="text-link"
                href={`/knowledge?document=${k.documentId}`}
              >
                Atverti žinių šaltinį
              </a>
            </p>
          ))}
        </details>
      )}
      {r.plan && (
        <section className="improve-section">
          <SectionTitle title={`Planas · ${r.planRevision} versija`} />
          <h3 className="font-medium">Problema</h3>
          <p className="my-2 whitespace-pre-wrap">{r.plan.problem}</p>
          <h3 className="font-medium mt-4">Numatytas elgesys</h3>
          <p className="my-2 whitespace-pre-wrap">{r.plan.behavior}</p>
          <h3 className="font-medium mt-4">Failai</h3>
          <ul className="improve-bullets">
            {r.plan.scope.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <h3 className="font-medium mt-4">Priėmimo kriterijai</h3>
          <ol className="improve-bullets">
            {r.plan.criteria.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
          <h3 className="font-medium mt-4">Už apimties ribų</h3>
          <ul className="improve-bullets">
            {r.plan.exclusions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="muted mt-3">Patikros: {r.plan.tests.join(", ")}</p>
          <p className="muted mt-2">
            Priklausomybės ir suderinamumas: {r.plan.implications}
          </p>
          <p className="muted mt-3">
            Išorinis poveikis: viena privati Paperclip užduotis, izoliuotas
            kodavimas ir vieša kandidato šaka. Viešai pateikiami tik kodo
            pakeitimai; pokalbis ir vidaus įrodymai neskelbiami.
          </p>
        </section>
      )}
      {editable && r.context?.base && (
        <PlanEditor
          key={`${r.id}-${r.planRevision}`}
          initial={r.plan}
          disabled={busy || !!r.job}
          save={(plan) => command("plan", { plan })}
        />
      )}
      {r.state === "awaiting_authorization" && r.planHash && (
        <Modal
          title="Leisti įgyvendinti šį planą"
          description="Leidimas galios tik šiai plano versijai, bazinei Git versijai ir patikrintiems vykdymo limitams."
          trigger={
            <button
              className="button button-primary"
              disabled={busy || !!r.job}
            >
              Peržiūrėti įgyvendinimo leidimą
            </button>
          }
        >
          <ImplementationConsent
            request={r}
            busy={busy}
            authorize={(policyHash) =>
              command("authorize", { planHash: r.planHash, policyHash })
            }
          />
        </Modal>
      )}
      {r.policy && (
        <details className="improve-section">
          <summary>Patvirtinti vykdymo limitai</summary>
          <p className="muted mt-3">
            Iki {r.policy.maxRuntimeSeconds} s · iki ${r.policy.maxCostUsd} ·{" "}
            {r.policy.diskMb} MB · vienas bandymas · priklausomybių diegimas:{" "}
            {r.policy.dependencyInstall}
          </p>
          <p className="muted mt-2">
            Leidžiamas tinklas: {r.policy.network.join(", ")}. Patikra galioja
            iki {time(r.policy.expiresAt)}.
          </p>
        </details>
      )}
      {r.external && (
        <div className="improve-section">
          <SectionTitle title="Išorinė užduotis" />
          <a
            className="text-link"
            href={r.external.url}
            target="_blank"
            rel="noreferrer"
          >
            {r.external.identifier} · Paperclip
          </a>
          <p className="muted mt-2">
            Būsena: {r.external.status} · darbo aplinka:{" "}
            {r.external.workspaceId ?? "dar nepatvirtinta"}
          </p>
          <p className="break-all muted mt-2">{r.external.branch}</p>
          <p className="muted mt-2">
            {r.syncedAt
              ? `Sutikrinta: ${time(r.syncedAt)}${isStale(r.syncedAt) ? " · duomenys gali būti pasenę" : ""}`
              : "Būsenos laikas nepatvirtintas"}
          </p>
          <p className="muted mt-2">
            Užduoties būsena pati savaime neįrodo kodo ar testų rezultato.
          </p>
        </div>
      )}
      {r.candidate && (
        <Candidate
          key={`${r.candidate.commit}-${r.candidate.validationHash}-${r.candidate.targetCommit}`}
          request={r}
          disabled={busy || !!r.job}
          act={command}
        />
      )}
      {r.relatedRequestId && (
        <button
          className="text-link"
          onClick={() => selectRelated(r.relatedRequestId!)}
        >
          Atverti susietą ankstesnę užklausą
        </button>
      )}
      {r.outcome && <p className="notice">{r.outcome}</p>}
      {r.state === "changes_requested" && (
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void act({
              action: "create",
              key: crypto.randomUUID(),
              text: `${r.request}\nPataisymų pastabos: ${r.messages.filter((m) => m.role === "user").at(-1)?.text ?? ""}`.slice(
                0,
                4000,
              ),
              projectId: r.projectId,
              includeGlobal: r.includeGlobal,
              relatedRequestId: r.id,
            })
          }
        >
          Parengti susietą naują užklausą
        </button>
      )}
      {r.integration && (
        <div className="improve-section">
          <h3 className="font-semibold">Rankinio integravimo instrukcija</h3>
          <p className="muted mt-3">
            Atverkite kandidato pakeitimus, sukurkite PR į{" "}
            {r.integration.target} ir sutikrinkite tikslų HEAD prieš sujungdami.
            Jei tikslinė šaka pasikeitė, sutikrinkite suderinamumą iš naujo
            šioje erdvėje.
          </p>
          <p className="break-all mt-3">
            Leistas commit: {r.integration.candidate}
          </p>
          <a
            className="text-link mt-3"
            href={`https://github.com/${r.context?.repository}/compare/${encodeURIComponent(r.integration.target)}...${r.integration.candidate}`}
            target="_blank"
            rel="noreferrer"
          >
            Atverti tikslų palyginimą GitHub
          </a>
          <p className="muted mt-3">
            Jokio automatinio sujungimo ar diegimo. PR apraše skelbkite tik
            sanitarizuotą techninę santrauką.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {r.submissionAttempted && r.state !== "integrated" && (
          <button
            className="button"
            disabled={busy || !!r.job || r.readRetries >= 3}
            onClick={() => void command("sync")}
          >
            Sutikrinti užduotį ir kandidatą
          </button>
        )}
        {["blocked", "failed"].includes(r.state) && (
          <button
            className="button"
            disabled={busy || !!r.job || r.readRetries >= 3}
            onClick={() => void command("retry")}
          >
            Kartoti saugų žingsnį ({r.readRetries}/3)
          </button>
        )}
        {!["cancelled", "integrated"].includes(r.state) && (
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void command(r.submissionAttempted ? "cancel" : "reject")
            }
          >
            {r.submissionAttempted ? "Nutraukti vykdymą" : "Atmesti užklausą"}
          </button>
        )}
      </div>
      {["ready_for_review", "blocked", "failed", "validating"].includes(
        r.state,
      ) && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void command("changes", { text: feedback });
          }}
        >
          <label htmlFor="improve-feedback">
            Prašyti pakeitimų / nurodyti trūkumus
          </label>
          <textarea
            id="improve-feedback"
            className="input"
            minLength={5}
            required
            maxLength={2400}
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <button className="button" disabled={busy || !!r.job}>
            Grąžinti pataisymams
          </button>
        </form>
      )}
      <details className="improve-section">
        <summary>Sprendimų istorija</summary>
        {r.history.map((h, i) => (
          <p className="muted mt-2" key={i}>
            {time(h.at)} · {h.event} ·{" "}
            {h.owner === "worker" ? "worker" : "savininkas"}
          </p>
        ))}
      </details>
    </article>
  );
}
function ImplementationConsent({
  request: r,
  busy,
  authorize,
}: {
  request: Improvement;
  busy: boolean;
  authorize: (hash: string) => Promise<boolean>;
}) {
  const [policy, setPolicy] = useState<{
      policy: RuntimePolicy;
      policyHash: string;
    } | null>(null),
    [error, setError] = useState("");
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current) return;
    checked.current = true;
    void improvementRequest<{ policy: RuntimePolicy; policyHash: string }>(
      undefined,
      undefined,
      "readiness",
    )
      .then(setPolicy)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <p>Plano versija: {r.planRevision}</p>
      <p className="break-all muted mt-2">{r.planHash}</p>
      <p className="muted mt-2 break-all">Bazinė versija: {r.context?.base}</p>
      {error ? (
        <p className="notice mt-3" role="alert">
          {error}
        </p>
      ) : !policy ? (
        <p role="status" className="muted mt-3">
          Tikrinama vykdymo aplinka ir privalomi limitai…
        </p>
      ) : (
        <>
          <p className="mt-4">
            Vienas kodavimo bandymas. Iki {policy.policy.maxRuntimeSeconds} s ·
            iki ${policy.policy.maxCostUsd} · {policy.policy.diskMb} MB disko ·{" "}
            {policy.policy.logBytes} baitų išvesties.
          </p>
          <p className="muted mt-3">
            Tinklas: {policy.policy.network.join(", ")}. Priklausomybių
            diegimas: {policy.policy.dependencyInstall}. Produkcijos prieiga
            nesuteikiama.
          </p>
          <p className="muted mt-3">
            Išorinis poveikis: viena privati Paperclip užduotis; kandidato kodas
            bus įkeltas į viešą saugyklą tik šakoje codex/improve-{r.id}.
            Sujungimas ir diegimas neleidžiami.
          </p>
          <p className="muted mt-3">
            Operatoriaus patikra: {policy.policy.revision}, galioja iki{" "}
            {time(policy.policy.expiresAt)}.
          </p>
          <button
            className="button button-primary mt-5"
            disabled={busy}
            onClick={() => void authorize(policy.policyHash)}
          >
            Leisti įgyvendinti šią versiją
          </button>
        </>
      )}
    </>
  );
}
function PlanEditor({
  initial,
  disabled,
  save,
}: {
  initial: ImprovementPlan | null;
  disabled: boolean;
  save: (p: ImprovementPlan) => Promise<boolean>;
}) {
  const [problem, setProblem] = useState(initial?.problem ?? ""),
    [behavior, setBehavior] = useState(initial?.behavior ?? ""),
    [scope, setScope] = useState(
      initial?.scope.join("\n") ?? "src/components/knowledge.tsx",
    ),
    [criteria, setCriteria] = useState(initial?.criteria.join("\n") ?? ""),
    [exclusions, setExclusions] = useState(
      initial?.exclusions.join("\n") ??
        "Jokių produkcijos, priklausomybių, migracijų ar prieigos politikos pakeitimų.",
    ),
    [implications, setImplications] = useState(
      initial?.implications ?? "Naujų priklausomybių ir migracijų nereikia.",
    ),
    [ui, setUi] = useState(initial?.uiChange ?? true);
  const lines = (v: string) =>
    v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  return (
    <details className="improve-section">
      <summary>
        {initial
          ? "Patikslinti planą (panaikins ankstesnį leidimą)"
          : "Parengti planą rankiniu būdu"}
      </summary>
      <form
        className="space-y-3 mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save({
            problem,
            behavior,
            scope: lines(scope),
            criteria: lines(criteria),
            exclusions: lines(exclusions),
            implications,
            uiChange: ui,
            tests: [
              "lint",
              "typecheck",
              "test",
              "build",
              ...(ui ? ["ui" as const] : []),
            ],
          });
        }}
      >
        {[
          {
            id: "problem",
            label: "Konkreti problema",
            value: problem,
            set: setProblem,
          },
          {
            id: "behavior",
            label: "Siūlomas elgesys",
            value: behavior,
            set: setBehavior,
          },
          {
            id: "scope",
            label: "Tikslūs keičiami failai (po vieną eilutėje)",
            value: scope,
            set: setScope,
          },
          {
            id: "criteria",
            label: "Priėmimo kriterijai (po vieną eilutėje)",
            value: criteria,
            set: setCriteria,
          },
          {
            id: "exclusions",
            label: "Aiškios išimtys",
            value: exclusions,
            set: setExclusions,
          },
          {
            id: "implications",
            label: "Priklausomybės ir migracijos",
            value: implications,
            set: setImplications,
          },
        ].map((f) => (
          <div key={f.id}>
            <label htmlFor={`plan-${f.id}`}>{f.label}</label>
            <textarea
              id={`plan-${f.id}`}
              className="input mt-2"
              required
              rows={2}
              maxLength={2400}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
            />
          </div>
        ))}
        <label className="improve-check">
          <input
            type="checkbox"
            checked={ui}
            onChange={(e) => setUi(e.target.checked)}
          />
          Keičiama vartotojo sąsaja (darbalaukio ir telefono patikra privaloma)
        </label>
        <button className="button" disabled={disabled}>
          Išsaugoti plano versiją
        </button>
      </form>
    </details>
  );
}
function Candidate({
  request: r,
  disabled,
  act,
}: {
  request: Improvement;
  disabled: boolean;
  act: (action: string, extra?: object) => Promise<boolean>;
}) {
  const c = r.candidate!;
  const [criteria, setCriteria] = useState<boolean[]>(() =>
      r.plan!.criteria.map(() => false),
    ),
    [checks, setChecks] = useState({
      security: false,
      compatibility: false,
      scope: false,
      validation: false,
    }),
    [findings, setFindings] = useState("");
  return (
    <section
      className="improve-section space-y-4"
      aria-label="Kandidato peržiūra"
    >
      <SectionTitle title="Tikslus kandidatas" />
      <p className="break-all">
        <a
          className="text-link"
          target="_blank"
          rel="noreferrer"
          href={`https://github.com/${r.context!.repository}/commit/${c.commit}`}
        >
          {c.commit}
        </a>
      </p>
      <p className="muted break-all">
        Bazė: {c.base} · tikslas: {c.target} @ {c.targetCommit.slice(0, 12)}
      </p>
      <p className="muted">Įrodymai gauti: {time(c.observedAt)}</p>
      <h3 className="font-medium">Keisti failai ir diff</h3>
      {c.files.map((f) => (
        <details key={f.path}>
          <summary>
            {f.path} · +{f.additions} / −{f.deletions}
          </summary>
          <pre className="improve-code">{f.patch}</pre>
        </details>
      ))}
      <h3 className="font-medium">Tikrinimo rezultatai</h3>
      {!c.checks.length && (
        <p className="notice">
          CI rezultatų dar nėra. Paruošta peržiūrai nebus žymima.
        </p>
      )}
      {c.checks.map((check) => (
        <p key={check.command}>
          <a
            className="text-link"
            target="_blank"
            rel="noreferrer"
            href={check.url}
          >
            {check.command}
          </a>{" "}
          · {check.conclusion} · exit: {check.exitCode ?? "nepateiktas"}
        </p>
      ))}
      {c.captures.map((url) => (
        <p key={url}>
          <a className="text-link" href={url} target="_blank" rel="noreferrer">
            Atverti šio kandidato darbalaukio ir telefono vaizdus
          </a>
        </p>
      ))}
      {c.limitations.map((l) => (
        <p className="muted" key={l}>
          {l}
        </p>
      ))}
      {c.passed && r.state === "ready_for_review" && (
        <form
          key={`${c.commit}-${c.validationHash}-${c.targetCommit}`}
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void act("review", {
              review: {
                candidate: c.commit,
                diffHash: c.diffHash,
                validationHash: c.validationHash,
                criteria,
                findings,
                ...checks,
              },
            });
          }}
        >
          <h3 className="font-medium">Savininko peržiūra</h3>
          <p className="muted">
            Tai atskira savininko saviperžiūra. Nepriklausomas agento vertinimas
            neatliktas.
          </p>
          {r.plan!.criteria.map((criterion, i) => (
            <label key={criterion} className="improve-check">
              <input
                type="checkbox"
                required
                checked={criteria[i] ?? false}
                onChange={(e) =>
                  setCriteria((old) =>
                    old.map((v, j) => (i === j ? e.target.checked : v)),
                  )
                }
              />
              {criterion}
            </label>
          ))}
          {[
            {
              id: "security",
              label: "Peržiūrėjau saugumą ir galimą paslapčių atskleidimą",
            },
            {
              id: "scope",
              label: "Apimtis neišplėsta; esamos patikros nesusilpnintos",
            },
            {
              id: "compatibility",
              label: "Įvertinau regresijas, migracijas ir suderinamumą",
            },
            {
              id: "validation",
              label:
                "Patikrinau įrodymus, trūkstamą validaciją ir UI vaizdus, jei taikoma",
            },
          ].map((k) => (
            <label key={k.id} className="improve-check">
              <input
                required
                type="checkbox"
                checked={checks[k.id as keyof typeof checks]}
                onChange={(e) =>
                  setChecks((old) => ({ ...old, [k.id]: e.target.checked }))
                }
              />
              {k.label}
            </label>
          ))}
          <label htmlFor="review-findings">Išvados ir išspręsti trūkumai</label>
          <textarea
            id="review-findings"
            className="input"
            minLength={5}
            maxLength={2400}
            required
            rows={3}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
          />
          <button className="button" disabled={disabled}>
            Užregistruoti šio kandidato peržiūrą
          </button>
        </form>
      )}
      {r.review && (
        <>
          <p className="notice">
            Peržiūrėta: {r.review.candidate.slice(0, 12)} · savininko
            saviperžiūra. {r.review.findings}
          </p>
          {r.state === "ready_for_review" && (
            <button
              className="button button-primary"
              disabled={disabled}
              onClick={() =>
                void act("integrate", {
                  candidate: c.commit,
                  validationHash: c.validationHash,
                  target: c.target,
                })
              }
            >
              Leisti pateikti šį commit integravimui
            </button>
          )}
        </>
      )}
    </section>
  );
}
