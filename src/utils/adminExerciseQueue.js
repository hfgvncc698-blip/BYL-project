// Confirmed live proposals take precedence over an older full-catalog read.
// Keep legacy incomplete exercises in the completion queue as well.
export function mergeAdminExerciseQueue(catalog, liveByCollection) {
  const rows = new Map();
  const key = row => `${row.__collection}/${row.docId}`;
  for (const row of catalog) {
    if (row.status === 'pending' && Object.hasOwn(liveByCollection, row.__collection)) continue;
    rows.set(key(row), row);
  }
  for (const proposals of Object.values(liveByCollection)) {
    for (const row of proposals) rows.set(key(row), row);
  }
  const millis = row => row.createdAt?.toMillis?.() || row.createdAt?.toDate?.().getTime() || 0;
  return [...rows.values()].sort((a, b) => millis(b) - millis(a));
}
