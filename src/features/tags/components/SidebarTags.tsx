import { useUiStore } from "../../../lib/uiStore";
import { useTags } from "../hooks/useTags";

/** Sidebar tag list: click a tag to see every task carrying it. */
export function SidebarTags() {
  const { data: tags } = useTags();
  const { view, setView } = useUiStore();

  if (!tags || tags.length === 0) return null;

  return (
    <div className="mt-4">
      <h2 className="px-2 text-xs font-medium uppercase tracking-wide text-text-muted">Tags</h2>
      <ul>
        {tags.map((tag) => {
          const active = view.kind === "tag" && view.tagId === tag.id;
          return (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => setView({ kind: "tag", tagId: tag.id })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg ${
                  active ? "bg-bg font-medium text-accent" : ""
                }`}
              >
                <span className="text-xs" style={{ color: tag.color ?? "var(--color-text-muted)" }}>
                  #
                </span>
                <span className="truncate">{tag.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
