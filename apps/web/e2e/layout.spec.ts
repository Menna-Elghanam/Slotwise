import { expect, test, type Page } from "@playwright/test";
import { DEMO } from "./env";
import { login, pickFirstFreeTime } from "./helpers";

// WCAG 2.2 "Reflow" (1.4.10): content must fit a 320 CSS px wide screen without scrolling
// sideways. A common phone width is checked here.
const PHONE = { width: 390, height: 844 };

async function expectNoSideways(page: Page, path: string) {
  await page.waitForLoadState("networkidle");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${path} is ${width}px wide`).toBeLessThanOrEqual(PHONE.width);
}

test.use({ viewport: PHONE });

test("public pages fit a phone screen", async ({ page }) => {
  for (const path of ["/", "/businesses", "/login", "/register"]) {
    await page.goto(path);
    await expectNoSideways(page, path);
  }
  // The booking widget with its scrolling day strip and time grid showing.
  await page.goto("/b/kreuzberg-cuts");
  await page.getByRole("radio", { name: /Haircut/ }).check();
  await pickFirstFreeTime(page);
  await expectNoSideways(page, "/b/kreuzberg-cuts");
});

test("customer and dashboard pages fit a phone screen", async ({ page }) => {
  await login(page, DEMO.customer, "/bookings");
  await expectNoSideways(page, "/bookings");
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("/");

  await login(page, DEMO.owner, "/dashboard");
  for (const path of [
    "/dashboard",
    "/dashboard/schedule",
    "/dashboard/services",
    "/dashboard/team",
    "/dashboard/hours",
    "/dashboard/settings",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoSideways(page, path);
  }
});
