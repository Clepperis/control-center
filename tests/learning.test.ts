import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { migrate } from "../src/server/db/migrate";
import type { Database } from "../src/server/db/types";
import { LessonService } from "../src/server/learning/service";
import { NexosGateway } from "../src/integrations/nexos";
import type { Fetcher } from "../src/integrations/errors";
import { openTestDatabase } from "./pglite";

let db: Database;
let lessons: LessonService;
beforeEach(async () => {
  db = await openTestDatabase();
  await migrate(db, resolve("db/migrations"));
  lessons = new LessonService(db);
});
afterEach(async () => {
  await db.close();
});

async function message(owner: string) {
  const conversationId = randomUUID(),
    turnId = randomUUID(),
    id = randomUUID();
  await db.query(
    "INSERT INTO conversations(id,owner_subject,title) VALUES($1,$2,'t')",
    [conversationId, owner],
  );
  await db.query(
    "INSERT INTO turns(id,conversation_id,request_id,input_hash,status) VALUES($1,$2,$3,'h','completed')",
    [turnId, conversationId, randomUUID()],
  );
  await db.query(
    "INSERT INTO messages(id,conversation_id,turn_id,role,content) VALUES($1,$2,$3,'assistant','Atsakymas')",
    [id, conversationId, turnId],
  );
  return id;
}

describe("lessons", () => {
  it("proposes lessons for review and counts repeats instead of duplicating", async () => {
    const a = await lessons.propose("owner", {
      text: "Laiškuose rašyk „Laba diena“, ne „Sveiki“.",
      source: "edit",
    });
    const b = await lessons.propose("owner", {
      text: "  laiškuose rašyk „laba diena“, ne „sveiki“. ",
      source: "edit",
    });
    expect(b.id).toBe(a.id);
    expect(b.occurrences).toBe(2);
    expect(b.state).toBe("proposed");
    expect(await lessons.approved("owner")).toEqual([]);
  });

  it("uses only owner-approved lessons and lets the owner retire them", async () => {
    const l = await lessons.propose("owner", {
      text: "Renginių partnerius tikrink CRM prieš siūlydamas.",
      source: "owner",
    });
    await lessons.decide("owner", l.id, "approved");
    expect(await lessons.approved("owner")).toEqual([
      "Renginių partnerius tikrink CRM prieš siūlydamas.",
    ]);
    await lessons.decide("owner", l.id, "retired");
    expect(await lessons.approved("owner")).toEqual([]);
  });

  it("keeps a rejected lesson rejected when it is proposed again", async () => {
    const l = await lessons.propose("owner", {
      text: "Rašyk ilgai.",
      source: "agent",
    });
    await lessons.decide("owner", l.id, "rejected");
    const again = await lessons.propose("owner", {
      text: "Rašyk ilgai.",
      source: "agent",
    });
    expect(again.state).toBe("rejected");
  });

  it("isolates owners", async () => {
    const l = await lessons.propose("owner", {
      text: "Taisyklė A.",
      source: "owner",
    });
    await expect(
      lessons.decide("other", l.id, "approved"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("records 👍/👎 feedback and turns a 👎 note into a lesson proposal", async () => {
    const id = await message("owner");
    await lessons.feedback("owner", id, 1);
    await lessons.feedback(
      "owner",
      id,
      -1,
      "Per ilgas atsakymas, rašyk trumpiau.",
    );
    const rows = await db.query<{ rating: number }>(
      "SELECT rating FROM message_feedback WHERE message_id=$1",
      [id],
    );
    expect(rows.rows).toEqual([{ rating: -1 }]);
    expect(
      (await lessons.list("owner", "proposed")).map((x) => x.text),
    ).toEqual(["Per ilgas atsakymas, rašyk trumpiau."]);
  });

  it("refuses feedback on another owner's message", async () => {
    const id = await message("owner");
    await expect(lessons.feedback("other", id, 1)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("gateway follows approved lessons", () => {
  it("adds owner-approved lessons to the system instructions", async () => {
    let system = "";
    const fetcher: Fetcher = async (url, init) => {
      if (String(url).endsWith("/models"))
        return Response.json({
          data: [{ id: "m", endpoints: ["chat_completion"] }],
        });
      system = JSON.parse(String(init?.body)).messages[0].content;
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({ kind: "answer", reply: "Gerai." }),
            },
          },
        ],
      });
    };
    await new NexosGateway(
      {
        apiKey: "k",
        model: "m",
        timeoutMs: 1000,
        maxTokens: 100,
        enabled: true,
      },
      fetcher,
    ).complete(
      [{ role: "user", content: "Labas" }],
      [],
      undefined,
      [],
      undefined,
      {
        lessons: ["Rašyk trumpai."],
      },
    );
    expect(system).toContain("Owner-approved lessons");
    expect(system).toContain("Rašyk trumpai.");
  });
});
