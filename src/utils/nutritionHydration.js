// Reuse the assessment hydration marker in shared views and exports.
export function hydrationReference(weight) {
  const value = Number(String(weight?.value ?? "").replace(",", "."));
  const kg = weight?.unit === "lbs" ? value * 0.45359237 : value;
  if (!Number.isFinite(kg) || kg <= 0) return null;
  const liters = { min: Math.round(kg * 0.03 * 10) / 10, max: Math.round(kg * 0.04 * 10) / 10 };
  const gallons = { min: Math.round(liters.min * 0.264172 * 100) / 100, max: Math.round(liters.max * 0.264172 * 100) / 100 };
  return { liters, gallons };
}

export function hydrationReferenceText(weight, i18n) {
  const range = hydrationReference(weight);
  if (!range) return "";
  const value = i18n.t("auto.NutritionAssessmentEditor.water_range_per_day", "{{litersMin}}-{{litersMax}} L/jour ({{gallonsMin}}-{{gallonsMax}} gal/jour)", {
    litersMin: range.liters.min, litersMax: range.liters.max,
    gallonsMin: range.gallons.min, gallonsMax: range.gallons.max,
  });
  return i18n.t("auto.NutritionAssessmentEditor.hydration_reference_value", "Repère hydratation : {{value}}", { value });
}
