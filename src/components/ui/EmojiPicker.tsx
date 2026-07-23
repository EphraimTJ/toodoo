import { useState } from "react";
import { Popover } from "radix-ui";

// Curated categories that cover the common habit/list ground. The free-text
// field above the grid accepts ANY emoji (typed or pasted — Win+. opens the
// system picker), so nothing here is a limit, just a shortcut.
const CATEGORIES: [string, string[]][] = [
  [
    "Habits",
    ["✅","📖","✍️","🧘","🏃","🚶","💪","🏋️","🚴","🏊","🛌","😴","💧","🥤","☕","🍵","🧹","🛒","💼","📚","💻","📝","📅","⏰","🌅","🌙","🎯","🧠","🎧","🎸","🎹","🎨","📷","🌱","🪴","💊","🦷","🧴","💰","📈","🙏","❤️"],
  ],
  [
    "Smileys",
    ["😀","😄","😊","🙂","😌","🤓","😎","🥳","🤗","😇","🙃","😅","🤩","🥰","😋","🤔","😤","😭","🤯","😱"],
  ],
  [
    "Sport",
    ["⚽","🏀","🏈","🎾","🏐","🏓","🏸","⛳","🥊","🥋","🤸","🏄","🚣","🧗","🛹","⛷️","🏂","🎳","🏹","🤿"],
  ],
  [
    "Food",
    ["🍎","🍌","🍇","🍓","🥑","🥦","🥕","🌽","🥗","🍞","🧀","🥚","🍗","🍣","🍜","🍚","🥣","🍪","🍫","🍰","🍩","🍕","🍔","🌮"],
  ],
  [
    "Nature",
    ["🌸","🌼","🌻","🌷","🌹","🍀","🍁","🌲","🌳","🌴","🌵","🐦","🐝","🦋","🐢","🐟","🐶","🐱","🌊","⛰️","🌈","☀️","⛅","🌧️","❄️","⭐","🌟"],
  ],
  [
    "Objects",
    ["📱","⌚","🎮","🎲","🧩","🪥","🧼","🚿","🛁","🚗","🚲","✈️","🏠","🔑","💡","🔋","✂️","📌","🖊️","📔","🎒","👟","👕","🎁"],
  ],
  [
    "Symbols",
    ["❤️","🧡","💛","💚","💙","💜","🖤","💯","✨","🔥","⚡","💫","➕","❗","❓","🔔","🎵","🎶","♻️","🕐"],
  ],
];

/** Emoji picker: a trigger button showing the current emoji, opening a
 *  categorized grid plus a free-text field that accepts any emoji at all. */
export function EmojiPicker({
  value,
  onChange,
  label = "Pick emoji",
}: {
  value: string;
  onChange(v: string): void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const pick = (emoji: string) => {
    onChange(emoji);
    setCustom("");
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex h-9 w-12 shrink-0 items-center justify-center rounded border border-border bg-bg text-lg hover:border-accent"
        >
          {value || "🙂"}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="start"
          className="z-[60] w-72 rounded-xl border border-border bg-surface p-2 shadow-float"
        >
          <div className="mb-2 flex gap-1">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && custom.trim()) pick(custom.trim());
              }}
              placeholder="Type or paste any emoji (Win+.)"
              aria-label="Custom emoji"
              className="min-w-0 flex-1 rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => pick(custom.trim())}
              className="rounded border border-border px-2 py-1 text-xs disabled:opacity-40"
            >
              Use
            </button>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {CATEGORIES.map(([name, list]) => (
              <div key={name}>
                <p className="mb-0.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                  {name}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {list.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      aria-label={`Emoji ${emoji}`}
                      onClick={() => pick(emoji)}
                      className={`flex h-7 w-7 items-center justify-center rounded text-base hover:bg-bg ${
                        value === emoji ? "bg-accent/15 ring-1 ring-accent/40" : ""
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
