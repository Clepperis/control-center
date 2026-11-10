"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Plus,
  BookOpen,
  Lightning,
  ArrowRight,
  PaperPlaneTilt,
  FileText,
  ShieldCheck,
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
      <div className="panel divide-y divide-stone-100 mb-10">
        {data.projects.map((p) => (
          <article id={p.id} key={p.id} className="project-row">
            <span className="project-code">{p.code}</span>
            <div className="flex-1">
              <h2 className="font-semibold text-lg">{p.name}</h2>
              <p className="muted text-sm mt-1">{p.description}</p>
            </div>
            <Badge>{p.stage}</Badge>
          </article>
        ))}
      </div>
      <SectionTitle title="Užduočių sąrašas" />
      <label htmlFor="task-filter" className="text-sm block mb-2">
        Rodyti užduotis
      </label>
      <select
        id="task-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="input max-w-xs mb-5"
      >
        <option value="all">Visos būsenos</option>
        <option value="review">Laukia peržiūros</option>
        <option value="planned">Planuojama</option>
        <option value="waiting">Laukia sprendimo</option>
      </select>
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
                {label}
                <span>{items.length}</span>
              </h3>
              {items.map((t) => (
                <div
                  id={t.id}
                  className="project-row border-b border-stone-100"
                  key={t.id}
                >
                  <FileText size={18} />
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{t.title}</h4>
                    <p className="muted text-xs mt-1">
                      {data.projects.find((p) => p.id === t.projectId)?.name}
                    </p>
                  </div>
                  <Badge tone={status === "review" ? "warning" : "muted"}>
                    {label}
                  </Badge>
                </div>
              ))}
            </section>
          ) : null;
        })}
        {!data.tasks.some((t) => filter === "all" || t.state === filter) && (
          <p className="muted py-6">Šiame sąraše užduočių nėra.</p>
        )}
      </div>
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
export function Automations() {
  return (
    <>
      <PageHeading
        eyebrow="Automatizacijos"
        title="Automatizacijos"
        description="Darbo eigas ir jų tvarkaraščius valdys n8n. Šis centras rodys jų būseną ir rezultatus."
      />
      <div className="panel">
        <EmptyState
          title="Automatizacijos dar neprijungtos"
          icon={<Lightning size={28} />}
        >
          Šiame etape darbo eigos nekuriamos ir nevykdomos. n8n integracija bus
          įgyvendinta atskirai.
          <div className="mt-6">
            <Link href="/settings" className="button">
              Peržiūrėti ryšius
              <ArrowRight size={16} />
            </Link>
          </div>
        </EmptyState>
      </div>
      <div className="mt-9 max-w-2xl">
        <h2 className="font-semibold mb-3">
          Viena darbo eiga, vienas tvarkaraštis
        </h2>
        <p className="muted">
          Valdymo centras nekurs papildomų tos pačios automatizacijos grafikų.
          Nežinomi ar pasenę vykdymo duomenys bus aiškiai pažymėti.
        </p>
      </div>
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
export function Improve({ demo }: { demo: boolean }) {
  return (
    <>
      <PageHeading
        eyebrow="Tobulinti sistemą"
        title="Tobulinti sistemą"
        description="Atskiras tobulinimo agentas ateityje rengs izoliuotus pakeitimus, testus ir peržiūrą."
      />
      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-8">
        <section className="panel p-6 sm:p-8">
          {demo ? (
            <DraftForm
              kind="improve"
              label="Ką norėtumėte patobulinti?"
              placeholder="Aprašykite problemą, norimą rezultatą ir kaip jį patikrintumėte…"
            />
          ) : (
            <>
              <h2 className="font-semibold text-xl">
                Parenkite ribotą užduotį pokalbyje
              </h2>
              <p className="muted mt-3 mb-5">
                Nurodykite norimą pakeitimą, priėmimo kriterijus ir apribojimus.
                Delegavimui reikės atskiro patvirtinimo.
              </p>
              <Link href="/chat" className="button button-primary">
                Atverti pokalbį
                <PaperPlaneTilt size={17} />
              </Link>
            </>
          )}
        </section>
        <aside>
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <ShieldCheck size={22} />
            Nuo pasiūlymo iki peržiūros
          </h2>
          <ol className="steps">
            <li>
              <span>01</span>Aiški užduotis ir ribos
            </li>
            <li>
              <span>02</span>Atskira darbo aplinka
            </li>
            <li>
              <span>03</span>Testai, pakeitimai ir peržiūra
            </li>
            <li>
              <span>04</span>Savininko leidimas produkcijai
            </li>
          </ol>
          <p className="muted text-sm">
            Produkcijos pakeitimai šiame etape nevykdomi.
          </p>
        </aside>
      </div>
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
                : "OIDC savininko patikra"}
            </h3>
          </div>
          <p className="muted text-sm">
            {authMode === "development"
              ? "Prisijungimas apeinamas tik vietinio kūrimo metu. Produkcijos aplinkoje ši nuostata prieigos nesuteikia."
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
