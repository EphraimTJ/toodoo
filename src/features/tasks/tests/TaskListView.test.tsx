import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { useUiStore, type ViewSelection } from "../../../lib/uiStore";
import { TaskListView } from "../components/TaskListView";

function renderView(view: ViewSelection = { kind: "project", projectId: INBOX_ID }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TaskListView view={view} />
    </QueryClientProvider>,
  );
}

describe("TaskListView", () => {
  beforeEach(() => {
    useUiStore.setState({
      view: { kind: "project", projectId: INBOX_ID },
      selectedTaskId: null,
      multiSelect: new Set(),
      paletteOpen: false,
    });
  });

  it("adds a task via the add bar", async () => {
    const user = userEvent.setup();
    renderView();

    const unique = `Water the plants ${Date.now()}`;
    await user.type(screen.getByRole("textbox", { name: "Add task" }), `${unique}{Enter}`);

    expect(await screen.findByText(unique)).toBeInTheDocument();
    // Input clears for the next task.
    expect(screen.getByRole("textbox", { name: "Add task" })).toHaveValue("");
  });

  it("completes a task and files it under the Completed section", async () => {
    const user = userEvent.setup();
    renderView();

    const unique = `File taxes ${Date.now()}`;
    await user.type(screen.getByRole("textbox", { name: "Add task" }), `${unique}{Enter}`);
    const row = (await screen.findByText(unique)).closest("[data-testid='task-row']");
    expect(row).not.toBeNull();

    await user.click(within(row as HTMLElement).getByRole("checkbox"));

    // The completion animation delays the mutation by ~350ms; afterwards the
    // collapsed Completed section header appears.
    await waitFor(
      () => expect(screen.getByRole("button", { name: /Completed \(\d+\)/ })).toBeInTheDocument(),
      { timeout: 3000 },
    );

    // Expanding shows the task struck through.
    await user.click(screen.getByRole("button", { name: /Completed \(\d+\)/ }));
    const completedRow = (await screen.findByText(unique)).closest("[data-testid='task-row']");
    expect(within(completedRow as HTMLElement).getByRole("checkbox")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("groups the Completed view by completion date", async () => {
    const unique = `Shipped it ${Date.now()}`;
    const task = await api.createTask({ projectId: INBOX_ID, title: unique });
    await api.completeTask(task.id);

    renderView({ kind: "smart", view: "completed" });

    expect(await screen.findByText(unique)).toBeInTheDocument();
    // Completed just now → grouped under a "Today" date header.
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows tasks carrying a tag in the tag view, titled with the tag name", async () => {
    const tag = await api.createTag(`focus-${Date.now()}`, "#35b979");
    const inTag = await api.createTask({ projectId: INBOX_ID, title: `Tagged ${Date.now()}` });
    const outOfTag = await api.createTask({ projectId: INBOX_ID, title: `Plain ${Date.now()}` });
    await api.assignTag(inTag.id, tag.id);

    renderView({ kind: "tag", tagId: tag.id });

    expect(await screen.findByText(inTag.title)).toBeInTheDocument();
    expect(screen.queryByText(outOfTag.title)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `#${tag.name}` })).toBeInTheDocument();
  });

  it("edits a title in place on double-click", async () => {
    const user = userEvent.setup();
    renderView();

    const unique = `Old title ${Date.now()}`;
    await user.type(screen.getByRole("textbox", { name: "Add task" }), `${unique}{Enter}`);
    await user.dblClick(await screen.findByText(unique));

    const editor = screen.getByRole("textbox", { name: "Edit task title" });
    await user.clear(editor);
    await user.type(editor, "New title{Enter}");

    expect(await screen.findByText("New title")).toBeInTheDocument();
    expect(screen.queryByText(unique)).not.toBeInTheDocument();
  });
});
