import { expect, test } from "@playwright/test";

// Phase 12E happy path: Appearance (dark + accent + large font applied to the
// document), the ? shortcut cheatsheet, and share-as-image (PNG download).
test("phase 12E happy path — appearance, shortcuts, share image", async ({ page }) => {
  await page.goto("/");

  // Appearance: dark mode + amber accent + large font reflect on <html>.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("appearance-settings")).toBeVisible();
  await page.getByRole("button", { name: "Theme Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Accent #f0a825" }).click();
  await page.getByRole("button", { name: "Font size L" }).click();
  await expect(page.locator("html")).toHaveJSProperty("style.fontSize", "18px");
  await page.keyboard.press("Escape");

  // The ? cheatsheet overlay lists shortcuts.
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcut-cheatsheet")).toBeVisible();
  await expect(page.getByTestId("shortcut-cheatsheet")).toContainText("Command palette");
  await page.keyboard.press("Escape");

  // Share a task as an image (PNG download).
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Picture me");
  await addBar.press("Enter");
  await page.getByTestId("task-row").filter({ hasText: "Picture me" }).click();
  await page.getByRole("button", { name: "Share task" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download image" }).click(),
  ]);
  expect(download.suggestedFilename()).toContain(".png");
});
