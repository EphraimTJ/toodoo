# Toodoo MCP server

Exposes your local Toodoo to Claude (and any other MCP client) so an agent can
read and manage your lists, tasks, habits and focus stats.

It's a thin proxy over Toodoo's built-in local REST API, so everything stays on
your machine — no cloud, no account. Dependency-free: plain Node 18+, no install.

## 1. Turn on the local API in Toodoo

Settings → **API & Integrations** → enable the API, then copy the **token**.
The API listens on `127.0.0.1:7420` by default.

## 2. Register the server with your MCP client

**Claude Code**

```bash
claude mcp add toodoo --env TOODOO_API_TOKEN=paste-your-token -- node /absolute/path/to/Toodoo/mcp/toodoo-mcp.mjs
```

**Claude Desktop** — add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "toodoo": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\Toodoo\\mcp\\toodoo-mcp.mjs"],
      "env": { "TOODOO_API_TOKEN": "paste-your-token" }
    }
  }
}
```

Restart the client. Toodoo's tools then appear in the tool list.

## Tools

| Tool | What it does |
| --- | --- |
| `list_projects` | All lists/projects with ids, names, colors |
| `list_tasks` | Tasks + sections in one project (`inbox` always works) |
| `create_task` | Create a task (title, notes, priority, due/start date, all-day) |
| `update_task` | Change fields on an existing task |
| `complete_task` | Complete a task (recurring tasks advance) |
| `delete_task` | Delete a task |
| `list_habits` | Habits with streaks and today's check-in status |
| `focus_stats` | Focus/pomodoro session statistics |
| `list_filters` | Saved custom filters |

Priorities follow TickTick's scale: `0` none, `1` low, `3` medium, `5` high.
Dates are ISO 8601 (e.g. `2026-08-01T17:00:00.000Z`).

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `TOODOO_API_TOKEN` | — | **Required.** From Settings → API & Integrations |
| `TOODOO_API_URL` | `http://127.0.0.1:7420` | Change if you moved the API port |

## Troubleshooting

- **"TOODOO_API_TOKEN is not set"** — the env var didn't reach the server; check
  the `env` block in your MCP client config.
- **"Cannot reach Toodoo"** — the app isn't running, or the local API is off.
- **"Toodoo rejected the token (401)"** — the token was regenerated; re-copy it.

## Verifying it by hand

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{}}}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node mcp/toodoo-mcp.mjs
```

You should get an `initialize` result followed by the tool list.
