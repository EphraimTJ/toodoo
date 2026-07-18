import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { TimelineView } from "../components/TimelineView";

describe("TimelineView", () => {
  it("renders dated tasks as bars and lists undated ones in the panel", async () => {
    const dated = `Ship ${Date.now()}`;
    const undated = `Idea ${Date.now()}`;
    await api.createTask({ projectId: INBOX_ID, title: dated, dueAt: "2026-06-15T00:00:00.000Z" });
    await api.createTask({ projectId: INBOX_ID, title: undated });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <TimelineView projectId={INBOX_ID} />
      </QueryClientProvider>,
    );

    const bar = await screen.findByRole("button", { name: dated });
    expect(bar).toHaveAttribute("data-testid", "timeline-bar");

    const panel = screen.getByTestId("timeline-unscheduled");
    expect(within(panel).getByText(undated)).toBeInTheDocument();
  });
});
