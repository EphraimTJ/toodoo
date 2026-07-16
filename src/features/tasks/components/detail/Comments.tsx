import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { api, type Task } from "../../../../lib/api";

/** Single-user running comment thread on a task (plain text). */
export function Comments({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["comments", task.id] });

  const { data: comments } = useQuery({
    queryKey: ["comments", task.id],
    queryFn: () => api.listComments(task.id),
  });
  const add = useMutation({
    mutationFn: (body: string) => api.addComment(task.id, body),
    onSuccess: () => {
      setDraft("");
      invalidate();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteComment(id), onSuccess: invalidate });

  return (
    <section className="mt-4" data-testid="task-comments">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Comments</h3>
      <ul className="mt-1 space-y-1">
        {(comments ?? []).map((c) => (
          <li key={c.id} className="group rounded-md bg-bg px-2 py-1 text-sm">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{c.body}</span>
              <button
                type="button"
                aria-label="Delete comment"
                className="text-xs text-text-muted opacity-0 hover:text-red-500 group-hover:opacity-100"
                onClick={() => remove.mutate(c.id)}
              >
                ✕
              </button>
            </div>
            <time className="text-[10px] text-text-muted">{format(parseISO(c.createdAt), "MMM d, h:mm a")}</time>
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) add.mutate(draft.trim());
        }}
      >
        <input
          aria-label="Add comment"
          data-testid="comment-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="rounded-md bg-accent px-2.5 py-1 text-xs text-accent-fg disabled:opacity-40"
        >
          Post
        </button>
      </form>
    </section>
  );
}
