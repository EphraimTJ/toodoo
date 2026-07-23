import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { AdvancedSettings } from "./AdvancedSettings";
import { ApiSettings } from "./ApiSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { LanguageSettings } from "./LanguageSettings";
import { DataSettings } from "./DataSettings";
import { DesktopSettings } from "./DesktopSettings";
import { NotificationSettings } from "./NotificationSettings";
import { SmartListSettings } from "./SmartListSettings";
import { UpdateSettings } from "../../updates/components/UpdateSettings";
import { useUpdateCheck } from "../../updates/hooks/useUpdateCheck";

/** Gear button in the sidebar header that opens the Settings modal. A green dot
 *  appears when an update is available, and opening jumps to the Updates section. */
export function SettingsDialog() {
  const [open, setOpen] = useState(false);
  const { data: update } = useUpdateCheck();
  const updatesRef = useRef<HTMLElement>(null);

  // When opened with an update waiting, scroll the Updates section into view so
  // the "Check for updates" / install controls are right there.
  useEffect(() => {
    if (!open || !update) return;
    const t = setTimeout(
      () => updatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120,
    );
    return () => clearTimeout(t);
  }, [open, update]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label={update ? `Settings — update to ${update.version} available` : "Settings"}
          className="relative rounded p-1 text-text-muted hover:bg-bg hover:text-text"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          {update && (
            <span
              aria-hidden
              data-testid="settings-update-dot"
              className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-[#3fae5a] ring-2 ring-surface"
            />
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-50 w-[32rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-[2rem] border border-border/70 bg-surface p-6 shadow-float"
        >
          <Dialog.Title className="mb-4 font-display text-xl font-semibold">Settings</Dialog.Title>
          <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Appearance
              </h3>
              <AppearanceSettings />
              <div className="mt-3">
                <LanguageSettings />
              </div>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Desktop
              </h3>
              <DesktopSettings />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Notifications
              </h3>
              <NotificationSettings />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Smart Lists
              </h3>
              <SmartListSettings />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Data &amp; Backups
              </h3>
              <DataSettings />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                API &amp; Integrations
              </h3>
              <ApiSettings />
            </section>
            <section ref={updatesRef}>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Updates
                {update && <span className="h-1.5 w-1.5 rounded-full bg-[#3fae5a]" aria-hidden />}
              </h3>
              <UpdateSettings />
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Advanced
              </h3>
              <AdvancedSettings />
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
