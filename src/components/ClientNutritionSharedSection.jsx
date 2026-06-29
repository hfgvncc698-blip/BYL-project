 
// src/components/ClientNutritionSharedSection.jsx
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  IconButton,
  SimpleGrid,
  Stack,
  Tag,
  TagLabel,
  Text,
  Tooltip,
  Wrap,
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import { collection, doc, getDoc, onSnapshot, orderBy, query } from "firebase/firestore";
import { useLocation } from "react-router-dom";
import { db } from "../firebaseConfig";
import {
  pdf,
  Document,
  Page,
  View,
  Text as PdfText,
  StyleSheet,
  Image as PdfImage,
} from "@react-pdf/renderer";
import {
  computeNutritionNeeds,
  normalizeDietList,
  normalizePathologyList,
} from "../utils/nutritionContext";
import {
  MENU_MEALS_ORDER,
  MENU_MEAL_LABEL,
  countRationMealsCovered,
  extractRationLines,
  rationMenuNum,
} from "../utils/rationMenu";
import { translateNutritionFoodName, translateNutritionObjective } from "../utils/nutritionFoodI18n";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "./ui/AppLoading";
import i18n from "../i18n/index";

const r0 = (value) => Math.round(rationMenuNum(value));
const LEGACY_BYL_LOCAL = "/logo-byl.png";

async function toDataUrlSafe(url) {
  if (!url) return null;
  if (String(url).startsWith("data:")) return url;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((ok, ko) => {
      const fr = new FileReader();
      fr.onloadend = () => ok(fr.result);
      fr.onerror = ko;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const firstNonEmpty = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const getPersonName = (...sources) => {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source === "string" && source.trim()) return source.trim();
    const full = [
      source.firstName || source.firstname || source.prenom,
      source.lastName || source.lastname || source.nom,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (full) return full;
    if (source.displayName && !/@/.test(source.displayName)) return String(source.displayName).trim();
    if (source.name && !/@/.test(source.name)) return String(source.name).trim();
  }
  return "";
};

const clientPdfStyles = StyleSheet.create({
  page: { paddingTop: 104, paddingLeft: 38, paddingRight: 38, paddingBottom: 58, fontSize: 10, color: "#0B1B3A", backgroundColor: "#F8FBFF" },
  header: {
    position: "absolute",
    top: 24,
    left: 38,
    right: 38,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", width: 170 },
  logo: { width: 26, height: 26, marginRight: 10 },
  coachName: { fontSize: 11, fontWeight: 700, color: "#111827" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerRight: { width: 170, alignItems: "flex-end" },
  clientName: { fontSize: 11, fontWeight: 700, textAlign: "right" },
  date: { fontSize: 10, opacity: 0.6 },
  title: { fontSize: 18, fontWeight: 700, textAlign: "center", color: "#111827" },
  subtitle: { fontSize: 11, opacity: 0.75, marginTop: 4, textAlign: "center" },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 },
  card: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 12, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginLeft: -4, marginRight: -4 },
  tile: { width: "48%", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 8, margin: 4 },
  label: { fontSize: 8, color: "#6B7280", textTransform: "uppercase", fontWeight: 700, marginBottom: 3 },
  value: { fontSize: 10, fontWeight: 700, color: "#111827" },
  line: { fontSize: 9, marginBottom: 3, lineHeight: 1.25 },
  muted: { color: "#64748B" },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingTop: 12,
    paddingBottom: 12,
  },
  footerLogo: { width: 16, height: 16, marginRight: 8 },
  footerText: { fontSize: 9, opacity: 0.65, textAlign: "center" },
});

const currentLanguage = () => String(i18n.language || i18n.resolvedLanguage || "fr").split("-")[0] || "fr";

const labelKey = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const displayKey = (value = "") =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[œŒ]/g, "oe")
    .replace(/[æÆ]/g, "ae")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[(),.]/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim();

