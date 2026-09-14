export function dashboardWeek(now, offset = 0) {
  const start = new Date(now);
  start.setHours(0,0,0,0);
  start.setDate(start.getDate() - (start.getDay()+6)%7 + offset*7);
  const end = new Date(start);
  end.setDate(end.getDate()+7);
  return {start,end};
}
