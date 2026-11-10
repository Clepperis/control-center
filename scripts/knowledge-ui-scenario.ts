import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { KnowledgeService } from "../src/server/knowledge/service";
import { MarkdownFiles, parse, serialize } from "../src/server/knowledge/files";
import type { Store } from "../src/server/orchestration/store";
import { DomainError } from "../src/server/orchestration/store";
import { OrchestrationService } from "../src/server/orchestration/service";

export async function prepareKnowledgeUi(
  page: Page,
  store: Store,
  owner: string,
) {
  const root = await mkdtemp(join(tmpdir(), "cc-fictional-browser-")),
    s = new KnowledgeService(store.db, new MarkdownFiles(root));
  // Only browser HTTP/service transport is substituted. The actual PostgreSQL
  // migrations, files, revision/index/memory services and rendered UI run here.
  await page.route("**/api/knowledge?*", handle);
  await page.route("**/api/knowledge", handle);
  async function handle(route: Parameters<Parameters<Page["route"]>[1]>[0]) {
    const request = route.request(),
      q = new URL(request.url()).searchParams;
    try {
      let value: unknown;
      if (request.method() === "GET") {
        const id = q.get("id")!;
        switch (q.get("op")) {
          case "projects":
            value = { projects: await s.projects(owner) };
            break;
          case "document":
            value = await s.read(owner, id);
            break;
          case "history":
            value = await s.history(owner, id);
            break;
          case "conflicts":
            value = await s.conflicts(owner, id);
            break;
          case "review":
            value = await s.review(owner, id);
            break;
          case "revision":
            value = await s.revision(owner, id, Number(q.get("revision")));
            break;
          case "citation":
            value = await s.citation(owner, q.get("message")!, q.get("label")!);
            break;
          default: {
            const scope = {
              projectId: q.get("projectId") || null,
              includeGlobal: q.get("global") === "true",
            };
            value = {
              projects: await s.projects(owner),
              documents: await s.list(
                owner,
                scope,
                q.get("archived") === "true",
              ),
              proposals: await s.proposals(owner),
              results: q.get("q")
                ? await s.search(owner, scope, q.get("q")!)
                : [],
            };
          }
        }
      } else {
        const b = request.postDataJSON();
        switch (b.action) {
          case "project":
            value = await s.createProject(owner, b.name);
            break;
          case "create":
            value = await s.create(owner, b);
            break;
          case "update":
            value = await s.update(owner, b.id, b);
            break;
          case "retry":
            await s.retry(owner, b.id);
            value = { queued: true };
            break;
          case "rebuild":
            await s.rebuild(owner);
            value = { queued: true };
            break;
          case "preview":
            value = await s.previewImport(owner, b.projectId, b.files);
            break;
          case "import":
            value = await s.confirmImport(owner, b.id, b.digest);
            break;
          case "propose":
            value = await s.propose(owner, b);
            break;
          case "accept":
            value = await s.confirmMemory(
              owner,
              b.id,
              b.reviewHash,
              b.acknowledgeConflicts,
            );
            break;
          case "reject":
            await s.rejectMemory(owner, b.id);
            value = { rejected: true };
            break;
          default:
            throw new Error("Unknown synthetic UI action");
        }
      }
      await route.fulfill({ json: value });
    } catch (e) {
      await route.fulfill({
        status: e instanceof DomainError ? e.status : 500,
        json: { error: e instanceof Error ? e.message : "error" },
      });
    }
  }
  return { s, root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
export async function verifyKnowledgeUi(
  page: Page,
  store: Store,
  owner: string,
  base: string,
  setup: Awaited<ReturnType<typeof prepareKnowledgeUi>>,
) {
  const { s, root } = setup;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/knowledge`);
  await page.getByText("Projektas ir importas", { exact: true }).click();
  await page
    .getByLabel("Naujo projekto pavadinimas")
    .fill("Atlas (sintetinis)");
  await page
    .getByRole("button", { name: "Kurti projektą", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Aprėptis", exact: true }),
  ).toHaveValue(/.+/);
  const projects = await s.projects(owner),
    project = projects.find((p) => p.name === "Atlas (sintetinis)")!;
  const harbor = await s.createProject(owner, "Harbor (sintetinis)");
  await s.create(owner, {
    projectId: harbor.id,
    title: "Kitas projektas",
    body: "Copper Finch only belongs to Harbor.",
  });
  await page
    .getByRole("button", { name: "Naujas dokumentas", exact: true })
    .click();
  await page.getByLabel("Pavadinimas", { exact: true }).fill("Atlas vadovas");
  await page
    .getByLabel("Markdown tekstas", { exact: true })
    .fill(
      "# Atlas\n\nATLAS-42: eksportas yra Markdown.\n<script>window.bad=true</script>\n![inert](https://example.com/never-fetch.png)",
    );
  await page
    .getByRole("button", { name: "Išsaugoti Markdown", exact: true })
    .click();
  await expect(
    page.getByText("Laukia indeksavimo", { exact: true }).first(),
  ).toBeVisible();
  await s.tick();
  await page
    .getByRole("button", { name: "Atnaujinti būseną", exact: true })
    .click();
  await expect(
    page.getByText("Indeksuota", { exact: true }).first(),
  ).toBeVisible();
  expect(await page.evaluate(() => "bad" in window)).toBe(false);
  expect(await page.locator(".knowledge-markdown img").count()).toBe(0);
  await page.getByLabel("Paieška", { exact: true }).fill("ATLAS-42");
  await expect(page.locator(".knowledge-result")).toHaveCount(1);
  await expect(page.locator(".knowledge-result")).toContainText("Markdown");
  await page.getByLabel("Paieška", { exact: true }).fill("Copper Finch");
  await expect(page.locator(".knowledge-result")).toHaveCount(0);
  await page.getByLabel("Paieška", { exact: true }).fill("");
  await page.getByLabel("Pasirinkti failus", { exact: true }).setInputFiles([
    {
      name: "imported.md",
      mimeType: "text/markdown",
      buffer: Buffer.from("# Imported\nSynthetic import fixture."),
    },
    {
      name: "ignored.png",
      mimeType: "image/png",
      buffer: Buffer.from("ignored"),
    },
  ]);
  await expect(
    page.getByRole("region", { name: "Importo peržiūra" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Importo peržiūra" }),
  ).toContainText("Palaikomi tik");
  await page
    .getByRole("button", { name: "Patvirtinti importą", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "imported", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Siūlyti atmintį iš šaltinio", exact: true })
    .click();
  await page
    .getByLabel("Tikslus teiginys", { exact: true })
    .fill("Atlas eksportas yra Markdown.");
  await page
    .getByRole("button", { name: "Paruošti savininko peržiūrą", exact: true })
    .click();
  await expect(
    page.getByText("Tiksli savininko peržiūra", { exact: true }),
  ).toBeVisible();
  expect(
    (
      await s.list(owner, { projectId: project.id, includeGlobal: false })
    ).filter((d) => d.kind !== "document"),
  ).toHaveLength(0);
  await page
    .getByRole("button", {
      name: "Patvirtinti ir įrašyti atmintį",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Atlas eksportas yra Markdown.",
      exact: true,
    }),
  ).toBeVisible();
  await s.tick();
  // Real service records evidence; the answer is a deterministic substitute.
  const service = new OrchestrationService(
    store,
    {
      async complete() {
        return {
          reply: { kind: "answer", reply: "Eksportas yra Markdown. [S1]" },
          usage: null,
        };
      },
    },
    {
      async listAgents() {
        return [];
      },
      async createTask() {
        throw new Error();
      },
      async readTask() {
        throw new Error();
      },
      async findByMarker() {
        return [];
      },
      taskUrl() {
        return "";
      },
    },
    false,
    undefined,
    s,
  );
  const answer = await service.submit(
    owner,
    randomUUID(),
    randomUUID(),
    "ATLAS-42",
    undefined,
    { projectId: project.id, includeGlobal: false },
  );
  const message = answer.messages.find((m) => m.role === "assistant")!;
  const p = message.grounding!.passages[0],
    d = await s.owned(owner, p.documentId),
    raw = parse(await s.files.read(d.path));
  await writeFile(
    join(root, d.path),
    serialize(raw.meta, raw.body.replace("Markdown", "plain text")),
  );
  await s.tick();
  await page.goto(`${base}/chat?conversation=${answer.conversation.id}`);
  await page.getByRole("link", { name: "[S1]", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Cituotas šaltinis" }),
  ).toContainText("originali");
  await expect(
    page.getByRole("region", { name: "Cituotas šaltinis" }),
  ).toContainText("Markdown");
  await mkdirCaptures();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/screenshots/knowledge-citation-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto(`${base}/knowledge?project=${project.id}`);
  await page
    .getByRole("button", { name: "Atlas vadovas", exact: true })
    .click();
  await page.getByRole("button", { name: "Archyvuoti", exact: true }).click();
  await page.getByLabel("Rodyti atkuriamą archyvą", { exact: true }).check();
  await page
    .getByRole("button", { name: "Atlas vadovas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Atkurti iš archyvo", exact: true })
    .click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "Phase 4 synthetic browser verification: create project/document, safe Markdown, scoped search, explicit import preview, memory review/approval, historical citation, archive/restore, 1440/1024/390px axe/reflow. Model and HTTP transport are deterministic substitutes.",
  );
}
async function mkdirCaptures() {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(resolve(".local/screenshots"), { recursive: true });
}
