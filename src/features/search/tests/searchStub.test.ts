import { describe, expect, it } from "vitest";
import { api } from "../../../lib/api";

const INBOX_ID = "inbox";

describe("browser stub — search", () => {
  it("searches with filters and manages recent + saved", async () => {
    const uniq = `srch${Date.now()}`;
    const active = await api.createTask({ projectId: INBOX_ID, title: `${uniq} active` });
    const done = await api.createTask({ projectId: INBOX_ID, title: `${uniq} done` });
    await api.completeTask(done.id);

    const all = await api.searchAll(uniq, {});
    expect(all.tasks.length).toBe(2);

    const activeOnly = await api.searchAll(uniq, { status: "ACTIVE" });
    expect(activeOnly.tasks.map((t) => t.id)).toEqual([active.id]);

    const recent = await api.addRecentSearch(uniq);
    expect(recent[0]).toBe(uniq);
    expect(await api.recentSearches()).toContain(uniq);

    const saved = await api.createSavedSearch(uniq, JSON.stringify({ status: "ACTIVE" }));
    expect((await api.listSavedSearches()).some((s) => s.id === saved.id)).toBe(true);
    await api.deleteSavedSearch(saved.id);
    expect((await api.listSavedSearches()).some((s) => s.id === saved.id)).toBe(false);
  });

  it("finds tags by name", async () => {
    const uniq = `tagsrch${Date.now()}`;
    const tag = await api.createTag(uniq);
    const res = await api.searchAll(uniq, {});
    expect(res.tags.some((t) => t.id === tag.id)).toBe(true);
  });
});
