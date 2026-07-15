import { expect, test } from "@playwright/test";

test("app chrome renders three columns", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Task list" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Task detail" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Inbox" })).toBeVisible();
});

test("theme toggle flips light/dark", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  const toggle = page.getByRole("switch", { name: "Toggle dark mode" });

  await expect(html).not.toHaveClass(/dark/);
  await toggle.click();
  await expect(html).toHaveClass(/dark/);
  await toggle.click();
  await expect(html).not.toHaveClass(/dark/);
});
