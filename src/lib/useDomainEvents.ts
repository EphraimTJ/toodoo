import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Subscribe to backend domain events and invalidate the affected query keys,
 * so every view updates live no matter where a mutation originated
 * (UI, future REST API, scheduler). No-op outside Tauri.
 */
export function useDomainEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;

    let unlisten: (() => void) | undefined;
    let disposed = false;

    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen<{ type: string }>("domain-event", ({ payload }) => {
        const [entity] = payload.type.split(".");
        switch (entity) {
          case "task":
          case "checkitem":
          case "seed":
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            void queryClient.invalidateQueries({ queryKey: ["checkItems"] });
            void queryClient.invalidateQueries({ queryKey: ["activity"] });
            void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
            if (entity === "seed") {
              void queryClient.invalidateQueries({ queryKey: ["projects"] });
            }
            break;
          case "reminder":
            void queryClient.invalidateQueries({ queryKey: ["reminders"] });
            break;
          case "template":
            void queryClient.invalidateQueries({ queryKey: ["templates"] });
            break;
          case "section":
            void queryClient.invalidateQueries({ queryKey: ["sections"] });
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            break;
          case "filter":
            void queryClient.invalidateQueries({ queryKey: ["filters"] });
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            break;
          case "matrix":
            void queryClient.invalidateQueries({ queryKey: ["matrix"] });
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            break;
          case "calendar":
            void queryClient.invalidateQueries({ queryKey: ["calendar"] });
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            break;
          case "subscription":
            void queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
            void queryClient.invalidateQueries({ queryKey: ["calendar"] });
            break;
          case "focus":
            void queryClient.invalidateQueries({ queryKey: ["focus"] });
            break;
          case "habit":
            void queryClient.invalidateQueries({ queryKey: ["habits"] });
            break;
          case "project":
          case "folder":
            void queryClient.invalidateQueries({ queryKey: ["projects"] });
            void queryClient.invalidateQueries({ queryKey: ["folders"] });
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
            break;
          case "tag":
            void queryClient.invalidateQueries({ queryKey: ["tags"] });
            void queryClient.invalidateQueries({ queryKey: ["tasks"] });
            break;
          case "setting":
            void queryClient.invalidateQueries({ queryKey: ["setting"] });
            break;
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
