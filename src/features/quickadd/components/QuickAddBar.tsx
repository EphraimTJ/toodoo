import { useMemo, useState } from "react";
import { parseQuickAdd, type ParsedToken } from "../lib/parse";
import { useQuickAdd, type QuickAddDefaults } from "../hooks/useQuickAdd";

const CHIP_COLOR: Record<ParsedToken["kind"], string> = {
  tag: "text-purple-500",
  list: "text-blue-500",
  priority: "text-amber-500",
  date: "text-green-600",
  repeat: "text-accent",
};

/** Natural-language add bar: parses tokens live, shows removable chips, and
 *  creates the task through the normal path on Enter. */
export function QuickAddBar({ defaults }: { defaults: QuickAddDefaults }) {
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const submit = useQuickAdd();

  const doSubmit = async () => {
    if (!parsed.title.trim()) return; // a task needs a title
    await submit(parsed, defaults);
    setText("");
  };

  const dismiss = (token: ParsedToken) =>
    setText(text.replace(token.text, "").replace(/\s+/g, " ").trim());

  return (
    <div className="px-4 pb-2 pt-3">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void doSubmit();
        }}
        placeholder="+ Add task — try “Pay rent ~Bills #finance !high every month”"
        aria-label="Add task"
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-text-muted focus:border-accent"
      />
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
              <span className="text-text-muted">✕</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
