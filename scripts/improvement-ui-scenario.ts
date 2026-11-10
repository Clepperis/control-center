import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { ImprovementService } from "../src/server/improvements/service";
import {
  improvementFixture,
  other,
  syntheticEvidence,
} from "../tests/improvement-fixtures";
import { improvementCommand } from "../src/domain/improvements";
import { fingerprint } from "../src/server/improvements/safety";
import { DomainError } from "../src/server/orchestration/store";
import type { Store } from "../src/server/orchestration/store";

export async function verifyImprovementUi(
  page: Page,
  store: Store,
  owner: string,
  base: string,
) {
  const f = improvementFixture(),
    s = new ImprovementService(store.db, f.repo, f.planner, f.executor);
  const runtimeErrors: string[] = [],
    consoleErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  let expectedHttpFailures = 0;
  await page.route("**/api/knowledge?op=projects", (route) =>
    route.fulfill({ json: { projects: [] } }),
  );
  // Test-only transport/external substitutes. Actual migrations, durable jobs,
  // state machine, consent integrity, review forms and rendering execute here.
  await page.route("**/api/improvements{,?*}", async (route) => {
    const request = route.request(),
      q = new URL(request.url()).searchParams;
    try {
      let result: unknown;
      if (request.method() === "GET") {
        if (q.get("op") === "readiness") {
          const policy = await s.executor.ready();
          result = { policy, policyHash: fingerprint(policy) };
        } else
          result = {
            requests: await s.list(owner),
            setup: {
              repository: f.repo.repository,
              target: f.repo.target,
              executorEnabled: true,
              blockers: [
                "Sintetinis UI bandymas: tikras kodavimo runtime nepaleistas.",
              ],
            },
          };
      } else {
        const r = await s.command(
          owner,
          improvementCommand.parse(request.postDataJSON()),
        );
        await s.tick();
        result = { request: await s.get(owner, r.id) };
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    } catch (e) {
      expectedHttpFailures++;
      await route.fulfill({
        status: e instanceof DomainError ? e.status : 503,
        contentType: "application/json",
        body: JSON.stringify({
          error:
            e instanceof DomainError
              ? e.code
              : "Sintetinis vykdytojas neparuoštas.",
        }),
      });
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/improve");
  await page
    .getByLabel("Ką norėtumėte patobulinti?")
    .fill("Sintetinis bandymas: patikslinti žinių puslapio tuščią būseną.");
  await page
    .getByRole("button", { name: "Sukurti užklausą", exact: true })
    .click();
  await expect(
    page.getByText("Platformos inžinierius ·", { exact: false }),
  ).toBeVisible();
  expect(f.state.creates).toBe(0);
  await page
    .getByLabel("Patikslinimas arba klausimas")
    .fill("Išsaugok esamą žinių puslapio elgesį ir veiksmus.");
  await page.getByRole("button", { name: "Aptarti su inžinieriumi" }).click();
  await expect(
    page.getByText("Sintetinis tyrimas; tai nėra gyvas modelis ar kodavimas.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ištirti ir parengti planą" }).click();
  await expect(
    page.getByRole("heading", { name: "Planas · 1 versija" }),
  ).toBeVisible();
  expect(f.state.creates).toBe(0);
  f.state.ready = false;
  await page
    .getByRole("button", { name: "Peržiūrėti įgyvendinimo leidimą" })
    .click();
  await expect(page.getByRole("alert")).toContainText("neparuoštas");
  expect(f.state.creates).toBe(0);
  await page.getByRole("button", { name: "Uždaryti", exact: true }).click();
  f.state.ready = true;
  await page
    .getByRole("button", { name: "Peržiūrėti įgyvendinimo leidimą" })
    .click();
  await expect(
    page.getByText("Vienas kodavimo bandymas.", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Leisti įgyvendinti šią versiją",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("SYN-5 · Paperclip", { exact: true }),
  ).toBeVisible();
  expect(f.state.creates).toBe(1);
  f.state.external!.status = "done";
  await page
    .getByRole("button", { name: "Sutikrinti užduotį ir kandidatą" })
    .click();
  await expect(
    page.getByText("Tikrinama", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sutikrinti užduotį ir kandidatą" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Tikslus kandidatas" }),
  ).toBeVisible();
  await page
    .getByText("src/components/knowledge.tsx · +1 / −1", { exact: true })
    .click();
  await expect(
    page.getByText("-Empty\n+Add your first document", { exact: true }),
  ).toBeVisible();
  await mkdir(".local/screenshots", { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    await page.screenshot({
      path: `.local/screenshots/improve-synthetic-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  async function review() {
    const area = page.getByRole("region", { name: "Kandidato peržiūra" });
    for (const checkbox of await area.getByRole("checkbox").all())
      await checkbox.check();
    await page
      .getByLabel("Išvados ir išspręsti trūkumai")
      .fill(
        "Sintetinė savininko peržiūra: kriterijai, saugumas ir suderinamumas patikrinti.",
      );
    await page
      .getByRole("button", { name: "Užregistruoti šio kandidato peržiūrą" })
      .click();
    await expect(page.getByText("Peržiūrėta:", { exact: false })).toBeVisible();
  }
  await review();
  const r = (await s.list(owner))[0];
  f.state.evidence = { ...syntheticEvidence(r.id), commit: other };
  await page
    .getByRole("button", { name: "Leisti pateikti šį commit integravimui" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "candidate_changed" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sutikrinti užduotį ir kandidatą" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Leisti pateikti šį commit integravimui",
    }),
  ).toHaveCount(0);
  await review();
  await page
    .getByRole("button", { name: "Leisti pateikti šį commit integravimui" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rankinio integravimo instrukcija" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Rankinio integravimo instrukcija" }),
  ).toBeVisible();
  expect(f.state.creates).toBe(1);
  expect(runtimeErrors).toEqual([]);
  expect(expectedHttpFailures).toBe(2);
  expect(consoleErrors).toHaveLength(expectedHttpFailures);
  for (const message of consoleErrors)
    expect(message).toMatch(
      /^Failed to load resource: the server responded with a status of (503 \(Service Unavailable\)|409 \(Conflict\))$/,
    );
  console.log(
    "Platform Engineer synthetic browser flow verified at 1440px/390px: discussion, selected investigation, setup blocker, exact implementation consent, one delegated substitute, diff, validation evidence, stale candidate rejection, owner self-review and manual integration handoff. No live model/coding run or merge occurred.",
  );
}
