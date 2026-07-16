import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { SearchView } from "../components/SearchView";

const INBOX_ID = "inbox";

function renderView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SearchView />
    </QueryClientProvider>,
  );
}

describe("SearchView", () => {
  it("shows task results and narrows them with the status filter", async () => {
    const user = userEvent.setup();
    const uniq = `View${Date.now()}`;
    await api.createTask({ projectId: INBOX_ID, title: `${uniq} active` });
    const done = await api.createTask({ projectId: INBOX_ID, title: `${uniq} done` });
    await api.completeTask(done.id);

    renderView();
    await user.type(screen.getByTestId("search-input"), uniq);
    await waitFor(() => expect(screen.getAllByTestId("search-task-result")).toHaveLength(2));

    await user.selectOptions(screen.getByTestId("search-status-filter"), "ACTIVE");
    await waitFor(() => expect(screen.getAllByTestId("search-task-result")).toHaveLength(1));
    expect(screen.getByText(`${uniq} active`)).toBeInTheDocument();
  });

  it("saves a search that then appears in the saved list", async () => {
    const user = userEvent.setup();
    const uniq = `Saved${Date.now()}`;
    renderView();

    const input = screen.getByTestId("search-input");
    await user.type(input, uniq);
    await user.click(screen.getByTestId("save-search"));

    // The saved list is shown when the query box is empty.
    await user.clear(input);
    await waitFor(() =>
      expect(screen.getByTestId("saved-search-list").textContent).toContain(uniq),
    );
  });
});
