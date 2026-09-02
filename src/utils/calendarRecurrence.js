export const RECURRENCE_FREQUENCIES = ["none", "daily", "weekly", "monthly", "yearly"];
export const MAX_RECURRENCE_OCCURRENCES = 100;

export const createDefaultRecurrence = () => ({
  frequency: "none",
  endMode: "count",
  count: 4,
  until: "",
});

const clampCount = (value) =>
  Math.min(MAX_RECURRENCE_OCCURRENCES, Math.max(1, Math.floor(Number(value) || 1)));

const lastDayOfMonth = (year, month) => new Date(year, month + 1, 0).getDate();

export function addRecurrenceInterval(startDate, frequency, index) {
  const start = new Date(startDate);
  if (index === 0) return start;

  const next = new Date(start);
  if (frequency === "daily" || frequency === "weekly") {
    next.setDate(start.getDate() + index * (frequency === "weekly" ? 7 : 1));
    return next;
  }

  if (frequency === "monthly") {
    const targetMonth = start.getMonth() + index;
    const targetYear = start.getFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    next.setDate(1);
    next.setFullYear(targetYear, normalizedMonth, Math.min(start.getDate(), lastDayOfMonth(targetYear, normalizedMonth)));
    return next;
  }

  if (frequency === "yearly") {
    const targetYear = start.getFullYear() + index;
    next.setDate(1);
    next.setFullYear(targetYear, start.getMonth(), Math.min(start.getDate(), lastDayOfMonth(targetYear, start.getMonth())));
    return next;
  }

  return start;
}

export function expandRecurringDates(startValue, recurrence = createDefaultRecurrence()) {
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return [];

  const frequency = RECURRENCE_FREQUENCIES.includes(recurrence?.frequency)
    ? recurrence.frequency
    : "none";
  if (frequency === "none") return [start];

  if (recurrence?.endMode === "until") {
    if (!recurrence.until) return [];
    const until = new Date(`${recurrence.until}T23:59:59.999`);
    if (Number.isNaN(until.getTime()) || until < start) return [];
    const dates = [];
    for (let index = 0; index < MAX_RECURRENCE_OCCURRENCES; index += 1) {
      const date = addRecurrenceInterval(start, frequency, index);
      if (date > until) break;
      dates.push(date);
    }
    return dates;
  }

  return Array.from({ length: clampCount(recurrence?.count) }, (_, index) =>
    addRecurrenceInterval(start, frequency, index)
  );
}

export function createRecurrenceGroupId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `recurrence_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
