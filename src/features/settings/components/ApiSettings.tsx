import { useState } from "react";
import { useApiConfig } from "../hooks/useApiConfig";

const field =
  "w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent";
const btn = "rounded border border-border px-2 py-1 text-xs hover:bg-bg";

/** API & Integrations settings: enable the local REST server and manage its token. */
export function ApiSettings() {
  const { query, setEnabled, regenerateToken } = useApiConfig();
  const cfg = query.data;
  const [copied, setCopied] = useState(false);

  const copyToken = async () => {
    if (!cfg) return;
    try {
      await navigator.clipboard.writeText(cfg.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) — ignore */
    }
  };

  if (!cfg) return <div className="p-1 text-sm text-text-muted">Loading…</div>;

  const base = `http://127.0.0.1:${cfg.port}`;

  return (
    <div className="space-y-4" data-testid="api-settings">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          aria-label="Enable local API server"
          data-testid="api-enable-toggle"
          checked={cfg.enabled}
          onChange={(e) => setEnabled.mutate(e.target.checked)}
        />
        <span>
          Local REST API{" "}
          <span className="text-text-muted">— {cfg.enabled ? `running on ${base}` : "off"}</span>
        </span>
      </label>

      <div className="space-y-1">
        <div className="text-xs font-medium text-text-muted">Bearer token</div>
        <div className="flex gap-1">
          <input
            className={`${field} font-mono`}
            data-testid="api-token"
            readOnly
            value={cfg.token}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" className={btn} onClick={copyToken}>
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            type="button"
            className={btn}
            data-testid="api-regenerate"
            onClick={() => regenerateToken.mutate()}
          >
            Regenerate
          </button>
        </div>
        <p className="text-xs text-text-muted">
          Regenerating immediately invalidates the old token.
        </p>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium text-text-muted">Example request</div>
        <pre className="overflow-x-auto rounded bg-bg p-2 text-xs">
          <code>{`curl ${base}/open/v1/project \\\n  -H "Authorization: Bearer ${cfg.token}"`}</code>
        </pre>
        <p className="text-xs text-text-muted">
          TickTick-compatible endpoints under <code>/open/v1</code>. Full spec at{" "}
          <code>{base}/openapi.json</code>.
        </p>
      </div>
    </div>
  );
}
