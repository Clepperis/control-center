import { chromium, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "node:net";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { openTestDatabase } from "../tests/pglite";
import { migrate } from "../src/server/db/migrate";
import { Store } from "../src/server/orchestration/store";
import { OrchestrationService } from "../src/server/orchestration/service";
import type { ExternalTask } from "../src/integrations/contracts";
const base = "http://127.0.0.1:3100";
async function captureReview(page: Page, name: string) {
  if (!process.env.REVIEW_CAPTURE_DIR) return;
  await mkdir(process.env.REVIEW_CAPTURE_DIR, { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
    await page.screenshot({
      path: `${process.env.REVIEW_CAPTURE_DIR}/${name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
const db = await openTestDatabase();
await migrate(db, resolve("db/migrations"));
const store = new Store(db);
const owner = "synthetic-ui-owner",
  conversationId = randomUUID(),
  agentId = randomUUID(),
  companyId = randomUUID();
let task: ExternalTask | null = null,
  createCount = 0;
const service = new OrchestrationService(
  store,
  {
    async complete() {
      return {
        reply: {
          kind: "plan",
          reply:
            "Sintetinis sąsajos patikros pasiūlymas. Tai nėra gyvas vykdymas.",
          plan: {
            title: "Sintetinio sakinio peržiūra",
            objective: "Patikrinti tik sąsajos eigą",
            boundedTask: "Pateikti vieną pataisą išgalvotam sakiniui.",
            agentId,
            completionCriteria: ["Vienas pasiūlymas"],
            constraints: ["Tik deterministinis bandymas"],
          },
        },
        usage: null,
      };
    },
  },
  {
    async listAgents() {
      return [
        {
          id: agentId,
          name: "Sintetinis bandymo agentas",
          role: "reviewer",
          status: "idle",
          eligible: true,
        },
      ];
    },
    async createTask(input) {
      createCount++;
      task = {
        id: randomUUID(),
        companyId,
        identifier: "SYN-1",
        title: input.title,
        description: input.description,
        status: "todo",
        comments: [],
        assigneeAgentId: agentId,
      };
      return { id: task.id };
    },
    async readTask() {
      if (!task) throw new Error("No task");
      return task;
    },
    async findByMarker() {
      return task ? [task] : [];
    },
    taskUrl() {
      return "https://paperclip.example/SYN/issues/SYN-1";
    },
  },
  true,
);
await service.submit(
  owner,
  conversationId,
  randomUUID(),
  "Sintetinis UI bandymas: peržiūrėk sakinį.",
);
// Occupy a local port with a rejecting socket: the Next renderer cannot contact a real DB.
const trap = createServer((socket) => socket.destroy());
await new Promise<void>((r) => trap.listen(0, "127.0.0.1", r));
const address = trap.address();
if (!address || typeof address === "string") throw new Error("No test port");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "development",
      AUTH_MODE: "development",
      DATA_MODE: "live",
      APP_ORIGIN: base,
      DATABASE_URL: `postgresql://synthetic:synthetic@127.0.0.1:${address.port}/synthetic`,
      LIVE_MODEL_ENABLED: "false",
      LIVE_DELEGATION_ENABLED: "false",
      NEXOS_API_KEY: "",
      PAPERCLIP_BOARD_API_KEY: "",
    },
  },
);
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }
  expect(ready).toBe(true);
  expect((await fetch(base + "/api/workspace")).status).toBe(503);
  expect(
    (
      await fetch(base + "/api/chat", {
        method: "POST",
        headers: {
          Origin: "https://untrusted.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.route("**/api/workspace", async (route) =>
    route.fulfill({
      json: { conversations: await store.listConversations(owner) },
    }),
  );
  await page.route("**/api/conversations/*", async (route) =>
    route.fulfill({ json: await store.snapshot(owner, conversationId) }),
  );
  await page.route("**/api/runs/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const body = route.request().postDataJSON();
    const run =
      body.action === "confirm"
        ? await service.confirm(owner, id, body.planHash)
        : body.action === "stop"
          ? await service.stopTracking(owner, id)
          : await service.refresh(owner, id);
    await route.fulfill({
      json: {
        ...run,
        taskUrl: run.externalTaskId
          ? "https://paperclip.example/SYN/issues/SYN-1"
          : null,
      },
    });
  });
  await page.goto(`${base}/chat?conversation=${conversationId}`);
  await expect(
    page.getByRole("heading", { name: "Sintetinio sakinio peržiūra" }),
  ).toBeVisible();
  await expect(page.getByLabel("Jūsų žinutė")).toBeDisabled();
  expect(createCount).toBe(0);
  const proposalScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(proposalScan.violations).toEqual([]);
  await captureReview(page, "chat-proposal");
  const row = page.locator(".run-card").first();
  await row.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(row).not.toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Atnaujinti peržiūrą" }).click();
  await expect(row).not.toHaveAttribute("open", "");
  await row.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Patvirtinti ir deleguoti" }),
  ).toBeVisible();
  expect(createCount).toBe(0);
  await page.getByRole("button", { name: "Patvirtinti ir deleguoti" }).click();
  await expect(
    page.getByText("Užduotis sukurta", { exact: true }),
  ).toBeVisible();
  expect(createCount).toBe(1);
  await expect(
    page.getByRole("button", { name: "Patvirtinti ir deleguoti" }),
  ).toHaveCount(0);
  (task as ExternalTask | null)!.status = "in_progress";
  await page.getByRole("button", { name: "Sutikrinti būseną" }).click();
  await expect(
    page.getByText("Paperclip: vykdoma", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sustabdyti tik stebėjimą" }).click();
  await expect(
    page.getByText("Sustabdytas tik vietinis stebėjimas.", { exact: false }),
  ).toBeVisible();
  expect((task as ExternalTask | null)!.status).toBe("in_progress");
  (task as ExternalTask | null)!.status = "done";
  (task as ExternalTask | null)!.comments = [
    "Sintetinis rezultatas: siūloma viena pataisa.",
  ];
  await page.getByRole("button", { name: "Sutikrinti būseną" }).click();
  await expect(
    page.getByText("Paperclip: baigta", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Gauti rezultatai ir komentarai (1)", { exact: true })
    .click();
  await expect(
    page.getByText("Sintetinis rezultatas: siūloma viena pataisa.", {
      exact: true,
    }),
  ).toBeVisible();
  await captureReview(page, "chat-result");
  await mkdir(".local/screenshots", { recursive: true });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
  await page.screenshot({
    path: ".local/screenshots/chat-synthetic-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  const resultScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(resultScan.violations).toEqual([]);
  await page.screenshot({
    path: ".local/screenshots/chat-synthetic-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const path of [
    "",
    "chat",
    "projects",
    "agents",
    "automations",
    "knowledge",
    "improve",
    "settings",
  ]) {
    await page.goto(`${base}/${path}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
  expect(createCount).toBe(1);
  console.log(
    "Synthetic live UI verified: persisted plan, confirmation, single delegation, status, results, local-only stop, missing DB, origin rejection and 390px navigation. External services were replaced only in this test process.",
  );
} finally {
  await browser.close();
  child.kill();
  await new Promise<void>((r) => {
    if (child.exitCode !== null) r();
    else child.once("exit", () => r());
  });
  await db.close();
  await new Promise<void>((r) => trap.close(() => r()));
}
