import { expect, test } from "@playwright/test";

// Resizable panes: drag the sidebar divider, verify the width changes, reload,
// verify it persisted (localStorage mirrors the layout:panes setting).
test("pane divider resizes the sidebar and persists across reload", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.locator('aside[aria-label="Sidebar"]');
  await expect(sidebar).toBeVisible();
  const before = (await sidebar.boundingBox())!;
  expect(Math.round(before.width)).toBe(240);

  const divider = page.getByRole("separator", { name: "Resize sidebar" });
  const box = (await divider.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + 200, { steps: 5 });
  await page.mouse.up();

  const after = (await sidebar.boundingBox())!;
  expect(Math.round(after.width)).toBe(320);

  // Keyboard access: arrows nudge the focused divider.
  await divider.focus();
  await page.keyboard.press("ArrowLeft");
  expect(Math.round((await sidebar.boundingBox())!.width)).toBe(304);

  await page.reload();
  await expect(page.locator('aside[aria-label="Sidebar"]')).toBeVisible();
  expect(Math.round((await page.locator('aside[aria-label="Sidebar"]').boundingBox())!.width)).toBe(304);

  // Double-click resets to the default.
  await page.getByRole("separator", { name: "Resize sidebar" }).dblclick();
  expect(Math.round((await page.locator('aside[aria-label="Sidebar"]').boundingBox())!.width)).toBe(240);
});
