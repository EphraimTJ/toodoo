import { describe, expect, it } from "vitest";
import { api } from "../../../lib/api";

const INBOX_ID = "inbox";

describe("browser stub — data export/import/backup", () => {
  it("imports generic CSV, creating lists and tasks", async () => {
    const unique = `Imported ${Date.now()}`;
    const csv = `title,list,priority,completed\n"${unique}","Imported List","high","false"\n`;
    const n = await api.importCsv("generic", csv);
    expect(n).toBe(1);

    const projects = await api.listProjects();
    const list = projects.find((p) => p.name === "Imported List");
    expect(list).toBeTruthy();
    const tasks = await api.listProjectTasks(list!.id);
    expect(tasks.some((t) => t.title === unique && t.priority === 5)).toBe(true);
  });

  it("exports markdown and csv reflecting a task", async () => {
    const unique = `Export me ${Date.now()}`;
    await api.createTask({ projectId: INBOX_ID, title: unique });

    const md = await api.exportMarkdown();
    expect(md).toContain("## Inbox");
    expect(md).toContain(`- [ ] ${unique}`);

    const csv = await api.exportCsv();
    expect(csv.split("\n")[0]).toContain("List Name,Title");
    expect(csv).toContain(unique);

    const json = JSON.parse(await api.exportJson());
    expect(json.app).toBe("toodoo");
    expect(json.tasks.some((t: { title: string }) => t.title === unique)).toBe(true);
  });

  it("creates and lists backups, and updates config", async () => {
    const before = (await api.listBackups()).length;
    const info = await api.createBackup();
    expect(info.name).toMatch(/^toodoo-.*\.db$/);
    expect((await api.listBackups()).length).toBe(before + 1);

    const cfg = await api.setBackupConfig(false, 5);
    expect(cfg.autoEnabled).toBe(false);
    expect(cfg.keep).toBe(5);
  });
});
