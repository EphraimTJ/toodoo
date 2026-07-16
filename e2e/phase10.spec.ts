import { expect, test } from "@playwright/test";

// Phase 10 happy path: the Settings panel exposes the local API (token + enable
// toggle), and a task can produce a toodoo:// link. Runs against the browser stub.
test("phase 10 happy path — local API settings & task link", async ({ page }) => {
  await page.goto("/");

  // Open Settings and confirm the API panel: a token is shown and the server
  // can be enabled.
  await page.getByRole("button", { name: "Settings" }).click();
  const panel = page.getByTestId("api-settings");
  await expect(panel).toBeVisible();

  const token = page.getByTestId("api-token");
  await expect(token).not.toHaveValue("");

  const toggle = page.getByTestId("api-enable-toggle");
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();

  // Close the dialog.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // Add a task, open it, and copy its link.
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Deep link me");
  await addBar.press("Enter");
  await page.getByTestId("task-row").filter({ hasText: "Deep link me" }).click();

  await page.getByRole("button", { name: "Copy task link" }).click();
  await expect(page.getByTestId("task-link")).toContainText("toodoo://task/");
});
