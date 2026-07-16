import { expect, test } from "@playwright/test";

// Phase 8 happy path: a project's Timeline view shows a dated task as a bar and
// an undated task in the Unscheduled panel. Runs against the browser API stub.
test("phase 8 happy path — timeline gantt", async ({ page }) => {
  await page.goto("/");

  // A fresh list with a dated and an undated task.
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByRole("textbox", { name: "List name" }).fill("Roadmap");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Roadmap", exact: true }).click();

  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Launch milestone");
  await addBar.press("Enter");
  await addBar.fill("Backlog item");
  await addBar.press("Enter");

  // Give the first task a due date via the detail pane.
  await page.getByTestId("task-row").filter({ hasText: "Launch milestone" }).click();
  const detail = page.getByTestId("task-detail");
  await detail.getByRole("button", { name: /^Due: None$/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: String(new Date().getDate()), exact: true })
    .first()
    .click();

  // Switch this list to the Timeline view.
  await page.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByTestId("timeline-grid")).toBeVisible();

  // The dated task is a bar; the undated one sits in the Unscheduled panel.
  await expect(page.getByTestId("timeline-bar").filter({ hasText: "Launch milestone" })).toBeVisible();
  await expect(
    page.getByTestId("timeline-unscheduled").getByText("Backlog item"),
  ).toBeVisible();
});
