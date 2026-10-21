function timestampMs(value) {
  if (value == null) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && Number.isFinite(Number(value.seconds ?? value._seconds))) {
    return Number(value.seconds ?? value._seconds) * 1000 + Number(value.nanoseconds ?? value._nanoseconds ?? 0) / 1e6;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function day(value) {
  if (typeof value === 'string') return value.slice(0, 10);
  const ms = timestampMs(value);
  return ms ? new Date(ms).toISOString().slice(0, 10) : '';
}
// Measurement date is authoritative; creation time breaks ties on the same day.
// Legacy records without a timestamp retain a deterministic order, before timed records.
export function compareMeasurements(a, b) {
  return day(a.date).localeCompare(day(b.date))
    || (timestampMs(a.timestamp) || timestampMs(a.createdAt) || timestampMs(a.recordedAtMs))
      - (timestampMs(b.timestamp) || timestampMs(b.createdAt) || timestampMs(b.recordedAtMs))
    || String(a.id || '').localeCompare(String(b.id || ''));
}
