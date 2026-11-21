"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ThumbsDown, ThumbsUp } from "@phosphor-icons/react";
import { PageHeading } from "./dashboard";

interface Lesson {
  id: string;
  text: string;
  source: string;
  state: "proposed" | "approved" | "rejected" | "retired";
  occurrences: number;
}

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Nepavyko išsaugoti.");
  return value;
}

const SOURCE_LABEL: Record<string, string> = {
  feedback: "iš jūsų 👎",
  edit: "iš jūsų pataisymo",
  rejection: "iš atmetimo",
  failure: "iš klaidos",
  agent: "pasiūlė agentas",
  owner: "jūsų",
};

/** Thumbs under an assistant reply; a thumbs-down note becomes a lesson proposal. */
export function MessageFeedback({ messageId }: { messageId: string }) {
  const [state, setState] = useState<"idle" | "note" | "sent">("idle");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  async function send(rating: 1 | -1, text?: string) {
    try {
      await post("/api/feedback", {
        messageId,
        rating,
        note: text || undefined,
      });
      setState("sent");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepavyko išsaugoti.");
    }
  }
  if (state === "sent")
    return <p className="muted text-xs mt-2">Ačiū, įvertinimas išsaugotas.</p>;
  return (
    <div className="feedback-row">
      <button
        type="button"
        className="button feedback-btn"
        aria-label="Geras atsakymas"
        onClick={() => send(1)}
      >
        <ThumbsUp size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="button feedback-btn"
        aria-label="Blogas atsakymas"
        onClick={() => setState("note")}
      >
        <ThumbsDown size={16} aria-hidden="true" />
      </button>
      {state === "note" && (
        <form
          className="feedback-note"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            send(-1, note);
          }}
        >
          <label htmlFor={`fb-${messageId}`} className="sr-only">
            Ką pagerinti
          </label>
          <input
            id={`fb-${messageId}`}
            className="input"
            maxLength={400}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ką pagerinti? Taps pamokos pasiūlymu."
          />
          <button type="submit" className="button">
            Siųsti
          </button>
        </form>
      )}
      {error && <p className="notice">{error}</p>}
    </div>
  );
}

/** Review lessons: approve proposals, retire approved ones, add your own. */
export function LessonsWorkspace({ live }: { live: boolean }) {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/lessons", { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "Nepavyko gauti pamokų.");
    setLessons(value.lessons);
  }, []);
  useEffect(() => {
    if (!live) return;
    let active = true;
    queueMicrotask(() => {
      load().catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Nepavyko gauti pamokų.");
      });
    });
    return () => {
      active = false;
    };
  }, [live, load]);
  async function act(body: unknown) {
    try {
      await post("/api/lessons", body);
      setError("");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepavyko išsaugoti.");
      return false;
    }
  }
  const proposed = lessons.filter((l) => l.state === "proposed");
  const approved = lessons.filter((l) => l.state === "approved");
  return (
    <>
      <PageHeading
        eyebrow="Mokymasis"
        title="Pamokos"
        description="Taisyklės iš jūsų įvertinimų, pataisymų ir klaidų. Modeliai ir agentai naudoja tik jūsų patvirtintas."
      />
      {!live ? (
        <p className="notice">
          Pamokos veikia tik su PostgreSQL duomenų baze (DATA_MODE=live).
        </p>
      ) : (
        <div className="lessons">
          {error && <p className="notice">{error}</p>}
          <section>
            <h2 className="section-title">
              Laukia patvirtinimo ({proposed.length})
            </h2>
            {!proposed.length && (
              <p className="muted text-sm">Naujų pasiūlymų nėra.</p>
            )}
            {proposed.map((l) => (
              <article key={l.id} className="panel lesson">
                <p>{l.text}</p>
                <p className="muted text-xs">
                  {SOURCE_LABEL[l.source] ?? l.source}
                  {l.occurrences > 1
                    ? ` · pasikartojo ${l.occurrences} k.`
                    : ""}
                </p>
                <div className="lesson-actions">
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => act({ action: "approved", id: l.id })}
                  >
                    Patvirtinti
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => act({ action: "rejected", id: l.id })}
                  >
                    Atmesti
                  </button>
                </div>
              </article>
            ))}
          </section>
          <section>
            <h2 className="section-title">Galioja ({approved.length})</h2>
            {!approved.length && (
              <p className="muted text-sm">Patvirtintų pamokų dar nėra.</p>
            )}
            {approved.map((l) => (
              <article key={l.id} className="panel lesson">
                <p>{l.text}</p>
                <div className="lesson-actions">
                  <button
                    type="button"
                    className="button"
                    onClick={() => act({ action: "retired", id: l.id })}
                  >
                    Nebetaikyti
                  </button>
                </div>
              </article>
            ))}
          </section>
          <form
            className="panel lesson"
            onSubmit={async (e) => {
              e.preventDefault();
              if (text.trim().length < 3) {
                setError("Pamoka per trumpa.");
                return;
              }
              if (await act({ action: "propose", text })) setText("");
            }}
          >
            <label htmlFor="new-lesson" className="section-title">
              Nauja pamoka
            </label>
            <input
              id="new-lesson"
              className="input"
              maxLength={400}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Pvz., laiškuose rašyk „Laba diena“."
            />
            <button type="submit" className="button">
              Pridėti
            </button>
          </form>
        </div>
      )}
    </>
  );
}
