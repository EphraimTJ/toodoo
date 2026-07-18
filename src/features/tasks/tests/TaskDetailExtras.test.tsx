import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { TaskDetail } from "../components/detail/TaskDetail";

async function renderDetailFor(title: string) {
  const task = await api.createTask({
    projectId: INBOX_ID,
    title,
    dueAt: "2026-07-20T00:00:00.000Z",
  });
  useUiStore.setState({ selectedTaskId: task.id });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TaskDetail />
    </QueryClientProvider>,
  );
  await screen.findByDisplayValue(title);
  return task;
}

describe("TaskDetail — Phase 2 extras", () => {
  beforeEach(() => {
    useUiStore.setState({ selectedTaskId: null, multiSelect: new Set(), paletteOpen: false });
  });

  it("shows the reminders and activity sections, with a Created entry", async () => {
    await renderDetailFor(`Extras render ${Date.now()}`);
    expect(screen.getByRole("heading", { name: "Reminders" })).toBeInTheDocument();
    // The Activity section appears once its query resolves.
    expect(await screen.findByText("Created")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Activity" })).toBeInTheDocument();
  });

  it("pins and unpins a task", async () => {
    await renderDetailFor(`Pin me ${Date.now()}`);
    await userEvent.click(screen.getByRole("button", { name: "Pin task" }));
    expect(await screen.findByRole("button", { name: "Unpin task" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Unpin task" }));
    expect(await screen.findByRole("button", { name: "Pin task" })).toBeInTheDocument();
  });

  it("sets a weekly repeat and reflects it in the trigger summary", async () => {
    await renderDetailFor(`Repeat me ${Date.now()}`);
    await userEvent.click(screen.getByRole("button", { name: "Repeat" }));
    await userEvent.click(await screen.findByRole("button", { name: "Weekly" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Repeat" })).toHaveTextContent("Weekly"),
    );
  });

  it("adds a relative reminder from a preset", async () => {
    await renderDetailFor(`Remind me ${Date.now()}`);
    await userEvent.click(screen.getByRole("button", { name: "+ Add reminder" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "1 hour before" }));

    // The chosen preset now appears in the reminders list (menu has closed).
    expect(await screen.findByText("1 hour before")).toBeInTheDocument();
  });
});
