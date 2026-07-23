import { invoke } from "@tauri-apps/api/core";
import { evaluateRule, parseQuery, resolveQuery } from "../features/filters/lib/rule";
import { completionPoints, levelFor } from "../features/stats/lib/score";
import { parseCsv } from "../features/settings/lib/importers";
import { pushRecent, RECENT_CAP } from "../features/search/lib/recent";
import {
  completionRate as habitCompletionRate,
  isScheduled as habitIsScheduled,
  streak as habitStreak,
  type Freq as HabitFreq,
} from "../features/habits/lib/streak";

export type { HabitFreq };

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

export type TaskStatus = "ACTIVE" | "COMPLETED" | "WONT_DO" | "TRASHED";
export type Priority = 0 | 1 | 3 | 5;
export type SmartView =
  | "today"
  | "tomorrow"
  | "next7Days"
  | "all"
  | "completed"
  | "wontDo"
  | "trash";

export interface Comment {
  id: string;
  taskId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  /** Path relative to the app's attachments folder (opaque to the UI). */
  relPath: string;
  mime: string | null;
  /** IMAGE | AUDIO | FILE — drives how the gallery renders it. */
  kind: "IMAGE" | "AUDIO" | "FILE";
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
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

// ---- Calendar ---------------------------------------------------------------

export type CalItemKind = "TASK" | "EVENT";

export interface CalItem {
  id: string;
  kind: CalItemKind;
  sourceId: string;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  color: string | null;
  editable: boolean;
}

export interface CalEvent {
  id: string;
  subscriptionId: string | null;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  location: string | null;
  notes: string | null;
  color: string | null;
  rrule: string | null;
}

export interface NewEvent {
  title: string;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  color?: string | null;
  rrule?: string | null;
}

export interface CalSubscription {
  id: string;
  url: string;
  name: string;
  color: string | null;
  visible: boolean;
  refreshMin: number;
  lastFetch: string | null;
}

// ---- Focus / Pomodoro -------------------------------------------------------

export type FocusKind = "POMO" | "STOPWATCH";

export interface FocusSession {
  id: string;
  taskId: string | null;
  habitId: string | null;
  kind: FocusKind;
  startedAt: string;
  endedAt: string | null;
  pauseMs: number;
  note: string | null;
  status: string;
  plannedMin: number | null;
}

export interface DayStat {
  date: string;
  ms: number;
  pomos: number;
}
export interface FocusTaskStat {
  taskId: string | null;
  title: string;
  ms: number;
  pomos: number;
}
export interface FocusTagStat {
  tagId: string;
  name: string;
  ms: number;
}
export interface FocusStats {
  totalMs: number;
  pomoCount: number;
  perDay: DayStat[];
  perTask: FocusTaskStat[];
  perTag: FocusTagStat[];
}
export interface TaskActuals {
  actualMs: number;
  actualPomos: number;
}

// ---- Stats & achievements ---------------------------------------------------

export interface AchievementInfo {
  score: number;
  level: number;
  title: string;
  base: number;
  next: number | null;
}
export interface ScorePoint {
  date: string;
  delta: number;
  cumulative: number;
}
export interface StatsDayCount {
  date: string;
  count: number;
}
export interface StatsSummary {
  completedCount: number;
  completionRate: number;
  focusMs: number;
  perDay: StatsDayCount[];
  weekday: number[]; // 0=Mon .. 6=Sun
  hour: number[]; // 0..23
  lateCount: number;
  overdueCount: number;
}

// ---- Local API / integrations -----------------------------------------------

export interface ApiConfig {
  enabled: boolean;
  port: number;
  token: string;
}

export type ImportKind = "ticktick" | "todoist" | "generic";

export interface BackupInfo {
  name: string;
  path: string;
  bytes: number;
  createdAt: string;
}

export interface BackupConfig {
  autoEnabled: boolean;
  keep: number;
  lastAt: string | null;
}

export interface DesktopConfig {
  quickAddHotkey: string;
  autostart: boolean;
  notifActions: boolean;
  /** Minutes the notification Snooze button reschedules by (5/10/30/60). */
  notifSnoozeMin: number;
  /** Render focus/sticky pop-outs as in-app floating panels (webview fallback). */
  simplePopouts: boolean;
  /** Native pop-out chrome: "pill" | "solid" (frameless opaque) | "windowed". */
  popoutStyle: string;
  /** Close button hides to the tray (reminders keep running). Default ON. */
  closeToTray: boolean;
  /** Autostart launches start hidden in the tray. Default ON. */
  startMinimized: boolean;
}

// ---- Search -----------------------------------------------------------------

export interface SearchFilters {
  projectId?: string;
  tagId?: string;
  status?: string; // ACTIVE | COMPLETED
  dueFrom?: string;
  dueTo?: string;
}
export interface SearchHit {
  id: string;
  name: string;
}
export interface SearchResults {
  tasks: Task[];
  habits: SearchHit[];
  tags: SearchHit[];
}
export interface SavedSearch {
  id: string;
  query: string;
  filtersJson: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Habits -----------------------------------------------------------------

export type GoalKind = "CHECK" | "AMOUNT";
export type CheckinStatus = "DONE" | "PARTIAL" | "SKIP";

export interface Habit {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  quote: string | null;
  goalKind: GoalKind;
  goalAmount: number | null;
  unit: string | null;
  freqJson: string;
  section: string | null;
  remindersJson: string | null;
  startDate: string | null;
  goalDays: number | null;
  autoLogPopup: boolean;
  archived: boolean;
  sortOrder: number;
}

export interface HabitInput {
  name: string;
  icon?: string | null;
  color?: string | null;
  quote?: string | null;
  goalKind: GoalKind;
  goalAmount?: number | null;
  unit?: string | null;
  freq: HabitFreq;
  section?: string | null;
  reminders?: string[];
  startDate?: string | null;
  goalDays?: number | null;
  autoLogPopup?: boolean;
}

export interface HabitCheckin {
  id: string;
  habitId: string;
  date: string;
  value: number | null;
  status: CheckinStatus;
  note: string | null;
}

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  totalCheckins: number;
  completionRate: number;
}

export interface HabitToday {
  habit: Habit;
  status: CheckinStatus | null;
  value: number | null;
  streak: number;
}

// ---- Countdowns & Sticky Notes ----------------------------------------------

export interface Countdown {
  id: string;
  title: string;
  targetDate: string;
  repeatAnnual: boolean;
  styleJson: string | null;
  pinned: boolean;
}

/** Shape stored in Countdown.styleJson. */
export interface CountdownStyle {
  color?: string;
  countUp?: boolean;
}

export interface StickyView {
  id: string;
  noteId: string;
  title: string;
  contentPlain: string | null;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string | null;
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
  kind?: "TASK" | "CHECKLIST" | "NOTE";
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
  /** `expectedOccurrence` is the due-else-start the caller rendered; a stale
   *  value makes a retried recurring completion a safe no-op (returns []). */
  completeTask(id: string, expectedOccurrence?: string | null): Promise<string[]>;
  reopenTask(id: string): Promise<void>;
  setWontDo(id: string): Promise<string[]>;
  duplicateTask(id: string): Promise<Task>;
  checkItemToSubtask(itemId: string): Promise<Task>;
  subtaskToCheckItem(taskId: string): Promise<CheckItem>;
  saveTaskAsTemplate(taskId: string, name: string): Promise<TaskTemplate>;
  listComments(taskId: string): Promise<Comment[]>;
  addComment(taskId: string, body: string): Promise<Comment>;
  deleteComment(id: string): Promise<void>;

  listAttachments(taskId: string): Promise<Attachment[]>;
  addAttachment(
    taskId: string,
    fileName: string,
    mime: string | null,
    dataBase64: string,
  ): Promise<Attachment>;
  readAttachmentDataUrl(id: string): Promise<string>;
  deleteAttachment(id: string): Promise<void>;
  openAttachment(id: string): Promise<void>;
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
  searchAll(query: string, filters: SearchFilters): Promise<SearchResults>;
  recentSearches(): Promise<string[]>;
  addRecentSearch(query: string): Promise<string[]>;
  listSavedSearches(): Promise<SavedSearch[]>;
  createSavedSearch(query: string, filtersJson: string | null): Promise<SavedSearch>;
  deleteSavedSearch(id: string): Promise<void>;

  listCheckItems(taskId: string): Promise<CheckItem[]>;
  addCheckItem(taskId: string, title: string): Promise<CheckItem>;
  setCheckItem(id: string, patch: { title?: string; done?: boolean }): Promise<void>;
  deleteCheckItem(id: string): Promise<void>;

