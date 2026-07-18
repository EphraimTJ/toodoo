import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { QuickAddBar } from "../components/QuickAddBar";

const INBOX = "inbox";

function renderBar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <QuickAddBar defaults={{ projectId: INBOX }} />
    </QueryClientProvider>,
  );
}

describe("QuickAddBar", () => {
  it("shows chips for parsed tokens and dismisses one", async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole("textbox", { name: "Add task" });
    await user.type(input, "Pay rent #finance !high");

    await waitFor(() => expect(screen.getAllByTestId("qa-chip").length).toBe(2));
    // Dismiss the tag chip → it leaves the text and the chip disappears.
    await user.click(screen.getByRole("button", { name: "Remove Tag: finance" }));
    await waitFor(() => expect(screen.getAllByTestId("qa-chip").length).toBe(1));
    expect((input as HTMLInputElement).value).not.toContain("#finance");
  });

  it("creates a task with the parsed tag and priority on Enter", async () => {
    const user = userEvent.setup();
    renderBar();
    const unique = `Rent ${Date.now()}`;
    const input = screen.getByRole("textbox", { name: "Add task" });
    await user.type(input, `${unique} #finance !high{Enter}`);

    await waitFor(async () => {
      const tasks = await api.listProjectTasks(INBOX);
      expect(tasks.some((t) => t.title === unique && t.priority === 5)).toBe(true);
    });

    const tasks = await api.listProjectTasks(INBOX);
    const created = tasks.find((t) => t.title === unique)!;
    const tags = await api.listTags();
    const finance = tags.find((t) => t.name === "finance");
    expect(finance).toBeTruthy();
    expect(created.tagIds).toContain(finance!.id);
    // Input cleared after submit.
    expect((input as HTMLInputElement).value).toBe("");
  });
});
