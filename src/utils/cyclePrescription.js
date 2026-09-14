import { findCompletionExerciseSnapshot, isValidatedExerciseCompletion, normalizeExerciseHistoryToken } from './exerciseHistoryIdentity.js';

// Conservative, editable coach presets, not an individualised medical prescription.
// Do not extrapolate a 1RM or increase loads automatically from a single performance.
export const CYCLE_PRESETS = {
  general: { reps: 15, sets: 2, rest: 90 },
  endurance: { reps: 20, sets: 3, rest: 60 },
  hypertrophy: { reps: 10, sets: 3, rest: 90 },
  strength: { reps: 6, sets: 3, rest: 180 },
};
const number = value => Number(String(value ?? '').replace(',', '.')) || 0;
const timestamp = record => {
  const value = record.completedAt || record.validatedAt || record.dateEffectuee || record.date;
  return value?.toMillis?.() || (value?.seconds ? value.seconds * 1000 : Date.parse(value)) || 0;
};

export function adaptCycleSessions(sourceSessions, type, history = []) {
  const records = history.filter(isValidatedExerciseCompletion).sort((a, b) => timestamp(b) - timestamp(a));
  const report = { version: 1, type, adapted: 0, fromHistory: 0, unchanged: 0, reviewRequired: true };
  const sessions = structuredClone(sourceSessions);
  for (const session of sessions) {
    const keys = session.useSections ? ['corps', 'bonus'] : ['exercises', 'corps'];
    for (const key of keys) {
      if (!Array.isArray(session[key])) continue;
      session[key] = session[key].map(ex => {
        const reps = number(ex['Répétitions']);
        // Preserve cardio, timed work, advanced set schemes and unknown formats.
        if (type === 'custom' || !reps || ex.useAdvancedSets || ex.seriesDiff || ex.series_differentes || ex.seriesDifferentes || number(ex['Durée (min:sec)']) > 0) { report.unchanged++; return ex; }
        let performance;
        let recordId = '';
        const occurrences = [];
        for (const record of records) {
          const snapshot = findCompletionExerciseSnapshot(record, ex);
          const sets = snapshot?.sets?.filter(set => number(set.chargeKg) > 0 && number(set.reps) > 0) || [];
          if (sets.length) occurrences.push({ record, sets });
        }
        performance = occurrences[0]?.sets[0];
        recordId = occurrences[0]?.record.id || '';
        const name = normalizeExerciseHistoryToken(ex.nom || ex.name || ex.exerciseName);
        const compound = ex.isCompound === true || /\b(squat|deadlift|souleve de terre|bench press|developpe couche|row|rowing|traction|pull up|leg press|presse a cuisses)\b/.test(name);
        const basePreset = type === 'recovery'
          ? { reps, sets: Math.max(1, Math.ceil((number(ex['Séries']) || 2) / 2)), rest: Math.max(90, number(ex['Repos (min:sec)'])) }
          : type === 'strength' && !compound ? CYCLE_PRESETS.hypertrophy : CYCLE_PRESETS[type];
        if (!basePreset) { report.unchanged++; return ex; }
        const preset = { ...basePreset };
        const maxReps = { general: 20, endurance: 25, hypertrophy: 12, strength: compound ? 6 : 12 }[type];
        // Only actual, repeated results can advance the repetition target.
        // Never compound improvements by treating a projected cycle as a completed one.
        const target = Math.max(preset.reps, Math.min(maxReps || reps, reps));
        const repeatedSuccess = type !== 'recovery' && occurrences.length >= 2
          && occurrences[0].record.id && occurrences[1].record.id && occurrences[0].record.id !== occurrences[1].record.id
          && occurrences.slice(0, 2).every(item => item.sets.length >= preset.sets
            && item.sets.every(set => number(set.reps) >= target && number(set.chargeKg) >= number(ex['Charge (kg)'])));
        if (repeatedSuccess) preset.reps = Math.min(maxReps, target + 1);
        const baseLoad = performance ? number(performance.chargeKg) : number(ex['Charge (kg)']);
        const baseReps = performance ? number(performance.reps) : reps;
        // More repetitions => lighter starting load; fewer repetitions never imply an automatic increase.
        const factor = type === 'recovery' ? 0.6 : Math.min(1, (1 + baseReps / 30) / (1 + preset.reps / 30));
        const load = Math.floor(baseLoad * factor * 2) / 2;
        const next = { ...ex, 'Répétitions': preset.reps, 'Séries': preset.sets, 'Repos (min:sec)': preset.rest,
          cyclePrescription: { type, baseLoad, baseReps, recordId, suggestedKg: load, targetReps: preset.reps, source: performance ? 'history' : 'programme', repeatedSuccess: !!repeatedSuccess, reviewRequired: true } };
        if ('Charge (kg)' in ex || performance) next['Charge (kg)'] = 0;
        if (Array.isArray(next.optionsOrder)) next.optionsOrder = [...new Set([...next.optionsOrder, 'Répétitions', 'Séries', 'Repos (min:sec)', ...('Charge (kg)' in next ? ['Charge (kg)'] : [])])];
        // Keep the builder/player representations consistent, without legacy completion data.
        if (Array.isArray(next.sets)) next.sets = Array.from({ length: preset.sets }, () => ({ reps: preset.reps, chargeKg: 0, restSec: preset.rest }));
        delete next.seriesDetails;
        delete next._historyLoadAuto;
        report.adapted++;
        if (performance) report.fromHistory++;
        return next;
      });
    }
  }
  return { sessions, report };
}
