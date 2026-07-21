import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type JsonValue } from "../../../lib/api";
import chirp1 from "../assets/chirp/toodoo-1.wav";
import chirp2 from "../assets/chirp/toodoo-2.wav";
import chirp3 from "../assets/chirp/toodoo-3.wav";
import habitUrl from "../assets/chirp/habit.wav";
import focusDoneUrl from "../assets/chirp/focus-done.wav";
import breakOverUrl from "../assets/chirp/break-over.wav";

/** The synthesized "too-doo" reminder chirps (scripts/gen-chirp.mjs). */
export const CHIRP_VARIANTS: Record<number, string> = { 1: chirp1, 2: chirp2, 3: chirp3 };

/** Distinct notification event types, each with its own sound. */
export type NotifKind = "reminder" | "habit" | "focusDone" | "breakOver";

export interface SoundCfg {
  enabled: boolean;
  volume: number;
  /** Reminder-only: which too-doo variant (1–3). */
  variant?: number;
}

export interface NotifSounds {
  reminder: SoundCfg;
  habit: SoundCfg;
  focusDone: SoundCfg;
  breakOver: SoundCfg;
}

export const DEFAULT_NOTIF_SOUNDS: NotifSounds = {
  reminder: { enabled: true, volume: 0.7, variant: 1 },
  habit: { enabled: true, volume: 0.6 },
  focusDone: { enabled: true, volume: 0.6 },
  breakOver: { enabled: true, volume: 0.5 },
};

export const NOTIF_META: Record<NotifKind, { label: string; hint: string }> = {
  reminder: { label: "Task reminder", hint: "Gentle descending chime when a task is due" },
  habit: { label: "Habit reminder", hint: "Bright rising motif — encouraging" },
  focusDone: { label: "Focus session complete", hint: "Celebratory arpeggio when a session finishes" },
  breakOver: { label: "Break over", hint: "Soft nudge back to focus" },
};

const KEY = "notif.sound";

/** Accept the new per-type blob, the old flat reminder blob, or nothing. */
function normalize(raw: unknown): NotifSounds {
  const base = DEFAULT_NOTIF_SOUNDS;
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if ("reminder" in r || "habit" in r) {
      const pick = (k: NotifKind): SoundCfg => ({ ...base[k], ...(r[k] as Partial<SoundCfg> | undefined) });
      return { reminder: pick("reminder"), habit: pick("habit"), focusDone: pick("focusDone"), breakOver: pick("breakOver") };
    }
    // Legacy flat shape { enabled, volume, variant } → the reminder sound.
    if ("variant" in r || "enabled" in r) {
      return { ...base, reminder: { ...base.reminder, ...(r as Partial<SoundCfg>) } };
    }
  }
  return base;
}

function urlFor(kind: NotifKind, cfg: SoundCfg): string {
  switch (kind) {
    case "reminder":
      return CHIRP_VARIANTS[cfg.variant ?? 1] ?? CHIRP_VARIANTS[1];
    case "habit":
      return habitUrl;
    case "focusDone":
      return focusDoneUrl;
    case "breakOver":
      return breakOverUrl;
  }
}

/** Play the sound for a notification type at its configured volume (no-op when disabled). */
export function playNotif(kind: NotifKind, sounds: NotifSounds) {
  const cfg = sounds[kind];
  if (!cfg.enabled) return;
  const audio = new Audio(urlFor(kind, cfg));
  audio.volume = Math.min(1, Math.max(0, cfg.volume));
  // jsdom's play() returns undefined instead of a promise — guard for tests.
  const played: Promise<void> | undefined = audio.play();
  if (played) void played.catch(() => {});
}

/** Per-type notification-sound settings (persisted blob). */
export function useNotifSounds() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", KEY],
    queryFn: async (): Promise<NotifSounds> => normalize(await api.getSetting(KEY)),
  });
  const setSounds = useMutation({
    mutationFn: async (patch: Partial<NotifSounds>) => {
      const next = { ...(query.data ?? DEFAULT_NOTIF_SOUNDS), ...patch };
      await api.setSetting(KEY, next as unknown as JsonValue);
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(["settings", KEY], next),
  });
  return { sounds: query.data ?? DEFAULT_NOTIF_SOUNDS, loaded: !!query.data, setSounds };
}
