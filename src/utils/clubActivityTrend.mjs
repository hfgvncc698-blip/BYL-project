// Calendar buckets in local time; each available record counts once at its activity date.
export function buildClubActivityTrend(series, period, now = Date.now()) {
  const count = period === "day" ? 14 : period === "year" ? 5 : 12;
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);
  if (period !== "day") current.setDate(1);
  if (period === "year") current.setMonth(0);
  const offset = (date, amount) => {
    const next = new Date(date);
    if (period === "day") next.setDate(next.getDate() + amount);
    else if (period === "year") next.setFullYear(next.getFullYear() + amount);
    else next.setMonth(next.getMonth() + amount);
    return next.getTime();
  };
  const rows = Array.from({ length: count }, (_, index) => ({
    at: offset(current, index - count + 1),
    end: offset(current, index - count + 2),
    clients: 0, programs: 0, nutrition: 0, sessions: 0,
  }));
  for (const [key, records] of Object.entries(series)) {
    for (const record of records) {
      const timestamp = Number(record.activityAt);
      if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > now) continue;
      const bucket = rows.find((row) => timestamp >= row.at && timestamp < row.end);
      if (bucket) bucket[key] += 1;
    }
  }
  return rows;
}
