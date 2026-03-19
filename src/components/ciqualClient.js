// src/nutrition/ciqualClient.js

let _cache = null;

const normalize = (s = "") =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const pickNumber = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function firstKey(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) return k;
  }
  return null;
}

const getNutrientsObj = (food) => food?.nutrients && typeof food.nutrients === "object" ? food.nutrients : food;

/**
 * ✅ Charge ciqual_2025.json (format actuel: [{code, name, nutrients:{...}}])
 * + index par code + index par nom normalisé
 */
export async function loadCiqualOnce() {
  if (_cache) return _cache;

  const res = await fetch("/ciqual_2025.json", { cache: "force-cache" });
  if (!res.ok) throw new Error("Impossible de charger /ciqual_2025.json");

  const data = await res.json();
  const arr =
    (Array.isArray(data) && data) ||
    (Array.isArray(data?.data) && data.data) ||
    (Array.isArray(data?.entries) && data.entries) ||
    [];

  const byNormName = new Map();
  const byCode = new Map();

  for (const f of arr) {
    const code = f?.code != null ? String(f.code) : f?.alim_code != null ? String(f.alim_code) : "";
    if (code) byCode.set(code, f);

    const nameRaw = f?.name ?? f?.alim_nom_fr ?? "";
    const name = nameRaw ? normalize(nameRaw) : "";
    if (name) {
      if (!byNormName.has(name)) byNormName.set(name, []);
      byNormName.get(name).push(f);
    }
  }

  // ✅ logs de diagnostic (tu les verras dans la console)
  try {
    console.log("[CIQUAL] Chargé :", arr.length, "lignes");
    const ex = arr[0];
    console.log("[CIQUAL] Exemple keys (1ère ligne) :", ex ? Object.keys(ex) : []);
    const n = ex ? getNutrientsObj(ex) : null;
    console.log("[CIQUAL] Exemple nutrients keys (1ère ligne) :", n ? Object.keys(n).slice(0, 50) : []);
  } catch (e) {
    // no-op
  }

  _cache = { data: arr, byNormName, byCode };
  return _cache;
}

/**
 * Score simple:
 * - bonus si inclusions
 * - bonus par tokens communs
 */
function scoreMatch(queryNorm, candNorm) {
  if (!queryNorm || !candNorm) return 0;
  if (queryNorm === candNorm) return 9999;

  let score = 0;

  if (candNorm.includes(queryNorm)) score += 1200;
  if (queryNorm.includes(candNorm)) score += 800;

  const qTokens = queryNorm.split(" ").filter(Boolean);
  const cTokens = candNorm.split(" ").filter(Boolean);
  const cSet = new Set(cTokens);

  let common = 0;
  for (const t of qTokens) if (cSet.has(t)) common += 1;
  score += common * 120;

  score -= Math.max(0, cTokens.length - qTokens.length) * 5;

  return score;
}

export async function findBestCiqualFood(query) {
  const idx = await loadCiqualOnce();
  const q = normalize(query);
  if (!q) return null;

  if (idx.byNormName.has(q)) return idx.byNormName.get(q)[0];

  let best = null;
  let bestScore = -Infinity;

  for (const f of idx.data) {
    const nameRaw = f?.name ?? f?.alim_nom_fr ?? "";
    const name = nameRaw ? normalize(nameRaw) : "";
    if (!name) continue;
    const s = scoreMatch(q, name);
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }

  if (bestScore < 200) return null;
  return best;
}

/**
 * ✅ Macros/énergie par 100g (lecture dans nutrients)
 */
export function getCiqualPer100Macros(food) {
  if (!food) return { kcal: 0, p: 0, c: 0, f: 0 };
  const n = getNutrientsObj(food);

  const kcalKey = firstKey(n, [
    "energie_reglement_ue_n_1169_2011_kcal_100g",
    "energie_kcal_100g",
    "energie_kcal_100ml",
    "energie_kcal",
  ]);

  const pKey = firstKey(n, [
    "proteines_n_x_facteur_de_jones_g_100g",
    "proteines_g_100g",
    "proteines_g",
  ]);

  const cKey = firstKey(n, ["glucides_g_100g", "glucides_g"]);
  const fKey = firstKey(n, ["lipides_g_100g", "lipides_g"]);

  return {
    kcal: kcalKey ? pickNumber(n[kcalKey]) : 0,
    p: pKey ? pickNumber(n[pKey]) : 0,
    c: cKey ? pickNumber(n[cKey]) : 0,
    f: fKey ? pickNumber(n[fKey]) : 0,
  };
}

/**
 * ✅ Micros par 100g (lecture dans nutrients)
 * -> On renvoie les clés attendues par RationSpontaneeExcel
 */
export function getCiqualMicro100(food) {
  if (!food) return {};

  const n = getNutrientsObj(food);

  const get = (keys) => {
    const k = firstKey(n, keys);
    return k ? pickNumber(n[k]) : 0;
  };

  return {
    calcium_mg_100g: get(["calcium_mg_100g"]),
    fer_mg_100g: get(["fer_mg_100g"]),
    sodium_mg_100g: get(["sodium_mg_100g"]), // ⚠️ on évite "sel_chlorure_de_sodium_g_100g" car pas équivalent
    fibres_g_100g: get(["fibres_alimentaires_g_100g", "fibres_g_100g"]),
    magnesium_mg_100g: get(["magnesium_mg_100g"]),
    potassium_mg_100g: get(["potassium_mg_100g"]),
    lactose_g_100g: get(["lactose_g_100g"]),
    cholesterol_mg_100g: get(["cholesterol_mg_100g"]),

    vit_a_ug_100g: get([
      "vitamine_a_ug_100g",
      "activite_vitaminique_a_equivalents_retinol_ug_100g",
      "retinol_ug_100g",
    ]),
    vit_b1_mg_100g: get(["vitamine_b1_ou_thiamine_mg_100g", "vitamine_b1_mg_100g"]),
    vit_b2_mg_100g: get(["vitamine_b2_ou_riboflavine_mg_100g", "vitamine_b2_mg_100g"]),
    vit_b6_mg_100g: get(["vitamine_b6_mg_100g"]),
    vit_b9_ug_100g: get([
      "vitamine_b9_ou_folates_totaux_ug_100g",
      "folates_totaux_ug_100g",
      "vitamine_b9_ug_100g",
    ]),
    vit_b12_ug_100g: get(["vitamine_b12_ug_100g"]),
    vit_c_mg_100g: get(["vitamine_c_mg_100g"]),
    vit_d_ug_100g: get(["vitamine_d_ug_100g"]),
    vit_e_mg_100g: get(["vitamine_e_mg_100g", "alpha_tocopherol_mg_100g"]),
    vit_k_ug_100g: get(["vitamine_k1_ug_100g", "vitamine_k_ug_100g"]),
  };
}

