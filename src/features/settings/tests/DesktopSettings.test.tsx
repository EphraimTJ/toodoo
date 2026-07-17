import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { DesktopSettings } from "../components/DesktopSettings";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DesktopSettings />
    </QueryClientProvider>,
  );
}

describe("DesktopSettings", () => {
  it("toggles launch-at-login and updates the hotkey", async () => {
    const user = userEvent.setup();
    renderPanel();

    const toggle = (await screen.findByTestId("autostart-toggle")) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    await user.click(toggle);
    await waitFor(async () => expect((await api.desktopConfig()).autostart).toBe(true));

    const hotkey = screen.getByTestId("hotkey-input");
    await user.clear(hotkey);
    await user.type(hotkey, "CmdOrCtrl+Shift+Q");
    await user.tab(); // blur commits
    await waitFor(async () => expect((await api.desktopConfig()).quickAddHotkey).toBe("CmdOrCtrl+Shift+Q"));
  });
});
