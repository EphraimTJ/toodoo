import { ChevronDown, ChevronUp } from "lucide-react";
import { useSmartLists } from "../../tasks/hooks/useSmartLists";

const LABELS: Record<string, string> = {
  today: "Today",
  tomorrow: "Tomorrow",
  next7Days: "Next 7 Days",
  all: "All",
  completed: "Completed",
  wontDo: "Won't Do",
  trash: "Trash",
};

/** Show/hide and reorder the sidebar's smart lists. */
export function SmartListSettings() {
  const { items, toggle, move } = useSmartLists();
  return (
    <ul className="space-y-1 text-sm" data-testid="smartlist-settings">
      {items.map((item, i) => (
        <li key={item.view} className="flex items-center gap-2 rounded border border-border px-2 py-1">
          <label className="flex flex-1 items-center gap-2">
            <input
              type="checkbox"
              aria-label={`Show ${LABELS[item.view]}`}
              checked={item.visible}
              onChange={() => toggle(item.view)}
            />
            {LABELS[item.view]}
          </label>
          <button
            type="button"
            aria-label={`Move ${LABELS[item.view]} up`}
            disabled={i === 0}
            className="flex items-center rounded border border-border px-1.5 py-1 disabled:opacity-30"
            onClick={() => move(item.view, -1)}
          >
            <ChevronUp size={13} strokeWidth={2} />
          </button>
          <button
            type="button"
            aria-label={`Move ${LABELS[item.view]} down`}
            disabled={i === items.length - 1}
            className="flex items-center rounded border border-border px-1.5 py-1 disabled:opacity-30"
            onClick={() => move(item.view, 1)}
          >
            <ChevronDown size={13} strokeWidth={2} />
          </button>
        </li>
      ))}
    </ul>
  );
}
