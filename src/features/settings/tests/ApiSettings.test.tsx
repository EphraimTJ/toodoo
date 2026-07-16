import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiSettings } from "../components/ApiSettings";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ApiSettings />
    </QueryClientProvider>,
  );
}

describe("ApiSettings", () => {
  it("shows the token, toggles enabled, and regenerates the token", async () => {
    const user = userEvent.setup();
    renderPanel();

    const token = (await screen.findByTestId("api-token")) as HTMLInputElement;
    expect(token.value.length).toBeGreaterThan(0);

    // Toggle the server on.
    const toggle = screen.getByTestId("api-enable-toggle") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    await waitFor(() => expect((screen.getByTestId("api-enable-toggle") as HTMLInputElement).checked).toBe(true));

    // Regenerate mints a different token.
    const before = token.value;
    await user.click(screen.getByTestId("api-regenerate"));
    await waitFor(() =>
      expect((screen.getByTestId("api-token") as HTMLInputElement).value).not.toBe(before),
    );
  });
});
