import { expect, test } from "@playwright/test";
import { DEMO } from "./env";
import { login, pickFirstFreeTime } from "./helpers";

test("a visitor's choice survives logging in, then they book a free time and cancel it", async ({
  page,
}) => {
  // Browse and choose without an account.
  await page.goto("/");
  await page
    .getByRole("link", { name: /Kreuzberg Cuts/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: "Kreuzberg Cuts" })).toBeVisible();
  await page.getByRole("radio", { name: /Haircut/ }).check();
  await pickFirstFreeTime(page);
  await page.getByRole("button", { name: "Log in to book" }).click();

  // Log in; the app returns to the business page with the service still chosen.
  await expect(page).toHaveURL(/\/login\?next=/);
  await page.getByLabel("Email").fill(DEMO.customer);
  await page.getByLabel("Password").fill(DEMO.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/b\/kreuzberg-cuts\?service=/);
  await expect(page.getByRole("radio", { name: /Haircut/ })).toBeChecked();

  // Book. The e2e server has no real Stripe key, so the time is held and paying is offered
  // later (the payment itself is covered by the API's webhook tests).
  await pickFirstFreeTime(page);
  await page.getByRole("button", { name: "Book and pay" }).click();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?payment=unavailable$/);
  await expect(page.getByText("Awaiting payment")).toBeVisible();
  await expect(page.getByText("Payment couldn't start")).toBeVisible();

  // Cancel, through the confirmation dialog.
  await page.getByRole("button", { name: "Cancel booking" }).click();
  const dialog = page.getByRole("dialog", { name: "Cancel this booking?" });
  await dialog.getByRole("button", { name: "Cancel booking" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
});

test("an expired access token is renewed through the proxy with the refresh cookie", async ({
  page,
  context,
}) => {
  await login(page, DEMO.customer, "/bookings");
  // Let the page finish its own requests first: clearing the cookie mid-flight would make
  // the page refresh, and the reload below would then cut that response off.
  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const cookies = await context.cookies();
  // The browser sees the API under /api, so the refresh cookie must be scoped to /api/auth.
  expect(cookies.find((c) => c.name === "refresh_token")?.path).toBe("/api/auth");

  // Simulate the 15-minute access token running out.
  await context.clearCookies({ name: "access_token" });
  await page.reload();

  await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Kreuzberg Cuts" }).first()).toBeVisible();
  expect((await context.cookies()).some((c) => c.name === "access_token")).toBe(true);
});

test("an owner sees they're listed and adds a service", async ({ page }) => {
  await login(page, DEMO.owner, "/dashboard");
  await expect(page.getByRole("heading", { name: "You're taking bookings" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Dashboard" })
    .getByRole("link", { name: "Services" })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Kids cut");
  await page.getByLabel("Duration (minutes)").fill("20");
  await page.getByLabel("Price (EUR)").fill("15");
  await page.getByRole("button", { name: "Add service" }).click();

  await expect(page.getByText("Service added")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Kids cut" })).toContainText("€15.00");
});

test("a new customer signs up, is asked to confirm their email, and logs out", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E Person");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a-long-enough-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/bookings$/);
  await expect(page.getByText("Please confirm your email address")).toBeVisible();
  await expect(page.getByText("No upcoming bookings")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Sign up" })).toBeVisible();
});

test("protected pages send logged-out visitors to the login page", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});
