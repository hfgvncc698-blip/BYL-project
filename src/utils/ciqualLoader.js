// src/utils/ciqualLoader.js
let _cache = null;

const normalize = (s = "") =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

export async function loadCiqual() {
  if (_cache) return _cache;
  const res = await fetch("/ciqual_2025_min.json", { cache: "force-cache" });
  if (!res.ok) throw new Error("Impossible de charger ciqual_2025_min.json");
  const data = await res.json();
  _cache = Array.isArray(data) ? data : [];
  return _cache;
}

export function searchCiqual(list, q, limit = 20) {
  const nq = normalize(q);
  if (!nq) return list.slice(0, limit);

  // recherche simple “contains”
  const hits = [];
  for (const item of list) {
    if (normalize(item.name).includes(nq)) hits.push(item);
    if (hits.length >= limit) break;
  }
  return hits;
}

