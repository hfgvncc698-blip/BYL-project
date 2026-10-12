// A coach's recorded decision takes precedence over the scheduled date.
export function coachSessionCalendarStatus(session) {
  const status = String(session.status || '').trim().toLowerCase();
  if (['manquée', 'manquee', 'missed', 'annulée', 'annulee', 'cancelled', 'canceled'].includes(status)) return session.status;
  if (['validée', 'validee', 'done', 'completed'].includes(status) || session.validatedAt || session.completedAt) return 'validée';
  return session.status || 'à venir';
}
