import { useState } from "react";
import { Dialog } from "radix-ui";
import type { Countdown, CountdownStyle } from "../../../lib/api";
import { useCountdowns } from "../hooks/useCountdowns";

const COLORS = ["#5d7052", "#a85448", "#b0763f", "#4f6f52", "#a8586b", "#78786c"];
const field = "w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  countdown?: Countdown | null;
  onSaved?(id: string): void;
}

export function CountdownDialog({ open, onOpenChange, countdown, onSaved }: Props) {
  const key = open ? (countdown?.id ?? "new") : "closed";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 shadow-xl"
        >
          <CountdownForm key={key} countdown={countdown} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CountdownForm({
  countdown,
  onClose,
  onSaved,
}: {
  countdown?: Countdown | null;
  onClose(): void;
  onSaved?(id: string): void;
}) {
  const { createCountdown, updateCountdown } = useCountdowns();
  const style: CountdownStyle = countdown?.styleJson ? JSON.parse(countdown.styleJson) : {};

  const [title, setTitle] = useState(countdown?.title ?? "");
  const [targetDate, setTargetDate] = useState(countdown?.targetDate ?? new Date().toISOString().slice(0, 10));
  const [repeatAnnual, setRepeatAnnual] = useState(countdown?.repeatAnnual ?? false);
  const [countUp, setCountUp] = useState(style.countUp ?? false);
  const [color, setColor] = useState(style.color ?? COLORS[0]);

  const save = async () => {
    if (!title.trim() || !targetDate) return;
    const styleJson = JSON.stringify({ color, countUp });
    const saved = countdown
      ? await updateCountdown.mutateAsync({ id: countdown.id, patch: { title: title.trim(), targetDate, repeatAnnual, styleJson } })
      : await createCountdown.mutateAsync({ title: title.trim(), targetDate, repeatAnnual, styleJson });
    onSaved?.(saved.id);
    onClose();
  };

  return (
    <>
      <Dialog.Title className="mb-3 text-base font-semibold">{countdown ? "Edit countdown" : "New countdown"}</Dialog.Title>
      <div className="space-y-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name" aria-label="Countdown title" autoFocus className={field} />
        <label className="block text-xs text-text-muted">
          Target date
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} aria-label="Target date" className={field} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={repeatAnnual} onChange={(e) => setRepeatAnnual(e.target.checked)} className="accent-(--color-accent)" />
          Repeat annually
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={countUp} onChange={(e) => setCountUp(e.target.checked)} disabled={repeatAnnual} className="accent-(--color-accent)" />
          Count up (days since)
        </label>
        <div className="flex gap-1.5" aria-label="Cover color">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`} />
          ))}
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Dialog.Close asChild>
          <button type="button" className="rounded-md border border-border px-3 py-1 text-sm">Cancel</button>
        </Dialog.Close>
        <button type="button" onClick={() => void save()} className="rounded-md bg-accent px-3 py-1 text-sm text-accent-fg">Save</button>
      </div>
    </>
  );
}
