import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  request,
  expect,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Sql } from "../src/server/db/types";

/** Actual production HTTP, database and browser flow; no external service calls. */
export async function verifyIntegratedOwnerUi({
  page,
  context,
  base,
  db,
  token,
}: {
  page: Page;
  context: BrowserContext;
  base: string;
  db: Sql;
  token: string;
}) {
  const anonymous = await request.newContext({
    baseURL: base,
    ignoreHTTPSErrors: true,
  });
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json, text/event-stream",
    "MCP-Protocol-Version": "2025-03-26",
  };
  const rpc = async (method: string, params?: unknown) => {
    const response = await anonymous.post("/api/mcp", {
      headers,
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("no-store");
    // The SDK serves legacy MCP over SSE and modern MCP as JSON.
    const raw = await response.text();
    const body = JSON.parse(
      response.headers()["content-type"]?.includes("text/event-stream")
        ? raw
            .split(/\r?\n/)
            .find((line) => line.startsWith("data: "))!
            .slice(6)
        : raw,
    );
    assert(!body.error, JSON.stringify(body.error));
    return body.result;
  };
  const tool = async (name: string, args = {}) => {
    const result = await rpc("tools/call", { name, arguments: args });
    assert(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  try {
    expect((await anonymous.post("/api/mcp", { data: {} })).status()).toBe(401);
    expect(
      (
        await anonymous.post("/api/mcp", {
          headers: { Authorization: "Bearer wrong-token" },
          data: {},
        })
      ).status(),
    ).toBe(401);
    // MCP access must never become cookie-authenticated approval authority.
    expect((await anonymous.get("/api/lessons", { headers })).status()).toBe(
      401,
    );
    expect(
      (await context.request.post(base + "/api/mcp", { data: {} })).status(),
    ).toBe(401);
    expect(
      (
        await anonymous.post("/api/mcp", {
          headers,
          data: { padding: "x".repeat(32000) },
        })
      ).status(),
    ).toBe(413);
    const listed = await rpc("tools/list");
    expect(listed.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "knowledge_search",
      "list_automations",
      "list_lessons",
      "propose_lesson",
      "request_automation_run",
      "usage_stats",
    ]);
    expect((await tool("usage_stats")).totals.calls).toBe(0);
    expect(await tool("list_lessons")).toEqual([]);
    const rule = "Prieš siūlydamas partnerį patikrink CRM.";
    const proposal = await tool("propose_lesson", { text: rule });
    expect(proposal.state).toBe("proposed");
    expect(await tool("list_lessons")).toEqual([]);
    await page.goto(base + "/lessons");
    const card = page.getByRole("article").filter({ hasText: rule });
    await card
      .getByRole("button", { name: "Patvirtinti", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Galioja (1)", exact: true }),
    ).toBeVisible();
    expect(await tool("list_lessons")).toEqual([rule]);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["lessons", "statistics"]) {
        await page.goto(`${base}/${route}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        if (route === "statistics")
          await expect(
            page.getByRole("cell", { name: "synthetic-codex", exact: true }),
          ).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        const scan = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
          .analyze();
        assert.deepEqual(scan.violations, []);
        await page.screenshot({
          path: `.local/phase-6/integration-${route}-${width}.png`,
          fullPage: true,
        });
      }
    }
    const csrf = await context.request.post(base + "/api/lessons", {
      headers: { Origin: "https://attacker.example" },
      data: { action: "retired", id: proposal.id },
    });
    expect(csrf.status()).toBe(403);
    await page.goto(base + "/lessons");
    await page
      .getByRole("article")
      .filter({ hasText: rule })
      .getByRole("button", { name: "Nebetaikyti", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Galioja (0)", exact: true }),
    ).toBeVisible();
    expect(await tool("list_lessons")).toEqual([]);
    // Seed an assistant answer without making a paid model call, then submit
    // actual feedback through the production UI and review its lesson.
    const conversationId = randomUUID(),
      turnId = randomUUID(),
      messageId = randomUUID();
    await db.query(
      "INSERT INTO conversations(id,owner_subject,title) VALUES($1,'synthetic-owner','Sintetinis pokalbis')",
      [conversationId],
    );
    await db.query(
      "INSERT INTO turns(id,conversation_id,request_id,input_hash,status) VALUES($1,$2,$3,'synthetic','completed')",
      [turnId, conversationId, randomUUID()],
    );
    await db.query(
      "INSERT INTO messages(id,conversation_id,turn_id,role,content) VALUES($1,$2,$3,'assistant','Sintetinis atsakymas peržiūrai.')",
      [messageId, conversationId, turnId],
    );
    await page.goto(`${base}/chat?conversation=${conversationId}`);
    await page
      .getByRole("button", { name: "Blogas atsakymas", exact: true })
      .click();
    const feedbackRule = "Šaltinius pateik trumpai.";
    await page.getByLabel("Ką pagerinti", { exact: true }).fill(feedbackRule);
    await page.getByRole("button", { name: "Siųsti", exact: true }).click();
    await expect(
      page.getByText("Ačiū, įvertinimas išsaugotas.", { exact: true }),
    ).toBeVisible();
    await page.goto(base + "/lessons");
    await page
      .getByRole("article")
      .filter({ hasText: feedbackRule })
      .getByRole("button", { name: "Atmesti", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Laukia patvirtinimo (0)",
        exact: true,
      }),
    ).toBeVisible();
    const repeated = await tool("propose_lesson", { text: feedbackRule });
    expect(repeated.state).toBe("rejected");
    expect(repeated.status).toBe("rejected");
    expect(
      (
        await db.query(
          "SELECT rating FROM message_feedback WHERE message_id=$1",
          [messageId],
        )
      ).rows,
    ).toEqual([{ rating: -1 }]);
    const ledger = await db.query<{ tool: string }>(
      "SELECT tool FROM tool_calls ORDER BY created_at",
    );
    expect(ledger.rows.some((r) => r.tool === "propose_lesson")).toBe(true);
    const schema = await db.query(
      "SELECT name FROM schema_migrations WHERE name IN ('008_tool_calls.sql','009_lessons.sql') ORDER BY name",
    );
    expect(schema.rows).toHaveLength(2);
  } finally {
    await anonymous.dispose();
  }
}
