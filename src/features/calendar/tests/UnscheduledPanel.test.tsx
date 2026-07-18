import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { UnscheduledPanel } from "../components/UnscheduledPanel";

// FullCalendar's Draggable touches layout APIs jsdom lacks; a no-op stand-in
// keeps the component test focused on which tasks render.
vi.mock("@fullcalendar/interaction", () => ({
  Draggable: class {
    destroy() {}
  },
}));

describe("UnscheduledPanel", () => {
  it("lists only dateless tasks", async () => {
    const undated = `Undated ${Date.now()}`;
    const dated = `Dated ${Date.now()}`;
    await api.createTask({ projectId: INBOX_ID, title: undated });
    await api.createTask({ projectId: INBOX_ID, title: dated, dueAt: "2026-03-10T00:00:00.000Z" });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UnscheduledPanel />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(undated)).toBeInTheDocument();
    expect(screen.queryByText(dated)).not.toBeInTheDocument();
  });
});
