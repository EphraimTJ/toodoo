import { useQuery } from "@tanstack/react-query";
import { checkForUpdate, IS_TAURI, type UpdateInfo } from "../lib/updater";

/**
 * Background update check shared by the sidebar dot and the Updates settings.
 * Runs once on launch and every few hours; `data` is the available UpdateInfo
 * or null when up to date. Desktop-only (returns null in web/tests).
 */
export function useUpdateCheck() {
  return useQuery<UpdateInfo | null>({
    queryKey: ["updateCheck"],
    queryFn: checkForUpdate,
    enabled: IS_TAURI,
    staleTime: 1000 * 60 * 60, // an hour
    refetchInterval: 1000 * 60 * 60 * 6, // re-check every 6h while open
    refetchOnWindowFocus: false,
    retry: false,
  });
}
