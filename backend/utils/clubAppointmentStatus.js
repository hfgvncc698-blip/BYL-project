// Collective classes are completed by their end time; explicit cancellation/no-show wins.
function clubAppointmentStatus(appointment, now = Date.now()) {
  const status = appointment.status || 'à venir';
  if (appointment.type !== 'group' || status !== 'à venir') return status;
  const raw = appointment.startsAt;
  if (raw == null) return status;
  const start = typeof raw?.toMillis === 'function' ? raw.toMillis()
    : typeof raw === 'number' ? raw : new Date(raw).getTime();
  const duration = Number(appointment.durationMin || 60);
  return Number.isFinite(start) && Number.isFinite(duration) && duration > 0 && start + duration * 60000 <= now
    ? 'validée' : status;
}
module.exports = { clubAppointmentStatus };
