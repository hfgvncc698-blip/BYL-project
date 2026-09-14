import { useEffect, useRef } from 'react';

export function centerCycle(container) {
  const card = container?.querySelector('[aria-pressed="true"]');
  if (!card || !container.clientWidth) return;
  const outer = container.getBoundingClientRect();
  const inner = card.getBoundingClientRect();
  // Scroll only this horizontal strip, never the page or another ancestor.
  container.scrollLeft += inner.left + inner.width / 2 - outer.left - container.clientWidth / 2;
}

export default function useCenteredCycle(selectedId, layoutKey) {
  const ref = useRef(null);
  useEffect(() => {
    const container = ref.current;
    if (!container) return undefined;
    const frame = requestAnimationFrame(() => centerCycle(container));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => centerCycle(container));
    observer?.observe(container);
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); };
  }, [selectedId, layoutKey]);
  return ref;
}
