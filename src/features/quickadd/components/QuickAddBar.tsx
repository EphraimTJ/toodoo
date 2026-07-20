import { useMemo, useState } from "react";
import { parseQuickAdd, type ParsedToken } from "../lib/parse";
import { useQuickAdd, type QuickAddDefaults } from "../hooks/useQuickAdd";

// Live-parse chips, tinted across the earth palette (dusty rose / moss / ochre
// / teal / terracotta) so they read as one natural family.
const CHIP_COLOR: Record<ParsedToken["kind"], string> = {
  tag: "text-[#a8586b]",
  list: "text-accent",
  priority: "text-[#b0763f]",
  date: "text-[#4f7d76]",
  repeat: "text-secondary",
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
        className="w-full rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-soft outline-none transition-all placeholder:text-text-muted focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
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
