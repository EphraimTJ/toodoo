import type { HabitInput } from "../../../lib/api";

/** A small bundled library of starter habits; picking one prefills the dialog. */
export const HABIT_PRESETS: HabitInput[] = [
  { name: "Drink water", icon: "💧", color: "#4772fa", goalKind: "AMOUNT", goalAmount: 8, unit: "glasses", freq: { kind: "daily" }, section: "Morning" },
  { name: "Exercise", icon: "🏃", color: "#35b979", goalKind: "CHECK", freq: { kind: "weekdays", days: [1, 2, 3, 4, 5] }, section: "Morning" },
  { name: "Read", icon: "📖", color: "#9d6ff0", goalKind: "CHECK", freq: { kind: "daily" }, section: "Night" },
  { name: "Meditate", icon: "🧘", color: "#f0a825", goalKind: "CHECK", freq: { kind: "daily" }, section: "Morning" },
  { name: "Sleep early", icon: "😴", color: "#71717a", goalKind: "CHECK", freq: { kind: "daily" }, section: "Night" },
  { name: "Journal", icon: "✍️", color: "#e0362a", goalKind: "CHECK", freq: { kind: "weekly", times: 3 }, section: "Night" },
];

export const HABIT_COLORS = ["#4772fa", "#e0362a", "#f0a825", "#35b979", "#9d6ff0", "#71717a"];
