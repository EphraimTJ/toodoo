import { useState } from "react";
import { Dialog } from "radix-ui";
import type { CalEvent, NewEvent } from "../../../lib/api";

const COLORS = ["#5d7052", "#a85448", "#b0763f", "#4f6f52", "#a8586b", "#78786c"];

/** ISO (UTC) → value for a datetime-local / date input, in the viewer's TZ. */
function toLocalInput(iso: string | null, allDay: boolean): string {
  if (!iso) return "";
  if (allDay) return iso.slice(0, 10);
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fromLocalInput(val: string, allDay: boolean): string {
  if (!val) return "";
  return allDay ? `${val.slice(0, 10)}T00:00:00.000Z` : new Date(val).toISOString();
}

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  event?: CalEvent | null;
  defaultStart?: string | null;
  defaultAllDay?: boolean;
  onCreate(input: NewEvent): void;
  onUpdate(id: string, patch: { title?: string; startAt?: string; endAt?: string; allDay?: boolean; location?: string; notes?: string; color?: string }): void;
  onDelete(id: string): void;
}

const field = "w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

export function EventDialog({ open, onOpenChange, ...formProps }: Props) {
  // Remount the form per open/target so its state seeds from props without an
  // effect (idiomatic React "reset state with a key").
  const key = open ? (formProps.event?.id ?? `new:${formProps.defaultStart ?? ""}`) : "closed";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 shadow-xl"
          aria-describedby={undefined}
        >
          <EventForm key={key} onClose={() => onOpenChange(false)} {...formProps} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EventForm({
  event,
  defaultStart,
  defaultAllDay,
  onCreate,
  onUpdate,
  onDelete,
  onClose,
}: Omit<Props, "open" | "onOpenChange"> & { onClose(): void }) {
  const initialAllDay = event ? event.allDay : (defaultAllDay ?? true);
  const [title, setTitle] = useState(event?.title ?? "");
  const [allDay, setAllDay] = useState(initialAllDay);
  const [start, setStart] = useState(toLocalInput(event?.startAt ?? defaultStart ?? null, initialAllDay));
  const [end, setEnd] = useState(toLocalInput(event?.endAt ?? null, initialAllDay));
  const [location, setLocation] = useState(event?.location ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [color, setColor] = useState(event?.color ?? COLORS[0]);

  const save = () => {
    const t = title.trim();
    if (!t || !start) return;
    const payload = {
      title: t,
      startAt: fromLocalInput(start, allDay),
      endAt: end ? fromLocalInput(end, allDay) : undefined,
      allDay,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      color,
    };
    if (event) onUpdate(event.id, payload);
    else onCreate(payload);
    onClose();
  };

  return (
    <>
      <Dialog.Title className="mb-3 text-base font-semibold">
        {event ? "Edit event" : "New event"}
      </Dialog.Title>

      <div>
          <div className="space-y-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              aria-label="Event title"
              className={field}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="accent-(--color-accent)"
              />
              All day
            </label>
            <label className="block text-xs text-text-muted">
              Start
              <input
                type={allDay ? "date" : "datetime-local"}
                value={start}
                aria-label="Event start"
                onChange={(e) => setStart(e.target.value)}
                className={field}
              />
            </label>
            <label className="block text-xs text-text-muted">
              End
              <input
                type={allDay ? "date" : "datetime-local"}
                value={end}
                aria-label="Event end"
                onChange={(e) => setEnd(e.target.value)}
                className={field}
              />
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              aria-label="Event location"
              className={field}
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes"
              aria-label="Event notes"
              rows={2}
              className={field}
            />
            <div className="flex gap-1.5" aria-label="Event color">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => setColor(c)}
                  className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-between">
            {event ? (
              <button
                type="button"
                onClick={() => {
                  onDelete(event.id);
                  onClose();
                }}
                className="rounded-md border border-border px-3 py-1 text-sm text-text-muted hover:text-destructive"
              >
                Delete
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <button type="button" className="rounded-md border border-border px-3 py-1 text-sm">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={save}
                className="rounded-md bg-accent px-3 py-1 text-sm text-accent-fg"
              >
                Save
              </button>
            </div>
          </div>
      </div>
    </>
  );
}
