import { invoke } from "@tauri-apps/api/core";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type TaskStatus = "ACTIVE" | "COMPLETED" | "WONT_DO" | "TRASHED";
export type Priority = 0 | 1 | 3 | 5;
export type SmartView = "today" | "tomorrow" | "next7Days" | "all" | "completed" | "trash";

export interface Project {
  id: string;
  folderId: string | null;
  name: string;
  color: string | null;
  icon: string | null;
  kind: "TASK" | "NOTE";
  viewMode: "LIST" | "KANBAN" | "TIMELINE";
  muted: boolean;
  sortOrder: number;
  closed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  sectionId: string | null;
  parentId: string | null;
  title: string;
  contentRich: string | null;
  contentPlain: string | null;
  kind: "TASK" | "CHECKLIST" | "NOTE";
  status: TaskStatus;
  priority: number;
  startAt: string | null;
  dueAt: string | null;
  isAllDay: boolean;
  durationMin: number | null;
  pinned: boolean;
  sortOrder: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
}

export interface CheckItem {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  sortOrder: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  parentId: string | null;
  sortOrder: number;
}

export interface SmartCounts {
  today: number;
  tomorrow: number;
  next7: number;
  inbox: number;
}

export interface NewProject {
  name: string;
  color?: string;
  icon?: string;
  kind?: "TASK" | "NOTE";
}

export interface ProjectPatch {
  name?: string;
  color?: string | null;
  icon?: string | null;
  folderId?: string | null;
  viewMode?: "LIST" | "KANBAN" | "TIMELINE";
}

export interface FolderPatch {
  name?: string;
  color?: string | null;
  sortOrder?: number;
}

export interface NewTask {
  projectId: string;
  parentId?: string;
  title: string;
  priority?: Priority;
  startAt?: string;
  dueAt?: string;
  isAllDay?: boolean;
}

export interface TaskPatch {
  title?: string;
  contentRich?: string | null;
  contentPlain?: string | null;
  priority?: Priority;
  startAt?: string | null;
  dueAt?: string | null;
  isAllDay?: boolean;
  sectionId?: string | null;
}

export const INBOX_ID = "inbox";

/** Local date (YYYY-MM-DD) and UTC offset the backend needs for smart views. */
export function localDateParams(now = new Date()): { today: string; tzOffsetMin: number } {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return { today: `${y}-${m}-${d}`, tzOffsetMin: -now.getTimezoneOffset() };
}

export interface Api {
  listProjects(): Promise<Project[]>;
  createProject(input: NewProject): Promise<Project>;
  updateProject(id: string, patch: ProjectPatch): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  reorderProject(id: string, afterId: string | null): Promise<void>;

  listFolders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  updateFolder(id: string, patch: FolderPatch): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;

  createTask(input: NewTask): Promise<Task>;
  getTask(id: string): Promise<Task>;
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  completeTask(id: string): Promise<string[]>;
  reopenTask(id: string): Promise<void>;
  trashTask(id: string): Promise<string[]>;
  restoreTask(id: string): Promise<Task>;
  deleteTaskForever(id: string): Promise<void>;
  moveTask(id: string, projectId: string): Promise<void>;
  reorderTask(id: string, afterId: string | null): Promise<void>;
  listProjectTasks(projectId: string): Promise<Task[]>;
  listTagTasks(tagId: string): Promise<Task[]>;
  listSmart(view: SmartView): Promise<Task[]>;
  smartCounts(): Promise<SmartCounts>;
  searchTasks(query: string): Promise<Task[]>;

  listCheckItems(taskId: string): Promise<CheckItem[]>;
  addCheckItem(taskId: string, title: string): Promise<CheckItem>;
  setCheckItem(id: string, patch: { title?: string; done?: boolean }): Promise<void>;
  deleteCheckItem(id: string): Promise<void>;

  listTags(): Promise<Tag[]>;
  createTag(name: string, color?: string): Promise<Tag>;
  updateTag(id: string, patch: { name?: string; color?: string | null }): Promise<void>;
  deleteTag(id: string): Promise<void>;
  assignTag(taskId: string, tagId: string): Promise<void>;
  unassignTag(taskId: string, tagId: string): Promise<void>;

  getSetting(key: string): Promise<JsonValue | null>;
  setSetting(key: string, value: JsonValue): Promise<void>;
  seedDemoData(tasks: number): Promise<void>;
}

