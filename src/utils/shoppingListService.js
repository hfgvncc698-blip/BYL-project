import { rationMenuNum } from "./rationMenu";

const normalize = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const SECTION_ORDER = [
  "fruits_legumes",
  "viandes_poissons_oeufs",
  "produits_frais",
  "epicerie",
  "surgeles",
  "boissons",
  "autres",
];

export const SHOPPING_SECTION_LABELS = {
  fruits_legumes: "Fruits et légumes",
  viandes_poissons_oeufs: "Viandes / poissons / oeufs",
  produits_frais: "Produits frais",
  epicerie: "Épicerie",
  surgeles: "Surgelés",
  boissons: "Boissons",
  autres: "Autres",
};

const sectionForFood = (item = {}) => {
  const nameText = normalize([item.name, item.foodName, item.label].filter(Boolean).join(" "));
  const metaText = normalize([item.category, item.group].filter(Boolean).join(" "));
  const text = `${nameText} ${metaText}`.trim();
  if (/(legume|fruit|salade|courgette|tomate|carotte|pomme|banane|orange|poire|kiwi|papaye|passion|maracu|brocoli|haricot vert|poivron|concombre|compote|puree de fruit|pomme de terre|aubergine|chou|endive|champignon|betterave|epinard|asperge|poireau|navet|radis|potiron|courge|fenouil|blette)/.test(nameText)) return "fruits_legumes";
  if (/(viande|poisson|oeuf|poulet|dinde|boeuf|bœuf|saumon|thon|cabillaud|colin|merlu|lieu|jambon|beignet de viande|veau|porc|agneau|lapin|crevette|moule|sardine|truite|maquereau|volaille|canard|dourade|dorade)/.test(nameText)) return "viandes_poissons_oeufs";
  if (/(lait|yaourt|yogourt|fromage|skyr|beurre|creme|frais|brebis|chevre|demi ecreme|emmental|mozzarella|faisselle|petit suisse|petit-suisse|ricotta|mascarpone|cottage|kefir)/.test(nameText)) return "produits_frais";
  if (/(surgel)/.test(text)) return "surgeles";
  if (/(riz|pate|pain|quinoa|huile|olive|colza|farine|cereale|petit-dejeuner|petit dejeuner|semoule|boulgour|vermicelle|couscous|mil|orge|tamarin|epicerie|flocon|muesli|petale|biscuit|sucre|miel|confiture|chocolat|cacao|amande|noix|noisette|oleagineux|lentille|pois chiche|haricot sec|avoine|sarrasin|polenta|chapelure)/.test(nameText)) return "epicerie";
  if (/^(eau|boisson|jus|soda|the|cafe)\b|\b(eau minerale|eau gazeuse|boisson|jus de|the |cafe )/.test(nameText)) return "boissons";
  if (/fruit|legume/.test(metaText)) return "fruits_legumes";
  if (/viande|poisson|oeuf/.test(metaText)) return "viandes_poissons_oeufs";
  if (/lait|fromage|frais/.test(metaText)) return "produits_frais";
  if (/epicerie|cereale/.test(metaText)) return "epicerie";
  if (/boisson/.test(metaText)) return "boissons";
  return "autres";
};

const parseQuantityText = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return { quantity: 0, unit: "g" };
  const match = text.match(/([\d]+(?:[,.]\d+)?)\s*([a-zA-ZÀ-ÿµ]+)?/);
  if (!match) return { quantity: 0, unit: "g" };
  return {
    quantity: rationMenuNum(match[1]),
    unit: match[2] || "g",
  };
};

const collectItems = (plan = {}) => {
  const meals = Array.isArray(plan?.meals) ? plan.meals : [];
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const fromMeals = meals.flatMap((meal) => meal.items || meal.ingredients || []);
  const fromDays = days.flatMap((day) =>
    (day.meals || []).flatMap((meal) => meal.items || meal.ingredients || [])
  );
  const fromRation = Array.isArray(plan?.rationLines)
    ? plan.rationLines.map((line) => ({
        name: line.resolvedLabel || line.label || line.key,
        quantity: Object.values(line.meals || {}).reduce((sum, value) => sum + rationMenuNum(value), 0),
        unit: line.unit || "g",
        group: line.group,
      }))
    : [];
  return [...fromMeals, ...fromDays, ...fromRation];
};

export function generateShoppingListFromNutritionPlan(plan = {}) {
  const grouped = new Map();

  collectItems(plan).forEach((item) => {
    const name = String(item.name || item.foodName || item.label || item.ciqualName || "").trim();
    if (!name) return;
    const parsed = parseQuantityText(item.qty || item.quantityText || "");
    const unit = String(item.unit || parsed.unit || (item.grams ? "g" : "") || "g").trim();
    const quantity = rationMenuNum(item.quantity ?? item.grams ?? item.amount) || parsed.quantity;
    const section = sectionForFood(item);
    const key = `${section}::${normalize(name)}::${unit}`;
    const current = grouped.get(key) || { section, name, unit, quantity: 0 };
    current.quantity += quantity;
    grouped.set(key, current);
  });

  const list = Object.fromEntries(SECTION_ORDER.map((section) => [section, []]));
  Array.from(grouped.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((item) => {
      list[item.section].push({
        name: item.name,
        quantity: Math.round(item.quantity * 10) / 10,
        unit: item.unit,
      });
    });

  return SECTION_ORDER.map((section) => ({
    section,
    label: SHOPPING_SECTION_LABELS[section],
    items: list[section],
  }));
}
