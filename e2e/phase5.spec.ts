import { expect, test } from "@playwright/test";

// Phase 5 happy path: open Focus, run and stop a Pomodoro, and confirm the
// session lands in the records timeline. Runs against the browser API stub.
test("phase 5 happy path — pomodoro session", async ({ page }) => {
  await page.goto("/");

  await page
    .getByRole("complementary", { name: "Sidebar" })
    .getByRole("button", { name: "Focus" })
    .click();
  await expect(page.getByTestId("focus-timer")).toBeVisible();
  await expect(page.getByLabel("Timer")).toHaveText("25:00");

  // Start a session, then stop it (once it's running the controls change).
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await page.getByRole("button", { name: "Stop", exact: true }).click();

  // The session shows up under Records.
  await page.getByRole("button", { name: "Records" }).click();
  await expect(page.getByTestId("focus-records")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete record" }).first()).toBeVisible();
});
