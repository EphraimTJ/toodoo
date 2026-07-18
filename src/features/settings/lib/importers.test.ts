import { describe, expect, it } from "vitest";
import { parseGenericCsv, parseTicktickCsv, parseTodoistCsv } from "./importers";

// Mirrors the Rust `repo::importers` tests so the two parsers can't drift.

describe("parseTicktickCsv", () => {
  it("handles the metadata preamble, quoted commas, dates and completed status", () => {
    const csv =
      '"Date: 2024-01-01"\n"Version: 7.1"\n\n' +
      '"Folder Name","List Name","Title","Tags","Content","Priority","Status","Due Date","Start Date"\n' +
      '"","Work","Ship v1, then celebrate","urgent,release","Notes here","5","0","2024-03-10T09:00:00+0000",""\n' +
      '"","Personal","Buy milk","","","0","2","2024-03-11",""\n';
    const rows = parseTicktickCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      list: "Work",
      title: "Ship v1, then celebrate",
      content: "Notes here",
      priority: 5,
      dueAt: "2024-03-10T09:00:00+0000",
      completed: false,
      tags: ["urgent", "release"],
    });
    expect(rows[1]).toMatchObject({
      title: "Buy milk",
      priority: 0,
      dueAt: "2024-03-11T00:00:00.000Z",
      completed: true,
    });
  });
});

describe("parseTodoistCsv", () => {
  it("maps priority and skips sections", () => {
    const csv =
      "TYPE,CONTENT,DESCRIPTION,PRIORITY,DATE\n" +
      "task,Write report,Some notes,4,2024-03-10\n" +
      "section,My Section,,,\n" +
      "task,Low prio thing,,2,\n";
    const rows = parseTodoistCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Write report",
      content: "Some notes",
      priority: 5,
      dueAt: "2024-03-10T00:00:00.000Z",
    });
    expect(rows[1]).toMatchObject({ priority: 1, list: "" });
  });
});

describe("parseGenericCsv", () => {
  it("maps priorities and completion", () => {
    const csv =
      "title,list,priority,due,notes,completed\n" +
      '"Task A","Groceries","high","2024-03-12","Milk","false"\n' +
      '"Task B","","low","","","true"\n';
    const rows = parseGenericCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ list: "Groceries", priority: 5, content: "Milk", completed: false });
    expect(rows[1]).toMatchObject({ list: "", priority: 1, completed: true });
  });

  it("keeps a quoted embedded newline as one field", () => {
    const rows = parseGenericCsv('title,list\n"Line one\nline two",Work\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Line one\nline two");
    expect(rows[0].list).toBe("Work");
  });

  it("skips blank and title-less rows", () => {
    const rows = parseGenericCsv('title,list\n,Work\n"Real",Home\n');
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Real");
  });
});
