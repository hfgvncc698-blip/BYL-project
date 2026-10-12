// Show current balances of packs applicable to this class, not a forecast after booking.
export function participantPacks(client, event) {
  const date = new Date(event?.startsAt || event?.start);
  const day = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(date) : '';
  const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('fr');
  return (client?.packs || []).filter(pack => pack.type === 'group' && !pack.cancelled && !pack.deleted
    && (!pack.courseTitle || normalize(pack.courseTitle) === normalize(event?.title))
    && (!day || (pack.start <= day && (!pack.end || day <= pack.end))));
}
