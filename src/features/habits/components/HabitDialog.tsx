import { useState } from "react";
import { Dialog } from "radix-ui";
import type { GoalKind, Habit, HabitFreq, HabitInput } from "../../../lib/api";
import { useHabitMutations } from "../hooks/useHabits";
import { HABIT_COLORS, HABIT_PRESETS } from "../lib/presets";

const WEEKDAYS: [number, string][] = [
  [1, "M"],
  [2, "T"],
  [3, "W"],
  [4, "T"],
  [5, "F"],
  [6, "S"],
  [7, "S"],
];
type FreqKind = HabitFreq["kind"];
const field = "w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  habit?: Habit | null;
  onSaved?(id: string): void;
}

export function HabitDialog({ open, onOpenChange, habit, onSaved }: Props) {
  const key = open ? (habit?.id ?? "new") : "closed";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[26rem] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-4 shadow-xl"
        >
          <HabitForm key={key} habit={habit} onClose={() => onOpenChange(false)} onSaved={onSaved} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function HabitForm({ habit, onClose, onSaved }: { habit?: Habit | null; onClose(): void; onSaved?(id: string): void }) {
  const { createHabit, updateHabit } = useHabitMutations();
  const initialFreq: HabitFreq = habit ? JSON.parse(habit.freqJson) : { kind: "daily" };
  const initialReminders: string[] = habit?.remindersJson ? JSON.parse(habit.remindersJson) : [];

  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState(habit?.icon ?? "✅");
  const [color, setColor] = useState(habit?.color ?? HABIT_COLORS[0]);
  const [quote, setQuote] = useState(habit?.quote ?? "");
  const [goalKind, setGoalKind] = useState<GoalKind>(habit?.goalKind ?? "CHECK");
  const [goalAmount, setGoalAmount] = useState(habit?.goalAmount ?? 1);
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [freqKind, setFreqKind] = useState<FreqKind>(initialFreq.kind);
  const [days, setDays] = useState<number[]>(initialFreq.kind === "weekdays" ? initialFreq.days : [1, 2, 3, 4, 5]);
  const [times, setTimes] = useState(
    initialFreq.kind === "weekly" || initialFreq.kind === "monthly" ? initialFreq.times : 3,
  );
  const [section, setSection] = useState(habit?.section ?? "");
  const [reminders, setReminders] = useState(initialReminders.join(", "));
  const [startDate, setStartDate] = useState(habit?.startDate ?? "");
  const [goalDays, setGoalDays] = useState<string>(habit?.goalDays != null ? String(habit.goalDays) : "");
  const [autoLogPopup, setAutoLogPopup] = useState(habit?.autoLogPopup ?? false);

  const applyPreset = (p: HabitInput) => {
    setName(p.name);
    setIcon(p.icon ?? "✅");
    setColor(p.color ?? HABIT_COLORS[0]);
    setGoalKind(p.goalKind);
    setGoalAmount(p.goalAmount ?? 1);
    setUnit(p.unit ?? "");
    setFreqKind(p.freq.kind);
    if (p.freq.kind === "weekdays") setDays(p.freq.days);
    if (p.freq.kind === "weekly" || p.freq.kind === "monthly") setTimes(p.freq.times);
    setSection(p.section ?? "");
  };

  const buildFreq = (): HabitFreq => {
    switch (freqKind) {
      case "weekdays":
        return { kind: "weekdays", days: [...days].sort((a, b) => a - b) };
      case "weekly":
        return { kind: "weekly", times };
      case "monthly":
        return { kind: "monthly", times };
      default:
        return { kind: "daily" };
    }
  };

  const save = async () => {
    if (!name.trim()) return;
    const input: HabitInput = {
      name: name.trim(),
      icon,
      color,
      quote: quote.trim() || null,
      goalKind,
      goalAmount: goalKind === "AMOUNT" ? goalAmount : null,
      unit: goalKind === "AMOUNT" ? unit.trim() || null : null,
      freq: buildFreq(),
      section: section.trim() || null,
      reminders: reminders
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d{1,2}:\d{2}$/.test(s)),
      startDate: startDate || null,
      goalDays: goalDays ? Number(goalDays) : null,
      autoLogPopup,
    };
    const saved = habit ? await updateHabit.mutateAsync({ id: habit.id, input }) : await createHabit.mutateAsync(input);
    onSaved?.(saved.id);
    onClose();
  };

  return (
    <>
      <Dialog.Title className="mb-3 text-base font-semibold">{habit ? "Edit habit" : "New habit"}</Dialog.Title>

      {!habit && (
        <div className="mb-3 flex flex-wrap gap-1">
          {HABIT_PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent"
            >
              {p.icon} {p.name}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <input value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="Habit icon" className="w-12 text-center" placeholder="✅" />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Habit name" aria-label="Habit name" autoFocus className={field} />
        </div>

        <div className="flex gap-1.5" aria-label="Habit color">
          {HABIT_COLORS.map((c) => (
            <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setColor(c)} style={{ backgroundColor: c }} className={`h-5 w-5 rounded-full ${color === c ? "ring-2 ring-accent ring-offset-1 ring-offset-surface" : ""}`} />
          ))}
        </div>

        <input value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="Motivational quote (optional)" aria-label="Quote" className={field} />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Goal</span>
          <select value={goalKind} onChange={(e) => setGoalKind(e.target.value as GoalKind)} aria-label="Goal type" className={field}>
            <option value="CHECK">Simple check-in</option>
            <option value="AMOUNT">Target amount</option>
          </select>
        </div>
        {goalKind === "AMOUNT" && (
          <div className="flex gap-2">
            <input type="number" min={1} value={goalAmount} onChange={(e) => setGoalAmount(Math.max(1, Number(e.target.value) || 1))} aria-label="Goal amount" className={field} />
            <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit (e.g. glasses)" aria-label="Unit" className={field} />
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">Repeat</span>
          <select value={freqKind} onChange={(e) => setFreqKind(e.target.value as FreqKind)} aria-label="Frequency" className={field}>
            <option value="daily">Daily</option>
            <option value="weekdays">Specific weekdays</option>
            <option value="weekly">X times per week</option>
            <option value="monthly">X times per month</option>
          </select>
        </div>
        {freqKind === "weekdays" && (
          <div className="flex gap-1" aria-label="Weekdays">
            {WEEKDAYS.map(([n, label]) => (
              <button
                key={n}
                type="button"
                aria-label={`Weekday ${n}`}
                aria-pressed={days.includes(n)}
                onClick={() => setDays((d) => (d.includes(n) ? d.filter((x) => x !== n) : [...d, n]))}
                className={`h-7 w-7 rounded-full text-xs ${days.includes(n) ? "bg-accent text-accent-fg" : "border border-border text-text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {(freqKind === "weekly" || freqKind === "monthly") && (
          <label className="flex items-center gap-2 text-sm text-text-muted">
            Times per {freqKind === "weekly" ? "week" : "month"}
            <input type="number" min={1} value={times} onChange={(e) => setTimes(Math.max(1, Number(e.target.value) || 1))} aria-label="Times per period" className="w-16 rounded border border-border bg-bg px-1 py-0.5 text-text outline-none focus:border-accent" />
          </label>
        )}

        <input value={section} onChange={(e) => setSection(e.target.value)} placeholder="Section (Morning / Night / …)" aria-label="Section" className={field} />
        <input value={reminders} onChange={(e) => setReminders(e.target.value)} placeholder="Reminders, e.g. 09:00, 21:00" aria-label="Reminders" className={field} />
        <label className="block text-xs text-text-muted">
          Start date
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Start date" className={field} />
        </label>
        <label className="block text-xs text-text-muted">
          Goal days
          <select value={goalDays} onChange={(e) => setGoalDays(e.target.value)} aria-label="Goal days" className={field}>
            <option value="">Forever</option>
            <option value="7">7 days</option>
            <option value="21">21 days</option>
            <option value="30">30 days</option>
            <option value="66">66 days</option>
            <option value="100">100 days</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-text-muted">
          <input
            type="checkbox"
            checked={autoLogPopup}
            onChange={(e) => setAutoLogPopup(e.target.checked)}
            aria-label="Auto pop-up of habit log"
            className="h-3.5 w-3.5 accent-(--color-accent)"
          />
          Auto pop-up of check-in log
        </label>
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
