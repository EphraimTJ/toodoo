import type { ReactNode } from "react";
import { useApplyAppearance } from "../hooks/useAppearance";

/** Applies the persisted theme (mode/accent/font-size) to the document. Mounted
 *  once at the root so every window (main app + pop-outs) is themed. */
export function AppearanceProvider({ children }: { children: ReactNode }) {
  useApplyAppearance();
  return <>{children}</>;
}