  listTags(): Promise<Tag[]>;
  createTag(name: string, color?: string): Promise<Tag>;
  updateTag(id: string, patch: { name?: string; color?: string | null }): Promise<void>;
  deleteTag(id: string): Promise<void>;
  mergeTags(src: string, dst: string): Promise<void>;
  setTagParent(id: string, parentId: string | null): Promise<void>;
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

  listCalendar(from: string, to: string, includeCompleted: boolean): Promise<CalItem[]>;
  createEvent(input: NewEvent): Promise<CalEvent>;
  getEvent(id: string): Promise<CalEvent>;
  updateEvent(
    id: string,
    patch: {
      title?: string;
      startAt?: string;
      endAt?: string;
      allDay?: boolean;
      location?: string;
      notes?: string;
      color?: string;
    },
  ): Promise<CalEvent>;
  deleteEvent(id: string): Promise<void>;
  moveCalendarItem(kind: CalItemKind, id: string, startAt: string, allDay: boolean): Promise<void>;
  resizeCalendarItem(kind: CalItemKind, id: string, endAt: string): Promise<void>;
  scheduleTask(taskId: string, startAt: string, allDay: boolean, durationMin?: number): Promise<void>;

  listSubscriptions(): Promise<CalSubscription[]>;
  addSubscription(
    url: string,
    name: string,
    color?: string | null,
    refreshMin?: number,
  ): Promise<CalSubscription>;
  updateSubscription(
    id: string,
    patch: { name?: string; color?: string; visible?: boolean; refreshMin?: number },
  ): Promise<void>;
  deleteSubscription(id: string): Promise<void>;
  refreshSubscription(id: string): Promise<number>;
  importIcs(text: string): Promise<number>;
  exportIcs(projectId?: string | null): Promise<string>;

  startFocus(
    target: { taskId?: string | null; habitId?: string | null },
    kind: FocusKind,
    plannedMin?: number,
  ): Promise<FocusSession>;
  completeFocus(id: string, pauseMs: number, note: string | null, status: string): Promise<FocusSession>;
  setFocusPaused(id: string, paused: boolean): Promise<void>;
  activeFocus(): Promise<FocusSession | null>;
  addFocusSession(
    taskId: string | null,
    kind: FocusKind,
    startedAt: string,
    endedAt: string,
    note?: string | null,
  ): Promise<FocusSession>;
  updateFocusSession(
    id: string,
    patch: { startedAt?: string; endedAt?: string; note?: string },
  ): Promise<FocusSession>;
  deleteFocusSession(id: string): Promise<void>;
  listFocusSessions(from: string, to: string): Promise<FocusSession[]>;
  listTaskFocus(taskId: string): Promise<FocusSession[]>;
  focusStats(from: string, to: string): Promise<FocusStats>;
  taskFocusActuals(taskId: string): Promise<TaskActuals>;

  achievementInfo(): Promise<AchievementInfo>;
  scoreHistory(from: string, to: string): Promise<ScorePoint[]>;
  statsSummary(from: string, to: string): Promise<StatsSummary>;

  apiConfig(): Promise<ApiConfig>;
  apiSetEnabled(enabled: boolean): Promise<ApiConfig>;
  apiRegenerateToken(): Promise<string>;
  copyTaskLink(id: string): Promise<string>;

  exportJson(): Promise<string>;
  exportCsv(): Promise<string>;
  exportMarkdown(): Promise<string>;
  importCsv(kind: ImportKind, text: string): Promise<number>;
  createBackup(): Promise<BackupInfo>;
  listBackups(): Promise<BackupInfo[]>;
  restoreBackup(path: string): Promise<void>;
  deleteBackup(path: string): Promise<void>;
  backupConfig(): Promise<BackupConfig>;
  setBackupConfig(autoEnabled: boolean, keep: number): Promise<BackupConfig>;

  desktopConfig(): Promise<DesktopConfig>;
  setQuickAddHotkey(accel: string): Promise<DesktopConfig>;
  setNotifActions(on: boolean): Promise<DesktopConfig>;
  setNotifSnoozeMin(minutes: number): Promise<DesktopConfig>;
  setSimplePopouts(on: boolean): Promise<DesktopConfig>;
  setPopoutStyle(style: string): Promise<DesktopConfig>;
  setAutostart(on: boolean): Promise<DesktopConfig>;
  setCloseToTray(on: boolean): Promise<DesktopConfig>;
  setStartMinimized(on: boolean): Promise<DesktopConfig>;
  openQuickAddWindow(): Promise<void>;
  openFocusWindow(): Promise<void>;
  openStickyWindow(id: string): Promise<void>;
  todayCount(): Promise<number>;
  /** Reveal the folder holding the rotating toodoo.log (no-op in the browser). */
  openLogsFolder(): Promise<void>;
  /** Show + focus the main window (pill overflow menus). */
  showMainWindow(): Promise<void>;
  /** Fire the full notification path now; resolves to a short stage report. */
  sendTestNotification(): Promise<string>;
  /** Load the feature-complete sample workspace. Refuses a non-empty
   *  workspace unless `force` (the Advanced action confirms first). */
  seedSampleData(force: boolean): Promise<void>;

  listHabits(includeArchived: boolean): Promise<Habit[]>;
  getHabit(id: string): Promise<Habit>;
  createHabit(input: HabitInput): Promise<Habit>;
  updateHabit(id: string, input: HabitInput): Promise<Habit>;
  setHabitArchived(id: string, archived: boolean): Promise<void>;
  deleteHabit(id: string): Promise<void>;
  reorderHabit(id: string, afterId: string | null): Promise<void>;
  recordCheckin(
    habitId: string,
    date: string,
    status: CheckinStatus,
    value?: number | null,
    note?: string | null,
  ): Promise<HabitCheckin>;
  deleteCheckin(habitId: string, date: string): Promise<void>;
  listCheckins(habitId: string, from: string, to: string): Promise<HabitCheckin[]>;
  habitStats(habitId: string): Promise<HabitStats>;
  listTodayHabits(): Promise<HabitToday[]>;

  setTaskKind(id: string, kind: "TASK" | "CHECKLIST" | "NOTE"): Promise<void>;

  listCountdowns(): Promise<Countdown[]>;
  createCountdown(
    title: string,
    targetDate: string,
    repeatAnnual: boolean,
    styleJson?: string | null,
  ): Promise<Countdown>;
  updateCountdown(
    id: string,
    patch: { title?: string; targetDate?: string; repeatAnnual?: boolean; styleJson?: string },
  ): Promise<Countdown>;
  setCountdownPinned(id: string, pinned: boolean): Promise<void>;
  deleteCountdown(id: string): Promise<void>;

  listStickies(): Promise<StickyView[]>;
  newQuickSticky(text: string, color?: string | null): Promise<string>;
  stickyFromNote(noteId: string, color?: string | null): Promise<string>;
  stickyFromTask(taskId: string, color?: string | null): Promise<string>;
  updateSticky(
    id: string,
    patch: { x?: number; y?: number; w?: number; h?: number; color?: string },
  ): Promise<void>;
  closeSticky(id: string): Promise<void>;
  deleteSticky(id: string): Promise<void>;

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
  completeTask: (id, expectedOccurrence) =>
    invoke("complete_task", {
      id,
      tzOffsetMin: localDateParams().tzOffsetMin,
      expectedOccurrence: expectedOccurrence ?? null,
    }),
  reopenTask: (id) => invoke("reopen_task", { id }),
  setWontDo: (id) => invoke("set_wont_do", { id, tzOffsetMin: localDateParams().tzOffsetMin }),
  duplicateTask: (id) => invoke("duplicate_task", { id }),
  checkItemToSubtask: (itemId) => invoke("check_item_to_subtask", { itemId }),
  subtaskToCheckItem: (taskId) => invoke("subtask_to_check_item", { taskId }),
  saveTaskAsTemplate: (taskId, name) => invoke("save_task_as_template", { taskId, name }),
  listAttachments: (taskId) => invoke("list_attachments", { taskId }),
  addAttachment: (taskId, fileName, mime, dataBase64) =>
    invoke("add_attachment", { taskId, fileName, mime, dataBase64 }),
  readAttachmentDataUrl: (id) => invoke("read_attachment_data_url", { id }),
  deleteAttachment: (id) => invoke("delete_attachment", { id }),
  openAttachment: (id) => invoke("open_attachment", { id }),
  listComments: (taskId) => invoke("list_comments", { taskId }),
  addComment: (taskId, body) => invoke("add_comment", { taskId, body }),
  deleteComment: (id) => invoke("delete_comment", { id }),
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
  searchAll: (query, filters) => invoke("search_all", { query, filters }),
  recentSearches: () => invoke("recent_searches"),
  addRecentSearch: (query) => invoke("add_recent_search", { query }),
  listSavedSearches: () => invoke("list_saved_searches"),
  createSavedSearch: (query, filtersJson) =>
    invoke("create_saved_search", { query, filtersJson }),
  deleteSavedSearch: (id) => invoke("delete_saved_search", { id }),

