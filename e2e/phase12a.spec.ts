import { expect, test } from "@playwright/test";

// Phase 12A happy path: the Search view finds a task, a status filter narrows
// results, and a search can be saved. Runs against the browser stub.
test("phase 12A happy path — search, filter, save", async ({ page }) => {
  await page.goto("/");

  // Two tasks with a shared term; complete one.
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Quarterly report draft");
  await addBar.press("Enter");
  await addBar.fill("Quarterly report done");
  await addBar.press("Enter");
  await page
    .getByTestId("task-row")
    .filter({ hasText: "Quarterly report done" })
    .getByRole("checkbox")
    .click();

  // Open Search from the sidebar and query.
  await page.getByRole("button", { name: "🔍 Search" }).click();
  await expect(page.getByTestId("search-view")).toBeVisible();
  await page.getByTestId("search-input").fill("Quarterly");
  await expect(page.getByTestId("search-task-result")).toHaveCount(2);

  // Filter to active only → the completed one drops out.
  await page.getByTestId("search-status-filter").selectOption("ACTIVE");
  await expect(page.getByTestId("search-task-result")).toHaveCount(1);
  await expect(page.getByTestId("search-task-result")).toContainText("Quarterly report draft");

  // Save the search; clearing the box reveals it in the saved list.
  await page.getByTestId("save-search").click();
  await page.getByTestId("search-input").fill("");
  await expect(page.getByTestId("saved-search-list")).toContainText("Quarterly");
});
