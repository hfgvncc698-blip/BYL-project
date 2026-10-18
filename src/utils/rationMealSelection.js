export const RATION_MEALS = ['petit_dej', 'collation_matin', 'dejeuner', 'collation_apm', 'diner', 'collation_soir'];
export const DEFAULT_RATION_MEALS = ['petit_dej', 'dejeuner', 'diner'];
const aliases = { collation_1: 'collation_matin', collation_2: 'collation_apm', collation_3: 'collation_soir', petit_dejeuner: 'petit_dej' };
export const canonicalRationMeal = key => aliases[key] || key;
export function normalizeSelectedMeals(meals) {
  const chosen = new Set((Array.isArray(meals) ? meals : []).map(canonicalRationMeal));
  return RATION_MEALS.filter(key => chosen.has(key));
}
export function recommendedRationMeals(kcal = 0, digestiveMode = false) {
  return RATION_MEALS.filter(key => DEFAULT_RATION_MEALS.includes(key)
    || (key === 'collation_apm' && (digestiveMode || kcal >= 2200))
    || (key === 'collation_matin' && (digestiveMode || kcal >= 3000))
    || (key === 'collation_soir' && (digestiveMode || kcal >= 3400)));
}
export function initialRationMeals(state, kcal = 0, digestiveMode = false) {
  const saved = normalizeSelectedMeals(state?.selectedMeals);
  if (saved.length && state?.mealSelectionManual !== false) return saved;
  const active = [];
  for (const slot of Object.values(state?.slots || {})) {
    if (Number(slot?.multiplier) > 0) active.push(slot.mealKey);
  }
  for (const row of Object.values(state?.values || {})) {
    for (const [key, qty] of Object.entries(row?.meals || {})) if (Number(qty) > 0) active.push(key);
  }
  const inferred = normalizeSelectedMeals(active);
  return normalizeSelectedMeals([...recommendedRationMeals(kcal, digestiveMode), ...inferred]);
}
export function selectedMealDistribution(distribution, selectedMeals) {
  if (!selectedMeals) return distribution;
  const selected = new Set(normalizeSelectedMeals(selectedMeals));
  const sum = Object.entries(distribution).reduce((n, [key, value]) => n + (selected.has(key) ? value : 0), 0);
  return Object.fromEntries(Object.entries(distribution).map(([key, value]) => [key, selected.has(key) ? (sum > 0 ? value / sum : 1 / selected.size) : 0]));
}
