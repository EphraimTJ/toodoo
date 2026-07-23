#!/usr/bin/env node
//! Toodoo MCP server — exposes your local Toodoo to Claude and other MCP
//! clients by proxying the app's local REST API (`127.0.0.1:7420/open/v1/...`).
//!
//! Deliberately dependency-free: MCP's stdio transport is newline-delimited
//! JSON-RPC 2.0, which is small enough to implement directly. That keeps this
//! runnable with plain `node` — no install step, no SDK version drift.
//!
//! Env:
//!   TOODOO_API_TOKEN  (required) Settings → API & Integrations → token
//!   TOODOO_API_URL    (optional) default http://127.0.0.1:7420

import process from "node:process";

const BASE = (process.env.TOODOO_API_URL ?? "http://127.0.0.1:7420").replace(/\/+$/, "");
const TOKEN = process.env.TOODOO_API_TOKEN ?? "";
const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "toodoo", version: "1.0.0" };

/** Call the Toodoo REST API, returning parsed JSON (or a status string). */
async function callApi(method, path, body) {
  if (!TOKEN) {
    throw new Error(
      "TOODOO_API_TOKEN is not set. Enable the API in Toodoo (Settings → API & Integrations) and copy the token.",
    );
  }
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (e) {
    throw new Error(
      `Cannot reach Toodoo at ${BASE}. Is the app running with the local API enabled? (${e.message})`,
    );
  }
  if (res.status === 401) throw new Error("Toodoo rejected the token (401). Re-copy it from Settings.");
  if (!res.ok) throw new Error(`Toodoo API ${method} ${path} failed: ${res.status} ${res.statusText}`);
  const text = await res.text();
  if (!text) return { ok: true };
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const TASK_FIELDS = {
  title: { type: "string", description: "Task title" },
  content: { type: "string", description: "Task description / notes" },
  priority: { type: "number", enum: [0, 1, 3, 5], description: "0 none, 1 low, 3 medium, 5 high" },
  dueDate: { type: "string", description: "Due date, ISO 8601 (e.g. 2026-08-01T17:00:00.000Z)" },
  startDate: { type: "string", description: "Start date, ISO 8601" },
  isAllDay: { type: "boolean", description: "All-day rather than a specific time" },
};

const TOOLS = [
  {
    name: "list_projects",
    description: "List all Toodoo lists/projects with their ids, names and colors.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_tasks",
    description:
      "List the tasks in one project, plus its sections. Use list_projects first to get a projectId ('inbox' is always valid).",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Project id, or 'inbox'" } },
      required: ["projectId"],
      additionalProperties: false,
    },
  },
  {
    name: "create_task",
    description: "Create a task. Defaults to the Inbox when projectId is omitted.",
    inputSchema: {
      type: "object",
      properties: { projectId: { type: "string", description: "Target project id (default 'inbox')" }, ...TASK_FIELDS },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "update_task",
    description: "Update fields on an existing task. Only the fields you pass are changed.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Task id" }, ...TASK_FIELDS },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "complete_task",
    description: "Mark a task complete (advances recurring tasks to their next occurrence).",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The task's project id" },
        taskId: { type: "string", description: "Task id" },
      },
      required: ["projectId", "taskId"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_task",
    description: "Delete a task.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The task's project id" },
        taskId: { type: "string", description: "Task id" },
      },
      required: ["projectId", "taskId"],
      additionalProperties: false,
    },
  },
  {
    name: "list_habits",
    description: "List habits with their streaks and today's check-in status.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "focus_stats",
    description: "Focus/pomodoro statistics: sessions and time focused.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_filters",
    description: "List saved custom filters.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
];

async function runTool(name, args) {
  switch (name) {
    case "list_projects":
      return callApi("GET", "/open/v1/project");
    case "list_tasks":
      return callApi("GET", `/open/v1/project/${encodeURIComponent(args.projectId)}/data`);
    case "create_task": {
      const { projectId = "inbox", ...rest } = args;
      return callApi("POST", "/open/v1/task", { projectId, ...rest });
    }
    case "update_task": {
      const { id, ...rest } = args;
      return callApi("POST", `/open/v1/task/${encodeURIComponent(id)}`, rest);
    }
    case "complete_task":
      return callApi(
        "POST",
        `/open/v1/project/${encodeURIComponent(args.projectId)}/task/${encodeURIComponent(args.taskId)}/complete`,
      );
    case "delete_task":
      return callApi(
        "DELETE",
        `/open/v1/project/${encodeURIComponent(args.projectId)}/task/${encodeURIComponent(args.taskId)}`,
      );
    case "list_habits":
      return callApi("GET", "/open/v1/toodoo/habits");
    case "focus_stats":
      return callApi("GET", "/open/v1/toodoo/focus/stats");
    case "list_filters":
      return callApi("GET", "/open/v1/toodoo/filters");
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function handleMessage(msg) {
  const { id, method, params } = msg;
  // Notifications carry no id and expect no reply.
  if (id === undefined || id === null) return;

  switch (method) {
    case "initialize":
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
    case "ping":
      return send({ jsonrpc: "2.0", id, result: {} });
    case "tools/list":
      return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    case "tools/call":
      try {
        const out = await runTool(params?.name, params?.arguments ?? {});
        return send({
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: typeof out === "string" ? out : JSON.stringify(out, null, 2) }],
          },
        });
      } catch (e) {
        // Tool failures are reported in-band so the model can react to them.
        return send({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true },
        });
      }
    default:
      return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue; // ignore malformed frames rather than dying mid-session
    }
    void handleMessage(msg);
  }
});
process.stdin.on("end", () => process.exit(0));
