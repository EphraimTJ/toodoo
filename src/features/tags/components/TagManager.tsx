import { Dialog } from "radix-ui";
import { useTagMutations, useTags } from "../hooks/useTags";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Rename, re-parent, merge, and delete tags. */
export function TagManager({ open, onOpenChange }: Props) {
  const { data: tags } = useTags();
  const { renameTag, setTagParent, mergeTags, deleteTag } = useTagMutations();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[34rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 shadow-xl"
        >
          <Dialog.Title className="mb-3 text-base font-semibold">Manage tags</Dialog.Title>
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto" data-testid="tag-manager">
            {(tags ?? []).map((tag) => (
              <li key={tag.id} className="flex flex-wrap items-center gap-2 rounded border border-border p-2 text-sm">
                <input
                  aria-label={`Rename ${tag.name}`}
                  defaultValue={tag.name}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== tag.name) renameTag.mutate({ id: tag.id, name });
                  }}
                  className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 outline-none focus:border-accent"
                />
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  Parent
                  <select
                    aria-label={`Parent of ${tag.name}`}
                    value={tag.parentId ?? ""}
                    onChange={(e) => setTagParent.mutate({ id: tag.id, parentId: e.target.value || null })}
                    className="rounded border border-border bg-bg px-1 py-1"
                  >
                    <option value="">(root)</option>
                    {(tags ?? [])
                      .filter((t) => t.id !== tag.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 text-xs text-text-muted">
                  Merge into
                  <select
                    aria-label={`Merge ${tag.name} into`}
                    value=""
                    onChange={(e) => {
                      if (e.target.value) mergeTags.mutate({ src: tag.id, dst: e.target.value });
                    }}
                    className="rounded border border-border bg-bg px-1 py-1"
                  >
                    <option value="">—</option>
                    {(tags ?? [])
                      .filter((t) => t.id !== tag.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label={`Delete ${tag.name}`}
                  className="rounded border border-border px-2 py-1 text-xs text-text-muted hover:text-red-500"
                  onClick={() => deleteTag.mutate(tag.id)}
                >
                  Delete
                </button>
              </li>
            ))}
            {(tags ?? []).length === 0 && <li className="text-sm text-text-muted">No tags yet.</li>}
          </ul>
          <div className="mt-3 flex justify-end">
            <Dialog.Close asChild>
              <button type="button" className="rounded-md border border-border px-3 py-1 text-sm hover:bg-bg">
                Done
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
