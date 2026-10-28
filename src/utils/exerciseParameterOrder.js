// Stable technical keys: order never depends on language or stored custom order.
export const EXERCISE_PARAMETER_KEYS = Object.freeze([
  'series', 'repetitions', 'charge', 'temps', 'distance', 'vitesse',
  'inclinaison', 'resistance', 'watts', 'calories', 'tempo', 'intensite', 'repos',
]);
export const EXERCISE_PARAMETER_LABELS = Object.freeze([
  'Séries', 'Répétitions', 'Charge (kg)', 'Durée (min:sec)', 'Distance', 'Vitesse',
  'Inclinaison (%)', 'Résistance', 'Watts', 'Objectif Calories', 'Tempo', 'Intensité', 'Repos (min:sec)',
]);
export function orderExerciseOptions(options = []) {
  const rank = label => { const i = EXERCISE_PARAMETER_LABELS.indexOf(label); return i < 0 ? Infinity : i; };
  return [...options].sort((a, b) => rank(a) - rank(b));
}
export function orderExerciseMetrics(metrics = []) {
  const aliases = { set: 'series', reps: 'repetitions', load: 'charge', duration: 'temps', rest: 'repos', incline: 'inclinaison' };
  const rank = item => { const key = aliases[item.key] || item.key; const i = EXERCISE_PARAMETER_KEYS.indexOf(key); return i < 0 ? Infinity : i; };
  return [...metrics].sort((a, b) => rank(a) - rank(b));
}
