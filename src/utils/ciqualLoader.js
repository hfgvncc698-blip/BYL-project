import { registerCiqualTranslations, ciqualFoodAliases } from "./nutritionFoodI18n.js";
// src/utils/ciqualLoader.js
let _cache = null;

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[œŒ]/g, "oe")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const getFoodName = (item) => String(item?.name ?? item?.alim_nom_fr ?? "").trim();

const canonicalToken = (token) => {
  const aliases = {
    eggs: "egg", oeufs: "oeuf", apples: "apple", raw: "cru", cooked: "cuit",
    pates: "pate",
    crue: "cru",
    crues: "cru",
    crus: "cru",
    cuite: "cuit",
    cuites: "cuit",
    cuits: "cuit",
  };
  const canonical = aliases[token] || token;
  return /^ال[\u0621-\u064a]{2,}$/.test(canonical) ? canonical.slice(2) : canonical;
};

const canonicalTokens = (value) => normalize(value).split(" ").filter(Boolean).map(canonicalToken);

const containsAllTokens = (candidateTokens, queryTokens) =>
  queryTokens.every((token) => candidateTokens.includes(token));

const tokenSequenceIndex = (candidateTokens, queryTokens) =>
  candidateTokens.findIndex((_, index) =>
    candidateTokens.slice(index, index + queryTokens.length).join(" ") === queryTokens.join(" ")
  );

const queryFoodIntent = (query) => {
  const raw = String(query || "").toLowerCase();
  const asksForPate = /\bpâte(?:s)?\b/u.test(raw);
  const asksForCharcuterie = /\bpâté(?:s)?\b/u.test(raw);
  const hasDoughQualifier = /\b(pizza|brisée|feuilletée|sablée|phyllo|filo|tartiner|amande|fruits?)\b/u.test(raw);
  return {
    asksForPate,
    asksForCharcuterie,
    prefersPasta: asksForPate && !asksForCharcuterie && !hasDoughQualifier,
  };
};

function relevanceScore(item, query, intent, alias) {
  const rawName = alias || getFoodName(item);
  const sourceCandidate = normalize(getFoodName(item));
  const candidate = normalize(rawName);
  if (!candidate) return null;

  const rawNameLower = rawName.toLowerCase();
  if (intent.asksForPate && !intent.asksForCharcuterie && /\bpâté(?:s)?\b/u.test(rawNameLower)) return null;
  if (intent.asksForCharcuterie && /\bpâte(?:s)?\b/u.test(rawNameLower)) return null;

  const queryTokens = canonicalTokens(query);
  const candidateTokens = canonicalTokens(candidate);
  if (!containsAllTokens(candidateTokens, queryTokens)) return null;

  const phraseIndex = tokenSequenceIndex(candidateTokens, queryTokens);
  const mainTokens = canonicalTokens(rawName.split(/[,;،(]/, 1)[0]);
  const mainName = mainTokens.join(" ");
  const canonicalQuery = queryTokens.join(" ");
  const canonicalCandidate = candidateTokens.join(" ");
  const identityTokens = queryTokens.filter((token) => token !== "cru" && token !== "cuit");
  const identityQuery = identityTokens.join(" ");
  const tokenPositions = queryTokens.map((token) => candidateTokens.indexOf(token));
  const tokenSpan = Math.max(...tokenPositions) - Math.min(...tokenPositions);

  let score = 0;
  if (canonicalCandidate === canonicalQuery) score += 20_000;
  if (mainName === canonicalQuery) score += 10_000;
  if (canonicalCandidate.startsWith(`${canonicalQuery} `)) score += 4_000;
  if (identityQuery && canonicalCandidate.startsWith(`${identityQuery} `)) score += 2_200;
  if (phraseIndex >= 0) score += Math.max(0, 2_000 - phraseIndex * 160);
  else score += Math.max(0, 1_200 - tokenSpan * 90);
  score -= Math.max(0, candidateTokens.length - queryTokens.length) * 24;

  if (intent.prefersPasta) {
    if (/^pâtes\b/u.test(rawNameLower)) score += 2_500;
    else if (/^pâte\b/u.test(rawNameLower)) score -= 500;
  }

  // À pertinence lexicale comparable, les aliments simples passent avant
  // leurs versions séchées, concentrées ou déjà intégrées à une préparation.
  if (/\b(cru|crue|crus|crues)\b/.test(sourceCandidate)) score += 1_000;
  if (/\bnature\b/.test(sourceCandidate)) score += 350;
  if (/\b(seche|sechee|seches|deshydrate|deshydratee|concentre|concentree)\b/.test(sourceCandidate)) score -= 1_100;
  if (/\b(puree|compote|soupe|salade|tarte|jus|nectar)\b/.test(sourceCandidate)) score -= 650;
  if (/\b(preemballe|preemballee|appertise|appertisee)\b/.test(sourceCandidate)) score -= 400;

  // Pour un terme court comme « pomme », un nom composé (« pomme de terre »)
  // est moins pertinent qu'un aliment dont « pomme » est le nom principal.
  if (
    queryTokens.length === 1 &&
    mainName !== query &&
    (candidate.startsWith(`${query} de `) || candidate.startsWith(`${query} d `))
  ) {
    score -= 1_800;
  }

  return score;
}

let loading;
export async function loadCiqual() {
  if (_cache) return _cache;
  if (loading) return loading;
  loading = (async () => {
    const read = async path => {
      const res = await fetch(path, { cache: "force-cache" });
      if (!res.ok) throw new Error(`Impossible de charger ${path}`);
      return res.json();
    };
    const [rows, results] = await Promise.all([
      read("/ciqual_2025.json"),
      Promise.allSettled(["en", "es", "de", "it", "ar", "ru"].map(lang => read(`/ciqual-locales/${lang}.json`))),
    ]);
    const catalogs = results.filter(result => result.status === "fulfilled").map(result => result.value);
    registerCiqualTranslations(rows, Object.fromEntries(catalogs.map(catalog => [catalog.language, catalog])));
    // Keep the original foods available during a translation download failure;
    // a later call retries the missing catalogs instead of caching an incomplete load.
    if (catalogs.length === results.length) _cache = rows;
    return rows;
  })().finally(() => { loading = null; });
  return loading;
}

export function searchCiqual(list, q, limit = 20) {
  const nq = normalize(q);
  if (!nq) return list.slice(0, limit);
  const intent = queryFoodIntent(q);

  return (list || [])
    .map((item, index) => {
      const scores = ciqualFoodAliases(item).map(name => relevanceScore(item, nq, intent, name)).filter(score => score != null);
      return { item, index, score: scores.length ? Math.max(...scores) : null };
    })
    .filter((entry) => entry.score != null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}
