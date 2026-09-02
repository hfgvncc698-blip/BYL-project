const finiteNumber = (value) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const nutritionDateKey = (date = new Date()) => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseNutritionQuantity = (value) => {
  if (typeof value === "number") return Math.max(0, value);
  const match = String(value || "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return match ? Math.max(0, finiteNumber(match[0])) : 0;
};

export const parseNutritionUnit = (value, fallback = "g") => {
  const raw = String(value || "").trim();
  const match = raw.match(/[a-zA-ZÀ-ÿ]+(?:\s*\/\s*[a-zA-ZÀ-ÿ]+)?\s*$/);
  return match?.[0]?.trim() || fallback;
};

const nutrientValue = (row, keys) => {
  const nutrients = row?.nutrients || {};
  for (const key of keys) {
    const value = finiteNumber(nutrients[key] ?? row?.[key]);
    if (value > 0) return value;
  }
  return 0;
};

export const ciqualNutritionPer100 = (row = {}) => ({
  kcal: nutrientValue(row, [
    "energie_kcal_100g",
    "energie_reglement_ue_n_1169_2011_kcal_100g",
    "energie_n_x_facteur_jones_avec_fibres_kcal_100g",
  ]),
  p: nutrientValue(row, ["proteines_g_100g", "proteines_n_x_facteur_de_jones_g_100g", "proteines_n_x_6_25_g_100g"]),
  f: nutrientValue(row, ["lipides_g_100g"]),
  c: nutrientValue(row, ["glucides_g_100g"]),
});

const itemName = (item) => {
  if (typeof item === "string") return item;
  return item?.name || item?.label || item?.text || item?.title || item?.foodName || "Aliment";
};

const itemQuantity = (item) => {
  if (!item || typeof item === "string") return "";
  return item.qty ?? item.quantity ?? item.amount ?? item.grams ?? "";
};

const mealKey = (meal = {}, index = 0) =>
  String(meal.mealKey || meal.key || meal.id || meal.label || `repas_${index + 1}`)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const menuDayIndexForDate = (dateKey, dayCount) => {
  if (!dayCount) return 0;
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 0;
  const mondayBasedIndex = (date.getDay() + 6) % 7;
  return mondayBasedIndex % dayCount;
};

const totalsFrom = (dayTotals = {}, fallbackTotals = {}) => ({
  kcal: finiteNumber(dayTotals.kcal || fallbackTotals.kcal),
  p: finiteNumber(dayTotals.p || dayTotals.prot || dayTotals.proteinG || fallbackTotals.p),
  f: finiteNumber(dayTotals.f || dayTotals.lip || dayTotals.fatG || fallbackTotals.f),
  c: finiteNumber(dayTotals.c || dayTotals.glu || dayTotals.carbs || dayTotals.carbsG || fallbackTotals.c),
});

export function buildNutritionLogEntries(menuDay = {}, fallbackTotals = {}) {
  const rows = (menuDay.meals || []).flatMap((meal, mealIndex) =>
    (meal.items || []).map((item, itemIndex) => {
      const rawQuantity = itemQuantity(item);
      const plannedQuantity = parseNutritionQuantity(rawQuantity);
      const nutritionKnown = item && typeof item === "object" && ["kcal", "calories", "p", "prot", "proteinG", "f", "lip", "fatG", "c", "glu", "carbs", "carbsG"].some((key) => item[key] !== undefined && item[key] !== null);
      return {
        id: `planned_${mealKey(meal, mealIndex)}_${itemIndex}`,
        source: "plan",
        mealKey: mealKey(meal, mealIndex),
        mealLabel: meal.label || meal.name || `Repas ${mealIndex + 1}`,
        name: itemName(item),
        plannedQuantity,
        actualQuantity: plannedQuantity,
        unit: item?.unit || parseNutritionUnit(rawQuantity, "g"),
        eaten: false,
        nutritionKnown,
        plannedKcal: finiteNumber(item?.kcal || item?.calories),
        plannedP: finiteNumber(item?.p || item?.prot || item?.proteinG),
        plannedF: finiteNumber(item?.f || item?.lip || item?.fatG),
        plannedC: finiteNumber(item?.c || item?.glu || item?.carbs || item?.carbsG),
      };
    })
  );

  if (!rows.length) return [];
  const dayTotals = totalsFrom(menuDay.totals, fallbackTotals);
  const quantitySum = rows.reduce((sum, row) => sum + (row.plannedQuantity || 1), 0) || rows.length;
  const allocated = rows.map((row) => {
    const share = (row.plannedQuantity || 1) / quantitySum;
    return {
      ...row,
      plannedKcal: row.nutritionKnown ? row.plannedKcal : dayTotals.kcal * share,
      plannedP: row.nutritionKnown ? row.plannedP : dayTotals.p * share,
      plannedF: row.nutritionKnown ? row.plannedF : dayTotals.f * share,
      plannedC: row.nutritionKnown ? row.plannedC : dayTotals.c * share,
    };
  });
  return allocated;
}

export function calculateNutritionLogTotals(entries = []) {
  const totals = entries.reduce(
    (sum, entry) => {
      if (!entry?.eaten) return sum;
      const isExtra = entry.source === "extra";
      const plannedQuantity = finiteNumber(entry.plannedQuantity);
      const actualQuantity = finiteNumber(entry.actualQuantity);
      const hasPer100 = isExtra && entry.nutritionPer100;
      const ratio = hasPer100 ? actualQuantity / 100 : isExtra || plannedQuantity <= 0 ? 1 : actualQuantity / plannedQuantity;
      sum.kcal += finiteNumber(hasPer100 ? entry.nutritionPer100.kcal : isExtra ? entry.kcal : entry.plannedKcal) * ratio;
      sum.p += finiteNumber(hasPer100 ? entry.nutritionPer100.p : isExtra ? entry.p : entry.plannedP) * ratio;
      sum.f += finiteNumber(hasPer100 ? entry.nutritionPer100.f : isExtra ? entry.f : entry.plannedF) * ratio;
      sum.c += finiteNumber(hasPer100 ? entry.nutritionPer100.c : isExtra ? entry.c : entry.plannedC) * ratio;
      if (isExtra) sum.extras += 1;
      else sum.eaten += 1;
      return sum;
    },
    { kcal: 0, p: 0, f: 0, c: 0, eaten: 0, extras: 0 }
  );
  const planned = entries.filter((entry) => entry?.source !== "extra").length;
  return {
    ...totals,
    planned,
    adherence: planned ? Math.round((totals.eaten / planned) * 100) : 0,
  };
}

export const roundNutritionTotals = (totals = {}) => ({
  kcal: Math.round(finiteNumber(totals.kcal)),
  p: Math.round(finiteNumber(totals.p) * 10) / 10,
  f: Math.round(finiteNumber(totals.f) * 10) / 10,
  c: Math.round(finiteNumber(totals.c) * 10) / 10,
  eaten: finiteNumber(totals.eaten),
  extras: finiteNumber(totals.extras),
  planned: finiteNumber(totals.planned),
  adherence: finiteNumber(totals.adherence),
});
