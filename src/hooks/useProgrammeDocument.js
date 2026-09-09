import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../AuthContext';
import { subscribeToProgram } from '../utils/programSubscription';
import { usePageLoading } from './usePageLoading';

export function useProgrammeDocument({ clientId, programId, prefetchedProgram }) {
  const { user } = useAuth();
  const { begin, state: loadState, fresh } = usePageLoading();
  const initial = !fresh && prefetchedProgram?.id === programId ? prefetchedProgram : null;
  const [prog, setProg] = useState(initial);
  const [progRef, setProgRef] = useState(null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState(null);
  useEffect(() => {
    const load = begin();
    let lastPhase = initial ? 'cache' : '';
    setProg(initial); setProgRef(null); setLoading(!initial); setError(null);
    if (initial) load.cache({ sessions: initial.sessions?.length || 0 });
    const candidates = [];
    if (clientId && programId) candidates.push({ id: programId, ref: doc(db, 'clients', clientId, 'programmes', programId) });
    const id = programId || clientId;
    if (id) candidates.push({ id, ref: doc(db, 'programmes', id) });
    const fail = failure => {
      if (!load.current()) return;
      lastPhase = 'error';
      setError(failure); setLoading(false); setProgRef(null); load.error();
      if (failure?.code === 'permission-denied' || failure?.code === 'unauthenticated') setProg(null);
    };
    const timeout = setTimeout(() => fail(new Error('program-load-timeout')), 10000);
    const stop = subscribeToProgram({ candidates, subscribe: onSnapshot,
      onValue(hit, cached) {
        if (!load.current() || (fresh && cached)) return;
        if (!cached) clearTimeout(timeout);
        setProg(hit ? { ...hit.data, id: hit.id } : null);
        // Cached data may be read, but edits must use a server-confirmed document.
        setProgRef(!cached && hit ? hit.ref : null);
        setLoading(false); setError(null);
        const phase = cached ? 'cache' : 'ready';
        if (phase !== lastPhase) {
          lastPhase = phase;
          const counts = { sessions: hit?.data?.sessions?.length || 0, receivedMs: Math.round(performance.now()) };
          if (cached) load.cache(counts); else load.ready(counts);
        }
      }, onError: fail,
    });
    return () => { clearTimeout(timeout); stop(); };
  }, [clientId, programId, user?.uid, initial, fresh, begin]);
  return { prog, progRef, loading, error, loadState };
}
