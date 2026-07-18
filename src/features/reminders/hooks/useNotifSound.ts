import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import chirp1 from "../assets/chirp/toodoo-1.wav";
import chirp2 from "../assets/chirp/toodoo-2.wav";
import chirp3 from "../assets/chirp/toodoo-3.wav";

/** The synthesized "too-doo" chirp variants (scripts/gen-chirp.mjs). The
 *  asset URLs are swappable here for a real recording later. */
export const CHIRP_VARIANTS: Record<number, string> = { 1: chirp1, 2: chirp2, 3: chirp3 };

export interface NotifSound {
  enabled: boolean;
  volume: number;
  variant: number;
}

export const DEFAULT_NOTIF_SOUND: NotifSound = { enabled: true, volume: 0.7, variant: 1 };

const KEY = "notif.sound";

/** Play the chirp at the configured volume (no-op when disabled). */
export function playChirp(cfg: NotifSound) {
  if (!cfg.enabled) return;
  const url = CHIRP_VARIANTS[cfg.variant] ?? CHIRP_VARIANTS[1];
  const audio = new Audio(url);
  audio.volume = Math.min(1, Math.max(0, cfg.volume));
  // jsdom's play() returns undefined instead of a promise — guard for tests.
  const played: Promise<void> | undefined = audio.play();
  if (played) void played.catch(() => {});
}

/** Notification-sound settings (viewopts-style persisted blob). */
export function useNotifSound() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings", KEY],
    queryFn: async (): Promise<NotifSound> => ({
      ...DEFAULT_NOTIF_SOUND,
      ...((await api.getSetting(KEY)) as Partial<NotifSound> | null),
    }),
  });
  const setSound = useMutation({
    mutationFn: async (patch: Partial<NotifSound>) => {
      const next = { ...DEFAULT_NOTIF_SOUND, ...query.data, ...patch };
      await api.setSetting(KEY, { ...next });
      return next;
    },
    onSuccess: (next) => queryClient.setQueryData(["settings", KEY], next),
  });
  return { sound: query.data ?? DEFAULT_NOTIF_SOUND, loaded: !!query.data, setSound };
}
