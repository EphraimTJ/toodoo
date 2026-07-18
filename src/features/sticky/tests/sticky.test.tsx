import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { StickyBoard } from "../components/StickyBoard";

describe("Sticky notes", () => {
  it("a quick sticky is backed by a hidden note and never pollutes smart lists", async () => {
    const text = `Buy milk ${Date.now()}`;
    await api.newQuickSticky(text);

    const stickies = await api.listStickies();
    expect(stickies.some((s) => s.title === text)).toBe(true);
    // The backing NOTE task is excluded from the All smart list.
    expect((await api.listSmart("all")).some((t) => t.title === text)).toBe(false);
  });

  it("renders open stickies on the board", async () => {
    const text = `Idea ${Date.now()}`;
    await api.newQuickSticky(text);

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <StickyBoard />
      </QueryClientProvider>,
    );

    expect(await screen.findByDisplayValue(text)).toBeInTheDocument();
  });
});
