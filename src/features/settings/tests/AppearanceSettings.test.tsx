import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppearanceProvider } from "../components/AppearanceProvider";
import { AppearanceSettings } from "../components/AppearanceSettings";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AppearanceProvider>
        <AppearanceSettings />
      </AppearanceProvider>
    </QueryClientProvider>,
  );
}

describe("AppearanceSettings", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.fontSize = "";
  });

  it("applies dark mode, an accent, and font size to the document", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Theme Dark" }));
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));

    await user.click(screen.getByRole("button", { name: "Accent #f0a825" }));
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue("--color-accent")).toBe("#f0a825"),
    );
    // Amber is light → black foreground for contrast.
    expect(document.documentElement.style.getPropertyValue("--color-accent-fg")).toBe("#000000");

    await user.click(screen.getByRole("button", { name: "Font size L" }));
    await waitFor(() => expect(document.documentElement.style.fontSize).toBe("18px"));
  });
});
