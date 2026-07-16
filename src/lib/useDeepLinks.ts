import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type Priority } from "./api";
import { useUiStore } from "./uiStore";

/** A `toodoo://` action forwarded from the Rust deep-link handler. */
type DeepLinkAction =
  | { kind: "openTask"; id: string }
  | { kind: "openProject"; id: string }
  | { kind: "quickAdd"; title?: string; list?: string; priority?: string; due?: string };

const PRIORITY: Record<string, Priority> = { high: 5, medium: 3, low: 1, none: 0 };

/**
 * Handle `toodoo://` deep links forwarded from the backend: open a task/project
 * or quick-add a task. No-op outside Tauri.
 */
export function useDeepLinks(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<DeepLinkAction>("deep-link", async ({ payload }) => {
        const { setView, selectTask } = useUiStore.getState();
        switch (payload.kind) {
          case "openTask":
            selectTask(payload.id);
            break;
          case "openProject":
            setView({ kind: "project", projectId: payload.id });
            break;
          case "quickAdd": {
            const projectId = payload.list ?? "inbox";
            setView({ kind: "project", projectId });
            if (payload.title) {
              await api.createTask({
                projectId,
                title: payload.title,
                priority: payload.priority ? PRIORITY[payload.priority.toLowerCase()] : undefined,
                dueAt: payload.due,
              });
              void queryClient.invalidateQueries({ queryKey: ["tasks"] });
              void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
            }
            break;
          }
        }
      }).then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      }),
    );

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [queryClient]);
}
