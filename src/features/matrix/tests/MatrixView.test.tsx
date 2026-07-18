import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, INBOX_ID } from "../../../lib/api";
import { MatrixView } from "../components/MatrixView";

function renderMatrix() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MatrixView />
    </QueryClientProvider>,
  );
}

describe("MatrixView", () => {
  it("renders the four quadrants and files a high task under Urgent & Important", async () => {
    const unique = `Matrix urgent ${Date.now()}`;
    const t = await api.createTask({ projectId: INBOX_ID, title: unique });
    await api.updateTask(t.id, { priority: 5 });

    renderMatrix();

    for (const label of [
      "Urgent & Important",
      "Important, Not Urgent",
      "Urgent, Not Important",
      "Neither",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }

    // The high-priority task lands in the top-left (Q0) quadrant.
    const q0 = screen.getByRole("region", { name: "Quadrant Urgent & Important" });
    expect(await within(q0).findByText(unique)).toBeInTheDocument();
  });
});
