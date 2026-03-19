// src/components/NutritionRationPage.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Text,
  HStack,
  Button,
  Spinner,
  Badge,
  SimpleGrid,
  Card,
  CardBody,
  Divider,
  useToast,
  useColorModeValue,
  Spacer,
  IconButton,
  Tooltip,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";

import RationManualEditor from "./RationManualEditor.jsx";
import RationAutoGenerator from "./RationAutoGenerator.jsx";

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

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (s = "") =>
  stripDiacritics(String(s).toLowerCase()).trim().replace(/\s+/g, " ");
const objectiveKey = (s = "") => normalize(s).replace(/[^a-z0-9]+/g, "_");

const truthy = (v) => {
  if (typeof v === "boolean") return v;
  const s = normalize(v);
  return s === "1" || s === "true" || s === "oui" || s === "yes";
};

const firstNonZero = (...vals) => {
  for (const v of vals) {
    const n = num(v);
    if (n > 0) return n;
  }
  return 0;
};

const firstNonEmpty = (...vals) => {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
};

const cleanLabel = (s) =>
  String(s || "")
    .replace(/\(\s*aliment\s*[^)]*\)/gi, "")
    .replace(/\(\s*moyen\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

/* ========================= Black et al (BMR) ========================= */
const blackBmrKcal = ({ sex, weightKg, heightCm, ageY }) => {
  const w = num(weightKg);
  const hM = num(heightCm) / 100;
  const a = num(ageY);
  if (!(w > 0 && hM > 0 && a > 0)) return 0;

  const s = normalize(sex);
  const isMale =
    s.includes("homme") ||
    s === "m" ||
    s === "male" ||
    s.includes("man") ||
    s.includes("mascul");

  const coef = isMale ? 1.083 : 0.963;
  const watts = coef * Math.pow(w, 0.48) * Math.pow(hM, 0.5) * Math.pow(a, -0.13);
  return watts * (1000 / 4.1855);
};

const parseAgeYears = (inputs = {}) => {
  const direct = firstNonZero(inputs?.age, inputs?.age_annees, inputs?.ageYears);
  if (direct > 0) return direct;

  const dob = firstNonEmpty(
    inputs?.date_naissance,
    inputs?.dateNaissance,
    inputs?.birthdate,
    inputs?.dob
  );
  if (!dob) return 0;

  const s = String(dob).trim();
  let d = new Date(s);
  if (Number.isNaN(d.getTime()) && s.includes("/")) {
    const [dd, mm, yyyy] = s.split("/");
    d = new Date(`${yyyy}-${mm}-${dd}`);
  }
  if (Number.isNaN(d.getTime())) return 0;

  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age > 0 ? age : 0;
};

const getPregnancyAndLactationFlags = (inputs = {}) => {
  const trimestreRaw = firstNonEmpty(
    inputs?.grossesse_trimestre,
    inputs?.trimestre_grossesse,
    inputs?.pregnancy_trimester,
    inputs?.trimestre
  );
  const t = normalize(trimestreRaw);

  const isPreg2 =
    truthy(inputs?.enceinte_t2) ||
    truthy(inputs?.pregnant_t2) ||
    t.includes("2") ||
    t.includes("deux") ||
    t.includes("second");

  const isPreg3 =
    truthy(inputs?.enceinte_t3) ||
    truthy(inputs?.pregnant_t3) ||
    t.includes("3") ||
    t.includes("trois") ||
    t.includes("third") ||
    t.includes("troisi");

  const isLact =
    truthy(inputs?.allaitante) ||
    truthy(inputs?.lactating) ||
    truthy(inputs?.breastfeeding);

  return { isPreg2, isPreg3, isLact };
};

const computeKcalMultiplier = ({ objectiveRaw, inputs }) => {
  const ok = objectiveKey(objectiveRaw);
  const { isPreg2, isPreg3, isLact } = getPregnancyAndLactationFlags(inputs);

  if (isLact) return 1.2;
  if (isPreg3) return 1.2;
  if (isPreg2) return 1.12;

  if (ok.includes("perte") || ok.includes("poids")) return 0.8;
  if (ok.includes("prise") || ok.includes("masse")) return 1.2;

  return 1.0;
};

const computeMacroPercentRanges = (objectiveRaw) => {
  const ok = objectiveKey(objectiveRaw);
  const isMass = ok.includes("prise") || ok.includes("masse");
  return {
    protPctMin: isMass ? 25 : 15,
    protPctMax: isMass ? 30 : 20,
    lipPctMin: isMass ? 25 : 35,
    lipPctMax: isMass ? 30 : 40,
    glucPctMin: 40,
    glucPctMax: 50,
  };
};

const gramsRangeFromPct = ({ kcalTarget, pctMin, pctMax, kcalPerG }) => {
  const kcal = num(kcalTarget);
  if (!(kcal > 0)) return { min: 0, max: 0 };
  return {
    min: (kcal * (pctMin / 100)) / kcalPerG,
    max: (kcal * (pctMax / 100)) / kcalPerG,
  };
};

const normalizeDiet = (inputs = {}) => {
  const arrA = inputs?.medical?.diets;
  if (Array.isArray(arrA)) return arrA.filter(Boolean).map(String);

  const arrB = inputs?.regimes;
  if (Array.isArray(arrB)) return arrB.filter(Boolean).map(String);

  const s = firstNonEmpty(
    inputs?.medical?.dietText,
    inputs?.medical?.diet,
    inputs?.regime_specifique,
    inputs?.regime,
    inputs?.diet,
    inputs?.dietText
  );
  if (!s) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
};

const normalizePathologies = (inputs = {}) => {
  const arrA = inputs?.medical?.pathologies;
  if (Array.isArray(arrA)) return arrA.filter(Boolean).map(String);

  const arrB = inputs?.pathologies;
  if (Array.isArray(arrB)) return arrB.filter(Boolean).map(String);

  const s = firstNonEmpty(
    inputs?.medical?.pathologiesText,
    inputs?.medical?.pathologies,
    inputs?.pathologiesText,
    inputs?.pathologies,
    inputs?.pathologie
  );
  if (!s) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
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
  if (k.startsWith("collation_")) return `Collation ${k.split("_")[1]}`;
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
  page: { padding: 44, fontSize: 11, color: "#0B1B3A" },

  header: {
    borderBottomWidth: 2,
    borderBottomColor: "#1F5EFF",
    paddingBottom: 12,
    marginBottom: 18,
    flexDirection: "row",
    alignItems: "center",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", width: 170 },
  logo: { width: 26, height: 26, marginRight: 10 },
  clientName: { fontSize: 11, fontWeight: 700 },

  headerCenter: { flex: 1, alignItems: "center" },
  title: { fontSize: 18, fontWeight: 700, textAlign: "center" },
  subtitle: { fontSize: 11, opacity: 0.75, marginTop: 4, textAlign: "center" },

  headerRight: { width: 170, alignItems: "flex-end" },
  date: { fontSize: 10, opacity: 0.6 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "#1F5EFF",
    marginBottom: 10,
  },
  mealTitle: { fontSize: 12, fontWeight: 700, marginTop: 10 },
  categoryTitle: { fontSize: 11, fontWeight: 700, marginTop: 8, opacity: 0.95 },
  line: { marginBottom: 4 },

  empty: { fontSize: 11, opacity: 0.7, marginTop: 6 },

  footer: {
    position: "absolute",
    bottom: 18,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerLogo: { width: 14, height: 14, marginRight: 6 },
  footerText: { fontSize: 9, opacity: 0.6, textAlign: "center" },
});

function RationPdfDoc({
  clientName,
  title,
  subtitle,
  logoDataUrl,
  footerText,
  date,
  groupedForPdf,
  needs,
  kcalIndicatif,
  diet,
  pathologies,
  mode,
}) {
  const dateStr = date?.toLocaleDateString ? date.toLocaleDateString("fr-FR") : "";
  const hasAny = Array.isArray(groupedForPdf) && groupedForPdf.length > 0;

  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <View style={pdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={pdfStyles.logo} /> : null}
            <PdfText style={pdfStyles.clientName}>{clientName || "Client"}</PdfText>
          </View>

          <View style={pdfStyles.headerCenter}>
            <PdfText style={pdfStyles.title}>{title || "Ration alimentaire"}</PdfText>
            {subtitle ? <PdfText style={pdfStyles.subtitle}>{subtitle}</PdfText> : null}
          </View>

          <View style={pdfStyles.headerRight}>
            <PdfText style={pdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        <PdfText style={pdfStyles.sectionTitle}>Synthèse</PdfText>
        <PdfText style={pdfStyles.line}>• Mode : {mode === "auto" ? "Auto" : "Pro"}</PdfText>
        <PdfText style={pdfStyles.line}>
          • MB : {needs?.mb ? r0(needs.mb) : "—"} kcal • NAP : {needs?.nap ? r1(needs.nap) : "—"} • DEJ :{" "}
          {needs?.dej ? r0(needs.dej) : "—"} kcal • Cible : {needs?.kcalTarget ? r0(needs.kcalTarget) : "—"} kcal
        </PdfText>
        <PdfText style={pdfStyles.line}>
          • Fourchettes : Prot{" "}
          {needs?.protG?.min ? `${r0(needs.protG.min)}–${r0(needs.protG.max)}g` : "—"} • Lip{" "}
          {needs?.lipG?.min ? `${r0(needs.lipG.min)}–${r0(needs.lipG.max)}g` : "—"} • Glu{" "}
          {needs?.glucG?.min ? `${r0(needs.glucG.min)}–${r0(needs.glucG.max)}g` : "—"}
        </PdfText>
        <PdfText style={pdfStyles.line}>• kcal indicatif : {kcalIndicatif ? r0(kcalIndicatif) : "—"}</PdfText>
        <PdfText style={pdfStyles.line}>
          • Régime : {diet?.length ? diet.join(", ") : "—"} • Pathologies : {pathologies?.length ? pathologies.join(", ") : "—"}
        </PdfText>

        <View style={{ marginTop: 14 }}>
          <PdfText style={pdfStyles.sectionTitle}>Ration par repas</PdfText>

          {!hasAny ? (
            <PdfText style={pdfStyles.empty}>
              Aucun aliment renseigné (quantité à 0 sur tous les repas).
            </PdfText>
          ) : (
            groupedForPdf.map((meal, i) => (
              <View key={`meal_${i}`}>
                <PdfText style={pdfStyles.mealTitle}>{meal.mealLabel}</PdfText>

                {meal.categories.map((c, j) => (
                  <View key={`cat_${i}_${j}`}>
                    <PdfText style={pdfStyles.categoryTitle}>{c.category}</PdfText>
                    {c.items.map((it, k) => (
                      <PdfText key={`it_${i}_${j}_${k}`} style={pdfStyles.line}>
                        • {cleanLabel(it.label)} — {r0(it.qty)} {it.unit || ""}
                      </PdfText>
                    ))}
                  </View>
                ))}
              </View>
            ))
          )}
        </View>

        <View style={pdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={pdfStyles.footerLogo} /> : null}
          <PdfText style={pdfStyles.footerText}>{footerText || "BoostYourLife.coach"}</PdfText>
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

  const [saving, setSaving] = useState(false);
  const [savingNext, setSavingNext] = useState(false);

  const panelBg = useColorModeValue("white", "gray.800");
  const borderCol = useColorModeValue("gray.200", "whiteAlpha.200");
  const textMuted = useColorModeValue("blackAlpha.700", "whiteAlpha.700");

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

        const modeFromDoc =
          d?.ration?.mode === "auto" || d?.ration?.selectedType === "auto" || d?.rationAuto
            ? "auto"
            : "pro";

        setMode(modeFromDoc);
        setProState(d?.ration?.pro ?? d?.rationPro ?? null);
        setAutoState(pickBestAutoState(d));

        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [assessmentRef, pickBestAutoState]);

  const isValidated = useMemo(() => {
    if (typeof docData?.validated === "boolean") return docData.validated;
    if (typeof docData?.inputs?.nutritionValidated === "boolean") return docData.inputs.nutritionValidated;
    if (typeof docData?.status === "string") return docData.status !== "draft";
    return true;
  }, [docData]);

  const blocked = !isValidated;

  const inputs = useMemo(() => docData?.inputs || {}, [docData]);
  const computed = useMemo(() => docData?.computed || {}, [docData]);

  const objectiveRaw = useMemo(() => String(inputs?.objectif || inputs?.objective || "").trim(), [inputs]);
  const diet = useMemo(() => normalizeDiet(inputs), [inputs]);
  const pathologies = useMemo(() => normalizePathologies(inputs), [inputs]);

  const needs = useMemo(() => {
    const weightKg = firstNonZero(
      inputs?.poids?.value,
      inputs?.poids,
      inputs?.weight?.value,
      inputs?.weight,
      inputs?.weight_kg?.value,
      inputs?.weight_kg
    );

    const heightCm = firstNonZero(
      inputs?.taille?.value,
      inputs?.taille,
      inputs?.height?.value,
      inputs?.height,
      inputs?.height_cm?.value,
      inputs?.height_cm
    );

    const sex = firstNonEmpty(inputs?.sexe, inputs?.sex, inputs?.gender);
    const ageY = firstNonZero(parseAgeYears(inputs));

    const nap = firstNonZero(
      inputs?.nap,
      inputs?.NAP,
      inputs?.nap_value,
      inputs?.napValue,
      computed?.nap,
      computed?.NAP,
      1.4
    );

    const mb = firstNonZero(computed?.mb, computed?.MB) || blackBmrKcal({ sex, weightKg, heightCm, ageY });
    const dej = firstNonZero(computed?.dej, computed?.DEJ) || (mb > 0 ? mb * nap : 0);

    const kcalTargetExisting = firstNonZero(computed?.kcalTarget, computed?.kcal_target);
    const kcalMul = computeKcalMultiplier({ objectiveRaw, inputs });
    const kcalTarget = kcalTargetExisting || (dej > 0 ? dej * kcalMul : 0);

    const pctRanges = computeMacroPercentRanges(objectiveRaw);

    const protG = computed?.protG
      ? computed.protG
      : gramsRangeFromPct({ kcalTarget, pctMin: pctRanges.protPctMin, pctMax: pctRanges.protPctMax, kcalPerG: 4 });

    const glucG = computed?.glucG
      ? computed.glucG
      : gramsRangeFromPct({ kcalTarget, pctMin: pctRanges.glucPctMin, pctMax: pctRanges.glucPctMax, kcalPerG: 4 });

    const lipG = computed?.lipG
      ? computed.lipG
      : gramsRangeFromPct({ kcalTarget, pctMin: pctRanges.lipPctMin, pctMax: pctRanges.lipPctMax, kcalPerG: 9 });

    return {
      objectiveRaw,
      weightKg,
      heightCm,
      ageY,
      sex,
      nap,
      mb,
      dej,
      kcalMul,
      kcalTarget,
      pctRanges,
      protG,
      glucG,
      lipG,
    };
  }, [inputs, computed, objectiveRaw]);

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

  const buildRationPayload = useCallback(() => {
    const selectedType = mode === "auto" ? "auto" : "pro";
    const selected = selectedType === "auto" ? (autoState ?? null) : (proState ?? null);

    const payload = {
      ration: {
        mode,
        pro: proState ?? null,
        auto: autoState ?? null,
        selectedType,
        selected,
        selectedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    };

    // Optionnel: si ton app lit encore rationAuto ailleurs
    if (selectedType === "auto" && autoState) payload.rationAuto = autoState;

    return payload;
  }, [mode, proState, autoState]);

  const onSave = useCallback(async () => {
    if (!assessmentRef || blocked) return;
    setSaving(true);
    try {
      await updateDoc(assessmentRef, buildRationPayload());
      toast({ title: "Enregistré", status: "success", duration: 1500, isClosable: true });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e?.message || "Sauvegarde impossible",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSaving(false);
    }
  }, [assessmentRef, blocked, buildRationPayload, toast]);

  const onSaveAndNext = useCallback(async () => {
    if (!assessmentRef || blocked) return;
    setSavingNext(true);
    try {
      await updateDoc(assessmentRef, buildRationPayload());
      toast({ title: "Ration enregistrée", status: "success", duration: 1200, isClosable: true });
      navigate(`/clients/${clientId}/nutrition/${assessmentId}/menu`);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e?.message || "Sauvegarde impossible",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    } finally {
      setSavingNext(false);
    }
  }, [assessmentRef, blocked, buildRationPayload, toast, navigate, clientId, assessmentId]);

  /* ========================= Selected ration + grouping ========================= */
  const selectedRation = useMemo(() => (mode === "auto" ? autoState : proState), [mode, autoState, proState]);

  const rationTitle = useMemo(() => {
    const t = selectedRation?.title || selectedRation?.titre || docData?.ration?.title || docData?.ration?.titre || "";
    return String(t || "").trim();
  }, [selectedRation, docData]);

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

  const groupedForPdf = useMemo(() => {
    const byMeal = new Map();
    rationItems.forEach((it) => {
      const mk = it.mealKey || "repas";
      if (!byMeal.has(mk)) {
        byMeal.set(mk, {
          mealKey: mk,
          mealLabel: it.mealLabel || mealLabelFromKey(mk),
          categories: new Map(),
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
  }, [rationItems]);

  /* ========================= React-PDF Export ========================= */
  const [bylLogoDataUrl, setBylLogoDataUrl] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    (async () => {
      const logo = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      setBylLogoDataUrl(logo);
    })();
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    if (!selectedRation) return;

    setExportingPdf(true);
    try {
      const now = new Date();
      const blob = await pdf(
        <RationPdfDoc
          clientName={clientName || "Client"}
          title={rationTitle || "Ration alimentaire"}
          subtitle={rationSubtitle || ""}
          logoDataUrl={bylLogoDataUrl}
          footerText="BoostYourLife.coach"
          date={now}
          groupedForPdf={groupedForPdf}
          needs={needs}
          kcalIndicatif={kcalIndicatif}
          diet={diet}
          pathologies={pathologies}
          mode={mode}
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

      toast({
        status: "success",
        title: "PDF généré",
        description: "Export de la ration OK.",
        duration: 1800,
        isClosable: true,
      });
    } catch (e) {
      toast({
        status: "error",
        title: "Erreur PDF",
        description: e?.message || "Impossible de générer le PDF.",
        duration: 3500,
        isClosable: true,
      });
    } finally {
      setExportingPdf(false);
    }
  }, [
    selectedRation,
    clientName,
    rationTitle,
    rationSubtitle,
    bylLogoDataUrl,
    groupedForPdf,
    needs,
    kcalIndicatif,
    diet,
    pathologies,
    mode,
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
    return (
      <Box p={6}>
        <HStack>
          <Spinner />
          <Text>Chargement…</Text>
        </HStack>
      </Box>
    );
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">Bilan introuvable</Heading>
        <Button mt={4} onClick={() => navigate(-1)}>
          Retour
        </Button>
      </Box>
    );
  }

  return (
    <Box p={{ base: 4, md: 6 }}>
      <HStack justify="space-between" mb={4} align="center" gap={3} flexWrap="wrap">
        <HStack spacing={3} flexWrap="wrap">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>
          <Heading size="md">Ration</Heading>
          {blocked ? <Badge colorScheme="yellow">BILAN NON VALIDÉ</Badge> : <Badge colorScheme="green">OK</Badge>}
          <Badge colorScheme={mode === "auto" ? "purple" : "blue"}>
            {mode === "auto" ? "MODE AUTO" : "MODE PRO"}
          </Badge>
        </HStack>

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

      {/* Contexte */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={4}>
        <Card bg={panelBg} border="1px solid" borderColor={borderCol}>
          <CardBody>
            <Text fontSize="sm" color={textMuted}>
              Objectif
            </Text>
            <Text fontSize="lg" fontWeight="800">
              {objectiveRaw || "—"}
            </Text>
          </CardBody>
        </Card>

        <Card bg={panelBg} border="1px solid" borderColor={borderCol}>
          <CardBody>
            <Text fontSize="sm" color={textMuted}>
              Régime spécifique
            </Text>
            <Text fontSize="lg" fontWeight="800">
              {diet.length ? diet.join(", ") : "—"}
            </Text>
          </CardBody>
        </Card>

        <Card bg={panelBg} border="1px solid" borderColor={borderCol}>
          <CardBody>
            <Text fontSize="sm" color={textMuted}>
              Pathologies
            </Text>
            <Text fontSize="lg" fontWeight="800">
              {pathologies.length ? pathologies.join(", ") : "—"}
            </Text>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Besoins */}
      <Box mb={4} p={4} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg}>
        <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
          <Box>
            <Text fontSize="sm" color={textMuted}>
              Besoins estimés (Black et al)
            </Text>
            <Text fontSize="sm" opacity={0.85} mt={1}>
              MB <b>{needs.mb ? r0(needs.mb) : "—"}</b> • NAP <b>{needs.nap ? r1(needs.nap) : "—"}</b> • DEJ{" "}
              <b>{needs.dej ? r0(needs.dej) : "—"}</b> • Cible kcal <b>{needs.kcalTarget ? r0(needs.kcalTarget) : "—"}</b>{" "}
              (×{r1(needs.kcalMul)})
            </Text>
            <Text fontSize="sm" opacity={0.75} mt={1}>
              Fourchettes : Prot{" "}
              <b>{needs.protG?.min ? `${r0(needs.protG.min)}–${r0(needs.protG.max)}g` : "—"}</b> • Lip{" "}
              <b>{needs.lipG?.min ? `${r0(needs.lipG.min)}–${r0(needs.lipG.max)}g` : "—"}</b> • Glu{" "}
              <b>{needs.glucG?.min ? `${r0(needs.glucG.min)}–${r0(needs.glucG.max)}g` : "—"}</b>
            </Text>
          </Box>

          <Box textAlign={{ base: "left", md: "right" }}>
            <Text fontSize="sm" color={textMuted}>
              kcal cible (indicatif)
            </Text>
            <Text fontSize="2xl" fontWeight="900">
              {kcalIndicatif ? r0(kcalIndicatif) : "—"}
            </Text>
          </Box>
        </HStack>
      </Box>

      {/* Tabs */}
      <Box bg={panelBg} border="1px solid" borderColor={borderCol} p={4} rounded="lg">
        <Text fontSize="sm" opacity={0.75} mb={2}>
          Choisis la méthode :
        </Text>
        <HStack spacing={3} flexWrap="wrap">
          <Button
            colorScheme="blue"
            variant={mode === "pro" ? "solid" : "outline"}
            onClick={() => setMode("pro")}
            isDisabled={blocked}
          >
            Ration pro
          </Button>

          <Button
            colorScheme="purple"
            variant={mode === "auto" ? "solid" : "outline"}
            onClick={() => setMode("auto")}
            isDisabled={blocked}
          >
            Ration auto
          </Button>
        </HStack>
      </Box>

      <Divider my={5} />

      {/* Content */}
      {mode === "pro" ? (
        <RationManualEditor
          blocked={blocked}
          initialState={proState}
          onChange={(next) => setProState(next)}
          context={{
            needs,
            inputs,
            computed,
            objectiveRaw,
            diet,
            pathologies,
            kcalIndicatif,
          }}
        />
      ) : (
        <RationAutoGenerator
          blocked={blocked}
          inputs={inputs}
          computed={computed}
          value={autoState}
          onChange={(next) => setAutoState(next)}
          SNACK_MIN_KCAL={2200}
        />
      )}

      {/* Actions */}
      <Box mt={4} p={4} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={panelBg}>
        <HStack spacing={3} flexWrap="wrap" align="center">
          <Button variant="outline" onClick={() => navigate(-1)}>
            Retour
          </Button>

          <Spacer />

          <Button
            colorScheme="blue"
            variant="outline"
            onClick={onSave}
            isDisabled={blocked}
            isLoading={saving}
            loadingText="Sauvegarde…"
          >
            Sauvegarder
          </Button>

          <Button
            colorScheme="teal"
            onClick={onSaveAndNext}
            isDisabled={blocked}
            isLoading={savingNext}
            loadingText="Sauvegarde…"
          >
            Sauvegarder & étape suivante
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}
