import { LOCAL_MACROS_PER100_BY_LABEL as MACROS_PER_100_BY_LABEL } from "./foodSurveyCatalog.js";

const DEFAULT_QUANTITY_BY_LABEL = {
  "Lait 1/2 écrémé": { qty: 125, unit: "ml" }, "Lait végétal": { qty: 150, unit: "ml" },
  Fromage: { qty: 30, unit: "g" }, "Yaourt nature": { qty: 125, unit: "g" },
  "Viande moyenne": { qty: 100, unit: "g" }, "Viande maigre": { qty: 100, unit: "g" },
  "Poissons gras": { qty: 120, unit: "g" }, "Poissons blanc": { qty: 120, unit: "g" }, Oeufs: { qty: 2, unit: "unité" },
  "Féculents crus": { qty: 60, unit: "g" }, "Féculents cuits": { qty: 180, unit: "g" }, Légumineuse: { qty: 110, unit: "g" },
  "Pain blanc": { qty: 60, unit: "g" }, "Pain complet": { qty: 60, unit: "g" },
  Légumes: { qty: 200, unit: "g" }, Fruits: { qty: 150, unit: "g" },
  Beurre: { qty: 10, unit: "g" }, Huile: { qty: 10, unit: "g" }, Margarine: { qty: 10, unit: "g" }, "Crème fraîche": { qty: 15, unit: "g" },
  Sucre: { qty: 10, unit: "g" }, Biscuits: { qty: 30, unit: "g" }, Gâteaux: { qty: 50, unit: "g" }, Confiture: { qty: 20, unit: "g" }, Miel: { qty: 15, unit: "g" },
  "Chocolat noir": { qty: 20, unit: "g" }, "Chocolat au lait": { qty: 20, unit: "g" },
  Isolate: { qty: 30, unit: "g" }, Hydrolisate: { qty: 30, unit: "g" }, "100% whey": { qty: 30, unit: "g" }, "Whey vegan": { qty: 30, unit: "g" },
  Soda: { qty: 250, unit: "ml" }, "Jus de fruits": { qty: 250, unit: "ml" }, Alcool: { qty: 150, unit: "ml" },
};

export const manualRationMacrosPer100 = (label) => MACROS_PER_100_BY_LABEL[String(label || "").trim()] || null;
export const manualRationDefaultQuantity = (label) => DEFAULT_QUANTITY_BY_LABEL[String(label || "").trim()] || null;

export const manualRationNutritionPer100 = (label) => {
  const macros = manualRationMacrosPer100(label);
  if (!macros) return null;
  const p = Number(macros.prot) || 0;
  const f = Number(macros.lip) || 0;
  const c = Number(macros.glu) || 0;
  return { kcal: p * 4 + f * 9 + c * 4, p, f, c };
};
