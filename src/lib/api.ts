import { invoke } from "@tauri-apps/api/core";
import { evaluateRule, parseQuery, resolveQuery } from "../features/filters/lib/rule";

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
  timeZone: string | null;
  rrule: string | null;
  repeatFrom: string | null;
  pinned: boolean;
  estPomos: number | null;
  estDurationMin: number | null;
  sortOrder: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tagIds: string[];
}

export type RepeatFrom = "DUE" | "COMPLETION";
export type ReminderKind = "ABS" | "REL";

export interface Reminder {
  id: string;
  taskId: string;
  triggerKind: ReminderKind;
  at: string | null;
  offsetMin: number | null;
  snoozedUntil: string | null;
  lastFiredAt: string | null;
}

export interface ReminderSpec {
  triggerKind: ReminderKind;
  at?: string | null;
  offsetMin?: number | null;
}

export interface ActivityEntry {
  id: string;
  entityKind: string;
  entityId: string;
  action: string;
  payloadJson: string | null;
  at: string;
}

export interface TemplatePayload {
  title: string;
  contentRich?: string | null;
  contentPlain?: string | null;
  priority?: Priority;
  isAllDay?: boolean;
  durationMin?: number | null;
  timeZone?: string | null;
  rrule?: string | null;
  repeatFrom?: RepeatFrom;
  checkItems?: string[];
  reminders?: ReminderSpec[];
}

export interface TaskTemplate {
  id: string;
  name: string;
  payloadJson: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ---- Custom Filters & Eisenhower Matrix rule model (mirrors filter_rule.rs) --

export type RuleMatch = "all" | "any";

export type DueOp =
  | { kind: "overdue" | "today" | "tomorrow" | "next7" | "none" }
  | { kind: "range"; from?: string | null; to?: string | null };

export type Condition =
  | { field: "list"; ids: string[] }
  | { field: "tag"; ids: string[] }
  | { field: "priority"; values: number[] }
  | { field: "due"; op: DueOp }
  | { field: "keyword"; text: string }
  | { field: "kind"; values: string[] }
  | { field: "status"; values: string[] };

export interface Rule {
  match: RuleMatch;
  conditions: Condition[];
}

export interface Section {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
}

export interface Filter {
  id: string;
  name: string;
  ruleJson: string;
  color: string | null;
  sortOrder: number;
}

export interface Quadrant {
  quadrant: number;
  rule: Rule;
}

export interface QuadrantTasks {
  quadrant: number;
  tasks: Task[];
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
  durationMin?: number;
  timeZone?: string;
  rrule?: string;
  repeatFrom?: RepeatFrom;
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
  durationMin?: number | null;
  timeZone?: string | null;
  rrule?: string | null;
  repeatFrom?: RepeatFrom | null;
  estPomos?: number | null;
  estDurationMin?: number | null;
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

  setTaskPinned(id: string, pinned: boolean): Promise<void>;

  listReminders(taskId: string): Promise<Reminder[]>;
  addReminder(
    taskId: string,
    triggerKind: ReminderKind,
    opts?: { at?: string | null; offsetMin?: number | null },
  ): Promise<Reminder>;
  snoozeReminder(id: string, until: string): Promise<void>;
  deleteReminder(id: string): Promise<void>;

  listActivity(entityKind: string, entityId: string): Promise<ActivityEntry[]>;

  listTemplates(): Promise<TaskTemplate[]>;
  createTemplate(name: string, payload: TemplatePayload): Promise<TaskTemplate>;
  updateTemplate(id: string, patch: { name?: string; payload?: TemplatePayload }): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  instantiateTemplate(templateId: string, projectId: string): Promise<Task>;

  listSections(projectId: string): Promise<Section[]>;
  createSection(projectId: string, name: string): Promise<Section>;
  renameSection(id: string, name: string): Promise<void>;
  reorderSection(id: string, afterId: string | null): Promise<void>;
  deleteSection(id: string): Promise<void>;
  moveTaskToSection(taskId: string, sectionId: string | null): Promise<void>;

