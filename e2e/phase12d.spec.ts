import { expect, test } from "@playwright/test";

// Phase 12D happy path (browser-testable surface only). The native pieces (tray,
// global hotkey, autostart, always-on-top windows, cross-window persistence) are
// covered by docs/manual-test-checklist.md — the browser stub is per-page, so a
// task made in the ?win=quickadd shell doesn't reach the main app here.
test("phase 12D happy path — desktop settings, share, quick-add window shell", async ({ page }) => {
  await page.goto("/");

  // Desktop settings panel toggles launch-at-login.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("desktop-settings")).toBeVisible();
  const autostart = page.getByTestId("autostart-toggle");
  await expect(autostart).not.toBeChecked();
  await autostart.click();
  await expect(autostart).toBeChecked();
  await page.keyboard.press("Escape");

  // Create a task and share it as markdown (Blob download).
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Share me");
  await addBar.press("Enter");
  await page.getByTestId("task-row").filter({ hasText: "Share me" }).click();
  await page.getByRole("button", { name: "Share task" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain(".md");

  // The quick-add mini-window shell renders the same SPA and creates a task.
  await page.goto("/?win=quickadd");
  await expect(page.getByTestId("win-quickadd")).toBeVisible();
  const miniBar = page.getByRole("textbox", { name: "Add task" });
  await miniBar.fill("From the mini window");
  await miniBar.press("Enter");
  await expect(miniBar).toHaveValue("");
});
