import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { KanbanBoard } from "../components/KanbanBoard";

function renderBoard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <KanbanBoard projectId={INBOX_ID} />
    </QueryClientProvider>,
  );
}

describe("KanbanBoard", () => {
  it("shows the No Section column with existing tasks and can add a column", async () => {
    const user = userEvent.setup();
    const unique = `Board card ${Date.now()}`;
    await api.createTask({ projectId: INBOX_ID, title: unique });

    renderBoard();

    // Sectionless task appears in the fixed No Section column.
    expect(await screen.findByText(unique)).toBeInTheDocument();
    expect(screen.getByText("No Section")).toBeInTheDocument();

    // Adding a column renders it.
    await user.type(screen.getByLabelText("Add column"), "Doing{Enter}");
    expect(await screen.findByText("Doing")).toBeInTheDocument();
  });

  it("adds a card to a column via its input", async () => {
    const user = userEvent.setup();
    renderBoard();

    const unique = `Column card ${Date.now()}`;
    await user.type(screen.getByLabelText("Add task to No Section"), `${unique}{Enter}`);
    expect(await screen.findByText(unique)).toBeInTheDocument();
  });
});
