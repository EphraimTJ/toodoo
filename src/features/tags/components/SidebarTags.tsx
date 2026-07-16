import { useState } from "react";
import type { Tag } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useTags } from "../hooks/useTags";
import { TagManager } from "./TagManager";

/** Order tags as a parent→child tree (roots first, children indented). */
function treeOrder(tags: Tag[]): { tag: Tag; depth: number }[] {
  const byParent = new Map<string | null, Tag[]>();
  for (const t of tags) {
    const key = t.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  const out: { tag: Tag; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const t of byParent.get(parent) ?? []) {
      out.push({ tag: t, depth });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);
  // Any orphan (parent missing) still shows at root.
  const seen = new Set(out.map((o) => o.tag.id));
  for (const t of tags) if (!seen.has(t.id)) out.push({ tag: t, depth: 0 });
  return out;
}

/** Sidebar tag tree: click a tag to see every task carrying it. */
export function SidebarTags() {
  const { data: tags } = useTags();
  const { view, setView } = useUiStore();
  const [managerOpen, setManagerOpen] = useState(false);

  if (!tags || tags.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-text-muted">Tags</h2>
        <button
          type="button"
          aria-label="Manage tags"
          className="text-xs text-text-muted hover:text-accent"
          onClick={() => setManagerOpen(true)}
        >
          Manage
        </button>
      </div>
      <ul>
        {treeOrder(tags).map(({ tag, depth }) => {
          const active = view.kind === "tag" && view.tagId === tag.id;
          return (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => setView({ kind: "tag", tagId: tag.id })}
                style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
                className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-bg ${
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
      <TagManager open={managerOpen} onOpenChange={setManagerOpen} />
    </div>
  );
}