const displayKeyAliases = (value = "") => {
  const key = displayKey(value);
  return Array.from(
    new Set(
      [
        key,
        key.replace(/\s*\/\s*/g, " "),
        key.replace(/-/g, " "),
        key.replace(/\s*\/\s*/g, " ").replace(/-/g, " "),
      ]
        .map((item) => item.replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  );
};

const CLIENT_NUTRITION_DISPLAY_TRANSLATIONS = {
  "bol petit-dejeuner cereales et fruit": {
    en: "Breakfast bowl with cereal and fruit",
    de: "Frühstücksbowl mit Cerealien und Obst",
    es: "Bol de desayuno con cereales y fruta",
    it: "Bowl colazione con cereali e frutta",
    ru: "Боул на завтрак с хлопьями и фруктами",
    ar: "وعاء إفطار بالحبوب والفواكه",
  },
  "bol petit dejeuner cereales et fruit": {
    en: "Breakfast bowl with cereal and fruit",
    de: "Frühstücksbowl mit Cerealien und Obst",
    es: "Bol de desayuno con cereales y fruta",
    it: "Bowl colazione con cereali e frutta",
    ru: "Боул на завтрак с хлопьями и фруктами",
    ar: "وعاء إفطار بالحبوب والفواكه",
  },
  "produits laitiers": {
    en: "Dairy products",
    de: "Milchprodukte",
    es: "Lácteos",
    it: "Latticini",
    ru: "Молочные продукты",
    ar: "منتجات الألبان",
  },
  "yaourt nature": {
    en: "Plain yogurt",
    de: "Naturjoghurt",
    es: "Yogur natural",
    it: "Yogurt bianco",
    ru: "Натуральный йогурт",
    ar: "زبادي طبيعي",
  },
  fromage: { en: "Cheese", de: "Käse", es: "Queso", it: "Formaggio", ru: "Сыр", ar: "جبن" },
  "fruits et legumes": {
    en: "Fruit and vegetables",
    de: "Obst und Gemüse",
    es: "Frutas y verduras",
    it: "Frutta e verdura",
    ru: "Фрукты и овощи",
    ar: "الفواكه والخضروات",
  },
  "eau minerale": {
    en: "Mineral water",
    de: "Mineralwasser",
    es: "Agua mineral",
    it: "Acqua minerale",
    ru: "Минеральная вода",
    ar: "مياه معدنية",
  },
  "eau gazeuse": {
    en: "Sparkling water",
    de: "Sprudelwasser",
    es: "Agua con gas",
    it: "Acqua frizzante",
    ru: "Газированная вода",
    ar: "مياه غازية",
  },
  eau: { en: "Water", de: "Wasser", es: "Agua", it: "Acqua", ru: "Вода", ar: "ماء" },
  "petales de cereales": {
    en: "Breakfast cereal flakes",
    de: "Getreideflocken",
    es: "Copos de cereales",
    it: "Fiocchi di cereali",
    ru: "Зерновые хлопья",
    ar: "رقائق الحبوب",
  },
  "cereales petit-dejeuner tres riches en fibres": {
    en: "Very high-fibre breakfast cereals",
    de: "Sehr ballaststoffreiche Frühstückscerealien",
    es: "Cereales de desayuno muy ricos en fibra",
    it: "Cereali da colazione molto ricchi di fibre",
    ru: "Хлопья для завтрака с очень высоким содержанием клетчатки",
    ar: "حبوب إفطار غنية جدا بالألياف",
  },
  "beurre sur la teneur en matiere grasse allege ou non": {
    en: "Butter, fat content specified, reduced-fat or not",
    de: "Butter mit angegebenem Fettgehalt, fettreduziert oder nicht",
    es: "Mantequilla, contenido graso indicado, reducida o no",
    it: "Burro con tenore di grassi indicato, light o meno",
    ru: "Масло с указанной жирностью, облегчённое или нет",
    ar: "زبدة مع نسبة دهون محددة، مخففة أو عادية",
  },
  "lait demi-ecreme pasteurise": {
    en: "Pasteurised semi-skimmed milk",
    de: "Pasteurisierte fettarme Milch",
    es: "Leche semidesnatada pasteurizada",
    it: "Latte parzialmente scremato pastorizzato",
    ru: "Пастеризованное полуобезжиренное молоко",
    ar: "حليب نصف دسم مبستر",
  },
  "pomme granny smith chair sans peau crue": {
    en: "Granny Smith apple, raw, peeled",
    de: "Granny-Smith-Apfel, roh, ohne Schale",
    es: "Manzana Granny Smith, cruda, sin piel",
    it: "Mela Granny Smith, cruda, senza buccia",
    ru: "Яблоко Гренни Смит, сырое, без кожуры",
    ar: "تفاح غراني سميث نيء بدون قشر",
  },
  "brocoli cuit a la vapeur": {
    en: "Steamed broccoli",
    de: "Gedämpfter Brokkoli",
    es: "Brócoli al vapor",
    it: "Broccolo al vapore",
    ru: "Брокколи на пару",
    ar: "بروكلي مطهو على البخار",
  },
  "carotte bouillie/cuite a l eau fondante": {
    en: "Carrot, boiled, tender",
    de: "Karotte, gekocht, weich",
    es: "Zanahoria hervida, tierna",
    it: "Carota bollita, morbida",
    ru: "Морковь варёная, мягкая",
    ar: "جزر مسلوق طري",
  },
  "carotte bouillie cuite a l eau fondante": {
    en: "Carrot, boiled, tender",
    de: "Karotte, gekocht, weich",
    es: "Zanahoria hervida, tierna",
    it: "Carota bollita, morbida",
    ru: "Морковь варёная, мягкая",
    ar: "جزر مسلوق طري",
  },
  "carotte crue": { en: "Raw carrot", de: "Rohe Karotte", es: "Zanahoria cruda", it: "Carota cruda", ru: "Сырая морковь", ar: "جزر نيء" },
  "carotte cuite a la vapeur": {
    en: "Steamed carrot",
    de: "Gedämpfte Karotte",
    es: "Zanahoria al vapor",
    it: "Carota al vapore",
    ru: "Морковь на пару",
    ar: "جزر مطهو على البخار",
  },
  "carotte surgelee crue": {
    en: "Frozen raw carrot",
    de: "Tiefgekühlte rohe Karotte",
    es: "Zanahoria congelada cruda",
    it: "Carota surgelata cruda",
    ru: "Замороженная сырая морковь",
    ar: "جزر مجمد نيء",
  },
  "champignon de paris ou champignon de couche cru": {
    en: "Button mushroom, raw",
    de: "Champignon, roh",
    es: "Champiñón de París, crudo",
    it: "Champignon, crudo",
    ru: "Шампиньон сырой",
    ar: "فطر أبيض نيء",
  },
  "champignon rose des pres cru": {
    en: "Meadow mushroom, raw",
    de: "Wiesenchampignon, roh",
    es: "Champiñón silvestre, crudo",
    it: "Prataiolo, crudo",
    ru: "Луговой шампиньон сырой",
    ar: "فطر المروج نيء",
  },
  "chou romanesco ou brocoli a pomme cru": {
    en: "Romanesco or broccoli, raw",
    de: "Romanesco oder Brokkoli, roh",
    es: "Romanesco o brócoli, crudo",
    it: "Romanesco o broccolo, crudo",
    ru: "Романеско или брокколи, сырые",
    ar: "رومانسكو أو بروكلي نيء",
  },
  "chou romanesco ou brocoli a pomme cuit": {
    en: "Romanesco or broccoli, cooked",
    de: "Romanesco oder Brokkoli, gekocht",
    es: "Romanesco o brócoli, cocido",
    it: "Romanesco o broccolo, cotto",
    ru: "Романеско или брокколи, приготовленные",
    ar: "رومانسكو أو بروكلي مطهو",
  },
  "chou-rave bouilli/cuit a l eau": {
    en: "Kohlrabi, boiled",
    de: "Kohlrabi, gekocht",
    es: "Colinabo hervido",
    it: "Cavolo rapa bollito",
    ru: "Кольраби варёная",
    ar: "كرنب قمري مسلوق",
  },
  "chou rave bouilli cuit a l eau": {
    en: "Kohlrabi, boiled",
    de: "Kohlrabi, gekocht",
    es: "Colinabo hervido",
    it: "Cavolo rapa bollito",
    ru: "Кольраби варёная",
    ar: "كرنب قمري مسلوق",
  },
  "compote ou assimile": {
    en: "Fruit compote or similar",
    de: "Kompott oder Ähnliches",
    es: "Compota o similar",
    it: "Composta o simile",
    ru: "Компот или аналог",
    ar: "كومبوت أو ما شابهه",
  },
  "dinde viande rotie/cuite au four": {
    en: "Roasted or oven-cooked turkey",
    de: "Pute, gebraten oder im Ofen gegart",
    es: "Pavo asado o cocido al horno",
    it: "Tacchino arrosto o cotto al forno",
    ru: "Индейка, жареная или запечённая",
    ar: "ديك رومي مشوي أو مطهو في الفرن",
  },
  "dinde viande rotie cuite au four": {
    en: "Roasted or oven-cooked turkey",
    de: "Pute, gebraten oder im Ofen gegart",
    es: "Pavo asado o cocido al horno",
    it: "Tacchino arrosto o cotto al forno",
    ru: "Индейка, жареная или запечённая",
    ar: "ديك رومي مشوي أو مطهو في الفرن",
  },
  "pain complet ou integral a la farine t150": {
    en: "Wholemeal bread with T150 flour",
    de: "Vollkornbrot mit T150-Mehl",
    es: "Pan integral con harina T150",
    it: "Pane integrale con farina T150",
    ru: "Цельнозерновой хлеб из муки T150",
    ar: "خبز كامل بدقيق T150",
  },
  "fromage de chevre demi-sec": {
    en: "Semi-dry goat cheese",
    de: "Halbtrockener Ziegenkäse",
    es: "Queso de cabra semiseco",
    it: "Formaggio di capra semistagionato",
    ru: "Полусухой козий сыр",
    ar: "جبن ماعز نصف جاف",
  },
  "pates cuites": {
    en: "Cooked pasta",
    de: "Gekochte Pasta",
    es: "Pasta cocida",
    it: "Pasta cotta",
    ru: "Варёная паста",
    ar: "معكرونة مطبوخة",
  },
};

const CLIENT_NUTRITION_EMBEDDED_TRANSLATION_PATTERNS = [
  [/bol petit[- ]déjeuner céréales et fruit/gi, "bol petit-dejeuner cereales et fruit"],
  [/produits laitiers/gi, "produits laitiers"],
  [/yaourt nature/gi, "yaourt nature"],
  [/fruits et légumes/gi, "fruits et legumes"],
  [/eau minérale/gi, "eau minerale"],
  [/eau gazeuse/gi, "eau gazeuse"],
  [/pétales de céréales/gi, "petales de cereales"],
  [/céréales petit[- ]déjeuner très riches en fibres/gi, "cereales petit-dejeuner tres riches en fibres"],
  [/beurre sur la teneur en matière grasse\s*\(allégé ou non\)/gi, "beurre sur la teneur en matiere grasse allege ou non"],
  [/lait demi[- ]écrémé,\s*pasteurisé/gi, "lait demi-ecreme pasteurise"],
  [/pomme granny smith,\s*chair sans peau,\s*crue/gi, "pomme granny smith chair sans peau crue"],
  [/brocoli,\s*cuit à la vapeur/gi, "brocoli cuit a la vapeur"],
  [/carotte,\s*bouillie\/cuite à l['’]eau,\s*fondante/gi, "carotte bouillie/cuite a l eau fondante"],
  [/carotte,\s*crue/gi, "carotte crue"],
  [/carotte,\s*cuite à la vapeur/gi, "carotte cuite a la vapeur"],
  [/carotte,\s*surgelée,\s*crue/gi, "carotte surgelee crue"],
  [/champignon de paris ou champignon de couche,\s*cru/gi, "champignon de paris ou champignon de couche cru"],
  [/champignon,\s*rosé des prés,\s*cru/gi, "champignon rose des pres cru"],
  [/chou romanesco ou brocoli à pomme,\s*cru/gi, "chou romanesco ou brocoli a pomme cru"],
  [/chou romanesco ou brocoli à pomme,\s*cuit/gi, "chou romanesco ou brocoli a pomme cuit"],
  [/chou-rave,\s*bouilli\/cuit à l['’]eau/gi, "chou-rave bouilli/cuit a l eau"],
  [/compote ou assimilé/gi, "compote ou assimile"],
  [/dinde,\s*viande rôtie\/cuite au four/gi, "dinde viande rotie/cuite au four"],
  [/pain complet ou intégral\s*\(à la farine t150\)/gi, "pain complet ou integral a la farine t150"],
  [/fromage de chèvre demi-sec/gi, "fromage de chevre demi-sec"],
  [/pâtes cuites/gi, "pates cuites"],
];

const dateLocale = () => {
  const language = currentLanguage();
  if (language === "fr") return "fr-FR";
  if (language === "en") return "en-US";
  return language;
};

const formatDate = (value) => {
  try {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(dateLocale());
  } catch {
    return "";
  }
};

const getDayTotals = (assessment) => {
  const day =
    assessment?.ration?.selected?.computed?.totals?.day ||
    assessment?.ration?.selected?.computed?.day ||
    null;
  return {
    kcal: rationMenuNum(day?.kcal),
    p: rationMenuNum(day?.prot || day?.p),
    f: rationMenuNum(day?.lip || day?.f),
    c: rationMenuNum(day?.glu || day?.c || day?.carbs),
  };
};

const prettyKey = (value = "") =>
  String(value || "")
    .replace(/__/g, " / ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const mealKeyAliases = {
  petit_dej: "petit_dej",
  petit_dejeuner: "petit_dej",
  breakfast: "petit_dej",
  fruhstuck: "petit_dej",
  collation_1: "collation_1",
  collation_matin: "collation_1",
  morning_snack: "collation_1",
  vormittagssnack: "collation_1",
  dejeuner: "dejeuner",
  lunch: "dejeuner",
  mittagessen: "dejeuner",
  collation_2: "collation_2",
  collation_apres_midi: "collation_2",
  afternoon_snack: "collation_2",
  nachmittagssnack: "collation_2",
  diner: "diner",
  dinner: "diner",
  abendessen: "diner",
  collation_3: "collation_3",
  collation_soir: "collation_3",
  evening_snack: "collation_3",
  abendsnack: "collation_3",
};

const translateMealLabel = (mealKey = "") => {
  const key = mealKeyAliases[labelKey(mealKey)] || mealKey;
  return i18n.t(`auto.ClientNutritionSharedSection.meals.${key}`, MENU_MEAL_LABEL[key] || mealKey || "");
};

const translateMenuMealLabel = (meal = {}) => {
  const raw = typeof meal === "string" ? meal : meal?.mealKey || meal?.key || meal?.label || "";
  const key = mealKeyAliases[labelKey(raw)] || raw;
  return translateMealLabel(key) || raw;
};

const translateDayLabel = (label = "") => {
  const raw = String(label || "").trim();
  const match = raw.match(/^(jour|day|tag)\s*(\d+)$/i);
  if (match) {
    return i18n.t("auto.ClientNutritionSharedSection.day_value", "Jour {{day}}", { day: match[2] });
  }
  return raw;
};

const translateDietLabel = (label = "") => {
  const key = labelKey(label);
  if (!key) return "";
  const i18nKey = `auto.nutritionDiets.${key}`;
  return i18n.exists?.(i18nKey) ? i18n.t(i18nKey) : label;
};

const translatePathologyLabel = (label = "") => {
  const key = labelKey(label);
  if (!key) return "";
  const i18nKey = `auto.NutritionAssessmentEditor.pathology.${key}`;
  return i18n.exists?.(i18nKey) ? i18n.t(i18nKey) : label;
};

const translateKnownDisplayLabel = (label = "") => {
  const lang = currentLanguage();
  if (lang === "fr") return "";
  return displayKeyAliases(label)
    .map((key) => CLIENT_NUTRITION_DISPLAY_TRANSLATIONS[key]?.[lang])
    .find(Boolean) || "";
};

const translateObjectiveLabel = (label = "") => {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const translated = translateNutritionObjective(raw, currentLanguage());
  if (translated && translated !== raw) return translated;
  const i18nKey = `auto.nutritionObjectives.${labelKey(raw)}`;
  return i18n.exists?.(i18nKey) ? i18n.t(i18nKey) : raw;
};

const translateFoodLabel = (label = "") => {
  const raw = String(label || "").trim();
  if (!raw) return i18n.t("auto.ClientNutritionSharedSection.aliment", "Aliment");
  if (raw.includes(" / ")) {
    return raw.split(/\s+\/\s+/).map((part) => translateFoodLabel(part)).join(" / ");
  }
  const knownLabel = translateKnownDisplayLabel(raw);
  if (knownLabel) return knownLabel;
  const key = labelKey(raw);
  const rationKey = key ? `auto.RationSpontaneeExcel.labels.${key}` : "";
  const rationLabel = rationKey && i18n.exists?.(rationKey) ? i18n.t(rationKey) : "";
  return rationLabel || translateNutritionFoodName(raw, currentLanguage());
};

const translateIngredientText = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const knownLabel = translateKnownDisplayLabel(raw);
  if (knownLabel) return knownLabel;
  const match = raw.match(/^(.*?)(\s*\([^)]*\))$/);
  if (!match) return translateFoodLabel(raw);
  return `${translateFoodLabel(match[1])}${match[2]}`;
};

const translateEmbeddedIngredientText = (value = "") => {
  const raw = String(value || "");
  const lang = currentLanguage();
  if (!raw.trim() || lang === "fr") return raw;
  return CLIENT_NUTRITION_EMBEDDED_TRANSLATION_PATTERNS.reduce((text, [pattern, sourceKey]) => {
      const translated = CLIENT_NUTRITION_DISPLAY_TRANSLATIONS[sourceKey]?.[lang];
      if (!translated) return text;
      return text.replace(pattern, translated);
    }, raw);
};

const translateRecipeText = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const knownLabel = translateKnownDisplayLabel(raw);
  if (knownLabel) return knownLabel;
  const ingredientsMatch = raw.match(/^préparer les ingrédients\s*:\s*(.+)$/i);
  if (ingredientsMatch) {
    const ingredients = translateEmbeddedIngredientText(ingredientsMatch[1].replace(/\.$/, ""));
    return `${i18n.t("auto.ClientNutritionSharedSection.prepare_ingredients", "Préparer les ingrédients :")} ${ingredients}.`;
  }
  const recipeStepKey = `auto.ClientNutritionSharedSection.recipe_steps.${labelKey(raw)}`;
  return i18n.exists?.(recipeStepKey) ? i18n.t(recipeStepKey) : translateEmbeddedIngredientText(raw);
};

const nutritionItemName = (item) => {
  if (typeof item === "string") return item;
  return item?.name || item?.label || item?.text || item?.title || item?.foodName || "";
};

const nutritionItemQty = (item) => {
  if (!item || typeof item === "string") return "";
  return item.qty || item.quantity || item.amount || "";
};

const nutritionItemUnit = (item) => {
  if (!item || typeof item === "string") return "";
  return item.unit || "";
};

const translateAdviceField = (sheet = {}, field = "title", fallback = "") => {
  if (!sheet?.id) return fallback;
  return i18n.t(`auto.nutritionAdviceSheets.${sheet.id}.${field}`, fallback);
};

const translateAdviceListField = (sheet = {}, field = "keyPoints", fallback = []) => {
  const fallbackList = Array.isArray(fallback) ? fallback : [];
  if (!sheet?.id) return fallbackList;
  const value = i18n.t(`auto.nutritionAdviceSheets.${sheet.id}.${field}`, {
    defaultValue: fallbackList,
    returnObjects: true,
  });
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, item]) => item)
      .filter(Boolean);
  }
  return Array.isArray(value) ? value : fallbackList;
};

