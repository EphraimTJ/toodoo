import { expect, test } from "@playwright/test";

// Phase 11 happy path: the Data panel exports Markdown (download) and imports a
// CSV whose task then appears in its list. Runs against the browser stub.
test("phase 11 happy path — export & import", async ({ page }) => {
  await page.goto("/");

  // Seed a task so the export has content.
  const addBar = page.getByRole("textbox", { name: "Add task" });
  await addBar.fill("Export target");
  await addBar.press("Enter");

  // Open Settings → Data panel.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByTestId("data-settings")).toBeVisible();

  // Export Markdown triggers a download containing the task.
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("toodoo.md");

  // Import a generic CSV; the result count is reported.
  await page.getByLabel("Import source").selectOption("generic");
  const csv = "title,list\nImported task,Imported List\n";
  await page.getByTestId("import-file").setInputFiles({
    name: "import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByTestId("import-result")).toContainText("Imported 1 task");

  // Close Settings; the imported list and task are now in the sidebar/list.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Imported List", exact: true }).click();
  await expect(page.getByTestId("task-row").filter({ hasText: "Imported task" })).toBeVisible();
});
