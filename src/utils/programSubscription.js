// Start with the live listener: Firestore delivers its local snapshot first,
// then the server snapshot. A preliminary getDoc would repeat this same read.
export function subscribeToProgram({ candidates, subscribe, onValue, onError }) {
  let active = true;
  let unsubscribe;
  let generation = 0;
  const listen = index => {
    unsubscribe?.();
    const currentGeneration = ++generation;
    const candidate = candidates[index];
    if (!candidate) { onValue(null, false); return; }
    const current = () => active && currentGeneration === generation;
    unsubscribe = subscribe(candidate.ref, { includeMetadataChanges: true }, snapshot => {
      if (!current()) return;
      const cached = snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites;
      if (snapshot.exists()) {
        onValue({ ...candidate, data: snapshot.data() }, cached);
      } else if (!cached) {
        // An empty local cache is not proof that an assigned program is absent.
        listen(index + 1);
      }
    }, error => { if (current()) onError(error); });
  };
  listen(0);
  return () => { active = false; generation++; unsubscribe?.(); };
}
