import { useCallback, useRef, useState } from 'react';
const prefix = 'byl:form-draft:';
const memory = new Map();
function read(key, initial) {
  if (key) {
    if (memory.has(key)) return memory.get(key);
    try { const raw = sessionStorage.getItem(prefix + key); if (raw !== null) return JSON.parse(raw); } catch { /* Storage can be unavailable. */ }
  }
  return typeof initial === 'function' ? initial() : initial;
}
export function clearSessionDrafts(scope) {
  for (const key of memory.keys()) if (key.startsWith(scope)) memory.delete(key);
  try { for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix + scope)) sessionStorage.removeItem(key); } catch { /* In-memory fallback remains usable. */ }
}
// Save on the input action, so a quick back/unmount cannot cancel a debounce.
export default function useSessionDraft(key, initial) {
  const initialRef = useRef(initial);
  const [entry, setEntry] = useState(() => ({ key, value: read(key, initial) }));
  const value = entry.key === key || !key ? entry.value : read(key, initialRef.current);
  const setValue = useCallback(next => {
    setEntry(previous => {
      const current = previous.key === key || !key ? previous.value : read(key, initialRef.current);
      const value = typeof next === 'function' ? next(current) : next;
      if (key) {
        memory.set(key, value);
        try { if (value === '') sessionStorage.removeItem(prefix + key); else sessionStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* Preserve in memory if storage is full. */ }
      }
      return { key, value };
    });
  }, [key]);
  return [value, setValue];
}