const tauriApi: Api = {
  listProjects: () => invoke("list_projects"),
  createProject: (input) => invoke("create_project", { input }),
  updateProject: (id, patch) => invoke("update_project", { id, patch }),
  deleteProject: (id) => invoke("delete_project", { id }),
  reorderProject: (id, afterId) => invoke("reorder_project", { id, afterId }),

  listFolders: () => invoke("list_folders"),
  createFolder: (name) => invoke("create_folder", { name }),
  updateFolder: (id, patch) => invoke("update_folder", { id, patch }),
  deleteFolder: (id) => invoke("delete_folder", { id }),

  createTask: (input) => invoke("create_task", { input }),
  getTask: (id) => invoke("get_task", { id }),
  updateTask: (id, patch) => invoke("update_task", { id, patch }),
  completeTask: (id) => invoke("complete_task", { id }),
  reopenTask: (id) => invoke("reopen_task", { id }),
  trashTask: (id) => invoke("trash_task", { id }),
  restoreTask: (id) => invoke("restore_task", { id }),
  deleteTaskForever: (id) => invoke("delete_task_forever", { id }),
  moveTask: (id, projectId) => invoke("move_task", { id, projectId }),
  reorderTask: (id, afterId) => invoke("reorder_task", { id, afterId }),
  listProjectTasks: (projectId) => invoke("list_project_tasks", { projectId }),
  listTagTasks: (tagId) => invoke("list_tag_tasks", { tagId }),
  listSmart: (view) => invoke("list_smart", { view, ...localDateParams() }),
  smartCounts: () => invoke("smart_counts", localDateParams()),
  searchTasks: (query) => invoke("search_tasks", { query }),

  listCheckItems: (taskId) => invoke("list_check_items", { taskId }),
  addCheckItem: (taskId, title) => invoke("add_check_item", { taskId, title }),
  setCheckItem: (id, patch) => invoke("set_check_item", { id, ...patch }),
  deleteCheckItem: (id) => invoke("delete_check_item", { id }),

  listTags: () => invoke("list_tags"),
  createTag: (name, color) => invoke("create_tag", { name, color }),
  updateTag: (id, patch) => invoke("update_tag", { id, ...patch }),
  deleteTag: (id) => invoke("delete_tag", { id }),
  assignTag: (taskId, tagId) => invoke("assign_tag", { taskId, tagId }),
  unassignTag: (taskId, tagId) => invoke("unassign_tag", { taskId, tagId }),

  getSetting: (key) => invoke("get_setting", { key }),
  setSetting: (key, value) => invoke("set_setting", { key, value }),
  seedDemoData: (tasks) => invoke("seed_demo_data", { tasks }),
};

/* ------------------------------------------------------------------------- *
 * In-memory stub for plain-browser contexts (vite dev without Tauri, and
 * Playwright — see docs/decisions.md). Mirrors backend semantics closely
 * enough for UI flows; the Rust repository layer remains the only real store.
 * ------------------------------------------------------------------------- */

