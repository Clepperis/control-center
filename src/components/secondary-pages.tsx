"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  BookOpen,
  ArrowRight,
  FileText,
  ShieldCheck,
  Circle,
} from "@phosphor-icons/react";
import type { Dashboard } from "@/domain/models";
import { PageHeading } from "./dashboard";
import { Badge, ConnectionBadge, EmptyState, Modal, SectionTitle } from "./ui";
import { useDemo } from "./demo-workspace";

export function DraftForm({
  kind,
  label,
  placeholder,
}: {
  kind: "chat" | "improve" | "task";
  label: string;
  placeholder: string;
}) {
  const { state, dispatch } = useDemo();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    dispatch({ type: "draft", kind, text: text.trim() });
    setText("");
    setSaved(true);
  }
  return (
    <>
      <form onSubmit={submit} className="draft-form space-y-4">
        <label className="block text-sm font-medium" htmlFor={`draft-${kind}`}>
          {label}
        </label>
        <textarea
          id={`draft-${kind}`}
          required
          maxLength={4000}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder={placeholder}
          rows={4}
          className="input"
        />
        <p className="muted text-xs">
          Juodraštis saugomas šioje naršyklėje. Agentai ir modeliai nekviečiami.
        </p>
        <button className="button button-primary" type="submit">
          <Plus size={16} />
          Išsaugoti juodraštį
        </button>
        {saved && (
          <p role="status" className="text-sm text-emerald-800">
            Juodraštis išsaugotas šioje naršyklėje.
          </p>
        )}
      </form>
      <div className="mt-6 space-y-3">
        {state.drafts
          .filter((d) => d.kind === kind)
          .map((d) => (
            <div className="draft-row" key={d.id}>
              <Badge>Vietinis juodraštis</Badge>
              <p className="mt-3 whitespace-pre-wrap text-sm">{d.text}</p>
            </div>
          ))}
      </div>
    </>
  );
}
export function DemoChat() {
  return (
    <>
      <PageHeading
        eyebrow="Pokalbis"
        title="Pokalbis"
        description="Užrašykite mintį. Demonstracijoje ji liks vietiniu juodraščiu."
      />
      <div className="demo-chat">
        <div className="demo-chat-intro">
          <Badge tone="accent">Demonstracinis režimas</Badge>
          <h2 className="text-xl font-semibold mt-5">
            Ką norėtumėte nuveikti?
          </h2>
          <p className="muted mt-3">
            Galite užrašyti mintį peržiūrai. Tikras atsakymas bus galimas
            sukonfigūravus programos modelio prieigą.
          </p>
        </div>
        <div>
          <DraftForm
            kind="chat"
            label="Jūsų mintis"
            placeholder="Pavyzdžiui: padėk parengti namų dokumentų katalogo planą…"
          />
        </div>
      </div>
    </>
  );
}
export function Projects({ data }: { data: Dashboard }) {
  const { state } = useDemo();
  const [filter, setFilter] = useState("all");
  return (
    <>
      <PageHeading
        eyebrow="Projektai ir užduotys"
        title="Projektai ir užduotys"
        description="Projektai jungia tikslus, žinias ir darbus. Agentų užduočių vykdymą valdys Paperclip."
        action={
          data.mode === "demo" ? (
            <Modal
              title="Naujos užduoties juodraštis"
              description="Užrašykite vietinę idėją. Ji nebus perduota agentui."
              trigger={
                <button className="button button-primary">
                  <Plus size={17} />
                  Nauja idėja
                </button>
              }
            >
              <DraftForm
                kind="task"
                label="Užduoties aprašymas"
                placeholder="Ką norėtumėte padaryti?"
              />
            </Modal>
          ) : (
            <Link href="/chat" className="button button-primary">
              Planuoti pokalbyje
              <ArrowRight size={16} />
            </Link>
          )
        }
      />
      <div className="list-toolbar" role="group" aria-label="Rodyti užduotis">
        <div className="filter-pills">
          {[
            ["all", "Visos užduotys"],
            ["review", "Laukia peržiūros"],
            ["planned", "Planuojama"],
            ["waiting", "Laukia sprendimo"],
          ].map(([value, label]) => (
            <button
              className="filter-pill"
              key={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="toolbar-note">
          {
            data.tasks.filter((t) => filter === "all" || filter === t.state)
              .length
          }{" "}
          užduotys
        </span>
      </div>
      <div className="task-groups">
        {(["review", "waiting", "planned"] as const).map((status) => {
          const items = data.tasks.filter(
            (t) =>
              t.state === status && (filter === "all" || filter === status),
          );
          const label = {
            review: "Laukia peržiūros",
            waiting: "Laukia sprendimo",
            planned: "Planuojama",
          }[status];
          return items.length ? (
            <section className="task-group" aria-label={label} key={status}>
              <h3 className="task-group-heading">
                <Circle
                  size={13}
                  className={status === "review" ? "attention-state" : ""}
                />
                {label}
                <span>{items.length}</span>
              </h3>
              {items.map((t) => (
                <div id={t.id} className="issue-row" key={t.id}>
                  <span className="issue-id">{t.id.toUpperCase()}</span>
                  <Circle
                    size={13}
                    className={
                      status === "review"
                        ? "attention-state"
                        : "work-state-icon"
                    }
                  />
                  <h4 className="issue-title">{t.title}</h4>
                  <span className="metadata-pill">
                    <FileText size={12} />
                    {data.projects.find((p) => p.id === t.projectId)?.name}
                  </span>
                  <span className="issue-trailing">Nepradėta</span>
                </div>
              ))}
            </section>
          ) : null;
        })}
        {!data.tasks.some((t) => filter === "all" || t.state === filter) && (
          <p className="muted py-6">Šiame sąraše užduočių nėra.</p>
        )}
      </div>
      <section className="projects-section" aria-label="Projektai">
        <SectionTitle title="Projektai" />
        <div className="project-list divide-y divide-stone-100">
          {data.projects.map((p) => (
            <article
              id={p.id}
              key={p.id}
              className="project-row project-summary"
            >
              <span className="project-code">{p.code}</span>
              <div className="flex-1 min-w-0">
                <h2 className="font-medium">{p.name}</h2>
                <p className="muted">{p.description}</p>
              </div>
              <Badge>{p.stage}</Badge>
            </article>
          ))}
        </div>
      </section>
      {state.drafts
        .filter((d) => d.kind === "task")
        .map((d) => (
          <div className="draft-row mt-4" key={d.id}>
            <Badge>Vietinė idėja</Badge>
            <p className="mt-3">{d.text}</p>
          </div>
        ))}
    </>
  );
}
export function Agents({ data }: { data: Dashboard }) {
  return (
    <>
      <PageHeading
        eyebrow="Agentai"
        title="Agentai"
        description="Paperclip valdo deleguotas užduotis, vykdymą, biudžetus ir savo patvirtinimus."
      />
      <div className="panel divide-y divide-stone-100">
        {data.agents.length ? (
          data.agents.map((a, i) => (
            <div className="project-row" key={a.id}>
              <span className="agent-monogram">
                {(i + 1).toString().padStart(2, "0")}
              </span>
              <div className="flex-1">
                <h2 className="font-semibold">{a.name}</h2>
                <p className="muted text-sm mt-1">{a.role}</p>
              </div>
              <Badge>{a.status}</Badge>
            </div>
          ))
        ) : (
          <EmptyState title="Agentų sąrašas dar nepasiekiamas">
            Programos Paperclip prieigą patikrinkite pokalbyje. Neįjungti
            agentai nebus aktyvuojami automatiškai.
          </EmptyState>
        )}
      </div>
      <p className="notice mt-6">
        {data.mode === "demo"
          ? "Tai vaidmenų pavyzdžiai. Veikiantys agentai neprijungti."
          : "Prieš deleguojant tikrinama agento būsena ir savininko leidžiamų agentų sąrašas."}{" "}
        <Link className="underline" href="/settings">
          Ryšio nustatymai
        </Link>
      </p>
    </>
  );
}
export function Knowledge({ demo }: { demo: boolean }) {
  return (
    <>
      <PageHeading
        eyebrow="Žinios ir atmintis"
        title="Žinios ir atmintis"
        description="Markdown failai bus patvirtintų žinių šaltinis. Paieškos indeksą bus galima atkurti iš jų."
      />
      <div className="panel">
        <EmptyState
          title={
            demo ? "Žinių erdvės peržiūra" : "Žinių katalogas neprijungtas"
          }
          icon={<BookOpen size={28} />}
        >
          Pasirinkite privatų Markdown katalogą kitame etape. Obsidian galėsite
          naudoti kaip pasirenkamą redaktorių.
        </EmptyState>
      </div>
      {demo && (
        <section className="mt-9">
          <SectionTitle title="Pavyzdinis dokumentas" />
          <Modal
            title="Projekto gairės"
            description="Išgalvotas Markdown dokumento pavyzdys."
            trigger={
              <button className="panel project-row w-full text-left">
                <FileText size={23} />
                <div className="flex-1">
                  <h3 className="font-medium">Namų archyvo gairės</h3>
                  <p className="muted text-xs mt-2">
                    Pavyzdys · Markdown · neindeksuota
                  </p>
                </div>
                <ArrowUpRight size={19} />
              </button>
            }
          >
            <div className="prose-preview">
              <h3>Tikslas</h3>
              <p>Sugrupuoti dokumentus pagal paskirtį ir metus.</p>
              <h3>Dar nepriimtas sprendimas</h3>
              <p>
                Katalogų pavadinimus peržiūri savininkas. Automatiniai
                pakeitimai neleidžiami.
              </p>
              <p className="muted text-xs">
                Šaltinis: išgalvotas sąsajos pavyzdys.
              </p>
            </div>
          </Modal>
        </section>
      )}
    </>
  );
}
export function Settings({
  data,
  authMode,
}: {
  data: Dashboard;
  authMode: string;
}) {
  const { dispatch } = useDemo();
  const [reset, setReset] = useState(false);
  return (
    <>
      <PageHeading
        eyebrow="Nustatymai ir ryšiai"
        title="Nustatymai ir ryšiai"
        description="Čia matoma šios programos prieiga. Kūrimo įrankių prisijungimai savaime neperduodami programai."
      />
      <SectionTitle title="Programos ryšiai" />
      <div className="panel divide-y divide-stone-100">
        {data.connections.map((c) => (
          <div className="connection-row" key={c.id}>
            <div className="flex-1">
              <h2 className="font-semibold">{c.name}</h2>
              <p className="text-sm text-stone-500 mt-1">{c.purpose}</p>
              <p className="text-xs text-stone-500 mt-3">{c.state.detail}</p>
              {c.state.kind === "verified" && (
                <p className="text-xs mt-2">Patikrinta: {c.state.checkedAt}</p>
              )}
            </div>
            <ConnectionBadge state={c.state} />
          </div>
        ))}
      </div>
      <section className="mt-10">
        <SectionTitle title="Savininko prieiga" />
        <div className="panel p-6">
          <div className="flex items-center gap-3 mb-3">
            <ShieldCheck size={23} />
            <h3 className="font-semibold">
              {authMode === "development"
                ? "Aiškiai įjungtas kūrimo režimas"
                : authMode === "password"
                  ? "Slaptažodžio ir savininko sesijos patikra"
                  : "OIDC savininko patikra"}
            </h3>
          </div>
          <p className="muted text-sm">
            {authMode === "development"
              ? "Prisijungimas apeinamas tik vietinio kūrimo metu. Produkcijos aplinkoje ši nuostata prieigos nesuteikia."
              : authMode === "password"
                ? "Kiekviena serverio užklausa tikrina galiojančią savininko sesiją duomenų bazėje. Slaptažodį atkuria serverio operatorius."
                : "Kiekviena serverio užklausa tikrina pasirašytą prieigos žetoną ir vienintelio savininko tapatybę."}
          </p>
        </div>
      </section>
      {data.mode === "demo" && (
        <section className="mt-8">
          <SectionTitle title="Demonstracijos duomenys" />
          <p className="muted text-sm mb-4">
            Juodraščiai ir peržiūros žymos saugomi tik šios naršyklės vietinėje
            saugykloje.
          </p>
          <button
            className="button"
            onClick={() => {
              dispatch({ type: "reset" });
              setReset(true);
            }}
          >
            Atkurti demonstraciją
          </button>
          {reset && (
            <p className="text-sm text-emerald-800 mt-3" role="status">
              Vietiniai demonstracijos pakeitimai išvalyti.
            </p>
          )}
        </section>
      )}
    </>
  );
}
