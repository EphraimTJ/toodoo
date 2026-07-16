import { useEffect, useMemo, useState } from "react";
import type { SearchFilters } from "../../../lib/api";
import { useUiStore } from "../../../lib/uiStore";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTags } from "../../tags/hooks/useTags";
import {
  useAddRecentSearch,
  useRecentSearches,
  useSavedSearches,
  useSearchResults,
} from "../hooks/useSearch";

const field = "rounded border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-accent";

/** Strip empty facets so the query key and backend see a minimal filter object. */
function clean(f: SearchFilters): SearchFilters {
  const out: SearchFilters = {};
  if (f.projectId) out.projectId = f.projectId;
  if (f.tagId) out.tagId = f.tagId;
  if (f.status) out.status = f.status;
  if (f.dueFrom) out.dueFrom = f.dueFrom;
  if (f.dueTo) out.dueTo = f.dueTo;
  return out;
}

export function SearchView() {
  const { searchSeed, setView, selectTask } = useUiStore();
  const [query, setQuery] = useState(searchSeed);
  const [filters, setFilters] = useState<SearchFilters>({});

  // Consume the seed once on mount.
  useEffect(() => {
    if (searchSeed) useUiStore.setState({ searchSeed: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleaned = useMemo(() => clean(filters), [filters]);
  const { data: results } = useSearchResults(query, cleaned);
  const { data: projects } = useProjects();
  const { data: tags } = useTags();
  const { data: recent } = useRecentSearches();
  const saved = useSavedSearches();
  const addRecent = useAddRecentSearch();

  const commit = () => {
    if (query.trim()) addRecent.mutate(query.trim());
  };

  const setFilter = (patch: Partial<SearchFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const openTask = (taskId: string, projectId: string) => {
    setView({ kind: "project", projectId });
    selectTask(taskId);
  };

  const tasks = results?.tasks ?? [];
  const habitHits = results?.habits ?? [];
  const tagHits = results?.tags ?? [];
  const nothing = query.trim() !== "" && tasks.length + habitHits.length + tagHits.length === 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4" data-testid="search-view">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          autoFocus
          aria-label="Search"
          data-testid="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={commit}
          placeholder="Search tasks, notes, habits, tags…"
          className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </form>

      {/* Filters */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by list"
          className={field}
          value={filters.projectId ?? ""}
          onChange={(e) => setFilter({ projectId: e.target.value || undefined })}
        >
          <option value="">Any list</option>
          {(projects ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by tag"
          className={field}
          value={filters.tagId ?? ""}
          onChange={(e) => setFilter({ tagId: e.target.value || undefined })}
        >
          <option value="">Any tag</option>
          {(tags ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              #{t.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by status"
          data-testid="search-status-filter"
          className={field}
          value={filters.status ?? ""}
          onChange={(e) => setFilter({ status: e.target.value || undefined })}
        >
          <option value="">Any status</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <input
          type="date"
          aria-label="Due from"
          className={field}
          value={filters.dueFrom ?? ""}
          onChange={(e) => setFilter({ dueFrom: e.target.value || undefined })}
        />
        <input
          type="date"
          aria-label="Due to"
          className={field}
          value={filters.dueTo ?? ""}
          onChange={(e) => setFilter({ dueTo: e.target.value || undefined })}
        />
        <button
          type="button"
          data-testid="save-search"
          className="ml-auto rounded border border-border px-2 py-1 text-xs hover:bg-bg disabled:opacity-40"
          disabled={!query.trim()}
          onClick={() =>
            saved.create.mutate({
              query: query.trim(),
              filtersJson: Object.keys(cleaned).length ? JSON.stringify(cleaned) : null,
            })
          }
        >
          Save search
        </button>
      </div>

      {/* Recent + saved */}
      {query.trim() === "" && (
        <div className="mt-4 space-y-3">
          {(recent ?? []).length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Recent</h3>
              <div className="flex flex-wrap gap-1.5">
                {(recent ?? []).map((r) => (
                  <button
                    key={r}
                    type="button"
                    data-testid="recent-search"
                    onClick={() => setQuery(r)}
                    className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-bg"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Saved</h3>
            <ul className="space-y-1 text-sm" data-testid="saved-search-list">
              {(saved.list.data ?? []).length === 0 && (
                <li className="text-xs text-text-muted">No saved searches.</li>
              )}
              {(saved.list.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-bg"
                    onClick={() => {
                      setQuery(s.query);
                      setFilters(s.filtersJson ? (JSON.parse(s.filtersJson) as SearchFilters) : {});
                    }}
                  >
                    {s.query}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete saved search ${s.query}`}
                    className="rounded border border-border px-1.5 py-0.5 text-xs text-text-muted hover:text-red-500"
                    onClick={() => saved.remove.mutate(s.id)}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Results */}
      <div className="mt-4 space-y-4">
        {nothing && <p className="text-sm text-text-muted">No matches.</p>}

        {tasks.length > 0 && (
          <Group title="Tasks">
            {tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid="search-task-result"
                onClick={() => openTask(t.id, t.projectId)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg"
              >
                <span className={`text-xs ${t.status === "COMPLETED" ? "text-green-500" : "text-text-muted"}`}>
                  {t.status === "COMPLETED" ? "✓" : "○"}
                </span>
                <span className="min-w-0 truncate">{t.title}</span>
                <span className="ml-auto truncate text-xs text-text-muted">
                  {(projects ?? []).find((p) => p.id === t.projectId)?.name}
                </span>
              </button>
            ))}
          </Group>
        )}

        {habitHits.length > 0 && (
          <Group title="Habits">
            {habitHits.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setView({ kind: "habits" })}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg"
              >
                {h.name}
              </button>
            ))}
          </Group>
        )}

        {tagHits.length > 0 && (
          <Group title="Tags">
            {tagHits.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setView({ kind: "tag", tagId: t.id })}
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-bg"
              >
                #{t.name}
              </button>
            ))}
          </Group>
        )}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</h3>
      <div>{children}</div>
    </section>
  );
}
