import { render, screen, waitFor, within } from "@testing-library/react";
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
  it("highlights parsed tokens inline (no chips)", async () => {
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole("textbox", { name: "Add task" });
    await user.type(input, "Pay rent #finance !high");

    // Tag + priority each get an inline highlight span, not a separate chip.
    await waitFor(() => expect(screen.getAllByTestId("qa-hl").length).toBe(2));
    const kinds = screen.getAllByTestId("qa-hl").map((el) => el.getAttribute("data-kind"));
    expect(kinds).toContain("tag");
    expect(kinds).toContain("priority");
    expect(screen.queryByTestId("qa-chip")).toBeNull();
  });

  it("suggests existing tags while typing # and completes on click", async () => {
    const name = `qa-ac-${Date.now()}`;
    await api.createTag(name);
    const user = userEvent.setup();
    renderBar();
    const input = screen.getByRole("textbox", { name: "Add task" });
    await user.type(input, "buy milk #qa-ac");

    const suggest = await screen.findByTestId("qa-tag-suggest");
    await user.click(within(suggest).getByText(name));
    await waitFor(() => expect((input as HTMLInputElement).value).toContain(`#${name} `));
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
