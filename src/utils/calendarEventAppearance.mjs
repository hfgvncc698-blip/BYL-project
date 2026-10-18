import { clubCoachKey, coachCalendarColor } from './clubCalendarColors.mjs';
export function calendarEventEnd(event) {
  const value = event.end || event._end;
  if (value) return +(value.toDate ? value.toDate() : new Date(value));
  const start = event.start || event._start || event.startsAt;
  return +(start?.toDate ? start.toDate() : new Date(start)) + (Number(event.durationMin) || 60) * 60000;
}
export function calendarEventCancelled(event) {
  const status=String(event.status||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
  return ['annule','annulee','cancelled','canceled'].includes(status);
}
export function calendarEventValidated(event, now = Date.now()) {
  const status = String(event.status || '').toLowerCase();
  if (calendarEventCancelled(event)) return false;
  if (['annulée', 'annulee', 'cancelled', 'canceled', 'manquée', 'manquee', 'missed'].includes(status)) return false;
  return event.validated === true || ['validée', 'validee', 'done', 'completed'].includes(status) || event._kind === 'completed'
    || ((event.type === 'group' || !!event._clubClass) && (!status || status === 'à venir') && calendarEventEnd(event) <= now);
}
export function calendarEventAppearance(event, fallback = '#1D4ED8', now = Date.now(), colorOverride) {
  const key = clubCoachKey(event);
  const base = colorOverride || (key === '__unknown__' ? (fallback || '#1D4ED8') : coachCalendarColor(key));
  const past = calendarEventEnd(event) <= now;
  const cancelled=calendarEventCancelled(event);
  const backgroundColor = (cancelled || past) && /^#[0-9a-f]{6}$/i.test(base)
    ? '#' + [0, 1, 2].map(i => Math.round(parseInt(base.slice(1+i*2,3+i*2),16)*0.45 + [116,125,139][i]*0.55).toString(16).padStart(2,'0')).join('') : base;
  const state = coachEventDisplayState(event, now);
  const statusColor = { cancelled: '#64748B', missed: '#B91C1C', review: '#92400E', pending: '#92400E' }[state];
  return { backgroundColor: statusColor || backgroundColor, color: '#FFFFFF', past, cancelled: state === 'cancelled', validated: calendarEventValidated(event, now) };
}

// Coach view distinguishes appointment types; club views retain per-coach colors.
export const coachEventColors = { individual: '#1D4ED8', group: '#7C3AED', nutrition: '#0F766E', internal: '#475569' };
export function coachEventCategory(event) {
  if (event.type === 'group' || event._clubClass) return 'group';
  if (event.eventType === 'nutrition_appointment' || event.type === 'nutrition') return 'nutrition';
  if (event.type === 'internal') return 'internal';
  return 'individual';
}
export function coachEventAppearance(event, now = Date.now()) {
  const appearance = calendarEventAppearance(event, undefined, now, coachEventColors[coachEventCategory(event)]);
  const state = coachEventDisplayState(event, now);
  const colors = { cancelled: '#64748B', missed: '#B91C1C', pending: '#92400E', review: '#92400E' };
  return { ...appearance, backgroundColor: colors[state] || appearance.backgroundColor };
}

// Presentation only: elapsed time must never change attendance or billing records.
export function coachEventDisplayState(event, now = Date.now()) {
  if (calendarEventCancelled(event)) return 'cancelled';
  if (calendarEventValidated(event, now)) return 'validated';
  if (['accepted', 'pending', 'rejected'].includes(event.excuseDecision) || event.cancellationReason) return 'cancelled';
  const status = String(event.status || '').toLowerCase();
  if (['manquée', 'manquee', 'missed'].includes(status)) return 'missed';
  if (calendarEventEnd(event) <= now) return 'review';
  return 'upcoming';
}

export function coachEventFormStatus(event, now = Date.now()) {
  return ({ cancelled: 'annulée', validated: 'validée', missed: 'manquée', review: 'review', upcoming: 'à venir' })[coachEventDisplayState(event, now)];
}

export function calendarEventStatusKey(event, now = Date.now()) {
  return ({cancelled:'common.cancelled',validated:'status.validated',missed:'status.missed',pending:'status.cancellation_pending',review:'status.to_validate',upcoming:'status.upcoming'})[coachEventDisplayState(event, now)];
}

export function calendarEventStatusColor(event) {
  return ({validated:'green',cancelled:'gray',missed:'red',review:'orange',pending:'orange',upcoming:'blue'})[coachEventDisplayState(event)];
}
