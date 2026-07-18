import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";

const DISMISS_KEY = "seed.promptDismissed";

/**
 * First-run card: offers to load the sample workspace when the app is
 * completely empty (no tasks, no lists beyond the Inbox) and the prompt was
 * never dismissed. Never auto-seeds.
 */
export function SampleDataPrompt() {
  const queryClient = useQueryClient();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        if ((await api.getSetting(DISMISS_KEY)) === true) return;
        const [projects, inboxTasks] = await Promise.all([
          api.listProjects(),
          api.listProjectTasks("inbox"),
        ]);
        const empty = projects.length <= 1 && inboxTasks.length === 0;
        if (!cancelled && empty) setShow(true);
      } catch {
        // If the check fails, never nag.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    void api.setSetting(DISMISS_KEY, true);
  };

  const load = async () => {
    setLoading(true);
    try {
      await api.seedSampleData(false);
      void api.setSetting(DISMISS_KEY, true);
      await queryClient.invalidateQueries();
      setShow(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed bottom-6 left-1/2 z-40 w-96 -translate-x-1/2 rounded-lg border border-border bg-surface p-4 shadow-xl"
      data-testid="sample-data-prompt"
    >
      <div className="text-sm font-semibold">Start with sample data?</div>
      <p className="mt-1 text-xs text-text-muted">
        Load a small example workspace — tasks, lists, tags, habits, notes, and
        more — so you can explore every feature. You can delete it all later.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={loading}
          className="rounded-md bg-accent px-2.5 py-1 text-xs text-accent-fg hover:opacity-90"
          onClick={() => void load()}
        >
          {loading ? "Loading…" : "Load sample data"}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-bg"
          onClick={dismiss}
        >
          No thanks
        </button>
      </div>
    </div>
  );
}
