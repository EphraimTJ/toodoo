import { expect, test } from "@playwright/test";

// Phase 3 happy path: Kanban board (view-mode switch, add a column, place a
// task into it), a custom filter built from the advanced query syntax, and the
// Eisenhower Matrix. Runs against the browser API stub (see docs/decisions.md).
test("phase 3 happy path — kanban, filters, matrix", async ({ page }) => {
  await page.goto("/");

  // A fresh list to work in.
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByRole("textbox", { name: "List name" }).fill("Sprint");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: "Sprint", exact: true }).click();

  // Switch this list to the Kanban view (view-mode memory persists on the list).
  await page.getByRole("button", { name: "Kanban" }).click();
  await expect(page.getByTestId("kanban-board")).toBeVisible();
  await expect(page.getByText("No Section")).toBeVisible();

  // Add a column and place a task into it.
  await page.getByRole("textbox", { name: "Add column" }).fill("Doing");
  await page.getByRole("textbox", { name: "Add column" }).press("Enter");
  await expect(page.getByText("Doing")).toBeVisible();

  const doingInput = page.getByRole("textbox", { name: "Add task to Doing" });
  await doingInput.fill("Wire the OAuth callback");
  await doingInput.press("Enter");
  await expect(page.getByTestId("kanban-card").filter({ hasText: "Wire the OAuth callback" })).toBeVisible();

  // Build a custom filter from the advanced query syntax.
  await page.getByRole("button", { name: "New filter" }).click();
  await page.getByRole("textbox", { name: "Filter name" }).fill("High priority");
  await page.getByRole("textbox", { name: "Query text" }).fill("priority:high");
  await page.getByRole("button", { name: "Parse" }).click();
  await page.getByRole("button", { name: "Save" }).click();

  // The saved filter shows in the sidebar and opens its results view.
  const filterButton = page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "High priority" });
  await expect(filterButton).toBeVisible();
  await filterButton.click();
  await expect(page.getByRole("heading", { name: "High priority" })).toBeVisible();

  // The Eisenhower Matrix renders its four quadrants.
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Matrix" })
    .click();
  await expect(page.getByTestId("matrix-view")).toBeVisible();
  await expect(page.getByText("Urgent & Important")).toBeVisible();
  await expect(page.getByText("Important, Not Urgent")).toBeVisible();
});
