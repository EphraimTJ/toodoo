import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeToggle } from "../components/ThemeToggle";

function renderToggle() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeToggle />
    </QueryClientProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("toggles the dark class on <html> and back", async () => {
    const user = userEvent.setup();
    renderToggle();

    const toggle = screen.getByRole("switch", { name: "Toggle dark mode" });
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(toggle);
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));

    await user.click(toggle);
    await waitFor(() => expect(document.documentElement).not.toHaveClass("dark"));
  });
});
