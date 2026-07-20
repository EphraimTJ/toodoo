import { useRef, useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";

/**
 * In-app themed replacements for the native `window.prompt` / `window.confirm`
 * (which render as an off-theme "tauri.localhost says" OS dialog). Call
 * `promptDialog(...)` / `confirmDialog(...)` from anywhere and `await` the
 * result; a single mounted <AppDialogs/> renders the active request.
 */
interface BaseReq {
  id: number;
  title: string;
  confirmText?: string;
}
interface PromptReq extends BaseReq {
  kind: "prompt";
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: string | null) => void;
}
interface ConfirmReq extends BaseReq {
  kind: "confirm";
  message?: string;
  destructive?: boolean;
  resolve: (value: boolean) => void;
}
type Req = PromptReq | ConfirmReq;

let current: Req | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => current;
const setCurrent = (r: Req | null) => {
  current = r;
  emit();
};

export function promptDialog(
  opts: Omit<PromptReq, "kind" | "resolve" | "id">,
): Promise<string | null> {
  return new Promise((resolve) => setCurrent({ kind: "prompt", id: ++seq, ...opts, resolve }));
}

export function confirmDialog(
  opts: Omit<ConfirmReq, "kind" | "resolve" | "id">,
): Promise<boolean> {
  return new Promise((resolve) => setCurrent({ kind: "confirm", id: ++seq, ...opts, resolve }));
}

const primaryBtn =
  "rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-fg transition hover:opacity-90 active:scale-95";
const destructiveBtn =
  "rounded-full bg-destructive px-4 py-1.5 text-sm font-semibold text-destructive-fg transition hover:opacity-90 active:scale-95";
const cancelBtn =
  "rounded-full border border-border px-4 py-1.5 text-sm text-text-muted transition hover:bg-muted hover:text-text";

/** Single host; mount once near the app root. */
export function AppDialogs() {
  const req = useSyncExternalStore(subscribe, snapshot, snapshot);
  const inputRef = useRef<HTMLInputElement>(null);

  const finish = (result: string | null | boolean) => {
    if (!req) return;
    (req.resolve as (v: string | null | boolean) => void)(result);
    setCurrent(null);
  };

  const dismissValue = req?.kind === "confirm" ? false : null;

  return (
    <Dialog.Root open={req !== null} onOpenChange={(o) => !o && finish(dismissValue)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[60] w-[26rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-border/70 bg-surface p-6 shadow-float"
        >
          {req && (
            <div key={req.id}>
              <Dialog.Title className="font-display text-lg font-semibold">{req.title}</Dialog.Title>

              {req.kind === "prompt" ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    finish(inputRef.current?.value ?? "");
                  }}
                >
                  {req.label && (
                    <label className="mt-3 block text-xs font-medium text-text-muted">{req.label}</label>
                  )}
                  <input
                    ref={inputRef}
                    autoFocus
                    defaultValue={req.defaultValue}
                    placeholder={req.placeholder}
                    className="mt-1.5 w-full rounded-full border border-border bg-bg px-4 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                  />
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className={cancelBtn} onClick={() => finish(null)}>
                      Cancel
                    </button>
                    <button type="submit" className={primaryBtn}>
                      {req.confirmText ?? "Save"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  {req.message && <p className="mt-3 text-sm text-text-muted">{req.message}</p>}
                  <div className="mt-5 flex justify-end gap-2">
                    <button type="button" className={cancelBtn} onClick={() => finish(false)}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      autoFocus
                      className={req.destructive ? destructiveBtn : primaryBtn}
                      onClick={() => finish(true)}
                    >
                      {req.confirmText ?? "Confirm"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
