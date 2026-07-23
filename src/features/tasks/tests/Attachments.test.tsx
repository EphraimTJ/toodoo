import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type Task } from "../../../lib/api";
import { Attachments } from "../components/detail/Attachments";

function wrap(task: Task) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Attachments task={task} />
    </QueryClientProvider>,
  );
}

describe("Attachments", () => {
  it("uploads a file, lists it, and deletes it", async () => {
    const user = userEvent.setup();
    const task = await api.createTask({ projectId: "inbox", title: `att ${Date.now()}` });
    wrap(task);

    expect(await screen.findByText(/No attachments/)).toBeInTheDocument();

    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    await user.upload(screen.getByLabelText("Attachment file"), file);

    // Non-media files render as a file chip with a human-readable size.
    const chip = await screen.findByTestId("attachment-file");
    expect(chip).toHaveTextContent("notes.txt");

    await user.click(screen.getByRole("button", { name: "Delete notes.txt" }));
    await waitFor(() => expect(screen.queryByTestId("attachment-file")).toBeNull());
  });

  it("renders an image attachment as a thumbnail", async () => {
    const user = userEvent.setup();
    const task = await api.createTask({ projectId: "inbox", title: `img ${Date.now()}` });
    wrap(task);

    const png = new File(["fakebytes"], "shot.png", { type: "image/png" });
    await user.upload(screen.getByLabelText("Attachment file"), png);

    const media = await screen.findByTestId("attachment-media");
    expect(media).toBeInTheDocument();
    await waitFor(() => expect(screen.getByAltText("shot.png")).toBeInTheDocument());
  });
});