const groupRowsByMeal = (rows = []) => {
  const grouped = Object.fromEntries(MENU_MEALS_ORDER.map((mealKey) => [mealKey, []]));
  rows.forEach((row) => {
    const mealKey = grouped[row.mealKey] ? row.mealKey : "dejeuner";
    grouped[mealKey].push(row);
  });
  return grouped;
};

function ClientNutritionPdfDoc({
  title,
  sharedDate,
  coachName,
  clientName,
  logoDataUrl,
  sections,
  rationTotals,
  rationByMeal,
  menuDays,
  adviceSheets,
}) {
  const dateStr = sharedDate || new Date().toLocaleDateString(dateLocale());
  const hasMenuDays = Array.isArray(menuDays) && menuDays.some((day) => day?.meals?.some((meal) => meal.items?.length));
  const hasAdviceSheets = Array.isArray(adviceSheets) && adviceSheets.length > 0;
  return (
    <Document>
      <Page size="A4" style={clientPdfStyles.page}>
        <View style={clientPdfStyles.header} fixed>
          <View style={clientPdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={clientPdfStyles.logo} /> : null}
            <PdfText style={clientPdfStyles.coachName}>{coachName || i18n.t("auto.ClientNutritionSharedSection.coach", "Coach")}</PdfText>
          </View>
          <View style={clientPdfStyles.headerCenter}>
            <PdfText style={clientPdfStyles.title}>{title || i18n.t("auto.ClientNutritionSharedSection.plan_nutrition", "Plan nutrition")}</PdfText>
            <PdfText style={clientPdfStyles.subtitle}>{i18n.t("auto.ClientNutritionSharedSection.suivi_nutrition", "Suivi nutrition")}</PdfText>
          </View>
          <View style={clientPdfStyles.headerRight}>
            <PdfText style={clientPdfStyles.clientName}>{clientName || i18n.t("auto.ClientNutritionSharedSection.patient", "Patient")}</PdfText>
            <PdfText style={clientPdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        {sections.ration ? (
          <View>
            <PdfText style={clientPdfStyles.sectionTitle}>{i18n.t("auto.ClientNutritionSharedSection.ration_alimentaire", "Ration alimentaire")}</PdfText>
            <View style={clientPdfStyles.card} wrap={false}>
              <PdfText style={clientPdfStyles.value}>
                {rationTotals.kcal ? `${r0(rationTotals.kcal)} kcal` : i18n.t("auto.ClientNutritionSharedSection.ration_partagee", "Ration partagée")}{i18n.t("auto.ClientNutritionSharedSection.prot", "• Prot")}{r0(rationTotals.p)}{i18n.t("auto.ClientNutritionSharedSection.g_lipides", "g • Lipides")}{r0(rationTotals.f)}{i18n.t("auto.ClientNutritionSharedSection.g_glucides", "g • Glucides")}{r0(rationTotals.c)}{i18n.t("auto.ClientNutritionSharedSection.g", "g")}</PdfText>
            </View>
            {MENU_MEALS_ORDER.map((mealKey) =>
              rationByMeal[mealKey]?.length ? (
                <View key={mealKey} style={clientPdfStyles.card} wrap={false}>
                  <PdfText style={clientPdfStyles.value}>{translateMealLabel(mealKey)}</PdfText>
                  {rationByMeal[mealKey].map((row, idx) => (
                    <PdfText key={`${mealKey}-${idx}`} style={[clientPdfStyles.line, { marginTop: idx === 0 ? 6 : 0 }]}>
                      • {row.group ? `${translateFoodLabel(row.group)} - ` : ""}{translateFoodLabel(row.label)}{" "}
                      <PdfText style={clientPdfStyles.muted}>({r0(row.qty)} {row.unit})</PdfText>
                    </PdfText>
                  ))}
                </View>
              ) : null
            )}
          </View>
        ) : null}

        {sections.menu && hasMenuDays ? (
          <View>
            <PdfText style={clientPdfStyles.sectionTitle}>{i18n.t("nav.menu", "Menu")}</PdfText>
            {(menuDays || []).map((day) => (
              <View key={day.label} style={clientPdfStyles.card} wrap={false}>
                <PdfText style={clientPdfStyles.value}>
                  {translateDayLabel(day.label)}{day?.totals?.kcal ? ` • ${r0(day.totals.kcal)} kcal` : ""}
                </PdfText>
                {(day.meals || []).filter((meal) => meal.items?.length).map((meal) => (
                  <View key={`${day.label}-${meal.label}`} style={{ marginTop: 6 }}>
                    <PdfText style={clientPdfStyles.label}>{translateMenuMealLabel(meal)}</PdfText>
                    {meal.items.map((item, idx) => (
                      <PdfText key={`${meal.label}-${idx}`} style={clientPdfStyles.line}>
                        • {translateIngredientText(nutritionItemName(item))} <PdfText style={clientPdfStyles.muted}>({nutritionItemQty(item)})</PdfText>
                      </PdfText>
                    ))}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {sections.adviceSheets ? (
          <View>
            <PdfText style={clientPdfStyles.sectionTitle}>{i18n.t("auto.ClientNutritionSharedSection.conseils_partages", "Conseils partagés")}</PdfText>
            {hasAdviceSheets ? (
              adviceSheets.map((sheet, idx) => (
                <View key={sheet.id || idx} style={clientPdfStyles.card} wrap={false}>
                  <PdfText style={clientPdfStyles.value}>
                    {translateAdviceField(sheet, "title", sheet.title || sheet.category || i18n.t("auto.ClientNutritionSharedSection.conseil_value", "Conseil {{index}}", { index: idx + 1 }))}
                  </PdfText>
                  {sheet.category ? (
                    <PdfText style={[clientPdfStyles.line, clientPdfStyles.muted]}>{i18n.t("auto.ClientNutritionSharedSection.categorie", "Catégorie :")}{translateAdviceField(sheet, "category", sheet.category)}</PdfText>
                  ) : null}
                  {sheet.summary ? (
                    <PdfText style={[clientPdfStyles.line, { marginTop: 6 }]}>{translateAdviceField(sheet, "summary", sheet.summary)}</PdfText>
                  ) : null}
                  {(sheet.keyPoints || []).length ? (
                    <View style={{ marginTop: 6 }}>
                      <PdfText style={clientPdfStyles.label}>{i18n.t("auto.ClientNutritionSharedSection.a_retenir", "À retenir")}</PdfText>
                      {translateAdviceListField(sheet, "keyPoints", sheet.keyPoints).map((point, kpIndex) => (
                        <PdfText key={`kp-${kpIndex}`} style={clientPdfStyles.line}>• {point}</PdfText>
                      ))}
                    </View>
                  ) : null}
                  {(sheet.practicalTips || []).length ? (
                    <View style={{ marginTop: 6 }}>
                      <PdfText style={clientPdfStyles.label}>{i18n.t("auto.ClientNutritionSharedSection.conseils_pratiques", "Conseils pratiques")}</PdfText>
                      {translateAdviceListField(sheet, "practicalTips", sheet.practicalTips).map((tip, ptIndex) => (
                        <PdfText key={`pt-${ptIndex}`} style={clientPdfStyles.line}>• {tip}</PdfText>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <View style={clientPdfStyles.card} wrap={false}>
                <PdfText style={clientPdfStyles.line}>{i18n.t("auto.ClientNutritionSharedSection.aucune_fiche_conseil_detaillee_n_est_disponible_da", "Aucune fiche conseil détaillée n’est disponible dans ce partage.")}</PdfText>
              </View>
            )}
          </View>
        ) : null}

        <View style={clientPdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={clientPdfStyles.footerLogo} /> : null}
          <PdfText style={clientPdfStyles.footerText}>{i18n.t("auto.ClientNutritionSharedSection.genere_avec_boostyourlife_coach", "Généré avec BoostYourLife.coach")}</PdfText>
        </View>
      </Page>
    </Document>
  );
}

const extractFoodSurveyRows = (assessment) => {
  const survey = assessment?.foodSurvey || {};
  if (survey.mode === "ciqual") {
    return (survey?.ciqual?.items || [])
      .filter((item) => rationMenuNum(item?.qty) > 0)
      .map((item) => ({
        mealKey: item?.meal || "dejeuner",
        label: item?.name || item?.label || i18n.t("auto.ClientNutritionSharedSection.aliment", "Aliment"),
        qty: rationMenuNum(item?.qty),
        unit: item?.unit || "g",
      }));
  }

  const values = survey?.excel?.values || {};
  return Object.entries(values).flatMap(([foodKey, row]) => {
    const meals = row?.meals || {};
    return MENU_MEALS_ORDER
      .filter((mealKey) => rationMenuNum(meals?.[mealKey]) > 0)
      .map((mealKey) => ({
        mealKey,
        label: row?.name || row?.label || prettyKey(foodKey),
        qty: rationMenuNum(meals?.[mealKey]),
        unit: row?.unit || "g",
      }));
  });
};

export default function ClientNutritionSharedSection({
  clientId,
  variant = "full",
  onOpenNutrition,
  clientName: clientNameProp = "",
}) {
  const theme = useNutritionTheme();
  const panelProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "lg",
    bg: theme.surfaceBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };
  const tileProps = {
    borderWidth: "1px",
    borderColor: theme.borderColor,
    borderRadius: "md",
    bg: theme.surfaceBg,
  };
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [selectedMenuDayIndex, setSelectedMenuDayIndex] = useState(0);
  const [selectedRecipeDayIndex, setSelectedRecipeDayIndex] = useState(0);
  const [activePanel, setActivePanel] = useState("summary");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [coachProfile, setCoachProfile] = useState(null);
  const [pdfLogoDataUrl, setPdfLogoDataUrl] = useState(null);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return undefined;
    }

    const colRef = collection(db, "clients", clientId, "nutrition_assessments");
    const q = query(colRef, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((row) => {
            const sections = row?.clientShare?.sections || {};
            return row?.clientShare?.enabled && Object.values(sections).some(Boolean);
          });
        setAssessments(rows);
        setSelectedAssessmentId((previous) =>
          previous && rows.some((row) => row.id === previous) ? previous : rows[0]?.id || ""
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [clientId]);

  const latest = assessments.find((row) => row.id === selectedAssessmentId) || assessments[0] || null;
  const sections = latest?.clientShare?.sections || {};
  const inputs = useMemo(() => latest?.inputs || {}, [latest]);
  const needs = useMemo(
    () =>
      computeNutritionNeeds({
        inputs,
        computed: latest?.computed || {},
        objectiveRaw: inputs?.objectif || inputs?.objective || "",
      }),
    [inputs, latest?.computed]
  );
  const diet = useMemo(() => normalizeDietList(inputs).filter((item) => String(item || "").toLowerCase() !== "normal"), [inputs]);
  const pathologies = useMemo(() => normalizePathologyList(inputs), [inputs]);
  const translatedObjective = translateObjectiveLabel(needs?.objectiveRaw || inputs?.objectif || inputs?.objective || "");
  const translatedDiet = useMemo(() => diet.map(translateDietLabel).filter(Boolean), [diet]);
  const translatedPathologies = useMemo(() => pathologies.map(translatePathologyLabel).filter(Boolean), [pathologies]);
  const rationLines = useMemo(() => extractRationLines(latest), [latest]);
  const rationTotals = useMemo(() => getDayTotals(latest), [latest]);
  const foodSurveyRows = useMemo(() => extractFoodSurveyRows(latest), [latest]);
  const foodSurveyByMeal = useMemo(() => groupRowsByMeal(foodSurveyRows), [foodSurveyRows]);
  const rationRows = useMemo(
    () =>
      rationLines.flatMap((line) =>
        MENU_MEALS_ORDER
          .filter((mealKey) => rationMenuNum(line?.meals?.[mealKey]) > 0)
          .map((mealKey) => ({
            mealKey,
            label: line?.resolvedLabel || line?.label || line?.key || i18n.t("auto.ClientNutritionSharedSection.aliment", "Aliment"),
            group: line?.group || "",
            qty: rationMenuNum(line?.meals?.[mealKey]),
            unit: line?.unit || "g",
          }))
      ),
    [rationLines]
  );
  const rationByMeal = useMemo(() => groupRowsByMeal(rationRows), [rationRows]);
  const menuDays = latest?.clientShare?.snapshot?.menuDays || [];
  const recipes = latest?.clientShare?.snapshot?.recipes || [];
  const shoppingList = latest?.clientShare?.snapshot?.shoppingList || [];
  const adviceSheets = latest?.clientShare?.snapshot?.adviceSheets || [];
  const patientNote = latest?.clientShare?.snapshot?.patientNote?.text || "";
  const selectedMenuDay = menuDays[Math.min(selectedMenuDayIndex, Math.max(0, menuDays.length - 1))] || menuDays[0] || null;
  const recipeDays = useMemo(() => {
    const map = new Map();
    recipes.forEach((recipe) => {
      const key = recipe.dayLabel || recipe.day || i18n.t("auto.ClientNutritionSharedSection.day_value", "Jour {{day}}", { day: 1 });
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(recipe);
    });
    return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
  }, [recipes]);
  const selectedRecipeDay = recipeDays[Math.min(selectedRecipeDayIndex, Math.max(0, recipeDays.length - 1))] || recipeDays[0] || null;
  const sharedDate = formatDate(latest?.clientShare?.sharedAt || latest?.updatedAt);
  const clientName = useMemo(
    () =>
      getPersonName(
        clientNameProp,
        latest?.client,
        latest?.patient,
        latest?.inputs,
        latest?.clientName,
        latest?.patientName
      ) || i18n.t("auto.ClientNutritionSharedSection.patient", "Patient"),
    [clientNameProp, latest]
  );
  const coachName = useMemo(
    () =>
      getPersonName(
        latest?.clientShare?.coachName,
        latest?.coach,
        latest?.createdByName,
        latest?.coachName,
        coachProfile
      ) || i18n.t("auto.ClientNutritionSharedSection.coach", "Coach"),
    [coachProfile, latest]
  );
  const coachLogoSource = useMemo(
    () =>
      firstNonEmpty(
        latest?.clientShare?.coachLogoUrl,
        latest?.coachLogoUrl,
        latest?.coach?.logoUrl,
        coachProfile?.logoUrl,
        coachProfile?.photoURL,
        coachProfile?.avatarUrl
      ),
    [coachProfile, latest]
  );
  const panels = useMemo(() => [
    sections.summary
      ? {
          key: "summary",
          title: i18n.t("auto.ClientNutritionSharedSection.resume", "Résumé"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.objectifs", "Objectifs"),
          value: needs?.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : i18n.t("auto.ClientNutritionSharedSection.reperes", "Repères"),
          helper: [translatedDiet.join(", "), translatedPathologies.slice(0, 2).join(", ")].filter(Boolean).join(" • ") || i18n.t("auto.ClientNutritionSharedSection.contexte_partage", "Contexte partagé"),
          accent: "#3B82F6",
          bg: "rgba(59,130,246,0.10)",
        }
      : null,
    sections.foodSurvey
      ? {
          key: "foodSurvey",
          title: i18n.t("auto.ClientNutritionSharedSection.habitudes", "Habitudes"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.ration_spontanee", "Ration spontanée"),
          value: i18n.t("auto.ClientNutritionSharedSection.ligne_count", "{{count}} ligne(s)", { count: foodSurveyRows.length }),
          helper: i18n.t("auto.ClientNutritionSharedSection.click_releve", "Clique pour voir le relevé partagé."),
          accent: "#10B981",
          bg: "rgba(16,185,129,0.10)",
        }
      : null,
    sections.ration
      ? {
          key: "ration",
          title: i18n.t("auto.ClientNutritionSharedSection.ration", "Ration"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.ration_alimentaire", "Ration alimentaire"),
          value: rationTotals.kcal ? `${r0(rationTotals.kcal)} kcal` : i18n.t("auto.ClientNutritionSharedSection.ligne_count", "{{count}} ligne(s)", { count: rationRows.length }),
          helper: `P ${r0(rationTotals.p)} g • L ${r0(rationTotals.f)} g • G ${r0(rationTotals.c)} g`,
          accent: "#F59E0B",
          bg: "rgba(245,158,11,0.12)",
        }
      : null,
    sections.menu
      ? {
          key: "menu",
          title: i18n.t("nav.menu", "Menu"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.journees_proposees", "Journées proposées"),
          value: i18n.t("auto.ClientNutritionSharedSection.jour_count", "{{count}} jour(s)", { count: menuDays.length || 1 }),
          helper: i18n.t("auto.ClientNutritionSharedSection.click_repas", "Clique pour voir les repas."),
          accent: "#8B5CF6",
          bg: "rgba(139,92,246,0.12)",
        }
      : null,
    sections.recipes
      ? {
          key: "recipes",
          title: i18n.t("auto.ClientNutritionSharedSection.recettes", "Recettes"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.preparation", "Préparation"),
          value: i18n.t("auto.ClientNutritionSharedSection.recette_count", "{{count}} recette(s)", { count: recipes.length }),
          helper: i18n.t("auto.ClientNutritionSharedSection.click_recettes", "Clique pour voir les recettes proposées."),
          accent: "#EC4899",
          bg: "rgba(236,72,153,0.10)",
        }
      : null,
    sections.shoppingList
      ? {
          key: "shoppingList",
          title: i18n.t("auto.ClientNutritionSharedSection.courses", "Courses"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.liste_de_courses", "Liste de courses"),
          value: i18n.t("auto.ClientNutritionSharedSection.aliment_count", "{{count}} aliment(s)", { count: shoppingList.reduce((sum, section) => sum + (section.items?.length || 0), 0) }),
          helper: i18n.t("auto.ClientNutritionSharedSection.click_courses", "Clique pour voir les achats regroupés."),
          accent: "#14B8A6",
          bg: "rgba(20,184,166,0.10)",
        }
      : null,
    sections.adviceSheets
      ? {
          key: "adviceSheets",
          title: i18n.t("auto.ClientNutritionSharedSection.conseils", "Conseils"),
          eyebrow: i18n.t("auto.ClientNutritionSharedSection.fiches_partagees", "Fiches partagées"),
          value: i18n.t("auto.ClientNutritionSharedSection.fiche_count", "{{count}} fiche(s)", { count: adviceSheets.length }),
          helper: i18n.t("auto.ClientNutritionSharedSection.click_conseils", "Clique pour voir les conseils personnalisés."),
          accent: "#0F766E",
          bg: "rgba(15,118,110,0.12)",
        }
      : null,
  ].filter(Boolean), [
    sections.summary,
    sections.foodSurvey,
    sections.ration,
    sections.menu,
    sections.recipes,
    sections.shoppingList,
    sections.adviceSheets,
    needs?.kcalTarget,
    translatedDiet,
    translatedPathologies,
    foodSurveyRows.length,
    rationTotals.kcal,
    rationTotals.p,
    rationTotals.f,
    rationTotals.c,
    rationRows.length,
    menuDays.length,
    recipes.length,
    shoppingList,
    adviceSheets.length,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const requested = params.get("tab") || String(location.hash || "").replace(/^#/, "");
    if (requested && panels.some((panel) => panel.key === requested)) {
      setActivePanel(requested);
    }
  }, [location.hash, location.search, panels]);

  useEffect(() => {
    setSelectedMenuDayIndex(0);
    setSelectedRecipeDayIndex(0);
  }, [selectedAssessmentId]);
  const panelKeys = panels.map((panel) => panel.key).join("|");
  const firstPanelKey = panels[0]?.key || "";
  const activePanelMeta = panels.find((panel) => panel.key === activePanel) || panels[0] || null;

  useEffect(() => {
    if (!firstPanelKey) return;
    if (!panelKeys.split("|").includes(activePanel)) {
      setActivePanel(firstPanelKey);
    }
  }, [activePanel, firstPanelKey, panelKeys]);

  useEffect(() => {
    let alive = true;
    const coachId = latest?.clientShare?.sharedBy || latest?.createdBy || latest?.coachId || "";
    if (!coachId || latest?.clientShare?.coachName || latest?.clientShare?.coachLogoUrl) {
      setCoachProfile(null);
      return undefined;
    }
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", coachId));
        if (alive && snap.exists()) setCoachProfile(snap.data());
      } catch {
        if (alive) setCoachProfile(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [latest?.clientShare?.coachLogoUrl, latest?.clientShare?.coachName, latest?.clientShare?.sharedBy, latest?.coachId, latest?.createdBy]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const coachLogo = await toDataUrlSafe(coachLogoSource);
      const fallback = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      if (alive) setPdfLogoDataUrl(coachLogo || fallback);
    })();
    return () => {
      alive = false;
    };
  }, [coachLogoSource]);

  const downloadPdf = async () => {
    if (!latest) return;
    setExportingPdf(true);
    try {
      const blob = await pdf(
        <ClientNutritionPdfDoc
          title={i18n.t("auto.ClientNutritionSharedSection.plan_nutrition", "Plan nutrition")}
          sharedDate={sharedDate}
          coachName={coachName}
          clientName={clientName}
          logoDataUrl={pdfLogoDataUrl}
          sections={sections}
          rationTotals={rationTotals}
          rationByMeal={rationByMeal}
          menuDays={menuDays}
          adviceSheets={adviceSheets}
        />
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plan-nutrition-BYL.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading) return <AppLoading label={i18n.t("auto.ClientNutritionSharedSection.chargement_du_suivi_nutrition", "Chargement du suivi nutrition...")} minH="180px" />;
  if (!latest) {
    return (
      <Box {...panelProps} p={{ base: 4, md: 5 }}>
        <Heading size="sm">{i18n.t("auto.ClientNutritionSharedSection.aucun_suivi_nutrition_partage", "Aucun suivi nutrition partagé")}</Heading>
        <Text color={theme.mutedText} mt={2}>{i18n.t("auto.ClientNutritionSharedSection.ton_coach_n_a_pas_encore_partage_de_menu_recette_o", "Ton coach n’a pas encore partagé de menu, recette ou liste de courses sur cette fiche client.")}</Text>
      </Box>
    );
  }

  if (variant === "compact") {
    const sharedCount = assessments.length;
    return (
      <Box mb={5} p={{ base: 4, md: 5 }} {...panelProps}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <Box>
            <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
              {i18n.t("auto.ClientNutritionSharedSection.nutrition_upper", "NUTRITION")}
            </Text>
            <Heading size="md" mt={1}>{i18n.t("auto.ClientNutritionSharedSection.suivi_nutrition", "Suivi nutrition")}</Heading>
            <Text fontSize="sm" color={theme.mutedText} mt={1}>
              {sharedDate
                ? i18n.t("auto.ClientNutritionSharedSection.last_share_on", "Dernier partage le {{date}}", { date: sharedDate })
                : i18n.t("auto.ClientNutritionSharedSection.dernier_partage", "Dernier partage")}{" "}
              • {i18n.t("auto.ClientNutritionSharedSection.bilan_count", "{{count}} bilan(s) disponible(s)", { count: sharedCount })}
            </Text>
          </Box>
          <HStack spacing={2}>
            <Tooltip label={i18n.t("auto.ClientNutritionSharedSection.telecharger_le_plan_nutrition_en_pdf", "Télécharger le plan nutrition en PDF")}>
              <IconButton
                aria-label={i18n.t("auto.ClientNutritionSharedSection.telecharger_le_plan_nutrition", "Télécharger le plan nutrition")}
                icon={<DownloadIcon />}
                borderRadius="full"
                variant="outline"
                onClick={downloadPdf}
                isLoading={exportingPdf}
              />
            </Tooltip>
            <Button borderRadius="full" colorScheme="blue" onClick={onOpenNutrition}>{i18n.t("programs.open", "Ouvrir")}</Button>
          </HStack>
        </HStack>

        <SimpleGrid data-tour="client-nutrition-summary" columns={{ base: 1, md: 3 }} spacing={3} mt={4}>
          <Box {...tileProps} p={4} bg="rgba(59,130,246,0.08)">
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.objectif", "OBJECTIF")}</Text>
            <Text mt={1} fontWeight="900" noOfLines={1}>{translatedObjective || i18n.t("auto.ClientNutritionSharedSection.suivi_nutrition", "Suivi nutrition")}</Text>
            <Text fontSize="sm" color={theme.mutedText} noOfLines={1}>{translatedDiet.join(", ") || i18n.t("auto.ClientNutritionSharedSection.aucun_regime_specifique", "Aucun régime spécifique")}</Text>
          </Box>
          <Box {...tileProps} p={4} bg="rgba(16,185,129,0.08)">
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.repere_jour", "REPÈRE JOUR")}</Text>
            <Text mt={1} fontWeight="900">{needs?.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : i18n.t("auto.ClientNutritionSharedSection.a_ajuster", "À ajuster")}</Text>
            <Text fontSize="sm" color={theme.mutedText}>
              P {needs?.protG?.min ? `${r0(needs.protG.min)}-${r0(needs.protG.max)} g` : "—"}{i18n.t("auto.ClientNutritionSharedSection.l", "• L")}{needs?.lipG?.min ? `${r0(needs.lipG.min)}-${r0(needs.lipG.max)} g` : "—"}{i18n.t("auto.ClientNutritionSharedSection.g_2", "• G")}{needs?.glucG?.min ? `${r0(needs.glucG.min)}-${r0(needs.glucG.max)} g` : "—"}
            </Text>
          </Box>
          <Box {...tileProps} p={4} bg="rgba(139,92,246,0.08)">
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.partage", "PARTAGÉ")}</Text>
            <Wrap spacing={2} mt={2}>
              {sections.summary ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.resume", "Résumé")}</Badge> : null}
              {sections.foodSurvey ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.habitudes", "Habitudes")}</Badge> : null}
              {sections.ration ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.ration", "Ration")}</Badge> : null}
              {sections.menu ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("nav.menu", "Menu")}</Badge> : null}
              {sections.recipes ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.recettes", "Recettes")}</Badge> : null}
              {sections.shoppingList ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.courses", "Courses")}</Badge> : null}
              {sections.adviceSheets ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.conseils", "Conseils")}</Badge> : null}
            </Wrap>
          </Box>
        </SimpleGrid>
      </Box>
    );
  }

  return (
    <Box mb={6} p={{ base: 4, md: 5 }} {...panelProps}>
      {assessments.length > 1 ? (
        <Box mb={4}>
          <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText} mb={2}>{i18n.t("auto.ClientNutritionSharedSection.historique_du_suivi", "HISTORIQUE DU SUIVI")}</Text>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
            {assessments.map((assessment, index) => {
              const isActive = assessment.id === latest?.id;
              const assessmentInputs = assessment?.inputs || {};
              const objective = translateObjectiveLabel(assessmentInputs?.objectif || assessmentInputs?.objective || "") || i18n.t("auto.ClientNutritionSharedSection.bilan_nutrition", "Bilan nutrition");
              const date = formatDate(assessment?.clientShare?.sharedAt || assessment?.updatedAt);
              const extraDiet = normalizeDietList(assessmentInputs).filter((item) => String(item || "").toLowerCase() !== "normal");
              const extraPathologies = normalizePathologyList(assessmentInputs);
              const translatedExtraConstraints = [...extraDiet.map(translateDietLabel), ...extraPathologies.map(translatePathologyLabel)].filter(Boolean);
              return (
                <Box
                  key={assessment.id}
                  {...tileProps}
                  p={4}
                  cursor="pointer"
                  borderColor={isActive ? "#3B82F6" : theme.borderColor}
                  bg={isActive ? "rgba(59,130,246,0.08)" : theme.surfaceBg}
                  onClick={() => setSelectedAssessmentId(assessment.id)}
                  _hover={{ transform: "translateY(-1px)", borderColor: "#3B82F6" }}
                >
                  <HStack justify="space-between" align="start" mb={2}>
                    <Text fontWeight="900">{i18n.t("auto.ClientNutritionSharedSection.bilan_number", "Bilan {{number}}", { number: assessments.length - index })}</Text>
                    <Badge borderRadius="full" px={3} py={1}>{date || i18n.t("auto.ClientNutritionSharedSection.recent", "Récent")}</Badge>
                  </HStack>
                  <Text fontWeight="800" noOfLines={1}>{objective}</Text>
                  <Text fontSize="sm" color={theme.mutedText} mt={1} noOfLines={2}>
                    {translatedExtraConstraints.join(" • ") || i18n.t("auto.ClientNutritionSharedSection.sans_contrainte_particuliere", "Sans contrainte particulière")}
                  </Text>
                </Box>
              );
            })}
          </SimpleGrid>
        </Box>
      ) : null}

      <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={{ base: 3, md: 4 }}>
        <Box>
          <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.suivi_nutrition_2", "SUIVI NUTRITION")}</Text>
          <Heading size="md" mt={1}>{i18n.t("auto.ClientNutritionSharedSection.ton_plan_nutrition", "Ton plan nutrition")}</Heading>
          <Text fontSize="sm" color={theme.mutedText} mt={1}>
            {sharedDate
              ? i18n.t("auto.ClientNutritionSharedSection.last_update_on", "Dernière mise à jour partagée par ton professionnel le {{date}}.", { date: sharedDate })
              : i18n.t("auto.ClientNutritionSharedSection.last_update", "Dernière mise à jour partagée par ton professionnel.")}
          </Text>
        </Box>
        <HStack spacing={2} align="center" flexWrap="wrap" justify="flex-end">
          <Wrap spacing={2} display={{ base: "none", md: "flex" }}>
            {sections.summary ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.resume", "Résumé")}</Badge> : null}
            {sections.foodSurvey ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.habitudes", "Habitudes")}</Badge> : null}
            {sections.ration ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.ration", "Ration")}</Badge> : null}
            {sections.menu ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("nav.menu", "Menu")}</Badge> : null}
            {sections.recipes ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.recettes", "Recettes")}</Badge> : null}
            {sections.shoppingList ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.courses", "Courses")}</Badge> : null}
            {sections.adviceSheets ? <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.conseils", "Conseils")}</Badge> : null}
          </Wrap>
          <Tooltip label={i18n.t("auto.ClientNutritionSharedSection.telecharger_le_plan_nutrition_en_pdf", "Télécharger le plan nutrition en PDF")}>
            <IconButton
              aria-label={i18n.t("auto.ClientNutritionSharedSection.telecharger_le_plan_nutrition", "Télécharger le plan nutrition")}
              icon={<DownloadIcon />}
              borderRadius="full"
              variant="outline"
              onClick={downloadPdf}
              isLoading={exportingPdf}
            />
          </Tooltip>
        </HStack>
      </HStack>

      <Box display={{ base: "block", md: "none" }} mb={4}>
        <HStack spacing={2} overflowX="auto" pb={2} pr={5} sx={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {panels.map((panel) => (
            <Button
              key={panel.key}
              size="sm"
              flexShrink={0}
              minW="max-content"
              borderRadius="full"
              variant={activePanel === panel.key ? "solid" : "outline"}
              colorScheme={activePanel === panel.key ? "blue" : "gray"}
              onClick={() => setActivePanel(panel.key)}
            >
              {panel.title}
            </Button>
          ))}
        </HStack>
        {activePanelMeta ? (
          <Box {...tileProps} p={3.5} borderRadius="20px" bg={activePanelMeta.bg} borderColor={activePanelMeta.accent}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>
              {activePanelMeta.eyebrow}
            </Text>
            <HStack justify="space-between" align="center" mt={1} gap={3}>
              <Text fontWeight="900" fontSize="xl">
                {activePanelMeta.value}
              </Text>
              <Badge borderRadius="full" px={3} py={1}>
                {activePanelMeta.title}
              </Badge>
            </HStack>
            <Text fontSize="sm" color={theme.mutedText} mt={2}>
              {activePanelMeta.helper}
            </Text>
          </Box>
        ) : null}
      </Box>

      <SimpleGrid data-tour="client-nutrition-tabs" display={{ base: "none", md: "grid" }} columns={{ md: 2, xl: 4 }} spacing={3} mb={4}>
        {panels.map((panel) => (
          <Box
            key={panel.key}
            {...tileProps}
            p={4}
            cursor="pointer"
            borderColor={activePanel === panel.key ? panel.accent : theme.borderColor}
            bg={activePanel === panel.key ? panel.bg : theme.surfaceBg}
            onClick={() => setActivePanel(panel.key)}
            transition="all 0.18s ease"
            _hover={{ transform: "translateY(-1px)", borderColor: panel.accent }}
          >
            <HStack justify="space-between" align="start" gap={3}>
              <Box>
                <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{panel.eyebrow}</Text>
                <Text mt={1} fontWeight="900" fontSize="lg">{panel.value}</Text>
              </Box>
              <Badge borderRadius="full" px={3} py={1}>
                {activePanel === panel.key ? i18n.t("auto.ClientNutritionSharedSection.ouvert", "Ouvert") : panel.title}
              </Badge>
            </HStack>
            <Text fontSize="sm" color={theme.mutedText} mt={2}>{panel.helper}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {activePanel === "summary" && sections.summary ? (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <Box {...tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.objectif", "OBJECTIF")}</Text>
            <Text mt={1} fontWeight="900" fontSize="lg">{translatedObjective || i18n.t("auto.ClientNutritionSharedSection.suivi_nutrition", "Suivi nutrition")}</Text>
            <Text fontSize="sm" color={theme.mutedText}>{translatedDiet.length ? translatedDiet.join(", ") : i18n.t("auto.ClientNutritionSharedSection.aucun_regime_specifique", "Aucun régime spécifique")}</Text>
          </Box>
          <Box {...tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.repere_jour", "REPÈRE JOUR")}</Text>
            <Text mt={1} fontWeight="900" fontSize="lg">{needs?.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : i18n.t("auto.ClientNutritionSharedSection.a_ajuster", "À ajuster")}</Text>
            <Text fontSize="sm" color={theme.mutedText}>
              P {needs?.protG?.min ? `${r0(needs.protG.min)}-${r0(needs.protG.max)} g` : "—"}{i18n.t("auto.ClientNutritionSharedSection.l", "• L")}{" "}
              {needs?.lipG?.min ? `${r0(needs.lipG.min)}-${r0(needs.lipG.max)} g` : "—"}{i18n.t("auto.ClientNutritionSharedSection.g_2", "• G")}{" "}
              {needs?.glucG?.min ? `${r0(needs.glucG.min)}-${r0(needs.glucG.max)} g` : "—"}
            </Text>
          </Box>
          <Box {...tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.points_a_respecter", "POINTS À RESPECTER")}</Text>
            <Text mt={1} fontWeight="900" fontSize="lg">{pathologies.length || diet.length || i18n.t("auto.ClientNutritionSharedSection.standard", "Standard")}</Text>
            <Text fontSize="sm" color={theme.mutedText}>{[...translatedDiet, ...translatedPathologies].slice(0, 3).join(", ") || i18n.t("auto.ClientNutritionSharedSection.aucune_contrainte_partagee", "Aucune contrainte partagée")}</Text>
          </Box>
        </SimpleGrid>
      ) : null}

      {activePanel === "summary" && patientNote ? (
        <Box {...tileProps} p={4} mt={3} borderLeftWidth="5px" borderLeftColor="#0F766E">
          <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.note_du_professionnel", "NOTE DU PROFESSIONNEL")}</Text>
          <Text mt={2} color={theme.textColor} whiteSpace="pre-wrap">
            {patientNote}
          </Text>
        </Box>
      ) : null}

      {activePanel === "foodSurvey" && sections.foodSurvey ? (
        <Stack spacing={3}>
          {foodSurveyRows.length ? (
            MENU_MEALS_ORDER.map((mealKey) =>
              foodSurveyByMeal[mealKey]?.length ? (
                <Box key={mealKey} {...tileProps} p={4}>
                  <Text fontWeight="900" mb={2}>{translateMealLabel(mealKey)}</Text>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                    {foodSurveyByMeal[mealKey].map((row, idx) => (
                      <Text key={`${mealKey}-${row.label}-${idx}`} fontSize="sm">
                        • {translateFoodLabel(row.label)} <Text as="span" color={theme.mutedText}>({r0(row.qty)} {row.unit})</Text>
                      </Text>
                    ))}
                  </SimpleGrid>
                </Box>
              ) : null
            )
          ) : (
            <Box {...tileProps} p={4}>
              <Text fontWeight="800">{i18n.t("auto.ClientNutritionSharedSection.ration_spontanee_partagee", "Ration spontanée partagée")}</Text>
              <Text color={theme.mutedText} fontSize="sm" mt={1}>{i18n.t("auto.ClientNutritionSharedSection.le_releve_est_partage_mais_aucune_ligne_detaillee_", "Le relevé est partagé, mais aucune ligne détaillée n’est disponible dans ce format.")}</Text>
            </Box>
          )}
        </Stack>
      ) : null}

      {activePanel === "ration" && sections.ration ? (
        <Stack spacing={3}>
          <Box {...tileProps} p={4}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>{i18n.t("auto.ClientNutritionSharedSection.total_jour", "TOTAL JOUR")}</Text>
                <Text mt={1} fontWeight="900" fontSize="lg">
                  {rationTotals.kcal ? `${r0(rationTotals.kcal)} kcal` : i18n.t("auto.ClientNutritionSharedSection.ration_partagee", "Ration partagée")}
                </Text>
                <Text color={theme.mutedText} fontSize="sm">
                  P {r0(rationTotals.p)}{i18n.t("auto.ClientNutritionSharedSection.g_l", "g • L")}{r0(rationTotals.f)}{i18n.t("auto.ClientNutritionSharedSection.g_g", "g • G")}{r0(rationTotals.c)}{i18n.t("auto.ClientNutritionSharedSection.g", "g")}</Text>
              </Box>
              <Badge borderRadius="full" px={3} py={1}>
                {rationLines.length}{i18n.t("auto.ClientNutritionSharedSection.ligne_s", "ligne(s) •")}{countRationMealsCovered(rationLines)}/{MENU_MEALS_ORDER.length}{i18n.t("auto.ClientNutritionSharedSection.repas", "repas")}</Badge>
            </HStack>
          </Box>
          {MENU_MEALS_ORDER.map((mealKey) =>
            rationByMeal[mealKey]?.length ? (
              <Box key={mealKey} {...tileProps} p={4}>
                <Text fontWeight="900" mb={2}>{translateMealLabel(mealKey)}</Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                  {rationByMeal[mealKey].map((row, idx) => (
                    <Text key={`${mealKey}-${row.label}-${idx}`} fontSize="sm">
                      • {row.group ? `${translateFoodLabel(row.group)} — ` : ""}{translateFoodLabel(row.label)}{" "}
                      <Text as="span" color={theme.mutedText}>({r0(row.qty)} {row.unit})</Text>
                    </Text>
                  ))}
                </SimpleGrid>
              </Box>
            ) : null
          )}
        </Stack>
      ) : null}

      {activePanel === "menu" && sections.menu ? (
        <Box>
          <HStack justify="space-between" align="center" mb={3} gap={3} flexWrap="wrap">
            <Heading size="sm">{i18n.t("auto.ClientNutritionSharedSection.journees_proposees", "Journées proposées")}</Heading>
            {menuDays.length > 1 ? (
              <HStack spacing={2}>
                <IconButton
                  aria-label={i18n.t("auto.ClientNutritionSharedSection.jour_precedent", "Jour précédent")}
                  size="sm"
                  variant="outline"
                  icon={<Text as="span">‹</Text>}
                  onClick={() => setSelectedMenuDayIndex((idx) => Math.max(0, idx - 1))}
                  isDisabled={selectedMenuDayIndex <= 0}
                />
                <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.day_progress", "Jour {{current}} / {{total}}", { current: Math.min(selectedMenuDayIndex + 1, menuDays.length), total: menuDays.length })}
                </Badge>
                <IconButton
                  aria-label={i18n.t("auto.ClientNutritionSharedSection.jour_suivant", "Jour suivant")}
                  size="sm"
                  variant="outline"
                  icon={<Text as="span">›</Text>}
                  onClick={() => setSelectedMenuDayIndex((idx) => Math.min(menuDays.length - 1, idx + 1))}
                  isDisabled={selectedMenuDayIndex >= menuDays.length - 1}
                />
              </HStack>
            ) : null}
          </HStack>

          <Stack spacing={3}>
            {selectedMenuDay ? (
              <Box key={selectedMenuDay.label} {...tileProps} p={4}>
                <HStack justify="space-between" mb={3}>
                  <Text fontWeight="900">{translateDayLabel(selectedMenuDay.label)}</Text>
                  <Badge borderRadius="full" px={3} py={1}>
                    {selectedMenuDay?.totals?.kcal ? `${r0(selectedMenuDay.totals.kcal)} kcal` : i18n.t("nav.menu", "Menu")}
                  </Badge>
                </HStack>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {(selectedMenuDay.meals || [])
                    .filter((meal) => meal.items?.length)
                    .map((meal) => (
                      <Box key={`${selectedMenuDay.label}-${meal.label}`} borderWidth="1px" borderColor={theme.borderColor} borderRadius="md" p={3}>
                        <Text fontWeight="800" mb={2}>{translateMenuMealLabel(meal)}</Text>
                        <Stack spacing={1}>
                          {meal.items.map((item, idx) => (
                            <Text key={`${nutritionItemName(item)}-${idx}`} fontSize="sm">
                              • {translateIngredientText(nutritionItemName(item))} <Text as="span" color={theme.mutedText}>({nutritionItemQty(item)})</Text>
                            </Text>
                          ))}
                        </Stack>
                      </Box>
                    ))}
                </SimpleGrid>
              </Box>
            ) : (
              <Text color={theme.mutedText}>{i18n.t("auto.ClientNutritionSharedSection.aucun_menu_partage_pour_le_moment", "Aucun menu partagé pour le moment.")}</Text>
            )}
          </Stack>
        </Box>
      ) : null}

      {activePanel === "recipes" && sections.recipes ? (
        <Stack spacing={3}>
          {recipes.length ? (
            <>
              {recipeDays.length > 1 ? (
                <HStack justify="space-between" align="center" gap={2}>
                  <Heading size="sm">{translateDayLabel(selectedRecipeDay?.label) || i18n.t("auto.ClientNutritionSharedSection.recettes", "Recettes")}</Heading>
                  <HStack spacing={2}>
                    <IconButton
                      aria-label={i18n.t("auto.ClientNutritionSharedSection.jour_precedent", "Jour précédent")}
                      size="sm"
                      variant="outline"
                      icon={<Text as="span">‹</Text>}
                      onClick={() => setSelectedRecipeDayIndex((idx) => Math.max(0, idx - 1))}
                      isDisabled={selectedRecipeDayIndex <= 0}
                    />
                    <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.ClientNutritionSharedSection.day_progress", "Jour {{current}} / {{total}}", { current: Math.min(selectedRecipeDayIndex + 1, recipeDays.length), total: recipeDays.length })}
                    </Badge>
                    <IconButton
                      aria-label={i18n.t("auto.ClientNutritionSharedSection.jour_suivant", "Jour suivant")}
                      size="sm"
                      variant="outline"
                      icon={<Text as="span">›</Text>}
                      onClick={() => setSelectedRecipeDayIndex((idx) => Math.min(recipeDays.length - 1, idx + 1))}
                      isDisabled={selectedRecipeDayIndex >= recipeDays.length - 1}
                    />
                  </HStack>
                </HStack>
              ) : null}
              {(selectedRecipeDay?.items || recipes).map((recipe, index) => (
              <Box key={`${recipe.name || recipe.title || "recette"}-${index}`} {...tileProps} p={4}>
                <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                  <Box>
                    <Heading size="sm" wordBreak="break-word">{translateRecipeText(recipe.name || recipe.title) || i18n.t("auto.ClientNutritionSharedSection.recette_value", "Recette {{index}}", { index: index + 1 })}</Heading>
                    <Text fontSize="sm" color={theme.mutedText} mt={1} wordBreak="break-word">
                      {[translateDayLabel(recipe.dayLabel), recipe.mealLabel ? translateMenuMealLabel(recipe.mealLabel) : ""].filter(Boolean).join(" • ")}
                      {recipe.dayLabel || recipe.mealLabel ? " · " : ""}
                      {i18n.t("auto.ClientNutritionSharedSection.prep_cooking_line", "Prépa {{prep}} min • Cuisson {{cook}} min", {
                        prep: recipe.preparationTimeMin || recipe.prepTimeMin || "—",
                        cook: recipe.cookingTimeMin || recipe.cookTimeMin || "—",
                      })}
                    </Text>
                  </Box>
                </HStack>
                {recipe.ingredients?.length ? (
                  <Wrap spacing={2} mt={3}>
                    {recipe.ingredients.map((ingredient, ingredientIndex) => (
                      <Badge
                        key={`${ingredient.name || ingredient}-${ingredientIndex}`}
                        borderRadius="full"
                        px={3}
                        py={1}
                        maxW="100%"
                        whiteSpace="normal"
                        wordBreak="break-word"
                        textAlign="left"
                        lineHeight="1.35"
                      >
                        {typeof ingredient === "string"
                          ? translateIngredientText(ingredient)
                          : [translateIngredientText(nutritionItemName(ingredient)), nutritionItemQty(ingredient)].filter(Boolean).join(" ")}
                      </Badge>
                    ))}
                  </Wrap>
                ) : null}
                {recipe.steps?.length ? (
                  <Stack spacing={1} mt={4}>
                    {recipe.steps.map((step, stepIndex) => (
                      <Text key={`${recipe.name || index}-step-${stepIndex}`} fontSize="sm">
                        {stepIndex + 1}. {translateRecipeText(typeof step === "string" ? step : step.text || step.description || "")}
                      </Text>
                    ))}
                  </Stack>
                ) : null}
              </Box>
              ))}
            </>
          ) : (
            <Text color={theme.mutedText}>{i18n.t("auto.ClientNutritionSharedSection.aucune_recette_partagee_pour_le_moment", "Aucune recette partagée pour le moment.")}</Text>
          )}
        </Stack>
      ) : null}

      {activePanel === "shoppingList" && sections.shoppingList ? (
        <Stack spacing={3}>
          {shoppingList.some((section) => section.items?.length) ? (
            shoppingList.map((section) =>
              section.items?.length ? (
                <Box key={section.section || section.label} {...tileProps} p={4}>
                  <Heading size="sm">{translateFoodLabel(section.label || section.section) || i18n.t("auto.ClientNutritionSharedSection.rayon", "Rayon")}</Heading>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mt={3}>
                    {section.items.map((item, itemIndex) => (
                      <Text key={`${section.section || section.label}-${itemIndex}`} fontSize="sm">
                        • {translateIngredientText(nutritionItemName(item))}
                        {nutritionItemQty(item) ? (
                          <Text as="span" color={theme.mutedText}> ({nutritionItemQty(item)} {nutritionItemUnit(item)})</Text>
                        ) : null}
                      </Text>
                    ))}
                  </SimpleGrid>
                </Box>
              ) : null
            )
          ) : (
            <Text color={theme.mutedText}>{i18n.t("auto.ClientNutritionSharedSection.aucune_liste_de_courses_partagee_pour_le_moment", "Aucune liste de courses partagée pour le moment.")}</Text>
          )}
        </Stack>
      ) : null}

      {activePanel === "adviceSheets" && sections.adviceSheets ? (
        <Stack spacing={3}>
          {adviceSheets.length ? (
            adviceSheets.map((sheet) => (
              <Box key={sheet.id} {...tileProps} p={4} borderLeftWidth="5px" borderLeftColor={sheet.accent || "#0F766E"}>
                <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                  <Box>
                    <Badge borderRadius="full" px={3} py={1} bg={`${sheet.accent || "#0F766E"}22`} color={sheet.accent || "#0F766E"}>
                      {translateAdviceField(sheet, "category", sheet.category || i18n.t("auto.ClientNutritionSharedSection.conseil", "Conseil"))}
                    </Badge>
                    <Heading size="sm" mt={3}>
                      {translateAdviceField(sheet, "title", sheet.title)}
                    </Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={2}>
                      {translateAdviceField(sheet, "summary", sheet.summary)}
                    </Text>
                  </Box>
                </HStack>

                {sheet.keyPoints?.length ? (
                  <Box mt={4}>
                    <Text fontWeight="900" mb={2}>{i18n.t("auto.ClientNutritionSharedSection.a_retenir", "À retenir")}</Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                      {translateAdviceListField(sheet, "keyPoints", sheet.keyPoints).map((point) => (
                        <Text key={point} fontSize="sm">• {point}</Text>
                      ))}
                    </SimpleGrid>
                  </Box>
                ) : null}

                {sheet.practicalTips?.length ? (
                  <Box mt={4}>
                    <Text fontWeight="900" mb={2}>{i18n.t("auto.ClientNutritionSharedSection.conseils_pratiques", "Conseils pratiques")}</Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                      {translateAdviceListField(sheet, "practicalTips", sheet.practicalTips).map((tip) => (
                        <Text key={tip} fontSize="sm">• {tip}</Text>
                      ))}
                    </SimpleGrid>
                  </Box>
                ) : null}

                {sheet.tags?.length ? (
                  <HStack mt={4} spacing={2} flexWrap="wrap">
                    {translateAdviceListField(sheet, "tags", sheet.tags).map((tag) => (
                      <Tag key={tag} size="sm" borderRadius="full">
                        <TagLabel>{tag}</TagLabel>
                      </Tag>
                    ))}
                  </HStack>
                ) : null}
              </Box>
            ))
          ) : (
            <Box {...tileProps} p={4}>
              <Text fontWeight="800">{i18n.t("auto.ClientNutritionSharedSection.aucune_fiche_conseil_partagee", "Aucune fiche conseil partagée")}</Text>
              <Text color={theme.mutedText} fontSize="sm" mt={1}>{i18n.t("auto.ClientNutritionSharedSection.le_professionnel_n_a_pas_encore_selectionne_de_fic", "Le professionnel n’a pas encore sélectionné de fiche pour ce suivi.")}</Text>
            </Box>
          )}
        </Stack>
      ) : null}
    </Box>
  );
}