  listCheckItems: (taskId) => invoke("list_check_items", { taskId }),
  addCheckItem: (taskId, title) => invoke("add_check_item", { taskId, title }),
  setCheckItem: (id, patch) => invoke("set_check_item", { id, ...patch }),
  deleteCheckItem: (id) => invoke("delete_check_item", { id }),

  listTags: () => invoke("list_tags"),
  createTag: (name, color) => invoke("create_tag", { name, color }),
  updateTag: (id, patch) => invoke("update_tag", { id, ...patch }),
  deleteTag: (id) => invoke("delete_tag", { id }),
  mergeTags: (src, dst) => invoke("merge_tags", { src, dst }),
  setTagParent: (id, parentId) => invoke("set_tag_parent", { id, parentId }),
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

  listCalendar: (from, to, includeCompleted) =>
    invoke("list_calendar", { from, to, includeCompleted }),
  createEvent: (input) => invoke("create_event", { input }),
  getEvent: (id) => invoke("get_event", { id }),
  updateEvent: (id, patch) =>
    invoke("update_event", {
      id,
      title: patch.title ?? null,
      startAt: patch.startAt ?? null,
      endAt: patch.endAt ?? null,
      allDay: patch.allDay ?? null,
      location: patch.location ?? null,
      notes: patch.notes ?? null,
      color: patch.color ?? null,
    }),
  deleteEvent: (id) => invoke("delete_event", { id }),
  moveCalendarItem: (kind, id, startAt, allDay) =>
    invoke("move_calendar_item", { kind, id, startAt, allDay }),
  resizeCalendarItem: (kind, id, endAt) => invoke("resize_calendar_item", { kind, id, endAt }),
  scheduleTask: (taskId, startAt, allDay, durationMin) =>
    invoke("schedule_task", { taskId, startAt, allDay, durationMin: durationMin ?? null }),

  listSubscriptions: () => invoke("list_subscriptions"),
  addSubscription: (url, name, color, refreshMin) =>
    invoke("add_subscription", { url, name, color: color ?? null, refreshMin: refreshMin ?? null }),
  updateSubscription: (id, patch) =>
    invoke("update_subscription", {
      id,
      name: patch.name ?? null,
      color: patch.color ?? null,
      visible: patch.visible ?? null,
      refreshMin: patch.refreshMin ?? null,
    }),
  deleteSubscription: (id) => invoke("delete_subscription", { id }),
  refreshSubscription: (id) => invoke("refresh_subscription", { id }),
  importIcs: (text) => invoke("import_ics", { text }),
  exportIcs: (projectId) => invoke("export_ics", { projectId: projectId ?? null }),

  startFocus: (target, kind, plannedMin) =>
    invoke("start_focus", {
      taskId: target.taskId ?? null,
      habitId: target.habitId ?? null,
      kind,
      plannedMin: plannedMin ?? null,
    }),
  completeFocus: (id, pauseMs, note, status) =>
    invoke("complete_focus", { id, pauseMs, note, status }),
  setFocusPaused: (id, paused) => invoke("set_focus_paused", { id, paused }),
  activeFocus: () => invoke("active_focus"),
  addFocusSession: (taskId, kind, startedAt, endedAt, note) =>
    invoke("add_focus_session", { taskId, kind, startedAt, endedAt, note: note ?? null }),
  updateFocusSession: (id, patch) =>
    invoke("update_focus_session", {
      id,
      startedAt: patch.startedAt ?? null,
      endedAt: patch.endedAt ?? null,
      note: patch.note ?? null,
    }),
  deleteFocusSession: (id) => invoke("delete_focus_session", { id }),
  listFocusSessions: (from, to) => invoke("list_focus_sessions", { from, to }),
  listTaskFocus: (taskId) => invoke("list_task_focus", { taskId }),
  focusStats: (from, to) => invoke("focus_stats", { from, to, tzOffsetMin: localDateParams().tzOffsetMin }),
  taskFocusActuals: (taskId) => invoke("task_focus_actuals", { taskId }),

  achievementInfo: () => invoke("achievement_info"),
  scoreHistory: (from, to) => invoke("score_history", { from, to }),
  statsSummary: (from, to) =>
    invoke("stats_summary", { from, to, tzOffsetMin: localDateParams().tzOffsetMin }),

  apiConfig: () => invoke("api_config"),
  apiSetEnabled: (enabled) => invoke("api_set_enabled", { enabled }),
  apiRegenerateToken: () => invoke("api_regenerate_token"),
  copyTaskLink: (id) => invoke("copy_task_link", { id }),

  exportJson: () => invoke("export_json"),
  exportCsv: () => invoke("export_csv"),
  exportMarkdown: () => invoke("export_markdown"),
  importCsv: (kind, text) => invoke("import_csv", { kind, text }),
  createBackup: () => invoke("create_backup"),
  listBackups: () => invoke("list_backups"),
  restoreBackup: (path) => invoke("restore_backup", { path }),
  deleteBackup: (path) => invoke("delete_backup", { path }),
  backupConfig: () => invoke("backup_config"),
  setBackupConfig: (autoEnabled, keep) =>
    invoke("set_backup_config", { autoEnabled, keep }),

  desktopConfig: () => invoke("desktop_config"),
  setQuickAddHotkey: (accel) => invoke("set_quick_add_hotkey", { accel }),
  setNotifActions: (on) => invoke("set_notif_actions", { on }),
  setNotifSnoozeMin: (minutes) => invoke("set_notif_snooze_min", { minutes }),
  setSimplePopouts: (on) => invoke("set_simple_popouts", { on }),
  setPopoutStyle: (style) => invoke("set_popout_style", { style }),
  setAutostart: (on) => invoke("set_autostart", { on }),
  setCloseToTray: (on) => invoke("set_close_to_tray", { on }),
  setStartMinimized: (on) => invoke("set_start_minimized", { on }),
  openQuickAddWindow: () => invoke("open_quick_add_window"),
  openFocusWindow: () => invoke("open_focus_window"),
  openStickyWindow: (id) => invoke("open_sticky_window", { id }),
  todayCount: () => invoke("today_count"),
  openLogsFolder: () => invoke("open_logs_folder"),
  showMainWindow: () => invoke("show_main_window"),
  sendTestNotification: () => invoke("send_test_notification"),
  seedSampleData: (force) => invoke("seed_sample_data", { force }),

  listHabits: (includeArchived) => invoke("list_habits", { includeArchived }),
  getHabit: (id) => invoke("get_habit", { id }),
  createHabit: (input) => invoke("create_habit", { input }),
  updateHabit: (id, input) => invoke("update_habit", { id, input }),
  setHabitArchived: (id, archived) => invoke("set_habit_archived", { id, archived }),
  deleteHabit: (id) => invoke("delete_habit", { id }),
  reorderHabit: (id, afterId) => invoke("reorder_habit", { id, afterId }),
  recordCheckin: (habitId, date, status, value, note) =>
    invoke("record_checkin", { habitId, date, status, value: value ?? null, note: note ?? null }),
  deleteCheckin: (habitId, date) => invoke("delete_checkin", { habitId, date }),
  listCheckins: (habitId, from, to) => invoke("list_checkins", { habitId, from, to }),
  habitStats: (habitId) => invoke("habit_stats", { habitId, today: localDateParams().today }),
  listTodayHabits: () => invoke("list_today_habits", { today: localDateParams().today }),

  setTaskKind: (id, kind) => invoke("set_task_kind", { id, kind }),

  listCountdowns: () => invoke("list_countdowns"),
  createCountdown: (title, targetDate, repeatAnnual, styleJson) =>
    invoke("create_countdown", { title, targetDate, repeatAnnual, styleJson: styleJson ?? null }),
  updateCountdown: (id, patch) =>
    invoke("update_countdown", {
      id,
      title: patch.title ?? null,
      targetDate: patch.targetDate ?? null,
      repeatAnnual: patch.repeatAnnual ?? null,
      styleJson: patch.styleJson ?? null,
    }),
  setCountdownPinned: (id, pinned) => invoke("set_countdown_pinned", { id, pinned }),
  deleteCountdown: (id) => invoke("delete_countdown", { id }),