  listFilters(): Promise<Filter[]>;
  createFilter(name: string, rule: Rule, color?: string | null): Promise<Filter>;
  updateFilter(id: string, patch: { name?: string; rule?: Rule; color?: string }): Promise<void>;
  deleteFilter(id: string): Promise<void>;
  parseFilterQuery(text: string): Promise<Rule>;
  listFilterTasks(id: string): Promise<Task[]>;

  getMatrix(): Promise<Quadrant[]>;
  setQuadrant(quadrant: number, rule: Rule): Promise<void>;
  listMatrix(): Promise<QuadrantTasks[]>;
  assignToQuadrant(taskId: string, quadrant: number): Promise<void>;

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

  setTaskPinned: (id, pinned) => invoke("set_task_pinned", { id, pinned }),

  listReminders: (taskId) => invoke("list_reminders", { taskId }),
  addReminder: (taskId, triggerKind, opts) =>
    invoke("add_reminder", {
      taskId,
      triggerKind,
      at: opts?.at ?? null,
      offsetMin: opts?.offsetMin ?? null,
    }),
  snoozeReminder: (id, until) => invoke("snooze_reminder", { id, until }),
  deleteReminder: (id) => invoke("delete_reminder", { id }),

  listActivity: (entityKind, entityId) => invoke("list_activity", { entityKind, entityId }),

  listTemplates: () => invoke("list_templates"),
  createTemplate: (name, payload) => invoke("create_template", { name, payload }),
  updateTemplate: (id, patch) =>
    invoke("update_template", { id, name: patch.name ?? null, payload: patch.payload ?? null }),
  deleteTemplate: (id) => invoke("delete_template", { id }),
  instantiateTemplate: (templateId, projectId) =>
    invoke("instantiate_template", { templateId, projectId }),

  listSections: (projectId) => invoke("list_sections", { projectId }),
  createSection: (projectId, name) => invoke("create_section", { projectId, name }),
  renameSection: (id, name) => invoke("rename_section", { id, name }),
  reorderSection: (id, afterId) => invoke("reorder_section", { id, afterId }),
  deleteSection: (id) => invoke("delete_section", { id }),
  moveTaskToSection: (taskId, sectionId) => invoke("move_task_to_section", { taskId, sectionId }),

  listFilters: () => invoke("list_filters"),
  createFilter: (name, rule, color) => invoke("create_filter", { name, rule, color: color ?? null }),
  updateFilter: (id, patch) =>
    invoke("update_filter", {
      id,
      name: patch.name ?? null,
      rule: patch.rule ?? null,
      color: patch.color ?? null,
    }),
  deleteFilter: (id) => invoke("delete_filter", { id }),
  parseFilterQuery: (text) => invoke("parse_filter_query", { text }),
  listFilterTasks: (id) => invoke("list_filter_tasks", { id, ...localDateParams() }),

  getMatrix: () => invoke("get_matrix"),
  setQuadrant: (quadrant, rule) => invoke("set_quadrant", { quadrant, rule }),
  listMatrix: () => invoke("list_matrix", localDateParams()),
  assignToQuadrant: (taskId, quadrant) => invoke("assign_to_quadrant", { taskId, quadrant }),

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
  const reminders: Reminder[] = [];
  const activity: ActivityEntry[] = [];
  const templates: TaskTemplate[] = [];
  const sections: Section[] = [];
  const filters: Filter[] = [];
  const matrixConfig = new Map<number, Rule>();
  const nowIso = () => new Date().toISOString();
  const uid = () => crypto.randomUUID();

  const DEFAULT_QUADRANT_PRIORITY = [5, 3, 1, 0];
  const defaultQuadrantRule = (q: number): Rule => ({
    match: "all",
    conditions: [{ field: "priority", values: [DEFAULT_QUADRANT_PRIORITY[q] ?? 0] }],
  });
  const matrixQuadrants = (): Quadrant[] =>
    [0, 1, 2, 3].map((q) => ({ quadrant: q, rule: matrixConfig.get(q) ?? defaultQuadrantRule(q) }));

