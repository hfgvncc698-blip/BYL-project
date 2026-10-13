import { MEALS, EXCEL_GROUPS, LOCAL_MACROS_PER100_BY_LABEL, ALCOHOL_KCAL_PER_ML, LOCAL_UNIT_GRAMS } from './foodSurveyCatalog.js';
const num = value => {
  const result = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(result) ? result : 0;
};

const slug = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ').replace(/[^a-z0-9]+/g, '_');
const foods = new Map(EXCEL_GROUPS.flatMap(group => group.items.map(item => [`${slug(group.group)}__${slug(item.label)}`, item])));

export function buildFoodSurveyMeals(survey = {}, ciqualRows = []) {
  const meals = Object.fromEntries(MEALS.map(({ key }) => [key, { key, kcal: 0, macros: { prot: 0, lip: 0, glu: 0 }, items: [] }]));
  const add = (key, item, kcal, macros) => {
    const meal = meals[key] || meals.dejeuner;
    if (!(item.qty > 0)) return;
    meal.items.push(item);
    for (const key of ['prot', 'lip', 'glu']) {
      const value = macros?.[key];
      meal.macros[key] = meal.macros[key] == null || value == null ? null : meal.macros[key] + value;
    }
    meal.kcal = meal.kcal == null || kcal == null ? null : meal.kcal + kcal;
  };
  if (survey.mode === 'ciqual') {
    const byCode = new Map(ciqualRows.map(row => [String(row.code ?? row.alim_code), row]));
    for (const item of survey.ciqual?.items || []) {
      const row = byCode.get(String(item.code));
      const raw = row?.nutrients?.energie_reglement_ue_n_1169_2011_kcal_100g;
      const qty = num(item.qty);
      const unit = item.unit || 'g';
      const kcal = raw == null || !['g', 'ml'].includes(unit) ? null : num(raw) * qty / 100;
      const n = row?.nutrients || {};
      const macros = Object.fromEntries([
        ['prot', n.proteines_n_x_facteur_de_jones_g_100g ?? n.proteines_n_x_6_25_g_100g],
        ['lip', n.lipides_g_100g], ['glu', n.glucides_g_100g],
      ].map(([key, value]) => [key, value == null || !['g', 'ml'].includes(unit) ? null : num(value) * qty / 100]));
      add(item.meal || 'dejeuner', { label: item.name || item.label || row?.name || String(item.code || ''), qty, unit }, kcal, macros);
    }
  } else {
    for (const [key, row] of Object.entries(survey.excel?.values || {})) {
      const food = foods.get(key);
      const label = row.name || row.label || food?.label || key.replace(/_/g, ' ');
      const unit = row.unit || food?.defaultUnit || 'g';
      const macros = LOCAL_MACROS_PER100_BY_LABEL[food?.label || label];
      for (const [mealKey, value] of Object.entries(row.meals || {})) {
        const qty = num(value);
        const grams = qty * (unit === 'portion' ? 100 : unit === 'unité' ? (LOCAL_UNIT_GRAMS[food?.label || label] || 1) : 1);
        const kcal = macros ? (macros.prot * 4 + macros.glu * 4 + macros.lip * 9) * grams / 100
          + ((food?.label || label) === 'Alcool' && unit === 'ml' ? qty * ALCOHOL_KCAL_PER_ML : 0) : null;
        add(mealKey, { label, qty, unit }, kcal, macros && Object.fromEntries(
          Object.entries(macros).map(([key, value]) => [key, value * grams / 100])
        ));
      }
    }
  }
  return Object.values(meals).filter(meal => meal.items.length);
}
