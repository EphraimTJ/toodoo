import { describe, expect, it } from "vitest";
import { api } from "../../../lib/api";

const INBOX_ID = "inbox";

describe("browser stub — recurring completion idempotency", () => {
  it("treats a retry carrying a stale occurrence as a no-op", async () => {
    const t = await api.createTask({
      projectId: INBOX_ID,
      title: `water plants ${Date.now()}`,
      dueAt: "2026-03-10T00:00:00.000Z",
      isAllDay: true,
      rrule: "FREQ=DAILY",
    });

    await api.completeTask(t.id, "2026-03-10T00:00:00.000Z");
    const afterFirst = (await api.listProjectTasks(INBOX_ID)).find((x) => x.id === t.id);
    expect(afterFirst?.dueAt).toBe("2026-03-11T00:00:00.000Z");

    // The retry still carries the occurrence the client rendered — no-op.
    const retry = await api.completeTask(t.id, "2026-03-10T00:00:00.000Z");
    expect(retry).toEqual([]);
    const afterRetry = (await api.listProjectTasks(INBOX_ID)).find((x) => x.id === t.id);
    expect(afterRetry?.dueAt).toBe("2026-03-11T00:00:00.000Z");
    expect(afterRetry?.status).toBe("ACTIVE");
  });
});
