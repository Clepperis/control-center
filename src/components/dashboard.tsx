"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  FileText,
  Robot,
  Lightning,
  ChatCircle,
  Circle,
  Wrench,
} from "@phosphor-icons/react";
import type { Dashboard, Activity } from "@/domain/models";
import { Badge, ConnectionBadge, Modal, SectionTitle } from "./ui";
import { useDemo } from "./demo-workspace";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="overline mb-3">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="muted mt-3 max-w-2xl">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function WorkspaceStatus({ data }: { data: Dashboard }) {
  return (
    <aside className="overview-aside" aria-label="Programos būsena">
      <section>
        <SectionTitle
          title="Programos ryšiai"
          href="/settings"
          action="Nustatymai"
        />
        {data.connections.map((c) => (
          <div className="connection-compact" key={c.id}>
            <span>{c.name}</span>
            <ConnectionBadge state={c.state} />
          </div>
        ))}
        <p className="muted text-xs mt-4">
          Codex įrankių prieiga nėra šios programos prisijungimas.
        </p>
      </section>
      <section>
        <SectionTitle title="Vykdymo aplinka" />
        <div className="status-row">
          <Robot size={18} />
          <div className="flex-1">
            <p className="text-sm">Agentai</p>
            <p className="muted text-xs mt-1">
              {data.mode === "demo"
                ? "Pavyzdiniai vaidmenys"
                : "Parengtis tikrinama prieš delegavimą"}
            </p>
          </div>
          <Badge tone="muted">
            {data.mode === "demo" ? "Demo" : "Žr. agentus"}
          </Badge>
        </div>
        <div className="status-row">
          <Lightning size={18} />
          <div className="flex-1">
            <p className="text-sm">Automatizacijos</p>
            <p className="muted text-xs mt-1">Vykdymai neįjungti</p>
          </div>
        </div>
        <Link href="/agents" className="text-link mt-3">
          Agentų parengtis
          <ArrowUpRight size={14} />
        </Link>
      </section>
      <Link href="/improve" className="improve-link">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Wrench size={17} />
          Tobulinti sistemą
          <ArrowUpRight size={15} className="ml-auto" />
        </div>
        <p className="muted text-xs mt-2">
          Užrašykite norimą pakeitimą ir jo rezultatą.
        </p>
      </Link>
    </aside>
  );
}

export function RecentActivity({
  activity,
  error,
}: {
  activity: Activity[];
  error?: string;
}) {
  return (
    <section>
      <SectionTitle title="Naujausia veikla" />
      <div className="activity-list">
        {activity.map((a) => (
          <div className="activity-row" key={a.id}>
            <span className="activity-icon">
              <FileText size={17} />
            </span>
            <div className="flex-1 min-w-0">
              <h3>{a.title}</h3>
              <p className="mt-1 break-words">{a.detail}</p>
            </div>
            <time className="shrink-0 tabular-nums">{a.time}</time>
          </div>
        ))}
        {!activity.length && (
          <p className="muted text-sm">
            {error
              ? "Veiklos istorija nepasiekiama."
              : "Išsaugotų įvykių dar nėra."}
          </p>
        )}
      </div>
    </section>
  );
}

export function Overview({ data }: { data: Dashboard }) {
  const { state, dispatch } = useDemo();
  const decisions = data.decisions.filter(
    (d) => !state.reviewed.includes(d.id),
  );
  const taskLabels = {
    review: "Laukia peržiūros",
    planned: "Planuojama",
    waiting: "Laukia sprendimo",
  };
  return (
    <>
      <PageHeading
        eyebrow="Darbo erdvė"
        title="Apžvalga"
        description="Sprendimai, darbai ir programos ryšiai."
        action={
          <Link className="button button-primary" href="/chat">
            <ChatCircle size={17} />
            Pradėti pokalbį
            <ArrowUpRight size={15} />
          </Link>
        }
      />
      <div className="overview-layout">
        <div className="overview-main">
          <section
            className="attention-panel"
            aria-labelledby="attention-title"
          >
            <div className="attention-intro">
              <div>
                <h2 id="attention-title">
                  {decisions.length
                    ? `Jūsų sprendimo laukia ${decisions.length === 1 ? "vienas klausimas" : `${decisions.length} klausimai`}.`
                    : "Visi pavyzdiniai klausimai peržiūrėti."}
                </h2>
                <p>Pažymėjimas keičia tik šios naršyklės demonstraciją.</p>
              </div>
              <Badge tone={decisions.length ? "warning" : "muted"}>
                {decisions.length ? "Laukia peržiūros" : "Peržiūrėta"}
              </Badge>
            </div>
            <div className="attention-list">
              {decisions.map((d, i) => (
                <div className="decision-row" key={d.id}>
                  <span className="decision-number">
                    {(i + 1).toString().padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="muted mb-1">{d.project}</p>
                    <h3>{d.title}</h3>
                  </div>
                  <Modal
                    title={d.title}
                    description={d.detail}
                    trigger={
                      <button className="button button-small">
                        Peržiūrėti
                        <ArrowRight size={14} />
                      </button>
                    }
                  >
                    <div className="notice mb-5">
                      Demonstracija: ši peržiūra nesuteikia leidimo jokiam
                      išoriniam veiksmui.
                    </div>
                    <button
                      className="button button-primary"
                      onClick={() => dispatch({ type: "review", id: d.id })}
                    >
                      <Check size={17} />
                      Pažymėti kaip peržiūrėtą
                    </button>
                    <p className="muted text-xs mt-3">
                      Būsena saugoma tik šioje naršyklėje.
                    </p>
                  </Modal>
                </div>
              ))}
              {!decisions.length && (
                <div className="px-5 py-4">
                  <Link href="/chat" className="text-link">
                    Pereiti į pokalbį
                    <ArrowRight size={15} />
                  </Link>
                </div>
              )}
            </div>
          </section>
          <section>
            <SectionTitle
              title="Planuojami darbai"
              href="/projects"
              action="Visos užduotys"
            />
            <div className="work-list">
              {data.tasks.map((t) => (
                <Link
                  href={`/projects#${t.id}`}
                  className="work-row"
                  key={t.id}
                >
                  <Circle size={14} className="work-state-icon" />
                  <div className="min-w-0">
                    <h3>{t.title}</h3>
                    <p>
                      {data.projects.find((p) => p.id === t.projectId)?.name} ·
                      vykdymas nepradėtas
                    </p>
                  </div>
                  <Badge tone={t.state === "review" ? "warning" : "muted"}>
                    {taskLabels[t.state]}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
          <section>
            <SectionTitle
              title="Projektai"
              href="/projects"
              action="Visi projektai"
            />
            <div className="panel divide-y divide-stone-100">
              {data.projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects#${p.id}`}
                  className="project-row group"
                >
                  <span className="project-code">{p.code}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{p.name}</h3>
                    <p className="muted mt-1">{p.description}</p>
                  </div>
                  <Badge tone="muted">{p.stage}</Badge>
                  <ArrowUpRight size={16} className="text-stone-400" />
                </Link>
              ))}
            </div>
          </section>
          <RecentActivity activity={data.activity} />
        </div>
        <WorkspaceStatus data={data} />
      </div>
      <div className="subtle-note">
        <Clock size={14} />
        Tai demonstracinis scenarijus, ne tiesioginė veiklos ataskaita.
      </div>
    </>
  );
}
