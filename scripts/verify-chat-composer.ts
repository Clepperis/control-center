import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";

// Isolated browser scenario: every application API response is synthetic.
const base = "http://127.0.0.1:3110";
const directory = resolve(".local/chat-composer");
const baseline = process.argv.includes("--baseline");
await mkdir(directory, { recursive: true });
const trap = createServer((socket) => socket.destroy());
await new Promise<void>((done) => trap.listen(0, "127.0.0.1", done));
const address = trap.address();
if (!address || typeof address === "string") throw Error("Missing test port");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3110",
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      AUTH_MODE: "development",
      DATA_MODE: "live",
      CONTROL_CENTER_TEST_DIST: "true",
      APP_ORIGIN: base,
      DATABASE_URL: `postgresql://synthetic:synthetic@127.0.0.1:${address.port}/synthetic`,
      LIVE_MODEL_ENABLED: "true",
      NEXOS_API_KEY: "synthetic-never-sent",
      NEXOS_MODEL: "synthetic",
      LIVE_DELEGATION_ENABLED: "false",
      N8N_EXECUTION_ENABLED: "false",
      IMPROVEMENT_EXECUTOR_ENABLED: "false",
      PAPERCLIP_BOARD_API_KEY: "",
      N8N_MCP_TOKEN: "",
    },
  },
);
let logs = "";
for (const stream of [child.stdout, child.stderr])
  stream?.on("data", (chunk) => {
    logs = (logs + chunk.toString()).slice(-5000);
  });
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
    await delay(300);
  }
  if (!ready) throw Error(`Local scenario unavailable: ${logs}`);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const sent: { text: string; conversationId: string; requestId: string }[] =
    [];
  let rejectNext = false;
  let snapshot: Record<string, unknown> | null = null;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/workspace")
      return route.fulfill({ json: { conversations: [] } });
    if (path === "/api/knowledge")
      return route.fulfill({ json: { projects: [] } });
    if (path.startsWith("/api/conversations/"))
      return route.fulfill({ json: snapshot });
    if (path === "/api/chat") {
      const body = route.request().postDataJSON();
      sent.push(body);
      await delay(300);
      if (rejectNext) {
        rejectNext = false;
        return route.fulfill({
          status: 503,
          json: { error: "Sintetinis ryšio nutrūkimas." },
        });
      }
      const now = new Date().toISOString();
      snapshot = {
        conversation: {
          id: body.conversationId,
          title: "Sintetinis bandymas",
          createdAt: now,
          updatedAt: now,
        },
        messages: [
          {
            id: randomUUID(),
            role: "user",
            content: body.text,
            createdAt: now,
            usage: null,
          },
        ],
        runs: [],
        turns: [],
        automationRuns: [],
      };
      return route.fulfill({ json: snapshot });
    }
    return route.fulfill({
      status: 503,
      json: { error: "External requests disabled in browser scenario." },
    });
  });
  await page.goto(base + "/chat");
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
  const field = page.getByLabel("Jūsų žinutė", { exact: true });
  await expect(field).toBeEnabled();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await field.fill("Padėk suplanuoti mano dieną.");
    await page.locator(".chat-composer").scrollIntoViewIfNeeded();
    await page.locator(".chat-composer").screenshot({
      path: `${directory}/${baseline ? "before" : "after"}-${width}.png`,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  if (!baseline) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await field.fill(" ");
    await field.press("Enter");
    expect(sent).toHaveLength(0);
    await field.fill("Pirma eilutė");
    await field.press("Shift+Enter");
    await field.pressSequentially("Antra eilutė");
    await expect(field).toHaveValue("Pirma eilutė\nAntra eilutė");
    expect(sent).toHaveLength(0);
    await field.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      isComposing: true,
    });
    expect(sent).toHaveLength(0);
    await field.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 229,
    });
    expect(sent).toHaveLength(0);
    await field.dispatchEvent("keydown", {
      key: "Enter",
      code: "Enter",
      repeat: true,
    });
    expect(sent).toHaveLength(0);
    await page.getByLabel("Naudoti projekto žinias").check();
    await field.press("Enter");
    expect(sent).toHaveLength(0);
    await page.getByLabel("Naudoti projekto žinias").uncheck();
    await field.press("Enter");
    await expect(field).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Nutraukti laukimą", exact: true }),
    ).toBeVisible();
    await expect(field).toHaveValue("");
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toBe("Pirma eilutė\nAntra eilutė");
    rejectNext = true;
    await field.fill("Išsaugoti nutrūkusią užklausą");
    await field.press("Enter");
    await expect(
      page.getByRole("button", {
        name: "Gauti tos pačios užklausos būseną",
        exact: true,
      }),
    ).toBeVisible();
    await expect(field).toBeDisabled();
    expect(sent).toHaveLength(2);
    await page
      .getByRole("button", {
        name: "Gauti tos pačios užklausos būseną",
        exact: true,
      })
      .click();
    await expect(field).toHaveValue("");
    expect(sent).toHaveLength(3);
    expect(sent[2].requestId).toBe(sent[1].requestId);
    const scan = await new AxeBuilder({ page })
      .include(".chat-composer")
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await writeFile(
      `${directory}/verification.json`,
      JSON.stringify(
        {
          status: "passed",
          enterSend: true,
          shiftEnterNewline: true,
          compositionAndRepeatGuard: true,
          knowledgeScopeGuard: true,
          pendingAndRetryGuard: true,
          desktopMobileOverflow: false,
          axeViolations: 0,
          paidRequests: 0,
        },
        null,
        2,
      ),
    );
  }
  console.log(
    baseline
      ? "Composer baseline captured."
      : "Composer keyboard, recovery, accessibility and responsive checks passed; synthetic requests only.",
  );
} finally {
  await browser.close();
  child.kill();
  await new Promise<void>((done) => trap.close(() => done()));
}
