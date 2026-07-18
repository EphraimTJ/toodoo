import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataSettings } from "../components/DataSettings";
import { downloadText } from "../../../lib/download";

vi.mock("../../../lib/download", () => ({ downloadText: vi.fn() }));

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DataSettings />
    </QueryClientProvider>,
  );
}

describe("DataSettings", () => {
  it("exports markdown via the download helper", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(downloadText).toHaveBeenCalled());
    const calls = (downloadText as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const text = calls[calls.length - 1][1];
    expect(String(text)).toContain("## Inbox");
  });

  it("imports a generic CSV file and reports the count", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.selectOptions(screen.getByLabelText("Import source"), "generic");
    const csv = "title,list\nImported via UI,Inbox\n";
    const file = new File([csv], "tasks.csv", { type: "text/csv" });
    await user.upload(screen.getByTestId("import-file"), file);

    expect(await screen.findByTestId("import-result")).toHaveTextContent("Imported 1 task");
  });

  it("creates a backup that shows in the list", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId("backup-now"));
    await waitFor(() =>
      expect(screen.getByTestId("backup-list").textContent).toMatch(/toodoo-.*\.db/),
    );
  });
});
