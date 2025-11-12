// Retourne la valeur localisée...
export const tr = (obj, lng, fallback = "fr") => {
  if (!obj) return "";
  const code = (lng || "fr").split("-")[0];
  if (typeof obj === "string") return obj;
  return obj[code] ?? obj[fallback] ?? Object.values(obj)[0] ?? "";
};