  listStickies: () => invoke("list_stickies"),
  newQuickSticky: (text, color) => invoke("new_quick_sticky", { text, color: color ?? null }),
  stickyFromNote: (noteId, color) => invoke("sticky_from_note", { noteId, color: color ?? null }),
  stickyFromTask: (taskId, color) => invoke("sticky_from_task", { taskId, color: color ?? null }),
  updateSticky: (id, patch) =>
    invoke("update_sticky", {
      id,
      x: patch.x ?? null,
      y: patch.y ?? null,
      w: patch.w ?? null,
      h: patch.h ?? null,
      color: patch.color ?? null,
    }),
  closeSticky: (id) => invoke("close_sticky", { id }),
  deleteSticky: (id) => invoke("delete_sticky", { id }),

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
  const comments: Comment[] = [];
  const attachments: Attachment[] = [];
  const attachmentData = new Map<string, string>();
  const templates: TaskTemplate[] = [];
  const sections: Section[] = [];
  const filters: Filter[] = [];
  const matrixConfig = new Map<number, Rule>();
  const calEvents: CalEvent[] = [];
  const subscriptions: CalSubscription[] = [];
  const focusSessions: FocusSession[] = [];
  const habits: Habit[] = [];
  const habitCheckins: HabitCheckin[] = [];
  const habitMarks = (habitId: string): [string, string][] =>
    habitCheckins.filter((c) => c.habitId === habitId).map((c) => [c.date, c.status]);
  const countdowns: Countdown[] = [];
  interface StickyRow {
    id: string;
    noteId: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string | null;
    open: boolean;
  }
  const stickies: StickyRow[] = [];
  // Stats ledgers, mirroring the achievements + task_completions tables. The stub
  // has no scheduler, so overdue penalties are Tauri-only (docs/decisions.md).
  const achievements: { date: string; delta: number; reason: string }[] = [];
  const taskCompletions: { taskId: string; occurrenceAt: string | null; completedAt: string }[] = [];
  const apiCfg: ApiConfig = { enabled: false, port: 7420, token: "stub-token-000000000000" };
  // Backups can't run server-side in the browser; the stub keeps an in-memory list.
  const backups: BackupInfo[] = [];
  const backupCfg: BackupConfig = { autoEnabled: true, keep: 10, lastAt: null };
  let recentSearchList: string[] = [];
  const savedSearchList: SavedSearch[] = [];
  // Native desktop config the browser can't apply — the stub tracks it so the
  // Settings panel renders and toggles.
  const desktopCfg: DesktopConfig = {
    quickAddHotkey: "CmdOrCtrl+Shift+A",
    autostart: false,
    notifActions: true,
    notifSnoozeMin: 10,
    simplePopouts: false,
    popoutStyle: "pill",
    closeToTray: true,
    startMinimized: true,
  };
  const nowIso = () => new Date().toISOString();
  const uid = () => crypto.randomUUID();

  /** Record one completion in the ledger and award its points. The achievement
   * row is dated in local time, matching the local ranges the stats views query. */
  const recordCompletion = (taskId: string, dueAt: string | null, occurrenceAt: string | null) => {
    const completedAt = nowIso();
    taskCompletions.push({ taskId, occurrenceAt, completedAt });
    achievements.push({
      date: focusLocalDay(completedAt),
      delta: completionPoints(dueAt, completedAt),
      reason: "completed",
    });
  };

  const focusEffMs = (s: FocusSession) =>
    s.endedAt ? Math.max(0, new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime() - s.pauseMs) : 0;
  const focusLocalDay = (iso: string) => {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };

