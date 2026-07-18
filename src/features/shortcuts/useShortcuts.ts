import { useEffect } from "react";
import { useUiStore } from "../../lib/uiStore";
import { useAppearance } from "../settings/hooks/useAppearance";

/** Global keyboard shortcuts. Ignored while typing in an input/textarea. ⌘K is
 *  owned by the command palette; these are the single-key + `g`-prefix set. */
export function useShortcuts(): void {
  const { toggleMode } = useAppearance();

  useEffect(() => {
    let awaitingG = false;
    let gTimer: ReturnType<typeof setTimeout>;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;

      const { setView, setPaletteOpen, setShortcutsOpen } = useUiStore.getState();

      if (awaitingG) {
        awaitingG = false;
        const k = e.key.toLowerCase();
        if (k === "i") return setView({ kind: "project", projectId: "inbox" });
        if (k === "t") return setView({ kind: "smart", view: "today" });
      }

      switch (e.key) {
        case "?":
          setShortcutsOpen(true);
          break;
        case "n":
        case "N": {
          (document.querySelector('[aria-label="Add task"]') as HTMLElement | null)?.focus();
          e.preventDefault();
          break;
        }
        case "/":
          setPaletteOpen(true);
          e.preventDefault();
          break;
        case "t":
        case "T":
          toggleMode();
          break;
        case "g":
        case "G":
          awaitingG = true;
          clearTimeout(gTimer);
          gTimer = setTimeout(() => (awaitingG = false), 800);
          break;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMode]);
}
