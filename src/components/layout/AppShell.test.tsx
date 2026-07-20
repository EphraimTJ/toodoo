import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";
import { useUiStore } from "../../lib/uiStore";

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>,
  );
}

describe("AppShell", () => {
  beforeEach(() => useUiStore.setState({ selectedTaskId: null }));

  it("renders the sidebar and list pane; detail pane stays hidden until a task is selected", () => {
    renderShell();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Task list" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Task detail" })).not.toBeInTheDocument();
  });

  it("reveals the detail pane once a task is selected", () => {
    useUiStore.setState({ selectedTaskId: "t1" });
    renderShell();
    expect(screen.getByRole("complementary", { name: "Task detail" })).toBeInTheDocument();
  });

  it("shows the smart lists and the Inbox project", async () => {
    renderShell();
    for (const name of ["Today", "Tomorrow", "Next 7 Days", "All", "Completed", "Trash"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    // Inbox arrives async from the projects query (seeded in the API stub).
    expect(await screen.findByRole("button", { name: /Inbox/ })).toBeInTheDocument();
  });
});
