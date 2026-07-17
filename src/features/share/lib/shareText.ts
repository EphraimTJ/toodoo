/**
 * Pure builders that render a task or a list as plain text / Markdown for the
 * Share action. Frontend-only and unit-tested; the Markdown mirrors the exporter
 * conventions (`- [x]`/`- [ ]`), so it stays consistent with `repo::exporters`.
 */
import type { Task } from "../../../lib/api";

const PRIORITY_LABEL: Record<number, string> = { 5: "High", 3: "Medium", 1: "Low", 0: "None" };

function box(status: Task["status"]): string {
  return status === "COMPLETED" ? "x" : " ";
}

function meta(task: Task): string[] {
  const bits: string[] = [];
  if (task.priority !== 0) bits.push(`Priority: ${PRIORITY_LABEL[task.priority] ?? task.priority}`);
  if (task.dueAt) bits.push(`Due: ${task.dueAt.slice(0, task.isAllDay ? 10 : 16).replace("T", " ")}`);
  if (task.rrule) bits.push(`Repeats: ${task.rrule}`);
  return bits;
}

/** One task as plain text (title, meta, notes). */
export function taskToText(task: Task): string {
  const lines = [task.title];
  const m = meta(task);
  if (m.length) lines.push(m.join(" · "));
  if (task.contentPlain?.trim()) lines.push("", task.contentPlain.trim());
  return lines.join("\n");
}

/** One task as Markdown (a checkbox line + indented meta/notes). */
export function taskToMarkdown(task: Task): string {
  const lines = [`- [${box(task.status)}] ${task.title}`];
  for (const m of meta(task)) lines.push(`  - ${m}`);
  if (task.contentPlain?.trim()) {
    for (const line of task.contentPlain.trim().split("\n")) lines.push(`  > ${line}`);
  }
  return lines.join("\n");
}

/** A list (name + its tasks) as plain text. */
export function listToText(name: string, tasks: Task[]): string {
  const lines = [name, "=".repeat(name.length)];
  for (const t of tasks) {
    const done = t.status === "COMPLETED" ? "[x]" : "[ ]";
    lines.push(`${done} ${t.title}`);
  }
  return lines.join("\n");
}

/** A list (name + its tasks) as Markdown. */
export function listToMarkdown(name: string, tasks: Task[]): string {
  const lines = [`# ${name}`, ""];
  if (tasks.length === 0) lines.push("_(empty)_");
  for (const t of tasks) lines.push(`- [${box(t.status)}] ${t.title}`);
  return lines.join("\n") + "\n";
}
