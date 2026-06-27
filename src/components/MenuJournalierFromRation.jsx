 
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
  useColorModeValue,
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
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
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
import NutritionWorkflowBar from "./nutrition/NutritionWorkflowBar.jsx";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { getAdviceSheetPreview, mergeAdviceSheets } from "../utils/nutritionAdviceSheets";
import { generateShoppingListFromNutritionPlan } from "../utils/shoppingListService";
import { generateRecipesFromMealCourses } from "../utils/recipeGenerationService";

import { canUseCustomBranding } from "../utils/proPlanAccess";
import { apiFetch } from "../utils/api";
import { translateNutritionFoodName, translateNutritionObjective } from "../utils/nutritionFoodI18n";
import i18n from "../i18n/index";
import { navigateWithDomFallback } from "../utils/navigationFallback";
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
  infoGrid: { flexDirection: "row", flexWrap: "wrap", marginLeft: -4, marginRight: -4, marginBottom: 10 },
  infoCard: { width: "48%", backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, padding: 8, margin: 4 },
  infoLabel: { fontSize: 8, color: "#64748B", textTransform: "uppercase", marginBottom: 3 },
  infoValue: { fontSize: 10, color: "#111827", fontWeight: 700, lineHeight: 1.3 },
  fullCard: { backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, padding: 10, marginBottom: 10 },
  mutedLine: { fontSize: 9, color: "#64748B", lineHeight: 1.35, marginTop: 2 },
  recipeTitle: { fontSize: 11, fontWeight: 700, color: "#111827", marginBottom: 4 },
  subSectionTitle: { fontSize: 10, fontWeight: 700, color: "#193B8A", marginBottom: 5 },
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

const PdfInfoCard = ({ label, value }) => (
  <View style={menuPdfStyles.infoCard}>
    <PdfText style={menuPdfStyles.infoLabel}>{label}</PdfText>
    <PdfText style={menuPdfStyles.infoValue}>{value || "—"}</PdfText>
  </View>
);

const pdfListText = (items, fallback = i18n.t("auto.MenuJournalierFromRation.aucun_element", "Aucun élément")) => {
  const clean = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  return clean.length ? clean.join(", ") : fallback;
};

const menuMealLabel = (mealKey) => {
  if (mealKey === "petit_dej") return i18n.t("auto.MenuJournalierFromRation.petit_dejeuner", "Petit-déjeuner");
  if (mealKey === "dejeuner") return i18n.t("auto.MenuJournalierFromRation.dejeuner", "Déjeuner");
  if (mealKey === "diner") return i18n.t("auto.MenuJournalierFromRation.diner", "Dîner");
  return i18n.t("auto.MenuJournalierFromRation.collation", "Collation");
};

