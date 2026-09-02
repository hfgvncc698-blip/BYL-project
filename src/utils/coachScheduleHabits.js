const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const toDate = (value) => {
  if (value instanceof Date) return new Date(value);
  if (value?.toDate) return value.toDate();
  const parsed = new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const localDateKey = (date) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const isCompletedEvent = (event) => {
  const status = String(event?.status || "").trim().toLowerCase();
  return event?._kind === "completed" || ["validée", "validee", "terminée", "terminee", "completed", "done"].includes(status);
};

export const learnCoachScheduleHabits = (
  events = [],
  { nowMs = Date.now(), lookbackWeeks = 12, minOccurrences = 3 } = {}
) => {
  const cutoffMs = nowMs - lookbackWeeks * WEEK_MS;
  const groups = new Map();

  events.forEach((event) => {
    const start = toDate(event?.start || event?.startAt || event?.completedAt || event?.validatedAt);
    if (!start || start.getTime() >= nowMs || start.getTime() < cutoffMs || !event?.clientId || !isCompletedEvent(event)) return;
    const minuteOfDay = start.getHours() * 60 + start.getMinutes();
    const halfHourSlot = Math.min(47, Math.max(0, Math.round(minuteOfDay / 30)));
    const key = `${event.clientId}__${start.getDay()}__${halfHourSlot}`;
    const weekDate = new Date(start);
    const weekday = weekDate.getDay();
    weekDate.setDate(weekDate.getDate() + (weekday === 0 ? -6 : 1 - weekday));
    const entry = groups.get(key) || {
      clientId: event.clientId,
      clientName: event._clientName || event.clientName || "",
      weekday: start.getDay(),
      halfHourSlot,
      weeks: new Set(),
      lastStartMs: 0,
    };
    entry.weeks.add(localDateKey(weekDate));
    if (start.getTime() >= entry.lastStartMs) {
      entry.lastStartMs = start.getTime();
      entry.clientName = event._clientName || event.clientName || entry.clientName;
    }
    groups.set(key, entry);
  });

  return [...groups.values()]
    .filter((habit) => habit.weeks.size >= minOccurrences)
    .map((habit) => ({ ...habit, occurrences: habit.weeks.size }));
};

const nextHabitDate = (habit, nowMs) => {
  const now = new Date(nowMs);
  const target = new Date(now);
  const minuteOfDay = habit.halfHourSlot * 30;
  target.setHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
  let daysAhead = (habit.weekday - now.getDay() + 7) % 7;
  if (daysAhead === 0 && target.getTime() < nowMs - 30 * 60 * 1000) daysAhead = 7;
  target.setDate(target.getDate() + daysAhead);
  return target;
};

export const findUpcomingCoachHabit = (
  events = [],
  { nowMs = Date.now(), horizonHours = 36, minOccurrences = 3 } = {}
) => learnCoachScheduleHabits(events, { nowMs, minOccurrences })
  .map((habit) => {
    const target = nextHabitDate(habit, nowMs);
    return { ...habit, target, deltaMs: target.getTime() - nowMs };
  })
  .filter((habit) => habit.deltaMs >= -30 * 60 * 1000 && habit.deltaMs <= horizonHours * 60 * 60 * 1000)
  .sort((a, b) => a.deltaMs - b.deltaMs || b.occurrences - a.occurrences)[0] || null;

export const findNextClientHabit = (
  events = [],
  { clientId, currentStart, nowMs = Date.now(), minOccurrences = 3 } = {}
) => {
  if (!clientId) return null;
  const currentDate = toDate(currentStart) || new Date(nowMs);
  const learned = learnCoachScheduleHabits(
    [
      ...events,
      {
        clientId,
        clientName: events.find((event) => event?.clientId === clientId)?.clientName || "",
        start: currentDate,
        status: "validée",
        _kind: "completed",
      },
    ],
    { nowMs: nowMs + 1000, minOccurrences }
  )
    .filter((habit) => habit.clientId === clientId)
    .sort((a, b) => b.occurrences - a.occurrences || b.lastStartMs - a.lastStartMs);
  const habit = learned[0];
  if (!habit) return null;
  const target = nextHabitDate(habit, nowMs + 60 * 60 * 1000);
  return { ...habit, target };
};

export const hasHabitScheduleConflict = (events = [], habit, toleranceMinutes = 60) => {
  if (!habit?.target || !habit?.clientId) return false;
  return events.some((event) => {
    if (event?.clientId !== habit.clientId) return false;
    const start = toDate(event?.start || event?.startAt);
    if (!start || isCompletedEvent(event) || String(event?.status || "").toLowerCase() === "manquée") return false;
    return Math.abs(start.getTime() - habit.target.getTime()) <= toleranceMinutes * 60 * 1000;
  });
};

export const findNextWorkoutRhythm = (
  completedDates = [],
  { currentStart, sessionsPerWeek = 0, minOccurrences = 3 } = {}
) => {
  const current = toDate(currentStart) || new Date();
  const dates = [...completedDates.map(toDate).filter(Boolean), current]
    .sort((a, b) => a - b)
    .filter((date, index, rows) => index === 0 || date.getTime() - rows[index - 1].getTime() > 6 * 60 * 60 * 1000);
  if (dates.length < minOccurrences || sessionsPerWeek < 2) return null;

  const recent = dates.slice(-5);
  const intervals = recent.slice(1).map((date, index) => (date.getTime() - recent[index].getTime()) / (24 * 60 * 60 * 1000));
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const medianInterval = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  const expectedInterval = 7 / sessionsPerWeek;
  if (!Number.isFinite(medianInterval) || Math.abs(medianInterval - expectedInterval) > 1.25) return null;

  const spacingDays = Math.max(1, Math.round(medianInterval));
  const minuteValues = recent.map((date) => date.getHours() * 60 + date.getMinutes()).sort((a, b) => a - b);
  const learnedMinute = minuteValues[Math.floor(minuteValues.length / 2)];
  const target = new Date(current);
  target.setDate(target.getDate() + spacingDays);
  target.setHours(Math.floor(learnedMinute / 60), learnedMinute % 60, 0, 0);
  return { target, spacingDays, occurrences: dates.length };
};
