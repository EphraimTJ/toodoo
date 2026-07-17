import { describe, expect, it } from "vitest";
import i18n from "./index";

describe("i18n scaffolding", () => {
  it("resolves English strings", () => {
    expect(i18n.t("app.inbox")).toBe("Inbox");
    expect(i18n.t("smart.wontDo")).toBe("Won't Do");
    expect(i18n.t("settings.appearance")).toBe("Appearance");
  });

  it("handles pluralization", () => {
    expect(i18n.t("tasks.count", { count: 1 })).toBe("1 task");
    expect(i18n.t("tasks.count", { count: 3 })).toBe("3 tasks");
  });

  it("returns the key (not null) for a missing string", () => {
    expect(i18n.t("does.not.exist")).toBe("does.not.exist");
  });
});
