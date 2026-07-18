import { describe, expect, it } from "vitest";
import { api, localDateParams } from "../../../lib/api";

describe("habit API (browser stub)", () => {
  it("creates a habit, checks in, and reports today's status + streak", async () => {
    const habit = await api.createHabit({
      name: `Meditate ${Date.now()}`,
      goalKind: "CHECK",
      freq: { kind: "daily" },
    });
    const today = localDateParams().today;
    await api.recordCheckin(habit.id, today, "DONE");

    const list = await api.listTodayHabits();
    const row = list.find((h) => h.habit.id === habit.id);
    expect(row?.status).toBe("DONE");
    expect(row?.streak).toBe(1);

    const stats = await api.habitStats(habit.id);
    expect(stats.currentStreak).toBe(1);
    expect(stats.totalCheckins).toBe(1);
  });

  it("upserts a check-in per day and can uncheck", async () => {
    const habit = await api.createHabit({ name: `Read ${Date.now()}`, goalKind: "CHECK", freq: { kind: "daily" } });
    const today = localDateParams().today;
    await api.recordCheckin(habit.id, today, "DONE");
    await api.recordCheckin(habit.id, today, "SKIP");
    expect((await api.listCheckins(habit.id, "2000-01-01", "2999-01-01")).length).toBe(1);

    await api.deleteCheckin(habit.id, today);
    expect((await api.listCheckins(habit.id, "2000-01-01", "2999-01-01")).length).toBe(0);
  });
});
