const normalizeRecipeImageText = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const COURSE_TAGS = ["petit_dejeuner", "collation", "entree", "plat", "dessert"];

// Add generated or curated meal photos here as the bank grows.
// Store files in /public/nutrition/meal-images and set ready: true.
export const RECIPE_IMAGE_BANK = [
  {
    id: "breakfast_muesli_fruit",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/breakfast-muesli-fruit.png",
    title: "Bol de muesli, lait et fruit",
    tags: ["petit_dejeuner","muesli","fruit","lait"],
  },
  {
    id: "breakfast_oats_fruit",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/breakfast-oats-fruit.png",
    title: "Bol de flocons d'avoine, lait et fruit",
    tags: ["petit_dejeuner","avoine","fruit","lait"],
  },
  {
    id: "snack_cereal_bar_fruit",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/snack-cereal-bar-fruit.png",
    title: "Collation barre céréalière et fruit",
    tags: ["collation","barre_cerealiere","fruit"],
  },
  {
    id: "snack_crispbread_dairy_fruit",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/snack-crispbread-dairy-fruit.png",
    title: "Collation pain grillé, laitage et fruit",
    tags: ["collation","snack_sec","laitage","fruit"],
  },
  {
    id: "main_poultry_starch_veg",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/main-poultry-starch-veg.png",
    title: "Assiette volaille, féculent et légumes",
    tags: ["plat","volaille","feculent","legume"],
  },
  {
    id: "main_fish_starch_veg",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/main-fish-starch-veg.png",
    title: "Assiette poisson, féculent et légumes",
    tags: ["plat","poisson","feculent","legume"],
  },
  {
    id: "main_egg_starch_veg",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/main-egg-starch-veg.png",
    title: "Assiette oeufs, féculent et légumes",
    tags: ["plat","oeuf","feculent","legume"],
  },
  {
    id: "starter_green_veg",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/starter-green-veg.png",
    title: "Entrée de légumes verts",
    tags: ["entree","legume"],
  },
  {
    id: "dessert_dairy_fruit",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/dessert-dairy-fruit.png",
    title: "Dessert laitage et fruit",
    tags: ["dessert","laitage","fruit"],
  },
  {
    id: "dessert_goat_cheese_fruit_puree",
    ready: true,
    source: "generated",
    src: "/nutrition/meal-images/dessert-goat-cheese-fruit-puree.png",
    title: "Dessert fromage de chèvre et purée de fruits",
    tags: ["dessert","fromage_chevre","puree_fruit"],
  },
];

export const recipeImageTags = (recipe = {}) => {
  const text = normalizeRecipeImageText(
    [
      recipe.course,
      recipe.name,
      recipe.mealLabel,
      ...(Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((item) => (typeof item === "string" ? item : item.name || item.label || ""))
        : []),
    ].join(" ")
  );

  const tags = new Set();
  if (recipe.course) tags.add(recipe.course);
  if (text.includes("petit-dejeuner") || text.includes("petit dejeuner")) tags.add("petit_dejeuner");
  if (text.includes("collation") || text.includes("gouter")) tags.add("collation");
  if (text.includes("entree")) tags.add("entree");
  if (text.includes("dessert")) tags.add("dessert");
  if (/(dinde|poulet|volaille)/.test(text)) tags.add("volaille");
  if (/(poisson|merlu|cabillaud|colin|saumon|thon)/.test(text)) tags.add("poisson");
  if (/(oeuf|œuf|omelette)/.test(text)) tags.add("oeuf");
  if (/(riz|pate|pâtes|pain|semoule|quinoa|boulgour|pomme de terre|feculent|féculent)/.test(text)) tags.add("feculent");
  if (/(brocoli|chou|carotte|poivron|endive|legume|légume|epinard|épinard)/.test(text)) tags.add("legume");
  if (/(pomme|poire|banane|kiwi|orange|fruit|tamarin)/.test(text)) tags.add("fruit");
  if (/(lait|yaourt|fromage|laitage)/.test(text)) tags.add("laitage");
  if (/(fromage de chevre|fromage de chèvre|chevre|chèvre)/.test(text)) tags.add("fromage_chevre");
  if (/(puree de fruits|purée de fruits|compote|assimile|assimilé)/.test(text)) tags.add("puree_fruit");
  if (/(muesli|avoine|cereale|céréale|petale|pétale)/.test(text)) tags.add("muesli");
  if (/(avoine|flocon)/.test(text)) tags.add("avoine");
  if (/(barre cerealiere|barre céréalière)/.test(text)) tags.add("barre_cerealiere");
  if (/(biscotte|pain grille|pain grillé|petit pain grille|petit pain grillé|galette de riz|galette de mais|galette de maïs)/.test(text)) tags.add("snack_sec");
  return [...tags];
};

const courseConflict = (recipeTags = [], entryTags = []) => {
  const recipeCourse = COURSE_TAGS.find((tag) => recipeTags.includes(tag));
  const entryCourse = COURSE_TAGS.find((tag) => entryTags.includes(tag));
  return Boolean(recipeCourse && entryCourse && recipeCourse !== entryCourse);
};

const SPECIFIC_TAGS = [
  "barre_cerealiere",
  "fromage_chevre",
  "oeuf",
  "poisson",
  "puree_fruit",
  "snack_sec",
  "volaille",
];

export const scoreRecipeBankImage = (recipe = {}, entry = {}) => {
  if (!entry.ready || !entry.src) return 0;
  const recipeTags = recipeImageTags(recipe);
  const entryTags = entry.tags || [];
  if (!entryTags.length || courseConflict(recipeTags, entryTags)) return 0;

  let score = 0;
  for (const tag of entryTags) {
    if (!recipeTags.includes(tag)) continue;
    if (COURSE_TAGS.includes(tag)) score += 4;
    else if (SPECIFIC_TAGS.includes(tag)) score += 3;
    else score += 2;
  }
  const specificityBonus = Math.min(3, Math.max(0, entryTags.length - 2));
  return score + specificityBonus;
};

export const resolveRecipeBankImage = (recipe = {}) => {
  let best = null;
  for (const entry of RECIPE_IMAGE_BANK) {
    const score = scoreRecipeBankImage(recipe, entry);
    if (score >= 4 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry?.src || "";
};
