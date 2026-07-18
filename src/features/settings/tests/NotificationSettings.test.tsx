import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { NotificationSettings } from "../components/NotificationSettings";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NotificationSettings />
    </QueryClientProvider>,
  );
}

describe("NotificationSettings", () => {
  it("changes the snooze duration and toggles action buttons", async () => {
    const user = userEvent.setup();
    renderPanel();

    const select = (await screen.findByTestId("snooze-duration-select")) as HTMLSelectElement;
    await user.selectOptions(select, "30");
    await waitFor(async () => expect((await api.desktopConfig()).notifSnoozeMin).toBe(30));

    const toggle = screen.getByRole("switch", { name: "Notification action buttons" }) as HTMLInputElement;
    const before = toggle.checked;
    await user.click(toggle);
    await waitFor(async () => expect((await api.desktopConfig()).notifActions).toBe(!before));
  });

  it("renders the chirp sound controls", async () => {
    renderPanel();
    expect(await screen.findByTestId("notif-sound-settings")).toBeInTheDocument();
    expect(screen.getByTestId("chirp-preview")).toBeInTheDocument();
  });
});