function MenuPdfDoc({
  clientName,
  coachName,
  title,
  subtitle,
  logoDataUrl,
  days,
  date,
  sections,
  summary,
  foodSurvey,
  ration,
  recipes,
  shoppingList,
  adviceSheets,
  patientNote,
}) {
  const dateStr = date?.toLocaleDateString ? date.toLocaleDateString("fr-FR") : "";
  const selectedSections = { ...emptyShareSections(), ...(sections || {}) };
  const hasDays = Array.isArray(days) && days.some((day) => day.meals.some((meal) => meal.items.length));
  const printableRecipes = Array.isArray(recipes) ? recipes : [];
  const printableShoppingList = Array.isArray(shoppingList) ? shoppingList : [];
  const printableAdviceSheets = Array.isArray(adviceSheets) ? adviceSheets.map((sheet) => getAdviceSheetPreview(sheet)) : [];
  return (
    <Document>
      <Page size="A4" style={menuPdfStyles.page}>
        <View style={menuPdfStyles.header} fixed>
          <View style={menuPdfStyles.headerLeft}>
            {logoDataUrl ? <PdfImage src={logoDataUrl} style={menuPdfStyles.logo} /> : null}
            <PdfText style={menuPdfStyles.coachName}>{coachName || i18n.t("auto.MenuJournalierFromRation.coach", "Coach")}</PdfText>
          </View>
          <View style={menuPdfStyles.headerCenter}>
            <PdfText style={menuPdfStyles.title}>{title || i18n.t("auto.MenuJournalierFromRation.menu_journalier", "Menu journalier")}</PdfText>
            {subtitle ? <PdfText style={menuPdfStyles.subtitle}>{subtitle}</PdfText> : null}
          </View>
          <View style={menuPdfStyles.headerRight}>
            <PdfText style={menuPdfStyles.clientName}>{clientName || i18n.t("auto.MenuJournalierFromRation.patient", "Patient")}</PdfText>
            <PdfText style={menuPdfStyles.date}>{dateStr}</PdfText>
          </View>
        </View>

        {selectedSections.summary ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.resume_du_bilan_et_objectifs", "Résumé du bilan et objectifs")}</PdfText>
            <View style={menuPdfStyles.infoGrid}>
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.patient", "Patient")} value={summary?.clientSummary || clientName} />
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.objectif", "Objectif")} value={summary?.objective || i18n.t("auto.MenuJournalierFromRation.objectif_a_preciser", "Objectif à préciser")} />
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.regimes", "Régime(s)")} value={pdfListText(summary?.diet, i18n.t("auto.MenuJournalierFromRation.aucun_regime_specifique", "Aucun régime spécifique"))} />
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.contexte_clinique", "Contexte clinique")} value={pdfListText(summary?.pathologies, i18n.t("auto.MenuJournalierFromRation.aucune_pathologie", "Aucune pathologie"))} />
            </View>
          </>
        ) : null}

        {selectedSections.foodSurvey ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.ration_spontanee_habitudes_alimentaires", "Ration spontanée / habitudes alimentaires")}</PdfText>
            <View style={menuPdfStyles.fullCard} wrap={false}>
              <PdfText style={menuPdfStyles.infoValue}>{i18n.t("auto.MenuJournalierFromRation.mode_label", "Mode :")} {foodSurvey?.modeLabel || "—"}</PdfText>
              <PdfText style={menuPdfStyles.mutedLine}>{i18n.t("auto.MenuJournalierFromRation.reference_label", "Référence :")} {foodSurvey?.referenceLabel || i18n.t("auto.MenuJournalierFromRation.non_renseignee", "Non renseignée")}</PdfText>
              <PdfText style={menuPdfStyles.mutedLine}>{i18n.t("auto.MenuJournalierFromRation.reperes_label", "Repères :")} {pdfListText(foodSurvey?.behaviorFlags, i18n.t("auto.MenuJournalierFromRation.aucun_repere_renseigne", "Aucun repère renseigné"))}</PdfText>
              {foodSurvey?.note ? <PdfText style={menuPdfStyles.mutedLine}>{i18n.t("auto.MenuJournalierFromRation.note_label", "Note :")} {foodSurvey.note}</PdfText> : null}
            </View>
          </>
        ) : null}

        {selectedSections.ration ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.ration_alimentaire_construite", "Ration alimentaire construite")}</PdfText>
            <View style={menuPdfStyles.infoGrid}>
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.source", "Source")} value={ration?.sourceLabel} />
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.energie", "Énergie")} value={ration?.kcal ? `${r0(ration.kcal)} kcal` : i18n.t("auto.MenuJournalierFromRation.ration_a_relire", "Ration à relire")} />
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.repas_de_reference", "Repas de référence")} value={`${ration?.coveredMeals || 0} repas`} />
              <PdfInfoCard label={i18n.t("auto.MenuJournalierFromRation.macros", "Macros")} value={ration?.macroLine || "—"} />
            </View>
            {ration?.items?.length ? (
              <View style={menuPdfStyles.fullCard} wrap={false}>
                {ration.items.slice(0, 18).map((item, idx) => (
                  <PdfText key={`ration_${idx}`} style={menuPdfStyles.itemLine}>
                    • {[item.mealLabel, item.label || item.resolvedLabel || item.key].filter(Boolean).join(" · ")} {item.qty ? `(${r0(item.qty)} ${item.unit || "g"})` : ""}
                  </PdfText>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {selectedSections.menu ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("nav.menu", "Menu")}</PdfText>
            {!hasDays ? (
              <PdfText style={menuPdfStyles.empty}>{i18n.t("auto.MenuJournalierFromRation.aucun_menu_sauvegarde_a_exporter_pour_le_moment", "Aucun menu sauvegardé à exporter pour le moment.")}</PdfText>
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
          </>
        ) : null}

        {selectedSections.recipes ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.recettes_jour_par_jour", "Recettes jour par jour")}</PdfText>
            {printableRecipes.length ? (
              printableRecipes.slice(0, 24).map((recipe, index) => (
                <View key={`recipe_pdf_${index}`} style={menuPdfStyles.fullCard} wrap={false}>
                  <PdfText style={menuPdfStyles.recipeTitle}>{recipe.name || recipe.title || i18n.t("auto.MenuJournalierFromRation.recette_count", "Recette {{count}}", { count: index + 1 })}</PdfText>
                  <PdfText style={menuPdfStyles.mutedLine}>{[recipe.dayLabel, recipe.mealLabel].filter(Boolean).join(" • ")}</PdfText>
                  {recipeIngredientsText(recipe).slice(0, 10).map((ingredient) => (
                    <PdfText key={ingredient} style={menuPdfStyles.itemLine}>• {ingredient}</PdfText>
                  ))}
                  {normalizeAiList(recipe.steps).slice(0, 8).map((step, stepIndex) => (
                    <PdfText key={`recipe_step_${stepIndex}`} style={menuPdfStyles.itemLine}>{stepIndex + 1}. {stableAiItemText(step)}</PdfText>
                  ))}
                </View>
              ))
            ) : (
              <PdfText style={menuPdfStyles.empty}>{i18n.t("auto.MenuJournalierFromRation.les_recettes_apparaitront_apres_une_optimisation_i", "Les recettes apparaîtront après une optimisation IA validée ou dès qu’un menu exploitable sera structuré en repas.")}</PdfText>
            )}
          </>
        ) : null}

        {selectedSections.shoppingList ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.liste_de_courses", "Liste de courses")}</PdfText>
            {printableShoppingList.some((section) => normalizeAiList(section?.items).length) ? (
              printableShoppingList.map((section, sectionIndex) =>
                normalizeAiList(section?.items).length ? (
                  <View key={`shopping_pdf_${sectionIndex}`} style={menuPdfStyles.fullCard} wrap={false}>
                    <PdfText style={menuPdfStyles.subSectionTitle}>{section.label || section.section || i18n.t("auto.MenuJournalierFromRation.rayon", "Rayon")}</PdfText>
                    {normalizeAiList(section.items).map((item, itemIndex) => (
                      <PdfText key={`shopping_item_${itemIndex}`} style={menuPdfStyles.itemLine}>
                        • {item.name || item.label} {item.quantity ? `(${item.quantity} ${item.unit || ""})` : ""}
                      </PdfText>
                    ))}
                  </View>
                ) : null
              )
            ) : (
              <PdfText style={menuPdfStyles.empty}>{i18n.t("auto.MenuJournalierFromRation.aucune_liste_de_courses_exploitable_pour_le_moment", "Aucune liste de courses exploitable pour le moment.")}</PdfText>
            )}
          </>
        ) : null}

        {selectedSections.adviceSheets ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.fiches_conseils", "Fiches conseils")}</PdfText>
            {printableAdviceSheets.length ? (
              printableAdviceSheets.map((sheet) => (
                <View key={sheet.id || sheet.title} style={menuPdfStyles.adviceSheet} wrap={false}>
                  <PdfText style={menuPdfStyles.adviceSheetTitle}>{sheet.title}</PdfText>
                  <PdfText style={menuPdfStyles.adviceSheetContent}>{sheet.summary}</PdfText>
                  {sheet.keyPoints?.slice(0, 6).map((point) => (
                    <PdfText key={point} style={menuPdfStyles.itemLine}>• {point}</PdfText>
                  ))}
                </View>
              ))
            ) : (
              <PdfText style={menuPdfStyles.empty}>{i18n.t("auto.MenuJournalierFromRation.aucune_fiche_selectionnee_pour_le_moment", "Aucune fiche sélectionnée pour le moment.")}</PdfText>
            )}
          </>
        ) : null}

        {patientNote ? (
          <>
            <PdfText style={menuPdfStyles.sectionTitle}>{i18n.t("auto.MenuJournalierFromRation.note_patient_personnalisee", "Note patient personnalisée")}</PdfText>
            <View style={menuPdfStyles.fullCard}>
              <PdfText style={menuPdfStyles.adviceSheetContent}>{patientNote}</PdfText>
            </View>
          </>
        ) : null}

        <View style={menuPdfStyles.footer} fixed>
          {logoDataUrl ? <PdfImage src={logoDataUrl} style={menuPdfStyles.footerLogo} /> : null}
          <PdfText style={menuPdfStyles.footerText}>{i18n.t("auto.MenuJournalierFromRation.genere_avec_boostyourlife_coach", "Généré avec BoostYourLife.coach")}</PdfText>
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
  if (value.includes("vitamine c") || value.includes("vitamine_c") || value.includes("ascorb")) return "vitC";
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

const RECIPE_MEAL_GROUPS = [
  { key: "petit_dej", labelKey: "auto.MenuJournalierFromRation.petit_dejeuner", labelDefault: "Petit-déjeuner" },
  { key: "dejeuner", labelKey: "auto.MenuJournalierFromRation.dejeuner", labelDefault: "Déjeuner" },
  { key: "collation", labelKey: "auto.MenuJournalierFromRation.collation", labelDefault: "Collation" },
  { key: "diner", labelKey: "auto.MenuJournalierFromRation.diner", labelDefault: "Dîner" },
  { key: "autre", labelKey: "auto.MenuJournalierFromRation.autres_recettes", labelDefault: "Autres recettes" },
];

const recipeMealGroupKey = (recipe = {}) => {
  const label = normalizeAdviceText(recipe.mealLabel || recipe.label || recipe.meal || "");
  if (label.includes("petit-dejeuner") || label.includes("petit dejeuner")) return "petit_dej";
  if (label.includes("dejeuner")) return "dejeuner";
  if (label.includes("collation") || label.includes("gouter")) return "collation";
  if (label.includes("diner")) return "diner";
  return "autre";
};

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
  const borderCol = nutritionTheme.borderColor;
  const textMuted = nutritionTheme.mutedText;
  const menuAccentCards = {
    dossier: {
      bg: useColorModeValue("blue.50", "rgba(37, 99, 235, 0.13)"),
      border: useColorModeValue("blue.200", "rgba(96, 165, 250, 0.32)"),
      label: useColorModeValue("blue.700", "blue.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      muted: useColorModeValue("gray.700", "whiteAlpha.750"),
    },
    nutrition: {
      bg: useColorModeValue("teal.50", "rgba(20, 184, 166, 0.13)"),
      border: useColorModeValue("teal.200", "rgba(45, 212, 191, 0.32)"),
      label: useColorModeValue("teal.700", "teal.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      muted: useColorModeValue("gray.700", "whiteAlpha.750"),
    },
    ration: {
      bg: useColorModeValue("purple.50", "rgba(124, 58, 237, 0.13)"),
      border: useColorModeValue("purple.200", "rgba(167, 139, 250, 0.32)"),
      label: useColorModeValue("purple.700", "purple.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      muted: useColorModeValue("gray.700", "whiteAlpha.750"),
    },
    output: {
      bg: useColorModeValue("green.50", "rgba(34, 197, 94, 0.12)"),
      border: useColorModeValue("green.200", "rgba(74, 222, 128, 0.30)"),
      label: useColorModeValue("green.700", "green.200"),
      text: useColorModeValue("gray.900", "whiteAlpha.950"),
      muted: useColorModeValue("green.800", "whiteAlpha.750"),
    },
  };
  const sectionCardProps = {
    borderWidth: "1px",
    borderColor: borderCol,
    borderRadius: "lg",
    bg: panelBg,
    boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
  };

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docData, setDocData] = useState(null);

  // CIQUAL
  const [ciqualLoading, setCiqualLoading] = useState(true);
  const [ciqualError, setCiqualError] = useState("");
  const [ciqualData, setCiqualData] = useState([]);

  const [activeTab, setActiveTab] = useState(1); // 0 manual, 1 auto
  const [pdfLogoDataUrl, setPdfLogoDataUrl] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [menuPdfData, setMenuPdfData] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareSelection, setShareSelection] = useState(() => allShareSections());
  const [patientNote, setPatientNote] = useState("");
  const [sharePatientNote, setSharePatientNote] = useState(false);
  const [preparingShare, setPreparingShare] = useState(false);
  const [savingShare, setSavingShare] = useState(false);
  const [clientEmail, setClientEmail] = useState("");
  const [showPatientRecipes, setShowPatientRecipes] = useState(false);
  const [showPatientShoppingList, setShowPatientShoppingList] = useState(false);
  const menuAutosaveHashRef = useRef("");
  const tabTouchedUntilRef = useRef(0);
  const documentBrandingAllowed = canUseCustomBranding(
    user?.proAccess || {
      packageKey: user?.packageKey,
      packageTier: user?.packageTier,
      branding: user?.branding,
    }
  );

  useEffect(() => {
    (async () => {
      const preferred = documentBrandingAllowed
        ? user?.logoUrl || user?.photoURL || user?.avatarUrl || ""
        : "";
      const coachLogo = await toDataUrlSafe(preferred);
      const fallback = await toDataUrlSafe(LEGACY_BYL_LOCAL);
      setPdfLogoDataUrl(coachLogo || fallback);
    })();
  }, [documentBrandingAllowed, user?.avatarUrl, user?.logoUrl, user?.photoURL]);

  const coachPdfName = useMemo(() => getPersonName(user) || i18n.t("auto.MenuJournalierFromRation.coach", "Coach"), [user]);

  const loadCiqual = useCallback(async () => {
    setCiqualLoading(true);
    setCiqualError("");
    try {
      const res = await fetch("/ciqual_2025.json", { cache: "force-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const arr = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data?.data)
        ? data.data
        : [];

      if (!arr.length) {
        throw new Error(i18n.t("auto.MenuJournalierFromRation.donnees_alimentaires_vides_ou_format_inattendu", "Données alimentaires vides ou format inattendu"));
      }
      setCiqualData(arr);

      safeSetSmallLocal("byl_ciqual_2025_loaded_v1", String(Date.now()));
    } catch (e) {
      setCiqualData([]);
      setCiqualError(i18n.t("auto.MenuJournalierFromRation.chargement_des_donnees_alimentaires_impossible", "Chargement des données alimentaires impossible"));
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
          else setActiveTab(1);
        }

        setLoadingDoc(false);
      },
      () => setLoadingDoc(false)
    );

    return () => unsub();
  }, [assessmentRef]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    getDoc(doc(db, "clients", clientId))
      .then((snap) => {
        if (cancelled) return;
        const data = snap.exists() ? snap.data() : {};
        setClientEmail(String(data?.email || data?.emailLower || "").trim());
      })
      .catch(() => {
        if (!cancelled) setClientEmail("");
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

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
      navigateWithDomFallback(navigate, path);
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
      ? i18n.t("auto.MenuJournalierFromRation.ration_auto", "Ration auto")
      : selectedType === "pro"
      ? i18n.t("auto.MenuJournalierFromRation.ration_manuelle", "Ration manuelle")
      : i18n.t("auto.MenuJournalierFromRation.source_non_identifiee", "Source non identifiée");

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
  const activeLanguage = i18n.language || i18n.resolvedLanguage || "fr";
  const translatedObjectiveRaw = useMemo(
    () => translateNutritionObjective(objectiveRaw, activeLanguage),
    [activeLanguage, objectiveRaw]
  );
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
    () => [inputs?.prenom, inputs?.nom].filter(Boolean).join(" ") || i18n.t("auto.MenuJournalierFromRation.patient", "Patient"),
    [inputs]
  );
  const clientSummary = useMemo(
    () =>
      [
        summaryAge !== null ? i18n.t("auto.MenuJournalierFromRation.age_years", "{{count}} ans", { count: summaryAge }) : null,
        needs?.sex === "Homme"
          ? i18n.t("auto.MenuJournalierFromRation.sex_male", "Homme")
          : needs?.sex === "Femme"
          ? i18n.t("auto.MenuJournalierFromRation.sex_female", "Femme")
          : needs?.sex || null,
        translatedObjectiveRaw || null,
      ]
        .filter(Boolean)
        .join(" • "),
    [needs?.sex, translatedObjectiveRaw, summaryAge]
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
    setPreparingShare(true);
    try {
      await persistMenuDraft();
    } catch (e) {
      console.error("Menu draft save before next step failed:", e);
      notify(toast, "saveError", {
        title: i18n.t("auto.MenuJournalierFromRation.sauvegarde_impossible", "Sauvegarde impossible"),
        description: e?.message || i18n.t("auto.MenuJournalierFromRation.impossible_de_sauvegarder_le_partage", "Impossible de sauvegarder le partage."),
      });
      return;
    } finally {
      setPreparingShare(false);
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
  }, [assessmentRef, blocked, docData?.clientShare?.sections, docData?.nutritionPatientNote, persistMenuDraft, toast]);

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
              name: row
                ? translateNutritionFoodName(ciqualName(row), activeLanguage)
                : firstNonEmpty(item?.resolvedLabel, item?.key, i18n.t("auto.MenuJournalierFromRation.aliment_a_associer", "Aliment à associer")),
              qty: `${r0(item?.meals?.[mealKey])} ${item?.unit || ""}`.trim(),
            };
          });
        return {
          label: menuMealLabel(mealKey),
          items: items.map((item) => ({ ...item, qty: item.qty || "—" })),
        };
      });
      return { label: i18n.t("auto.MenuJournalierFromRation.jour_count", "Jour {{count}}", { count: dayKey }), meals, totals: null };
    });
  }, [activeLanguage, activeTab, ciqualByCode, docData?.ration?.autoMenu, docData?.ration?.manualMenu, rationItems]);

  const pdfDays = useMemo(() => {
    const sourceDays = Array.isArray(menuPdfData?.days) && menuPdfData.days.length ? menuPdfData.days : fallbackPdfDays;
    return sourceDays.map((day) => ({
      label: day.label || i18n.t("auto.MenuJournalierFromRation.jour_count", "Jour {{count}}", { count: day.index || "" }).trim(),
      totals: day.totals || null,
      meals: MENU_MEALS_ORDER.map((mealKey, mealIndex) => {
        const previewItems = day?.perMeal?.[mealKey] || [];
        if (previewItems.length) {
          return {
            label: menuMealLabel(mealKey),
            items: previewItems.map((item) => ({
              name: translateNutritionFoodName(
                item.text || item.name || i18n.t("auto.MenuJournalierFromRation.aliment", "Aliment"),
                activeLanguage
              ),
              qty: [item.qty, item.unit].filter(Boolean).join(" ") || (item.grams ? `${item.grams} g` : "—"),
              category: item.sourceLabel || item.category || "",
              role: item.role || "",
            })),
          };
        }
        const fallbackMeal = (day.meals || [])[mealIndex];
        return fallbackMeal || { label: i18n.t("auto.MenuJournalierFromRation.repas", "Repas"), items: [] };
      }),
    }));
  }, [activeLanguage, fallbackPdfDays, menuPdfData]);

  const displayedMenuPlan = useMemo(
    () => ({
      days: (pdfDays || []).map((day, dayIndexValue) => ({
        id: day.label || `jour_${dayIndexValue + 1}`,
        label: day.label || i18n.t("auto.MenuJournalierFromRation.jour_count", "Jour {{count}}", { count: dayIndexValue + 1 }),
        meals: (day.meals || []).map((meal, mealIndex) => ({
          id: `${dayIndexValue + 1}_${meal.label || mealIndex}`,
          label: meal.label || i18n.t("auto.MenuJournalierFromRation.repas", "Repas"),
          items: (meal.items || [])
            .map((item) => ({
              name: translateNutritionFoodName(item.name || item.text || "", activeLanguage),
              qty: item.qty || [item.quantity, item.unit].filter(Boolean).join(" "),
              category: item.category || meal.label || "",
              role: item.role || "",
            }))
            .filter((item) => item.name && !/aliment à associer/i.test(item.name)),
        })),
      })),
    }),
    [activeLanguage, pdfDays]
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
  
  
  const aiRecipes = useMemo(() => {
    const explicit = normalizeAiList(aiPlan?.recipes || aiFinalPlan?.recipes);
    const mealRecipes = displayedMenuMeals
      .filter((meal) => meal.items?.length >= 2)
      .slice(0, 28)
      .flatMap((meal) => generateRecipesFromMealCourses(meal));
    if (mealRecipes.length) return mealRecipes;
    if (explicit.length) return explicit;
    const meals = normalizeAiList(aiPlan?.meals || aiFinalPlan?.meals);
    return meals.slice(0, 6).flatMap((meal) => generateRecipesFromMealCourses(meal));
  }, [aiFinalPlan?.meals, aiFinalPlan?.recipes, aiPlan?.meals, aiPlan?.recipes, displayedMenuMeals]);
  const aiRecipeGroups = useMemo(() => {
    const buckets = RECIPE_MEAL_GROUPS.reduce((acc, group) => {
      acc[group.key] = { ...group, recipes: [] };
      return acc;
    }, {});
    aiRecipes.forEach((recipe, index) => {
      const key = recipeMealGroupKey(recipe);
      const bucket = buckets[key] || buckets.autre;
      bucket.recipes.push({ ...recipe, __recipeIndex: index });
    });
    return RECIPE_MEAL_GROUPS.map((group) => buckets[group.key]).filter((group) => group.recipes.length);
  }, [aiRecipes]);
  const aiShoppingList = useMemo(() => {
    const fromDisplayedMenu = generateShoppingListFromNutritionPlan(displayedMenuPlan);
    if (fromDisplayedMenu.some((section) => normalizeAiList(section?.items).length)) return fromDisplayedMenu;
    const explicit = normalizeAiList(aiPlan?.shoppingList || aiFinalPlan?.shoppingList);
    if (explicit.length) return explicit;
    return generateShoppingListFromNutritionPlan(aiFinalPlan);
  }, [aiFinalPlan, aiPlan?.shoppingList, displayedMenuPlan]);
  const aiShoppingSections = useMemo(
    () => aiShoppingList.filter((section) => normalizeAiList(section?.items).length),
    [aiShoppingList]
  );
  

  

  

  const saveMenuAndShare = useCallback(
    async ({ share }) => {
      if (!assessmentRef || blocked) return;
      const sections = share ? { ...emptyShareSections(), ...shareSelection } : emptyShareSections();
      const cleanPatientNote = String(patientNote || "").trim();
      const hasSharedPatientNote = !!share && !!sharePatientNote && cleanPatientNote.length > 0;
      const hasSharedSection = SHARE_SECTION_KEYS.some((key) => !!sections[key]) || hasSharedPatientNote;

      if (share && !hasSharedSection) {
        notify(toast, "saveError", {
          title: i18n.t("auto.MenuJournalierFromRation.aucune_section_selectionnee", "Aucune section sélectionnée"),
          description: i18n.t("auto.MenuJournalierFromRation.coche_au_moins_une_section_a_partager_au_client", "Coche au moins une section à partager au client."),
        });
        return;
      }

      setSavingShare(true);
      try {
        const adviceSheetsToShare = sections.adviceSheets ? selectedAdviceSheets : [];
        let shareEmailSent = false;
        let shareEmailWarning = "";
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
            coachLogoUrl:
              share && documentBrandingAllowed
                ? user?.logoUrl || user?.photoURL || user?.avatarUrl || ""
                : null,
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

        if (share && clientEmail) {
          try {
            const emailResult = await apiFetch("/clubs/nutrition-share-email", {
              method: "POST",
              body: JSON.stringify({ clientId, assessmentId }),
            });
            shareEmailSent = Boolean(emailResult?.emailed);
            shareEmailWarning = emailResult?.warning || "";
          } catch (emailError) {
            shareEmailWarning = emailError?.message || "email-send-failed";
            console.warn("[nutrition] share email failed", emailError);
          }
        }

        notify(toast, share ? "saveSuccess" : "nutritionSaved", {
          title: share
            ? i18n.t("auto.MenuJournalierFromRation.partage_client_mis_a_jour", "Partage client mis à jour")
            : i18n.t("auto.MenuJournalierFromRation.bilan_sauvegarde", "Bilan sauvegardé"),
          description: share
            ? clientEmail
              ? shareEmailSent
                ? i18n.t("auto.MenuJournalierFromRation.client_verra_sections_cochees_email_envoye", "Le client verra uniquement les sections cochées. Un e-mail est envoyé à {{email}}.", { email: clientEmail })
                : shareEmailWarning === "smtp-missing"
                  ? i18n.t("auto.MenuJournalierFromRation.client_verra_sections_cochees_email_non_configure", "Le client verra les sections cochées. L’e-mail de notification n’est pas parti car l’envoi SMTP n’est pas configuré.")
                  : i18n.t("auto.MenuJournalierFromRation.client_verra_sections_cochees_email_erreur", "Le client verra les sections cochées, mais l’e-mail de notification n’a pas pu être envoyé.")
              : i18n.t("auto.MenuJournalierFromRation.client_verra_sections_cochees_aucun_email", "Le client verra uniquement les sections cochées. Aucun e-mail n’est envoyé car ce client n’a pas d’adresse renseignée.")
            : i18n.t("auto.MenuJournalierFromRation.rien_visible_cote_client_pour_ce_bilan", "Rien n’est visible côté client pour ce bilan."),
        });
        setShareModalOpen(false);
        navigateWithFallback(`/clients/${clientId}`);
      } catch (e) {
        notify(toast, "saveError", {
          title: i18n.t("auto.MenuJournalierFromRation.sauvegarde_impossible", "Sauvegarde impossible"),
          description: e?.message || i18n.t("auto.MenuJournalierFromRation.impossible_de_sauvegarder_le_partage", "Impossible de sauvegarder le partage."),
        });
      } finally {
        setSavingShare(false);
      }
    },
    [
      activeTab,
      assessmentRef,
      assessmentId,
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
    const selectedForPdf = { ...emptyShareSections(), ...shareSelection };
    const cleanPatientNote = String(patientNote || "").trim();
    const includePatientNote = !!sharePatientNote && cleanPatientNote.length > 0;
    const hasSelectedPdfContent = SHARE_SECTION_KEYS.some((key) => !!selectedForPdf[key]) || includePatientNote;

    if (!hasSelectedPdfContent) {
      notify(toast, "saveError", {
        title: i18n.t("auto.MenuJournalierFromRation.aucune_section_selectionnee", "Aucune section sélectionnée"),
        description: i18n.t("auto.MenuJournalierFromRation.coche_au_moins_une_section_avant_de_generer_le_pdf", "Coche au moins une section avant de générer le PDF."),
      });
      return;
    }

    setExportingPdf(true);
    try {
      const now = new Date();
      const foodSurvey = docData?.foodSurvey || {};
      const foodSurveyMeta = foodSurvey?.meta || {};
      const behaviorFlags = Object.entries(foodSurveyMeta?.behaviorFlags || {})
        .filter(([, enabled]) => !!enabled)
        .map(([key]) => String(key).replace(/_/g, " "));
      const rationTotals = targets?.ration || {};
      const blob = await pdf(
        <MenuPdfDoc
          clientName={patientName}
          coachName={coachPdfName}
          title={i18n.t("auto.MenuJournalierFromRation.suivi_nutrition", "Suivi nutrition")}
          subtitle={i18n.t("auto.MenuJournalierFromRation.export_sections_cochees", "Export des éléments cochés")}
          logoDataUrl={pdfLogoDataUrl}
          days={pdfDays}
          date={now}
          sections={selectedForPdf}
          summary={{
            clientSummary,
            objective: translatedObjectiveRaw,
            diet: activeDiet,
            pathologies,
          }}
          foodSurvey={{
            modeLabel:
              foodSurvey?.mode === "ciqual"
                ? i18n.t("auto.MenuJournalierFromRation.mode_detaille", "Mode détaillé")
                : i18n.t("auto.MenuJournalierFromRation.mode_simplifie", "Mode simplifié"),
            referenceLabel: foodSurveyMeta?.referenceDay || i18n.t("auto.MenuJournalierFromRation.journee_type_veille", "Journée type / veille"),
            behaviorFlags,
            note: foodSurveyMeta?.note || "",
          }}
          ration={{
            sourceLabel,
            kcal: rationTotals?.kcal,
            coveredMeals: coveredMealsCount,
            macroLine: [
              rationTotals?.p ? `P ${r0(rationTotals.p)} g` : "",
              rationTotals?.f ? `L ${r0(rationTotals.f)} g` : "",
              rationTotals?.c ? `G ${r0(rationTotals.c)} g` : "",
            ].filter(Boolean).join(" • "),
            items: rationItems,
          }}
          recipes={selectedForPdf.recipes ? aiRecipes : []}
          shoppingList={selectedForPdf.shoppingList ? aiShoppingList : []}
          adviceSheets={selectedForPdf.adviceSheets ? selectedAdviceSheets : []}
          patientNote={includePatientNote ? cleanPatientNote : ""}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const clientBase = (patientName || "client").replace(/\s+/g, "_").toLowerCase();
      const filename = `suivi_nutrition-${clientBase}-BYL.pdf`;
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
        description: e?.message || i18n.t("auto.MenuJournalierFromRation.impossible_de_generer_le_pdf", "Impossible de générer le PDF."),
      });
    } finally {
      setExportingPdf(false);
    }
  }, [
    activeDiet,
    aiRecipes,
    aiShoppingList,
    clientSummary,
    coachPdfName,
    coveredMealsCount,
    docData?.foodSurvey,
    patientName,
    patientNote,
    pathologies,
    pdfDays,
    pdfLogoDataUrl,
    rationItems,
    selectedAdviceSheets,
    sharePatientNote,
    shareSelection,
    sourceLabel,
    targets?.ration,
    toast,
    translatedObjectiveRaw,
  ]);

  if (!isAdmin) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.MenuJournalierFromRation.acces_refuse", "Accès refusé")}</Heading>
        <Text mt={2} opacity={0.7}>{i18n.t("auto.MenuJournalierFromRation.cet_espace_est_reserve_aux_professionnels_nutritio", "Cet espace est réservé aux professionnels nutrition autorisés.")}</Text>
      </Box>
    );
  }

  if (loadingDoc) {
    return <AppLoading label={i18n.t("auto.MenuJournalierFromRation.chargement", "Chargement...")} />;
  }

  if (!docData) {
    return (
      <Box p={6}>
        <Heading size="md">{i18n.t("auto.MenuJournalierFromRation.bilan_introuvable", "Bilan introuvable")}</Heading>
        <Button mt={4} onClick={goBack}>{i18n.t("programView.back", "Retour")}</Button>
      </Box>
    );
  }

  return (
    <Box minH="100vh" p={{ base: 3, md: 6 }} pb={{ base: 28, md: 6 }} bg={nutritionTheme.pageBg} color={nutritionTheme.textColor}>
      <Stack spacing={4} maxW="7xl" mx="auto">
        <NutritionWorkflowBar
          activeStep="menu"
          clientId={clientId}
          assessmentId={assessmentId}
          navigate={navigateWithFallback}
        />

        <Box {...sectionCardProps} overflow="hidden">
          <Box bg={panelBg} px={{ base: 4, md: 5 }} py={{ base: 4, md: 5 }}>
            <HStack justify="space-between" align={{ base: "stretch", md: "center" }} gap={4} flexDirection={{ base: "column", lg: "row" }}>
              <HStack spacing={3} flexWrap="wrap" align="center">
                <Button size={{ base: "sm", md: "md" }} variant="outline" onClick={goBack} data-testid="nutrition-menu-back-top">{i18n.t("programView.back", "Retour")}</Button>
                <Box>
                  <HStack spacing={2} flexWrap="wrap">
                    <Heading size={{ base: "sm", md: "md" }}>{i18n.t("auto.MenuJournalierFromRation.menu_journalier", "Menu journalier")}</Heading>
                    <Badge colorScheme={blocked ? "yellow" : "green"}>
                      {blocked
                        ? i18n.t("auto.MenuJournalierFromRation.bilan_a_finaliser", "Bilan à finaliser")
                        : i18n.t("auto.MenuJournalierFromRation.pret", "Prêt")}
                    </Badge>
                  </HStack>
                  <Text fontSize="sm" color={textMuted} mt={1}>{i18n.t("auto.MenuJournalierFromRation.base_menu_construite_a_partir_de_la_ration_retenue", "Base menu construite à partir de la ration retenue.")}</Text>
                </Box>
              </HStack>

              <HStack spacing={2} flexWrap={{ base: "wrap", md: "nowrap" }} justify={{ base: "stretch", lg: "flex-end" }} w={{ base: "100%", lg: "auto" }}>
                <HStack
                  spacing={2}
                  borderWidth="1px"
                  borderColor={borderCol}
                  borderRadius="full"
                  bg={nutritionTheme.surfaceSoft}
                  p={1}
                  w={{ base: "100%", md: "auto" }}
                >
                  <Text display={{ base: "none", md: "block" }} px={3} fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={textMuted}>
                    {i18n.t("auto.MenuJournalierFromRation.mode_de_travail", "MODE")}
                  </Text>
                    <Button
                      flex="1"
                      h={{ base: "40px", md: "38px" }}
                      minW={{ base: 0, md: "96px" }}
                      borderRadius="full"
                      variant={activeTab === 0 ? "solid" : "ghost"}
                      colorScheme="blue"
                      onClick={() => changeActiveTab(0)}
                      isDisabled={blocked}
                    >{i18n.t("auto.MenuJournalierFromRation.manuel", "Manuel")}</Button>
                    <Button
                      flex="1"
                      h={{ base: "40px", md: "38px" }}
                      minW={{ base: 0, md: "96px" }}
                      borderRadius="full"
                      variant={activeTab === 1 ? "solid" : "ghost"}
                      colorScheme="blue"
                      onClick={() => changeActiveTab(1)}
                      isDisabled={blocked}
                    >{i18n.t("auto.MenuJournalierFromRation.auto", "Auto")}</Button>
                </HStack>

                <Button
                  variant="outline"
                  borderRadius="full"
                  size={{ base: "xs", md: "md" }}
                  flex={{ base: "0 0 auto", md: "0 0 auto" }}
                  ml={{ base: "auto", md: 0 }}
                  onClick={loadCiqual}
                  isLoading={ciqualLoading}
                  loadingText={i18n.t("common.loading", "Chargement…")}
                >
                  {i18n.t("auto.MenuJournalierFromRation.actualiser", "Actualiser")}
                </Button>
              </HStack>
            </HStack>

            <SimpleGrid display={{ base: "none", md: "grid" }} columns={{ md: 1, lg: 3 }} spacing={3} mt={5}>
              <Box p={4} borderWidth="1px" borderColor={menuAccentCards.dossier.border} borderRadius="md" bg={menuAccentCards.dossier.bg} color={menuAccentCards.dossier.text}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={menuAccentCards.dossier.label}>
                  {i18n.t("auto.MenuJournalierFromRation.dossier", "DOSSIER")}
                </Text>
                <Text mt={1} fontSize="xl" fontWeight="900" noOfLines={1}>
                  {patientName}
                </Text>
                <Text fontSize="sm" color={menuAccentCards.dossier.muted}>
                  {clientSummary || i18n.t("auto.MenuJournalierFromRation.contexte_general_a_completer", "Contexte général à compléter")}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={menuAccentCards.nutrition.border} borderRadius="md" bg={menuAccentCards.nutrition.bg} color={menuAccentCards.nutrition.text}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={menuAccentCards.nutrition.label}>{i18n.t("auto.MenuJournalierFromRation.cadre_nutrition", "CADRE NUTRITION")}</Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {translatedObjectiveRaw || i18n.t("auto.MenuJournalierFromRation.objectif_a_preciser", "Objectif à préciser")}
                </Text>
                <Text fontSize="sm" color={menuAccentCards.nutrition.muted} noOfLines={2}>
                  {[
                    activeDiet.length ? activeDiet.join(", ") : i18n.t("auto.MenuJournalierFromRation.aucun_regime_specifique", "Aucun régime spécifique"),
                    pathologies.length ? pathologies.slice(0, 2).join(", ") : i18n.t("auto.MenuJournalierFromRation.aucune_pathologie", "Aucune pathologie"),
                  ].join(" • ")}
                </Text>
              </Box>

              <Box p={4} borderWidth="1px" borderColor={menuAccentCards.ration.border} borderRadius="md" bg={menuAccentCards.ration.bg} color={menuAccentCards.ration.text}>
                <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={menuAccentCards.ration.label}>{i18n.t("auto.MenuJournalierFromRation.ration_et_donnees", "RATION ET DONNÉES")}</Text>
                <Text mt={1} fontSize="lg" fontWeight="800">
                  {sourceLabel}
                </Text>
                <HStack mt={2} spacing={2} flexWrap="wrap">
                  <Badge colorScheme={rationHasAnyQty ? "green" : "orange"}>
                    {targets?.ration?.kcal
                      ? i18n.t("auto.MenuJournalierFromRation.ration_kcal", "Ration {{kcal}} kcal", { kcal: r0(targets.ration.kcal) })
                      : i18n.t("auto.MenuJournalierFromRation.ration_a_relire", "Ration à relire")}
                  </Badge>
                  <Badge colorScheme="teal">
                    {i18n.t("auto.MenuJournalierFromRation.repas_reference_count", "{{count}} repas de référence", {
                      count: coveredMealsCount,
                    })}
                  </Badge>
                  <Badge colorScheme={ciqualOk ? "green" : "red"}>
                    {ciqualOk
                      ? i18n.t("auto.MenuJournalierFromRation.donnees_pretes", "Données prêtes")
                      : i18n.t("auto.MenuJournalierFromRation.donnees_a_charger", "Données à charger")}
                  </Badge>
                </HStack>
              </Box>
            </SimpleGrid>

            <Box display={{ base: "block", md: "none" }} mt={4} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={nutritionTheme.surfaceSoft} p={3}>
              <HStack justify="space-between" align="start" gap={3}>
                <Box minW={0}>
                  <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={textMuted}>
                    {i18n.t("auto.MenuJournalierFromRation.dossier", "DOSSIER")}
                  </Text>
                  <Text fontSize="lg" fontWeight="900" noOfLines={1}>{patientName}</Text>
                  <Text fontSize="sm" color={textMuted} noOfLines={2}>
                    {[translatedObjectiveRaw || i18n.t("auto.MenuJournalierFromRation.objectif_a_preciser", "Objectif à préciser"), sourceLabel].filter(Boolean).join(" • ")}
                  </Text>
                </Box>
                <Badge colorScheme={ciqualOk ? "green" : "orange"} borderRadius="full" px={3} py={1}>
                  {ciqualOk
                    ? i18n.t("auto.MenuJournalierFromRation.donnees_pretes", "Données prêtes")
                    : i18n.t("auto.MenuJournalierFromRation.donnees_a_charger", "Données à charger")}
                </Badge>
              </HStack>
            </Box>

            <Box mt={4} borderWidth="1px" borderColor={borderCol} borderRadius="lg" bg={nutritionTheme.surfaceSoft} p={4}>
              <HStack justify="space-between" align="start" gap={3} flexWrap="wrap" mb={3}>
                <Box>
                  <Text fontSize="xs" fontWeight="900" letterSpacing="0.08em" color={textMuted}>
                    {i18n.t("auto.MenuJournalierFromRation.synthese_rapide", "SYNTHÈSE RAPIDE")}
                  </Text>
                  <Heading size="sm" mt={1}>{i18n.t("auto.MenuJournalierFromRation.pilotage_du_menu", "Pilotage du menu")}</Heading>
                </Box>
                <Badge colorScheme={ciqualOk && rationHasAnyQty ? "green" : "orange"} borderRadius="full" px={3} py={1}>
                  {activeTab === 1
                    ? i18n.t("auto.MenuJournalierFromRation.mode_auto_upper", "MODE AUTO")
                    : i18n.t("auto.MenuJournalierFromRation.mode_manuel_upper", "MODE MANUEL")}
                </Badge>
              </HStack>

              <SimpleGrid columns={{ base: 2, lg: 4 }} spacing={3}>
                <Box p={{ base: 3, md: 3 }} minH={{ base: "118px", md: "auto" }} borderWidth="1px" borderColor={menuAccentCards.dossier.border} borderRadius="md" bg={menuAccentCards.dossier.bg} color={menuAccentCards.dossier.text}>
                  <Text fontSize="xs" fontWeight="900" color={menuAccentCards.dossier.label} textTransform="uppercase">
                    {i18n.t("auto.MenuJournalierFromRation.jours", "Jours")}
                  </Text>
                  <Text mt={2} fontSize="2xl" fontWeight="900" lineHeight="1">
                    {pdfDays.length || "—"}
                  </Text>
                  <Text mt={1} fontSize="sm" color={menuAccentCards.dossier.muted}>
                    {i18n.t("auto.MenuJournalierFromRation.menu_a_relire", "Menu à relire")}
                  </Text>
                </Box>

                <Box p={{ base: 3, md: 3 }} minH={{ base: "118px", md: "auto" }} borderWidth="1px" borderColor={menuAccentCards.nutrition.border} borderRadius="md" bg={menuAccentCards.nutrition.bg} color={menuAccentCards.nutrition.text}>
                  <Text fontSize="xs" fontWeight="900" color={menuAccentCards.nutrition.label} textTransform="uppercase">
                    {i18n.t("auto.MenuJournalierFromRation.repas_de_reference", "Repas de référence")}
                  </Text>
                  <Text mt={2} fontSize="2xl" fontWeight="900" lineHeight="1">
                    {coveredMealsCount}
                  </Text>
                  <Text mt={1} fontSize="sm" color={menuAccentCards.nutrition.muted}>
                    {i18n.t("auto.MenuJournalierFromRation.a_respecter_depuis_la_ration", "À respecter depuis la ration")}
                  </Text>
                </Box>

                <Box p={{ base: 3, md: 3 }} minH={{ base: "118px", md: "auto" }} borderWidth="1px" borderColor={menuAccentCards.ration.border} borderRadius="md" bg={menuAccentCards.ration.bg} color={menuAccentCards.ration.text}>
                  <Text fontSize="xs" fontWeight="900" color={menuAccentCards.ration.label} textTransform="uppercase">
                    {i18n.t("auto.MenuJournalierFromRation.cible", "Cible")}
                  </Text>
                  <Text mt={2} fontSize="2xl" fontWeight="900" lineHeight="1">
                    {targets?.ration?.kcal ? r0(targets.ration.kcal) : "—"}
                  </Text>
                  <Text mt={1} fontSize="sm" color={menuAccentCards.ration.muted}>kcal</Text>
                </Box>

                <Box p={{ base: 3, md: 3 }} minH={{ base: "118px", md: "auto" }} borderWidth="1px" borderColor={menuAccentCards.output.border} borderRadius="md" bg={menuAccentCards.output.bg} color={menuAccentCards.output.text}>
                  <Text fontSize="xs" fontWeight="900" color={menuAccentCards.output.label} textTransform="uppercase">
                    {i18n.t("auto.MenuJournalierFromRation.sorties", "Sorties")}
                  </Text>
                  <Text mt={2} fontSize="2xl" fontWeight="900" lineHeight="1">
                    {aiRecipes.length + aiShoppingSections.length}
                  </Text>
                  <Text mt={1} fontSize="sm" color={menuAccentCards.output.muted}>
                    {i18n.t("auto.MenuJournalierFromRation.recettes_et_courses", "recettes & courses")}
                  </Text>
                </Box>
              </SimpleGrid>
            </Box>

            {!ciqualOk ? (
              <Alert status="error" rounded="xl" mt={4}>
                <AlertIcon />
                <Box>
                  <AlertTitle>{i18n.t("auto.MenuJournalierFromRation.donnees_alimentaires_non_chargees", "Données alimentaires non chargées")}</AlertTitle>
                  <AlertDescription>
                    {ciqualError ||
                      i18n.t("auto.MenuJournalierFromRation.impossible_de_charger_les_donnees_alimentaires_necessaires", "Impossible de charger les données alimentaires nécessaires à la génération.")}
                  </AlertDescription>
                </Box>
              </Alert>
            ) : null}

            {!rationItems.length || !rationHasAnyQty ? (
              <Alert status="warning" rounded="xl" mt={4}>
                <AlertIcon />
                <Box>
                  <AlertTitle>{i18n.t("auto.MenuJournalierFromRation.la_ration_n_est_pas_encore_exploitable_pour_le_men", "La ration n’est pas encore exploitable pour le menu")}</AlertTitle>
                  <AlertDescription>{i18n.t("auto.MenuJournalierFromRation.retourne_sur_la_page_ration_puis_sauvegarde_explic", "Retourne sur la page ration puis sauvegarde explicitement l’étape avant de revenir ici.")}</AlertDescription>
                </Box>
              </Alert>
            ) : null}
          </Box>
        </Box>

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>{i18n.t("auto.MenuJournalierFromRation.menu_a_relire", "MENU À RELIRE")}</Text>
          <Heading size="sm" mt={1}>{i18n.t("auto.MenuJournalierFromRation.construction_du_menu", "Construction du menu")}</Heading>
          <Text fontSize="sm" color={textMuted} mt={1} mb={4}>
            {activeTab === 0
              ? i18n.t("auto.MenuJournalierFromRation.mode_manuel_description", "Le mode manuel te laisse choisir précisément les aliments détaillés.")
              : i18n.t("auto.MenuJournalierFromRation.mode_auto_description", "Le mode auto génère une base multi-jours, à relire avant validation.")}
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

        <Box {...sectionCardProps} p={{ base: 4, md: 5 }}>
          <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
            <Box>
              <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={textMuted}>{i18n.t("auto.MenuJournalierFromRation.sorties_patient", "SORTIES PATIENT")}</Text>
              <Heading size="sm" mt={1}>{i18n.t("auto.MenuJournalierFromRation.recettes_et_liste_de_courses", "Recettes et liste de courses")}</Heading>
              <Text fontSize="sm" color={textMuted} mt={1}>{i18n.t("auto.MenuJournalierFromRation.preparees_a_partir_du_menu_affiche_avec_les_quanti", "Préparées à partir du menu affiché, avec les quantités validées.")}</Text>
            </Box>
            <HStack spacing={2} flexWrap="wrap">
              <Button size="sm" variant="outline" onClick={() => setShowPatientRecipes((prev) => !prev)}>
                {showPatientRecipes
                  ? i18n.t("auto.MenuJournalierFromRation.masquer_les_recettes", "Masquer les recettes")
                  : i18n.t("auto.MenuJournalierFromRation.voir_les_recettes_jour_par_jour", "Voir les recettes jour par jour")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPatientShoppingList((prev) => !prev)}>
                {showPatientShoppingList
                  ? i18n.t("auto.MenuJournalierFromRation.masquer_la_liste_de_courses", "Masquer la liste de courses")
                  : i18n.t("auto.MenuJournalierFromRation.voir_la_liste_de_courses", "Voir la liste de courses")}
              </Button>
              <Badge colorScheme="green" px={3} py={1} borderRadius="full">{i18n.t("auto.MenuJournalierFromRation.pret_a_partager", "Prêt à partager")}</Badge>
            </HStack>
          </HStack>

          <SimpleGrid columns={{ base: 1, xl: 2 }} spacing={4} mt={4} alignItems="start">
            <Box borderWidth="1px" borderColor={borderCol} borderRadius="md" p={4} bg={nutritionTheme.surfaceSoft}>
              <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
                <Heading size="xs">{i18n.t("auto.MenuJournalierFromRation.recettes_jour_par_jour", "Recettes jour par jour")}</Heading>
                <Badge colorScheme="blue">{aiRecipes.length}</Badge>
              </HStack>
              <Stack spacing={3} mt={3}>
                {!showPatientRecipes ? (
                  <Text fontSize="sm" color={textMuted}>{i18n.t("auto.MenuJournalierFromRation.les_recettes_sont_pretes_pour_le_partage_patient_o", "Les recettes sont prêtes pour le partage patient. Ouvre-les uniquement si tu veux les relire côté pro.")}</Text>
                ) : aiRecipeGroups.length ? (
                  aiRecipeGroups.map((group) => (
                    <Box key={group.key}>
                      <HStack justify="space-between" align="center" mb={2}>
                        <Heading size="xs">{i18n.t(group.labelKey, group.labelDefault)}</Heading>
                        <Badge colorScheme="blue">{group.recipes.length}</Badge>
                      </HStack>
                      <Stack spacing={3}>
                        {group.recipes.map((recipe) => (
                          <Box key={`ai_recipe_${recipe.__recipeIndex}`} borderWidth="1px" borderColor={borderCol} borderRadius="md" p={3} bg={panelBg}>
                            <Box minW={0}>
                              <Text fontWeight="900">{recipe.name || recipe.title || i18n.t("auto.MenuJournalierFromRation.recette_count", "Recette {{count}}", { count: recipe.__recipeIndex + 1 })}</Text>
                              <Text fontSize="xs" color={textMuted} mt={1}>
                                {[recipe.dayLabel, recipe.mealLabel].filter(Boolean).join(" • ")}
                                {recipe.dayLabel || recipe.mealLabel ? " · " : ""}
                                {i18n.t("auto.MenuJournalierFromRation.recipe_times", "Prépa {{prep}} min • Cuisson {{cook}} min", {
                                  prep: recipe.preparationTimeMin || recipe.prepTimeMin || "—",
                                  cook: recipe.cookingTimeMin || recipe.cookTimeMin || "—",
                                })}
                              </Text>
                              <Wrap spacing={1.5} mt={2}>
                                {recipeIngredientsText(recipe).slice(0, 8).map((ingredient) => (
                                  <WrapItem key={ingredient}>
                                    <Badge variant="subtle" colorScheme="blue">
                                      {ingredient}
                                    </Badge>
                                  </WrapItem>
                                ))}
                              </Wrap>
                              {normalizeAiList(recipe.steps).length ? (
                                <Stack spacing={1} mt={3}>
                                  {normalizeAiList(recipe.steps).slice(0, 8).map((step, stepIndex) => (
                                    <Text key={`step_${stepIndex}`} fontSize="sm">
                                      {stepIndex + 1}. {stableAiItemText(step)}
                                    </Text>
                                  ))}
                                </Stack>
                              ) : null}
                              <Text fontSize="xs" color={textMuted} mt={3}>{i18n.t("auto.MenuJournalierFromRation.nutrition_recalcul_ciqual_uniquement", "Nutrition: recalcul CIQUAL uniquement.")}</Text>
                            </Box>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  ))
                ) : (
                  <Text fontSize="sm" color={textMuted}>{i18n.t("auto.MenuJournalierFromRation.les_recettes_apparaitront_apres_une_optimisation_i", "Les recettes apparaîtront après une optimisation IA validée ou dès qu’un menu exploitable sera structuré en repas.")}</Text>
                )}
              </Stack>
            </Box>

            <Box borderWidth="1px" borderColor={borderCol} borderRadius="md" p={4} bg={nutritionTheme.surfaceSoft}>
              <HStack justify="space-between" align="center" gap={3} flexWrap="wrap">
                <Heading size="xs">{i18n.t("auto.MenuJournalierFromRation.liste_de_courses", "Liste de courses")}</Heading>
                <Badge colorScheme="green">{aiShoppingSections.length}</Badge>
              </HStack>
              <Stack spacing={3} mt={3}>
                {!showPatientShoppingList ? (
                  <Text fontSize="sm" color={textMuted}>
                    {aiShoppingSections.length
                      ? i18n.t("auto.MenuJournalierFromRation.liste_courses_prete_partage_patient", "La liste de courses est prête pour le partage patient. Ouvre-la uniquement si tu veux la relire côté pro.")
                      : i18n.t("auto.MenuJournalierFromRation.aucune_liste_de_courses_exploitable_pour_le_moment", "Aucune liste de courses exploitable pour le moment.")}
                  </Text>
                ) : aiShoppingSections.length ? (
                  aiShoppingSections.map((section) => (
                    <Box key={section.section || section.label} borderWidth="1px" borderColor={borderCol} borderRadius="md" p={3} bg={panelBg}>
                      <Text fontSize="sm" fontWeight="900">
                        {section.label || section.section || i18n.t("auto.MenuJournalierFromRation.rayon", "Rayon")}
                      </Text>
                      <Stack spacing={1} mt={2}>
                        {normalizeAiList(section.items).slice(0, 8).map((item, index) => (
                          <Text key={`${section.section || section.label}_${index}`} fontSize="sm">
                            {item.name || item.label} {item.quantity ? `• ${item.quantity} ${item.unit || ""}` : ""}
                          </Text>
                        ))}
                      </Stack>
                    </Box>
                  ))
                ) : (
                  <Text fontSize="sm" color={textMuted}>{i18n.t("auto.MenuJournalierFromRation.aucune_liste_de_courses_exploitable_pour_le_moment", "Aucune liste de courses exploitable pour le moment.")}</Text>
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
          blocked={blocked}
          theme={nutritionTheme}
        />

        <Box {...sectionCardProps} p={4}>
          <HStack spacing={3} flexWrap="wrap" align="center" justify="space-between">
            <Button variant="outline" onClick={goBack} data-testid="nutrition-menu-back-bottom">{i18n.t("programView.back", "Retour")}</Button>

            <Button
              {...nutritionTheme.primaryButtonProps}
              onClick={openShareModal}
              data-testid="nutrition-menu-validate-share"
              isDisabled={blocked}
              isLoading={preparingShare || savingShare}
              loadingText={i18n.t("auto.MenuJournalierFromRation.preparation", "Préparation")}
            >{i18n.t("auto.MenuJournalierFromRation.valider_partager", "Valider / partager")}</Button>
          </HStack>
        </Box>
      </Stack>

      <Modal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        size={{ base: "full", md: "xl" }}
        scrollBehavior="inside"
        isCentered
      >
        <ModalOverlay />
        <ModalContent borderRadius={{ base: 0, md: "lg" }} bg={panelBg}>
          <ModalHeader>{i18n.t("auto.MenuJournalierFromRation.validation_du_suivi_client", "Validation du suivi client")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text color={textMuted} fontSize="sm">{i18n.t("auto.MenuJournalierFromRation.choisis_ce_que_le_client_pourra_consulter_dans_son", "Choisis ce que le client pourra consulter dans son espace. Si tu sauvegardes sans partager, le dossier reste uniquement visible côté professionnel.")}</Text>

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
              >{i18n.t("auto.MenuJournalierFromRation.tout_partager", "Tout partager")}</Checkbox>
              <Divider />
              <Checkbox
                isChecked={!!shareSelection.summary}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, summary: e.target.checked }))}
              >{i18n.t("auto.MenuJournalierFromRation.resume_du_bilan_et_objectifs", "Résumé du bilan et objectifs")}</Checkbox>
              <Checkbox
                isChecked={!!shareSelection.foodSurvey}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, foodSurvey: e.target.checked }))}
              >{i18n.t("auto.MenuJournalierFromRation.ration_spontanee_habitudes_alimentaires", "Ration spontanée / habitudes alimentaires")}</Checkbox>
              <Checkbox
                isChecked={!!shareSelection.ration}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, ration: e.target.checked }))}
              >{i18n.t("auto.MenuJournalierFromRation.ration_alimentaire_construite", "Ration alimentaire construite")}</Checkbox>
              <Checkbox
                isChecked={!!shareSelection.menu}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, menu: e.target.checked }))}
              >{i18n.t("auto.MenuJournalierFromRation.menu_journalier", "Menu journalier")}</Checkbox>
              <Checkbox
                isChecked={!!shareSelection.recipes}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, recipes: e.target.checked }))}
              >
                {i18n.t("auto.MenuJournalierFromRation.recettes_jour_par_jour_count", "Recettes jour par jour ({{count}})", { count: aiRecipes.length })}
              </Checkbox>
              <Checkbox
                isChecked={!!shareSelection.shoppingList}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, shoppingList: e.target.checked }))}
              >{i18n.t("auto.MenuJournalierFromRation.liste_de_courses", "Liste de courses")}</Checkbox>
              <Checkbox
                isChecked={!!shareSelection.adviceSheets}
                onChange={(e) => setShareSelection((prev) => ({ ...prev, adviceSheets: e.target.checked }))}
              >
                {i18n.t("auto.MenuJournalierFromRation.fiches_conseils_selectionnees_count", "Fiches conseils sélectionnées ({{count}})", { count: selectedAdviceSheetIds.length })}
              </Checkbox>
              <Checkbox
                isChecked={!!sharePatientNote}
                onChange={(e) => setSharePatientNote(e.target.checked)}
                isDisabled={!patientNote.trim()}
              >{i18n.t("auto.MenuJournalierFromRation.note_patient_personnalisee", "Note patient personnalisée")}</Checkbox>
              <Textarea
                value={patientNote}
                onChange={(e) => setPatientNote(e.target.value)}
                placeholder={i18n.t("auto.MenuJournalierFromRation.note_visible_cote_patient_si_elle_est_cochee", "Note visible côté patient si elle est cochée...")}
                minH="90px"
              />
              <Box borderWidth="1px" borderColor={borderCol} borderRadius="md" bg={nutritionTheme.surfaceSoft} p={4}>
                <Text fontWeight="800">{i18n.t("auto.MenuJournalierFromRation.documents_pdf", "Documents PDF")}</Text>
                <Text color={textMuted} fontSize="sm" mt={1}>
                  {i18n.t("auto.MenuJournalierFromRation.genere_un_pdf_selon_les_sections_cochees", "Génère un seul PDF avec uniquement les sections cochées ci-dessus.")}
                </Text>
                <Button
                  mt={3}
                  variant="outline"
                  leftIcon={<DownloadIcon />}
                  onClick={handleDownloadPDF}
                  isLoading={exportingPdf}
                  isDisabled={
                    !SHARE_SECTION_KEYS.some((key) => !!shareSelection[key]) &&
                    !(sharePatientNote && patientNote.trim())
                  }
                >
                  {i18n.t("auto.MenuJournalierFromRation.pdf_elements_coches", "PDF des éléments cochés")}
                </Button>
              </Box>
            </Stack>
          </ModalBody>
          <ModalFooter
            gap={3}
            flexWrap="wrap"
            flexDirection={{ base: "column", sm: "row" }}
            alignItems={{ base: "stretch", sm: "center" }}
          >
            <Button
              variant="ghost"
              onClick={() => setShareModalOpen(false)}
              data-testid="nutrition-share-cancel"
              isDisabled={savingShare}
              w={{ base: "100%", sm: "auto" }}
            >{i18n.t("auto.MenuJournalierFromRation.annuler_validation", "Annuler")}</Button>
            <Button
              variant="outline"
              onClick={() => saveMenuAndShare({ share: false })}
              data-testid="nutrition-share-save-private"
              isLoading={savingShare}
              w={{ base: "100%", sm: "auto" }}
            >{i18n.t("auto.MenuJournalierFromRation.sauvegarder_sans_partager", "Sauvegarder sans partager")}</Button>
            <Button
              {...nutritionTheme.primaryButtonProps}
              onClick={() => saveMenuAndShare({ share: true })}
              data-testid="nutrition-share-save-public"
              isLoading={savingShare}
              w={{ base: "100%", sm: "auto" }}
            >{i18n.t("auto.MenuJournalierFromRation.sauvegarder_partager", "Sauvegarder & partager")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
