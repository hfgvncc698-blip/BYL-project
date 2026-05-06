/* eslint-disable react/prop-types */
// src/components/NutritionRationPage.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  HStack,
  Button,
  Badge,
  SimpleGrid,
  Card,
  CardBody,
  useToast,
  Spacer,
  IconButton,
  Tooltip,
  Stack,
  Wrap,
  WrapItem,
  Tag,
  TagLabel,
  Progress,
  Collapse,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";
import {
  buildNutritionContextTitle,
  computeNutritionNeeds,
  computeMicronutrientTargets,
  normalizeDietList,
  normalizePathologyList,
} from "../utils/nutritionContext";
import {
  MENU_MEAL_LABEL,
  MENU_MEALS_ORDER,
  countRationMealsCovered,
  extractRationLines as extractMenuRationLines,
  normalizeMenuMealKey,
} from "../utils/rationMenu";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { generateValidatedAiNutritionPlan } from "../utils/nutritionAiService";
import { getClientNutritionFeedbackHistory } from "../utils/nutritionFeedbackService";

import RationManualEditor from "./RationManualEditor.jsx";
import RationAutoGenerator from "./RationAutoGenerator.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";

import { DownloadIcon } from "@chakra-ui/icons";

/* ✅ PDF (React-PDF) */
import {
  pdf,
  Document,
  Page,
  View,
  Text as PdfText,
  Image as PdfImage,
  StyleSheet,
} from "@react-pdf/renderer";

/* ================= Utils ================= */
const num = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const r0 = (v) => Math.round(num(v));
const r1 = (v) => Math.round(num(v) * 10) / 10;
const clampPercent = (value) => Math.max(0, Math.min(100, num(value)));
const normalize = (s = "") =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

const cleanLabel = (s) =>
  String(s || "")
    .replace(/\(\s*aliment\s*[^)]*\)/gi, "")
    .replace(/\(\s*moyen\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

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
  }
  return "";
};

const MICRO_PDF_LABELS = {
  calcium: "Calcium",
  fer: "Fer",
  sodium: "Sodium",
  fibres: "Fibres",
  fibre: "Fibres",
  vitA: "Vitamine A",
  vita: "Vitamine A",
  vitB1: "Vitamine B1",
  vitb1: "Vitamine B1",
  vitB2: "Vitamine B2",
  vitb2: "Vitamine B2",
  vitB6: "Vitamine B6",
  vitb6: "Vitamine B6",
  vitB9: "Vitamine B9",
  vitb9: "Vitamine B9",
  vitB12: "Vitamine B12",
  vitb12: "Vitamine B12",
  vitC: "Vitamine C",
  vitc: "Vitamine C",
  vitD: "Vitamine D",
  vitd: "Vitamine D",
  vitE: "Vitamine E",
  vite: "Vitamine E",
  vitK: "Vitamine K",
  vitk: "Vitamine K",
  magnesium: "Magnésium",
  potassium: "Potassium",
  lactose: "Lactose",
  cholesterol: "Cholestérol",
};

const microLabelForPdf = (key = "") => {
  const raw = String(key || "").trim();
  const compact = raw.replace(/[^a-zA-Z0-9]/g, "");
  const normalized = normalize(raw);
  if (MICRO_PDF_LABELS[raw]) return MICRO_PDF_LABELS[raw];
  if (MICRO_PDF_LABELS[compact]) return MICRO_PDF_LABELS[compact];
  if (normalized.includes("calcium")) return "Calcium";
  if (normalized.includes("fibres") || normalized.includes("fibre")) return "Fibres";
  if (normalized.includes("sodium") || normalized.includes("sel")) return "Sodium";
  if (normalized.includes("potassium")) return "Potassium";
  if (normalized.includes("magnesium")) return "Magnésium";
  if (normalized.includes("fer") || normalized.includes("iron")) return "Fer";
  if (normalized.includes("vitamine c") || normalized.includes("ascorb")) return "Vitamine C";
  if (normalized.includes("vitamine d")) return "Vitamine D";
  if (normalized.includes("vitamine b12")) return "Vitamine B12";
  if (normalized.includes("vitamine b9") || normalized.includes("folate")) return "Vitamine B9";
  if (normalized.includes("lactose")) return "Lactose";
  if (normalized.includes("cholesterol")) return "Cholestérol";
  return raw
    .replace(/_/g, " ")
    .replace(/\bMG\b/g, "mg")
    .replace(/\bG\b/g, "g")
    .replace(/\s+/g, " ")
    .trim();
};

const isEnergyLikeMicroKey = (key = "") => {
  const normalized = normalize(String(key || "").replace(/_/g, " "));
  return normalized.includes("energie") || normalized.includes("kcal") || normalized.includes("kj") || normalized.includes("facteur");
};

const microTargetKeyFromAnyKey = (key = "") => {
  const normalized = normalize(String(key || "").replace(/_/g, " "));
  if (!normalized) return "";
  if (normalized.includes("calcium")) return "calcium";
  if ((normalized.includes("fibres") || normalized.includes("fibre")) && !isEnergyLikeMicroKey(key)) return "fibres";
  if (normalized.includes("sodium") || normalized.includes("sel")) return "sodium";
  if (normalized.includes("potassium")) return "potassium";
  if (normalized.includes("magnesium")) return "magnesium";
  if (normalized.includes("fer") || normalized.includes("iron")) return "fer";
  if (normalized.includes("vitamine a")) return "vitA";
  if (normalized.includes("vitamine b1")) return "vitB1";
  if (normalized.includes("vitamine b2")) return "vitB2";
  if (normalized.includes("vitamine b6")) return "vitB6";
  if (normalized.includes("vitamine b9") || normalized.includes("folate")) return "vitB9";
  if (normalized.includes("vitamine b12")) return "vitB12";
  if (normalized.includes("vitamine c") || normalized.includes("ascorb")) return "vitC";
  if (normalized.includes("vitamine d")) return "vitD";
  if (normalized.includes("vitamine e")) return "vitE";
  if (normalized.includes("vitamine k")) return "vitK";
  if (normalized.includes("lactose")) return "lactose";
  if (normalized.includes("cholesterol")) return "cholesterol";
  return "";
};

const selectedMicroKeysFromRaw = (raw) => {
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return Object.entries(raw || {})
    .filter(([, isSelected]) => !!isSelected)
    .map(([key]) => key);
};

const formatMicroSummaryValue = (value, unit = "") => {
  if (!Number.isFinite(num(value))) return "—";
  return unit === "g" ? r1(value) : r0(value);
};

const calcAgeFromDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
};

const samePayload = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const cleanForFirestore = (value) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(cleanForFirestore);
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, entry]) => {
      acc[key] = cleanForFirestore(entry);
      return acc;
    }, {});
  }
  return value;
};

/* ========================= PDF helpers (logo as dataURL) ========================= */
const LEGACY_BYL_LOCAL = "/logo-byl.png";

