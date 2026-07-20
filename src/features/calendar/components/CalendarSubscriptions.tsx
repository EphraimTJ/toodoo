import { useState } from "react";
import { Dialog } from "radix-ui";
import { useSubscriptions } from "../hooks/useSubscriptions";

const COLORS = ["#5d7052", "#a85448", "#b0763f", "#4f6f52", "#a8586b"];

export function CalendarSubscriptions({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { query, addSubscription, updateSubscription, deleteSubscription, refreshSubscription } =
    useSubscriptions();
  const subs = query.data ?? [];
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");

  const add = () => {
    if (!url.trim() || !name.trim()) return;
    addSubscription.mutate({ url: url.trim(), name: name.trim(), color: COLORS[0] });
    setUrl("");
    setName("");
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 shadow-xl"
        >
          <Dialog.Title className="mb-3 text-base font-semibold">Calendar subscriptions</Dialog.Title>

          <ul className="mb-3 space-y-1">
            {subs.map((sub) => (
              <li key={sub.id} className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  aria-label={`Toggle ${sub.name} visibility`}
                  onClick={() => updateSubscription.mutate({ id: sub.id, patch: { visible: !sub.visible } })}
                  className="text-text-muted"
                >
                  {sub.visible ? "👁" : "🚫"}
                </button>
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: sub.color ?? "#78786c" }} />
                <span className="min-w-0 flex-1 truncate">{sub.name}</span>
                <button
                  type="button"
                  aria-label={`Refresh ${sub.name}`}
                  onClick={() => refreshSubscription.mutate(sub.id)}
                  className="text-text-muted hover:text-accent"
                >
                  ↻
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${sub.name}`}
                  onClick={() => deleteSubscription.mutate(sub.id)}
                  className="text-text-muted hover:text-destructive"
                >
                  ✕
                </button>
              </li>
            ))}
            {subs.length === 0 && <li className="text-xs text-text-muted">No subscriptions yet.</li>}
          </ul>

          <div className="space-y-1 border-t border-border pt-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              aria-label="Subscription name"
              className="w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…/calendar.ics"
              aria-label="Subscription URL"
              className="w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={add}
              className="w-full rounded-md bg-accent px-3 py-1 text-sm text-accent-fg"
            >
              Add subscription
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
