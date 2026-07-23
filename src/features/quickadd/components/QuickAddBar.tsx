import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Bell, Calendar, Flag, Tag as TagIcon } from "lucide-react";
import { DropdownMenu, Popover } from "radix-ui";
import { format } from "date-fns";
import { parseQuickAdd, type ParsedQuickAdd, type ParsedToken } from "../lib/parse";
import { useQuickAdd, type QuickAddDefaults } from "../hooks/useQuickAdd";
import { useTags } from "../../tags/hooks/useTags";

// Inline highlight per token kind — a translucent tint + matching text colour,
// tuned across the earth palette so each meaning reads distinctly:
// reminder (teal), due (ochre), priority (terracotta), tag (rose), list (moss).
const HL: Record<ParsedToken["kind"], string> = {
  remind: "rounded bg-[#4f7d76]/25 text-[#4f7d76]",
  date: "rounded bg-[#b0763f]/25 text-[#b0763f]",
  priority: "rounded bg-[#a85448]/25 text-[#a85448]",
  tag: "rounded bg-[#a8586b]/25 text-[#a8586b]",
  list: "rounded bg-accent/25 text-accent",
  repeat: "rounded bg-[#78786c]/25 text-secondary",
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

const DUE_QUICK: [string, number][] = [
  ["Today", 0],
  ["Tomorrow", 1],
  ["Next week", 7],
];

interface DueOverride {
  iso: string;
  label: string;
  allDay: boolean;
}

/** Render the input text with each parsed token wrapped in a coloured span. */
function renderHighlighted(text: string, tokens: ParsedToken[]) {
  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let i = 0;
  for (const [n, t] of sorted.entries()) {
    if (t.start < i) continue; // guard against any overlap
    if (t.start > i) out.push(<span key={`p${n}`}>{text.slice(i, t.start)}</span>);
    out.push(
      <mark key={`t${n}`} data-testid="qa-hl" data-kind={t.kind} className={HL[t.kind]}>
        {text.slice(t.start, t.end)}
      </mark>,
    );
    i = t.end;
  }
  // Trailing space keeps the backdrop width in step with the caret at line end.
  out.push(<span key="tail">{text.slice(i) || "​"}</span>);
  return out;
}

/** Natural-language add bar: highlights parsed tokens inline (reminder / due /
 *  priority / tag / list), with a toolbar to set due / priority / tags right in
 *  the prompt. Creates the task through the normal path on Enter.
 *  `onAdded` fires after a successful add (the pop-out window closes on it). */
export function QuickAddBar({ defaults, onAdded }: { defaults: QuickAddDefaults; onAdded?: () => void }) {
  const [text, setText] = useState("");
  const [priorityOverride, setPriorityOverride] = useState<number | null>(null);
  const [dueOverride, setDueOverride] = useState<DueOverride | null>(null);
  const [tagOverride, setTagOverride] = useState<string[]>([]);
  const [dateStr, setDateStr] = useState("");
  const [timeStr, setTimeStr] = useState("");
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const submit = useQuickAdd();
  const { data: tags } = useTags();

  const inputRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // `#` autocomplete: while the caret sits in an unfinished `#word`, suggest
  // matching tags; Enter / Tab / click completes it instead of submitting.
  const [caret, setCaret] = useState(0);
  const [hlIdx, setHlIdx] = useState(0);
  const [acDismissed, setAcDismissed] = useState(false);
  const acMatch = useMemo(() => {
    const m = text.slice(0, caret).match(/(^|\s)#([\p{L}\p{N}_-]*)$/u);
    return m && m.index != null ? { partial: m[2], hashStart: m.index + m[1].length } : null;
  }, [text, caret]);
  const suggestions = useMemo(() => {
    if (!acMatch) return [];
    const q = acMatch.partial.toLowerCase();
    return (tags ?? [])
      .filter((t) => t.name.toLowerCase().includes(q))
      .filter((t) => !parsed.tags.some((n) => n.toLowerCase() === t.name.toLowerCase()))
      .slice(0, 5);
  }, [acMatch, tags, parsed.tags]);
  const acOpen = suggestions.length > 0 && !acDismissed;
  useEffect(() => {
    setHlIdx(0);
    setAcDismissed(false);
  }, [acMatch?.partial, acMatch?.hashStart]);

  const applySuggestion = (name: string) => {
    if (!acMatch) return;
    const next = `${text.slice(0, acMatch.hashStart)}#${name} ${text.slice(caret)}`;
    const pos = acMatch.hashStart + name.length + 2;
    setText(next);
    setCaret(pos);
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(pos, pos));
  };
  // Keep the highlight backdrop scrolled in lock-step with the input.
  const syncScroll = () => {
    if (backdropRef.current && inputRef.current) {
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };
  useLayoutEffect(syncScroll, [text]);

  // Toolbar overrides win over anything parsed from the text.
  const effective: ParsedQuickAdd = {
    ...parsed,
    priority: priorityOverride ?? parsed.priority,
    dueAt: dueOverride?.iso ?? parsed.dueAt,
    isAllDay: dueOverride ? dueOverride.allDay : parsed.isAllDay,
    tags: Array.from(new Set([...parsed.tags, ...tagOverride])),
  };

  const reset = () => {
    setText("");
    setCaret(0);
    setPriorityOverride(null);
    setDueOverride(null);
    setTagOverride([]);
    setDateStr("");
    setTimeStr("");
  };

  const doSubmit = async () => {
    if (!effective.title.trim()) return; // a task needs a title
    await submit(effective, defaults);
    reset();
    onAdded?.();
  };

  // Recompute the due override from the custom date/time inputs.
  const applyCustomDue = (date: string, time: string) => {
    setDateStr(date);
    setTimeStr(time);
    if (!date) {
      setDueOverride(null);
      return;
    }
    if (time) {
      const dt = new Date(`${date}T${time}`);
      setDueOverride({ iso: dt.toISOString(), label: format(dt, "MMM d, p"), allDay: false });
    } else {
      setDueOverride({ iso: `${date}T00:00:00.000Z`, label: format(new Date(`${date}T00:00:00`), "MMM d"), allDay: true });
    }
  };

  const priorityChip = PRIORITY_OPTS.find(([p]) => p === priorityOverride);

  return (
    <div className="px-4 pb-2 pt-3">
      {/* Highlight backdrop under a transparent input (text shows through the
          backdrop's coloured spans; the input carries the caret + selection). */}
      <div className="relative rounded-full border border-border bg-surface shadow-soft focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
        <div
          ref={backdropRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre rounded-full px-4 py-2 text-sm text-text"
          data-testid="qa-backdrop"
        >
          {renderHighlighted(text, parsed.tokens)}
        </div>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
          }}
          onSelect={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? 0)}
          onScroll={syncScroll}
          onKeyDown={(e) => {
            if (acOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHlIdx((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setHlIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                applySuggestion(suggestions[hlIdx].name);
                return;
              }
              if (e.key === "Escape") {
                // Only dismiss the suggestions — don't let the pop-out window
                // (which closes on Escape) see this press.
                e.stopPropagation();
                setAcDismissed(true);
                return;
              }
            }
            if (e.key === "Enter") void doSubmit();
          }}
          placeholder="+ Add task — try “remind me tomorrow to pay rent #finance !high”"
          aria-label="Add task"
          spellCheck={false}
          style={{ caretColor: "var(--color-text, #888)" }}
          className="relative w-full bg-transparent px-4 py-2 text-sm text-transparent outline-none placeholder:text-text-muted"
        />

        {acOpen && (
          <div
            className="absolute left-3 top-full z-50 mt-1 w-60 rounded-xl border border-border bg-surface p-1 shadow-float"
            data-testid="qa-tag-suggest"
          >
            {suggestions.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  applySuggestion(t.name);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-bg ${
                  i === hlIdx ? "bg-bg" : ""
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color ?? "#78786c" }} />
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Toolbar — set due / priority / tags without typing tokens. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5" data-testid="qa-toolbar">
        {/* Due — quick picks plus any date/time. */}
        <Popover.Root>
          <Popover.Trigger asChild>
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
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              align="start"
              className="z-50 w-56 rounded-xl border border-border bg-surface p-2 shadow-float"
            >
              <div className="flex flex-wrap gap-1">
                {DUE_QUICK.map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      setDueOverride({ iso: allDayIso(days), label, allDay: true });
                      setDateStr("");
                      setTimeStr("");
                    }}
                    className="rounded-full border border-border px-2 py-0.5 text-xs hover:border-accent"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                <label className="flex items-center justify-between text-xs">
                  Date
                  <input
                    type="date"
                    value={dateStr}
                    aria-label="Due date"
                    onChange={(e) => applyCustomDue(e.target.value, timeStr)}
                    className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs outline-none focus:border-accent"
                  />
                </label>
                <label className="flex items-center justify-between text-xs">
                  Time
                  <input
                    type="time"
                    value={timeStr}
                    aria-label="Due time"
                    onChange={(e) => applyCustomDue(dateStr, e.target.value)}
                    className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs outline-none focus:border-accent"
                  />
                </label>
              </div>
              {dueOverride && (
                <button
                  type="button"
                  onClick={() => {
                    setDueOverride(null);
                    setDateStr("");
                    setTimeStr("");
                  }}
                  className="mt-2 w-full rounded-md py-1 text-xs text-text-muted hover:bg-bg"
                >
                  Clear
                </button>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

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
                  </DropdownMenu.CheckboxItem>
                );
              })}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        {parsed.remind && (
          <span className="flex items-center gap-1 text-xs text-[#4f7d76]">
            <Bell size={11} strokeWidth={1.75} /> Reminder set
          </span>
        )}
      </div>
    </div>
  );
}
