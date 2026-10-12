export const isScheduledCoachEvent = event => ['planned','club_appointment'].includes(event?._kind);
export const isPendingCoachEvent = event => isScheduledCoachEvent(event) && !['validée','manquée','annulée','cancelled','Supprimé du calendrier'].includes(event.status);
export function upcomingCoachSessions(events, now=Date.now()) {
 const endOfToday = new Date(now); endOfToday.setHours(23,59,59,999);
 return events.filter(event=>isPendingCoachEvent(event)&&event.start instanceof Date&&event.start.getTime()>endOfToday.getTime()).sort((a,b)=>a.start-b.start);
}
