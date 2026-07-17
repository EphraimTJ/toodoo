import { Switch } from "radix-ui";
import { useAppearance } from "../hooks/useAppearance";

/** Sidebar quick light/dark toggle (full mode/accent/font controls live in
 *  Settings → Appearance). Drives the shared appearance store. */
export function ThemeToggle() {
  const { mode, setMode } = useAppearance();
  const isDark = mode === "dark";

  return (
    <label className="flex items-center gap-2 text-sm text-text-muted">
      <span>{isDark ? "Dark" : "Light"}</span>
      <Switch.Root
        checked={isDark}
        onCheckedChange={(on) => setMode(on ? "dark" : "light")}
        aria-label="Toggle dark mode"
        className="relative h-5 w-9 rounded-full bg-border transition-colors data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[18px]" />
      </Switch.Root>
    </label>
  );
}
