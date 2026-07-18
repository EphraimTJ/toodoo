import { describe, expect, it } from "vitest";
import { api, localDateParams } from "../../../lib/api";
import { dayRange } from "../hooks/useStats";

const INBOX_ID = "inbox";

function plusDays(days: number): string {
  const d = new Date(`${localDateParams().today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("browser stub — stats", () => {
  it("awards on-time vs late points and aggregates the summary", async () => {
    const start = (await api.achievementInfo()).score;

    // On time (+2): due tomorrow, completed today.
    const onTime = await api.createTask({
      projectId: INBOX_ID,
      title: `on-time ${Date.now()}`,
      dueAt: `${plusDays(1)}T09:00:00.000Z`,
    });
    await api.completeTask(onTime.id);

    // Late (+1): due two days ago.
    const late = await api.createTask({
      projectId: INBOX_ID,
      title: `late ${Date.now()}`,
      dueAt: `${plusDays(-2)}T09:00:00.000Z`,
    });
    await api.completeTask(late.id);

    // No due date (+1).
    const noDue = await api.createTask({ projectId: INBOX_ID, title: `no-due ${Date.now()}` });
    await api.completeTask(noDue.id);

    expect((await api.achievementInfo()).score).toBe(start + 2 + 1 + 1);

    const { from, to } = dayRange(7);
    const summary = await api.statsSummary(from, to);
    expect(summary.completedCount).toBe(3);
    expect(summary.lateCount).toBe(1);
    // Cumulative history ends at the current score.
    const hist = await api.scoreHistory(from, to);
    expect(hist[hist.length - 1]?.cumulative).toBe(start + 4);
  });
});
