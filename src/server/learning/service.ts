import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Sql } from "../db/types";
import { DomainError } from "../orchestration/store";

export type LessonState = "proposed" | "approved" | "rejected" | "retired";
export type LessonSource =
  "feedback" | "edit" | "rejection" | "failure" | "agent" | "owner";
export interface Lesson {
  id: string;
  scope: string;
  text: string;
  source: LessonSource;
  state: LessonState;
  occurrences: number;
  evidence: string | null;
  createdAt: string;
  decidedAt: string | null;
}
// A lesson becomes one bullet in the model's system instructions, so it must
// stay one visible line: collapse line breaks/tabs, refuse invisible
// control and format characters (bidi overrides, zero-width).
const INVISIBLE = /[\p{Cc}\p{Cf}]/u;
export const lessonText = z
  .string()
  .transform((s) => s.replace(/\s+/gu, " ").trim())
  .pipe(
    z
      .string()
      .min(3)
      .max(400)
      .refine((s) => !INVISIBLE.test(s), "invisible_characters"),
  );
const proposalSchema = z.object({
  text: lessonText,
  source: z.enum([
    "feedback",
    "edit",
    "rejection",
    "failure",
    "agent",
    "owner",
  ]),
  scope: z.string().trim().min(1).max(80).default("global"),
  evidence: z.string().trim().max(500).optional(),
});
const MAX_APPROVED = 12;

/** Case/space/punctuation-insensitive key so repeats are counted, not duplicated. */
export function lessonKey(text: string): string {
  return text
    .toLocaleLowerCase("lt")
    .normalize("NFKC")
    .replace(/[\s.,!?;:„“"'()«»-]+/gu, " ")
    .trim();
}
function toLesson(r: Record<string, unknown>): Lesson {
  return {
    id: String(r.id),
    scope: String(r.scope),
    text: String(r.text),
    source: r.source as LessonSource,
    state: r.state as LessonState,
    occurrences: Number(r.occurrences),
    evidence: (r.evidence as string | null) ?? null,
    createdAt: new Date(String(r.created_at)).toISOString(),
    decidedAt: r.decided_at
      ? new Date(String(r.decided_at)).toISOString()
      : null,
  };
}

/** Owner-reviewed lessons. Proposals never affect a model until approved. */
export class LessonService {
  constructor(private db: Sql) {}

  async propose(
    owner: string,
    input: z.input<typeof proposalSchema>,
  ): Promise<Lesson> {
    const p = proposalSchema.parse(input);
    const row = (
      await this.db.query(
        `INSERT INTO lessons(id,owner_subject,scope,text,text_key,source,evidence)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(owner_subject,scope,text_key)
         DO UPDATE SET occurrences = lessons.occurrences +
           -- Only the owner's own signals reinforce a pending lesson; agent
           -- repeats and repeats after a decision never change its weight.
           CASE WHEN lessons.state = 'proposed' AND EXCLUDED.source <> 'agent'
             THEN 1 ELSE 0 END
         RETURNING *`,
        [
          randomUUID(),
          owner,
          p.scope,
          p.text,
          lessonKey(p.text),
          p.source,
          p.evidence ?? null,
        ],
      )
    ).rows[0];
    return toLesson(row);
  }

  async decide(
    owner: string,
    id: string,
    state: "approved" | "rejected" | "retired",
  ): Promise<Lesson> {
    z.uuid().parse(id);
    const row = (
      await this.db.query(
        "UPDATE lessons SET state=$3, decided_at=now() WHERE id=$1 AND owner_subject=$2 RETURNING *",
        [id, owner, state],
      )
    ).rows[0];
    if (!row) throw new DomainError(404, "not_found");
    return toLesson(row);
  }

  async list(owner: string, state?: LessonState): Promise<Lesson[]> {
    return (
      await this.db.query(
        "SELECT * FROM lessons WHERE owner_subject=$1 AND ($2::text IS NULL OR state=$2) ORDER BY occurrences DESC, created_at DESC LIMIT 200",
        [owner, state ?? null],
      )
    ).rows.map(toLesson);
  }

  /** Approved lesson texts for one scope plus global, most reinforced first. */
  async approved(owner: string, scope = "global"): Promise<string[]> {
    return (
      await this.db.query<{ text: string }>(
        "SELECT text FROM lessons WHERE owner_subject=$1 AND state='approved' AND scope IN ('global',$2) ORDER BY occurrences DESC, decided_at DESC LIMIT $3",
        [owner, scope, MAX_APPROVED],
      )
    ).rows.map((r) => r.text);
  }

  /** Thumbs up/down on an assistant message; a down vote with a note becomes a lesson proposal. */
  async feedback(
    owner: string,
    messageId: string,
    rating: 1 | -1,
    note?: string,
  ): Promise<void> {
    z.uuid().parse(messageId);
    const cleanNote = note?.trim().slice(0, 400) || null;
    const owned = (
      await this.db.query(
        "SELECT m.id FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.id=$1 AND c.owner_subject=$2 AND m.role='assistant'",
        [messageId, owner],
      )
    ).rows[0];
    if (!owned) throw new DomainError(404, "not_found");
    await this.db.query(
      `INSERT INTO message_feedback(message_id,owner_subject,rating,note) VALUES($1,$2,$3,$4)
       ON CONFLICT(message_id) DO UPDATE SET rating=EXCLUDED.rating, note=EXCLUDED.note, created_at=now()`,
      [messageId, owner, rating, cleanNote],
    );
    // A note that cannot be a valid lesson stays as feedback only.
    if (rating === -1 && cleanNote && lessonText.safeParse(cleanNote).success)
      await this.propose(owner, {
        text: cleanNote,
        source: "feedback",
        evidence: `message:${messageId}`,
      });
  }
}
