import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL ?? "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const base = process.env.UI_BASE_URL ?? "http://127.0.0.1:3000";
try {
  await mkdir(".local/screenshots", { recursive: true });
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: "Viskas prasideda nuo aiškumo." }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/overview-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Peržiūrėti", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Pažymėti kaip peržiūrėtą" }).click();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /vienas klausimas/ }),
  ).toBeVisible();
  for (const path of [
    "chat",
    "projects",
    "agents",
    "automations",
    "knowledge",
    "improve",
    "settings",
  ]) {
    await page.goto(`${base}/${path}`);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto(`${base}/chat`);
  await page
    .getByLabel("Jūsų mintis")
    .fill("Sintetinis bandymas: dokumentų katalogo planas.");
  await page.getByRole("button", { name: "Išsaugoti juodraštį" }).click();
  await page.reload();
  await expect(
    page.getByText("Sintetinis bandymas: dokumentų katalogo planas.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(`${base}/projects`);
  await page.getByLabel("Rodyti užduotis").selectOption("review");
  await expect(
    page.getByRole("heading", { name: "Peržiūrėti dokumentų skirstymo planą" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Apibrėžti savaitės santraukos turinį" }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByRole("button", { name: "Atverti meniu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Žinios", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/knowledge`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
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
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Atkurti demonstraciją" }).click();
  await page.goto(base);
  await expect(
    page.getByRole("heading", { name: /2 klausimai/ }),
  ).toBeVisible();
  await page.screenshot({
    path: ".local/screenshots/overview-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
  console.log(
    "UI verified: all navigation at 1440/390px, dialog, review persistence, draft persistence, filtering, mobile navigation, reset; no runtime errors.",
  );
} finally {
  await browser.close();
}
