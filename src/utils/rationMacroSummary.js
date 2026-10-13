export function rationMacroSummary(meals) {
  const sum = values => values.length && values.every(value => typeof value === 'number' && Number.isFinite(value))
    ? values.reduce((total, value) => total + value, 0) : null;
  const kcal = sum(meals.map(meal => meal.kcal));
  return ['prot', 'lip', 'glu'].map((key, index) => {
    const grams = sum(meals.map(meal => meal.macros?.[key]));
    return { key, grams, percent: grams != null && kcal > 0 ? grams * [4, 9, 4][index] / kcal * 100 : null };
  });
}