  const CAL_DEFAULT_DURATION = 60;
  const addMinutes = (iso: string, m: number) =>
    new Date(new Date(iso).getTime() + m * 60_000).toISOString();
  const calIntersects = (start: string, end: string | null, from: string, to: string) => {
    const e = end ?? start;
    return start <= to && e >= from;
  };
  const taskSpan = (t: Task): { start: string; end: string | null; allDay: boolean } | null => {
    if (t.startAt && t.dueAt) return { start: t.startAt, end: t.dueAt, allDay: t.isAllDay };
    const point = t.dueAt ?? t.startAt;
    if (!point) return null;
    if (t.isAllDay) return { start: point, end: null, allDay: true };
    return { start: point, end: addMinutes(point, t.durationMin ?? CAL_DEFAULT_DURATION), allDay: false };
  };

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
        kind: input.kind ?? "TASK",
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
    completeTask: async (id, expectedOccurrence) => {
      const top = findTask(id);
      const anchor = top.dueAt ?? top.startAt;
      // Recurring task with an anchor: advance in place instead of completing.
      if (top.status === "ACTIVE" && top.rrule && top.rrule.trim() && anchor) {
        // Idempotency guard (mirrors the Rust contract): a retry carrying an
        // occurrence that has already advanced is a no-op.
        if (expectedOccurrence != null && expectedOccurrence !== anchor) return [];
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
          recordCompletion(top.id, anchor, anchor);
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
      if (targets.some((t) => t.id === id)) {
        recordCompletion(top.id, top.dueAt ?? null, top.dueAt ?? top.startAt ?? null);
      }
      return targets.map((t) => t.id);
    },
    reopenTask: async (id) => {
      const t = findTask(id);
      t.status = "ACTIVE";
      t.completedAt = null;
    },
    setWontDo: async (id) => {
      const top = findTask(id);
      const anchor = top.dueAt ?? top.startAt;
      // Recurring: advance in place (a skipped occurrence), like completion.
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
      }
      top.status = "WONT_DO";
      top.updatedAt = nowIso();
      logActivity(top.id, "wont_do");
      return [top.id];
    },
    duplicateTask: async (id) => {
      const subtree = [findTask(id), ...descendants(id)];
      const idMap = new Map<string, string>();
      const rootParent = findTask(id).parentId;
      subtree.forEach((t, i) => {
        const newId = uid();
        idMap.set(t.id, newId);
        const parentId = i === 0 ? rootParent : (t.parentId ? (idMap.get(t.parentId) ?? null) : null);
        tasks.push({
          ...clone(t),
          id: newId,
          parentId: parentId ?? null,
          title: i === 0 ? `${t.title} (copy)` : t.title,
          status: "ACTIVE",
          completedAt: null,
          pinned: false,
          sortOrder: (t.sortOrder ?? 0) + 1,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          tagIds: [...(t.tagIds ?? [])],
        });
        for (const ci of checkItems.filter((c) => c.taskId === t.id))
          checkItems.push({ ...clone(ci), id: uid(), taskId: newId });
        for (const r of reminders.filter((x) => x.taskId === t.id))
          reminders.push({ ...clone(r), id: uid(), taskId: newId });
      });
      logActivity(idMap.get(id)!, "created");
      return clone(findTask(idMap.get(id)!));
    },
    checkItemToSubtask: async (itemId) => {
      const idx = checkItems.findIndex((c) => c.id === itemId);
      if (idx < 0) throw new Error(`not found: check item ${itemId}`);
      const ci = checkItems[idx];
      const sub = await self.createTask({ projectId: findTask(ci.taskId).projectId, parentId: ci.taskId, title: ci.title });
      if (ci.done) findTask(sub.id).status = "COMPLETED";
      checkItems.splice(idx, 1);
      return clone(findTask(sub.id));
    },
    subtaskToCheckItem: async (taskId) => {
      const t = findTask(taskId);
      if (!t.parentId) throw new Error("only a subtask can become a check item");
      const item = await self.addCheckItem(t.parentId, t.title);
      const created = checkItems.find((c) => c.id === item.id)!;
      if (t.status === "COMPLETED") created.done = true;
      for (const x of [t, ...descendants(taskId)]) x.status = "TRASHED";
      return clone(created);
    },
    saveTaskAsTemplate: async (taskId, name) => {
      const t = findTask(taskId);
      const items = checkItems.filter((c) => c.taskId === taskId).map((c) => c.title);
      return self.createTemplate(name, {
        title: t.title,
        contentRich: t.contentRich ?? undefined,
        contentPlain: t.contentPlain ?? undefined,
        priority: t.priority as Priority,
        isAllDay: t.isAllDay,
        durationMin: t.durationMin ?? undefined,
        timeZone: t.timeZone ?? undefined,
        rrule: t.rrule ?? undefined,
        repeatFrom: (t.repeatFrom ?? undefined) as RepeatFrom | undefined,
        checkItems: items,
        reminders: [],
      });
    },
    listComments: async (taskId) =>
      clone(comments.filter((c) => c.taskId === taskId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
    addComment: async (taskId, body) => {
      const b = body.trim();
      if (!b) throw new Error("comment cannot be empty");
      const c: Comment = { id: uid(), taskId, body: b, createdAt: nowIso(), updatedAt: nowIso() };
      comments.push(c);
      return clone(c);
    },
    deleteComment: async (id) => {
      const i = comments.findIndex((c) => c.id === id);
      if (i >= 0) comments.splice(i, 1);
    },
    // Attachments are a desktop/file-system feature; the web mock keeps them
    // in memory (data URLs) so the gallery is still exercisable in tests.
    listAttachments: async (taskId) =>
      clone(
        attachments
          .filter((a) => a.taskId === taskId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),
    addAttachment: async (taskId, fileName, mime, dataBase64) => {
      if (!dataBase64) throw new Error("attachment is empty");
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
      const kind: Attachment["kind"] = (mime ?? "").startsWith("image/") ||
        ["png", "jpg", "jpeg", "gif", "webp"].includes(ext)
        ? "IMAGE"
        : (mime ?? "").startsWith("audio/") || ["mp3", "wav", "ogg", "m4a"].includes(ext)
          ? "AUDIO"
          : "FILE";
      const a: Attachment = {
        id: uid(),
        taskId,
        fileName,
        relPath: `${taskId}/${fileName}`,
        mime,
        kind,
        sizeBytes: Math.floor((dataBase64.length * 3) / 4),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      attachments.push(a);
      attachmentData.set(a.id, `data:${mime ?? "application/octet-stream"};base64,${dataBase64}`);
      return clone(a);
    },
    readAttachmentDataUrl: async (id) => attachmentData.get(id) ?? "",
    deleteAttachment: async (id) => {
      const i = attachments.findIndex((a) => a.id === id);
      if (i >= 0) attachments.splice(i, 1);
      attachmentData.delete(id);
    },
    openAttachment: async () => {
      /* no OS to open into in the browser mock */
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
      // Notes never appear in the date/smart lists.
      const notNote = tasks.filter((t) => t.kind !== "NOTE");
      const active = notNote.filter((t) => t.status === "ACTIVE");
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
            notNote
              .filter((t) => t.status === "COMPLETED")
              .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
          );
        case "wontDo":
          return clone(notNote.filter((t) => t.status === "WONT_DO"));
        case "trash":
          return clone(notNote.filter((t) => t.status === "TRASHED"));
      }
    },
    smartCounts: async () => {
      const { today } = localDateParams();
      const active = tasks.filter((t) => t.status === "ACTIVE" && t.kind !== "NOTE");
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
    searchAll: async (query, filters) => {
      const q = query.trim().toLowerCase();
      if (!q) return { tasks: [], habits: [], tags: [] };
      const itemHits = new Set(
        checkItems.filter((c) => c.title.toLowerCase().includes(q)).map((c) => c.taskId),
      );
      let ts = tasks.filter(
        (t) =>
          liveTask(t) &&
          (t.title.toLowerCase().includes(q) ||
            (t.contentPlain ?? "").toLowerCase().includes(q) ||
            itemHits.has(t.id)),
      );
      if (filters.projectId) ts = ts.filter((t) => t.projectId === filters.projectId);
      if (filters.status) ts = ts.filter((t) => t.status === filters.status);
      if (filters.tagId) ts = ts.filter((t) => (t.tagIds ?? []).includes(filters.tagId!));
      if (filters.dueFrom) ts = ts.filter((t) => t.dueAt != null && t.dueAt.slice(0, 10) >= filters.dueFrom!);
      if (filters.dueTo) ts = ts.filter((t) => t.dueAt != null && t.dueAt.slice(0, 10) <= filters.dueTo!);
      return {
        tasks: clone(ts),
        habits: habits.filter((h) => h.name.toLowerCase().includes(q)).map((h) => ({ id: h.id, name: h.name })),
        tags: tags.filter((t) => t.name.toLowerCase().includes(q)).map((t) => ({ id: t.id, name: t.name })),
      };
    },
    recentSearches: async () => [...recentSearchList],
    addRecentSearch: async (query) => {
      recentSearchList = pushRecent(recentSearchList, query, RECENT_CAP);
      return [...recentSearchList];
    },
    listSavedSearches: async () => savedSearchList.map((s) => ({ ...s })),
    createSavedSearch: async (query, filtersJson) => {
      const now = nowIso();
      const s: SavedSearch = { id: uid(), query, filtersJson, createdAt: now, updatedAt: now };
      savedSearchList.unshift(s);
      return { ...s };
    },
    deleteSavedSearch: async (id) => {
      const i = savedSearchList.findIndex((s) => s.id === id);
      if (i >= 0) savedSearchList.splice(i, 1);
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
      // Re-parent children to root.
      for (const tag of tags) if (tag.parentId === id) tag.parentId = null;
    },
    mergeTags: async (src, dst) => {
      for (const t of tasks) {
        if (t.tagIds.includes(src)) t.tagIds = Array.from(new Set(t.tagIds.map((x) => (x === src ? dst : x))));
      }
      for (const tag of tags) if (tag.parentId === src) tag.parentId = dst;
      const i = tags.findIndex((t) => t.id === src);
      if (i >= 0) tags.splice(i, 1);
    },
    setTagParent: async (id, parentId) => {
      if (parentId) {
        if (parentId === id) throw new Error("a tag cannot be its own parent");
        let cur: string | null | undefined = parentId;
        while (cur) {
          if (cur === id) throw new Error("that move would create a tag cycle");
          cur = tags.find((t) => t.id === cur)?.parentId ?? null;
        }
      }
      const tag = tags.find((t) => t.id === id);
      if (!tag) throw new Error(`not found: tag ${id}`);
      tag.parentId = parentId;
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

    listCalendar: async (from, to, includeCompleted) => {
      const statuses = includeCompleted ? ["ACTIVE", "COMPLETED"] : ["ACTIVE"];
      const items: CalItem[] = [];
      for (const t of tasks.filter((x) => statuses.includes(x.status))) {
        const span = taskSpan(t);
        if (!span || !calIntersects(span.start, span.end, from, to)) continue;
        items.push({
          id: t.id,
          kind: "TASK",
          sourceId: t.id,
          title: t.title,
          startAt: span.start,
          endAt: span.end,
          allDay: span.allDay,
          color: null,
          editable: !t.rrule,
        });
      }
      // Local events only (the stub does no network fetch or RRULE expansion).
      for (const e of calEvents) {
        if (e.rrule) continue;
        if (!calIntersects(e.startAt, e.endAt, from, to)) continue;
        items.push({
          id: e.id,
          kind: "EVENT",
          sourceId: e.id,
          title: e.title,
          startAt: e.startAt,
          endAt: e.endAt,
          allDay: e.allDay,
          color: e.color,
          editable: true,
        });
      }
      return clone(items);
    },
    getEvent: async (id) => {
      const e = calEvents.find((x) => x.id === id);
      if (!e) throw new Error(`not found: event ${id}`);
      return clone(e);
    },
    createEvent: async (input) => {
      const e: CalEvent = {
        id: uid(),
        subscriptionId: null,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        allDay: input.allDay ?? false,
        location: input.location ?? null,
        notes: input.notes ?? null,
        color: input.color ?? null,
        rrule: input.rrule ?? null,
      };
      calEvents.push(e);
      return clone(e);
    },
    updateEvent: async (id, patch) => {
      const e = calEvents.find((x) => x.id === id);
      if (!e) throw new Error(`not found: event ${id}`);
      if (patch.title !== undefined) e.title = patch.title;
      if (patch.startAt !== undefined) e.startAt = patch.startAt;
      if (patch.endAt !== undefined) e.endAt = patch.endAt;
      if (patch.allDay !== undefined) e.allDay = patch.allDay;
      if (patch.location !== undefined) e.location = patch.location;
      if (patch.notes !== undefined) e.notes = patch.notes;
      if (patch.color !== undefined) e.color = patch.color;
      return clone(e);
    },
    deleteEvent: async (id) => {
      const i = calEvents.findIndex((x) => x.id === id);
      if (i >= 0) calEvents.splice(i, 1);
    },
    moveCalendarItem: async (kind, id, startAt, allDay) => {
      if (kind === "TASK") {
        const t = findTask(id);
        const old = t.dueAt ?? t.startAt;
        const delta = old ? new Date(startAt).getTime() - new Date(old).getTime() : 0;
        if (t.startAt) t.startAt = new Date(new Date(t.startAt).getTime() + delta).toISOString();
        if (t.dueAt) t.dueAt = new Date(new Date(t.dueAt).getTime() + delta).toISOString();
        t.isAllDay = allDay;
        t.updatedAt = nowIso();
      } else {
        const e = calEvents.find((x) => x.id === id);
        if (!e) throw new Error(`not found: event ${id}`);
        const delta = new Date(startAt).getTime() - new Date(e.startAt).getTime();
        e.startAt = startAt;
        if (e.endAt) e.endAt = new Date(new Date(e.endAt).getTime() + delta).toISOString();
        e.allDay = allDay;
      }
    },
    resizeCalendarItem: async (kind, id, endAt) => {
      if (kind === "TASK") {
        const t = findTask(id);
        const start = t.startAt ?? t.dueAt;
        t.durationMin = start
          ? Math.max(0, Math.round((new Date(endAt).getTime() - new Date(start).getTime()) / 60_000))
          : CAL_DEFAULT_DURATION;
        t.updatedAt = nowIso();
      } else {
        const e = calEvents.find((x) => x.id === id);
        if (!e) throw new Error(`not found: event ${id}`);
        e.endAt = endAt;
      }
    },
    scheduleTask: async (taskId, startAt, allDay, durationMin) => {
      const t = findTask(taskId);
      t.dueAt = startAt;
      t.isAllDay = allDay;
      t.durationMin = durationMin ?? null;
      t.updatedAt = nowIso();
    },

    listSubscriptions: async () => clone(subscriptions),
    addSubscription: async (url, name, color, refreshMin) => {
      const s: CalSubscription = {
        id: uid(),
        url,
        name,
        color: color ?? null,
        visible: true,
        refreshMin: refreshMin ?? 60,
        lastFetch: null,
      };
      subscriptions.push(s);
      return clone(s);
    },
    updateSubscription: async (id, patch) => {
      const s = subscriptions.find((x) => x.id === id);
      if (!s) throw new Error(`not found: subscription ${id}`);
      if (patch.name !== undefined) s.name = patch.name;
      if (patch.color !== undefined) s.color = patch.color;
      if (patch.visible !== undefined) s.visible = patch.visible;
      if (patch.refreshMin !== undefined) s.refreshMin = patch.refreshMin;
    },
    deleteSubscription: async (id) => {
      const i = subscriptions.findIndex((x) => x.id === id);
      if (i >= 0) subscriptions.splice(i, 1);
    },
    // ICS parse/generate and live fetch are Tauri-only (see docs/decisions.md).
    refreshSubscription: async () => 0,
    importIcs: async () => 0,
    exportIcs: async () => "",

    startFocus: async (target, kind, plannedMin) => {
      const s: FocusSession = {
        id: uid(),
        taskId: target.taskId ?? null,
        habitId: target.habitId ?? null,
        kind,
        startedAt: nowIso(),
        endedAt: null,
        pauseMs: 0,
        note: null,
        status: "RUNNING",
        plannedMin: plannedMin ?? null,
      };
      focusSessions.push(s);
      return clone(s);
    },
    completeFocus: async (id, pauseMs, note, status) => {
      const s = focusSessions.find((x) => x.id === id);
      if (!s) throw new Error(`not found: focus session ${id}`);
      s.endedAt = nowIso();
      s.pauseMs = Math.max(0, pauseMs);
      if (note !== null) s.note = note;
      s.status = status;
      return clone(s);
    },
    setFocusPaused: async (id, paused) => {
      const s = focusSessions.find((x) => x.id === id);
      if (!s) throw new Error(`not found: focus session ${id}`);
      s.status = paused ? "PAUSED" : "RUNNING";
    },
    activeFocus: async () => {
      const running = focusSessions
        .filter((s) => s.status === "RUNNING" || s.status === "PAUSED")
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return running[0] ? clone(running[0]) : null;
    },
    addFocusSession: async (taskId, kind, startedAt, endedAt, note) => {
      const s: FocusSession = {
        id: uid(),
        taskId,
        habitId: null,
        kind,
        startedAt,
        endedAt,
        pauseMs: 0,
        note: note ?? null,
        status: "DONE",
        plannedMin: null,
      };
      focusSessions.push(s);
      return clone(s);
    },
    updateFocusSession: async (id, patch) => {
      const s = focusSessions.find((x) => x.id === id);
      if (!s) throw new Error(`not found: focus session ${id}`);
      if (patch.startedAt !== undefined) s.startedAt = patch.startedAt;
      if (patch.endedAt !== undefined) s.endedAt = patch.endedAt;
      if (patch.note !== undefined) s.note = patch.note;
      return clone(s);
    },
    deleteFocusSession: async (id) => {
      const i = focusSessions.findIndex((x) => x.id === id);
      if (i >= 0) focusSessions.splice(i, 1);
    },
    listFocusSessions: async (from, to) =>
      clone(
        focusSessions
          .filter((s) => s.status === "DONE" && s.startedAt >= from && s.startedAt <= to)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      ),
    listTaskFocus: async (taskId) =>
      clone(
        focusSessions
          .filter((s) => s.status === "DONE" && s.taskId === taskId)
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      ),
    focusStats: async (from, to) => {
      const rows = focusSessions.filter(
        (s) => s.status === "DONE" && s.endedAt && s.startedAt >= from && s.startedAt <= to,
      );
      let totalMs = 0;
      let pomoCount = 0;
      const perDay = new Map<string, DayStat>();
      const perTask = new Map<string, FocusTaskStat>();
      const perTag = new Map<string, FocusTagStat>();
      for (const s of rows) {
        const ms = focusEffMs(s);
        const isPomo = s.kind === "POMO";
        totalMs += ms;
        if (isPomo) pomoCount += 1;

        const dayKey = focusLocalDay(s.startedAt);
        const day = perDay.get(dayKey) ?? { date: dayKey, ms: 0, pomos: 0 };
        day.ms += ms;
        day.pomos += isPomo ? 1 : 0;
        perDay.set(dayKey, day);

        const key = s.taskId ?? " none";
        const task = tasks.find((t) => t.id === s.taskId);
        const stat = perTask.get(key) ?? {
          taskId: s.taskId,
          title: s.taskId ? (task?.title ?? "(deleted task)") : "No task",
          ms: 0,
          pomos: 0,
        };
        stat.ms += ms;
        stat.pomos += isPomo ? 1 : 0;
        perTask.set(key, stat);

        for (const tagId of task?.tagIds ?? []) {
          const tag = tags.find((t) => t.id === tagId);
          const ts = perTag.get(tagId) ?? { tagId, name: tag?.name ?? "?", ms: 0 };
          ts.ms += ms;
          perTag.set(tagId, ts);
        }
      }
      return {
        totalMs,
        pomoCount,
        perDay: [...perDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
        perTask: [...perTask.values()].sort((a, b) => b.ms - a.ms),
        perTag: [...perTag.values()].sort((a, b) => b.ms - a.ms),
      };
    },
    taskFocusActuals: async (taskId) => {
      const rows = focusSessions.filter((s) => s.status === "DONE" && s.taskId === taskId);
      return {
        actualMs: rows.reduce((sum, s) => sum + focusEffMs(s), 0),
        actualPomos: rows.filter((s) => s.kind === "POMO").length,
      };
    },

    achievementInfo: async () => {
      const score = achievements.reduce((sum, a) => sum + a.delta, 0);
      const lv = levelFor(score);
      return { score, level: lv.level, title: lv.title, base: lv.base, next: lv.next };
    },
    scoreHistory: async (from, to) => {
      const before = achievements
        .filter((a) => a.date < from)
        .reduce((sum, a) => sum + a.delta, 0);
      const byDate = new Map<string, number>();
      for (const a of achievements) {
        if (a.date >= from && a.date <= to) byDate.set(a.date, (byDate.get(a.date) ?? 0) + a.delta);
      }
      let cum = before;
      return [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, delta]) => {
          cum += delta;
          return { date, delta, cumulative: cum };
        });
    },
    statsSummary: async (from, to) => {
      // Bucket by the *local* completion day (matching the Rust path), so `from`/
      // `to` (local YYYY-MM-DD) line up with completedAt stored in UTC.
      const rows = taskCompletions.filter((c) => {
        const day = focusLocalDay(c.completedAt);
        return day >= from && day <= to;
      });
      const perDay = new Map<string, number>();
      const weekday = new Array(7).fill(0);
      const hour = new Array(24).fill(0);
      let lateCount = 0;
      for (const c of rows) {
        const d = new Date(c.completedAt);
        const dayKey = focusLocalDay(c.completedAt);
        perDay.set(dayKey, (perDay.get(dayKey) ?? 0) + 1);
        weekday[(d.getDay() + 6) % 7] += 1; // 0=Mon..6=Sun
        hour[d.getHours()] += 1;
        if (c.occurrenceAt && c.completedAt.slice(0, 10) > c.occurrenceAt.slice(0, 10)) lateCount += 1;
      }
      const dueInPeriod = tasks.filter(
        (t) =>
          t.kind !== "NOTE" &&
          t.dueAt &&
          t.dueAt.slice(0, 10) >= from &&
          t.dueAt.slice(0, 10) <= to,
      );
      const completedDue = dueInPeriod.filter((t) => t.status === "COMPLETED").length;
      const completionRate = dueInPeriod.length > 0 ? completedDue / dueInPeriod.length : 0;
      const overdueCount = tasks.filter(
        (t) => t.status === "ACTIVE" && t.kind !== "NOTE" && t.dueAt && t.dueAt.slice(0, 10) < to,
      ).length;
      const focusMs = focusSessions
        .filter(
          (s) =>
            s.status === "DONE" &&
            s.endedAt &&
            s.startedAt >= `${from}T00:00:00.000Z` &&
            s.startedAt <= `${to}T23:59:59.999Z`,
        )
        .reduce((sum, s) => sum + focusEffMs(s), 0);
      return {
        completedCount: rows.length,
        completionRate,
        focusMs,
        perDay: [...perDay.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count })),
        weekday,
        hour,
        lateCount,
        overdueCount,
      };
    },

    // The REST server can't run in the browser; the stub just tracks the config
    // in memory so the Settings UI works. copyTaskLink mirrors the Rust command.
    apiConfig: async () => ({ ...apiCfg }),
    apiSetEnabled: async (enabled) => {
      apiCfg.enabled = enabled;
      return { ...apiCfg };
    },
    apiRegenerateToken: async () => {
      apiCfg.token = crypto.randomUUID().replace(/-/g, "");
      return apiCfg.token;
    },
    copyTaskLink: async (id) => `toodoo://task/${id}`,

    // Exports build strings from the in-memory store, mirroring the Rust exporters.
    exportJson: async () =>
      JSON.stringify({ app: "toodoo", version: 1, projects, tasks, tags }, null, 2),
    exportCsv: async () => {
      const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
      const nameOf = (id: string) => projects.find((p) => p.id === id)?.name ?? "";
      const header = ["List Name", "Title", "Content", "Priority", "Status", "Due Date", "Start Date", "Tags"];
      const rows = tasks
        .filter((t) => t.status !== "TRASHED")
        .map((t) =>
          [
            nameOf(t.projectId),
            t.title,
            t.contentPlain ?? "",
            String(t.priority),
            t.status === "COMPLETED" ? "Completed" : "Normal",
            t.dueAt ?? "",
            t.startAt ?? "",
            (t.tagIds ?? []).join(","),
          ]
            .map(q)
            .join(","),
        );
      return [header.join(","), ...rows].join("\n") + "\n";
    },
    exportMarkdown: async () => {
      let out = "# Toodoo export\n";
      for (const p of projects) {
        const items = tasks.filter((t) => t.projectId === p.id && t.status !== "TRASHED");
        out += `\n## ${p.name}\n\n`;
        if (items.length === 0) out += "_(empty)_\n";
        for (const t of items) out += `- [${t.status === "COMPLETED" ? "x" : " "}] ${t.title}\n`;
      }
      return out;
    },
    importCsv: async (kind, text) => {
      const rows = parseCsv(kind, text);
      for (const row of rows) {
        const name = row.list.trim();
        let projectId = INBOX_ID;
        if (name && name.toLowerCase() !== "inbox") {
          const existing = projects.find((p) => p.name.toLowerCase() === name.toLowerCase());
          projectId = existing ? existing.id : (await self.createProject({ name })).id;
        }
        const created = await self.createTask({
          projectId,
          title: row.title,
          priority: (row.priority ?? undefined) as Priority | undefined,
          dueAt: row.dueAt ?? undefined,
          startAt: row.startAt ?? undefined,
        });
        if (row.content) await self.updateTask(created.id, { contentPlain: row.content });
        // Parsed tags are attached (resolved or created case-insensitively),
        // mirroring the Rust importer.
        for (const tagName of row.tags) {
          const trimmed = tagName.trim();
          if (!trimmed) continue;
          const existingTag = (await self.listTags()).find(
            (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
          );
          const tagId = existingTag ? existingTag.id : (await self.createTag(trimmed)).id;
          await self.assignTag(created.id, tagId);
        }
        if (row.completed) await self.completeTask(created.id);
      }
      return rows.length;
    },
    createBackup: async () => {
      const info: BackupInfo = {
        name: `toodoo-${new Date().toISOString().replace(/[:.]/g, "")}.db`,
        path: `backups/stub-${backups.length + 1}.db`,
        bytes: 4096,
        createdAt: new Date().toISOString(),
      };
      backups.unshift(info);
      backupCfg.lastAt = info.createdAt;
      return info;
    },
    listBackups: async () => backups.map((b) => ({ ...b })),
    restoreBackup: async () => {
      /* staged for next launch — no-op in the browser */
    },
    deleteBackup: async (path) => {
      const i = backups.findIndex((b) => b.path === path);
      if (i >= 0) backups.splice(i, 1);
    },
    backupConfig: async () => ({ ...backupCfg }),
    setBackupConfig: async (autoEnabled, keep) => {
      backupCfg.autoEnabled = autoEnabled;
      backupCfg.keep = Math.max(1, keep);
      return { ...backupCfg };
    },

    desktopConfig: async () => ({ ...desktopCfg }),
    setQuickAddHotkey: async (accel) => {
      if (accel.trim()) desktopCfg.quickAddHotkey = accel.trim();
      return { ...desktopCfg };
    },
    setSimplePopouts: async (on) => {
      desktopCfg.simplePopouts = on;
      return clone(desktopCfg);
    },
    setPopoutStyle: async (style) => {
      desktopCfg.popoutStyle = style;
      return clone(desktopCfg);
    },
    setNotifActions: async (on) => {
      desktopCfg.notifActions = on;
      return { ...desktopCfg };
    },
    setNotifSnoozeMin: async (minutes) => {
      desktopCfg.notifSnoozeMin = Math.min(720, Math.max(1, minutes));
      return { ...desktopCfg };
    },
    setAutostart: async (on) => {
      desktopCfg.autostart = on;
      return { ...desktopCfg };
    },
    setCloseToTray: async (on) => {
      desktopCfg.closeToTray = on;
      return { ...desktopCfg };
    },
    setStartMinimized: async (on) => {
      desktopCfg.startMinimized = on;
      return { ...desktopCfg };
    },
    openQuickAddWindow: async () => {
      /* native-only; no-op in the browser */
    },
    openFocusWindow: async () => {},
    openStickyWindow: async () => {},
    openLogsFolder: async () => {},
    showMainWindow: async () => {},
    sendTestNotification: async () => {
      // Browser stub: exercise the in-app toast path only.
      window.dispatchEvent(
        new CustomEvent("toodoo-reminder-fired", {
          detail: { taskId: "test", reminderId: "test", title: "Test notification (in-app path)" },
        }),
      );
      return "browser stub: in-app toast emitted";
    },
    seedSampleData: async (force) => {
      // Browser stub: a representative subset of the Rust sample seed, enough
      // to drive the first-run prompt and give the UI something to render.
      if (!force && tasks.length > 0) {
        throw new Error("the workspace already has tasks — sample data must be loaded explicitly");
      }
      const day = (d: number) =>
        new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10) + "T00:00:00.000Z";
      const work = await self.createProject({ name: "Work" });
      const personal = await self.createProject({ name: "Personal" });
      await self.createTask({ projectId: personal.id, title: "Pay the electricity bill", dueAt: day(-1), priority: 5 });
      await self.createTask({ projectId: personal.id, title: "Water the plants", dueAt: day(0), priority: 3 });
      await self.createTask({ projectId: work.id, title: "Review the quarterly report", dueAt: day(0), priority: 1 });
      await self.createTask({ projectId: personal.id, title: "Return the library books", dueAt: day(1) });
      await self.createTask({ projectId: work.id, title: "Prepare the demo script", dueAt: day(5), priority: 3 });
      await self.createTask({ projectId: personal.id, title: "Research summer trip ideas" });
      await self.createTask({
        projectId: personal.id,
        title: "Journal for five minutes",
        dueAt: day(0),
        rrule: "FREQ=DAILY",
      });
      const done = await self.createTask({ projectId: personal.id, title: "Book flights", dueAt: day(1) });
      await self.completeTask(done.id);
    },
    todayCount: async () => {
      const { today } = localDateParams();
      return tasks.filter(
        (t) => t.status === "ACTIVE" && t.kind !== "NOTE" && (effDate(t) ?? "9999") <= today,
      ).length;
    },

    listHabits: async (includeArchived) =>
      clone(
        habits
          .filter((h) => includeArchived || !h.archived)
          .sort((a, b) => a.sortOrder - b.sortOrder),
      ),
    getHabit: async (id) => {
      const h = habits.find((x) => x.id === id);
      if (!h) throw new Error(`not found: habit ${id}`);
      return clone(h);
    },
    createHabit: async (input) => {
      const h: Habit = {
        id: uid(),
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        quote: input.quote ?? null,
        goalKind: input.goalKind,
        goalAmount: input.goalAmount ?? null,
        unit: input.unit ?? null,
        freqJson: JSON.stringify(input.freq),
        section: input.section ?? null,
        remindersJson: JSON.stringify(input.reminders ?? []),
        startDate: input.startDate ?? null,
        goalDays: input.goalDays ?? null,
        autoLogPopup: input.autoLogPopup ?? false,
        archived: false,
        sortOrder: habits.length,
      };
      habits.push(h);
      return clone(h);
    },
    updateHabit: async (id, input) => {
      const h = habits.find((x) => x.id === id);
      if (!h) throw new Error(`not found: habit ${id}`);
      Object.assign(h, {
        name: input.name,
        icon: input.icon ?? null,
        color: input.color ?? null,
        quote: input.quote ?? null,
        goalKind: input.goalKind,
        goalAmount: input.goalAmount ?? null,
        unit: input.unit ?? null,
        freqJson: JSON.stringify(input.freq),
        section: input.section ?? null,
        remindersJson: JSON.stringify(input.reminders ?? []),
        startDate: input.startDate ?? null,
      });
      return clone(h);
    },
    setHabitArchived: async (id, archived) => {
      const h = habits.find((x) => x.id === id);
      if (!h) throw new Error(`not found: habit ${id}`);
      h.archived = archived;
    },
    deleteHabit: async (id) => {
      const i = habits.findIndex((x) => x.id === id);
      if (i >= 0) habits.splice(i, 1);
    },
    reorderHabit: async (id, afterId) => {
      const h = habits.find((x) => x.id === id);
      if (!h) throw new Error(`not found: habit ${id}`);
      const rest = habits.filter((x) => x.id !== id).sort((a, b) => a.sortOrder - b.sortOrder);
      const at = afterId === null ? 0 : rest.findIndex((x) => x.id === afterId) + 1;
      rest.splice(at, 0, h);
      rest.forEach((x, idx) => (x.sortOrder = idx));
    },
    recordCheckin: async (habitId, date, status, value, note) => {
      const existing = habitCheckins.find((c) => c.habitId === habitId && c.date === date);
      if (existing) {
        existing.status = status;
        existing.value = value ?? null;
        existing.note = note ?? null;
        return clone(existing);
      }
      const c: HabitCheckin = {
        id: uid(),
        habitId,
        date,
        value: value ?? null,
        status,
        note: note ?? null,
      };
      habitCheckins.push(c);
      return clone(c);
    },
    deleteCheckin: async (habitId, date) => {
      const i = habitCheckins.findIndex((c) => c.habitId === habitId && c.date === date);
      if (i >= 0) habitCheckins.splice(i, 1);
    },
    listCheckins: async (habitId, from, to) =>
      clone(
        habitCheckins
          .filter((c) => c.habitId === habitId && c.date >= from && c.date <= to)
          .sort((a, b) => b.date.localeCompare(a.date)),
      ),
    habitStats: async (habitId) => {
      const h = habits.find((x) => x.id === habitId);
      if (!h) throw new Error(`not found: habit ${habitId}`);
      const freq: HabitFreq = JSON.parse(h.freqJson);
      const today = localDateParams().today;
      const marks = habitMarks(habitId);
      const s = habitStreak(freq, marks, today);
      const from = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return {
        currentStreak: s.current,
        bestStreak: s.best,
        totalCheckins: marks.filter(([, st]) => st === "DONE").length,
        completionRate: habitCompletionRate(freq, marks, from, today),
      };
    },
    listTodayHabits: async () => {
      const today = localDateParams().today;
      const out: HabitToday[] = [];
      for (const h of habits.filter((x) => !x.archived).sort((a, b) => a.sortOrder - b.sortOrder)) {
        const freq: HabitFreq = JSON.parse(h.freqJson);
        if (!habitIsScheduled(freq, today)) continue;
        if (h.startDate && h.startDate > today) continue;
        const c = habitCheckins.find((x) => x.habitId === h.id && x.date === today);
        out.push({
          habit: clone(h),
          status: c?.status ?? null,
          value: c?.value ?? null,
          streak: habitStreak(freq, habitMarks(h.id), today).current,
        });
      }
      return out;
    },

    setTaskKind: async (id, kind) => {
      const t = findTask(id);
      t.kind = kind;
      t.updatedAt = nowIso();
    },

    listCountdowns: async () =>
      clone(countdowns.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned))),
    createCountdown: async (title, targetDate, repeatAnnual, styleJson) => {
      const c: Countdown = { id: uid(), title, targetDate, repeatAnnual, styleJson: styleJson ?? null, pinned: false };
      countdowns.push(c);
      return clone(c);
    },
    updateCountdown: async (id, patch) => {
      const c = countdowns.find((x) => x.id === id);
      if (!c) throw new Error(`not found: countdown ${id}`);
      if (patch.title !== undefined) c.title = patch.title;
      if (patch.targetDate !== undefined) c.targetDate = patch.targetDate;
      if (patch.repeatAnnual !== undefined) c.repeatAnnual = patch.repeatAnnual;
      if (patch.styleJson !== undefined) c.styleJson = patch.styleJson;
      return clone(c);
    },
    setCountdownPinned: async (id, pinned) => {
      const c = countdowns.find((x) => x.id === id);
      if (!c) throw new Error(`not found: countdown ${id}`);
      c.pinned = pinned;
    },
    deleteCountdown: async (id) => {
      const i = countdowns.findIndex((x) => x.id === id);
      if (i >= 0) countdowns.splice(i, 1);
    },

