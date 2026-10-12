import { rationMenuNum as number } from './rationMenu.js';

export function evaluateMenuQuality(days = [], targets = {}) {
  const targetKcal = number(targets.kcal);
  const invalidDays = days.filter(({ totals = {} }) => {
    const kcal = number(totals?.kcal);
    if (!(targetKcal > 0) || !(kcal > 0) || Math.abs(kcal - targetKcal) / targetKcal > 0.15) return true;
    return [
      [totals?.p, targets.p],
      [totals?.f, targets.f],
      // Manual menus use carbs; automatic menus use c.
      [totals?.c ?? totals?.carbs, targets.c],
    ].some(([value, target]) => number(target) > 0 && Math.abs(number(value) - number(target)) / number(target) > 0.25);
  });
  return { targetKcal, invalidDays, ready: targetKcal > 0 && days.length > 0 && invalidDays.length === 0 };
}

export function includesMenuContent(sections = {}) {
  return Boolean(sections.menu || sections.recipes || sections.shoppingList);
}
