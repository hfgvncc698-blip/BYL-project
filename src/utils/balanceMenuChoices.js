const METRICS = ['kcal', 'p', 'f', 'c'];
const value = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;

// Candidates have already passed the menu's food, allergy and meal-role filters.
// Keep the ration quantities fixed; choose the closest combination of actual foods.
export function balanceMenuChoices(mapping, candidates, target) {
  const result = { ...mapping };
  const keys = Object.keys(candidates).filter(key => candidates[key].some(item => item.code === mapping[key]));
  const chosen = Object.fromEntries(keys.map(key => [key, candidates[key].find(item => item.code === mapping[key])]));
  const totals = Object.fromEntries(METRICS.map(metric => [metric, keys.reduce((sum, key) => sum + value(chosen[key][metric]), 0)]));
  const score = (nutrition) => METRICS.reduce((sum, metric) => {
    const goal = value(target?.[metric]);
    if (goal <= 0) return sum;
    const error = Math.abs(value(nutrition[metric]) - goal) / goal;
    const limit = metric === 'kcal' ? 0.05 : 0.1;
    return sum + (metric === 'kcal' ? 4 : 1) * error ** 2 + 20 * Math.max(0, error - limit) ** 2;
  }, 0);
  let currentScore = score(totals);
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const key of keys) {
      let best = chosen[key];
      let bestScore = currentScore;
      for (const candidate of candidates[key]) {
        const proposed = Object.fromEntries(METRICS.map(metric => [metric, totals[metric] - value(chosen[key][metric]) + value(candidate[metric])]));
        const nextScore = score(proposed);
        if (nextScore < bestScore - 1e-10) { best = candidate; bestScore = nextScore; }
      }
      if (best !== chosen[key]) {
        for (const metric of METRICS) totals[metric] += value(best[metric]) - value(chosen[key][metric]);
        chosen[key] = best;
        result[key] = best.code;
        currentScore = bestScore;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}
