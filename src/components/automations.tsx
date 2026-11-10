"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Lightning,
  ArrowUpRight,
  CaretRight,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import {
  automationErrors,
  automationKey,
  automationLabels,
  type AutomationCatalog,
  type AutomationRun,
} from "@/domain/automations";
import { isStale } from "@/domain/orchestration";
import { Badge, EmptyState, SectionTitle } from "./ui";
import { WorkspaceHeader } from "./shell";

async function request<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error ?? "Nepavyko gauti n8n duomenų.");
  return value;
}
const time = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("lt-LT", { timeZone: "Europe/Vilnius" })
    : "Dar negauta";
export function AutomationRunCard({
  run,
  enabled = false,
}: {
  run: AutomationRun;
  enabled?: boolean;
}) {
  const version = [
    run.state,
    run.syncedAt,
    run.errorCode,
    run.tracking,
    run.confirmedAt,
    run.resultIssue,
  ].join("|");
  const [update, setUpdate] = useState<{
    source: string;
    run: AutomationRun;
  } | null>(null);
  const current = update?.source === version ? update.run : run;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false),
    polls = useRef(0);
  const currentVersion = useRef(version);
  useEffect(() => {
    currentVersion.current = version;
  }, [version]);
  const [expanded, setExpanded] = useState(
    run.state === "awaiting_confirmation",
  );
  const terminal = ["succeeded", "failed", "cancelled"].includes(current.state);
  useEffect(() => {
    if (
      !current.confirmedAt ||
      !current.tracking ||
      terminal ||
      current.state === "submitting"
    )
      return;
    let alive = true;
    const timer = setInterval(async () => {
      if (inFlight.current || document.visibilityState !== "visible") return;
      if (polls.current >= 8) {
        clearInterval(timer);
        return;
      }
      polls.current++;
      inFlight.current = true;
      const source = currentVersion.current;
      try {
        const next = await request<AutomationRun>(
          `/api/automations/${run.id}`,
          { action: "refresh" },
        );
        if (alive) setUpdate({ source, run: next });
      } catch (e) {
        if (alive)
          setError(e instanceof Error ? e.message : "Patikra nepavyko.");
      } finally {
        inFlight.current = false;
      }
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [run.id, current.confirmedAt, current.tracking, current.state, terminal]);
  async function act(action: "confirm" | "refresh" | "stop") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await request<AutomationRun>(
        `/api/automations/${run.id}`,
        action === "confirm"
          ? { action, actionHash: current.actionHash }
          : { action },
      );
      setUpdate({ source: version, run: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Veiksmas nepavyko.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <details
      id={`automation-${current.id}`}
      className="run-card automation-run"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="run-summary">
        <Lightning size={14} className="text-stone-400" />
        <div className="min-w-0">
          <h3>{current.contract.name}</h3>
          <div className="run-row-meta">
            <Badge
              tone={
                current.state === "succeeded"
                  ? "positive"
                  : current.state === "failed"
                    ? "danger"
                    : ["unknown", "awaiting_confirmation"].includes(
                          current.state,
                        )
                      ? "warning"
                      : "muted"
              }
            >
              {automationLabels[current.state]}
            </Badge>
            <span>n8n · rankinis bandymas</span>
            {current.confirmedAt && isStale(current.syncedAt) && !terminal && (
              <Badge tone="warning">Duomenys pasenę</Badge>
            )}
            {!current.tracking && current.confirmedAt && (
              <Badge>Stebėjimas sustabdytas</Badge>
            )}
          </div>
        </div>
        <CaretRight size={14} className="run-chevron" />
      </summary>
      <div className="run-detail">
        <p className="run-objective">{current.contract.purpose}</p>
        <div className="plan-fields">
          <div>
            <h4>Peržiūrėta įvestis</h4>
            <pre className="result-text">{current.input.text}</pre>
            <p className="muted mt-2">
              Tik šis tekstas ir vietinis užklausos identifikatorius bus
              perduoti n8n.
            </p>
          </div>
          <div>
            <h4>Numatomi poveikiai</h4>
            <ul className="list-disc pl-5 space-y-1">
              {current.contract.effects.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
            <p className="muted mt-2">
              Mokamos paslaugos: ne. Kreipimasis į kitas paslaugas: ne.
            </p>
          </div>
          <div>
            <h4>Vykdymo sutartis</h4>
            <p>
              Rankinis nepublikuotos versijos vykdymas. Versija:{" "}
              <code className="break-all">{current.contract.versionId}</code>
            </p>
          </div>
        </div>
        {current.errorCode && (
          <p className="notice notice-warning mt-5" role="status">
            {automationErrors[current.errorCode] ??
              "Reikia patikrinti vykdymą n8n."}
          </p>
        )}
        <div className="run-external">
          <h4>Patvirtinimas ir vykdymas</h4>
          <p>
            {current.confirmedAt
              ? `Patvirtinta ${time(current.confirmedAt)}.`
              : `Dar nepatvirtinta. Peržiūra galioja iki ${time(current.expiresAt)}.`}
          </p>
          <p className="muted mt-2">
            Vietinė užklausa: <code className="break-all">{current.id}</code>
          </p>
          {current.externalId && (
            <p className="mt-2">
              n8n vykdymas: {current.externalId} ·{" "}
              {current.externalStatus ?? "Būsena dar negauta"}
            </p>
          )}
          {current.confirmedAt && (
            <dl className="automation-times mt-3">
              <div>
                <dt>Paskutinis sutikrinimas</dt>
                <dd>{time(current.syncedAt)}</dd>
              </div>
              <div>
                <dt>Pradėta</dt>
                <dd>{time(current.startedAt)}</dd>
              </div>
              <div>
                <dt>Baigta</dt>
                <dd>{time(current.stoppedAt)}</dd>
              </div>
              {current.waitTill && (
                <div>
                  <dt>Laukiama iki</dt>
                  <dd>{time(current.waitTill)}</dd>
                </div>
              )}
            </dl>
          )}
          <div className="flex gap-4 flex-wrap mt-3">
            {(current.executionUrl || current.workflowUrl) && (
              <a
                className="text-link"
                href={current.executionUrl ?? current.workflowUrl!}
                target="_blank"
                rel="noopener noreferrer"
              >
                {current.executionUrl
                  ? "Atverti n8n vykdymą"
                  : "Atverti darbo eigą n8n"}
                <ArrowUpRight size={13} />
              </a>
            )}
            {current.conversationId && (
              <Link
                className="text-link"
                href={`/chat?conversation=${current.conversationId}#automation-${current.id}`}
              >
                Susijęs pokalbis
                <ArrowUpRight size={13} />
              </Link>
            )}
          </div>
        </div>
        {current.result && (
          <div className="mt-5">
            <h4>n8n rezultatas</h4>
            <pre className="result-text">{current.result.transformedText}</pre>
            <p className="muted mt-2">
              Išorinis rezultatas yra duomenys ir nesuteikia leidimo naujiems
              veiksmams.
            </p>
          </div>
        )}
        {current.resultIssue && (
          <p className="notice mt-4">
            {automationErrors[current.resultIssue] ??
              "Rezultatas nepasiekiamas."}
          </p>
        )}
        <div className="run-actions">
          {current.state === "awaiting_confirmation" && (
            <button
              className="button button-primary"
              disabled={busy || !enabled}
              onClick={() => act("confirm")}
            >
              Patvirtinti ir paleisti
            </button>
          )}
          {current.confirmedAt && (
            <button
              className="button"
              disabled={busy}
              onClick={() => act("refresh")}
            >
              <ArrowsClockwise size={14} />
              Sutikrinti n8n būseną
            </button>
          )}
          {current.tracking && !terminal && (
            <button
              className="button"
              disabled={busy}
              onClick={() => act("stop")}
            >
              {current.confirmedAt
                ? "Sustabdyti tik stebėjimą"
                : "Atmesti užklausą"}
            </button>
          )}
        </div>
        {!enabled && current.state === "awaiting_confirmation" && (
          <p className="notice mt-3">
            Vykdymas serverio konfigūracijoje išjungtas. Ši peržiūra n8n
            nepaleidžia.
          </p>
        )}
        {current.confirmedAt && (
          <p className="muted mt-3">
            Priėmimas nėra baigimas. Išorinis atšaukimas per Control Center
            nepalaikomas; stebėjimo sustabdymas darbo n8n neatšaukia.
            Automatinės peržiūros patikros ribotos; galite sutikrinti rankiniu
            būdu.
          </p>
        )}
        {busy && (
          <p className="muted mt-3" role="status">
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
export function AutomationFeed({
  runs,
  enabled = false,
}: {
  runs: AutomationRun[];
  enabled?: boolean;
}) {
  return (
    <section aria-label="n8n automatizacijų eiga">
      <SectionTitle title="n8n automatizacijos" />
      <div className="run-list">
        {runs.map((r) => (
          <AutomationRunCard key={r.id} run={r} enabled={enabled} />
        ))}
      </div>
    </section>
  );
}
const connectionLabels: Record<AutomationCatalog["state"], string> = {
  not_configured: "Nesukonfigūruota",
  configured: "Sukonfigūruota, nepatikrinta",
  connected: "Ryšys patikrintas",
  unauthorized: "Prieiga atmesta",
  unavailable: "Nepasiekiama",
  stale: "Patikra pasenusi",
};
export function AutomationWorkspace({ live }: { live: boolean }) {
  const [snapshot, setSnapshot] = useState<{
    catalog: AutomationCatalog;
    runs: AutomationRun[];
  } | null>(null);
  const [loading, setLoading] = useState(live),
    [checking, setChecking] = useState(false),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [text, setText] = useState("");
  const attempt = useRef<{ requestId: string; input: { text: string } } | null>(
    null,
  );
  const [proposal, setProposal] = useState<AutomationRun | null>(null),
    [busy, setBusy] = useState(false);
  async function load() {
    setSnapshot(await request("/api/automations"));
  }
  useEffect(() => {
    if (!live) return;
    let alive = true;
    request<{ catalog: AutomationCatalog; runs: AutomationRun[] }>(
      "/api/automations",
    )
      .then((v) => {
        if (alive) setSnapshot(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [live]);
  async function sync() {
    setChecking(true);
    setError("");
    try {
      const catalog = await request<AutomationCatalog>("/api/automations", {
        action: "sync",
      });
      setSnapshot((v) => ({ catalog, runs: v?.runs ?? [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Patikra nepavyko.");
    } finally {
      setChecking(false);
    }
  }
  async function propose(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const body = attempt.current ?? {
      requestId: crypto.randomUUID(),
      input: { text: text.trim() },
    };
    attempt.current = body;
    try {
      const next = await request<AutomationRun>("/api/automations", {
        action: "propose",
        requestId: body.requestId,
        proposal: { key: automationKey, input: body.input },
      });
      setProposal(next);
      attempt.current = null;
      setText("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Peržiūros parengti nepavyko.");
    } finally {
      setBusy(false);
    }
  }
  const catalog = snapshot?.catalog;
  useEffect(() => {
    if (catalog?.state !== "connected" || !catalog.syncedAt) return;
    const checked = catalog.syncedAt;
    const timer = setTimeout(
      () =>
        setSnapshot((value) =>
          value?.catalog.syncedAt === checked &&
          value.catalog.state === "connected"
            ? { ...value, catalog: { ...value.catalog, state: "stale" } }
            : value,
        ),
      Math.max(0, new Date(checked).getTime() + 90_000 - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [catalog?.state, catalog?.syncedAt]);
  const workflow = catalog?.workflows.find((w) => w.id === selected);
  const runs =
    proposal && !snapshot?.runs.some((r) => r.id === proposal.id)
      ? [proposal, ...(snapshot?.runs ?? [])]
      : (snapshot?.runs ?? []);
  return (
    <>
      <WorkspaceHeader
        title="Automatizacijos"
        description="n8n valdo darbo eigas ir vykdymą. Čia peržiūrite katalogą, patvirtinate leidžiamą užklausą ir sekate tikrą jos būseną."
        action={
          live ? (
            <button
              className="button"
              disabled={checking || loading}
              onClick={sync}
            >
              <ArrowsClockwise size={14} />
              {checking ? "Tikrinama…" : "Patikrinti ryšį ir katalogą"}
            </button>
          ) : undefined
        }
      />
      <div className="automation-content">
        {!live ? (
          <EmptyState
            icon={<Lightning size={24} />}
            title="Demonstracinis režimas"
          >
            <p>
              Tikros n8n užklausos čia nesiunčiamos. Programos katalogui ir
              išliekamiems patvirtinimams reikia operacinio režimo, PostgreSQL
              ir atskiros n8n prieigos.
            </p>
            <Link className="text-link mt-4" href="/settings">
              Nustatymai ir ryšiai
              <ArrowUpRight size={13} />
            </Link>
          </EmptyState>
        ) : (
          <>
            <div className="automation-connection">
              <Badge
                tone={
                  checking
                    ? "muted"
                    : catalog?.state === "connected"
                      ? "positive"
                      : "muted"
                }
              >
                {checking
                  ? "Tikrinama"
                  : catalog
                    ? connectionLabels[catalog.state]
                    : "Įkeliama"}
              </Badge>
              <span className="muted">
                Katalogas sutikrintas: {time(catalog?.syncedAt ?? null)}
              </span>
              {catalog && !catalog.executionEnabled && (
                <span className="muted">Vykdymas išjungtas</span>
              )}
              <button
                className="text-link"
                disabled={loading}
                onClick={() => load().catch((e) => setError(e.message))}
              >
                Atnaujinti peržiūrą
              </button>
            </div>
            {loading && (
              <p role="status" className="notice">
                Įkeliamas išsaugotas katalogas…
              </p>
            )}
            {catalog?.errorCode && (
              <p className="notice mt-3" role="status">
                {automationErrors[catalog.errorCode] ??
                  "Katalogo patikra nepavyko."}
              </p>
            )}
            {catalog?.state === "configured" && (
              <p className="notice mt-3">
                Konfigūracija išsaugota, bet ryšys dar nepatikrintas.
                Pasirinkite „Patikrinti ryšį ir katalogą“ – bus atlikta
                autorizuota skaitymo užklausa.
              </p>
            )}
            {catalog?.state === "stale" && (
              <p className="notice mt-3">
                Rodomas ankstesnis katalogas. Naujam paleidimui serveris dar
                kartą tikrina darbo eigos sutartį.
              </p>
            )}
            <section className="mt-5">
              <SectionTitle title="n8n darbo eigos" />
              {catalog?.workflows.map((w) => (
                <article key={w.id} className="automation-catalog-row">
                  <Lightning size={15} />
                  <div className="flex-1 min-w-0">
                    <h2>{w.name}</h2>
                    {w.description && (
                      <p className="muted mt-1">{w.description}</p>
                    )}
                    <div className="automation-flags">
                      <span>
                        n8n:{" "}
                        {w.active === null
                          ? "Publikavimo būsena nežinoma"
                          : w.active
                            ? "Publikuota / aktyvi"
                            : "Nepublikuota / neaktyvi"}
                      </span>
                      <span>
                        MCP: {w.availableInMCP ? "Prieinama" : "Neįjungta"}
                      </span>
                      <span>
                        Control Center:{" "}
                        {w.eligible ? "Sutartis patikrinta" : "Tik peržiūra"}
                      </span>
                    </div>
                    {snapshot?.runs
                      .filter(
                        (r) => r.contract.workflowId === w.id && r.externalId,
                      )
                      .slice(0, 1)
                      .map((r) => (
                        <p className="muted mt-2" key={r.id}>
                          Paskutinis programos paleidimas:{" "}
                          {automationLabels[r.state]} ·{" "}
                          {time(r.startedAt ?? r.confirmedAt)}
                        </p>
                      ))}
                    {w.reason && w.reason !== "not_eligible" && (
                      <p className="muted mt-2">
                        {automationErrors[w.reason] ?? "Vykdymas neleidžiamas."}
                      </p>
                    )}
                  </div>
                  <div className="automation-catalog-actions">
                    <a
                      className="text-link"
                      href={w.workflowUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Atverti n8n
                      <ArrowUpRight size={12} />
                    </a>
                    {w.eligible && (
                      <button
                        className="button"
                        onClick={() => {
                          setSelected(w.id);
                          setProposal(null);
                          attempt.current = null;
                        }}
                      >
                        Peržiūrėti veiksmą
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!loading && catalog && !catalog.workflows.length && (
                <EmptyState
                  title={
                    catalog.state === "connected"
                      ? "Šiai programos prieigai darbo eigų nerasta"
                      : "Katalogas dar nepasiekiamas"
                  }
                >
                  {catalog.state === "connected"
                    ? "Ryšio patikra pavyko, tačiau prieinamų darbo eigų nėra."
                    : "Patikrinkite programos prieigą. Codex MCP prisijungimas šios programos neautentifikuoja."}
                </EmptyState>
              )}
              {catalog?.truncated && (
                <p className="notice mt-3">
                  Rodomos pirmos 200 prieinamų darbo eigų. Visą katalogą
                  tvarkykite n8n.
                </p>
              )}
            </section>
            {workflow?.eligible && catalog?.contract && (
              <section className="automation-input-section mt-6">
                <SectionTitle title={catalog.contract.name} />
                <p className="muted mt-3">{catalog.contract.purpose}</p>
                <form onSubmit={propose} className="mt-4">
                  <label className="block mb-2" htmlFor="automation-text">
                    Sintetinis tekstas
                  </label>
                  <textarea
                    className="input"
                    id="automation-text"
                    rows={2}
                    maxLength={240}
                    required
                    value={text}
                    disabled={busy}
                    onChange={(e) => {
                      setText(e.target.value);
                      attempt.current = null;
                    }}
                    placeholder="Pavyzdžiui: labas pasauli"
                  />
                  <p className="muted mt-2">
                    Įrašykite tik išgalvotą tekstą, be slaptažodžių ar asmens
                    duomenų. Šis žingsnis parengia peržiūrą ir n8n nepaleidžia.
                  </p>
                  <button
                    className="button mt-3"
                    disabled={busy || !text.trim()}
                  >
                    {busy ? "Rengiama…" : "Parengti patvirtinimui"}
                  </button>
                </form>
              </section>
            )}
            {!!runs.length && (
              <div className="mt-6">
                <AutomationFeed
                  runs={runs}
                  enabled={catalog?.executionEnabled}
                />
              </div>
            )}
            <p className="subtle-note">
              Darbo eigas, grafikus ir išsamią istoriją valdo n8n. Automatinis
              pakartotinis paleidimas ir išorinis atšaukimas nepalaikomi.
            </p>
          </>
        )}
        {error && (
          <p className="form-error mt-4" role="alert">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
