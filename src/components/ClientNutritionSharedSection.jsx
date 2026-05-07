/* eslint-disable react/prop-types */
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
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "./ui/AppLoading";

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

const formatDate = (value) => {
  try {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("fr-FR");
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
  const dateStr = sharedDate || new Date().toLocaleDateString("fr-FR");
  const hasMenuDays = Array.isArray(menuDays) && menuDays.some((day) => day?.meals?.some((meal) => meal.items?.length));
  const hasAdviceSheets = Array.isArray(adviceSheets) && adviceSheets.length > 0;
  return (
    <Document>
      <Page size="A4" style={clientPdfStyles.page}>
        <View style={clientPdfStyles.header} fixed>
          <View style={clientPdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={clientPdfStyles.logo} /> : null}
            <PdfText style={clientPdfStyles.coachName}>{coachName || "Coach"}</PdfText>
          </View>
          <View style={clientPdfStyles.headerCenter}>
            <PdfText style={clientPdfStyles.title}>{title || "Plan nutrition"}</PdfText>
            <PdfText style={clientPdfStyles.subtitle}>Suivi nutrition</PdfText>
          </View>
          <View style={clientPdfStyles.headerRight}>
            <PdfText style={clientPdfStyles.clientName}>{clientName || "Patient"}</PdfText>
            <PdfText style={clientPdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        {sections.ration ? (
          <View>
            <PdfText style={clientPdfStyles.sectionTitle}>Ration alimentaire</PdfText>
            <View style={clientPdfStyles.card} wrap={false}>
              <PdfText style={clientPdfStyles.value}>
                {rationTotals.kcal ? `${r0(rationTotals.kcal)} kcal` : "Ration partagée"} • Prot {r0(rationTotals.p)} g • Lipides {r0(rationTotals.f)} g • Glucides {r0(rationTotals.c)} g
              </PdfText>
            </View>
            {MENU_MEALS_ORDER.map((mealKey) =>
              rationByMeal[mealKey]?.length ? (
                <View key={mealKey} style={clientPdfStyles.card} wrap={false}>
                  <PdfText style={clientPdfStyles.value}>{MENU_MEAL_LABEL[mealKey]}</PdfText>
                  {rationByMeal[mealKey].map((row, idx) => (
                    <PdfText key={`${mealKey}-${idx}`} style={[clientPdfStyles.line, { marginTop: idx === 0 ? 6 : 0 }]}>
                      • {row.group ? `${row.group} - ` : ""}{row.label}{" "}
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
            <PdfText style={clientPdfStyles.sectionTitle}>Menu</PdfText>
            {(menuDays || []).map((day) => (
              <View key={day.label} style={clientPdfStyles.card} wrap={false}>
                <PdfText style={clientPdfStyles.value}>
                  {day.label}{day?.totals?.kcal ? ` • ${r0(day.totals.kcal)} kcal` : ""}
                </PdfText>
                {(day.meals || []).filter((meal) => meal.items?.length).map((meal) => (
                  <View key={`${day.label}-${meal.label}`} style={{ marginTop: 6 }}>
                    <PdfText style={clientPdfStyles.label}>{meal.label}</PdfText>
                    {meal.items.map((item, idx) => (
                      <PdfText key={`${meal.label}-${idx}`} style={clientPdfStyles.line}>
                        • {item.name} <PdfText style={clientPdfStyles.muted}>({item.qty})</PdfText>
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
            <PdfText style={clientPdfStyles.sectionTitle}>Conseils partagés</PdfText>
            {hasAdviceSheets ? (
              adviceSheets.map((sheet, idx) => (
                <View key={sheet.id || idx} style={clientPdfStyles.card} wrap={false}>
                  <PdfText style={clientPdfStyles.value}>{sheet.title || sheet.category || `Conseil ${idx + 1}`}</PdfText>
                  {sheet.category ? (
                    <PdfText style={[clientPdfStyles.line, clientPdfStyles.muted]}>Catégorie : {sheet.category}</PdfText>
                  ) : null}
                  {sheet.summary ? (
                    <PdfText style={[clientPdfStyles.line, { marginTop: 6 }]}>{sheet.summary}</PdfText>
                  ) : null}
                  {(sheet.keyPoints || []).length ? (
                    <View style={{ marginTop: 6 }}>
                      <PdfText style={clientPdfStyles.label}>À retenir</PdfText>
                      {sheet.keyPoints.map((point, kpIndex) => (
                        <PdfText key={`kp-${kpIndex}`} style={clientPdfStyles.line}>• {point}</PdfText>
                      ))}
                    </View>
                  ) : null}
                  {(sheet.practicalTips || []).length ? (
                    <View style={{ marginTop: 6 }}>
                      <PdfText style={clientPdfStyles.label}>Conseils pratiques</PdfText>
                      {sheet.practicalTips.map((tip, ptIndex) => (
                        <PdfText key={`pt-${ptIndex}`} style={clientPdfStyles.line}>• {tip}</PdfText>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <View style={clientPdfStyles.card} wrap={false}>
                <PdfText style={clientPdfStyles.line}>Aucune fiche conseil détaillée n’est disponible dans ce partage.</PdfText>
              </View>
            )}
          </View>
        ) : null}

        <View style={clientPdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={clientPdfStyles.footerLogo} /> : null}
          <PdfText style={clientPdfStyles.footerText}>Généré avec BoostYourLife.coach</PdfText>
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
        label: item?.name || item?.label || "Aliment",
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
            label: line?.resolvedLabel || line?.label || line?.key || "Aliment",
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
      const key = recipe.dayLabel || recipe.day || "Jour 1";
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
      ) || "Patient",
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
      ) || "Coach",
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
  const panels = [
    sections.summary
      ? {
          key: "summary",
          title: "Résumé",
          eyebrow: "Objectifs",
          value: needs?.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : "Repères",
          helper: [diet.join(", "), pathologies.slice(0, 2).join(", ")].filter(Boolean).join(" • ") || "Contexte partagé",
          accent: "#3B82F6",
          bg: "rgba(59,130,246,0.10)",
        }
      : null,
    sections.foodSurvey
      ? {
          key: "foodSurvey",
          title: "Habitudes",
          eyebrow: "Ration spontanée",
          value: `${foodSurveyRows.length} ligne(s)`,
          helper: "Clique pour voir le relevé partagé.",
          accent: "#10B981",
          bg: "rgba(16,185,129,0.10)",
        }
      : null,
    sections.ration
      ? {
          key: "ration",
          title: "Ration",
          eyebrow: "Ration alimentaire",
          value: rationTotals.kcal ? `${r0(rationTotals.kcal)} kcal` : `${rationRows.length} ligne(s)`,
          helper: `P ${r0(rationTotals.p)} g • L ${r0(rationTotals.f)} g • G ${r0(rationTotals.c)} g`,
          accent: "#F59E0B",
          bg: "rgba(245,158,11,0.12)",
        }
      : null,
    sections.menu
      ? {
          key: "menu",
          title: "Menu",
          eyebrow: "Journées proposées",
          value: `${menuDays.length || 1} jour(s)`,
          helper: "Clique pour voir les repas.",
          accent: "#8B5CF6",
          bg: "rgba(139,92,246,0.12)",
        }
      : null,
    sections.recipes
      ? {
          key: "recipes",
          title: "Recettes",
          eyebrow: "Préparation",
          value: `${recipes.length} recette(s)`,
          helper: "Clique pour voir les recettes proposées.",
          accent: "#EC4899",
          bg: "rgba(236,72,153,0.10)",
        }
      : null,
    sections.shoppingList
      ? {
          key: "shoppingList",
          title: "Courses",
          eyebrow: "Liste de courses",
          value: `${shoppingList.reduce((sum, section) => sum + (section.items?.length || 0), 0)} aliment(s)`,
          helper: "Clique pour voir les achats regroupés.",
          accent: "#14B8A6",
          bg: "rgba(20,184,166,0.10)",
        }
      : null,
    sections.adviceSheets
      ? {
          key: "adviceSheets",
          title: "Conseils",
          eyebrow: "Fiches partagées",
          value: `${adviceSheets.length} fiche(s)`,
          helper: "Clique pour voir les conseils personnalisés.",
          accent: "#0F766E",
          bg: "rgba(15,118,110,0.12)",
        }
      : null,
  ].filter(Boolean);

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
          title="Plan nutrition"
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

  if (loading) return <AppLoading label="Chargement du suivi nutrition..." minH="180px" />;
  if (!latest) {
    return (
      <Box {...theme.cardProps} p={{ base: 4, md: 5 }}>
        <Heading size="sm">Aucun suivi nutrition partagé</Heading>
        <Text color={theme.mutedText} mt={2}>
          Ton coach n’a pas encore partagé de menu, recette ou liste de courses sur cette fiche client.
        </Text>
      </Box>
    );
  }

  if (variant === "compact") {
    const sharedCount = assessments.length;
    return (
      <Box mb={5} p={{ base: 4, md: 5 }} {...theme.cardProps}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <Box>
            <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
              NUTRITION
            </Text>
            <Heading size="md" mt={1}>
              Suivi nutrition
            </Heading>
            <Text fontSize="sm" color={theme.mutedText} mt={1}>
              Dernier partage{sharedDate ? ` le ${sharedDate}` : ""} • {sharedCount} bilan(s) disponible(s)
            </Text>
          </Box>
          <HStack spacing={2}>
            <Tooltip label="Télécharger le plan nutrition en PDF">
              <IconButton
                aria-label="Télécharger le plan nutrition"
                icon={<DownloadIcon />}
                borderRadius="full"
                variant="outline"
                onClick={downloadPdf}
                isLoading={exportingPdf}
              />
            </Tooltip>
            <Button borderRadius="full" colorScheme="blue" onClick={onOpenNutrition}>
              Ouvrir
            </Button>
          </HStack>
        </HStack>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mt={4}>
          <Box {...theme.tileProps} p={4} bg="rgba(59,130,246,0.08)">
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>OBJECTIF</Text>
            <Text mt={1} fontWeight="900" noOfLines={1}>{needs?.objectiveRaw || inputs?.objectif || "Suivi nutrition"}</Text>
            <Text fontSize="sm" color={theme.mutedText} noOfLines={1}>{diet.join(", ") || "Aucun régime spécifique"}</Text>
          </Box>
          <Box {...theme.tileProps} p={4} bg="rgba(16,185,129,0.08)">
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>REPÈRE JOUR</Text>
            <Text mt={1} fontWeight="900">{needs?.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : "À ajuster"}</Text>
            <Text fontSize="sm" color={theme.mutedText}>
              P {needs?.protG?.min ? `${r0(needs.protG.min)}-${r0(needs.protG.max)} g` : "—"} • L {needs?.lipG?.min ? `${r0(needs.lipG.min)}-${r0(needs.lipG.max)} g` : "—"} • G {needs?.glucG?.min ? `${r0(needs.glucG.min)}-${r0(needs.glucG.max)} g` : "—"}
            </Text>
          </Box>
          <Box {...theme.tileProps} p={4} bg="rgba(139,92,246,0.08)">
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>PARTAGÉ</Text>
            <Wrap spacing={2} mt={2}>
              {sections.summary ? <Badge borderRadius="full" px={3} py={1}>Résumé</Badge> : null}
              {sections.foodSurvey ? <Badge borderRadius="full" px={3} py={1}>Habitudes</Badge> : null}
              {sections.ration ? <Badge borderRadius="full" px={3} py={1}>Ration</Badge> : null}
              {sections.menu ? <Badge borderRadius="full" px={3} py={1}>Menu</Badge> : null}
              {sections.recipes ? <Badge borderRadius="full" px={3} py={1}>Recettes</Badge> : null}
              {sections.shoppingList ? <Badge borderRadius="full" px={3} py={1}>Courses</Badge> : null}
              {sections.adviceSheets ? <Badge borderRadius="full" px={3} py={1}>Conseils</Badge> : null}
            </Wrap>
          </Box>
        </SimpleGrid>
      </Box>
    );
  }

  return (
    <Box mb={6} p={{ base: 4, md: 5 }} {...theme.cardProps}>
      {assessments.length > 1 ? (
        <Box mb={4}>
          <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText} mb={2}>
            HISTORIQUE DU SUIVI
          </Text>
          <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3}>
            {assessments.map((assessment, index) => {
              const isActive = assessment.id === latest?.id;
              const assessmentInputs = assessment?.inputs || {};
              const objective = assessmentInputs?.objectif || assessmentInputs?.objective || "Bilan nutrition";
              const date = formatDate(assessment?.clientShare?.sharedAt || assessment?.updatedAt);
              const extraDiet = normalizeDietList(assessmentInputs).filter((item) => String(item || "").toLowerCase() !== "normal");
              const extraPathologies = normalizePathologyList(assessmentInputs);
              return (
                <Box
                  key={assessment.id}
                  {...theme.tileProps}
                  p={4}
                  cursor="pointer"
                  borderColor={isActive ? "#3B82F6" : theme.borderColor}
                  bg={isActive ? "rgba(59,130,246,0.08)" : theme.surfaceBg}
                  onClick={() => setSelectedAssessmentId(assessment.id)}
                  _hover={{ transform: "translateY(-1px)", borderColor: "#3B82F6" }}
                >
                  <HStack justify="space-between" align="start" mb={2}>
                    <Text fontWeight="900">Bilan {assessments.length - index}</Text>
                    <Badge borderRadius="full" px={3} py={1}>{date || "Récent"}</Badge>
                  </HStack>
                  <Text fontWeight="800" noOfLines={1}>{objective}</Text>
                  <Text fontSize="sm" color={theme.mutedText} mt={1} noOfLines={2}>
                    {[...extraDiet, ...extraPathologies].join(" • ") || "Sans contrainte particulière"}
                  </Text>
                </Box>
              );
            })}
          </SimpleGrid>
        </Box>
      ) : null}

      <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={4}>
        <Box>
          <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
            SUIVI NUTRITION
          </Text>
          <Heading size="md" mt={1}>
            Ton plan nutrition
          </Heading>
          <Text fontSize="sm" color={theme.mutedText} mt={1}>
            Dernière mise à jour partagée par ton professionnel
            {sharedDate ? ` le ${sharedDate}` : ""}.
          </Text>
        </Box>
        <HStack spacing={2} align="center" flexWrap="wrap" justify="flex-end">
          <Wrap spacing={2}>
            {sections.summary ? <Badge borderRadius="full" px={3} py={1}>Résumé</Badge> : null}
            {sections.foodSurvey ? <Badge borderRadius="full" px={3} py={1}>Habitudes</Badge> : null}
            {sections.ration ? <Badge borderRadius="full" px={3} py={1}>Ration</Badge> : null}
            {sections.menu ? <Badge borderRadius="full" px={3} py={1}>Menu</Badge> : null}
            {sections.recipes ? <Badge borderRadius="full" px={3} py={1}>Recettes</Badge> : null}
            {sections.shoppingList ? <Badge borderRadius="full" px={3} py={1}>Courses</Badge> : null}
            {sections.adviceSheets ? <Badge borderRadius="full" px={3} py={1}>Conseils</Badge> : null}
          </Wrap>
          <Tooltip label="Télécharger le plan nutrition en PDF">
            <IconButton
              aria-label="Télécharger le plan nutrition"
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
        <HStack spacing={2} overflowX="auto" pb={2} sx={{ scrollbarWidth: "none" }}>
          {panels.map((panel) => (
            <Button
              key={panel.key}
              size="sm"
              flexShrink={0}
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
          <Box {...theme.tileProps} p={4} bg={activePanelMeta.bg} borderColor={activePanelMeta.accent}>
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

      <SimpleGrid display={{ base: "none", md: "grid" }} columns={{ md: 2, xl: 4 }} spacing={3} mb={4}>
        {panels.map((panel) => (
          <Box
            key={panel.key}
            {...theme.tileProps}
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
                {activePanel === panel.key ? "Ouvert" : panel.title}
              </Badge>
            </HStack>
            <Text fontSize="sm" color={theme.mutedText} mt={2}>{panel.helper}</Text>
          </Box>
        ))}
      </SimpleGrid>

      {activePanel === "summary" && sections.summary ? (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3}>
          <Box {...theme.tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>OBJECTIF</Text>
            <Text mt={1} fontWeight="900" fontSize="lg">{needs?.objectiveRaw || inputs?.objectif || "Suivi nutrition"}</Text>
            <Text fontSize="sm" color={theme.mutedText}>{diet.length ? diet.join(", ") : "Aucun régime spécifique"}</Text>
          </Box>
          <Box {...theme.tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>REPÈRE JOUR</Text>
            <Text mt={1} fontWeight="900" fontSize="lg">{needs?.kcalTarget ? `${r0(needs.kcalTarget)} kcal` : "À ajuster"}</Text>
            <Text fontSize="sm" color={theme.mutedText}>
              P {needs?.protG?.min ? `${r0(needs.protG.min)}-${r0(needs.protG.max)} g` : "—"} • L{" "}
              {needs?.lipG?.min ? `${r0(needs.lipG.min)}-${r0(needs.lipG.max)} g` : "—"} • G{" "}
              {needs?.glucG?.min ? `${r0(needs.glucG.min)}-${r0(needs.glucG.max)} g` : "—"}
            </Text>
          </Box>
          <Box {...theme.tileProps} p={4}>
            <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>POINTS À RESPECTER</Text>
            <Text mt={1} fontWeight="900" fontSize="lg">{pathologies.length || diet.length || "Standard"}</Text>
            <Text fontSize="sm" color={theme.mutedText}>{[...diet, ...pathologies].slice(0, 3).join(", ") || "Aucune contrainte partagée"}</Text>
          </Box>
        </SimpleGrid>
      ) : null}

      {activePanel === "summary" && patientNote ? (
        <Box {...theme.tileProps} p={4} mt={3} borderLeftWidth="5px" borderLeftColor="#0F766E">
          <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>
            NOTE DU PROFESSIONNEL
          </Text>
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
                <Box key={mealKey} {...theme.tileProps} p={4}>
                  <Text fontWeight="900" mb={2}>{MENU_MEAL_LABEL[mealKey]}</Text>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                    {foodSurveyByMeal[mealKey].map((row, idx) => (
                      <Text key={`${mealKey}-${row.label}-${idx}`} fontSize="sm">
                        • {row.label} <Text as="span" color={theme.mutedText}>({r0(row.qty)} {row.unit})</Text>
                      </Text>
                    ))}
                  </SimpleGrid>
                </Box>
              ) : null
            )
          ) : (
            <Box {...theme.tileProps} p={4}>
              <Text fontWeight="800">Ration spontanée partagée</Text>
              <Text color={theme.mutedText} fontSize="sm" mt={1}>
                Le relevé est partagé, mais aucune ligne détaillée n’est disponible dans ce format.
              </Text>
            </Box>
          )}
        </Stack>
      ) : null}

      {activePanel === "ration" && sections.ration ? (
        <Stack spacing={3}>
          <Box {...theme.tileProps} p={4}>
            <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
              <Box>
                <Text fontSize="xs" fontWeight="900" color={theme.subtleText}>TOTAL JOUR</Text>
                <Text mt={1} fontWeight="900" fontSize="lg">
                  {rationTotals.kcal ? `${r0(rationTotals.kcal)} kcal` : "Ration partagée"}
                </Text>
                <Text color={theme.mutedText} fontSize="sm">
                  P {r0(rationTotals.p)} g • L {r0(rationTotals.f)} g • G {r0(rationTotals.c)} g
                </Text>
              </Box>
              <Badge borderRadius="full" px={3} py={1}>
                {rationLines.length} ligne(s) • {countRationMealsCovered(rationLines)}/{MENU_MEALS_ORDER.length} repas
              </Badge>
            </HStack>
          </Box>
          {MENU_MEALS_ORDER.map((mealKey) =>
            rationByMeal[mealKey]?.length ? (
              <Box key={mealKey} {...theme.tileProps} p={4}>
                <Text fontWeight="900" mb={2}>{MENU_MEAL_LABEL[mealKey]}</Text>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                  {rationByMeal[mealKey].map((row, idx) => (
                    <Text key={`${mealKey}-${row.label}-${idx}`} fontSize="sm">
                      • {row.group ? `${row.group} — ` : ""}{row.label}{" "}
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
            <Heading size="sm">Journées proposées</Heading>
            {menuDays.length > 1 ? (
              <HStack spacing={2}>
                <IconButton
                  aria-label="Jour précédent"
                  size="sm"
                  variant="outline"
                  icon={<Text as="span">‹</Text>}
                  onClick={() => setSelectedMenuDayIndex((idx) => Math.max(0, idx - 1))}
                  isDisabled={selectedMenuDayIndex <= 0}
                />
                <Badge borderRadius="full" px={3} py={1}>
                  Jour {Math.min(selectedMenuDayIndex + 1, menuDays.length)} / {menuDays.length}
                </Badge>
                <IconButton
                  aria-label="Jour suivant"
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
              <Box key={selectedMenuDay.label} {...theme.tileProps} p={4}>
                <HStack justify="space-between" mb={3}>
                  <Text fontWeight="900">{selectedMenuDay.label}</Text>
                  <Badge borderRadius="full" px={3} py={1}>
                    {selectedMenuDay?.totals?.kcal ? `${r0(selectedMenuDay.totals.kcal)} kcal` : "Menu"}
                  </Badge>
                </HStack>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  {(selectedMenuDay.meals || [])
                    .filter((meal) => meal.items?.length)
                    .map((meal) => (
                      <Box key={`${selectedMenuDay.label}-${meal.label}`} borderWidth="1px" borderColor={theme.borderColor} borderRadius="xl" p={3}>
                        <Text fontWeight="800" mb={2}>{meal.label}</Text>
                        <Stack spacing={1}>
                          {meal.items.map((item, idx) => (
                            <Text key={`${item.name}-${idx}`} fontSize="sm">
                              • {item.name} <Text as="span" color={theme.mutedText}>({item.qty})</Text>
                            </Text>
                          ))}
                        </Stack>
                      </Box>
                    ))}
                </SimpleGrid>
              </Box>
            ) : (
              <Text color={theme.mutedText}>Aucun menu partagé pour le moment.</Text>
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
                  <Heading size="sm">{selectedRecipeDay?.label || "Recettes"}</Heading>
                  <HStack spacing={2}>
                    <IconButton
                      aria-label="Jour précédent"
                      size="sm"
                      variant="outline"
                      icon={<Text as="span">‹</Text>}
                      onClick={() => setSelectedRecipeDayIndex((idx) => Math.max(0, idx - 1))}
                      isDisabled={selectedRecipeDayIndex <= 0}
                    />
                    <Badge borderRadius="full" px={3} py={1}>
                      Jour {Math.min(selectedRecipeDayIndex + 1, recipeDays.length)} / {recipeDays.length}
                    </Badge>
                    <IconButton
                      aria-label="Jour suivant"
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
              <Box key={`${recipe.name || recipe.title || "recette"}-${index}`} {...theme.tileProps} p={4}>
                <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                  <Box>
                    <Heading size="sm">{recipe.name || recipe.title || `Recette ${index + 1}`}</Heading>
                    <Text fontSize="sm" color={theme.mutedText} mt={1}>
                      {[recipe.dayLabel, recipe.mealLabel].filter(Boolean).join(" • ")}
                      {recipe.dayLabel || recipe.mealLabel ? " · " : ""}
                      Prépa {recipe.preparationTimeMin || recipe.prepTimeMin || "—"} min • Cuisson {recipe.cookingTimeMin || recipe.cookTimeMin || "—"} min
                    </Text>
                  </Box>
                </HStack>
                {recipe.ingredients?.length ? (
                  <Wrap spacing={2} mt={3}>
                    {recipe.ingredients.map((ingredient, ingredientIndex) => (
                      <Badge key={`${ingredient.name || ingredient}-${ingredientIndex}`} borderRadius="full" px={3} py={1}>
                        {typeof ingredient === "string"
                          ? ingredient
                          : [ingredient.name, ingredient.quantity || ingredient.qty].filter(Boolean).join(" ")}
                      </Badge>
                    ))}
                  </Wrap>
                ) : null}
                {recipe.steps?.length ? (
                  <Stack spacing={1} mt={4}>
                    {recipe.steps.map((step, stepIndex) => (
                      <Text key={`${recipe.name || index}-step-${stepIndex}`} fontSize="sm">
                        {stepIndex + 1}. {typeof step === "string" ? step : step.text || step.description || ""}
                      </Text>
                    ))}
                  </Stack>
                ) : null}
              </Box>
              ))}
            </>
          ) : (
            <Text color={theme.mutedText}>Aucune recette partagée pour le moment.</Text>
          )}
        </Stack>
      ) : null}

      {activePanel === "shoppingList" && sections.shoppingList ? (
        <Stack spacing={3}>
          {shoppingList.some((section) => section.items?.length) ? (
            shoppingList.map((section) =>
              section.items?.length ? (
                <Box key={section.section || section.label} {...theme.tileProps} p={4}>
                  <Heading size="sm">{section.label || section.section || "Rayon"}</Heading>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2} mt={3}>
                    {section.items.map((item, itemIndex) => (
                      <Text key={`${section.section || section.label}-${itemIndex}`} fontSize="sm">
                        • {item.name || item.label}
                        {item.quantity ? (
                          <Text as="span" color={theme.mutedText}> ({item.quantity} {item.unit || ""})</Text>
                        ) : null}
                      </Text>
                    ))}
                  </SimpleGrid>
                </Box>
              ) : null
            )
          ) : (
            <Text color={theme.mutedText}>Aucune liste de courses partagée pour le moment.</Text>
          )}
        </Stack>
      ) : null}

      {activePanel === "adviceSheets" && sections.adviceSheets ? (
        <Stack spacing={3}>
          {adviceSheets.length ? (
            adviceSheets.map((sheet) => (
              <Box key={sheet.id} {...theme.tileProps} p={4} borderLeftWidth="5px" borderLeftColor={sheet.accent || "#0F766E"}>
                <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
                  <Box>
                    <Badge borderRadius="full" px={3} py={1} bg={`${sheet.accent || "#0F766E"}22`} color={sheet.accent || "#0F766E"}>
                      {sheet.category || "Conseil"}
                    </Badge>
                    <Heading size="sm" mt={3}>
                      {sheet.title}
                    </Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={2}>
                      {sheet.summary}
                    </Text>
                  </Box>
                </HStack>

                {sheet.keyPoints?.length ? (
                  <Box mt={4}>
                    <Text fontWeight="900" mb={2}>À retenir</Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                      {sheet.keyPoints.map((point) => (
                        <Text key={point} fontSize="sm">• {point}</Text>
                      ))}
                    </SimpleGrid>
                  </Box>
                ) : null}

                {sheet.practicalTips?.length ? (
                  <Box mt={4}>
                    <Text fontWeight="900" mb={2}>Conseils pratiques</Text>
                    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={2}>
                      {sheet.practicalTips.map((tip) => (
                        <Text key={tip} fontSize="sm">• {tip}</Text>
                      ))}
                    </SimpleGrid>
                  </Box>
                ) : null}

                {sheet.tags?.length ? (
                  <HStack mt={4} spacing={2} flexWrap="wrap">
                    {sheet.tags.map((tag) => (
                      <Tag key={tag} size="sm" borderRadius="full">
                        <TagLabel>{tag}</TagLabel>
                      </Tag>
                    ))}
                  </HStack>
                ) : null}
              </Box>
            ))
          ) : (
            <Box {...theme.tileProps} p={4}>
              <Text fontWeight="800">Aucune fiche conseil partagée</Text>
              <Text color={theme.mutedText} fontSize="sm" mt={1}>
                Le professionnel n’a pas encore sélectionné de fiche pour ce suivi.
              </Text>
            </Box>
          )}
        </Stack>
      ) : null}
    </Box>
  );
}
