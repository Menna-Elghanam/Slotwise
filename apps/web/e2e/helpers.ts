import { expect, type Page } from "@playwright/test";
import { DEMO } from "./env";

/** Logs in through the real form and waits until the app has sent us on to `next`. */
export async function login(page: Page, email: string, next: string): Promise<void> {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => `${url.pathname}${url.search}` === next);
}

/**
 * Walks the day strip until a day has free times, then picks the first one. (Which days are
 * free depends on today's date, opening hours and the minimum notice.)
 */
export async function pickFirstFreeTime(page: Page): Promise<string> {
  const days = page.getByRole("group", { name: "Day" }).getByRole("button");
  const times = page.getByRole("group", { name: /^Time/ }).getByRole("button");
  const noTimes = page.getByText("No free times on this day");

  for (let i = 0; i < 10; i++) {
    await days.nth(i).click();
    await expect(times.first().or(noTimes)).toBeVisible();
    if (await times.first().isVisible()) {
      const label = (await times.first().textContent()) ?? "";
      await times.first().click();
      return label;
    }
  }
  throw new Error("No free time found in the next 10 days");
}
