import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import type { Store } from "../src/server/orchestration/store";
import { digest } from "../src/server/orchestration/store";
import { AutomationService } from "../src/server/automations/service";
import { N8nClient, N8nTransport } from "../src/integrations/n8n";
import { n8nHttpFixture } from "../tests/n8n-http-fixture";
import { OrchestrationService } from "../src/server/orchestration/service";

export async function verifyAutomationUi(
  page: Page,
  store: Store,
  owner: string,
  base: string,
  capture: (page: Page, name: string) => Promise<void>,
) {
  const f = n8nHttpFixture();
  const automations = new AutomationService(
    store,
    new N8nClient(f.config, new N8nTransport(f.config, f.fetcher)),
    {
      configured: true,
      enabled: true,
      contract: f.config.contract,
      configHash: "synthetic",
      originHash: digest(f.config.origin),
    },
  );
  const error = (e: unknown) => ({
    error: e instanceof Error ? e.message : "synthetic failure",
  });
  await page.route("**/api/automations**", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    try {
      let value: unknown;
      if (route.request().method() === "GET")
        value = {
          catalog: await automations.catalog(owner),
          runs: await automations.list(owner),
        };
      else {
        const b = route.request().postDataJSON();
        value = id
          ? b.action === "confirm"
            ? await automations.confirm(owner, id, b.actionHash)
            : b.action === "stop"
              ? await automations.stop(owner, id)
              : await automations.refresh(owner, id)
          : b.action === "sync"
            ? await automations.syncCatalog(owner)
            : await automations.propose(
                owner,
                b.requestId,
                b.proposal.key,
                b.proposal.input,
              );
      }
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({ status: 409, json: error(e) });
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/automations");
  await expect(
    page.getByText("Sukonfigūruota, nepatikrinta", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Patikrinti ryšį ir katalogą" })
    .click();
  await expect(
    page.getByText("Ryšys patikrintas", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Peržiūrėti veiksmą" }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Peržiūrėti veiksmą" }).click();
  await page.getByLabel("Sintetinis tekstas").fill("labas pasauli");
  await page.getByRole("button", { name: "Parengti patvirtinimui" }).click();
  await expect(
    page.getByRole("button", { name: "Patvirtinti ir paleisti" }),
  ).toBeVisible();
  expect(f.state.submissions).toBe(0);
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      (
        await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await capture(page, "n8n-synthetic-confirmation");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Patvirtinti ir paleisti" }).click();
  await expect(page.getByText("n8n priimta", { exact: true })).toBeVisible();
  expect(f.state.submissions).toBe(1);
  const run = (await automations.list(owner))[0];
  await automations.confirm(owner, run.id, run.actionHash);
  expect(f.state.submissions).toBe(1);
  await page.getByRole("button", { name: "Sutikrinti n8n būseną" }).click();
  await expect(page.getByText("n8n vykdoma", { exact: true })).toBeVisible();
  f.state.unavailable = true;
  await page.getByRole("button", { name: "Sutikrinti n8n būseną" }).click();
  await expect(page.getByText("n8n vykdoma", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Būsenos sutikrinti nepavyko.", { exact: false }),
  ).toBeVisible();
  f.state.unavailable = false;
  f.executions.get("1")!.status = "success";
  await page.getByRole("button", { name: "Sutikrinti n8n būseną" }).click();
  await expect(page.getByText("LABAS PASAULI", { exact: true })).toBeVisible();
  await capture(page, "n8n-synthetic-result");
  await page.reload();
  const completed = page.locator(".automation-run").first();
  await completed.locator(":scope > summary").click();
  await expect(page.getByText("LABAS PASAULI", { exact: true })).toBeVisible();
  const chatId = randomUUID();
  const orchestrator = new OrchestrationService(
    store,
    {
      async complete() {
        return {
          reply: {
            kind: "automation",
            reply: "SINTETINIS: siūlau vieną teksto bandymą.",
            automation: {
              key: f.config.contract.key,
              input: { text: "sintetinis pokalbis" },
            },
          },
          usage: null,
        };
      },
    },
    {
      listAgents: async () => [],
      createTask: async () => {
        throw new Error("Automation must not create a Paperclip task");
      },
      readTask: async () => {
        throw new Error("not used");
      },
      findByMarker: async () => [],
      taskUrl: () => "",
    },
    false,
    automations,
  );
  await orchestrator.submit(
    owner,
    chatId,
    randomUUID(),
    "SINTETINIS: pasiūlyk teksto transformaciją.",
  );
  await page.unroute("**/api/conversations/*");
  await page.route("**/api/conversations/*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1)!;
    await route.fulfill({
      json: {
        ...(await store.snapshot(owner, id)),
        automationRuns: await automations.list(owner, id),
      },
    });
  });
  f.state.loseSubmission = true;
  await page.goto(`${base}/chat?conversation=${chatId}`);
  await expect(
    page.getByRole("button", { name: "Patvirtinti ir paleisti" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Patvirtinti ir paleisti" }).click();
  await expect(
    page.getByText("Būsena nežinoma", { exact: true }),
  ).toBeVisible();
  expect(f.state.submissions).toBe(2);
  await page.getByRole("button", { name: "Sutikrinti n8n būseną" }).click();
  await expect(page.getByText("n8n vykdoma", { exact: true })).toBeVisible();
  expect(f.state.submissions).toBe(2);
  await page.getByRole("button", { name: "Sustabdyti tik stebėjimą" }).click();
  expect(f.executions.get("2")!.status).toBe("running");
  await capture(page, "n8n-synthetic-chat");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  f.state.unauthorized = true;
  await page.goto(base + "/automations");
  await page
    .getByRole("button", { name: "Patikrinti ryšį ir katalogą" })
    .click();
  await expect(
    page.getByText("Prieiga atmesta", { exact: true }),
  ).toBeVisible();
  console.log(
    "Synthetic n8n UI verified: real MCP client/service with test-only HTTP, curated discovery, input review, exact approval, one submission, status/result, persistence, ambiguous-submission reconciliation, chat, local-only stop, permissions and AA desktop/mobile scans.",
  );
}
