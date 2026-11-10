// Use civil midnights: a week containing a DST change is not 168 hours.
export function calendarWindow(date,view='week') {
  const start=new Date(date);start.setHours(0,0,0,0);
  if(view==='month')start.setDate(1);
  if(view==='month'||view==='week'||view==='work_week')start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end=new Date(start);
  end.setDate(end.getDate()+(view==='month'?42:view==='day'?1:view==='agenda'?31:7));
  return [+start,+end];
}
export function visibleEvents(events,from,to){
  return events.filter(e=>+new Date(e.start)<to && (+new Date(e.end)>from || +new Date(e.start)===from));
}

export const formatLocalDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const sameCalendarDay = (a, b) => {
   if (!a || !b) return false;
   return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
   );
};
