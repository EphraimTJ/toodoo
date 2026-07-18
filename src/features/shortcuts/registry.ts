/** The in-app shortcut map, shown in the `?` cheatsheet and wired by useShortcuts. */
export interface Shortcut {
  keys: string;
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: "N", label: "New task (focus the add bar)" },
  { keys: "⌘/Ctrl + K", label: "Command palette" },
  { keys: "/", label: "Command palette" },
  { keys: "T", label: "Toggle light / dark" },
  { keys: "G then I", label: "Go to Inbox" },
  { keys: "G then T", label: "Go to Today" },
  { keys: "?", label: "Show keyboard shortcuts" },
  { keys: "Esc", label: "Close dialog / clear selection" },
];
