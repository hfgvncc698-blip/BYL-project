/* eslint-disable react/prop-types */
// src/components/MenuJournalierFromRation.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Badge,
  Button,
  Heading,
  HStack,
  SimpleGrid,
  Text,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  Stack,
  IconButton,
  Tooltip,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Checkbox,
  Divider,
  Textarea,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { DownloadIcon } from "@chakra-ui/icons";
import { useNavigate, useParams } from "react-router-dom";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";
import {
  computeNutritionNeeds,
  normalizeDietList,
  normalizePathologyList,
} from "../utils/nutritionContext";
import {
  MENU_MEALS_ORDER,
  extractRationLines,
  countRationMealsCovered,
  rationMenuNum,
} from "../utils/rationMenu";

import MenuJournalierManual from "./MenuJournalierManual.jsx";
import MenuJournalierAuto from "./MenuJournalierAuto.jsx";
import NutritionAdviceSheetsPanel from "./NutritionAdviceSheetsPanel.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { getAdviceSheetPreview, mergeAdviceSheets } from "../utils/nutritionAdviceSheets";
import { generateShoppingListFromNutritionPlan } from "../utils/shoppingListService";
import { generateRecipesFromMeal } from "../utils/recipeGenerationService";
import { saveNutritionFeedback } from "../utils/nutritionFeedbackService";
import {
  pdf,
  Document,
  Page,
  View,
  Text as PdfText,
  Image as PdfImage,
  StyleSheet,
} from "@react-pdf/renderer";

const safeSetSmallLocal = (key, value) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const r0 = (value) => Math.round(rationMenuNum(value));
const LEGACY_BYL_LOCAL = "/logo-byl.png";
const normalizeAdviceText = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const collectAdviceSourceValues = (value) => {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value).trim();
    return text ? [text] : [];
  }
  if (Array.isArray(value)) return value.flatMap(collectAdviceSourceValues);
  if (typeof value === "object") return Object.values(value).flatMap(collectAdviceSourceValues);
  return [];
};

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
  }
  return "";
};

const ciqualCode = (row) => String(row?.code ?? row?.alim_code ?? "").trim();
const ciqualName = (row) =>
  firstNonEmpty(row?.alim_nom_fr, row?.alim_nom, row?.name, row?.nom, row?.designation, row?.designation_fr, "");

const menuPdfStyles = StyleSheet.create({
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
  brand: { fontSize: 12, fontWeight: 700, color: "#1F5EFF" },
  coachName: { fontSize: 11, fontWeight: 700, color: "#193B8A" },
  clientName: { fontSize: 11, fontWeight: 700, textAlign: "right" },
  headerCenter: { flex: 1, alignItems: "center" },
  title: { fontSize: 18, fontWeight: 700, textAlign: "center", color: "#111827" },
  subtitle: { fontSize: 11, opacity: 0.75, marginTop: 4, textAlign: "center" },
  headerRight: { width: 170, alignItems: "flex-end" },
  date: { fontSize: 10, opacity: 0.6 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#1F5EFF", marginBottom: 8 },
  dayCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 12, marginBottom: 12 },
  dayHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  dayTitle: { fontSize: 13, fontWeight: 700, color: "#111827" },
  totalPill: { backgroundColor: "#EAF5EF", color: "#166534", borderRadius: 999, paddingTop: 3, paddingBottom: 3, paddingLeft: 8, paddingRight: 8, fontSize: 9, fontWeight: 700 },
  mealGrid: { flexDirection: "row", flexWrap: "wrap", marginLeft: -4, marginRight: -4 },
  mealCard: { width: "48%", backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 8, margin: 4 },
  mealTitle: { fontSize: 10, fontWeight: 700, color: "#111827", marginBottom: 5 },
  itemLine: { fontSize: 9, marginBottom: 3, lineHeight: 1.25 },
  itemQty: { color: "#64748B" },
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
  adviceSheet: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 14, padding: 12, marginBottom: 12 },
  adviceSheetTitle: { fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 8 },
  adviceSheetContent: { fontSize: 10, lineHeight: 1.4, color: "#374151" },
});

const menuDayMacroLine = (totals) => {
  const kcal = r0(totals?.kcal);
  const p = r0(totals?.p || totals?.prot);
  const l = r0(totals?.f || totals?.lip);
  const g = r0(totals?.c || totals?.carbs || totals?.glu);
  const parts = [];
  if (kcal > 0) parts.push(`${kcal} kcal`);
  if (p > 0) parts.push(`P ${p} g`);
  if (l > 0) parts.push(`L ${l} g`);
  if (g > 0) parts.push(`G ${g} g`);
  return parts.length ? parts.join(" • ") : "kcal —";
};

const SHARE_SECTION_KEYS = ["summary", "foodSurvey", "ration", "menu", "recipes", "shoppingList", "adviceSheets"];

const emptyShareSections = () => ({
  summary: false,
  foodSurvey: false,
  ration: false,
  menu: false,
  recipes: false,
  shoppingList: false,
  adviceSheets: false,
});

const allShareSections = () => ({
  summary: true,
  foodSurvey: true,
  ration: true,
  menu: true,
  recipes: true,
  shoppingList: true,
  adviceSheets: true,
});

function MenuPdfDoc({ clientName, coachName, title, subtitle, logoDataUrl, days, date, adviceSheets }) {
  const dateStr = date?.toLocaleDateString ? date.toLocaleDateString("fr-FR") : "";
  const hasDays = Array.isArray(days) && days.some((day) => day.meals.some((meal) => meal.items.length));
  const hasAdviceSheets = Array.isArray(adviceSheets) && adviceSheets.length > 0;
  return (
    <Document>
      <Page size="A4" style={menuPdfStyles.page}>
        <View style={menuPdfStyles.header} fixed>
          <View style={menuPdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={menuPdfStyles.logo} /> : null}
            <PdfText style={menuPdfStyles.coachName}>{coachName || "Coach"}</PdfText>
          </View>
          <View style={menuPdfStyles.headerCenter}>
            <PdfText style={menuPdfStyles.title}>{title || "Menu journalier"}</PdfText>
            {subtitle ? <PdfText style={menuPdfStyles.subtitle}>{subtitle}</PdfText> : null}
          </View>
          <View style={menuPdfStyles.headerRight}>
            <PdfText style={menuPdfStyles.clientName}>{clientName || "Patient"}</PdfText>
            <PdfText style={menuPdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        <PdfText style={menuPdfStyles.sectionTitle}>Menu</PdfText>
        {!hasDays ? (
          <PdfText style={menuPdfStyles.empty}>Aucun menu sauvegardé à exporter pour le moment.</PdfText>
        ) : (
          days.map((day) => (
            <View key={day.label} style={menuPdfStyles.dayCard} wrap={false}>
              <View style={menuPdfStyles.dayHeader}>
                <PdfText style={menuPdfStyles.dayTitle}>{day.label}</PdfText>
                <PdfText style={menuPdfStyles.totalPill}>
                  {menuDayMacroLine(day?.totals)}
                </PdfText>
              </View>
              <View style={menuPdfStyles.mealGrid}>
                {day.meals.map((meal) =>
                  meal.items.length ? (
                    <View key={`${day.label}_${meal.label}`} style={menuPdfStyles.mealCard}>
                      <PdfText style={menuPdfStyles.mealTitle}>{meal.label}</PdfText>
                      {meal.items.map((item, idx) => (
                        <PdfText key={`${day.label}_${meal.label}_${idx}`} style={menuPdfStyles.itemLine}>
                          • {item.name} <PdfText style={menuPdfStyles.itemQty}>({item.qty})</PdfText>
                        </PdfText>
                      ))}
                    </View>
                  ) : null
                )}
              </View>
            </View>
          ))
        )}

        {hasAdviceSheets ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>Fiches conseils</PdfText>
            {adviceSheets.map((sheet, idx) => (
              <View key={idx} style={menuPdfStyles.adviceSheet} wrap={false}>
                <PdfText style={menuPdfStyles.adviceSheetTitle}>{sheet.title}</PdfText>
                <PdfText style={menuPdfStyles.adviceSheetContent}>{sheet.content}</PdfText>
              </View>
            ))}
          </>
        ) : null}

        <View style={menuPdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={menuPdfStyles.footerLogo} /> : null}
          <PdfText style={menuPdfStyles.footerText}>Généré avec BoostYourLife.coach</PdfText>
        </View>
      </Page>
    </Document>
  );
}

