import { useMemo, useState } from "react";
import { Bell, Calendar, Flag, Tag as TagIcon, X } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { parseQuickAdd, type ParsedQuickAdd, type ParsedToken } from "../lib/parse";
import { useQuickAdd, type QuickAddDefaults } from "../hooks/useQuickAdd";
import { useTags } from "../../tags/hooks/useTags";

// Live-parse chips, tinted across the earth palette (dusty rose / moss / ochre
// / teal / terracotta) so they read as one natural family.
const CHIP_COLOR: Record<ParsedToken["kind"], string> = {
  tag: "text-[#a8586b]",
  list: "text-accent",
  priority: "text-[#b0763f]",
  date: "text-[#4f7d76]",
  repeat: "text-secondary",
  remind: "text-[#4f7d76]",
};

const PRIORITY_OPTS: [number, string, string][] = [
  [5, "High", "text-destructive"],
  [3, "Medium", "text-secondary"],
  [1, "Low", "text-accent"],
  [0, "None", "text-text-muted"],
];

const menuItem =
  "flex cursor-pointer select-none items-center gap-1.5 rounded-md px-2 py-1 text-sm outline-none hover:bg-bg data-[highlighted]:bg-bg";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** All-day date `n` days from today, in the UTC-midnight calendar convention. */
function allDayIso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`;
}

const DUE_OPTS: [string, number][] = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["In 3 days", 3],
  ["Next week", 7],
];

interface DueOverride {
  iso: string;
  label: string;
}

/** Natural-language add bar: parses tokens live, shows removable chips, and a
 *  toolbar to set priority / due / tags right in the prompt — TickTick-style.
 *  Creates the task through the normal path on Enter. */
export function QuickAddBar({ defaults }: { defaults: QuickAddDefaults }) {
  const [text, setText] = useState("");
  const [priorityOverride, setPriorityOverride] = useState<number | null>(null);
  const [dueOverride, setDueOverride] = useState<DueOverride | null>(null);
  const [tagOverride, setTagOverride] = useState<string[]>([]);
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const submit = useQuickAdd();
  const { data: tags } = useTags();

  // Toolbar overrides win over anything parsed from the text.
  const effective: ParsedQuickAdd = {
    ...parsed,
    priority: priorityOverride ?? parsed.priority,
    dueAt: dueOverride?.iso ?? parsed.dueAt,
    isAllDay: dueOverride ? true : parsed.isAllDay,
    tags: Array.from(new Set([...parsed.tags, ...tagOverride])),
  };

  const reset = () => {
    setText("");
    setPriorityOverride(null);
    setDueOverride(null);
    setTagOverride([]);
  };

  const doSubmit = async () => {
    if (!effective.title.trim()) return; // a task needs a title
    await submit(effective, defaults);
    reset();
  };

  const dismiss = (token: ParsedToken) =>
    setText(text.replace(token.text, "").replace(/\s+/g, " ").trim());

  const priorityChip = PRIORITY_OPTS.find(([p]) => p === priorityOverride);

  return (
    <div className="px-4 pb-2 pt-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void doSubmit();
        }}
        placeholder="+ Add task — try “remind me tomorrow to pay rent ~Bills #finance !high”"
        aria-label="Add task"
        className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-soft outline-none transition-all placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
      />

      {/* Toolbar — set priority / due / tags without typing tokens. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="qa-toolbar">
        {/* Due */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Set due date"
              className={`flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs ${
                dueOverride ? "text-accent" : "text-text-muted hover:text-text"
              }`}
            >
              <Calendar size={12} strokeWidth={1.75} />
              {dueOverride ? dueOverride.label : "Due"}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              className="z-50 min-w-32 rounded-xl border border-border bg-surface p-1 shadow-float"
            >
              {DUE_OPTS.map(([label, days]) => (
                <DropdownMenu.Item
                  key={label}
                  className={menuItem}
                  onSelect={() => setDueOverride({ iso: allDayIso(days), label })}
                >
                  {label}
                </DropdownMenu.Item>
              ))}
              {dueOverride && (
                <DropdownMenu.Item className={menuItem} onSelect={() => setDueOverride(null)}>
                  Clear
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Priority */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Set priority"
              className={`flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs ${
                priorityChip ? priorityChip[2] : "text-text-muted hover:text-text"
              }`}
            >
              <Flag size={12} strokeWidth={1.75} />
              {priorityChip ? priorityChip[1] : "Priority"}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              className="z-50 min-w-28 rounded-xl border border-border bg-surface p-1 shadow-float"
            >
              {PRIORITY_OPTS.map(([value, label, cls]) => (
                <DropdownMenu.Item
                  key={value}
                  className={`${menuItem} ${cls}`}
                  onSelect={() => setPriorityOverride(value === 0 ? null : value)}
                >
                  <Flag size={12} strokeWidth={1.75} /> {label}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {/* Tags */}
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label="Add tags"
              className={`flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs ${
                tagOverride.length ? "text-[#a8586b]" : "text-text-muted hover:text-text"
              }`}
            >
              <TagIcon size={12} strokeWidth={1.75} />
              {tagOverride.length ? `${tagOverride.length} tag${tagOverride.length > 1 ? "s" : ""}` : "Tag"}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              sideOffset={6}
              className="z-50 max-h-56 min-w-40 overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-float"
            >
              {(tags ?? []).length === 0 && (
                <p className="px-2 py-1 text-xs text-text-muted">No tags yet — type #name</p>
              )}
              {(tags ?? []).map((tag) => {
                const on = tagOverride.includes(tag.name);
                return (
                  <DropdownMenu.CheckboxItem
                    key={tag.id}
                    checked={on}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(next) =>
                      setTagOverride((prev) =>
                        next ? [...prev, tag.name] : prev.filter((n) => n !== tag.name),
                      )
                    }
                    className={menuItem}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color ?? "#78786c" }} />
                    {tag.name}
                    {on && <span className="ml-auto text-accent">✓</span>}
                  </DropdownMenu.CheckboxItem>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {parsed.remind && (
          <span className="flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-xs text-[#4f7d76]">
            <Bell size={11} strokeWidth={1.75} /> Reminder
          </span>
        )}
      </div>

      {/* Parsed-from-text chips (removable). */}
      {parsed.tokens.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="qa-chips">
          {parsed.tokens.map((token) => (
            <button
              key={`${token.kind}:${token.text}`}
              type="button"
              data-testid="qa-chip"
              aria-label={`Remove ${token.label}`}
              onClick={() => dismiss(token)}
              className="flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-xs hover:border-accent"
            >
              <span className={CHIP_COLOR[token.kind]}>{token.label}</span>
              <span className="flex items-center text-text-muted">
                <X size={11} strokeWidth={2} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
