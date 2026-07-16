import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, type ImportKind } from "../../../lib/api";
import { downloadText } from "../../../lib/download";
import { useBackups } from "../hooks/useBackups";

const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-bg";
const primaryBtn = "rounded-md bg-accent px-2.5 py-1 text-xs text-accent-fg hover:opacity-90";

const IMPORT_SOURCES: { value: ImportKind; label: string }[] = [
  { value: "ticktick", label: "TickTick backup CSV" },
  { value: "todoist", label: "Todoist CSV" },
  { value: "generic", label: "Generic CSV" },
];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DataSettings() {
  const queryClient = useQueryClient();
  const { list, config, create, remove, restore, setConfig } = useBackups();

  const [kind, setKind] = useState<ImportKind>("ticktick");
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const doExport = async (
    fn: () => Promise<string>,
    filename: string,
    mime: string,
  ) => {
    downloadText(filename, await fn(), mime);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const n = await api.importCsv(kind, text);
    setImportResult(`Imported ${n} task${n === 1 ? "" : "s"}.`);
    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
    void queryClient.invalidateQueries({ queryKey: ["smartCounts"] });
    if (fileInput.current) fileInput.current.value = "";
  };

  const cfg = config.data;

  return (
    <div className="space-y-5" data-testid="data-settings">
      {/* Export */}
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Export</h4>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => void doExport(api.exportJson, "toodoo.json", "application/json")}>
            JSON
          </button>
          <button type="button" className={btn} onClick={() => void doExport(api.exportCsv, "toodoo.csv", "text/csv")}>
            CSV
          </button>
          <button type="button" className={btn} onClick={() => void doExport(api.exportMarkdown, "toodoo.md", "text/markdown")}>
            Markdown
          </button>
          <button type="button" className={btn} onClick={() => void doExport(api.exportIcs, "toodoo.ics", "text/calendar")}>
            ICS
          </button>
        </div>
      </section>

      {/* Import */}
      <section className="space-y-2">
        <h4 className="text-xs font-medium text-text-muted">Import</h4>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Import source"
            className="rounded border border-border bg-bg px-2 py-1 text-xs"
            value={kind}
            onChange={(e) => setKind(e.target.value as ImportKind)}
          >
            {IMPORT_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            aria-label="Import CSV file"
            data-testid="import-file"
            className="text-xs"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
        {importResult && (
          <p className="text-xs text-accent" data-testid="import-result">
            {importResult}
          </p>
        )}
      </section>

      {/* Backups */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-medium text-text-muted">Backups</h4>
          <button
            type="button"
            className={`${primaryBtn} ml-auto`}
            data-testid="backup-now"
            onClick={() => create.mutate()}
          >
            Back up now
          </button>
        </div>

        {cfg && (
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              role="switch"
              aria-label="Enable daily auto-backup"
              checked={cfg.autoEnabled}
              onChange={(e) => setConfig.mutate({ autoEnabled: e.target.checked, keep: cfg.keep })}
            />
            Daily auto-backup — keep last
            <input
              type="number"
              min={1}
              aria-label="Backups to keep"
              className="w-14 rounded border border-border bg-bg px-1 py-0.5"
              value={cfg.keep}
              onChange={(e) =>
                setConfig.mutate({ autoEnabled: cfg.autoEnabled, keep: Number(e.target.value) || 1 })
              }
            />
          </label>
        )}

        <ul className="max-h-40 space-y-1 overflow-y-auto text-xs" data-testid="backup-list">
          {(list.data ?? []).length === 0 && <li className="text-text-muted">No backups yet.</li>}
          {(list.data ?? []).map((b) => (
            <li key={b.path} className="flex items-center gap-2 rounded border border-border px-2 py-1">
              <span className="min-w-0 flex-1 truncate font-mono">{b.name}</span>
              <span className="text-text-muted">{fmtBytes(b.bytes)}</span>
              <button type="button" className={btn} onClick={() => restore.mutate(b.path)}>
                Restore
              </button>
              <button type="button" className={btn} onClick={() => remove.mutate(b.path)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
        {restore.isSuccess && (
          <p className="text-xs text-text-muted">Restore staged — relaunch Toodoo to apply it.</p>
        )}
      </section>
    </div>
  );
}
