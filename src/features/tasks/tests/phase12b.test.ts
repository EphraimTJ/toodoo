import { describe, expect, it } from "vitest";
import { api } from "../../../lib/api";

const INBOX = "inbox";

describe("browser stub — 12B task/tag/comment ops", () => {
  it("marks a task Won't Do and lists it in the wontDo smart view", async () => {
    const t = await api.createTask({ projectId: INBOX, title: `wd ${Date.now()}` });
    await api.setWontDo(t.id);
    expect((await api.getTask(t.id)).status).toBe("WONT_DO");
    const list = await api.listSmart("wontDo");
    expect(list.some((x) => x.id === t.id)).toBe(true);
    // Not in All (active) anymore.
    expect((await api.listSmart("all")).some((x) => x.id === t.id)).toBe(false);
  });

  it("duplicates a task with its check items", async () => {
    const t = await api.createTask({ projectId: INBOX, title: `dup ${Date.now()}` });
    await api.addCheckItem(t.id, "step one");
    const copy = await api.duplicateTask(t.id);
    expect(copy.id).not.toBe(t.id);
    expect(copy.title).toMatch(/\(copy\)$/);
    expect((await api.listCheckItems(copy.id)).map((c) => c.title)).toEqual(["step one"]);
  });

  it("converts a subtask to a check item (lossy) and back", async () => {
    const parent = await api.createTask({ projectId: INBOX, title: `p ${Date.now()}` });
    const sub = await api.createTask({ projectId: INBOX, parentId: parent.id, title: "child" });
    const item = await api.subtaskToCheckItem(sub.id);
    expect(item.title).toBe("child");
    expect((await api.getTask(sub.id)).status).toBe("TRASHED");

    const promoted = await api.checkItemToSubtask(item.id);
    expect(promoted.parentId).toBe(parent.id);
    expect(promoted.title).toBe("child");
  });

  it("merges tags, moving assignments and dropping the source", async () => {
    const task = await api.createTask({ projectId: INBOX, title: `tg ${Date.now()}` });
    const src = await api.createTag(`src${Date.now()}`);
    const dst = await api.createTag(`dst${Date.now()}`);
    await api.assignTag(task.id, src.id);
    await api.mergeTags(src.id, dst.id);
    expect((await api.getTask(task.id)).tagIds).toEqual([dst.id]);
    expect((await api.listTags()).some((t) => t.id === src.id)).toBe(false);
  });

  it("adds and lists comments oldest-first", async () => {
    const task = await api.createTask({ projectId: INBOX, title: `c ${Date.now()}` });
    await api.addComment(task.id, "first");
    await api.addComment(task.id, "second");
    expect((await api.listComments(task.id)).map((c) => c.body)).toEqual(["first", "second"]);
  });

  it("saves a task as a template", async () => {
    const task = await api.createTask({ projectId: INBOX, title: `Ritual ${Date.now()}` });
    const tpl = await api.saveTaskAsTemplate(task.id, "Morning ritual");
    expect(tpl.name).toBe("Morning ritual");
    expect((await api.listTemplates()).some((t) => t.id === tpl.id)).toBe(true);
  });
});
