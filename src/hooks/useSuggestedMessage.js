import { useEffect, useRef } from 'react';

export default function useSuggestedMessage(text, setDraft, onApplied) {
  const applied = useRef(null);
  useEffect(() => {
    if (!text || applied.current === text) return;
    applied.current = text;
    setDraft(current => current?.trim() ? `${current}\n\n${text}` : text);
    onApplied?.();
  }, [text, setDraft, onApplied]);
}
