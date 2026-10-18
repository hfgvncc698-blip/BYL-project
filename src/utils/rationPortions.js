const normalize = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const round1 = (value) => Math.round(Number(value) * 10) / 10;

export const quickOptionsForFood = (food, unit) => {
  const name = normalize(food?.name || "");
  const category = normalize(food?.category || "");

  if (unit === "ml") return [100, 200];
  if (unit === "unité") return [1, 2];
  if (unit === "portion") return [0.5, 1];

  if (
    name.includes("huile") ||
    name.includes("beurre") ||
    name.includes("margarine") ||
    name.includes("sucre") ||
    name.includes("confiture") ||
    name.includes("miel")
  ) {
    return [5, 10];
  }

  if (name.includes("fromage")) return [15, 30];
  if (category.includes("legumes")) return [100, 200];
  if (category.includes("fruits")) return [100, 150];
  if (category.includes("vpo")) return [50, 100];
  if (category.includes("feculents")) return [30, 100];
  if (category.includes("produits laitiers")) return [100, 125];
  if (category.includes("produits sucres")) return [15, 30];

  return [30, 100];
};

export const quickOptionLabel = (value, unit) => {
  if (unit === "portion") return `+${round1(value)} portion`;
  if (unit === "unité") return `+${round1(value)}`;
  return `+${round1(value)} ${unit}`;
};

