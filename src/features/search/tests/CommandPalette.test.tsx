import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { CommandPalette } from "../components/CommandPalette";

function renderPalette() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPalette />
    </QueryClientProvider>,
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    useUiStore.setState({ paletteOpen: false, selectedTaskId: null });
  });

  it("opens with Ctrl+K and finds tasks by text", async () => {
    const unique = `Renew passport ${Date.now()}`;
    await api.createTask({ projectId: INBOX_ID, title: unique });

    const user = userEvent.setup();
    renderPalette();

    await user.keyboard("{Control>}k{/Control}");
    const input = await screen.findByPlaceholderText("Search tasks, jump to lists…");
    await user.type(input, "renew passport");

    expect(await screen.findByText(unique)).toBeInTheDocument();
  });

  it("selecting a result opens the task and closes the palette", async () => {
    const unique = `Book dentist ${Date.now()}`;
    const task = await api.createTask({ projectId: INBOX_ID, title: unique });

    const user = userEvent.setup();
    renderPalette();

    await user.keyboard("{Control>}k{/Control}");
    await user.type(await screen.findByPlaceholderText("Search tasks, jump to lists…"), "dentist");
    await user.click(await screen.findByText(unique));

    expect(useUiStore.getState().selectedTaskId).toBe(task.id);
    expect(useUiStore.getState().paletteOpen).toBe(false);
    expect(useUiStore.getState().view).toEqual({ kind: "project", projectId: INBOX_ID });
  });
});