    listStickies: async () =>
      clone(
        stickies
          .filter((s) => s.open)
          .map((s) => {
            const t = tasks.find((x) => x.id === s.noteId);
            return t
              ? {
                  id: s.id,
                  noteId: s.noteId,
                  title: t.title,
                  contentPlain: t.contentPlain,
                  x: s.x,
                  y: s.y,
                  w: s.w,
                  h: s.h,
                  color: s.color,
                }
              : null;
          })
          .filter((v): v is StickyView => v !== null),
      ),
    newQuickSticky: async (text, color) => {
      const note = await self.createTask({ projectId: INBOX_ID, title: text, kind: "NOTE" });
      const id = uid();
      stickies.push({ id, noteId: note.id, x: 40, y: 40, w: 240, h: 220, color: color ?? "#ffd97d", open: true });
      return id;
    },
    stickyFromNote: async (noteId, color) => {
      const id = uid();
      stickies.push({ id, noteId, x: 40, y: 40, w: 240, h: 220, color: color ?? "#ffd97d", open: true });
      return id;
    },
    stickyFromTask: async (taskId, color) => {
      const id = uid();
      stickies.push({ id, noteId: taskId, x: 40, y: 40, w: 240, h: 220, color: color ?? "#ffd97d", open: true });
      return id;
    },
    updateSticky: async (id, patch) => {
      const s = stickies.find((x) => x.id === id);
      if (!s) throw new Error(`not found: sticky ${id}`);
      if (patch.x !== undefined) s.x = patch.x;
      if (patch.y !== undefined) s.y = patch.y;
      if (patch.w !== undefined) s.w = patch.w;
      if (patch.h !== undefined) s.h = patch.h;
      if (patch.color !== undefined) s.color = patch.color;
    },
    closeSticky: async (id) => {
      const s = stickies.find((x) => x.id === id);
      if (s) s.open = false;
    },
    deleteSticky: async (id) => {
      const i = stickies.findIndex((x) => x.id === id);
      if (i >= 0) stickies.splice(i, 1);
    },

