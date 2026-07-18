import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, localDateParams } from "../../../lib/api";
import { CountdownView } from "../components/CountdownView";

function plusDays(days: number): string {
  const d = new Date(`${localDateParams().today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("CountdownView", () => {
  it("renders a card with the days-until label", async () => {
    const title = `Launch ${Date.now()}`;
    await api.createCountdown(title, plusDays(10), false, JSON.stringify({ color: "#4772fa" }));

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <CountdownView />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(title)).toBeInTheDocument();
    expect(screen.getByText("in 10 days")).toBeInTheDocument();
  });
});
