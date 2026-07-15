import { invoke } from "@tauri-apps/api/core";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };

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

export interface NewProject {
  name: string;
  color?: string;
  icon?: string;
  kind?: "TASK" | "NOTE";
}

interface Api {
  listProjects(): Promise<Project[]>;
  createProject(input: NewProject): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  getSetting(key: string): Promise<JsonValue | null>;
  setSetting(key: string, value: JsonValue): Promise<void>;
}

const tauriApi: Api = {
  listProjects: () => invoke<Project[]>("list_projects"),
  createProject: (input) => invoke<Project>("create_project", { input }),
  deleteProject: (id) => invoke<void>("delete_project", { id }),
  getSetting: (key) => invoke<JsonValue | null>("get_setting", { key }),
  setSetting: (key, value) => invoke<void>("set_setting", { key, value }),
};

/* In-memory stub for plain-browser contexts (vite dev without Tauri,
   Playwright). Real persistence only exists through the Rust repository
   layer — this is a dev/test convenience, never a data store. */
function browserStubApi(): Api {
  const settings = new Map<string, JsonValue>();
  const projects: Project[] = [];
  return {
    listProjects: async () => [...projects],
    createProject: async (input) => {
      const now = new Date().toISOString();
      const project: Project = {
        id: crypto.randomUUID(),
        folderId: null,
        name: input.name,
        color: input.color ?? null,
        icon: input.icon ?? null,
        kind: input.kind ?? "TASK",
        viewMode: "LIST",
        muted: false,
        sortOrder: projects.length,
        closed: false,
        createdAt: now,
        updatedAt: now,
      };
      projects.push(project);
      return project;
    },
    deleteProject: async (id) => {
      const i = projects.findIndex((p) => p.id === id);
      if (i >= 0) projects.splice(i, 1);
    },
    getSetting: async (key) => settings.get(key) ?? null,
    setSetting: async (key, value) => {
      settings.set(key, value);
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const api: Api = isTauri ? tauriApi : browserStubApi();
