/** Trigger a browser download of `text` as `filename`. Works in the Tauri
 *  webview and the vite-dev browser alike (used by the data exporters). */
export function downloadText(filename: string, text: string, mime = "text/plain"): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
