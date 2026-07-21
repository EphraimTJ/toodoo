import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { HabitsView } from "../components/HabitsView";

function wrap() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <HabitsView />
    </QueryClientProvider>,
  );
}

describe("HabitsView", () => {
  it("checks in a habit and shows its streak", async () => {
    const user = userEvent.setup();
    const name = `Stretch ${Date.now()}`;
    await api.createHabit({ name, goalKind: "CHECK", freq: { kind: "daily" }, section: "Morning" });

    wrap();

    const row = (await screen.findByText(name)).closest("[data-testid='habit-row']") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: `Check ${name}` }));

    // After the check-in, the row shows a streak of 1 (Flame icon + count).
    expect(await within(row).findByText("1")).toBeInTheDocument();
  });
});
