/** Show a lightweight, auto-dismissing confirmation toast (see SystemToasts).
 *  Used for otherwise-silent actions — copy, download, duplicate, etc. */
export function toast(message: string): void {
  window.dispatchEvent(new CustomEvent("toodoo-toast", { detail: { message } }));
}
