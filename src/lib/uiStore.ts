import { create } from "zustand";
import type { SmartView } from "./api";

export type ViewSelection =
  { kind: "project"; projectId: string } | { kind: "smart"; view: SmartView };

export function viewKey(view: ViewSelection): string {
  return view.kind === "project" ? `project:${view.projectId}` : `smart:${view.view}`;
}

interface UiState {
  view: ViewSelection;
  selectedTaskId: string | null;
  multiSelect: ReadonlySet<string>;
  paletteOpen: boolean;

  setView(view: ViewSelection): void;
  selectTask(id: string | null): void;
  toggleMultiSelect(id: string): void;
  clearMultiSelect(): void;
  setPaletteOpen(open: boolean): void;
}

export const useUiStore = create<UiState>((set) => ({
  view: { kind: "project", projectId: "inbox" },
  selectedTaskId: null,
  multiSelect: new Set<string>(),
  paletteOpen: false,

  setView: (view) => set({ view, selectedTaskId: null, multiSelect: new Set() }),
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
}));
