import { describe, expect, it } from "vitest";
import { api, INBOX_ID } from "../../../lib/api";

const FROM = "2026-03-01T00:00:00.000Z";
const TO = "2026-03-31T23:59:59.000Z";

describe("calendar API (browser stub)", () => {
  it("lists local events and dated tasks within the window", async () => {
    const event = await api.createEvent({
      title: `Demo ${Date.now()}`,
      startAt: "2026-03-10T00:00:00.000Z",
      allDay: true,
    });
    const task = await api.createTask({
      projectId: INBOX_ID,
      title: `Dated ${Date.now()}`,
      dueAt: "2026-03-12T00:00:00.000Z",
    });
    await api.createTask({
      projectId: INBOX_ID,
      title: `Far ${Date.now()}`,
      dueAt: "2026-08-01T00:00:00.000Z",
    });

    const items = await api.listCalendar(FROM, TO, false);
    expect(items.some((i) => i.kind === "EVENT" && i.sourceId === event.id)).toBe(true);
    expect(items.some((i) => i.kind === "TASK" && i.sourceId === task.id)).toBe(true);
    // The August task is outside the March window.
    expect(items.every((i) => i.startAt <= TO)).toBe(true);
  });

  it("schedules an unscheduled task and moves a calendar item", async () => {
    const task = await api.createTask({ projectId: INBOX_ID, title: `Sched ${Date.now()}` });
    await api.scheduleTask(task.id, "2026-03-20T14:00:00.000Z", false, 30);
    let t = await api.getTask(task.id);
    expect(t.dueAt).toBe("2026-03-20T14:00:00.000Z");
    expect(t.durationMin).toBe(30);

    await api.moveCalendarItem("TASK", task.id, "2026-03-25T14:00:00.000Z", false);
    t = await api.getTask(task.id);
    expect(t.dueAt).toBe("2026-03-25T14:00:00.000Z");
  });
});
