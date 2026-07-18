import { expect, test } from "@playwright/test";

// Phase 12C happy path: natural-language quick-add parses list/tag/priority/date
// into chips and creates a clean task. Runs against the browser stub.
test("phase 12C happy path — NLP quick-add", async ({ page }) => {
  await page.goto("/");

  // A list to resolve `~Groceries` against.
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByRole("textbox", { name: "List name" }).fill("Groceries");
  await page.getByRole("button", { name: "Create" }).click();

  // Type a rich phrase in the Inbox add bar.
  await page.getByRole("button", { name: "Inbox" }).click();
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Buy milk ~Groceries #errand !high tomorrow");

  // Chips appear for the parsed tokens (list, tag, priority, date).
  await expect(page.getByTestId("qa-chip")).toHaveCount(4);

  // Submit; the title is clean and the task lands in the resolved list.
  await addBar.press("Enter");
  await expect(addBar).toHaveValue("");

  await page.getByRole("button", { name: "Groceries", exact: true }).click();
  const row = page.getByTestId("task-row").filter({ hasText: "Buy milk" });
  await expect(row).toBeVisible();
  // The tokens are stripped from the title (no ~/#/! leftovers).
  await expect(row).not.toContainText("~Groceries");
  await expect(row).not.toContainText("#errand");
});
