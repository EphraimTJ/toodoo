import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { ReminderToasts } from "../components/ReminderToasts";

function renderToasts() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ReminderToasts />
    </QueryClientProvider>,
  );
}

function fireReminder(detail: { taskId: string; reminderId: string; title: string }) {
  act(() => {
    window.dispatchEvent(new CustomEvent("toodoo-reminder-fired", { detail }));
  });
}

describe("ReminderToasts", () => {
  it("snoozes by the configured duration, not a hardcoded 10m", async () => {
    const { vi } = await import("vitest");
    const user = userEvent.setup();
    await api.setNotifSnoozeMin(30);
    const spy = vi.spyOn(api, "snoozeReminder").mockResolvedValue(undefined);
    try {
      renderToasts();
      fireReminder({ taskId: "t-x", reminderId: "r-snooze", title: "Snooze me" });

      const btn = await screen.findByRole("button", { name: "Snooze 30m" });
      const before = Date.now();
      await user.click(btn);
      await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      const until = new Date(spy.mock.calls[0][1]).getTime();
      const minutes = (until - before) / 60_000;
      expect(minutes).toBeGreaterThan(29);
      expect(minutes).toBeLessThan(31);
    } finally {
      spy.mockRestore();
      await api.setNotifSnoozeMin(10);
    }
  });

  it("shows a fired reminder and Complete resolves the task", async () => {
    const user = userEvent.setup();
    const task = await api.createTask({ projectId: "inbox", title: `remind ${Date.now()}` });
    renderToasts();

    fireReminder({ taskId: task.id, reminderId: "r1", title: "Ping me" });
    expect(await screen.findByTestId("reminder-toast")).toHaveTextContent("Ping me");

    await user.click(screen.getByRole("button", { name: "Complete" }));
    await waitFor(async () => expect((await api.getTask(task.id)).status).toBe("COMPLETED"));
    await waitFor(() => expect(screen.queryByTestId("reminder-toast")).toBeNull());
  });
});
