export const isLastPackSession = pack => pack?.state === 'active' && Number(pack.remaining) === 1;
export function eventLastPacks(packs = [], event) {
  const ids = [event?.id, event?._sourceId, event?.classId, event?.clubAppointmentId].filter(Boolean);
  return packs.filter(pack => isLastPackSession(pack) && pack.reservationEventIds?.some(id => ids.includes(id)));
}

export function eventPackProgress(packs = [], event, events = []) {
  const ids = e => [e.id,e._sourceId,e.classId,e.clubAppointmentId].filter(Boolean);
  for (const pack of packs) {
    const past = (pack.history || []).findIndex(item => ids(event).includes(item.id));
    if (past >= 0) return { number: past + 1, total: pack.quantity, name: pack.name };
    if (!pack.reservationEventIds?.some(id => ids(event).includes(id))) continue;
    const reserved = events.filter(e => pack.reservationEventIds.some(id => ids(e).includes(id)))
      .sort((a,b) => new Date(a.start)-new Date(b.start) || a.id.localeCompare(b.id));
    const seen = new Set();
    let index = 0;
    for (const item of reserved) {
      if (ids(item).some(id => seen.has(id))) continue;
      ids(item).forEach(id => seen.add(id));
      index++;
      if (ids(item).some(id => ids(event).includes(id))) return {number:(pack.used ?? pack.quantity-pack.remaining)+index,total:pack.quantity,name:pack.name};
    }
  }
  return null;
}
