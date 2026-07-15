import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";

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
  it("renders the three columns: sidebar, list pane, detail pane", () => {
    renderShell();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Task list" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Task detail" })).toBeInTheDocument();
  });

  it("shows the smart lists in the sidebar", () => {
    renderShell();
    for (const name of ["Today", "Next 7 Days", "Inbox", "Trash"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