function AdviceSheetsPdfDoc({ clientName, coachName, logoDataUrl, sheets, date }) {
  const dateStr = date?.toLocaleDateString ? date.toLocaleDateString("fr-FR") : "";
  const printableSheets = Array.isArray(sheets) ? sheets.map((sheet) => getAdviceSheetPreview(sheet)) : [];

  return (
    <Document>
      <Page size="A4" style={menuPdfStyles.page}>
        <View style={menuPdfStyles.header} fixed>
          <View style={menuPdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={menuPdfStyles.logo} /> : null}
            <PdfText style={menuPdfStyles.coachName}>{coachName || "Coach"}</PdfText>
          </View>
          <View style={menuPdfStyles.headerCenter}>
            <PdfText style={menuPdfStyles.title}>Fiches conseils</PdfText>
            <PdfText style={menuPdfStyles.subtitle}>Nutrition</PdfText>
          </View>
          <View style={menuPdfStyles.headerRight}>
            <PdfText style={menuPdfStyles.clientName}>{clientName || "Patient"}</PdfText>
            <PdfText style={menuPdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        {!printableSheets.length ? (
          <PdfText style={menuPdfStyles.empty}>Aucune fiche sélectionnée pour le moment.</PdfText>
        ) : (
          printableSheets.map((sheet) => (
            <View key={sheet.id || sheet.title} style={menuPdfStyles.adviceSheet} wrap={false}>
              <PdfText style={menuPdfStyles.adviceSheetTitle}>{sheet.title}</PdfText>
              <PdfText style={menuPdfStyles.adviceSheetContent}>{sheet.summary}</PdfText>
              {sheet.keyPoints?.length ? (
                <View style={{ marginTop: 8 }}>
                  {sheet.keyPoints.map((point) => (
                    <PdfText key={point} style={menuPdfStyles.itemLine}>
                      • {point}
                    </PdfText>
                  ))}
                </View>
              ) : null}
              {sheet.practicalTips?.length ? (
                <View style={{ marginTop: 8 }}>
                  <PdfText style={menuPdfStyles.mealTitle}>Repères pratiques</PdfText>
                  {sheet.practicalTips.map((tip) => (
                    <PdfText key={tip} style={menuPdfStyles.itemLine}>
                      • {tip}
                    </PdfText>
                  ))}
                </View>
              ) : null}
            </View>
          ))
        )}

        <View style={menuPdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={menuPdfStyles.footerLogo} /> : null}
          <PdfText style={menuPdfStyles.footerText}>Généré avec BoostYourLife.coach</PdfText>
        </View>
      </Page>
    </Document>
  );
}

const calcAgeFromDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const monthDelta = now.getMonth() - date.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 ? age : null;
};

const inferMenuMicroKey = (key = "") => {
  const value = String(key || "").toLowerCase();
  if (value.includes("calcium")) return "calcium";
  if (value.includes("fibres") || value.includes("fibre")) return "fibres";
  if (value.includes("sodium") || value.includes("sel")) return "sodium";
  if (value.includes("potassium")) return "potassium";
  if (value.includes("magnesium") || value.includes("magnésium")) return "magnesium";
  if (value.includes("fer") || value.includes("iron")) return "fer";
  if (value.includes("vitamine_c") || value.includes("ascorb")) return "vitamine_c";
  return "";
};

const stableAiItemText = (item) => {
  if (item == null) return "";
  if (typeof item === "string" || typeof item === "number") return String(item);
  return (
    item.title ||
    item.label ||
    item.name ||
    item.reason ||
    item.description ||
    item.text ||
    JSON.stringify(item)
  );
};

const normalizeAiList = (value) => (Array.isArray(value) ? value : []);

const recipeIngredientsText = (recipe = {}) =>
  normalizeAiList(recipe.ingredients)
    .map((ingredient) => {
      if (typeof ingredient === "string") return ingredient;
      return [ingredient.name, ingredient.quantity || ingredient.qty].filter(Boolean).join(" ");
    })
    .filter(Boolean);

