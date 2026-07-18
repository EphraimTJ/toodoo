import { expect, test } from "@playwright/test";

// Phase 12B happy path: Won't Do moves a task to the Won't Do smart list, a
// comment is added and shown, and a task can be duplicated. Browser stub.
test("phase 12B happy path — won't-do, comment, duplicate", async ({ page }) => {
  await page.goto("/");

  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Draft the proposal");
  await addBar.press("Enter");

  // Open the task detail.
  await page.getByTestId("task-row").filter({ hasText: "Draft the proposal" }).click();
  const detail = page.getByTestId("task-detail");
  await expect(detail).toBeVisible();

  // Add a comment; it shows in the thread.
  await page.getByTestId("comment-input").fill("kick-off tomorrow");
  await page.getByRole("button", { name: "Post" }).click();
  await expect(page.getByTestId("task-comments")).toContainText("kick-off tomorrow");

  // Duplicate it → a "(copy)" appears in the list.
  await page.getByRole("button", { name: "⧉ Duplicate" }).click();
  await expect(
    page.getByTestId("task-row").filter({ hasText: "Draft the proposal (copy)" }),
  ).toBeVisible();

  // Mark the original Won't Do → it leaves the active list.
  await page.getByRole("button", { name: "Mark won't do" }).click();
  await expect(
    page.getByTestId("task-row").filter({ hasText: /^Draft the proposal$/ }),
  ).toHaveCount(0);

  // It appears in the Won't Do smart list.
  await page.getByRole("button", { name: "Won't Do", exact: true }).click();
  await expect(page.getByTestId("task-row").filter({ hasText: "Draft the proposal" }).first()).toBeVisible();
});
