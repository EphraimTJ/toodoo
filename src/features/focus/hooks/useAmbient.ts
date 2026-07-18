import { useEffect, useRef, useState } from "react";
import whiteUrl from "../assets/ambient/white.wav";
import pinkUrl from "../assets/ambient/pink.wav";
import brownUrl from "../assets/ambient/brown.wav";

export const AMBIENT_TRACKS = {
  white: { label: "White noise", url: whiteUrl },
  pink: { label: "Pink noise", url: pinkUrl },
  brown: { label: "Brown noise", url: brownUrl },
} as const;

export type AmbientTrack = keyof typeof AMBIENT_TRACKS;

/** Loops a bundled ambient track at a volume; `null` track = silence. */
export function useAmbient() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<AmbientTrack | null>(null);
  const [volume, setVolume] = useState(0.5);

  useEffect(() => {
    if (!track) {
      audioRef.current?.pause();
      return;
    }
    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.loop = true;
      audioRef.current = audio;
    }
    audio.src = AMBIENT_TRACKS[track].url;
    void audio.play().catch(() => {});
  }, [track]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => () => audioRef.current?.pause(), []);

  return { track, setTrack, volume, setVolume };
}