    getSetting: async (key) => clone(settings.get(key) ?? null),
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
    seedDemoData: async (tasksN = 10_000, projectsN = 20) => {
      // Dev/perf fixture: bulk-push tasks straight into the in-memory store
      // (mirrors the Rust seed_demo_data command used in the Tauri app).
      const projectIds: string[] = [];
      for (let i = 0; i < projectsN; i++) {
        const id = uid();
        projects.push({
          id,
          folderId: null,
          name: `Seed project ${i}`,
          color: null,
          icon: null,
          kind: "TASK",
          viewMode: "LIST",
          muted: false,
          sortOrder: i + 100,
          closed: false,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
        projectIds.push(id);
      }
      const base = nowIso();
      for (let i = 0; i < tasksN; i++) {
        const dued = i % 5 !== 0;
        const day = new Date(Date.now() + ((i % 61) - 30) * 86_400_000);
        tasks.push({
          id: uid(),
          projectId: projectIds[i % projectIds.length],
          sectionId: null,
          parentId: null,
          title: `Seed task ${i} — lorem ipsum dolor`,
          contentRich: null,
          contentPlain: null,
          kind: "TASK",
          status: "ACTIVE",
          priority: [0, 1, 3, 5][i % 4] as Priority,
          startAt: null,
          dueAt: dued ? `${day.toISOString().slice(0, 10)}T00:00:00.000Z` : null,
          isAllDay: true,
          durationMin: null,
          timeZone: null,
          rrule: null,
          repeatFrom: null,
          pinned: false,
          estPomos: null,
          estDurationMin: null,
          sortOrder: (i + 1) * 1024,
          completedAt: null,
          createdAt: base,
          updatedAt: base,
          tagIds: [],
        });
      }
    },
  };
  return self;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Api = isTauri ? tauriApi : browserStubApi();
