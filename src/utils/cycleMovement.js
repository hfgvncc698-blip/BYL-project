import { normalizeExerciseHistoryToken as token } from './exerciseHistoryIdentity.js';

// Same movement family, not just the same muscle: a fly is not a press.
export function isHorizontalPress(exercise) {
  return /\b(chest press convergente|developpe couche|bench press|pompes?|push ups?)\b/.test(token(exercise.nom || exercise.name));
}

export function isCycleCompound(exercise) {
  return exercise.isCompound === true || isHorizontalPress(exercise)
    || /\b(squat|deadlift|souleve de terre|row|rowing|traction|pull up|leg press|presse a cuisses)\b/.test(token(exercise.nom || exercise.name));
}
