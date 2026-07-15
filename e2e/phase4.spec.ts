import { expect, test } from "@playwright/test";

// Phase 4 happy path: open the Calendar, create a local event via the dialog,
// and confirm it renders on the grid. Runs against the browser API stub (see
// docs/decisions.md), exercising the real FullCalendar UI end-to-end.
test("phase 4 happy path — calendar event", async ({ page }) => {
  await page.goto("/");

  // Open the Calendar view.
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Calendar" })
    .click();
  await expect(page.getByRole("button", { name: "Subscriptions" })).toBeVisible();
  // The unscheduled-tasks panel is part of the calendar layout.
  await expect(page.getByTestId("unscheduled-panel")).toBeVisible();

  // Create an event through the dialog.
  await page.getByRole("button", { name: "+ Event" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const unique = `Sprint review ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "Event title" }).fill(unique);
  // Default is an all-day event; give it today's date.
  const today = new Date().toISOString().slice(0, 10);
  await dialog.getByLabel("Event start").fill(today);
  await dialog.getByRole("button", { name: "Save" }).click();

  // It shows up on the calendar grid.
  await expect(page.getByText(unique)).toBeVisible();
});
