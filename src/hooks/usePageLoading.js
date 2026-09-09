import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

export function usePageLoading() {
  const { search } = useLocation();
  const enabled = import.meta.env.DEV && new URLSearchParams(search).has("pagePerf");
  const fresh = enabled && new URLSearchParams(search).has("fresh");
  const sequence = useRef(0);
  const mountedAt = useRef(performance.now());
  const frames = useRef(new Set());
  const [state, setState] = useState({ status: "idle" });
  useEffect(() => () => {
    sequence.current++;
    frames.current.forEach(cancelAnimationFrame);
  }, []);
  const begin = useCallback(() => {
    const id = ++sequence.current;
    const current = () => sequence.current === id;
    setState({ status: "loading", debug: enabled });
    const mark = (phase, counts = {}) => {
      if (!current()) return;
      setState(previous => ({ ...previous,
        status: phase === "ready" ? "ready" : phase === "error" ? "error" : "refreshing",
        hasCache: previous.hasCache || phase === "cache",
      }));
      if (!enabled) return;
      const frame = requestAnimationFrame(() => {
        frames.current.delete(frame);
        const next = requestAnimationFrame(() => {
          frames.current.delete(next);
          if (!current()) return;
          setState(previous => ({ ...previous, [phase]: {
            pageMs: Math.round(performance.now()),
            mountMs: Math.round(performance.now() - mountedAt.current), ...counts,
          } }));
        });
        frames.current.add(next);
      });
      frames.current.add(frame);
    };
    return { current, cache: counts => mark("cache", counts), ready: counts => mark("ready", counts), error: () => mark("error") };
  }, [enabled]);
  return { begin, state, fresh };
}
