import { normalizeExerciseHistoryToken as token } from './exerciseHistoryIdentity.js';

const equipment = ex => (Array.isArray(ex.materiel) ? ex.materiel : [ex.materiel]).filter(Boolean).map(token);
export function varyCycleExercises(sessions, bank, cycleType) {
  const result = structuredClone(sessions);
  if (['recovery', 'custom'].includes(cycleType)) return result;
  const available = new Set(result.flatMap(s => ['exercises', 'corps', 'bonus', 'echauffement'].flatMap(k => (s[k] || []).flatMap(equipment))));
  const used = new Set(result.flatMap(s => ['exercises', 'corps', 'bonus'].flatMap(k => (s[k] || []).map(ex => token(ex.nom || ex.name)))));
  for (const session of result) {
    const key = session.useSections ? 'corps' : 'exercises';
    const list = session[key] || [];
    let remaining = Math.floor(list.length / 3);
    session[key] = list.map((ex, index) => {
      // Keep the first movement as a reference; change at most a third of the main work.
      if (!index || !remaining || ex.useAdvancedSets || ex.seriesDiff || !Number(ex['Répétitions']) || Number(ex['Durée (min:sec)'])) return ex;
      const original = bank.find(item => item.id === ex.id || token(item.nom) === token(ex.nom || ex.name));
      const variants = new Set((original?.variantes || ex.variantes || []).map(token));
      const candidate = bank.find(item => variants.has(token(item.nom)) && !used.has(token(item.nom))
        && token(item.groupe_musculaire) === token(original?.groupe_musculaire || ex.groupe_musculaire)
        && ['tous niveaux', 'debutant'].includes(token(item.niveau))
        && equipment(item).length > 0 && equipment(item).every(value => value === 'aucun' || available.has(value))
        && !/jump|saut|explos|plyom|olympi/.test(token(item.nom)));
      if (!candidate) return ex;
      remaining--;
      used.add(token(candidate.nom));
      // Copy the NEW identity and instructions, never the former exercise's load/history.
      return { ...structuredClone(candidate), 'Séries': ex['Séries'] || 3, 'Répétitions': ex['Répétitions'], 'Repos (min:sec)': ex['Repos (min:sec)'] || 90,
        'Charge (kg)': 0, optionsOrder: ['Séries', 'Répétitions', 'Charge (kg)', 'Repos (min:sec)'],
        cycleVariation: { previousName: ex.nom || ex.name || '', proposed: true } };
    });
  }
  return result;
}
