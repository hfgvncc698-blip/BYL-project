const MACROS_PER_100_BY_LABEL = {
  "Lait 1/2 écrémé": { prot: 3.3, glu: 4.9, lip: 1.6 },
  "Lait végétal": { prot: 1, glu: 3, lip: 2 },
  Fromage: { prot: 24, glu: 1, lip: 28 },
  "Yaourt nature": { prot: 4, glu: 5, lip: 3 },
  "Viande moyenne": { prot: 20, glu: 0, lip: 12 },
  "Viande maigre": { prot: 22, glu: 0, lip: 5 },
  "Poissons gras": { prot: 20, glu: 0, lip: 13 },
  "Poissons blanc": { prot: 20, glu: 0, lip: 2 },
  Oeufs: { prot: 13, glu: 1, lip: 10 },
  "Féculents crus": { prot: 7, glu: 75, lip: 1 },
  "Féculents cuits": { prot: 2.5, glu: 28, lip: 0.3 },
  Légumineuse: { prot: 9, glu: 18, lip: 1.5 },
  "Pain blanc": { prot: 8.5, glu: 55, lip: 1.5 },
  "Pain complet": { prot: 9, glu: 45, lip: 2.5 },
  Légumes: { prot: 2, glu: 5, lip: 0.2 },
  Fruits: { prot: 0.5, glu: 12, lip: 0.2 },
  Beurre: { prot: 0.5, glu: 0.5, lip: 81 },
  Huile: { prot: 0, glu: 0, lip: 100 },
  Margarine: { prot: 0, glu: 0, lip: 80 },
  "Crème fraîche": { prot: 2, glu: 3, lip: 30 },
  Sucre: { prot: 0, glu: 100, lip: 0 },
  Biscuits: { prot: 6, glu: 65, lip: 20 },
  Gâteaux: { prot: 6, glu: 55, lip: 18 },
  Confiture: { prot: 0.3, glu: 60, lip: 0.1 },
  Miel: { prot: 0.3, glu: 82, lip: 0 },
  "Chocolat noir": { prot: 7, glu: 30, lip: 42 },
  "Chocolat au lait": { prot: 7, glu: 55, lip: 30 },
  Isolate: { prot: 85, glu: 3, lip: 3 },
  Hydrolisate: { prot: 85, glu: 3, lip: 3 },
  "100% whey": { prot: 75, glu: 8, lip: 6 },
  "Whey vegan": { prot: 75, glu: 8, lip: 6 },
  Soda: { prot: 0, glu: 10.6, lip: 0 },
  "Jus de fruits": { prot: 0.5, glu: 10, lip: 0 },
  Alcool: { prot: 0, glu: 0, lip: 0 },
};

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
