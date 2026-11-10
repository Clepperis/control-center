import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const reports: unknown[] = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of [
      "/",
      "/chat",
      "/projects",
      "/agents",
      "/automations",
      "/knowledge",
      "/improve",
      "/settings",
    ]) {
      await page.goto(base + route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}px overflows`,
      ).toBe(true);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      reports.push({
        route,
        width,
        violations: result.violations,
        incomplete: result.incomplete.map((i) => ({
          id: i.id,
          nodes: i.nodes.length,
        })),
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pereiti prie turinio" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const trigger = page
    .getByRole("button", { name: "Peržiūrėti", exact: true })
    .first();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
  }
  const dialogScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  reports.push({
    route: "decision dialog",
    width: 1440,
    violations: dialogScan.violations,
  });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("button", { name: "Pažymėti kaip peržiūrėtą" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  const menu = page.getByRole("button", { name: "Atverti meniu" });
  await menu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  const drawerScan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  reports.push({
    route: "mobile navigation",
    width: 390,
    violations: drawerScan.violations,
  });
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".nav-item")
      .first()
      .evaluate((e) => getComputedStyle(e).transitionDuration),
  ).toBe("0s");
  await mkdir(".local/phase-2-5", { recursive: true });
  await writeFile(
    ".local/phase-2-5/accessibility.json",
    JSON.stringify(reports, null, 2),
  );
  const violations = reports.flatMap((r) =>
    (
      r as { route: string; width: number; violations: unknown[] }
    ).violations.map((v) => ({
      route: (r as { route: string }).route,
      width: (r as { width: number }).width,
      violation: v,
    })),
  );
  expect(
    violations,
    "See .local/phase-2-5/accessibility.json for automated findings",
  ).toEqual([]);
  console.log(
    "Accessibility verified: 8 demo routes at 1440/1024/390px, AA scans, keyboard skip link, dialog focus/trap/return, removed-trigger focus fallback, mobile drawer and reduced motion. Automated checks are not a full screen-reader audit.",
  );
} finally {
  await browser.close();
}
