import { isCycleCompound, isHorizontalPress } from './cycleMovement.js';
import { cycleExerciseEvidence } from './cycleEvidence.js';
import { normalizeExerciseHistoryToken as token } from './exerciseHistoryIdentity.js';

const equipment = ex => (Array.isArray(ex.materiel) ? ex.materiel : [ex.materiel]).filter(Boolean).map(token);
export function varyCycleExercises(sessions, bank, cycleType, history = []) {
  const result = structuredClone(sessions);
  // A variation from an older cycle is now the reference exercise, not a new change.
  for (const session of result) {
    for (const key of ['exercises', 'corps', 'bonus', 'echauffement', 'retourCalme']) {
      for (const exercise of session[key] || []) delete exercise.cycleVariation;
    }
  }
  if (cycleType === 'custom') return result;
  const available = new Set(result.flatMap(s => ['exercises', 'corps', 'bonus', 'echauffement'].flatMap(k => (s[k] || []).flatMap(equipment))));
  for (const session of result) {
    const used = new Set(['exercises', 'corps', 'bonus'].flatMap(key => (session[key] || []).map(ex => token(ex.nom || ex.name))));
    for (const key of session.useSections ? ['corps', 'bonus'] : ['exercises']) {
      const list = session[key] || [];

      session[key] = list.map(ex => {
        // Main lifts may rotate too; preserve special prescriptions and timed work.
        if (ex.useAdvancedSets || ex.seriesDiff || ex.series_differentes || ex.seriesDifferentes || !Number(ex['Répétitions']) || Number(ex['Durée (min:sec)'])) return ex;
        const evidence = cycleExerciseEvidence(ex, history);
        // Rotation is variety, not evidence of higher performance or technical mastery.
        if (cycleType === 'recovery' || !evidence.occurrences.length || evidence.recentFailure) return ex;
        const original = bank.find(item => item.id === ex.id || token(item.nom) === token(ex.nom || ex.name));
        const variants = new Set((original?.variantes || ex.variantes || []).map(token));
        const sourceName = token(original?.nom || ex.nom || ex.name);
        const source = original || ex;
        const muscle = token(source.groupe_musculaire);
        const levels = { debutant: 0, 'tous niveaux': 0, intermediaire: 1 };
        const sourceLevel = levels[token(source.niveau)] ?? 0;
        const candidates = bank.filter(item => (variants.has(token(item.nom))
          || (item.variantes || []).some(name => token(name) === sourceName)
          || (isHorizontalPress(source) && isHorizontalPress(item))) && !used.has(token(item.nom))
          && muscle && token(item.groupe_musculaire) === muscle
          && levels[token(item.niveau)] <= sourceLevel
          && equipment(item).length > 0 && equipment(item).every(value => ['aucun', 'poids du corps'].includes(value) || available.has(value))
          && !/jump|saut|explos|plyom|olympi/.test(token(item.nom)));
        // Prefer a different support for presses over merely changing the grip.
        const candidate = candidates.find(item => isHorizontalPress(source) && isHorizontalPress(item)
          && equipment(item).join('|') !== equipment(source).join('|')) || candidates[0];
        if (!candidate) return ex;
        used.add(token(candidate.nom));
        // Copy the NEW identity and instructions, never the former exercise's load/history.
        return { ...structuredClone(candidate), 'Séries': ex['Séries'] || 3, 'Répétitions': ex['Répétitions'], 'Repos (min:sec)': ex['Repos (min:sec)'] || 90,
          'Charge (kg)': 0, optionsOrder: ['Séries', 'Répétitions', 'Charge (kg)', 'Repos (min:sec)'],
          cycleVariation: { previousName: ex.nom || ex.name || '', proposed: true, reason: isCycleCompound(ex) || ex.role === 'primary' ? 'main_rotation' : 'accessory_rotation', evidenceIds: evidence.recordIds.slice(0, 1) } };
      });
    }
  }
  return result;
}
