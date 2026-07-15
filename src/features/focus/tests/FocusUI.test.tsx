import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_POMO_CONFIG } from "../lib/pomodoro";
import { FocusTimer } from "../components/FocusTimer";
import { FocusRecords } from "../components/FocusRecords";

function wrap(node: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

describe("Focus UI", () => {
  it("shows the initial pomodoro clock and starts a session", async () => {
    const user = userEvent.setup();
    wrap(<FocusTimer config={DEFAULT_POMO_CONFIG} />);

    expect(screen.getByLabelText("Timer")).toHaveTextContent("25:00");
    await user.click(screen.getByRole("button", { name: "Start" }));
    // Once a session is running the controls switch to Pause/Stop.
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("adds a manual focus record", async () => {
    const user = userEvent.setup();
    wrap(<FocusRecords />);

    await user.click(screen.getByRole("button", { name: "Last 25 min" }));
    await user.click(screen.getByRole("button", { name: "Add record" }));

    expect(await screen.findByText("25 min")).toBeInTheDocument();
  });
});
