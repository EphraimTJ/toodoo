import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CalEvent } from "../../../lib/api";
import { EventDialog } from "../components/EventDialog";

const noop = () => {};

describe("EventDialog", () => {
  it("creates an event from the form", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    render(
      <EventDialog
        open
        onOpenChange={noop}
        defaultStart="2026-03-05T00:00:00.000Z"
        defaultAllDay
        onCreate={onCreate}
        onUpdate={noop}
        onDelete={noop}
      />,
    );

    await user.type(screen.getByLabelText("Event title"), "Picnic");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Picnic", allDay: true, startAt: "2026-03-05T00:00:00.000Z" }),
    );
  });

  it("seeds the form from an existing event in edit mode", () => {
    const event: CalEvent = {
      id: "e1",
      subscriptionId: null,
      title: "Standup",
      startAt: "2026-03-06T00:00:00.000Z",
      endAt: null,
      allDay: true,
      location: "Zoom",
      notes: null,
      color: "#35b979",
      rrule: null,
    };
    render(
      <EventDialog open onOpenChange={noop} event={event} onCreate={noop} onUpdate={noop} onDelete={noop} />,
    );

    expect(screen.getByLabelText("Event title")).toHaveValue("Standup");
    expect(screen.getByLabelText("Event location")).toHaveValue("Zoom");
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });
});
