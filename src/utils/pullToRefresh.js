export const PULL_THRESHOLD = 90;

export function createPullGesture() {
  let origin = null;
  let distance = 0;
  const cancel = () => { origin = null; distance = 0; };
  return {
    start({ x, y, touches, atTop, blocked }) {
      cancel();
      if (touches === 1 && atTop && !blocked) origin = { x, y };
    },
    move({ x, y, touches, atTop }) {
      if (!origin) return 0;
      const dx = x - origin.x;
      const dy = y - origin.y;
      if (touches !== 1 || !atTop || dy < 0 || (Math.abs(dx) > 10 && Math.abs(dx) > dy)) {
        cancel(); return 0;
      }
      distance = dy > 10 ? Math.min(dy, 160) : 0;
      return distance;
    },
    end() { const refresh = distance >= PULL_THRESHOLD; cancel(); return refresh; },
    cancel,
  };
}

export function pullTargetBlocked(target, root, getStyle) {
  if (!target?.closest || target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"], [data-rfd-draggable-id], [data-rfd-droppable-id], [data-no-pull-refresh]')) return true;
  for (let node = target; node && node !== root && node.tagName !== 'BODY' && node.tagName !== 'HTML'; node = node.parentElement) {
    const style = getStyle(node);
    if ((/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) ||
        (/(auto|scroll)/.test(style.overflowX) && node.scrollWidth > node.clientWidth)) return true;
  }
  return false;
}
