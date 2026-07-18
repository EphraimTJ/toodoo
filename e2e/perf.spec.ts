import { expect, test } from "@playwright/test";

// v1.0 perf gate: the list stays responsive on the 10k-task fixture. The list is
// virtualized, so the guarantees are (a) a bounded DOM node count regardless of
// dataset size and (b) no catastrophic frame during a large scroll. Frame time
// in CI is noisy, so the frame bound is generous — a strict <16 ms/frame is a
// manual-checklist item measured in a release build.
test("perf — 10k list stays virtualized and responsive", async ({ page }) => {
  await page.goto("/");

  // Seed 10k tasks via the dev-only fixture hotkey, then open the All list.
  await page.keyboard.press("Control+Shift+F9");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByTestId("task-row").first()).toBeVisible({ timeout: 15_000 });

  // Virtualization: only a small window of rows is in the DOM, not 10k.
  const rows = await page.getByTestId("task-row").count();
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThan(120);

  // Drive a large scroll and record the worst animation-frame delta.
  const worstFrameMs = await page.evaluate(async () => {
    const scroller = document.querySelector('[data-testid="task-scroller"]') as HTMLElement | null;
    if (!scroller) return -1;
    let worst = 0;
    let last = performance.now();
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      worst = Math.max(worst, now - last);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    for (let y = 0; y < 40_000; y += 800) {
      scroller.scrollTop = y;
      await new Promise((r) => setTimeout(r, 16));
    }
    cancelAnimationFrame(raf);
    return worst;
  });

  console.log(`[perf] rows in DOM: ${rows}; worst frame during scroll: ${worstFrameMs.toFixed(1)} ms`);
  expect(worstFrameMs).toBeGreaterThan(0);
  // Catastrophic-regression guard (generous for CI); the strict <16 ms target is
  // verified by hand in a release build per the manual checklist.
  expect(worstFrameMs).toBeLessThan(120);
});