function browserStubApi(): Api {
  const settings = new Map<string, JsonValue>();
  const folders: Folder[] = [];
  const projects: Project[] = [];
  const tasks: Task[] = [];
  const checkItems: CheckItem[] = [];
  const tags: Tag[] = [];
  const nowIso = () => new Date().toISOString();
  const uid = () => crypto.randomUUID();
  // Return copies, never live references: the real backend serializes fresh
  // JSON per call, and react-query's structural sharing relies on that to
  // detect changes (in-place mutations would otherwise be invisible).
  const clone = <T>(value: T): T => structuredClone(value);

  const makeProject = (input: NewProject): Project => ({
    id: input.name === "Inbox" ? INBOX_ID : uid(),
    folderId: null,
    name: input.name,
    color: input.color ?? null,
    icon: input.icon ?? null,
    kind: input.kind ?? "TASK",
    viewMode: "LIST",
    muted: false,
    sortOrder: projects.length,
    closed: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  projects.push(makeProject({ name: "Inbox" }));

  const liveTask = (t: Task) => t.status !== "TRASHED";
  const findTask = (id: string) => {
    const t = tasks.find((x) => x.id === id);
    if (!t) throw new Error(`not found: task ${id}`);
    return t;
  };
  const descendants = (id: string): Task[] => {
    const kids = tasks.filter((t) => t.parentId === id);
    return [...kids, ...kids.flatMap((k) => descendants(k.id))];
  };
  const localDay = (iso: string, allDay: boolean) => {
    if (allDay) return iso.slice(0, 10);
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const effDate = (t: Task) => {
    const base = t.dueAt ?? t.startAt;
    return base ? localDay(base, t.isAllDay) : null;
  };
  const shiftDay = (today: string, days: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() + days);
    return localDay(d.toISOString(), false);
  };

  return {
    listProjects: async () => clone(projects.filter((p) => !p.closed)),
    createProject: async (input) => {
      const p = makeProject(input);
      projects.push(p);
      return clone(p);
    },
    updateProject: async (id, patch) => {
      const p = projects.find((x) => x.id === id);
      if (!p) throw new Error(`not found: project ${id}`);
      if (id === INBOX_ID && (patch.name !== undefined || patch.folderId !== undefined))
        throw new Error("invalid operation: the Inbox cannot be renamed or moved");
      Object.assign(p, {
        name: patch.name ?? p.name,
        color: patch.color === undefined ? p.color : patch.color,
        icon: patch.icon === undefined ? p.icon : patch.icon,
        folderId: patch.folderId === undefined ? p.folderId : patch.folderId,
        viewMode: patch.viewMode ?? p.viewMode,
        updatedAt: nowIso(),
      });
      return clone(p);
    },
    deleteProject: async (id) => {
      if (id === INBOX_ID) throw new Error("invalid operation: the Inbox cannot be deleted");
      const i = projects.findIndex((p) => p.id === id);
      if (i < 0) throw new Error(`not found: project ${id}`);
      projects.splice(i, 1);
      for (const t of tasks) if (t.projectId === id && liveTask(t)) t.status = "TRASHED";
    },
    reorderProject: async (id, afterId) => {
      const i = projects.findIndex((p) => p.id === id);
      const [moved] = projects.splice(i, 1);
      const at = afterId === null ? 0 : projects.findIndex((p) => p.id === afterId) + 1;
      projects.splice(at, 0, moved);
      projects.forEach((p, idx) => (p.sortOrder = idx));
    },

    listFolders: async () => clone(folders),
    createFolder: async (name) => {
      const f: Folder = {
        id: uid(),
        name,
        color: null,
        sortOrder: folders.length,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      folders.push(f);
      return clone(f);
    },
    updateFolder: async (id, patch) => {
      const f = folders.find((x) => x.id === id);
      if (!f) throw new Error(`not found: folder ${id}`);
      Object.assign(f, {
        name: patch.name ?? f.name,
        color: patch.color === undefined ? f.color : patch.color,
        sortOrder: patch.sortOrder ?? f.sortOrder,
        updatedAt: nowIso(),
      });
      return clone(f);
    },
    deleteFolder: async (id) => {
      const i = folders.findIndex((f) => f.id === id);
      if (i < 0) throw new Error(`not found: folder ${id}`);
      folders.splice(i, 1);
      for (const p of projects) if (p.folderId === id) p.folderId = null;
    },

    createTask: async (input) => {
      const t: Task = {
        id: uid(),
        projectId: input.projectId,
        sectionId: null,
        parentId: input.parentId ?? null,
        title: input.title,
        contentRich: null,
        contentPlain: null,
        kind: "TASK",
        status: "ACTIVE",
        priority: input.priority ?? 0,
        startAt: input.startAt ?? null,
        dueAt: input.dueAt ?? null,
        isAllDay: input.isAllDay ?? true,
        durationMin: null,
        pinned: false,
        sortOrder: (tasks.length + 1) * 1024,
        completedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        tagIds: [],
      };
      tasks.push(t);
      return clone(t);
    },
    getTask: async (id) => clone(findTask(id)),
    updateTask: async (id, patch) => {
      const t = findTask(id);
      Object.assign(t, {
        title: patch.title ?? t.title,
        contentRich: patch.contentRich === undefined ? t.contentRich : patch.contentRich,
        contentPlain: patch.contentPlain === undefined ? t.contentPlain : patch.contentPlain,
        priority: patch.priority ?? t.priority,
        startAt: patch.startAt === undefined ? t.startAt : patch.startAt,
        dueAt: patch.dueAt === undefined ? t.dueAt : patch.dueAt,
        isAllDay: patch.isAllDay ?? t.isAllDay,
        sectionId: patch.sectionId === undefined ? t.sectionId : patch.sectionId,
        updatedAt: nowIso(),
      });
      return clone(t);
    },
    completeTask: async (id) => {
      const targets = [findTask(id), ...descendants(id)].filter((t) => t.status === "ACTIVE");
      for (const t of targets) {
        t.status = "COMPLETED";
        t.completedAt = nowIso();
      }
      return targets.map((t) => t.id);
    },
    reopenTask: async (id) => {
      const t = findTask(id);
      t.status = "ACTIVE";
      t.completedAt = null;
    },
    trashTask: async (id) => {
      const targets = [findTask(id), ...descendants(id)].filter(liveTask);
      for (const t of targets) t.status = "TRASHED";
      return targets.map((t) => t.id);
    },
    restoreTask: async (id) => {
      const t = findTask(id);
      t.status = "ACTIVE";
      t.completedAt = null;
      if (!projects.some((p) => p.id === t.projectId)) t.projectId = INBOX_ID;
      return clone(t);
    },
    deleteTaskForever: async (id) => {
      const doomed = new Set([id, ...descendants(id).map((t) => t.id)]);
      for (let i = tasks.length - 1; i >= 0; i--) if (doomed.has(tasks[i].id)) tasks.splice(i, 1);
    },
    moveTask: async (id, projectId) => {
      for (const t of [findTask(id), ...descendants(id)]) {
        t.projectId = projectId;
        t.sectionId = null;
      }
    },
    reorderTask: async (id, afterId) => {
      const t = findTask(id);
      const siblings = tasks
        .filter((x) => x.projectId === t.projectId && liveTask(x) && x.id !== id)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      const at = afterId === null ? 0 : siblings.findIndex((x) => x.id === afterId) + 1;
      siblings.splice(at, 0, t);
      siblings.forEach((x, idx) => (x.sortOrder = (idx + 1) * 1024));
    },
    listProjectTasks: async (projectId) =>
      clone(
        tasks
          .filter((t) => t.projectId === projectId && liveTask(t))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      ),
    listTagTasks: async (tagId) =>
      clone(tasks.filter((t) => liveTask(t) && t.tagIds.includes(tagId))),
    listSmart: async (view) => {
      const { today } = localDateParams();
      const active = tasks.filter((t) => t.status === "ACTIVE");
      switch (view) {
        case "today":
          return clone(active.filter((t) => (effDate(t) ?? "9999") <= today));
        case "tomorrow":
          return clone(active.filter((t) => effDate(t) === shiftDay(today, 1)));
        case "next7Days":
          return clone(active.filter((t) => (effDate(t) ?? "9999") <= shiftDay(today, 6)));
        case "all":
          return clone(active);
        case "completed":
          return clone(
            tasks
              .filter((t) => t.status === "COMPLETED")
              .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
          );
        case "trash":
          return clone(tasks.filter((t) => t.status === "TRASHED"));
      }
    },
    smartCounts: async () => {
      const { today } = localDateParams();
      const active = tasks.filter((t) => t.status === "ACTIVE");
      return {
        today: active.filter((t) => (effDate(t) ?? "9999") <= today).length,
        tomorrow: active.filter((t) => effDate(t) === shiftDay(today, 1)).length,
        next7: active.filter((t) => (effDate(t) ?? "9999") <= shiftDay(today, 6)).length,
        inbox: active.filter((t) => t.projectId === INBOX_ID).length,
      };
    },
    searchTasks: async (query) => {
      const q = query.trim().toLowerCase();
      if (!q) return [];
      const itemHits = new Set(
        checkItems.filter((c) => c.title.toLowerCase().includes(q)).map((c) => c.taskId),
      );
      return clone(
        tasks.filter(
          (t) =>
            liveTask(t) &&
            (t.title.toLowerCase().includes(q) ||
              (t.contentPlain ?? "").toLowerCase().includes(q) ||
              itemHits.has(t.id)),
        ),
      );
    },

    listCheckItems: async (taskId) =>
      clone(
        checkItems.filter((c) => c.taskId === taskId).sort((a, b) => a.sortOrder - b.sortOrder),
      ),
    addCheckItem: async (taskId, title) => {
      const item: CheckItem = {
        id: uid(),
        taskId,
        title,
        done: false,
        sortOrder: checkItems.length,
      };
      checkItems.push(item);
      return clone(item);
    },
    setCheckItem: async (id, patch) => {
      const item = checkItems.find((c) => c.id === id);
      if (!item) throw new Error(`not found: check item ${id}`);
      if (patch.title !== undefined) item.title = patch.title;
      if (patch.done !== undefined) item.done = patch.done;
    },
    deleteCheckItem: async (id) => {
      const i = checkItems.findIndex((c) => c.id === id);
      if (i >= 0) checkItems.splice(i, 1);
    },

    listTags: async () => clone(tags),
    createTag: async (name, color) => {
      if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase()))
        throw new Error(`invalid operation: tag "${name}" already exists`);
      const tag: Tag = {
        id: uid(),
        name,
        color: color ?? null,
        parentId: null,
        sortOrder: tags.length,
      };
      tags.push(tag);
      return clone(tag);
    },
    updateTag: async (id, patch) => {
      const tag = tags.find((t) => t.id === id);
      if (!tag) throw new Error(`not found: tag ${id}`);
      if (patch.name !== undefined) tag.name = patch.name;
      if (patch.color !== undefined) tag.color = patch.color;
    },
    deleteTag: async (id) => {
      const i = tags.findIndex((t) => t.id === id);
      if (i < 0) throw new Error(`not found: tag ${id}`);
      tags.splice(i, 1);
      for (const t of tasks) t.tagIds = t.tagIds.filter((x) => x !== id);
    },
    assignTag: async (taskId, tagId) => {
      const t = findTask(taskId);
      if (!t.tagIds.includes(tagId)) t.tagIds.push(tagId);
    },
    unassignTag: async (taskId, tagId) => {
      const t = findTask(taskId);
      t.tagIds = t.tagIds.filter((x) => x !== tagId);
    },

    getSetting: async (key) => clone(settings.get(key) ?? null),
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
    seedDemoData: async () => {},
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Api = isTauri ? tauriApi : browserStubApi();
