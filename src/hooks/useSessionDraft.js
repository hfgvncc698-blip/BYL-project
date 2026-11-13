import { onPrivateSessionChange } from "../utils/privateSession.js";
import { tabSessionStorage } from "../utils/privateStorage.js";
import { useCallback, useRef, useState } from 'react';
const prefix = 'byl:form-draft:';
const memory = new Map();
onPrivateSessionChange(() => memory.clear());
function read(key, initial) {
  if (key) {
    if (memory.has(key)) return memory.get(key);
    try { const raw = tabSessionStorage.getItem(prefix + key); if (raw !== null) return JSON.parse(raw); } catch { /* Storage can be unavailable. */ }
  }
  return typeof initial === 'function' ? initial() : initial;
}
export function clearSessionDrafts(scope) {
  for (const key of memory.keys()) if (key.startsWith(scope)) memory.delete(key);
  try { for (const key of Array.from({length:tabSessionStorage.length},(_,i)=>tabSessionStorage.key(i))) if (key.startsWith(prefix + scope)) tabSessionStorage.removeItem(key); } catch { /* In-memory fallback remains usable. */ }
}
// Save on the input action, so a quick back/unmount cannot cancel a debounce.
export default function useSessionDraft(key, initial, { memoryOnly = false } = {}) {
  const initialRef = useRef(initial);
  const [entry, setEntry] = useState(() => ({ key, value: read(key, initial) }));
  const value = entry.key === key || !key ? entry.value : read(key, initialRef.current);
  const setValue = useCallback(next => {
    setEntry(previous => {
      const current = previous.key === key || !key ? previous.value : read(key, initialRef.current);
      const value = typeof next === 'function' ? next(current) : next;
      if (key) {
        memory.set(key, value);
        // Private drafts already live in this identity-cleared Map. Large builder
        // sessions need no second JSON copy in the in-memory storage adapter.
        try { if (memoryOnly) tabSessionStorage.removeItem(prefix + key); else if (value === '') tabSessionStorage.removeItem(prefix + key); else tabSessionStorage.setItem(prefix + key, JSON.stringify(value)); } catch { /* Preserve in memory if storage is full. */ }
      }
      return { key, value };
    });
  }, [key, memoryOnly]);
  return [value, setValue];
}
