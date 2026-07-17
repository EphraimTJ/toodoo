import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { ShortcutCheatsheet } from "../components/ShortcutCheatsheet";
import { useUiStore } from "../../../lib/uiStore";
import { SHORTCUTS } from "../registry";

describe("ShortcutCheatsheet", () => {
  it("renders the shortcut registry when opened", () => {
    render(<ShortcutCheatsheet />);
    act(() => useUiStore.getState().setShortcutsOpen(true));

    const sheet = screen.getByTestId("shortcut-cheatsheet");
    expect(sheet.querySelectorAll("li").length).toBe(SHORTCUTS.length);
    expect(sheet).toHaveTextContent("Command palette");
    expect(sheet).toHaveTextContent("Toggle light / dark");

    act(() => useUiStore.getState().setShortcutsOpen(false));
  });
});
