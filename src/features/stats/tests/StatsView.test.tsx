import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, localDateParams } from "../../../lib/api";
import { StatsView } from "../components/StatsView";

const INBOX_ID = "inbox";

function plusDays(days: number): string {
  const d = new Date(`${localDateParams().today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("StatsView", () => {
  it("reflects a completed task in the score and summary", async () => {
    // A task due tomorrow, completed on time → +2 points, 1 completion.
    const task = await api.createTask({
      projectId: INBOX_ID,
      title: `Ship ${Date.now()}`,
      dueAt: `${plusDays(1)}T12:00:00.000Z`,
    });
    const before = (await api.achievementInfo()).score;
    await api.completeTask(task.id);
    expect((await api.achievementInfo()).score).toBe(before + 2);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StatsView />
      </QueryClientProvider>,
    );

    // Achievement score shows the awarded points once the query resolves.
    const card = await screen.findByTestId("achievement-card");
    await waitFor(() =>
      expect(within(card).getByTestId("achievement-score")).toHaveTextContent(String(before + 2)),
    );

    // Summary counts the completion.
    await waitFor(() => expect(screen.getByTestId("stat-completed")).toHaveTextContent("1"));
  });
});
