export function getCappedCountdownSeconds(currentSeconds, requestedSeconds) {
  const current = Math.max(0, Number(currentSeconds) || 0);
  const requested = Math.max(0, Number(requestedSeconds) || 0);
  return Math.min(current, requested);
}

export function getTrackedTimerSeconds(exercise, label, seconds) {
  const tracked =
    !Array.isArray(exercise?.optionsOrder) || exercise.optionsOrder.includes(label);
  return tracked ? Math.max(0, Number(seconds) || 0) : 0;
}