export default function MenuJournalierFromRation() {
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

  const nutritionTheme = useNutritionTheme();
  const panelBg = nutritionTheme.surfaceBg;
  const accentBg = nutritionTheme.surfaceGlow;
  const borderCol = nutritionTheme.borderColor;
  const textMuted = nutritionTheme.mutedText;

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState(null);

  // CIQUAL
  const [ciqualLoading, setCiqualLoading] = useState(true);
  const [ciqualError, setCiqualError] = useState("");
  const [ciqualData, setCiqualData] = useState([]);

  const [activeTab, setActiveTab] = useState(0); // 0 manual, 1 auto
  const [pdfLogoDataUrl, setPdfLogoDataUrl] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingAdvicePdf, setExportingAdvicePdf] = useState(false);
  const [menuPdfData, setMenuPdfData] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSelection, setShareSelection] = useState(() => allShareSections());
  const [patientNote, setPatientNote] = useState("");
  const [sharePatientNote, setSharePatientNote] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [aiCoachNote, setAiCoachNote] = useState("");
  const [savingAiFeedback, setSavingAiFeedback] = useState(false);
  const [showPatientRecipes, setShowPatientRecipes] = useState(false);
  const menuAutosaveHashRef = useRef("");
  const tabTouchedUntilRef = useRef(0);

  useEffect(() => {
    (async () => {
      const preferred = user?.logoUrl || user?.photoURL || user?.avatarUrl || "";
      const coachLogo = await toDataUrlSafe(preferred);
      const fallback = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      setPdfLogoDataUrl(coachLogo || fallback);
    })();
  }, [user?.avatarUrl, user?.logoUrl, user?.photoURL]);

  const coachPdfName = useMemo(() => getPersonName(user) || "Coach", [user]);

  const loadCiqual = useCallback(async () => {
    setCiqualLoading(true);
    setCiqualError("");
    try {
      const res = await fetch("/ciqual_2025.json", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const arr = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : [];

      if (!arr.length) throw new Error("Données alimentaires vides ou format inattendu");
      setCiqualData(arr);

      safeSetSmallLocal("byl_ciqual_2025_loaded_v1", String(Date.now()));
    } catch (e) {
      setCiqualData([]);
      setCiqualError("Chargement des données alimentaires impossible");
    } finally {
      setCiqualLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCiqual();
  }, [loadCiqual]);

  // Firestore subscribe
  useEffect(() => {
    if (!assessmentRef) return;

    const unsub = onSnapshot(
      assessmentRef,
      (snap) => {
        const d = snap.exists() ? snap.data() : null;
        setDocData(d);

        if (Date.now() > tabTouchedUntilRef.current) {
          const tab = d?.ration?.menuTab;
          const nextSelectedType = String(d?.ration?.selectedType || d?.ration?.mode || "").trim();
          if (tab === "auto") setActiveTab(1);
          else if (tab === "manual") setActiveTab(0);
          else if (nextSelectedType === "auto") setActiveTab(1);
          else if (nextSelectedType === "pro") setActiveTab(0);
        }

        setLoadingDoc(false);
      },
      () => setLoadingDoc(false)
    );

    return () => unsub();
  }, [assessmentRef]);

  const rationItems = useMemo(() => extractRationLines(docData), [docData]);

  const rationHasAnyQty = useMemo(() => {
    return rationItems.some((item) =>
      Object.values(item?.meals || {}).some((value) => rationMenuNum(value) > 0)
    );
  }, [rationItems]);
  const coveredMealsCount = useMemo(() => countRationMealsCovered(rationItems), [rationItems]);

  const isValidated = useMemo(() => {
    if (typeof docData?.validated === "boolean") return docData.validated;
    if (typeof docData?.inputs?.nutritionValidated === "boolean") return docData.inputs.nutritionValidated;
    if (typeof docData?.status === "string") return docData.status !== "draft";
    return true;
  }, [docData]);

  const blocked = !isValidated;

  const navigateWithFallback = useCallback(
    (path) => {
      navigate(path);
      window.setTimeout(() => {
        if (decodeURI(window.location.pathname) !== path) window.location.assign(path);
      }, 180);
    },
    [navigate]
  );

  const changeActiveTab = useCallback(
    (nextTab) => {
      const safeTab = nextTab === 1 ? 1 : 0;
      tabTouchedUntilRef.current = Date.now() + 8000;
      setActiveTab(safeTab);
      if (!assessmentRef || blocked) return;
      updateDoc(assessmentRef, {
        "ration.menuTab": safeTab === 1 ? "auto" : "manual",
        updatedAt: serverTimestamp(),
      }).catch((e) => {
        console.error("Menu mode save failed:", e);
      });
    },
    [assessmentRef, blocked]
  );

  const ciqualOk = !ciqualLoading && !ciqualError && ciqualData.length > 0;

  const selectedType = String(docData?.ration?.selectedType || docData?.ration?.mode || "").trim();
  const sourceLabel =
    selectedType === "auto"
      ? "Ration auto"
      : selectedType === "pro"
      ? "Ration manuelle"
      : "Source non identifiée";

  const needs = useMemo(
    () =>
      computeNutritionNeeds({
        inputs: docData?.inputs || {},
        computed: docData?.computed || {},
        objectiveRaw: docData?.inputs?.objectif || docData?.inputs?.objective || "",
      }),
    [docData]
  );
  const inputs = useMemo(() => docData?.inputs || {}, [docData]);
  const objectiveRaw = useMemo(() => String(needs?.objectiveRaw || inputs?.objectif || inputs?.objective || "").trim(), [needs?.objectiveRaw, inputs]);
  const diet = useMemo(() => normalizeDietList(inputs), [inputs]);
  const activeDiet = useMemo(
    () => diet.filter((item) => String(item || "").toLowerCase() !== "normal"),
    [diet]
  );
  const pathologies = useMemo(() => normalizePathologyList(inputs), [inputs]);
  const summaryAge = useMemo(
    () =>
      calcAgeFromDate(
        inputs?.dateNaissance || inputs?.date_naissance || inputs?.birthdate || inputs?.dob
      ),
    [inputs]
  );
  const patientName = useMemo(
    () => [inputs?.prenom, inputs?.nom].filter(Boolean).join(" ") || "Patient",
    [inputs]
  );
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

  const targets = useMemo(() => {
    const avg = (range) => {
      const min = rationMenuNum(range?.min);
      const max = rationMenuNum(range?.max);
      if (min > 0 && max > 0) return (min + max) / 2;
      return 0;
    };

    const bilan =
      rationMenuNum(needs?.kcalTarget) > 0
        ? {
            kcal: rationMenuNum(needs.kcalTarget),
            p: avg(needs?.protG),
            f: avg(needs?.lipG),
            c: avg(needs?.glucG),
          }
        : null;

    const selectedDay =
      docData?.ration?.selected?.computed?.totals?.day ||
      docData?.ration?.selected?.computed?.day ||
      null;

    const ration =
      selectedDay &&
      (rationMenuNum(selectedDay?.kcal) > 0 || rationMenuNum(selectedDay?.prot || selectedDay?.p) > 0)
        ? {
            kcal: rationMenuNum(selectedDay?.kcal),
            p: rationMenuNum(selectedDay?.prot || selectedDay?.p),
            f: rationMenuNum(selectedDay?.lip || selectedDay?.f),
            c: rationMenuNum(selectedDay?.glu || selectedDay?.c || selectedDay?.carbs),
          }
        : null;

    return { bilan, ration };
  }, [docData, needs]);

  const preferredMenuMicros = useMemo(() => {
    const selected =
      docData?.ration?.selected?.selectedNutrients ||
      docData?.ration?.auto?.selectedNutrients ||
      docData?.rationAuto?.selectedNutrients ||
      {};
    const fromRation = Object.entries(selected || {})
      .filter(([, enabled]) => enabled)
      .map(([key]) => inferMenuMicroKey(key))
      .filter(Boolean);
    return Array.from(new Set(["calcium", "fibres", ...fromRation]));
  }, [docData]);

  const [selectedAdviceSheetIds, setSelectedAdviceSheetIds] = useState([]);
  const adviceSelectionTouchedRef = useRef(false);
  const allAdviceSheets = useMemo(
    () => mergeAdviceSheets(docData?.nutritionAdviceSheets?.custom || []),
    [docData?.nutritionAdviceSheets?.custom]
  );
  const recommendedAdviceSheetIds = useMemo(() => {
    const ids = new Set(["base-alimentation", "equivalences", "hydration", "fruits-legumes-saison"]);
    const dietText = normalizeAdviceText(activeDiet.join(" "));
    const pathologyText = normalizeAdviceText(pathologies.join(" "));
    const objectiveText = normalizeAdviceText(objectiveRaw);
    const medicalText = normalizeAdviceText(
      collectAdviceSourceValues({
        regimes: inputs?.regimes,
        medical: inputs?.medical,
        notes: inputs?.notes,
      }).join(" ")
    );
    const foodNotesText = normalizeAdviceText(
      [inputs?.medical?.foodNotes, inputs?.medical?.antecedentsNutritionnels, inputs?.medical?.allergies]
        .filter(Boolean)
        .join(" ")
    );
    const allText = `${dietText} ${pathologyText} ${objectiveText} ${medicalText}`;
    const performanceText = `${objectiveText} ${normalizeAdviceText(inputs?.niveauSportif || "")} ${foodNotesText}`;

    if (allText.includes("gluten")) ids.add("sans-gluten");
    if (allText.includes("lactose")) ids.add("sans-lactose");
    if (allText.includes("diabet") || allText.includes("glycem")) {
      ids.add("diabete");
      ids.add("indice-glycemique");
    }
    if (allText.includes("hta") || allText.includes("hypertension") || allText.includes("tension")) ids.add("hypertension");
    if (allText.includes("cholesterol") || allText.includes("hyperchol")) ids.add("hypercholesterolemie");
    if (allText.includes("rgo") || allText.includes("reflux") || allText.includes("digest") || allText.includes("fodmap") || allText.includes("colon")) ids.add("digestif-rgo-fodmap");
    if (allText.includes("renal") || allText.includes("rein") || allText.includes("nephro")) ids.add("renal");
    if (allText.includes("veget") || allText.includes("vegan") || allText.includes("vegetalien")) ids.add("vegetarien-vegan");
    if (allText.includes("grossesse") || allText.includes("enceinte") || allText.includes("allait")) ids.add("grossesse-allaitement");
    if (allText.includes("perte") || allText.includes("maigr")) ids.add("perte-poids");
    const needsSportPerformanceSheets =
      performanceText.includes("prise de masse") ||
      performanceText.includes("prise masse") ||
      performanceText.includes("force") ||
      performanceText.includes("endurance") ||
      performanceText.includes("performance") ||
      performanceText.includes("confirme") ||
      performanceText.includes("confirmé") ||
      performanceText.includes("competition") ||
      performanceText.includes("compétition");
    if (needsSportPerformanceSheets) {
      ids.add("prise-masse-sport");
      ids.add("proteines-sport");
      ids.add("creatine");
    }
    if (allText.includes("sommeil") || allText.includes("fatigue")) ids.add("sommeil");
    if (allText.includes("anti age") || allText.includes("anti-age") || allText.includes("senior")) ids.add("anti-age");
    if (foodNotesText.includes("complement") || foodNotesText.includes("supplement")) {
      ids.add("complements");
    }
    if (allText.includes("tca") || allText.includes("anorex") || allText.includes("boulim") || allText.includes("compulsion")) ids.add("tca");

    return Array.from(ids).filter((id) => allAdviceSheets.some((sheet) => sheet.id === id));
  }, [activeDiet, allAdviceSheets, inputs, objectiveRaw, pathologies]);
  const selectedAdviceSheets = useMemo(() => {
    const set = new Set(selectedAdviceSheetIds);
    return allAdviceSheets.filter((sheet) => set.has(sheet.id)).map(getAdviceSheetPreview);
  }, [allAdviceSheets, selectedAdviceSheetIds]);
  const handleSelectedAdviceSheetIdsChange = useCallback((nextIds) => {
    adviceSelectionTouchedRef.current = true;
    setSelectedAdviceSheetIds(Array.isArray(nextIds) ? nextIds : []);
  }, []);

  const persistMenuDraft = useCallback(async () => {
    if (!assessmentRef || blocked) return undefined;

    const cleanPatientNote = String(patientNote || "").trim();
    await updateDoc(assessmentRef, {
      "ration.menuTab": activeTab === 1 ? "auto" : "manual",
      "nutritionAdviceSheets.selectedIds": selectedAdviceSheetIds,
      nutritionPatientNote: {
        text: cleanPatientNote,
        shared: !!sharePatientNote && cleanPatientNote.length > 0,
        updatedAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    });
    return true;
  }, [
    activeTab,
    assessmentRef,
    blocked,
    patientNote,
    selectedAdviceSheetIds,
    sharePatientNote,
  ]);

  useEffect(() => {
    if (!assessmentRef || blocked || !docData) return undefined;

    const cleanPatientNote = String(patientNote || "").trim();
    const payload = {
      menuTab: activeTab === 1 ? "auto" : "manual",
      selectedAdviceSheetIds,
      patientNote: cleanPatientNote,
      sharePatientNote: !!sharePatientNote && cleanPatientNote.length > 0,
    };
    const hash = JSON.stringify(payload);
    if (menuAutosaveHashRef.current === hash) return undefined;

    const timer = window.setTimeout(() => {
      menuAutosaveHashRef.current = hash;
      persistMenuDraft().catch((e) => {
        console.error("Menu autosave failed:", e);
        menuAutosaveHashRef.current = "";
      });
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    assessmentRef,
    blocked,
    docData,
    patientNote,
    persistMenuDraft,
    selectedAdviceSheetIds,
    sharePatientNote,
  ]);

  useEffect(() => {
    const saved = docData?.nutritionAdviceSheets?.selectedIds;
    if (Array.isArray(saved)) {
      if (adviceSelectionTouchedRef.current) {
        setSelectedAdviceSheetIds(saved);
        return;
      }
      const recommended = new Set(recommendedAdviceSheetIds);
      const next = saved.filter((id) => recommended.has(id) || String(id).startsWith("custom_"));
      setSelectedAdviceSheetIds(next.length ? next : recommendedAdviceSheetIds);
      return;
    }
    setSelectedAdviceSheetIds(recommendedAdviceSheetIds);
  }, [docData?.nutritionAdviceSheets?.selectedIds, recommendedAdviceSheetIds]);

  useEffect(() => {
    const savedNote = docData?.nutritionPatientNote;
    if (!savedNote || typeof savedNote !== "object") return;
    setPatientNote(String(savedNote.text || ""));
    setSharePatientNote(Boolean(savedNote.shared));
  }, [docData?.nutritionPatientNote?.shared, docData?.nutritionPatientNote?.text]);

  const goBack = useCallback(() => {
    navigateWithFallback(`/clients/${clientId}/nutrition/${assessmentId}/ration`);
  }, [assessmentId, clientId, navigateWithFallback]);

  const openShareModal = useCallback(async () => {
    if (!assessmentRef || blocked) return;
    try {
      await persistMenuDraft();
    } catch (e) {
      console.error("Menu draft save before next step failed:", e);
    }
    const previous = docData?.clientShare?.sections;
    const savedNote = docData?.nutritionPatientNote;
    setSharePatientNote(Boolean(savedNote?.shared && String(savedNote?.text || "").trim()));
    setShareSelection(
      previous && typeof previous === "object"
        ? {
            ...emptyShareSections(),
            ...previous,
          }
        : allShareSections()
    );
    setShareModalOpen(true);
  }, [assessmentRef, blocked, docData?.clientShare?.sections, docData?.nutritionPatientNote, persistMenuDraft]);

  const ciqualByCode = useMemo(() => {
    const map = new Map();
    (ciqualData || []).forEach((row) => {
      const code = ciqualCode(row);
      if (code) map.set(code, row);
    });
    return map;
  }, [ciqualData]);

  const fallbackPdfDays = useMemo(() => {
    const menuState = activeTab === 1 ? docData?.ration?.autoMenu : docData?.ration?.manualMenu;
    const mappingByDay = menuState?.mappingByDay && typeof menuState.mappingByDay === "object" ? menuState.mappingByDay : {};
    const days = Math.max(1, Math.min(31, rationMenuNum(menuState?.daysCount) || Object.keys(mappingByDay).length || 1));

    return Array.from({ length: days }, (_, index) => {
      const dayKey = String(index + 1);
      const map = mappingByDay?.[dayKey] || {};
      const meals = MENU_MEALS_ORDER.map((mealKey) => {
        const items = (rationItems || [])
          .filter((item) => rationMenuNum(item?.meals?.[mealKey]) > 0)
          .map((item) => {
            const raw = map?.[item.key];
            const entry =
              raw && typeof raw === "object"
                ? raw
                : raw
                ? { code: String(raw || ""), part: "" }
                : { code: "", part: "" };
            const row = entry.code ? ciqualByCode.get(String(entry.code || "")) : null;
            return {
              name: row ? ciqualName(row) : firstNonEmpty(item?.resolvedLabel, item?.key, "Aliment à associer"),
              qty: `${r0(item?.meals?.[mealKey])} ${item?.unit || ""}`.trim(),
            };
          });
        return {
          label:
            mealKey === "petit_dej"
              ? "Petit-déjeuner"
              : mealKey === "dejeuner"
              ? "Déjeuner"
              : mealKey === "diner"
              ? "Dîner"
              : "Collation",
          items: items.map((item) => ({ ...item, qty: item.qty || "—" })),
        };
      });
      return { label: `Jour ${dayKey}`, meals, totals: null };
    });
  }, [activeTab, ciqualByCode, docData?.ration?.autoMenu, docData?.ration?.manualMenu, rationItems]);

  const pdfDays = useMemo(() => {
    const sourceDays = Array.isArray(menuPdfData?.days) && menuPdfData.days.length ? menuPdfData.days : fallbackPdfDays;
    return sourceDays.map((day) => ({
      label: day.label || `Jour ${day.index || ""}`.trim(),
      totals: day.totals || null,
      meals: MENU_MEALS_ORDER.map((mealKey, mealIndex) => {
        const previewItems = day?.perMeal?.[mealKey] || [];
        if (previewItems.length) {
          return {
            label:
              mealKey === "petit_dej"
                ? "Petit-déjeuner"
                : mealKey === "dejeuner"
                ? "Déjeuner"
                : mealKey === "diner"
                ? "Dîner"
                : "Collation",
            items: previewItems.map((item) => ({
              name: item.text || item.name || "Aliment",
              qty: [item.qty, item.unit].filter(Boolean).join(" ") || (item.grams ? `${item.grams} g` : "—"),
            })),
          };
        }
        const fallbackMeal = (day.meals || [])[mealIndex];
        return fallbackMeal || { label: "Repas", items: [] };
      }),
    }));
  }, [fallbackPdfDays, menuPdfData]);

  const displayedMenuPlan = useMemo(
    () => ({
      days: (pdfDays || []).map((day, dayIndexValue) => ({
        id: day.label || `jour_${dayIndexValue + 1}`,
        label: day.label || `Jour ${dayIndexValue + 1}`,
        meals: (day.meals || []).map((meal, mealIndex) => ({
          id: `${dayIndexValue + 1}_${meal.label || mealIndex}`,
          label: meal.label || "Repas",
          items: (meal.items || [])
            .map((item) => ({
              name: item.name || item.text || "",
              qty: item.qty || [item.quantity, item.unit].filter(Boolean).join(" "),
              category: item.category || meal.label || "",
            }))
            .filter((item) => item.name && !/aliment à associer/i.test(item.name)),
        })),
      })),
    }),
    [pdfDays]
  );

  const displayedMenuMeals = useMemo(
    () =>
      (displayedMenuPlan.days || []).flatMap((day) =>
        (day.meals || []).map((meal) => ({
          ...meal,
          dayLabel: day.label,
        }))
      ),
    [displayedMenuPlan]
  );

  const nutritionAi = useMemo(() => docData?.nutritionAi || {}, [docData?.nutritionAi]);
  const aiPlan = useMemo(() => nutritionAi?.aiPlan || {}, [nutritionAi]);
  const aiFinalPlan = useMemo(() => nutritionAi?.finalPlan || {}, [nutritionAi]);
  const aiWarnings = useMemo(
    () => [
      ...normalizeAiList(nutritionAi?.coachAlerts),
      ...normalizeAiList(nutritionAi?.validation?.warnings),
      ...normalizeAiList(aiPlan?.warnings),
    ],
    [aiPlan?.warnings, nutritionAi?.coachAlerts, nutritionAi?.validation?.warnings]
  );
  const aiAdjustments = useMemo(
    () => normalizeAiList(aiPlan?.suggestedAdjustments || aiFinalPlan?.suggestedAdjustments),
    [aiFinalPlan?.suggestedAdjustments, aiPlan?.suggestedAdjustments]
  );
  const aiRecipes = useMemo(() => {
    const explicit = normalizeAiList(aiPlan?.recipes || aiFinalPlan?.recipes);
    const mealRecipes = displayedMenuMeals
      .filter((meal) => meal.items?.length >= 2)
      .slice(0, 28)
      .map((meal) =>
        generateRecipesFromMeal(meal)
      );
    if (mealRecipes.length) return mealRecipes;
    if (explicit.length) return explicit;
    const meals = normalizeAiList(aiPlan?.meals || aiFinalPlan?.meals);
    return meals.slice(0, 6).map((meal) => generateRecipesFromMeal(meal));
  }, [aiFinalPlan?.meals, aiFinalPlan?.recipes, aiPlan?.meals, aiPlan?.recipes, displayedMenuMeals]);
  const aiShoppingList = useMemo(() => {
    const fromDisplayedMenu = generateShoppingListFromNutritionPlan(displayedMenuPlan);
    if (fromDisplayedMenu.some((section) => normalizeAiList(section?.items).length)) return fromDisplayedMenu;
    const explicit = normalizeAiList(aiPlan?.shoppingList || aiFinalPlan?.shoppingList);
    if (explicit.length) return explicit;
    return generateShoppingListFromNutritionPlan(aiFinalPlan);
  }, [aiFinalPlan, aiPlan?.shoppingList, displayedMenuPlan]);
  const aiDecisions = useMemo(
    () => (nutritionAi?.coachDecisions && typeof nutritionAi.coachDecisions === "object" ? nutritionAi.coachDecisions : {}),
    [nutritionAi?.coachDecisions]
  );

  const saveAiDecision = useCallback(
    async (index, decision) => {
      if (!assessmentRef || blocked) return;
      const adjustment = aiAdjustments[index];
      const key = `adjustment_${index}`;
      const nextDecisions = {
        ...aiDecisions,
        [key]: {
          decision,
          text: stableAiItemText(adjustment),
          decidedAt: new Date().toISOString(),
          decidedBy: user?.uid || null,
        },
      };
      await updateDoc(assessmentRef, {
        "nutritionAi.coachDecisions": nextDecisions,
        updatedAt: serverTimestamp(),
      });
      await saveNutritionFeedback(
        clientId,
        {
          type: "coach",
          planId: assessmentId,
          correctionType: "other",
          originalValue: stableAiItemText(adjustment),
          newValue: decision,
          reason: decision === "accepted" ? "Suggestion IA acceptée" : "Suggestion IA refusée",
          validated: decision === "accepted",
        },
        { assessmentId, type: "coach" }
      );
    },
    [aiAdjustments, aiDecisions, assessmentId, assessmentRef, blocked, clientId, user?.uid]
  );

  const saveCoachAiNote = useCallback(async () => {
    const note = String(aiCoachNote || "").trim();
    if (!note || blocked) return;
    setSavingAiFeedback(true);
    try {
      await saveNutritionFeedback(
        clientId,
        {
          type: "coach",
          planId: assessmentId,
          correctionType: "other",
          originalValue: "",
          newValue: note,
          reason: "Retour coach pour les prochaines optimisations IA",
          validated: true,
        },
        { assessmentId, type: "coach" }
      );
      setAiCoachNote("");
      notify(toast, "saveSuccess", {
        title: "Retour enregistré",
        description: "Il sera repris dans les prochaines optimisations IA.",
      });
    } catch (e) {
      notify(toast, "saveError", {
        title: "Retour non enregistré",
        description: e?.message || "Impossible d'enregistrer ce retour.",
      });
    } finally {
      setSavingAiFeedback(false);
    }
  }, [aiCoachNote, assessmentId, blocked, clientId, toast]);

  const saveMenuAndShare = useCallback(
    async ({ share }) => {
      if (!assessmentRef || blocked) return;
      const sections = share ? { ...emptyShareSections(), ...shareSelection } : emptyShareSections();
      const cleanPatientNote = String(patientNote || "").trim();
      const hasSharedPatientNote = !!share && !!sharePatientNote && cleanPatientNote.length > 0;
      const hasSharedSection = SHARE_SECTION_KEYS.some((key) => !!sections[key]) || hasSharedPatientNote;

      if (share && !hasSharedSection) {
        notify(toast, "saveError", {
          title: "Aucune section sélectionnée",
          description: "Coche au moins une section à partager au client.",
        });
        return;
      }

      setSavingShare(true);
      try {
        const adviceSheetsToShare = sections.adviceSheets ? selectedAdviceSheets : [];
        await updateDoc(assessmentRef, {
          "ration.menuTab": activeTab === 1 ? "auto" : "manual",
          "nutritionAdviceSheets.selectedIds": selectedAdviceSheetIds,
          nutritionPatientNote: {
            text: cleanPatientNote,
            shared: hasSharedPatientNote,
            updatedAt: serverTimestamp(),
          },
          clientShare: {
            enabled: !!share && hasSharedSection,
            sections,
            sharedAt: share ? serverTimestamp() : null,
            sharedBy: share ? user?.uid || null : null,
            coachName: share ? coachPdfName : null,
            coachLogoUrl: share ? (user?.logoUrl || user?.photoURL || user?.avatarUrl || "") : null,
            snapshot: {
              menuMode: activeTab === 1 ? "auto" : "manual",
              menuView: menuPdfData?.view || "planning",
              menuDays: sections.menu ? pdfDays : [],
              recipes: sections.recipes ? aiRecipes : [],
              shoppingList: sections.shoppingList ? aiShoppingList : [],
              adviceSheets: adviceSheetsToShare,
              patientNote: hasSharedPatientNote ? { text: cleanPatientNote } : null,
            },
          },
          updatedAt: serverTimestamp(),
        });
        notify(toast, share ? "saveSuccess" : "nutritionSaved", {
          title: share ? "Partage client mis à jour" : "Bilan sauvegardé",
          description: share
            ? "Le client verra uniquement les sections cochées."
            : "Rien n’est visible côté client pour ce bilan.",
        });
        setShareModalOpen(false);
        navigateWithFallback(`/clients/${clientId}`);
      } catch (e) {
        notify(toast, "saveError", {
          title: "Sauvegarde impossible",
          description: e?.message || "Impossible de sauvegarder le partage.",
        });
      } finally {
        setSavingShare(false);
      }
    },
    [
      activeTab,
      assessmentRef,
      blocked,
      clientId,
      docData?.ration,
      docData?.nutritionAdviceSheets,
      menuPdfData?.view,
      aiRecipes,
      aiShoppingList,
      navigateWithFallback,
      pdfDays,
      patientNote,
      selectedAdviceSheetIds,
      selectedAdviceSheets,
      sharePatientNote,
      shareSelection,
      toast,
      coachPdfName,
      user?.avatarUrl,
      user?.logoUrl,
      user?.photoURL,
      user?.uid,
    ]
  );

  const handleDownloadPDF = useCallback(async () => {
    setExportingPdf(true);
    try {
      const now = new Date();
      const blob = await pdf(
        <MenuPdfDoc
          clientName={patientName}
          coachName={coachPdfName}
          title="Menu journalier"
          subtitle={
            menuPdfData?.view === "edit"
              ? `Jour ${menuPdfData.currentDay}`
              : "Planning"
          }
          logoDataUrl={pdfLogoDataUrl}
          days={pdfDays}
          date={now}
          adviceSheets={selectedAdviceSheets}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const clientBase = (patientName || "client").replace(/\s+/g, "_").toLowerCase();
      const filename = `menu_journalier-${clientBase}-BYL.pdf`;
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
        description: e?.message || "Impossible de générer le PDF du menu.",
      });
    } finally {
      setExportingPdf(false);
    }
  }, [coachPdfName, menuPdfData?.currentDay, menuPdfData?.view, patientName, pdfDays, pdfLogoDataUrl, selectedAdviceSheets, toast]);

  const handleDownloadAdviceSheetsPDF = useCallback(async () => {
    setExportingAdvicePdf(true);
    try {
      const now = new Date();
      const blob = await pdf(
        <AdviceSheetsPdfDoc
          clientName={patientName}
          coachName={coachPdfName}
          logoDataUrl={pdfLogoDataUrl}
          sheets={selectedAdviceSheets}
          date={now}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const clientBase = (patientName || "client").replace(/\s+/g, "_").toLowerCase();
      const filename = `fiches_conseils-${clientBase}-BYL.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.open(url, "_blank", "noopener,noreferrer");
      notify(toast, "pdfReady", {
        title: "PDF fiches conseils généré",
        description: "Les fiches sélectionnées sont prêtes.",
      });
    } catch (e) {
      notify(toast, "pdfError", {
        description: e?.message || "Impossible de générer le PDF des fiches conseils.",
      });
    } finally {
      setExportingAdvicePdf(false);
    }
  }, [coachPdfName, patientName, pdfLogoDataUrl, selectedAdviceSheets, toast]);

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

  if (loadingDoc) {
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
    <Box minH="100vh" p={{ base: 4, md: 6 }} bg={nutritionTheme.pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={6}>
        <Box {...nutritionTheme.cardProps} overflow="hidden">
          <Box bg={accentBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <HStack justify="space-between" align="center" gap={4} flexWrap="wrap">
              <HStack spacing={3} flexWrap="wrap">
                <Button variant="outline" onClick={goBack}>
                  Retour
                </Button>
                <Box>
                  <HStack spacing={2} flexWrap="wrap">
                    <Heading size="md">Menu journalier</Heading>
                    <Badge colorScheme={blocked ? "yellow" : "green"}>
                      {blocked ? "Bilan à finaliser" : "Prêt"}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color={textMuted} mt={1}>
                    Base menu construite à partir de la ration retenue.
                  </Text>
                </Box>
              </HStack>

              <HStack spacing={2}>
                <Button variant="outline" onClick={loadCiqual} isLoading={ciqualLoading} loadingText="Chargement…">
                  Actualiser les données
                </Button>
                <Tooltip label="Télécharger le PDF">
                  <IconButton
                    aria-label="Télécharger le PDF"
                    icon={<DownloadIcon />}
                    variant="outline"
                    onClick={handleDownloadPDF}
                    isLoading={exportingPdf}
                  />
                </Tooltip>
              </HStack>
            </HStack>

            <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={3} mt={5}>
              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  DOSSIER
                </Text>
                <Text mt={1} fontSize="xl" fontWeight="900" noOfLines={1}>
                  {patientName}
                </Text>
                <Text fontSize="sm" color={textMuted}>
                  {clientSummary || "Contexte général à compléter"}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  CADRE NUTRITION
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {objectiveRaw || "Objectif à préciser"}
                </Text>
                <Text fontSize="sm" color={textMuted} noOfLines={2}>
                  {[activeDiet.length ? activeDiet.join(", ") : "Aucun régime spécifique", pathologies.length ? pathologies.slice(0, 2).join(", ") : "Aucune pathologie"].join(" • ")}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="xl" bg={panelBg}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                  RATION ET DONNÉES
                </Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {sourceLabel}
                </Text>
                <HStack mt={2} spacing={2} flexWrap="wrap">
                  <Badge colorScheme={rationHasAnyQty ? "green" : "orange"}>
                    {targets?.ration?.kcal ? `Ration ${r0(targets.ration.kcal)} kcal` : "Ration à relire"}
                  </Badge>
                  <Badge colorScheme={coveredMealsCount === MENU_MEALS_ORDER.length ? "green" : "blue"}>
                    {coveredMealsCount}/{MENU_MEALS_ORDER.length} repas
                  </Badge>
                  <Badge colorScheme={ciqualOk ? "green" : "red"}>
                    {ciqualOk ? "Données prêtes" : "Données à charger"}
                  </Badge>
                </HStack>
              </Box>
            </SimpleGrid>

            {!ciqualOk ? (
              <Alert status="error" rounded="xl" mt={4}>
                <AlertIcon />
                <Box>
                  <AlertTitle>Données alimentaires non chargées</AlertTitle>
                  <AlertDescription>
                    {ciqualError ||
                      "Impossible de charger les données alimentaires nécessaires à la génération."}
                  </AlertDescription>
                </Box>
              </Alert>
            ) : null}

            {!rationItems.length || !rationHasAnyQty ? (
              <Alert status="warning" rounded="xl" mt={4}>
                <AlertIcon />
                <Box>
                  <AlertTitle>La ration n’est pas encore exploitable pour le menu</AlertTitle>
                  <AlertDescription>
                    Retourne sur la page ration puis sauvegarde explicitement l’étape avant de revenir ici.
                  </AlertDescription>
                </Box>
              </Alert>
            ) : null}
          </Box>
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
            ÉTAPE 1
          </Text>
          <Heading size="sm" mt={1}>
            Choix de la méthode
          </Heading>
          <HStack mt={4} spacing={0} borderWidth="1px" borderColor={borderCol} borderRadius="xl" overflow="hidden" w="fit-content" maxW="100%" flexWrap="wrap">
            <Button
              borderRadius="0"
              variant={activeTab === 0 ? "solid" : "ghost"}
              colorScheme="blue"
              onClick={() => changeActiveTab(0)}
              isDisabled={blocked}
            >
              Manuel
            </Button>
            <Button
              borderRadius="0"
              variant={activeTab === 1 ? "solid" : "ghost"}
              colorScheme="purple"
              onClick={() => changeActiveTab(1)}
              isDisabled={blocked}
            >
              Auto
            </Button>
          </HStack>
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
            ÉTAPE 2
          </Text>
          <Heading size="sm" mt={1}>
            Construction du menu
          </Heading>
          <Text fontSize="sm" color={textMuted} mt={1} mb={4}>
            {activeTab === 0
              ? "Le mode manuel te laisse choisir précisément les aliments détaillés."
              : "Le mode auto génère une base multi-jours, à relire avant validation."}
          </Text>

          {activeTab === 0 ? (
            <MenuJournalierManual
              assessmentRef={assessmentRef}
              docData={docData}
              rationItems={rationItems}
              ciqualOk={ciqualOk}
              ciqualData={ciqualData}
              targets={targets}
              preferredMicros={preferredMenuMicros}
              onPdfDataChange={setMenuPdfData}
              blocked={blocked}
            />
          ) : (
            <MenuJournalierAuto
              assessmentRef={assessmentRef}
              docData={docData}
              rationItems={rationItems}
              ciqualOk={ciqualOk}
              ciqualData={ciqualData}
              targets={targets}
              preferredMicros={preferredMenuMicros}
              onPdfDataChange={setMenuPdfData}
              blocked={blocked}
            />
          )}
        </Box>

        <Box borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>
                SORTIES PATIENT
              </Text>
              <Heading size="sm" mt={1}>
                Recettes et liste de courses
              </Heading>
              <Text fontSize="sm" color={textMuted} mt={1}>
                Préparées à partir du menu affiché, avec les quantités validées.
              </Text>
            </Box>
            <HStack spacing={2} flexWrap="wrap">
              <Button size="sm" variant="outline" onClick={() => setShowPatientRecipes((prev) => !prev)}>
                {showPatientRecipes ? "Masquer les recettes" : "Voir les recettes jour par jour"}
              </Button>
              <Badge colorScheme="green" px={3} py={1} borderRadius="full">
                Prêt à partager
              </Badge>
            </HStack>
          </HStack>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4} mt={4} alignItems="start">
            <Box borderWidth="1px" borderColor={borderCol} borderRadius="xl" p={4} bg={nutritionTheme.surfaceSoft}>
              <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
                <Heading size="xs">Recettes jour par jour</Heading>
                <Badge colorScheme="blue">{aiRecipes.length}</Badge>
              </HStack>
              <Stack spacing={3} mt={3}>
                {!showPatientRecipes ? (
                  <Text fontSize="sm" color={textMuted}>
                    Les recettes sont prêtes pour le partage patient. Ouvre-les uniquement si tu veux les relire côté pro.
                  </Text>
                ) : aiRecipes.length ? (
                  aiRecipes.map((recipe, index) => (
                    <Box key={`ai_recipe_${index}`} borderWidth="1px" borderColor={borderCol} borderRadius="lg" p={3} bg={panelBg}>
                      <Text fontWeight="900">{recipe.name || recipe.title || `Recette ${index + 1}`}</Text>
                      <Text fontSize="xs" color={textMuted} mt={1}>
                        {[recipe.dayLabel, recipe.mealLabel].filter(Boolean).join(" • ")}
                        {recipe.dayLabel || recipe.mealLabel ? " · " : ""}
                        Prépa {recipe.preparationTimeMin || recipe.prepTimeMin || "—"} min • Cuisson {recipe.cookingTimeMin || recipe.cookTimeMin || "—"} min
                      </Text>
                      <Wrap spacing={1.5} mt={2}>
                        {recipeIngredientsText(recipe).slice(0, 6).map((ingredient) => (
                          <WrapItem key={ingredient}>
                            <Badge variant="subtle" colorScheme="blue">
                              {ingredient}
                            </Badge>
                          </WrapItem>
                        ))}
                      </Wrap>
                      {normalizeAiList(recipe.steps).length ? (
                        <Stack spacing={1} mt={3}>
                          {normalizeAiList(recipe.steps).slice(0, 6).map((step, stepIndex) => (
                            <Text key={`step_${stepIndex}`} fontSize="sm">
                              {stepIndex + 1}. {stableAiItemText(step)}
                            </Text>
                          ))}
                        </Stack>
                      ) : null}
                      <Text fontSize="xs" color={textMuted} mt={3}>
                        Nutrition: recalcul CIQUAL uniquement.
                      </Text>
                    </Box>
                  ))
                ) : (
                  <Text fontSize="sm" color={textMuted}>
                    Les recettes apparaîtront après une optimisation IA validée ou dès qu’un menu exploitable sera structuré en repas.
                  </Text>
                )}
              </Stack>
            </Box>

            <Box borderWidth="1px" borderColor={borderCol} borderRadius="xl" p={4} bg={nutritionTheme.surfaceSoft}>
              <Heading size="xs">Liste de courses</Heading>
              <Stack spacing={3} mt={3}>
                {aiShoppingList.some((section) => normalizeAiList(section?.items).length) ? (
                  aiShoppingList.map((section) =>
                    normalizeAiList(section?.items).length ? (
                      <Box key={section.section || section.label} borderWidth="1px" borderColor={borderCol} borderRadius="lg" p={3} bg={panelBg}>
                        <Text fontSize="sm" fontWeight="900">
                          {section.label || section.section || "Rayon"}
                        </Text>
                        <Stack spacing={1} mt={2}>
                          {normalizeAiList(section.items).slice(0, 8).map((item, index) => (
                            <Text key={`${section.section}_${index}`} fontSize="sm">
                              {item.name || item.label} {item.quantity ? `• ${item.quantity} ${item.unit || ""}` : ""}
                            </Text>
                          ))}
                        </Stack>
                      </Box>
                    ) : null
                  )
                ) : (
                  <Text fontSize="sm" color={textMuted}>
                    Aucune liste de courses exploitable pour le moment.
                  </Text>
                )}
              </Stack>
            </Box>
          </SimpleGrid>
        </Box>

        <NutritionAdviceSheetsPanel
          clientId={clientId}
          assessmentId={assessmentId}
          docData={docData}
          selectedIds={selectedAdviceSheetIds}
          onSelectedIdsChange={handleSelectedAdviceSheetIdsChange}
          patientNote={patientNote}
          onPatientNoteChange={setPatientNote}
          patientNoteShared={sharePatientNote}
          onPatientNoteSharedChange={setSharePatientNote}
          onDownloadPdf={handleDownloadAdviceSheetsPDF}
          isDownloadingPdf={exportingAdvicePdf}
          blocked={blocked}
          theme={nutritionTheme}
        />

        <Box p={4} borderWidth="1px" borderColor={borderCol} borderRadius="2xl" bg={panelBg}>
          <HStack spacing={3} flexWrap="wrap" align="center" justify="space-between">
            <Button variant="outline" onClick={goBack}>
              Retour
            </Button>

            <Button
              {...nutritionTheme.primaryButtonProps}
              onClick={openShareModal}
              isDisabled={blocked}
              isLoading={savingShare}
            >
              Étape suivante
            </Button>
          </HStack>
        </Box>
      </Stack>

      <Modal isOpen={shareModalOpen} onClose={() => setShareModalOpen(false)} size="xl" isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="2xl" bg={panelBg}>
          <ModalHeader>Validation du suivi client</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text color={textMuted} fontSize="sm">
              Choisis ce que le client pourra consulter dans son espace. Si tu sauvegardes sans
              partager, le dossier reste uniquement visible côté professionnel.
            </Text>

            <Stack spacing={3} mt={5}>
              <Checkbox
                isChecked={SHARE_SECTION_KEYS.every((key) => !!shareSelection[key]) && (!patientNote.trim() || !!sharePatientNote)}
                isIndeterminate={
                  (SHARE_SECTION_KEYS.some((key) => !!shareSelection[key]) || !!sharePatientNote) &&
                  !(SHARE_SECTION_KEYS.every((key) => !!shareSelection[key]) && (!patientNote.trim() || !!sharePatientNote))
                }
                onChange={(e) => {
                  setShareSelection(e.target.checked ? allShareSections() : emptyShareSections());
                  setSharePatientNote(e.target.checked && !!patientNote.trim());
                }}
              >
                Tout partager
              </Checkbox>
              <Divider />
              <Checkbox
                isChecked={!!shareSelection.summary}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, summary: e.target.checked }))}
              >
                Résumé du bilan et objectifs
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.foodSurvey}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, foodSurvey: e.target.checked }))}
              >
                Ration spontanée / habitudes alimentaires
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.ration}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, ration: e.target.checked }))}
              >
                Ration alimentaire construite
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.menu}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, menu: e.target.checked }))}
              >
                Menu journalier
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.recipes}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, recipes: e.target.checked }))}
              >
                Recettes jour par jour ({aiRecipes.length})
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.shoppingList}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, shoppingList: e.target.checked }))}
              >
                Liste de courses
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.adviceSheets}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, adviceSheets: e.target.checked }))}
              >
                Fiches conseils sélectionnées ({selectedAdviceSheetIds.length})
              </Checkbox>
              <Checkbox
                isChecked={!!sharePatientNote}
                onChange={(e) => setSharePatientNote(e.target.checked)}
                isDisabled={!patientNote.trim()}
              >
                Note patient personnalisée
              </Checkbox>
              <Textarea
                value={patientNote}
                onChange={(e) => setPatientNote(e.target.value)}
                placeholder="Note visible côté patient si elle est cochée..."
                minH="90px"
              />
            </Stack>
          </ModalBody>
          <ModalFooter gap={3} flexWrap="wrap">
            <Button variant="outline" onClick={() => saveMenuAndShare({ share: false })} isLoading={savingShare}>
              Sauvegarder sans partager
            </Button>
            <Button {...nutritionTheme.primaryButtonProps} onClick={() => saveMenuAndShare({ share: true })} isLoading={savingShare}>
              Sauvegarder & partager
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
