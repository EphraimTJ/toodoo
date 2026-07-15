import { useState } from "react";
import { api, type Condition, type Filter, type Rule, type RuleMatch } from "../../../lib/api";
import { useProjects } from "../../projects/hooks/useProjects";
import { useTags } from "../../tags/hooks/useTags";
import { useFilters } from "../hooks/useFilters";

const FIELDS: [Condition["field"], string][] = [
  ["list", "List"],
  ["tag", "Tag"],
  ["priority", "Priority"],
  ["due", "Due"],
  ["keyword", "Keyword"],
  ["kind", "Type"],
  ["status", "Status"],
];

const PRIORITY_OPTS: [number, string][] = [
  [5, "High"],
  [3, "Medium"],
  [1, "Low"],
  [0, "None"],
];
const DUE_OPTS = ["overdue", "today", "tomorrow", "next7", "none"] as const;
const STATUS_OPTS = ["ACTIVE", "COMPLETED", "WONT_DO"];
const KIND_OPTS = ["TASK", "NOTE"];

const select = "rounded border border-border bg-bg px-1.5 py-1 text-sm outline-none focus:border-accent";

interface Props {
  filter?: Filter;
  onClose(): void;
  onSaved?(id: string): void;
}

export function FilterBuilder({ filter, onClose, onSaved }: Props) {
  const { data: projects } = useProjects();
  const { data: tags } = useTags();
  const { createFilter, updateFilter } = useFilters();

  const [name, setName] = useState(filter?.name ?? "");
  const initial: Rule = filter ? JSON.parse(filter.ruleJson) : { match: "all", conditions: [] };
  const [match, setMatch] = useState<RuleMatch>(initial.match);
  const [conditions, setConditions] = useState<Condition[]>(initial.conditions);
  const [queryText, setQueryText] = useState("");

  const defaultFor = (field: Condition["field"]): Condition => {
    switch (field) {
      case "list":
        return { field: "list", ids: [projects?.[0]?.id ?? ""] };
      case "tag":
        return { field: "tag", ids: [tags?.[0]?.id ?? ""] };
      case "priority":
        return { field: "priority", values: [5] };
      case "due":
        return { field: "due", op: { kind: "today" } };
      case "keyword":
        return { field: "keyword", text: "" };
      case "kind":
        return { field: "kind", values: ["TASK"] };
      case "status":
        return { field: "status", values: ["ACTIVE"] };
    }
  };

  const setCond = (i: number, cond: Condition) =>
    setConditions((cs) => cs.map((c, idx) => (idx === i ? cond : c)));

  const applyQuery = async () => {
    if (!queryText.trim()) return;
    const rule = await api.parseFilterQuery(queryText);
    setMatch(rule.match);
    setConditions(rule.conditions);
  };

  const save = async () => {
    const rule: Rule = { match, conditions };
    if (filter) {
      await updateFilter.mutateAsync({ id: filter.id, patch: { name: name.trim() || filter.name, rule } });
      onSaved?.(filter.id);
    } else {
      const created = await createFilter.mutateAsync({ name: name.trim() || "Untitled filter", rule });
      onSaved?.(created.id);
    }
    onClose();
  };

  return (
    <div className="rounded-md border border-border bg-surface p-3" data-testid="filter-builder">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Filter name"
        aria-label="Filter name"
        className="mb-2 w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
      />

      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="text-text-muted">Match</span>
        <select
          aria-label="Match mode"
          value={match}
          onChange={(e) => setMatch(e.target.value as RuleMatch)}
          className={select}
        >
          <option value="all">All (AND)</option>
          <option value="any">Any (OR)</option>
        </select>
      </div>

      <ul className="space-y-1">
        {conditions.map((cond, i) => (
          <li key={i} className="flex items-center gap-1">
            <select
              aria-label={`Condition ${i + 1} field`}
              value={cond.field}
              onChange={(e) => setCond(i, defaultFor(e.target.value as Condition["field"]))}
              className={select}
            >
              {FIELDS.map(([f, label]) => (
                <option key={f} value={f}>
                  {label}
                </option>
              ))}
            </select>

            {cond.field === "list" && (
              <select
                aria-label={`Condition ${i + 1} value`}
                value={cond.ids[0] ?? ""}
                onChange={(e) => setCond(i, { field: "list", ids: [e.target.value] })}
                className={select}
              >
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            {cond.field === "tag" && (
              <select
                aria-label={`Condition ${i + 1} value`}
                value={cond.ids[0] ?? ""}
                onChange={(e) => setCond(i, { field: "tag", ids: [e.target.value] })}
                className={select}
              >
                {(tags ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {cond.field === "priority" && (
              <select
                aria-label={`Condition ${i + 1} value`}
                value={cond.values[0]}
                onChange={(e) => setCond(i, { field: "priority", values: [Number(e.target.value)] })}
                className={select}
              >
                {PRIORITY_OPTS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            )}
            {cond.field === "due" && (
              <select
                aria-label={`Condition ${i + 1} value`}
                value={cond.op.kind}
                onChange={(e) =>
                  setCond(i, { field: "due", op: { kind: e.target.value as "today" } })
                }
                className={select}
              >
                {DUE_OPTS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            )}
            {cond.field === "keyword" && (
              <input
                aria-label={`Condition ${i + 1} value`}
                value={cond.text}
                onChange={(e) => setCond(i, { field: "keyword", text: e.target.value })}
                placeholder="contains…"
                className={select}
              />
            )}
            {cond.field === "kind" && (
              <select
                aria-label={`Condition ${i + 1} value`}
                value={cond.values[0]}
                onChange={(e) => setCond(i, { field: "kind", values: [e.target.value] })}
                className={select}
              >
                {KIND_OPTS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            )}
            {cond.field === "status" && (
              <select
                aria-label={`Condition ${i + 1} value`}
                value={cond.values[0]}
                onChange={(e) => setCond(i, { field: "status", values: [e.target.value] })}
                className={select}
              >
                {STATUS_OPTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              aria-label={`Remove condition ${i + 1}`}
              onClick={() => setConditions((cs) => cs.filter((_, idx) => idx !== i))}
              className="ml-auto text-text-muted hover:text-red-500"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => setConditions((cs) => [...cs, defaultFor("priority")])}
        className="mt-2 text-sm text-accent hover:underline"
      >
        + Add condition
      </button>

      <div className="mt-3 border-t border-border pt-2">
        <label className="text-[11px] uppercase tracking-wide text-text-muted">Or type a query</label>
        <div className="mt-1 flex gap-1">
          <input
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applyQuery();
            }}
            placeholder="#work priority:high due:today"
            aria-label="Query text"
            className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => void applyQuery()}
            className="rounded border border-border px-2 py-1 text-sm hover:border-accent"
          >
            Parse
          </button>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1 text-sm">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-md bg-accent px-3 py-1 text-sm text-accent-fg"
        >
          Save
        </button>
      </div>
    </div>
  );
}
