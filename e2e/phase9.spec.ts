import { expect, test } from "@playwright/test";

// Phase 9 happy path: completing a task earns achievement points and shows up in
// the Stats summary. Runs against the browser API stub.
test("phase 9 happy path — stats & achievement", async ({ page }) => {
  await page.goto("/");

  // Add a task in the Inbox and complete it (no due date → +1 point).
  const title = "Finish the report";
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill(title);
  await addBar.press("Enter");

  const row = page.getByTestId("task-row").filter({ hasText: title });
  await row.getByRole("checkbox", { name: `Complete ${title}` }).click();

  // Open the Stats view.
  await page.getByRole("button", { name: "Stats", exact: true }).click();
  await expect(page.getByTestId("stats-view")).toBeVisible();

  // The achievement score reflects the completion and the summary counts it.
  await expect(page.getByTestId("achievement-score")).toHaveText("1");
  await expect(page.getByTestId("stat-completed")).toContainText("1");
});
