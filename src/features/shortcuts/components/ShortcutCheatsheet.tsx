import { Dialog } from "radix-ui";
import { useUiStore } from "../../../lib/uiStore";
import { SHORTCUTS } from "../registry";

/** The `?` keyboard-shortcut cheatsheet overlay. */
export function ShortcutCheatsheet() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-96 max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-5 shadow-xl"
        >
          <Dialog.Title className="mb-3 text-base font-semibold">Keyboard shortcuts</Dialog.Title>
          <ul className="space-y-1.5 text-sm" data-testid="shortcut-cheatsheet">
            {SHORTCUTS.map((s) => (
              <li key={`${s.keys}-${s.label}`} className="flex items-center justify-between gap-4">
                <span className="text-text-muted">{s.label}</span>
                <kbd className="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-xs">
                  {s.keys}
                </kbd>
              </li>
            ))}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