  const logActivity = (entityId: string, action: string) =>
    activity.unshift({
      id: uid(),
      entityKind: "task",
      entityId,
      action,
      payloadJson: null,
      at: nowIso(),
    });

  // Minimal recurrence advance mirroring the Rust engine's common paths
  // (docs/decisions.md notes the authoritative logic is server-side). Rolls
  // the anchor forward by FREQ/INTERVAL; honors UNTIL. COUNT is enforced only
  // by the backend, so the stub advances indefinitely — adequate for UI dev.
  const advanceIso = (iso: string, rrule: string): string | null => {
    const freq = /FREQ=([A-Z]+)/.exec(rrule)?.[1];
    const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? "1");
    const until = /UNTIL=(\d{8})/.exec(rrule)?.[1];
    const d = new Date(iso);
    switch (freq) {
      case "DAILY":
        d.setDate(d.getDate() + interval);
        break;
      case "WEEKLY":
        d.setDate(d.getDate() + 7 * interval);
        break;
      case "MONTHLY":
        d.setMonth(d.getMonth() + interval);
        break;
      case "YEARLY":
        d.setFullYear(d.getFullYear() + interval);
        break;
      default:
        return null;
    }
    if (until) {
      const bound = new Date(
        `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}T23:59:59Z`,
      );
      if (d.getTime() > bound.getTime()) return null;
    }
    return d.toISOString();
  };
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

