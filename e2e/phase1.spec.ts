import { expect, test } from "@playwright/test";

// Phase 1 happy path: create list, add tasks, complete, smart lists,
// detail editing, search, trash/restore. Runs against the browser API stub
// (see docs/decisions.md), so it exercises the full React app end-to-end.
test("phase 1 happy path", async ({ page }) => {
  await page.goto("/");

  // Create a list.
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByRole("textbox", { name: "List name" }).fill("Errands");
  await page.getByRole("button", { name: "Create" }).click();
  const errands = page.getByRole("button", { name: "Errands", exact: true });
  await expect(errands).toBeVisible();
  await errands.click();

  // Add three tasks.
  const addBar = page.getByRole("textbox", { name: "Add task" });
  for (const title of ["Buy milk", "Post office run", "Charge drill battery"]) {
    await addBar.fill(title);
    await addBar.press("Enter");
  }
  await expect(page.getByText("Buy milk")).toBeVisible();
  await expect(page.getByText("Charge drill battery")).toBeVisible();

  // Complete one; it files under the collapsed Completed section.
  const milkRow = page.getByTestId("task-row").filter({ hasText: "Buy milk" });
  await milkRow.getByRole("checkbox").click();
  const completedHeader = page.getByRole("button", { name: /Completed \(1\)/ });
  await expect(completedHeader).toBeVisible();
  await expect(page.getByText("Buy milk")).toBeHidden();
  await completedHeader.click();
  await expect(page.getByText("Buy milk")).toBeVisible();

  // Give a task a due date of today via the detail pane; it appears in Today.
  const rowOf = (title: string) => page.getByTestId("task-row").filter({ hasText: title });
  await rowOf("Post office run").click();
  const detail = page.getByTestId("task-detail");
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: /^Due: None$/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: String(new Date().getDate()), exact: true })
    .first()
    .click();
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Today" })
    .click();
  await expect(rowOf("Post office run")).toBeVisible();

  // Edit the description in the detail pane (TipTap).
  await rowOf("Post office run").click();
  const editor = detail.getByRole("textbox", { name: "Task description" });
  await editor.click();
  await editor.fill("Bring the customs form");
  await page.getByRole("main").click(); // blur saves
  await rowOf("Post office run").click();
  await expect(detail.getByText("Bring the customs form")).toBeVisible();

  // Search finds it by description text via Ctrl+K.
  await page.keyboard.press("ControlOrMeta+k");
  const paletteInput = page.getByPlaceholder(/Search tasks/);
  await paletteInput.fill("customs form");
  await expect(page.getByRole("dialog").getByText("Post office run")).toBeVisible();
  await page.keyboard.press("Escape");

  // Trash a task, find it in Trash, restore it.
  await page.getByRole("button", { name: "Errands", exact: true }).click();
  await rowOf("Charge drill battery").click();
  await detail.getByRole("button", { name: "Move task to trash" }).click();
  await expect(rowOf("Charge drill battery")).toBeHidden();
  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Trash" })
    .click();
  const trashRow = rowOf("Charge drill battery");
  await expect(trashRow).toBeVisible();
  await trashRow.hover();
  await trashRow.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Errands", exact: true }).click();
  await expect(rowOf("Charge drill battery")).toBeVisible();
});
