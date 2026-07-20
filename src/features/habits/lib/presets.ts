import type { HabitInput } from "../../../lib/api";

/** A small bundled library of starter habits; picking one prefills the dialog. */
export const HABIT_PRESETS: HabitInput[] = [
  { name: "Drink water", icon: "💧", color: "#5d7052", goalKind: "AMOUNT", goalAmount: 8, unit: "glasses", freq: { kind: "daily" }, section: "Morning" },
  { name: "Exercise", icon: "🏃", color: "#4f6f52", goalKind: "CHECK", freq: { kind: "weekdays", days: [1, 2, 3, 4, 5] }, section: "Morning" },
  { name: "Read", icon: "📖", color: "#a8586b", goalKind: "CHECK", freq: { kind: "daily" }, section: "Night" },
  { name: "Meditate", icon: "🧘", color: "#b0763f", goalKind: "CHECK", freq: { kind: "daily" }, section: "Morning" },
  { name: "Sleep early", icon: "😴", color: "#78786c", goalKind: "CHECK", freq: { kind: "daily" }, section: "Night" },
  { name: "Journal", icon: "✍️", color: "#a85448", goalKind: "CHECK", freq: { kind: "weekly", times: 3 }, section: "Night" },
];

export const HABIT_COLORS = ["#5d7052", "#a85448", "#b0763f", "#4f6f52", "#a8586b", "#78786c"];
