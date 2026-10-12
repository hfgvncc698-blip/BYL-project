// Only collapse explicit links to the same appointment, never repeated workouts.
export function dedupeCalendarCompletions(records = []) {
  const result = [], indexes = new Map();
  const time = value => value?.toMillis?.() || value?.toDate?.().getTime() || +new Date(value || 0) || 0;
  for (const record of records) {
    const link = record.calendarEventId || record.plannedEventId;
    if (!link) { result.push(record); continue; }
    const previousIndex = indexes.get(link);
    if (previousIndex === undefined) { indexes.set(link, result.length); result.push(record); continue; }
    const previous = result[previousIndex];
    const newest = Math.max(time(record.updatedAt), time(record.completedAt), time(record.date));
    const oldest = Math.max(time(previous.updatedAt), time(previous.completedAt), time(previous.date));
    if (newest >= oldest) result[previousIndex] = record;
  }
  return result;
}
