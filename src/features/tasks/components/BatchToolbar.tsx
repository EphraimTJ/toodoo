import { DropdownMenu } from "radix-ui";
import { localDateParams, type Priority } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTags } from "../../tags/hooks/useTags";
import { useBatchMutations } from "../hooks/useTasks";

function MenuButton({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rounded-md px-2.5 py-1 text-xs text-accent-fg hover:bg-white/15"
        >
          {label}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          className="z-50 min-w-40 rounded-md border border-border bg-surface p-1 text-sm shadow-lg"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

const item =
  "flex w-full cursor-pointer select-none rounded px-2 py-1 text-left outline-none hover:bg-bg data-[highlighted]:bg-bg";

export function BatchToolbar() {
  const { multiSelect, clearMultiSelect } = useUiStore();
  const batch = useBatchMutations();
  const { data: projects } = useProjects();
  const { data: tags } = useTags();

  if (multiSelect.size === 0) return null;
  const ids = [...multiSelect];
  const run = (action: Parameters<typeof batch.mutate>[0]["action"]) => {
    batch.mutate({ ids, action });
    clearMultiSelect();
  };
  const { today } = localDateParams();

  return (
    <div
      data-testid="batch-toolbar"
      className="absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 shadow-lg"
    >
      <span className="pr-1 text-xs font-medium text-accent-fg">{multiSelect.size} selected</span>

      <MenuButton label="Move">
        {(projects ?? []).map((p) => (
          <DropdownMenu.Item
            key={p.id}
            className={item}
            onSelect={() => run({ kind: "move", projectId: p.id })}
          >
            {p.name}
          </DropdownMenu.Item>
        ))}
      </MenuButton>

      <MenuButton label="Date">
        <DropdownMenu.Item
          className={item}
          onSelect={() => run({ kind: "due", dueAt: `${today}T00:00:00.000Z` })}
        >
          Today
        </DropdownMenu.Item>
        <DropdownMenu.Item
          className={item}
          onSelect={() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            run({ kind: "due", dueAt: `${localDateParams(d).today}T00:00:00.000Z` });
          }}
        >
          Tomorrow
        </DropdownMenu.Item>
        <DropdownMenu.Item className={item} onSelect={() => run({ kind: "due", dueAt: null })}>
          Clear date
        </DropdownMenu.Item>
      </MenuButton>

      <MenuButton label="Priority">
        {(
          [
            [5, "High"],
            [3, "Medium"],
            [1, "Low"],
            [0, "None"],
          ] as [Priority, string][]
        ).map(([priority, label]) => (
          <DropdownMenu.Item
            key={priority}
            className={item}
            onSelect={() => run({ kind: "priority", priority })}
          >
            {label}
          </DropdownMenu.Item>
        ))}
      </MenuButton>

      {(tags ?? []).length > 0 && (
        <MenuButton label="Tag">
          {(tags ?? []).map((tag) => (
            <DropdownMenu.Item
              key={tag.id}
              className={item}
              onSelect={() => run({ kind: "tag", tagId: tag.id })}
            >
              {tag.name}
            </DropdownMenu.Item>
          ))}
        </MenuButton>
      )}

      <button
        type="button"
        className="rounded-md px-2.5 py-1 text-xs text-accent-fg hover:bg-white/15"
        onClick={() => run({ kind: "trash" })}
      >
        Delete
      </button>
      <button
        type="button"
        aria-label="Clear selection"
        className="rounded-md px-2 py-1 text-xs text-accent-fg/70 hover:bg-white/15"
        onClick={clearMultiSelect}
      >
        ✕
      </button>
    </div>
  );
}
