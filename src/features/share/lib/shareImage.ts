/**
 * Share a task as a PNG image. `buildTaskCard` is a pure DOM builder (component-
 * tested); `downloadTaskImage` renders it offscreen with html-to-image and
 * downloads the PNG. The raster step needs a real browser (skipped/guarded in
 * jsdom).
 */
import { toPng } from "html-to-image";
import type { Task } from "../../../lib/api";
import { taskToText } from "./shareText";

/** A styled, offscreen-renderable card for a task (title + meta/notes + brand). */
export function buildTaskCard(task: Task): HTMLElement {
  const card = document.createElement("div");
  card.setAttribute("data-testid", "share-card");
  card.style.cssText =
    "width:480px;padding:24px;box-sizing:border-box;font-family:system-ui,-apple-system,sans-serif;background:#ffffff;color:#18181b;border-radius:12px;";

  const title = document.createElement("div");
  title.style.cssText = "font-size:20px;font-weight:700;margin-bottom:8px;";
  title.textContent = task.title;
  card.appendChild(title);

  // taskToText's first line is the title; keep the meta/notes remainder.
  const rest = taskToText(task).split("\n").slice(1).join("\n").trim();
  if (rest) {
    const body = document.createElement("pre");
    body.style.cssText = "white-space:pre-wrap;font-family:inherit;font-size:13px;color:#3f3f46;margin:0;";
    body.textContent = rest;
    card.appendChild(body);
  }

  const brand = document.createElement("div");
  brand.style.cssText = "margin-top:16px;font-size:11px;color:#a1a1aa;";
  brand.textContent = "Toodoo";
  card.appendChild(brand);
  return card;
}

/** Render the task card to a PNG and download it. */
export async function downloadTaskImage(task: Task): Promise<void> {
  const card = buildTaskCard(task);
  card.style.position = "fixed";
  card.style.left = "-99999px";
  card.style.top = "0";
  document.body.appendChild(card);
  try {
    const dataUrl = await toPng(card, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${task.title || "task"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    card.remove();
  }
}
