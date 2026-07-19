import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UpdateSettings } from "../components/UpdateSettings";

// In the test (non-Tauri) environment there's no `__TAURI_INTERNALS__`, so the
// updater is inert: the control renders but is disabled and labelled as
// desktop-only, and no plugin import is ever triggered.
describe("UpdateSettings", () => {
  it("renders a disabled check control outside the desktop app", () => {
    render(<UpdateSettings />);

    const button = screen.getByTestId("check-for-updates");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Desktop app only");
    expect(screen.queryByTestId("current-version")).not.toBeInTheDocument();
  });
});
