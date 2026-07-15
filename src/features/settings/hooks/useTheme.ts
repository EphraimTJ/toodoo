import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../lib/api";

export type Theme = "light" | "dark";

const THEME_KEY = ["setting", "theme"] as const;

export function useTheme() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: THEME_KEY,
    queryFn: async (): Promise<Theme> => {
      const stored = await api.getSetting("theme");
      return stored === "dark" ? "dark" : "light";
    },
  });
  const theme: Theme = data ?? "light";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const mutation = useMutation({
    mutationFn: (next: Theme) => api.setSetting("theme", next),
    onMutate: async (next) => {
      queryClient.setQueryData(THEME_KEY, next);
    },
  });

  return {
    theme,
    setTheme: (next: Theme) => mutation.mutate(next),
    toggleTheme: () => mutation.mutate(theme === "dark" ? "light" : "dark"),
  };
}
