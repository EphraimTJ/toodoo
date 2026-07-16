import { describe, expect, it } from "vitest";
import { api } from "../../../lib/api";

describe("browser stub — local API config", () => {
  it("tracks enabled state and mints a fresh token on regenerate", async () => {
    const initial = await api.apiConfig();
    expect(initial.port).toBe(7420);

    const enabled = await api.apiSetEnabled(true);
    expect(enabled.enabled).toBe(true);
    expect((await api.apiConfig()).enabled).toBe(true);

    const fresh = await api.apiRegenerateToken();
    expect(fresh).not.toBe(initial.token);
    expect((await api.apiConfig()).token).toBe(fresh);
  });

  it("builds a toodoo:// task link", async () => {
    expect(await api.copyTaskLink("abc-123")).toBe("toodoo://task/abc-123");
  });
});
