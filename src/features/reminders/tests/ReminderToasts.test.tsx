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
