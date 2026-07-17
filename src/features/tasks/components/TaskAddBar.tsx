import { INBOX_ID, localDateParams } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { QuickAddBar } from "../../quickadd/components/QuickAddBar";
import type { QuickAddDefaults } from "../../quickadd/hooks/useQuickAdd";

/** Where a task created from the current view should land, with what date/tag. */
function creationDefaults(view: ReturnType<typeof useUiStore.getState>["view"]): QuickAddDefaults {
  const { today } = localDateParams();
  if (view.kind === "project") return { projectId: view.projectId };
  if (view.kind === "tag") return { projectId: INBOX_ID, tagId: view.tagId };
  if (view.kind !== "smart") return { projectId: INBOX_ID };
  switch (view.view) {
    case "today":
      return { projectId: INBOX_ID, dueAt: `${today}T00:00:00.000Z` };
    case "tomorrow": {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return { projectId: INBOX_ID, dueAt: `${localDateParams(d).today}T00:00:00.000Z` };
    }
    default:
      return { projectId: INBOX_ID };
  }
}

export function TaskAddBar() {
  const view = useUiStore((s) => s.view);
  return <QuickAddBar defaults={creationDefaults(view)} />;
}
