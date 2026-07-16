import { expect, test } from "@playwright/test";

// Phase 7 happy path: create a countdown for a future date (card shows the
// days remaining) and add a sticky note to the board. Browser API stub.
test("phase 7 happy path — countdown and sticky", async ({ page }) => {
  await page.goto("/");

  // Countdown.
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Countdown" })
    .click();
  await page.getByRole("button", { name: "+ New countdown" }).click();
  const dialog = page.getByRole("dialog");
  const title = `Product launch ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "Countdown title" }).fill(title);
  await dialog.getByLabel("Target date").fill("2030-01-01");
  await dialog.getByRole("button", { name: "Save" }).click();

  const card = page.getByTestId("countdown-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card).toContainText("in");

  // Sticky notes.
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Sticky Notes" })
    .click();
  await expect(page.getByTestId("sticky-board")).toBeVisible();
  await page.getByRole("button", { name: "+ New sticky" }).click();
  await expect(page.getByTestId("sticky-card")).toBeVisible();
});
