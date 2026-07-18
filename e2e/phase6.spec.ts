import { expect, test } from "@playwright/test";

// Phase 6 happy path: create a habit, check it in for today, and confirm the
// streak shows. Runs against the browser API stub.
test("phase 6 happy path — habit check-in", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Habits" })
    .click();

  // Create a habit (defaults to a daily check-in, so it's scheduled today).
  await page.getByRole("button", { name: "+ New habit" }).click();
  const name = `Morning walk ${Date.now()}`;
  await page.getByRole("textbox", { name: "Habit name" }).fill(name);
  await page.getByRole("button", { name: "Save" }).click();

  const row = page.getByTestId("habit-row").filter({ hasText: name });
  await expect(row).toBeVisible();

  // Check it in; the streak badge appears.
  await row.getByRole("button", { name: `Check ${name}` }).click();
  await expect(row.getByText(/🔥 1/)).toBeVisible();
});
