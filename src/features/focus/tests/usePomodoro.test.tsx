import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DEFAULT_POMO_CONFIG } from "../lib/pomodoro";
import { usePomodoro } from "../hooks/usePomodoro";

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("usePomodoro idle clock", () => {
  it("resyncs the idle display when the config loads or changes (round-3 regression)", () => {
    // Simulates focus:config resolving asynchronously after mount: the hook
    // seeds from defaults (25:00), then the real config (workMin 10) arrives.
    const { result, rerender } = renderHook(({ cfg }) => usePomodoro(cfg), {
      wrapper,
      initialProps: { cfg: DEFAULT_POMO_CONFIG },
    });
    expect(result.current.remaining).toBe(25 * 60);

    rerender({ cfg: { ...DEFAULT_POMO_CONFIG, workMin: 10 } });
    expect(result.current.remaining).toBe(10 * 60);
    expect(result.current.totalSec).toBe(10 * 60);
  });

  it("applies the quick-picker override to the idle clock immediately", () => {
    const { result } = renderHook(() => usePomodoro(DEFAULT_POMO_CONFIG), { wrapper });
    act(() => result.current.setWorkMinOverride(45));
    expect(result.current.remaining).toBe(45 * 60);
    act(() => result.current.setWorkMinOverride(null));
    expect(result.current.remaining).toBe(25 * 60);
  });

  it("does not touch a running countdown when config changes", async () => {
    const { result, rerender } = renderHook(({ cfg }) => usePomodoro(cfg), {
      wrapper,
      initialProps: { cfg: DEFAULT_POMO_CONFIG },
    });
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.running).toBe(true);
    // A config edit mid-session must not reset the countdown.
    rerender({ cfg: { ...DEFAULT_POMO_CONFIG, workMin: 5 } });
    expect(result.current.remaining).toBe(25 * 60);
  });
});
