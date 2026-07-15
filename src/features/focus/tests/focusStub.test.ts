import { describe, expect, it } from "vitest";
import { api, INBOX_ID } from "../../../lib/api";

describe("focus API (browser stub)", () => {
  it("start → complete records a session and updates actuals", async () => {
    const task = await api.createTask({ projectId: INBOX_ID, title: `Focus ${Date.now()}` });
    const session = await api.startFocus(task.id, "POMO", 25);
    expect((await api.activeFocus())?.id).toBe(session.id);

    await api.completeFocus(session.id, 0, "deep work", "DONE");
    expect(await api.activeFocus()).toBeNull();

    expect((await api.listTaskFocus(task.id)).length).toBe(1);
    expect((await api.taskFocusActuals(task.id)).actualPomos).toBe(1);
  });

  it("aggregates focusStats by day and counts pomos", async () => {
    await api.addFocusSession(null, "POMO", "2026-03-01T10:00:00.000Z", "2026-03-01T10:25:00.000Z");
    await api.addFocusSession(null, "STOPWATCH", "2026-03-01T12:00:00.000Z", "2026-03-01T12:30:00.000Z");

    const stats = await api.focusStats("2026-03-01T00:00:00.000Z", "2026-03-01T23:59:59.000Z");
    expect(stats.pomoCount).toBe(1);
    expect(stats.totalMs).toBe((25 + 30) * 60_000);
    expect(stats.perDay).toHaveLength(1);
  });
});
