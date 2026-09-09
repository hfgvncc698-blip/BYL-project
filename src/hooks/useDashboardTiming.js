import { useCallback, useEffect, useRef, useState } from "react";

// Opt-in, local-only timing. No client identity or health data is recorded.
export function useDashboardTiming(enabled) {
  const mountedAt = useRef(performance.now());
  const [timing, setTiming] = useState({});
  const mark = useCallback((section, status = "ready", details = {}) => {
    if (!enabled && !["core", "nutrition", "copilot"].includes(section)) return;
    if (!enabled) {
      setTiming(previous => ({ ...previous, [section]: { status } }));
      return;
    }
    const pageMs = Math.round(performance.now());
    setTiming(previous => ({
      ...previous,
      painted: ["core", "nutrition", "preferences", "copilot"].includes(section) ? undefined : previous.painted,
      [section]: { status, pageMs, mountMs: Math.round(pageMs - mountedAt.current), ...details },
    }));
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !["core", "nutrition", "preferences", "copilot"].every(key => timing[key]?.status === "ready")) return;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setTiming(previous => ({ ...previous, painted: { pageMs: Math.round(performance.now()), mountMs: Math.round(performance.now() - mountedAt.current) } }));
      });
    });
    return () => { cancelAnimationFrame(firstFrame); if (secondFrame) cancelAnimationFrame(secondFrame); };
  }, [enabled, timing.core, timing.nutrition, timing.preferences, timing.copilot]);
  useEffect(() => {
    if (!enabled || !timing.coreCache || !timing.nutritionCache || !timing.preferencesCache || (!timing.copilotCache && timing.copilot?.status !== "ready")) return;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setTiming(previous => previous.cachedPainted ? previous : ({ ...previous, cachedPainted: { pageMs: Math.round(performance.now()), mountMs: Math.round(performance.now() - mountedAt.current) } }));
      });
    });
    return () => { cancelAnimationFrame(firstFrame); if (secondFrame) cancelAnimationFrame(secondFrame); };
  }, [enabled, timing.coreCache, timing.nutritionCache, timing.preferencesCache, timing.copilotCache, timing.copilot]);
  return { timing, mark };
}
