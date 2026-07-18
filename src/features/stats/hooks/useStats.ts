import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";

/** Local-date range for the last `days` days, [from, to] as YYYY-MM-DD. */
export function dayRange(days: number): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  const iso = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  return { from: iso(from), to: iso(to) };
}

export function useAchievement() {
  return useQuery({ queryKey: ["stats", "achievement"], queryFn: api.achievementInfo });
}

export function useScoreHistory(from: string, to: string) {
  return useQuery({
    queryKey: ["stats", "history", from, to],
    queryFn: () => api.scoreHistory(from, to),
  });
}

export function useSummary(from: string, to: string) {
  return useQuery({
    queryKey: ["stats", "summary", from, to],
    queryFn: () => api.statsSummary(from, to),
  });
}
