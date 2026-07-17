import { create } from "zustand";
import type { SmartView } from "./api";

export type ViewSelection =
  | { kind: "project"; projectId: string }
  | { kind: "smart"; view: SmartView }
  | { kind: "tag"; tagId: string }
  | { kind: "filter"; filterId: string }
  | { kind: "matrix" }
  | { kind: "calendar" }
  | { kind: "focus" }
  | { kind: "habits" }
  | { kind: "countdown" }
  | { kind: "sticky" }
  | { kind: "stats" }
  | { kind: "search" };

export function viewKey(view: ViewSelection): string {
  switch (view.kind) {
    case "project":
      return `project:${view.projectId}`;
    case "smart":
      return `smart:${view.view}`;
    case "tag":
      return `tag:${view.tagId}`;
    case "filter":
      return `filter:${view.filterId}`;
    case "matrix":
      return "matrix";
    case "calendar":
      return "calendar";
    case "focus":
      return "focus";
    case "habits":
      return "habits";
    case "countdown":
      return "countdown";
    case "sticky":
      return "sticky";
    case "stats":
      return "stats";
    case "search":
      return "search";
  }
}

interface UiState {
  view: ViewSelection;
  selectedTaskId: string | null;
  multiSelect: ReadonlySet<string>;
  paletteOpen: boolean;
  focusTaskId: string | null;
  /** Query to seed the Search view when it opens (consumed on mount). */
  searchSeed: string;
  shortcutsOpen: boolean;

  setView(view: ViewSelection): void;
  selectTask(id: string | null): void;
  toggleMultiSelect(id: string): void;
  clearMultiSelect(): void;
  setPaletteOpen(open: boolean): void;
  openFocus(taskId?: string | null): void;
  openSearch(query?: string): void;
  setShortcutsOpen(open: boolean): void;
}

export const useUiStore = create<UiState>((set) => ({
  view: { kind: "project", projectId: "inbox" },
  selectedTaskId: null,
  multiSelect: new Set<string>(),
  paletteOpen: false,
  focusTaskId: null,
  searchSeed: "",
  shortcutsOpen: false,

  setView: (view) => set({ view, selectedTaskId: null, multiSelect: new Set() }),
  openFocus: (taskId = null) => set({ view: { kind: "focus" }, focusTaskId: taskId }),
  openSearch: (query = "") =>
    set({ view: { kind: "search" }, searchSeed: query, selectedTaskId: null, paletteOpen: false }),
  selectTask: (selectedTaskId) => set({ selectedTaskId }),
  toggleMultiSelect: (id) =>
    set((s) => {
      const next = new Set(s.multiSelect);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { multiSelect: next };
    }),
  clearMultiSelect: () => set({ multiSelect: new Set() }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));