async function toDataUrlSafe(url) {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
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

/* ========================= Ration parsing helpers ========================= */
const normKey = (k) => normalize(k).replace(/[^a-z0-9_]+/g, "_");

const normalizeMealKey = (k) => {
  const nk = normKey(k);

  const canonical = normalizeMenuMealKey(nk);
  if (canonical === "petit_dej") return "petit_dejeuner";
  if (canonical === "dejeuner") return "dejeuner";
  if (canonical === "diner") return "diner";
  if (canonical === "collation_1") return "collation_1";
  if (canonical === "collation_2") return "collation_2";
  if (canonical === "collation_3") return "collation_3";

  if (nk.includes("petit") || nk.includes("breakfast") || nk === "petit_dej") return "petit_dejeuner";
  if (nk.includes("dejeun") || nk === "dej" || nk.includes("lunch")) return "dejeuner";
  if (nk.includes("din") || nk.includes("dinner")) return "diner";

  // collation / snack + numéro
  if (nk.includes("collation") || nk.includes("snack")) {
    const m = nk.match(/(collation|snack)_?(\d+)/);
    if (m?.[2]) return `collation_${m[2]}`;
    if (nk.includes("1")) return "collation_1";
    if (nk.includes("2")) return "collation_2";
    if (nk.includes("3")) return "collation_3";
    return "collation";
  }

  return nk || "repas";
};

const mealLabelFromKey = (mk) => {
  const k = normalizeMealKey(mk);
  if (k === "petit_dejeuner") return "Petit-déjeuner";
  if (k === "dejeuner") return "Déjeuner";
  if (k === "diner") return "Dîner";
  if (k === "collation") return "Collation";
  if (k === "collation_1") return MENU_MEAL_LABEL.collation_1 || "Collation matin";
  if (k === "collation_2") return MENU_MEAL_LABEL.collation_2 || "Collation après-midi";
  if (k === "collation_3") return MENU_MEAL_LABEL.collation_3 || "Collation soir";
  return "Repas";
};

const looksLikeMealKey = (k) => {
  const nk = normKey(k);
  return (
    nk.includes("petit") ||
    nk.includes("breakfast") ||
    nk.includes("petit_dej") ||
    nk.includes("dejeun") ||
    nk === "dej" ||
    nk.includes("lunch") ||
    nk.includes("din") ||
    nk.includes("dinner") ||
    nk.includes("collation") ||
    nk.includes("snack")
  );
};

/**
 * Extraction robuste des aliments:
 * retourne [{mealKey, mealLabel, category, label, qty, unit}]
 */
function extractRationItems(state) {
  const items = [];
  if (!state) return items;

  const push = ({ mealKey, category, label, qty, unit }) => {
    const q = num(qty);
    if (!(q > 0)) return;
    const mk = normalizeMealKey(mealKey || "");
    items.push({
      mealKey: mk,
      mealLabel: mealLabelFromKey(mk),
      category: cleanLabel(String(category || "Autre")),
      label: cleanLabel(String(label || "")),
      qty: q,
      unit: String(unit || ""),
    });
  };

  // 1) state.items
  if (Array.isArray(state.items)) {
    state.items.forEach((it) => {
      push({
        mealKey: it.mealKey || it.meal || it.repas,
        category: it.category || it.categorie || it.group || it.groupe,
        label: it.label || it.name || it.nom || it.food,
        qty: it.qty ?? it.quantity ?? it.qte ?? it.valeur,
        unit: it.unit || it.unite,
      });
    });
    return items;
  }

  // 2) state.foods[]
  if (Array.isArray(state.foods)) {
    state.foods.forEach((f) => {
      const label = f.label || f.nom || f.name || f.food || "";
      const category = f.category || f.categorie || f.group || "Autre";
      const perMeal = f.perMeal || f.byMeal || f.meals || f.repas || f.values || null;
      if (perMeal && typeof perMeal === "object") {
        Object.entries(perMeal).forEach(([mealKey, v]) => {
          if (v && typeof v === "object") {
            push({
              mealKey,
              category,
              label,
              qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
              unit: v.unit || v.unite || f.unit || f.unite,
            });
          } else {
            push({ mealKey, category, label, qty: v, unit: f.unit || f.unite });
          }
        });
      }
    });
    return items;
  }

  // 3) state.grid
  if (state.grid && typeof state.grid === "object") {
    Object.values(state.grid).forEach((row) => {
      const label = row.label || row.nom || row.name || "";
      const category = row.category || row.categorie || "Autre";
      const defaultUnit = row.defaultUnit || row.unit || row.unite || "";
      const values = row.values || row.meals || row.perMeal || row.byMeal || null;

      if (values && typeof values === "object") {
        Object.entries(values).forEach(([mealKey, v]) => {
          if (v && typeof v === "object") {
            push({
              mealKey,
              category,
              label,
              qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
              unit: v.unit || v.unite || defaultUnit,
            });
          } else {
            push({ mealKey, category, label, qty: v, unit: defaultUnit });
          }
        });
      } else {
        Object.entries(row).forEach(([k, v]) => {
          if (!looksLikeMealKey(k)) return;
          if (v && typeof v === "object") {
            push({
              mealKey: k,
              category,
              label,
              qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
              unit: v.unit || v.unite || defaultUnit,
            });
          } else {
            push({ mealKey: k, category, label, qty: v, unit: defaultUnit });
          }
        });
      }
    });
    return items;
  }

  // 4) state.rows
  if (Array.isArray(state.rows)) {
    state.rows.forEach((row) => {
      const label = row.label || row.nom || row.name || "";
      const category = row.category || row.categorie || "Autre";
      const defaultUnit = row.defaultUnit || row.unit || row.unite || "";

      Object.entries(row).forEach(([k, v]) => {
        if (!looksLikeMealKey(k)) return;
        if (v && typeof v === "object") {
          push({
            mealKey: k,
            category,
            label,
            qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
            unit: v.unit || v.unite || defaultUnit,
          });
        } else {
          push({ mealKey: k, category, label, qty: v, unit: defaultUnit });
        }
      });
    });
    return items;
  }

  // 5) format “catégories” : state[category] = array d’aliments
  if (typeof state === "object") {
    Object.entries(state).forEach(([catName, node]) => {
      const nk = normKey(catName);
      if (nk === "computed" || nk === "totals" || nk === "micros" || nk === "drinks") return;

      if (Array.isArray(node)) {
        node.forEach((row) => {
          if (!row || typeof row !== "object") return;
          const label = row.label || row.nom || row.name || row.food || row.aliment || "";
          const defaultUnit = row.defaultUnit || row.unit || row.unite || "";
          if (!label) return;

          Object.entries(row).forEach(([k, v]) => {
            if (!looksLikeMealKey(k)) return;
            if (v && typeof v === "object") {
              push({
                mealKey: k,
                category: catName,
                label,
                qty: v.qty ?? v.qte ?? v.value ?? v.valeur ?? v,
                unit: v.unit || v.unite || defaultUnit,
              });
            } else {
              push({ mealKey: k, category: catName, label, qty: v, unit: defaultUnit });
            }
          });
        });
      }
    });
  }

  return items;
}

const hasAnyRationItems = (state) => {
  try {
    return extractRationItems(state).length > 0;
  } catch {
    return false;
  }
};

/* ========================= React-PDF Document ========================= */
const pdfStyles = StyleSheet.create({
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
  clientName: { fontSize: 11, fontWeight: 700, textAlign: "right" },

  headerCenter: { flex: 1, alignItems: "center" },
  brand: { fontSize: 12, fontWeight: 700, color: "#1F5EFF" },
  title: { fontSize: 18, fontWeight: 700, textAlign: "center", color: "#111827" },
  subtitle: { fontSize: 11, opacity: 0.75, marginTop: 4, textAlign: "center" },

  headerRight: { width: 170, alignItems: "flex-end" },
  date: { fontSize: 10, opacity: 0.6 },

  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 10 },
  summaryCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 12, marginBottom: 14 },
  summaryGrid: { flexDirection: "row", flexWrap: "wrap", marginLeft: -4, marginRight: -4 },
  summaryTile: { width: "48%", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 8, margin: 4 },
  tileLabel: { fontSize: 8, color: "#6B7280", textTransform: "uppercase", marginBottom: 3, fontWeight: 700 },
  tileValue: { fontSize: 10, fontWeight: 700, color: "#111827" },
  mealCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 12, marginBottom: 12 },
  mealHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  mealTitle: { fontSize: 13, fontWeight: 700, color: "#111827" },
  mealPill: { backgroundColor: "#F3F4F6", color: "#111827", borderRadius: 999, paddingTop: 3, paddingBottom: 3, paddingLeft: 8, paddingRight: 8, fontSize: 9, fontWeight: 700 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", marginLeft: -4, marginRight: -4 },
  categoryCard: { width: "48%", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 8, margin: 4 },
  categoryTitle: { fontSize: 8, fontWeight: 700, color: "#111827", textTransform: "uppercase", marginBottom: 5 },
  line: { fontSize: 9, marginBottom: 3, lineHeight: 1.25 },
  qtyText: { color: "#64748B" },

  empty: { fontSize: 11, opacity: 0.7, marginTop: 6 },

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

function RationPdfDoc({
  clientName,
  coachName,
  title,
  subtitle,
  logoDataUrl,
  footerText,
  date,
  groupedForPdf,
  needs,
  diet,
  pathologies,
  dayTotals,
  macroPct,
  selectedMicros,
}) {
  const dateStr = date?.toLocaleDateString ? date.toLocaleDateString("fr-FR") : "";
  const hasAny = Array.isArray(groupedForPdf) && groupedForPdf.length > 0;
  const observedKcal = num(dayTotals?.kcal);
  const macroLine =
    observedKcal > 0
      ? `P ${r0(dayTotals?.prot)} g (${r0(macroPct?.prot)}%) • L ${r0(dayTotals?.lip)} g (${r0(macroPct?.lip)}%) • G ${r0(dayTotals?.glu)} g (${r0(macroPct?.glu)}%)`
      : "À compléter";
  const rangeLine = `Cibles: P ${
    needs?.protG?.min ? `${r0(needs.protG.min)}-${r0(needs.protG.max)} g` : "—"
  } • L ${needs?.lipG?.min ? `${r0(needs.lipG.min)}-${r0(needs.lipG.max)} g` : "—"} • G ${
    needs?.glucG?.min ? `${r0(needs.glucG.min)}-${r0(needs.glucG.max)} g` : "—"
  }`;

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header} fixed>
          <View style={pdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={pdfStyles.logo} /> : null}
            <PdfText style={pdfStyles.coachName}>{coachName || "Coach"}</PdfText>
          </View>

          <View style={pdfStyles.headerCenter}>
            <PdfText style={pdfStyles.title}>{title || "Ration alimentaire"}</PdfText>
            {subtitle ? <PdfText style={pdfStyles.subtitle}>{subtitle}</PdfText> : null}
          </View>

          <View style={pdfStyles.headerRight}>
            <PdfText style={pdfStyles.clientName}>{clientName || "Patient"}</PdfText>
            <PdfText style={pdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        <View style={pdfStyles.summaryCard} wrap={false}>
          <PdfText style={pdfStyles.sectionTitle}>Repères du jour</PdfText>
          <View style={pdfStyles.summaryGrid}>
            <View style={pdfStyles.summaryTile}>
              <PdfText style={pdfStyles.tileLabel}>Journée</PdfText>
              <PdfText style={pdfStyles.tileValue}>
                {observedKcal > 0 ? r0(observedKcal) : "—"} kcal • cible {needs?.kcalTarget ? r0(needs.kcalTarget) : "—"} kcal
              </PdfText>
            </View>
            <View style={pdfStyles.summaryTile}>
              <PdfText style={pdfStyles.tileLabel}>Macros ration</PdfText>
              <PdfText style={pdfStyles.tileValue}>{macroLine}</PdfText>
              <PdfText style={[pdfStyles.tileValue, { fontSize: 8, color: "#64748B", marginTop: 3 }]}>{rangeLine}</PdfText>
            </View>
            <View style={pdfStyles.summaryTile}>
              <PdfText style={pdfStyles.tileLabel}>Contexte</PdfText>
              <PdfText style={pdfStyles.tileValue}>
                {[diet?.length ? diet.join(", ") : "", pathologies?.length ? pathologies.join(", ") : ""].filter(Boolean).join(" • ") || "—"}
              </PdfText>
            </View>
            <View style={pdfStyles.summaryTile}>
              <PdfText style={pdfStyles.tileLabel}>Micros suivis</PdfText>
              <PdfText style={pdfStyles.tileValue}>
                {selectedMicros?.length ? selectedMicros.slice(0, 8).join(" • ") : "Calcium • Fibres"}
              </PdfText>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14 }}>
          <PdfText style={pdfStyles.sectionTitle}>Ration par repas</PdfText>

          {!hasAny ? (
            <PdfText style={pdfStyles.empty}>
              Aucun aliment renseigné (quantité à 0 sur tous les repas).
            </PdfText>
          ) : (
            groupedForPdf.map((meal, i) => (
              <View key={`meal_${i}`} style={pdfStyles.mealCard} wrap={false}>
                <View style={pdfStyles.mealHeader}>
                  <PdfText style={pdfStyles.mealTitle}>{meal.mealLabel}</PdfText>
                  <PdfText style={pdfStyles.mealPill}>
                    {`Kcal ${r0(meal?.totals?.kcal)} • Prot ${r0(meal?.totals?.prot)} g • Lipides ${r0(
                      meal?.totals?.lip
                    )} g • Glucides ${r0(meal?.totals?.glu)} g`}
                  </PdfText>
                </View>
                <View style={pdfStyles.categoryGrid}>
                  {meal.categories.map((c, j) => (
                    <View key={`cat_${i}_${j}`} style={pdfStyles.categoryCard}>
                      <PdfText style={pdfStyles.categoryTitle}>{c.category}</PdfText>
                      {c.items.map((it, k) => (
                        <PdfText key={`it_${i}_${j}_${k}`} style={pdfStyles.line}>
                          • {cleanLabel(it.label)} <PdfText style={pdfStyles.qtyText}>({r0(it.qty)} {it.unit || ""})</PdfText>
                        </PdfText>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>

        <View style={pdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={pdfStyles.footerLogo} /> : null}
          <PdfText style={pdfStyles.footerText}>
            Généré avec {footerText || "BoostYourLife.coach"}
          </PdfText>
        </View>
      </Page>
    </Document>
  );
}

/* ===================== Component ===================== */
export default function NutritionRationPage() {
  const { clientId, assessmentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const authCtx = useAuth?.() || {};
  const user = authCtx.user || authCtx.userData || null;
  const effectiveRole = authCtx.effectiveRole || user?.effectiveRole || null;

  const isAdmin = useMemo(() => {
    const role = user?.role || user?.userRole || effectiveRole || "";
    return role === "admin";
  }, [user, effectiveRole]);

  const assessmentRef = useMemo(() => {
    if (!clientId || !assessmentId) return null;
    return doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
  }, [clientId, assessmentId]);
  const [loading, setLoading] = useState(true);
  const [docData, setDocData] = useState(null);

  const [mode, setMode] = useState("pro"); // "pro" | "auto"
  const [proState, setProState] = useState(null);
  const [autoState, setAutoState] = useState(null);

  const [savingNext, setSavingNext] = useState(false);
  const [showSummaryMicros, setShowSummaryMicros] = useState(false);
  const childStateTimersRef = useRef({ pro: null, auto: null });
  const modeTouchedUntilRef = useRef(0);

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBg;
  const pageBg = nutritionTheme.pageBg;
  const softBg = nutritionTheme.surfaceSoft;
  const accentBg = nutritionTheme.surfaceGlow;
  const borderCol = nutritionTheme.borderColor;
  const textMuted = nutritionTheme.mutedText;

  // client name for PDF
  const [clientName, setClientName] = useState("");
  useEffect(() => {
    (async () => {
      if (!clientId) return;
      try {
        const snap = await getDoc(doc(db, "clients", clientId));
        if (snap.exists()) {
          const d = snap.data() || {};
          const first = (d.prenom || "").trim();
          const last = (d.nom || "").trim();
          setClientName([first, last].filter(Boolean).join(" "));
        }
      } catch {
        // ignore
      }
    })();
  }, [clientId]);

  const pickBestAutoState = useCallback((d) => {
    const a1 = d?.ration?.auto ?? null;      // parfois "computed only"
    const a2 = d?.rationAuto ?? null;       // souvent la vraie grille (d’après tes screens)
    const a3 = d?.ration_auto ?? null;      // fallback

    const candidates = [a1, a2, a3].filter(Boolean);
    for (const c of candidates) {
      if (hasAnyRationItems(c)) return c;
    }

    // merge computed + a2 si utile
    const computedFromA1 = a1?.computed ?? null;
    if (a2 && computedFromA1 && typeof a2 === "object") return { ...a2, computed: computedFromA1 };

    return candidates[0] || null;
  }, []);

  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        const explicitMode =
          d?.ration?.mode === "auto" || d?.ration?.mode === "pro"
            ? d.ration.mode
            : d?.ration?.selectedType === "auto" || d?.ration?.selectedType === "pro"
            ? d.ration.selectedType
            : "";
        const modeFromDoc = explicitMode || (d?.rationAuto ? "auto" : "pro");

        if (Date.now() > modeTouchedUntilRef.current) setMode(modeFromDoc);
        setProState(d?.ration?.pro ?? d?.rationPro ?? null);
        setAutoState(pickBestAutoState(d));

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [assessmentRef, pickBestAutoState]);

  useEffect(
    () => () => {
      const timers = childStateTimersRef.current || {};
      Object.values(timers).forEach((timer) => {
        if (timer) window.clearTimeout(timer);
      });
    },
    []
  );

  const isValidated = useMemo(() => {
    if (typeof docData?.validated === "boolean") return docData.validated;
    if (typeof docData?.inputs?.nutritionValidated === "boolean") return docData.inputs.nutritionValidated;
    if (typeof docData?.status === "string") return docData.status !== "draft";
    return true;
  }, [docData]);

  const blocked = !isValidated;

  const inputs = useMemo(() => docData?.inputs || {}, [docData]);
  const computed = useMemo(() => docData?.computed || {}, [docData]);

  const needs = useMemo(
    () => computeNutritionNeeds({ inputs, computed, objectiveRaw: inputs?.objectif || inputs?.objective || "" }),
    [computed, inputs]
  );
  const objectiveRaw = useMemo(() => String(needs?.objectiveRaw || "").trim(), [needs?.objectiveRaw]);
  const microTargets = useMemo(
    () => computeMicronutrientTargets({ inputs, objectiveRaw }),
    [inputs, objectiveRaw]
  );
  const diet = useMemo(() => normalizeDietList(inputs), [inputs]);
  const pathologies = useMemo(() => normalizePathologyList(inputs), [inputs]);
  const activeDiet = useMemo(
    () => diet.filter((item) => String(item || "").toLowerCase() !== "normal"),
    [diet]
  );
  const summaryAge = useMemo(
    () =>
      calcAgeFromDate(
        inputs?.dateNaissance || inputs?.date_naissance || inputs?.birthdate || inputs?.dob
      ),
    [inputs]
  );

  const kcalIndicatif = useMemo(() => {
    const v =
      num(needs?.kcalTarget) ||
      num(computed?.kcalTarget) ||
      num(computed?.kcal_target) ||
      num(computed?.dej) ||
      num(computed?.DEJ) ||
      0;
    return v > 0 ? v : 0;
  }, [needs, computed]);

  const goBack = useCallback(() => {
    const path = `/clients/${clientId}/nutrition/${assessmentId}/food-survey`;
    navigate(path);
    window.setTimeout(() => {
      if (decodeURI(window.location.pathname) !== path) window.location.assign(path);
    }, 180);
  }, [assessmentId, clientId, navigate]);

  const queueChildState = useCallback((kind, next) => {
    const timers = childStateTimersRef.current;
    if (timers[kind]) window.clearTimeout(timers[kind]);
    timers[kind] = window.setTimeout(() => {
      if (kind === "pro") {
        setProState((prev) => (samePayload(prev, next) ? prev : next));
      } else {
        setAutoState((prev) => (samePayload(prev, next) ? prev : next));
      }
      timers[kind] = null;
    }, 120);
  }, []);

  const buildRationPayload = useCallback(() => {
    const selectedType = mode === "auto" ? "auto" : "pro";
    const safeProState = cleanForFirestore(proState ?? null);
    const safeAutoState = cleanForFirestore(autoState ?? null);
    const selected = selectedType === "auto" ? safeAutoState : safeProState;

    const payload = {
      "ration.mode": mode,
      "ration.pro": safeProState,
      "ration.auto": safeAutoState,
      "ration.selectedType": selectedType,
      "ration.selected": selected,
      "ration.selectedAt": serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Optionnel: si ton app lit encore rationAuto ailleurs
    if (selectedType === "auto" && safeAutoState) payload.rationAuto = safeAutoState;

    return payload;
  }, [mode, proState, autoState]);

  const changeMode = useCallback(
    (nextMode) => {
      const cleanMode = nextMode === "auto" ? "auto" : "pro";
      modeTouchedUntilRef.current = Date.now() + 8000;
      setMode(cleanMode);
      if (!assessmentRef || blocked) return;
      updateDoc(assessmentRef, {
        "ration.mode": cleanMode,
        "ration.selectedType": cleanMode === "auto" ? "auto" : "pro",
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("Ration mode save failed:", e);
      });
    },
    [assessmentRef, blocked]
  );

  const rationAutosaveHashRef = useRef("");

  useEffect(() => {
    if (!assessmentRef || blocked || !docData) return undefined;
    const payload = buildRationPayload();
    const hash = JSON.stringify(cleanForFirestore({ mode, proState, autoState }));
    if (rationAutosaveHashRef.current === hash) return undefined;

    const timer = window.setTimeout(() => {
      rationAutosaveHashRef.current = hash;
      updateDoc(assessmentRef, payload).catch((e) => {
        console.error("Ration autosave failed:", e);
        rationAutosaveHashRef.current = "";
      });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [assessmentRef, autoState, blocked, buildRationPayload, docData, mode, proState]);

  const runNutritionAiOptimization = useCallback(async () => {
    if (!assessmentRef || blocked || !docData) return;
    const selectedType = mode === "auto" ? "auto" : "pro";
    const assessmentForAi = {
      ...docData,
      inputs,
      computed,
      ration: {
        ...(docData?.ration || {}),
        mode,
        selectedType,
        pro: proState,
        auto: autoState,
        selected: selectedType === "auto" ? autoState : proState,
      },
    };
    const feedbackHistory = await getClientNutritionFeedbackHistory(clientId, 30);
    const result = await generateValidatedAiNutritionPlan(
      { assessment: assessmentForAi, inputs, computed },
      feedbackHistory
    );
    await updateDoc(assessmentRef, {
      nutritionAi: cleanForFirestore({
        status: result.source,
        finalPlan: result.finalPlan,
        aiPlan: result.aiPlan,
        validation: result.validation,
        coachAlerts: result.coachAlerts,
        updatedAt: new Date().toISOString(),
      }),
      updatedAt: serverTimestamp(),
    });
  }, [assessmentRef, autoState, blocked, clientId, computed, docData, inputs, mode, proState]);

  const onSaveAndNext = useCallback(async () => {
    if (!assessmentRef || blocked) return;
    setSavingNext(true);
    try {
      updateDoc(assessmentRef, buildRationPayload()).catch((e) => {
        console.error("Ration save before next failed:", e);
        notify(toast, "saveError", {
          title: "Sauvegarde en arrière-plan impossible",
          description: e?.message || "Sauvegarde impossible",
        });
      });
      runNutritionAiOptimization().catch((e) => {
        console.error("Nutrition AI optimization failed:", e);
      });
      notify(toast, "rationSaved");
      navigate(`/clients/${clientId}/nutrition/${assessmentId}/menu`);
    } catch (e) {
      notify(toast, "saveError", {
        title: "Sauvegarde impossible",
        description: e?.message || "Sauvegarde impossible",
      });
    } finally {
      setSavingNext(false);
    }
  }, [assessmentRef, blocked, buildRationPayload, toast, navigate, clientId, assessmentId, runNutritionAiOptimization]);

  /* ========================= Selected ration + grouping ========================= */
  const selectedRation = useMemo(() => (mode === "auto" ? autoState : proState), [mode, autoState, proState]);

  const rationTitle = useMemo(() => {
    const t = selectedRation?.title || selectedRation?.titre || docData?.ration?.title || docData?.ration?.titre || "";
    if (String(t || "").trim()) return String(t || "").trim();
    return buildNutritionContextTitle({
      baseLabel: "Ration",
      objectiveRaw,
      diets: activeDiet,
      pathologies,
      allergies: inputs?.medical?.allergies || inputs?.allergies || "",
    });
  }, [selectedRation, docData, objectiveRaw, activeDiet, pathologies, inputs?.medical?.allergies, inputs?.allergies]);

  const rationSubtitle = useMemo(() => {
    const s =
      selectedRation?.subtitle ||
      selectedRation?.sous_titre ||
      selectedRation?.objectifLabel ||
      objectiveRaw ||
      "";
    return String(s || "").trim();
  }, [selectedRation, objectiveRaw]);

  const rationItems = useMemo(() => extractRationItems(selectedRation), [selectedRation]);
  const menuRationItems = useMemo(() => extractMenuRationLines(docData), [docData]);
  const pdfRationItems = useMemo(() => {
    const fallbackItems = (menuRationItems || []).flatMap((item) =>
      Object.entries(item?.meals || {})
        .filter(([, qty]) => num(qty) > 0)
        .map(([mealKey, qty]) => ({
          mealKey: normalizeMealKey(mealKey),
          mealLabel: mealLabelFromKey(mealKey),
          category: item?.group || item?.category || "Ration",
          label: item?.resolvedLabel || item?.label || item?.key || "Aliment",
          qty,
          unit: item?.unit || "g",
        }))
    );
    const merged = [...fallbackItems];
    const seen = new Set(
      fallbackItems.map((item) =>
        [
          normalizeMealKey(item.mealKey),
          String(item.category || "").trim().toLowerCase(),
          String(item.label || "").trim().toLowerCase(),
          r0(item.qty),
          String(item.unit || "").trim().toLowerCase(),
        ].join("|")
      )
    );

    rationItems.forEach((item) => {
      const signature = [
        normalizeMealKey(item.mealKey),
        String(item.category || "").trim().toLowerCase(),
        String(item.label || "").trim().toLowerCase(),
        r0(item.qty),
        String(item.unit || "").trim().toLowerCase(),
      ].join("|");
      if (!seen.has(signature)) {
        seen.add(signature);
        merged.push(item);
      }
    });

    return merged;
  }, [menuRationItems, rationItems]);
  const readableRationLineCount = menuRationItems.length || rationItems.length;
  const readableMealCount = useMemo(
    () =>
      menuRationItems.length
        ? countRationMealsCovered(menuRationItems)
        : new Set(rationItems.map((item) => item.mealKey).filter(Boolean)).size,
    [menuRationItems, rationItems]
  );
  const rationDayTotals = useMemo(() => {
    const day =
      selectedRation?.computed?.totals?.day ||
      selectedRation?.computed?.day ||
      docData?.ration?.selected?.computed?.totals?.day ||
      docData?.ration?.selected?.computed?.day ||
      null;
    return {
      kcal: num(day?.kcal),
      prot: num(day?.prot || day?.p),
      lip: num(day?.lip || day?.f),
      glu: num(day?.glu || day?.c || day?.carbs),
    };
  }, [docData, selectedRation]);
  const rationMacroPct = useMemo(() => {
    const p = rationDayTotals.prot * 4;
    const l = rationDayTotals.lip * 9;
    const g = rationDayTotals.glu * 4;
    const total = p + l + g;
    if (!(total > 0)) return { prot: 0, lip: 0, glu: 0 };
    return { prot: (p / total) * 100, lip: (l / total) * 100, glu: (g / total) * 100 };
  }, [rationDayTotals]);
  const rationPdfMicros = useMemo(() => {
    const raw =
      selectedRation?.selectedMicros ||
      selectedRation?.selectedNutrients ||
      docData?.ration?.selected?.selectedMicros ||
      docData?.ration?.selected?.selectedNutrients ||
      {};
    const labels = selectedMicroKeysFromRaw(raw)
      .map((key) => microLabelForPdf(key))
      .filter(Boolean);
    return Array.from(new Set(labels));
  }, [docData, selectedRation]);
  const rationMicroSummary = useMemo(() => {
    const raw =
      selectedRation?.selectedMicros ||
      selectedRation?.selectedNutrients ||
      docData?.ration?.selected?.selectedMicros ||
      docData?.ration?.selected?.selectedNutrients ||
      {};
    const totals =
      selectedRation?.computed?.micros ||
      selectedRation?.computed?.totals?.micros ||
      selectedRation?.computed?.totals?.day?.micros ||
      docData?.ration?.selected?.computed?.micros ||
      docData?.ration?.selected?.computed?.totals?.micros ||
      docData?.ration?.selected?.computed?.totals?.day?.micros ||
      {};

    return selectedMicroKeysFromRaw(raw)
      .map((key) => {
        const targetKey = microTargetKeyFromAnyKey(key);
        const target = microTargets?.[targetKey];
        if (!target) return null;
        const value = num(totals?.[key] ?? totals?.[targetKey]);
        const percent = target.value > 0 ? (value / target.value) * 100 : 0;
        return {
          key,
          label: target.label || microLabelForPdf(key),
          value,
          target: target.value,
          unit: target.unit || "",
          percent,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [docData, microTargets, selectedRation]);
  const compareRangeStatus = (value, range) => {
    if (!(num(range?.min) > 0) || !(num(range?.max) > 0)) return "na";
    if (num(value) < num(range.min)) return "low";
    if (num(value) > num(range.max)) return "high";
    return "ok";
  };
  const compareTargetStatus = (value, target) => {
    const goal = num(target);
    if (!(goal > 0)) return "na";
    const delta = num(value) - goal;
    if (Math.abs(delta) <= Math.max(80, goal * 0.04)) return "ok";
    return delta > 0 ? "high" : "low";
  };
  const statusColorScheme = (status) =>
    status === "ok" ? "green" : status === "high" ? "red" : status === "low" ? "orange" : "gray";
  const statusLabel = (status) =>
    status === "ok" ? "Dans la cible" : status === "high" ? "Au-dessus" : status === "low" ? "Sous la cible" : "Sans cible";
  const rangeProgress = (value, range) => {
    const max = num(range?.max);
    if (!(max > 0)) return 0;
    return (num(value) / max) * 100;
  };
  const macroTargetText = (gramRange, pctMin, pctMax) => {
    const gramText =
      num(gramRange?.min) > 0 && num(gramRange?.max) > 0
        ? `${r0(gramRange.min)}-${r0(gramRange.max)} g`
        : "";
    const pctText = num(pctMin) > 0 && num(pctMax) > 0 ? `${r0(pctMin)}-${r0(pctMax)}%` : "";
    const parts = [gramText, pctText].filter(Boolean);
    return parts.length ? `cible ${parts.join(" • ")}` : "cible à compléter";
  };
  const rationComparisons = useMemo(
    () => [
      {
        label: "Énergie",
        currentText: `${r0(rationDayTotals.kcal)} kcal`,
        targetText: needs.kcalTarget ? `cible ${r0(needs.kcalTarget)} kcal` : "cible à compléter",
        status: compareTargetStatus(rationDayTotals.kcal, needs.kcalTarget),
        progress: needs.kcalTarget ? (rationDayTotals.kcal / needs.kcalTarget) * 100 : 0,
      },
      {
        label: "Protéines",
        currentText: `${r0(rationDayTotals.prot)} g • ${r0(rationMacroPct.prot)}%`,
        targetText: macroTargetText(needs.protG, needs?.pctRanges?.protPctMin, needs?.pctRanges?.protPctMax),
        status: compareRangeStatus(rationDayTotals.prot, needs.protG),
        progress: rangeProgress(rationDayTotals.prot, needs.protG),
      },
      {
        label: "Lipides",
        currentText: `${r0(rationDayTotals.lip)} g • ${r0(rationMacroPct.lip)}%`,
        targetText: macroTargetText(needs.lipG, needs?.pctRanges?.lipPctMin, needs?.pctRanges?.lipPctMax),
        status: compareRangeStatus(rationDayTotals.lip, needs.lipG),
        progress: rangeProgress(rationDayTotals.lip, needs.lipG),
      },
      {
        label: "Glucides",
        currentText: `${r0(rationDayTotals.glu)} g • ${r0(rationMacroPct.glu)}%`,
        targetText: macroTargetText(needs.glucG, needs?.pctRanges?.gluPctMin, needs?.pctRanges?.gluPctMax),
        status: compareRangeStatus(rationDayTotals.glu, needs.glucG),
        progress: rangeProgress(rationDayTotals.glu, needs.glucG),
      },
    ],
    [needs, rationDayTotals, rationMacroPct]
  );

  const groupedForPdf = useMemo(() => {
    const byMeal = new Map();
    const rawPerMealTotals =
      selectedRation?.computed?.totals?.perMeal ||
      selectedRation?.computed?.perMeal ||
      docData?.ration?.selected?.computed?.totals?.perMeal ||
      docData?.ration?.selected?.computed?.perMeal ||
      {};
    const perMealTotals = Object.entries(rawPerMealTotals || {}).reduce((acc, [key, value]) => {
      const normalizedKey = normalizeMealKey(key);
      acc[normalizedKey] = {
        kcal: num(value?.kcal),
        prot: num(value?.prot ?? value?.p),
        lip: num(value?.lip ?? value?.f),
        glu: num(value?.glu ?? value?.c ?? value?.carbs),
      };
      return acc;
    }, {});
    pdfRationItems.forEach((it) => {
      const mk = normalizeMealKey(it.mealKey || "repas");
      if (!byMeal.has(mk)) {
        byMeal.set(mk, {
          mealKey: mk,
          mealLabel: it.mealLabel || mealLabelFromKey(mk),
          categories: new Map(),
          totals: perMealTotals?.[mk] || { kcal: 0, prot: 0, lip: 0, glu: 0 },
        });
      }
      const meal = byMeal.get(mk);
      const cat = cleanLabel(it.category || "Autre");
      if (!meal.categories.has(cat)) meal.categories.set(cat, []);
      meal.categories.get(cat).push(it);
    });

    const mealOrder = ["petit_dejeuner", "collation_1", "dejeuner", "collation_2", "diner", "collation_3", "collation"];
    const meals = Array.from(byMeal.values());
    meals.sort((a, b) => {
      const ia = mealOrder.indexOf(normalizeMealKey(a.mealKey));
      const ib = mealOrder.indexOf(normalizeMealKey(b.mealKey));
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return (a.mealLabel || "").localeCompare(b.mealLabel || "");
    });

    return meals.map((m) => ({
      ...m,
      categories: Array.from(m.categories.entries()).map(([cat, arr]) => ({
        category: cat,
        items: arr.sort((x, y) => (x.label || "").localeCompare(y.label || "")),
      })),
    }));
  }, [docData, pdfRationItems, selectedRation]);
  const clientSummary = useMemo(
    () =>
      [
        summaryAge !== null ? `${summaryAge} ans` : null,
        needs?.sex || null,
        objectiveRaw || null,
      ]
        .filter(Boolean)
        .join(" • "),
    [needs?.sex, objectiveRaw, summaryAge]
  );
  const pageTips = [
    "Commencer par choisir le mode le plus adapté au niveau de personnalisation souhaité.",
    "S’appuyer sur le cadre clinique pour garder une ration cohérente avec les besoins estimés.",
    "Vérifier la répartition par repas avant de passer au menu journalier.",
  ];
  const rationObservations = useMemo(() => {
    const observations = [];
    if (!readableRationLineCount) {
      observations.push("Aucune ligne de ration exploitable: la ration ne peut pas encore servir de base au menu.");
    } else {
      if (needs.kcalTarget && rationDayTotals.kcal) {
        const delta = rationDayTotals.kcal - needs.kcalTarget;
        observations.push(
          Math.abs(delta) <= 50
            ? `Énergie calée sur la cible: écart ${r0(delta)} kcal.`
            : `Énergie à ajuster: écart ${r0(delta)} kcal par rapport à la cible.`
        );
      }
      observations.push(
        readableMealCount >= 3
          ? `${readableMealCount}/${MENU_MEALS_ORDER.length} repas couverts: la répartition peut être relue.`
          : `${readableMealCount}/${MENU_MEALS_ORDER.length} repas couverts: compléter les repas principaux avant le menu.`
      );
      if (readableMealCount < 3) observations.push("Répartition à compléter: au moins les repas principaux doivent être couverts avant de passer au menu.");
      rationComparisons.forEach((item) => {
        if (item.status === "low") observations.push(`${item.label}: apport sous la cible, à corriger avant validation.`);
        if (item.status === "high") observations.push(`${item.label}: apport au-dessus de la cible, à réduire ou répartir autrement.`);
      });
      if (rationComparisons.every((item) => item.status === "ok") && readableMealCount >= 3) {
        observations.push("Les repères énergie et macros sont cohérents: la ration peut servir de base au menu.");
      }
    }
    if (pathologies.length || activeDiet.length) observations.push("Contrôle clinique à faire: aliments, quantités et exclusions doivent rester compatibles avec les pathologies/régimes du bilan.");
    return Array.from(new Set(observations)).slice(0, 6);
  }, [activeDiet.length, needs.kcalTarget, pathologies.length, rationComparisons, rationDayTotals.kcal, readableMealCount, readableRationLineCount]);

  /* ========================= React-PDF Export ========================= */
  const [pdfLogoDataUrl, setPdfLogoDataUrl] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    (async () => {
      const preferred = user?.logoUrl || user?.photoURL || user?.avatarUrl || "";
      const coachLogo = await toDataUrlSafe(preferred);
      const fallback = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      setPdfLogoDataUrl(coachLogo || fallback);
    })();
  }, [user?.avatarUrl, user?.logoUrl, user?.photoURL]);

  const coachPdfName = useMemo(() => getPersonName(user) || "Coach", [user]);

  const handleDownloadPDF = useCallback(async () => {
    if (!selectedRation) return;

    setExportingPdf(true);
    try {
      const preferred = user?.logoUrl || user?.photoURL || user?.avatarUrl || "";
      const effectiveLogo =
        pdfLogoDataUrl || (await toDataUrlSafe(preferred)) || (await toDataUrlSafe(LEGACY_BYL_LOCAL));
      const now = new Date();
      const blob = await pdf(
        <RationPdfDoc
          clientName={clientName || "Client"}
          coachName={coachPdfName}
          title="Ration alimentaire"
          subtitle={rationTitle || rationSubtitle || ""}
          logoDataUrl={effectiveLogo}
          footerText="BoostYourLife.coach"
          date={now}
          groupedForPdf={groupedForPdf}
          needs={needs}
          diet={diet}
          pathologies={pathologies}
          dayTotals={rationDayTotals}
          macroPct={rationMacroPct}
          selectedMicros={rationPdfMicros}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const base = (rationTitle || "ration_alimentaire").replace(/\s+/g, "_").toLowerCase();
      const clientBase = (clientName || "client").replace(/\s+/g, "_").toLowerCase();
      const filename = `${base}-${clientBase}-BYL.pdf`;

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.open(url, "_blank", "noopener,noreferrer");

      notify(toast, "pdfReady");
    } catch (e) {
      notify(toast, "pdfError", {
        description: e?.message || "Impossible de générer le PDF.",
      });
    } finally {
      setExportingPdf(false);
    }
  }, [
    selectedRation,
    clientName,
    rationTitle,
    rationSubtitle,
    coachPdfName,
    pdfLogoDataUrl,
    user?.avatarUrl,
    user?.logoUrl,
    user?.photoURL,
    groupedForPdf,
    needs,
    diet,
    pathologies,
    rationDayTotals,
    rationMacroPct,
    rationPdfMicros,
    toast,
  ]);

  /* ========================= guards ========================= */
  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">Accès refusé</Heading>
        <Text mt={2} opacity={0.7}>
          Admin uniquement pour le moment.
        </Text>
      </Box>
    );
  }

  if (loading) {
    return <AppLoading label="Chargement..." />;
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">Bilan introuvable</Heading>
        <Button mt={4} onClick={goBack}>
          Retour
        </Button>
      </Box>
    );
  }

  return (
    <Box minH="100vh" p={{ base: 4, md: 6 }} bg={pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={6}>
        <Box {...nutritionTheme.cardProps} overflow="hidden">
          <Box bg={accentBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <Stack spacing={4}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                <Box>
                  <HStack spacing={3} flexWrap="wrap">
                    <Button variant="outline" onClick={goBack}>
                      Retour
                    </Button>
                    <Heading size="md">Ration alimentaire</Heading>
                    {blocked ? <Badge colorScheme="yellow">BILAN NON VALIDÉ</Badge> : <Badge colorScheme="green">OK</Badge>}
                    <Badge colorScheme={mode === "auto" ? "purple" : "blue"}>
                      {mode === "auto" ? "MODE AUTO" : "MODE MANUEL"}
                    </Badge>
                  </HStack>

                  <Text mt={2} fontSize="sm" color={textMuted} maxW="760px">
                    Cette étape sert à construire la ration cible à partir du contexte clinique, des
                    besoins estimés et du mode de travail choisi.
                  </Text>
                </Box>

                <HStack spacing={2}>
                  <Tooltip label="Télécharger le PDF">
                    <IconButton
                      aria-label="Télécharger le PDF"
                      icon={<DownloadIcon />}
                      onClick={handleDownloadPDF}
                      variant="outline"
                      isDisabled={!selectedRation}
                      isLoading={exportingPdf}
                    />
                  </Tooltip>
                </HStack>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 4 }} spacing={3}>
                <Box gridColumn={{ base: "auto", md: "1 / 4" }}>
                  <Wrap spacing={2}>
                    {pageTips.map((tip) => (
                      <WrapItem key={tip}>
                        <Tag size="md" variant="subtle" colorScheme="blue" borderRadius="full">
                          <TagLabel>{tip}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>

                <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                  <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                    DOSSIER
                  </Text>
                  <Text mt={1} fontSize="lg" fontWeight="800" noOfLines={1}>
                    {clientName || [inputs?.prenom, inputs?.nom].filter(Boolean).join(" ") || "Patient"}
                  </Text>
                  <Text fontSize="sm" color={textMuted}>
                    {clientSummary || "Contexte général à compléter"}
                  </Text>
                </Box>
              </SimpleGrid>
            </Stack>
          </Box>

          <Box px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <SimpleGrid columns={{ base: 1, sm: 2, xl: 4 }} spacing={3}>
              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  OBJECTIF
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {objectiveRaw || "À préciser"}
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  {activeDiet.length ? activeDiet.join(", ") : "Aucun régime spécifique"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  CONTEXTE CLINIQUE
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {pathologies.length} élément(s)
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  {pathologies.length ? pathologies.slice(0, 2).join(", ") : "Aucune pathologie"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  CIBLE ÉNERGÉTIQUE
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {needs.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : "—"}
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  DEJ {needs.dej ? r0(needs.dej) : "—"} • NAP {needs.nap ? r1(needs.nap) : "—"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  RATION ACTIVE
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {mode === "auto" ? "Génération automatique" : "Construction manuelle"}
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  {readableRationLineCount
                    ? `${r0(rationDayTotals.kcal)} kcal • ${readableMealCount}/${MENU_MEALS_ORDER.length} repas couverts`
                    : "Aucune ration exploitable pour l’instant"}
                </Text>
              </Box>
            </SimpleGrid>
          </Box>
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
            ÉTAPE 1
          </Text>
          <Heading size="sm" mt={1}>
            Cadre clinique et énergétique
          </Heading>
          <Text fontSize="sm" color={textMuted} mt={1}>
            Ce cadre donne les repères utiles avant de construire ou d’ajuster la ration.
          </Text>

          {(activeDiet.length > 0 || pathologies.length > 0) && (
            <Box mt={4}>
              {activeDiet.length > 0 ? (
                <Box mb={pathologies.length > 0 ? 3 : 0}>
                  <Text fontSize="xs" color={textMuted} mb={1}>
                    Régimes :
                  </Text>
                  <Wrap spacing={2}>
                    {activeDiet.map((item) => (
                      <WrapItem key={item}>
                        <Tag size="sm" colorScheme="blue" variant="subtle">
                          <TagLabel>{item}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              ) : null}

              {pathologies.length > 0 ? (
                <Box>
                  <Text fontSize="xs" color={textMuted} mb={1}>
                    Pathologies :
                  </Text>
                  <Wrap spacing={2}>
                    {pathologies.map((item) => (
                      <WrapItem key={item}>
                        <Tag size="sm" colorScheme="orange" variant="subtle">
                          <TagLabel>{item}</TagLabel>
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                </Box>
              ) : null}
            </Box>
          )}

          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mt={4}>
            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>
                  MB (kcal/j)
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.mb ? r0(needs.mb) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>
                  NAP
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.nap ? r1(needs.nap) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>
                  DEJ (kcal/j)
                </Text>
                <Text fontSize="2xl" fontWeight="800">
                  {needs.dej ? r0(needs.dej) : "—"}
                </Text>
              </CardBody>
            </Card>

            <Card bg={softBg} border="1px solid" borderColor={borderCol}>
              <CardBody>
                <Text fontSize="sm" color={textMuted}>
                  Cible kcal
                </Text>
                <Text fontSize="2xl" fontWeight="900">
                  {needs.kcalTarget ? r0(needs.kcalTarget) : kcalIndicatif ? r0(kcalIndicatif) : "—"}
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  Prot {needs.protG?.min ? `${r0(needs.protG.min)}–${r0(needs.protG.max)} g` : "—"} • Lip{" "}
                  {needs.lipG?.min ? `${r0(needs.lipG.min)}–${r0(needs.lipG.max)} g` : "—"} • Glu{" "}
                  {needs.glucG?.min ? `${r0(needs.glucG.min)}–${r0(needs.glucG.max)} g` : "—"}
                </Text>
              </CardBody>
            </Card>
          </SimpleGrid>
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
            ÉTAPE 2
          </Text>
          <Heading size="sm" mt={1}>
            Choix de la méthode
          </Heading>
          <HStack
            mt={4}
            spacing={0}
            borderWidth="1px"
            borderColor={borderCol}
            borderRadius="xl"
            overflow="hidden"
            w="fit-content"
          >
            <Button
              borderRadius="0"
              variant={mode === "pro" ? "solid" : "ghost"}
              {...(mode === "pro" ? nutritionTheme.primaryButtonProps : {})}
              onClick={() => changeMode("pro")}
              isDisabled={blocked}
            >
              Mode manuel
            </Button>
            <Button
              borderRadius="0"
              variant={mode === "auto" ? "solid" : "ghost"}
              {...(mode === "auto" ? nutritionTheme.primaryButtonProps : {})}
              onClick={() => changeMode("auto")}
              isDisabled={blocked}
            >
              Mode auto
            </Button>
          </HStack>
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
            ÉTAPE 3
          </Text>
          <Heading size="sm" mt={1}>
            Construction de la ration
          </Heading>
          <Text fontSize="sm" color={textMuted} mt={1} mb={4}>
            {mode === "pro"
              ? "Le mode manuel te laisse une liberté complète sur les quantités, repas et repères cliniques."
              : "Le mode auto propose une base rationnelle à partir du contexte puis te laisse la possibilité d’ajuster."}
          </Text>

          {mode === "pro" ? (
            <RationManualEditor
              blocked={blocked}
              initialState={proState}
              onChange={(next) => queueChildState("pro", next)}
              context={{
                needs,
                inputs,
                computed,
                objectiveRaw,
                diet: activeDiet,
                pathologies,
                kcalIndicatif,
              }}
            />
          ) : (
            <RationAutoGenerator
              blocked={blocked}
              context={{
                needs,
                inputs,
                computed,
                objectiveRaw,
                diet: activeDiet,
                pathologies,
                kcalIndicatif,
              }}
              value={autoState}
              onChange={(next) => queueChildState("auto", next)}
              SNACK_MIN_KCAL={2200}
            />
          )}
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={softBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
            SYNTHÈSE CONSULTATION
          </Text>
          <Heading size="sm" mt={2}>
            Lecture rapide de la ration
          </Heading>

          <HStack justify="space-between" align="center" gap={3} flexWrap="wrap" mt={4}>
          <Wrap spacing={2}>
            <WrapItem>
              <Badge colorScheme={mode === "auto" ? "purple" : "blue"} variant="subtle" px={3} py={1} borderRadius="full">
                Mode: {mode === "auto" ? "auto" : "manuel"}
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme={readableMealCount >= 3 ? "green" : "orange"} variant="subtle" px={3} py={1} borderRadius="full">
                Repas couverts: {readableMealCount}/{MENU_MEALS_ORDER.length}
              </Badge>
            </WrapItem>
            <WrapItem>
              <Badge colorScheme="blue" variant="subtle" px={3} py={1} borderRadius="full">
                Cible: {needs.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : "—"}
              </Badge>
            </WrapItem>
          </Wrap>
            {rationMicroSummary.length ? (
              <Button size="sm" variant="outline" onClick={() => setShowSummaryMicros((v) => !v)}>
                {showSummaryMicros
                  ? "Masquer les micronutriments"
                  : `Voir les micronutriments (${rationMicroSummary.length})`}
              </Button>
            ) : null}
          </HStack>

          <Stack spacing={3} mt={4}>
            {rationComparisons.map((item) => (
              <Box key={item.label} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg} p={3}>
                <HStack justify="space-between" align="start" gap={3} mb={3}>
                  <Box>
                    <Text fontWeight="800">{item.label}</Text>
                    <Text fontSize="sm" color={textMuted} mt={1}>
                      {item.currentText} • {item.targetText}
                    </Text>
                  </Box>
                  <Badge colorScheme={statusColorScheme(item.status)} variant="subtle">
                    {statusLabel(item.status)}
                  </Badge>
                </HStack>
                <Progress
                  value={clampPercent(item.progress)}
                  colorScheme={statusColorScheme(item.status)}
                  bg={nutritionTheme.surfaceBgStrong}
                  borderRadius="full"
                  size="sm"
                />
              </Box>
            ))}
          </Stack>

          {rationMicroSummary.length ? (
            <Collapse in={showSummaryMicros} animateOpacity>
              <Box borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg} p={3} mt={4}>
                <Text fontWeight="800" mb={3}>
                  Micronutriments sélectionnés
                </Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {rationMicroSummary.map((item) => (
                    <Box key={item.key}>
                      <HStack justify="space-between" align="baseline" gap={3}>
                        <Text fontSize="sm" fontWeight="700">
                          {item.label}
                        </Text>
                        <Text fontSize="sm" color={textMuted}>
                          {formatMicroSummaryValue(item.value, item.unit)} /{" "}
                          {formatMicroSummaryValue(item.target, item.unit)} {item.unit}
                        </Text>
                      </HStack>
                      <Progress
                        mt={2}
                        value={clampPercent(item.percent)}
                        colorScheme={item.percent >= 90 ? "green" : item.percent >= 60 ? "orange" : "red"}
                        bg={nutritionTheme.surfaceBgStrong}
                        borderRadius="full"
                        size="sm"
                      />
                    </Box>
                  ))}
                </SimpleGrid>
              </Box>
            </Collapse>
          ) : null}

          <Text fontWeight="800" mt={5} mb={2}>
            Ce qu’on observe
          </Text>
          <Stack spacing={2}>
            {rationObservations.map((item) => (
              <Box key={item} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg} p={3}>
                <Text fontSize="sm">{item}</Text>
              </Box>
            ))}
          </Stack>
        </Box>

        <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg}>
          <HStack spacing={3} flexWrap="wrap" align="center">
            <Button variant="outline" onClick={goBack}>
              Retour
            </Button>

            <Spacer />

            <Button
              {...nutritionTheme.primaryButtonProps}
              onClick={onSaveAndNext}
              isDisabled={blocked}
              isLoading={savingNext}
              loadingText="Sauvegarde…"
            >
              Étape suivante
            </Button>
          </HStack>
        </Box>
      </Stack>
    </Box>
  );
}
