const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function expandClubRecurrence(startsAt, recurrence) {
  const first = new Date(startsAt);
  if (!recurrence || recurrence.frequency === 'none') return [first];
  const { frequency, until, timeZone } = recurrence;
  if (!['daily', 'weekly', 'monthly'].includes(frequency)) fail('Récurrence invalide.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until || '')) fail('Choisissez une date de fin.');
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }); } catch { fail('Fuseau horaire invalide.'); }
  if (!timeZone || !Number.isFinite(first.getTime())) fail('Date ou fuseau horaire invalide.');
  const parts = date => Object.fromEntries(formatter.formatToParts(date).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
  const p = parts(first);
  const localStart = Date.UTC(p.year, p.month-1, p.day, p.hour, p.minute);
  const dateKey = d => d.toISOString().slice(0,10);
  if (until < dateKey(new Date(localStart))) fail('La fin doit suivre la première séance.');
  if (!Number.isFinite(Date.parse(until+'T00:00:00Z')) || new Date(until+'T00:00:00Z').toISOString().slice(0,10) !== until) fail('Date de fin invalide.');
  if (Date.parse(until+'T23:59:59Z') - localStart > 366*86400000) fail('La récurrence est limitée à un an.');
  const dates = [];
  for (let i=0; i<367; i++) {
    const local = new Date(localStart);
    if (frequency === 'monthly') { local.setUTCDate(1); local.setUTCMonth(local.getUTCMonth()+i); local.setUTCDate(p.day); }
    else local.setUTCDate(local.getUTCDate()+i*(frequency === 'weekly' ? 7 : 1));
    if (dateKey(local) > until) break;
    if (frequency === 'monthly' && local.getUTCDate() !== p.day) continue;
    // Preserve the wall-clock time, including across daylight-saving changes.
    let instant = local.getTime();
    for (let attempt=0; attempt<4; attempt++) {
      const q = parts(new Date(instant));
      const represented = Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute);
      const difference = local.getTime()-represented;
      if (!difference) break;
      instant += difference;
    }
    const q = parts(new Date(instant));
    if (Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute) !== local.getTime()) fail('Une séance tombe sur une heure inexistante lors du changement d’heure. Choisissez un autre horaire.');
    dates.push(new Date(instant));
  }
  if (!dates.length || dates.length > 366) fail('La série doit contenir entre 1 et 366 séances.');
  return dates;
}
module.exports = { expandClubRecurrence };
