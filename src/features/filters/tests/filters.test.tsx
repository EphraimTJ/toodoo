import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID, type Rule } from "../../../lib/api";
import { FilterResultsView } from "../components/FilterResultsView";
import { SidebarFilters } from "../components/SidebarFilters";

function wrap(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("Custom Filters", () => {
  it("builds a filter from the advanced query and lists it in the sidebar", async () => {
    const user = userEvent.setup();
    wrap(<SidebarFilters />);

    await user.click(screen.getByRole("button", { name: "New filter" }));
    const unique = `High priority ${Date.now()}`;
    await user.type(await screen.findByLabelText("Filter name"), unique);
    await user.type(screen.getByLabelText("Query text"), "priority:high");
    await user.click(screen.getByRole("button", { name: "Parse" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(unique)).toBeInTheDocument();
  });

  it("shows only tasks matching a saved filter's rule", async () => {
    const match = `Filter hit ${Date.now()}`;
    const miss = `Filter miss ${Date.now()}`;
    const hit = await api.createTask({ projectId: INBOX_ID, title: match });
    await api.updateTask(hit.id, { priority: 5 });
    await api.createTask({ projectId: INBOX_ID, title: miss });

    const rule: Rule = { match: "all", conditions: [{ field: "priority", values: [5] }] };
    const filter = await api.createFilter(`Highs ${Date.now()}`, rule);

    wrap(<FilterResultsView filterId={filter.id} />);

    expect(await screen.findByText(match)).toBeInTheDocument();
    expect(screen.queryByText(miss)).not.toBeInTheDocument();
  });
});