  const self: Api = {
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
        durationMin: input.durationMin ?? null,
        timeZone: input.timeZone ?? null,
        rrule: input.rrule ?? null,
        repeatFrom: input.repeatFrom ?? null,
        pinned: false,
        estPomos: null,
        estDurationMin: null,
        sortOrder: (tasks.length + 1) * 1024,
        completedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        tagIds: [],
      };
      tasks.push(t);
      logActivity(t.id, "created");
      return clone(t);
    },
    getTask: async (id) => clone(findTask(id)),
    updateTask: async (id, patch) => {
      const t = findTask(id);
      const keep = <T>(v: T | undefined, cur: T) => (v === undefined ? cur : v);
      Object.assign(t, {
        title: patch.title ?? t.title,
        contentRich: keep(patch.contentRich, t.contentRich),
        contentPlain: keep(patch.contentPlain, t.contentPlain),
        priority: patch.priority ?? t.priority,
        startAt: keep(patch.startAt, t.startAt),
        dueAt: keep(patch.dueAt, t.dueAt),
        isAllDay: patch.isAllDay ?? t.isAllDay,
        sectionId: keep(patch.sectionId, t.sectionId),
        durationMin: keep(patch.durationMin, t.durationMin),
        timeZone: keep(patch.timeZone, t.timeZone),
        rrule: keep(patch.rrule, t.rrule),
        repeatFrom: keep(patch.repeatFrom, t.repeatFrom),
        estPomos: keep(patch.estPomos, t.estPomos),
        estDurationMin: keep(patch.estDurationMin, t.estDurationMin),
        updatedAt: nowIso(),
      });
      logActivity(t.id, "edited");
      return clone(t);
    },
    completeTask: async (id) => {
      const top = findTask(id);
      const anchor = top.dueAt ?? top.startAt;
      // Recurring task with an anchor: advance in place instead of completing.
      if (top.status === "ACTIVE" && top.rrule && top.rrule.trim() && anchor) {
        const next = advanceIso(anchor, top.rrule);
        if (next) {
          const newAnchor = top.isAllDay ? next.slice(0, 10) + "T00:00:00.000Z" : next;
          const gap =
            top.startAt && top.dueAt
              ? new Date(top.dueAt).getTime() - new Date(top.startAt).getTime()
              : 0;
          if (top.dueAt) {
            top.dueAt = newAnchor;
            if (top.startAt)
              top.startAt = new Date(new Date(newAnchor).getTime() - gap).toISOString();
          } else if (top.startAt) {
            top.startAt = newAnchor;
          }
          top.updatedAt = nowIso();
          logActivity(top.id, "recurrence_advanced");
          return [];
        }
        // Series ended (past UNTIL): fall through and complete for real.
      }
      const targets = [top, ...descendants(id)].filter((t) => t.status === "ACTIVE");
      for (const t of targets) {
        t.status = "COMPLETED";
        t.completedAt = nowIso();
        logActivity(t.id, "completed");
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

    setTaskPinned: async (id, pinned) => {
      const t = findTask(id);
      t.pinned = pinned;
      t.updatedAt = nowIso();
    },

    listReminders: async (taskId) =>
      clone(reminders.filter((r) => r.taskId === taskId)),
    addReminder: async (taskId, triggerKind, opts) => {
      const r: Reminder = {
        id: uid(),
        taskId,
        triggerKind,
        at: opts?.at ?? null,
        offsetMin: opts?.offsetMin ?? null,
        snoozedUntil: null,
        lastFiredAt: null,
      };
      reminders.push(r);
      return clone(r);
    },
    snoozeReminder: async (id, until) => {
      const r = reminders.find((x) => x.id === id);
      if (!r) throw new Error(`not found: reminder ${id}`);
      r.snoozedUntil = until;
    },
    deleteReminder: async (id) => {
      const i = reminders.findIndex((x) => x.id === id);
      if (i >= 0) reminders.splice(i, 1);
    },

    listActivity: async (entityKind, entityId) =>
      clone(activity.filter((a) => a.entityKind === entityKind && a.entityId === entityId)),

    listTemplates: async () => clone(templates),
    createTemplate: async (name, payload) => {
      const tpl: TaskTemplate = {
        id: uid(),
        name,
        payloadJson: JSON.stringify(payload),
        sortOrder: templates.length,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      templates.push(tpl);
      return clone(tpl);
    },
    updateTemplate: async (id, patch) => {
      const tpl = templates.find((x) => x.id === id);
      if (!tpl) throw new Error(`not found: template ${id}`);
      if (patch.name !== undefined) tpl.name = patch.name;
      if (patch.payload !== undefined) tpl.payloadJson = JSON.stringify(patch.payload);
      tpl.updatedAt = nowIso();
    },
    deleteTemplate: async (id) => {
      const i = templates.findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`not found: template ${id}`);
      templates.splice(i, 1);
    },
    instantiateTemplate: async (templateId, projectId) => {
      const tpl = templates.find((x) => x.id === templateId);
      if (!tpl) throw new Error(`not found: template ${templateId}`);
      const p: TemplatePayload = JSON.parse(tpl.payloadJson);
      const created = await self.createTask({
        projectId,
        title: p.title,
        priority: p.priority,
        isAllDay: p.isAllDay,
        durationMin: p.durationMin ?? undefined,
        timeZone: p.timeZone ?? undefined,
        rrule: p.rrule ?? undefined,
        repeatFrom: p.repeatFrom,
      });
      if (p.contentRich != null || p.contentPlain != null) {
        await self.updateTask(created.id, {
          contentRich: p.contentRich ?? null,
          contentPlain: p.contentPlain ?? null,
        });
      }
      for (const title of p.checkItems ?? []) await self.addCheckItem(created.id, title);
      for (const spec of p.reminders ?? [])
        await self.addReminder(created.id, spec.triggerKind, {
          at: spec.at,
          offsetMin: spec.offsetMin,
        });
      return self.getTask(created.id);
    },

    listSections: async (projectId) =>
      clone(
        sections.filter((s) => s.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder),
      ),
    createSection: async (projectId, name) => {
      const s: Section = {
        id: uid(),
        projectId,
        name,
        sortOrder: (sections.filter((x) => x.projectId === projectId).length + 1) * 1024,
      };
      sections.push(s);
      return clone(s);
    },
    renameSection: async (id, name) => {
      const s = sections.find((x) => x.id === id);
      if (!s) throw new Error(`not found: section ${id}`);
      s.name = name;
    },
    reorderSection: async (id, afterId) => {
      const s = sections.find((x) => x.id === id);
      if (!s) throw new Error(`not found: section ${id}`);
      const siblings = sections
        .filter((x) => x.projectId === s.projectId && x.id !== id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const at = afterId === null ? 0 : siblings.findIndex((x) => x.id === afterId) + 1;
      siblings.splice(at, 0, s);
      siblings.forEach((x, i) => (x.sortOrder = (i + 1) * 1024));
    },
    deleteSection: async (id) => {
      const i = sections.findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`not found: section ${id}`);
      for (const t of tasks) if (t.sectionId === id) t.sectionId = null;
      sections.splice(i, 1);
    },
    moveTaskToSection: async (taskId, sectionId) => {
      const t = findTask(taskId);
      t.sectionId = sectionId;
      t.updatedAt = nowIso();
    },

    listFilters: async () => clone(filters.slice().sort((a, b) => a.sortOrder - b.sortOrder)),
    createFilter: async (name, rule, color) => {
      const f: Filter = {
        id: uid(),
        name,
        ruleJson: JSON.stringify(rule),
        color: color ?? null,
        sortOrder: filters.length,
      };
      filters.push(f);
      return clone(f);
    },
    updateFilter: async (id, patch) => {
      const f = filters.find((x) => x.id === id);
      if (!f) throw new Error(`not found: filter ${id}`);
      if (patch.name !== undefined) f.name = patch.name;
      if (patch.rule !== undefined) f.ruleJson = JSON.stringify(patch.rule);
      if (patch.color !== undefined) f.color = patch.color;
    },
    deleteFilter: async (id) => {
      const i = filters.findIndex((x) => x.id === id);
      if (i < 0) throw new Error(`not found: filter ${id}`);
      filters.splice(i, 1);
    },
    parseFilterQuery: async (text) => resolveQuery(parseQuery(text), projects, tags),
    listFilterTasks: async (id) => {
      const f = filters.find((x) => x.id === id);
      if (!f) throw new Error(`not found: filter ${id}`);
      const rule: Rule = JSON.parse(f.ruleJson);
      const { today, tzOffsetMin } = localDateParams();
      const hasStatus = rule.conditions.some((c) => c.field === "status");
      const candidates = tasks.filter(
        (t) => t.status !== "TRASHED" && (hasStatus || t.status === "ACTIVE"),
      );
      return clone(candidates.filter((t) => evaluateRule(rule, t, today, tzOffsetMin)));
    },

    getMatrix: async () => clone(matrixQuadrants()),
    setQuadrant: async (quadrant, rule) => {
      matrixConfig.set(quadrant, rule);
    },
    listMatrix: async () => {
      const quads = matrixQuadrants();
      const { today, tzOffsetMin } = localDateParams();
      const buckets: QuadrantTasks[] = [0, 1, 2, 3].map((quadrant) => ({ quadrant, tasks: [] }));
      for (const t of tasks.filter((x) => x.status === "ACTIVE")) {
        const q = quads.find((qq) => evaluateRule(qq.rule, t, today, tzOffsetMin));
        if (q) buckets[q.quadrant].tasks.push(clone(t));
      }
      return buckets;
    },
    assignToQuadrant: async (taskId, quadrant) => {
      const rule = matrixQuadrants().find((q) => q.quadrant === quadrant)?.rule;
      const prio = rule?.conditions.find((c) => c.field === "priority");
      if (prio && prio.field === "priority" && prio.values.length > 0) {
        const t = findTask(taskId);
        t.priority = prio.values[0];
        t.updatedAt = nowIso();
      }
    },

    getSetting: async (key) => clone(settings.get(key) ?? null),
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
    seedDemoData: async () => {},
  };
  return self;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Api = isTauri ? tauriApi : browserStubApi();
