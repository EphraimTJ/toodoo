import { useEffect, useRef, useState } from "react";
import whiteUrl from "../assets/ambient/white.wav";
import pinkUrl from "../assets/ambient/pink.wav";
import brownUrl from "../assets/ambient/brown.wav";
import lofiStudy from "../assets/music/lofi-jazz-study-music.mp3";
import lofiTrio from "../assets/music/lofi-jazz-trio-sunny-cafe.mp3";
import lofiSoulful from "../assets/music/lofi-jazz-soulful-midnight-club.mp3";
import lofiSwing from "../assets/music/lofi-jazz-swing-cocktail-bar.mp3";
import lofiRetro from "../assets/music/lofi-jazz-retro-coffee-shop.mp3";
import lofiSmooth from "../assets/music/lofi-jazz-smooth-study-session.mp3";

// Jazzy lo-fi focus set (Pixabay, royalty-free). Played as a shuffled playlist
// so a long session doesn't loop the same 2-minute track.
const LOFI_PLAYLIST = [lofiStudy, lofiTrio, lofiSoulful, lofiSwing, lofiRetro, lofiSmooth];

// Looping single-file ambience.
const LOOP_URLS: Record<"white" | "pink" | "brown", string> = {
  white: whiteUrl,
  pink: pinkUrl,
  brown: brownUrl,
};

export const AMBIENT_TRACKS = {
  lofi: { label: "Jazzy Lo-Fi" },
  white: { label: "White noise" },
  pink: { label: "Pink noise" },
  brown: { label: "Brown noise" },
} as const;

export type AmbientTrack = keyof typeof AMBIENT_TRACKS;

function shuffled<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Plays a bundled focus track/playlist at a volume; `null` track = silence. */
export function useAmbient() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playlist = useRef<string[]>([]);
  const idx = useRef(0);
  const [track, setTrack] = useState<AmbientTrack | null>(null);
  const [volume, setVolume] = useState(0.5);

  useEffect(() => {
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.volume = volume;
    audio.onended = null;

    if (!track) {
      audio.pause();
      return;
    }

    if (track === "lofi") {
      playlist.current = shuffled(LOFI_PLAYLIST);
      idx.current = 0;
      audio.loop = false;
      // Advance through the playlist, wrapping around to keep it endless.
      audio.onended = () => {
        idx.current = (idx.current + 1) % playlist.current.length;
        audio.src = playlist.current[idx.current];
        void audio.play().catch(() => {});
      };
      audio.src = playlist.current[0];
    } else {
      audio.loop = true;
      audio.src = LOOP_URLS[track];
    }
    void audio.play().catch(() => {});
    // volume is applied in its own effect; re-running on it would restart audio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => () => audioRef.current?.pause(), []);

  return { track, setTrack, volume, setVolume };
}
