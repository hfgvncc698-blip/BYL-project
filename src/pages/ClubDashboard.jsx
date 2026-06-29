import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Circle,
  Container,
  Flex,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Icon,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tbody,
  Td,
  Textarea,
  Text,
  Th,
  Thead,
  Tr,
  useDisclosure,
  useColorModeValue,
  useToast,
  VStack,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuOptionGroup,
  MenuItemOption,
} from "@chakra-ui/react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { AddIcon, ArrowBackIcon, ChevronDownIcon, CloseIcon, DeleteIcon, TimeIcon } from "@chakra-ui/icons";
import { Calendar, momentLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import moment from "moment";
import "moment/locale/fr";
import "moment/locale/de";
import "moment/locale/it";
import "moment/locale/es";
import "moment/locale/ru";
import "moment/locale/ar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { apiFetch } from "../utils/api";
import { db } from "../firebaseConfig";
import { resolveStorageUrl } from "../utils/storageUrls";
import i18n, { ensureLanguageLoaded } from "../i18n/index";
import { getCalendarCulture } from "../utils/calendarLocale";
import { useAppTheme } from "../styles/appTheme";
import AppLoading from "../components/ui/AppLoading";
import { useAuth } from "../AuthContext";
import { MdLanguage, MdOutlineCreditCard, MdOutlineLock } from "react-icons/md";

moment.locale("fr");
const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);
const calendarFormats = {
  monthHeaderFormat: (date) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { month: "long", year: "numeric" }).format(date),
  weekdayFormat: (date) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { weekday: "short" }).format(date).replace(".", ""),
  dayHeaderFormat: (date) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(date),
  dayRangeHeaderFormat: ({ start, end }) =>
    `${new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { day: "2-digit", month: "short" }).format(start)} - ${new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(end)}`,
  agendaHeaderFormat: ({ start, end }) =>
    `${new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { day: "2-digit", month: "short" }).format(start)} - ${new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(end)}`,
};
const NUTRITION_APPOINTMENT_TYPES = [
  { value: "bilan", label: "Bilan nutrition" },
  { value: "suivi", label: "Suivi nutrition" },
  { value: "ajustement", label: "Ajustement alimentaire" },
  { value: "consultation", label: "Consultation nutrition" },
];
const APPOINTMENT_DURATIONS = [15, 30, 45, 60, 90];

function displayName(person) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(" ").trim() || person?.name || person?.email || "Pro";
}

function displayCoachName(value) {
  if (!value || value === "Pro") return i18n.t("clubDashboard.filters.unknownPro", "Référent non identifié");
  return value;
}

function formatDate(value) {
  if (!value) return i18n.t("clubDashboard.empty.noActivity", "Aucune activité");
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return i18n.t("clubDashboard.empty.noActivity", "Aucune activité");
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDateTime(value) {
  if (!value) return i18n.t("clubDashboard.empty.noDate", "Aucune date");
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return i18n.t("clubDashboard.empty.noDate", "Aucune date");
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatTime(value) {
  if (!value) return "";
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDateTimeLocalValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isTouchDevice() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)")?.matches || "ontouchstart" in window;
}

function getProgramSessions(program) {
  if (Array.isArray(program?.sessions)) return program.sessions;
  if (Array.isArray(program?.seances)) return program.seances;
  return [];
}

function getSessionLabel(session, index) {
  return session?.name || session?.title || session?.nom || session?.label || `Séance ${index + 1}`;
}

function formatFullDate(value = new Date()) {
  return new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language || "fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bonjour";
  if (hour < 18) return "Bon après-midi";
  return "Bonsoir";
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekKey(date = new Date()) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() + 4 - day);
  const yearStart = new Date(copy.getFullYear(), 0, 1);
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getGoalPeriodKey(period, date = new Date()) {
  if (period === "week") return getWeekKey(date);
  if (period === "year") return String(date.getFullYear());
  return getMonthKey(date);
}

function getPeriodStart(period, now = Date.now()) {
  const date = new Date(now);
  if (period === "year") {
    date.setMonth(0, 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (period === "month") {
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  if (period === "week") {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function friendlyError(error) {
  const message = error?.message || "";
  if (error?.status === 404 || /not found/i.test(message)) {
    return "Le module Club n’est pas encore chargé côté API. Si le serveur backend tourne depuis avant l’ajout de cette page, il faut le redémarrer puis rafraîchir.";
  }
  if (error?.status === 403) {
    return "Action refusée pour ce club. Vérifie que le club cible est bien sélectionné, puis réessaie depuis le dashboard club.";
  }
  return message || "Impossible de charger le dashboard club.";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("file-read-failed"));
    reader.readAsDataURL(file);
  });
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const CLUB_VIEWS = [
  { key: "clients", labelKey: "clubDashboard.views.clients", fallback: "Clients" },
  { key: "programs", labelKey: "clubDashboard.views.programs", fallback: "Programmes" },
  { key: "nutrition", labelKey: "clubDashboard.views.nutrition", fallback: "Nutrition" },
  { key: "stats", labelKey: "clubDashboard.views.stats", fallback: "Statistiques" },
];

const CLUB_SECTIONS = {
  "/club-dashboard/create": "create",
  "/club-dashboard/team": "team",
  "/club-dashboard/clients": "activity",
  "/club-dashboard/programmes": "activity",
  "/club-dashboard/nutrition": "activity",
  "/club-dashboard/statistiques": "activity",
  "/club-dashboard/alertes": "alerts",
  "/club-dashboard/journal": "log",
  "/club-dashboard/audit": "audit",
  "/club-dashboard/objectifs": "goals",
  "/club-dashboard/exports": "exports",
  "/club-dashboard/actions-groupees": "bulk",
  "/club-dashboard/settings": "settings",
  "/club-dashboard/calendrier": "calendar",
};

const VIEW_BY_PATH = {
  "/club-dashboard/clients": "clients",
  "/club-dashboard/programmes": "programs",
  "/club-dashboard/nutrition": "nutrition",
  "/club-dashboard/statistiques": "stats",
};

const ACTIVITY_PAGE_META = {
  clients: ["clubDashboard.activity.clients.title", "Clients du club", "clubDashboard.activity.clients.subtitle", "Retrouvez les clients rattachés aux pros du club, avec leur référent et leur dernière activité."],
  programs: ["clubDashboard.activity.programs.title", "Programmes du club", "clubDashboard.activity.programs.subtitle", "Suivez les programmes créés par l’équipe et identifiez rapidement le pro responsable."],
  nutrition: ["clubDashboard.activity.nutrition.title", "Nutrition du club", "clubDashboard.activity.nutrition.subtitle", "Centralisez les bilans nutrition, les objectifs et les statuts de suivi des patients."],
  stats: ["clubDashboard.activity.stats.title", "Statistiques club", "clubDashboard.activity.stats.subtitle", "Analysez l’activité globale du club, la répartition par pro et les capacités utilisées."],
};

const PRO_TYPES = {
  sport: ["clubDashboard.proTypes.sport", "Coach sportif"],
  nutrition: ["clubDashboard.proTypes.nutrition", "Diététicien / nutrition"],
  complete: ["clubDashboard.proTypes.complete", "Coach + nutrition"],
};
const CLUB_TOOLS = [
  { key: "alerts", path: "/club-dashboard/alertes", labelKey: "clubDashboard.tools.alerts", fallback: "Alertes" },
  { key: "log", path: "/club-dashboard/journal", labelKey: "clubDashboard.tools.log", fallback: "Journal" },
  { key: "audit", path: "/club-dashboard/audit", labelKey: "clubDashboard.tools.audit", fallback: "Audit données" },
  { key: "goals", path: "/club-dashboard/objectifs", labelKey: "clubDashboard.tools.goals", fallback: "Objectifs" },
  { key: "exports", path: "/club-dashboard/exports", labelKey: "clubDashboard.tools.exports", fallback: "Exports" },
  { key: "bulk", path: "/club-dashboard/actions-groupees", labelKey: "clubDashboard.tools.bulk", fallback: "Actions groupées" },
];
const SUPPORTED_LANGUAGES = ["fr", "en", "de", "it", "es", "ru", "ar"];
const normalizeLanguage = (value) => (value || "fr").split("-")[0].toLowerCase();
const ADMIN_CLUB_STORAGE_KEY = "club_dashboard_admin_club_id";

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n;]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function getTrialEndMs(user) {
  const end = user.trialEndsAt?.toDate ? user.trialEndsAt.toDate().getTime() : new Date(user.trialEndsAt).getTime();
  return Number.isFinite(end) ? end : null;
}

export default function ClubDashboard() {
  const { t, i18n: translationI18n } = useTranslation("common");
  const { user, resetPassword, isAdmin } = useAuth();
  const calendarCulture = useMemo(
    () => getCalendarCulture(translationI18n.resolvedLanguage || translationI18n.language || "fr"),
    [translationI18n.resolvedLanguage, translationI18n.language]
  );
  useEffect(() => {
    moment.locale(calendarCulture);
  }, [calendarCulture]);
  const theme = useAppTheme();
  const toast = useToast();
  const calendarToolbarBg = useColorModeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.08)");
  const calendarPanelBg = useColorModeValue("rgba(15,23,42,0.01)", "rgba(2,6,23,0.34)");
  const calendarGridBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.20)");
  const calendarButtonColor = useColorModeValue("#0F172A", "rgba(255,255,255,0.92)");
  const calendarButtonBg = useColorModeValue("transparent", "rgba(255,255,255,0.08)");
  const calendarActiveBg = useColorModeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.24)");
  const calendarMutedBg = useColorModeValue("rgba(15,23,42,0.015)", "rgba(255,255,255,0.035)");
  const calendarTodayBg = useColorModeValue("rgba(59,130,246,0.06)", "rgba(96,165,250,0.18)");
  const setupEmptyBg = useColorModeValue(
    "linear-gradient(135deg, rgba(239,246,255,0.98), rgba(240,253,250,0.86))",
    "linear-gradient(135deg, rgba(15,23,42,0.96), rgba(8,47,73,0.52))"
  );
  const location = useLocation();
  const navigate = useNavigate();
  const adminClubId = useMemo(() => {
    if (!isAdmin) return "";
    const params = new URLSearchParams(location.search);
    const explicitClubId = params.get("adminClubId") || params.get("clubId") || "";
    if (explicitClubId) return explicitClubId;
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(ADMIN_CLUB_STORAGE_KEY) || "";
  }, [isAdmin, location.search]);

  useEffect(() => {
    if (!isAdmin || !adminClubId || typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_CLUB_STORAGE_KEY, adminClubId);
  }, [adminClubId, isAdmin]);

  const withAdminClub = useCallback(
    (path) => {
      if (!adminClubId) return path;
      const separator = path.includes("?") ? "&" : "?";
      return `${path}${separator}clubId=${encodeURIComponent(adminClubId)}&adminClubId=${encodeURIComponent(adminClubId)}`;
    },
    [adminClubId]
  );
  const appointmentDetailModal = useDisclosure();
  const inviteProModal = useDisclosure();
  const proLimitModal = useDisclosure();
  const [isAddAppointmentModalOpen, setIsAddAppointmentModalOpen] = useState(false);
  const [proLimitModalDismissed, setProLimitModalDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState("");
  const [auditRepairCoach, setAuditRepairCoach] = useState({});
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const loadedClubId = summary?.club?.id && summary.club.id !== "admin-club-preview" ? summary.club.id : "";
  const actionClubId = adminClubId || loadedClubId || user?.clubId || "";
  useEffect(() => {
    if (!isAdmin || !loadedClubId || loadedClubId === "admin-club-preview" || typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_CLUB_STORAGE_KEY, loadedClubId);
  }, [isAdmin, loadedClubId]);
  useEffect(() => {
    if (!isAdmin || adminClubId || !loadedClubId || location.search.includes("clubId=")) return;
    const params = new URLSearchParams(location.search);
    params.set("clubId", loadedClubId);
    params.set("adminClubId", loadedClubId);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [adminClubId, isAdmin, loadedClubId, location.pathname, location.search, navigate]);
  const [selectedCoachUid, setSelectedCoachUid] = useState("");
  const [activityCoachFilter, setActivityCoachFilter] = useState([]);
  const [calendarCoachFilter, setCalendarCoachFilter] = useState([]);
  const [logPeriod, setLogPeriod] = useState("week");
  const [statsPeriod, setStatsPeriod] = useState("month");
  const [goalPeriod, setGoalPeriod] = useState("month");
  const [goalTargets, setGoalTargets] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(window.localStorage.getItem("club_dashboard_goals") || "{}");
    } catch {
      return {};
    }
  });
  const [activeView, setActiveView] = useState("clients");
  const [inviteLink, setInviteLink] = useState("");
  const [identitySaving, setIdentitySaving] = useState(false);
  const [languageSaving, setLanguageSaving] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedLang, setSelectedLang] = useState(
    user?.settings?.defaultLanguage || user?.preferredLang || "fr"
  );
  const [identityForm, setIdentityForm] = useState({
    name: "",
    logoUrl: "",
  });
  const [resolvedClubLogoUrl, setResolvedClubLogoUrl] = useState("");
  const [clubLogoAspectRatio, setClubLogoAspectRatio] = useState(null);
  const [appointmentForm, setAppointmentForm] = useState({
    coachUid: "",
    clientId: "",
    type: "sport",
    programId: "",
    sessionIndex: "",
    appointmentKind: "suivi",
    durationMin: 60,
    title: "",
    startsAt: "",
    note: "",
  });
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointmentEditForm, setAppointmentEditForm] = useState({
    title: "",
    startsAt: "",
    durationMin: 60,
    status: "à venir",
    note: "",
  });
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    proType: "sport",
  });

  const stats = summary?.stats || {};
  const limits = summary?.limits || {};
  const hasStripeCustomer = Boolean(user?.stripeCustomerId || user?.stripe?.customerId);
  const coaches = useMemo(() => summary?.coaches || [], [summary]);
  const clubClients = useMemo(() => summary?.recentClients || [], [summary]);
  const clubPrograms = useMemo(() => summary?.recentPrograms || [], [summary]);
  const clubNutrition = useMemo(() => summary?.recentNutrition || [], [summary]);
  const clubSessions = useMemo(() => summary?.recentSessions || [], [summary]);
  const clubAppointments = useMemo(() => summary?.appointments || summary?.upcomingAppointments || [], [summary]);
  const appointmentClientOptions = useMemo(() => {
    if (!appointmentForm.coachUid) return [];
    return clubClients.filter((client) => client.coachUid === appointmentForm.coachUid);
  }, [appointmentForm.coachUid, clubClients]);
  const appointmentProgramOptions = useMemo(() => {
    if (!appointmentForm.clientId) return [];
    return clubPrograms.filter((program) => {
      const matchesClient = program.clientId === appointmentForm.clientId;
      const matchesCoach = !appointmentForm.coachUid || program.coachUid === appointmentForm.coachUid;
      return matchesClient && matchesCoach && getProgramSessions(program).length > 0;
    });
  }, [appointmentForm.clientId, appointmentForm.coachUid, clubPrograms]);
  const appointmentSessionOptions = useMemo(() => {
    const program = appointmentProgramOptions.find((item) => (item.programId || item.id) === appointmentForm.programId);
    return getProgramSessions(program);
  }, [appointmentForm.programId, appointmentProgramOptions]);
  const activeCoachFilterSet = useMemo(() => new Set(activityCoachFilter), [activityCoachFilter]);
  const analysablePros = useMemo(() => {
    const map = new Map();
    const put = (uid, name, base = {}) => {
      if (!uid && !name) return;
      const isUnknown = !name || name === "Pro";
      const key = isUnknown ? "__unknown__" : uid || `name:${name}`;
      const existing = map.get(key) || {};
      const resolvedName = name && name !== "Pro" ? name : existing.name || t("clubDashboard.filters.unknownPro", "Référent non identifié");
      map.set(key, {
        uid: key,
        realUid: uid || key,
        realUids: [...new Set([...(existing.realUids || []), uid].filter(Boolean))],
        name: resolvedName,
        firstName: base.firstName || existing.firstName || "",
        lastName: base.lastName || existing.lastName || "",
        email: base.email || existing.email || "",
        status: base.status || existing.status || "active",
        proType: base.proType || existing.proType || "sport",
        createdAt: base.createdAt || existing.createdAt || 0,
        isManagedMember: Boolean(base.uid || existing.isManagedMember),
      });
    };
    coaches.forEach((coach) => put(coach.uid, displayName(coach), coach));
    [...clubClients, ...clubPrograms, ...clubNutrition, ...clubSessions].forEach((item) => {
      put(item.coachUid, item.coachName, {});
    });
    return [...map.values()]
      .map((pro) => ({
        ...pro,
        clientCount: clubClients.filter((client) => pro.realUids.includes(client.coachUid) || (!client.coachUid && client.coachName === pro.name)).length,
        programCount: clubPrograms.filter((program) => pro.realUids.includes(program.coachUid) || (!program.coachUid && program.coachName === pro.name)).length,
        nutritionCount: clubNutrition.filter((assessment) => pro.realUids.includes(assessment.coachUid) || (!assessment.coachUid && assessment.coachName === pro.name)).length,
        sessionCount: clubSessions.filter((session) => pro.realUids.includes(session.coachUid) || (!session.coachUid && session.coachName === pro.name)).length,
      }))
      .sort((a, b) => (b.clientCount + b.programCount + b.nutritionCount + b.sessionCount) - (a.clientCount + a.programCount + a.nutritionCount + a.sessionCount));
  }, [clubClients, clubNutrition, clubPrograms, clubSessions, coaches, t]);
  const teamPros = analysablePros;
  const selectedCoach = selectedCoachUid ? teamPros.find((coach) => coach.uid === selectedCoachUid) || null : null;
  const selectedActivityCoaches = useMemo(
    () => analysablePros.filter((coach) => activeCoachFilterSet.has(coach.uid)),
    [activeCoachFilterSet, analysablePros]
  );
  const selectedActivityRealUids = useMemo(
    () => new Set(selectedActivityCoaches.flatMap((coach) => coach.realUids || [])),
    [selectedActivityCoaches]
  );
  const selectedActivityNames = useMemo(
    () => new Set(selectedActivityCoaches.map((coach) => coach.name).filter(Boolean)),
    [selectedActivityCoaches]
  );
  const scopedClients = activeCoachFilterSet.size
    ? clubClients.filter((client) => selectedActivityRealUids.has(client.coachUid) || (!client.coachUid && selectedActivityNames.has(client.coachName)))
    : clubClients;
  const scopedPrograms = activeCoachFilterSet.size
    ? clubPrograms.filter((program) => selectedActivityRealUids.has(program.coachUid) || (!program.coachUid && selectedActivityNames.has(program.coachName)))
    : clubPrograms;
  const scopedNutrition = activeCoachFilterSet.size
    ? clubNutrition.filter((assessment) => selectedActivityRealUids.has(assessment.coachUid) || (!assessment.coachUid && selectedActivityNames.has(assessment.coachName)))
    : clubNutrition;
  const scopedSessions = activeCoachFilterSet.size
    ? clubSessions.filter((session) => selectedActivityRealUids.has(session.coachUid) || (!session.coachUid && selectedActivityNames.has(session.coachName)))
    : clubSessions;
  const scopedNutritionClientCount = useMemo(
    () => new Set(scopedNutrition.map((assessment) => assessment.clientId || assessment.clientName).filter(Boolean)).size,
    [scopedNutrition]
  );
  const proLimitLabel = limits.proLimit ? `${stats.proCount || 0} / ${limits.proLimit}` : `${stats.proCount || 0}`;
  const clientLimitLabel = limits.clientLimit ? `${stats.clientCount || 0} / ${limits.clientLimit}` : `${stats.clientCount || 0} / illimité`;
  const [showGuide, setShowGuide] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("club_dashboard_guide_hidden") !== "1";
  });
  const [now, setNow] = useState(Date.now());
  const currentGoalMonth = useMemo(() => getMonthKey(new Date(now)), [now]);
  const currentGoalPeriodKey = useMemo(() => getGoalPeriodKey(goalPeriod, new Date(now)), [goalPeriod, now]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const targets =
      summary?.goalTargetsByPeriod?.[goalPeriod]?.targets ||
      (goalPeriod === "month" ? summary?.goals?.targets : null) ||
      {};
    if (typeof targets !== "object") return;
    setGoalTargets(targets);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`club_dashboard_goals_${goalPeriod}`, JSON.stringify(targets));
    }
  }, [goalPeriod, summary?.goalTargetsByPeriod, summary?.goals?.targets]);
  useEffect(() => {
    const nextLang = normalizeLanguage(user?.settings?.defaultLanguage || user?.preferredLang || "fr");
    if (SUPPORTED_LANGUAGES.includes(nextLang)) setSelectedLang(nextLang);
  }, [user?.preferredLang, user?.settings?.defaultLanguage]);
  const todayStart = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }, []);
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;
  const todayClientCount = clubClients.filter((client) => Number(client.activityAt || 0) >= todayStart).length;
  const todayProgramCount = clubPrograms.filter((program) => Number(program.activityAt || 0) >= todayStart).length;
  const todayNutritionCount = clubNutrition.filter((assessment) => Number(assessment.activityAt || 0) >= todayStart).length;
  const statsPeriodStart = useMemo(() => getPeriodStart(statsPeriod, now), [now, statsPeriod]);
  const goalPeriodStart = useMemo(() => getPeriodStart(goalPeriod, now), [goalPeriod, now]);
  const goalPeriodClients = useMemo(() => clubClients.filter((client) => Number(client.activityAt || 0) >= goalPeriodStart), [clubClients, goalPeriodStart]);
  const goalPeriodPrograms = useMemo(() => clubPrograms.filter((program) => Number(program.activityAt || 0) >= goalPeriodStart), [clubPrograms, goalPeriodStart]);
  const goalPeriodNutrition = useMemo(() => clubNutrition.filter((assessment) => Number(assessment.activityAt || 0) >= goalPeriodStart), [clubNutrition, goalPeriodStart]);
  const goalPeriodSessions = useMemo(() => clubSessions.filter((session) => Number(session.activityAt || 0) >= goalPeriodStart), [clubSessions, goalPeriodStart]);
  const periodClients = useMemo(() => scopedClients.filter((client) => Number(client.activityAt || 0) >= statsPeriodStart), [scopedClients, statsPeriodStart]);
  const periodPrograms = useMemo(() => scopedPrograms.filter((program) => Number(program.activityAt || 0) >= statsPeriodStart), [scopedPrograms, statsPeriodStart]);
  const periodNutrition = useMemo(() => scopedNutrition.filter((assessment) => Number(assessment.activityAt || 0) >= statsPeriodStart), [scopedNutrition, statsPeriodStart]);
  const periodSessions = useMemo(() => scopedSessions.filter((session) => Number(session.activityAt || 0) >= statsPeriodStart), [scopedSessions, statsPeriodStart]);
  const activityViewCounts = {
    clients: scopedClients.length,
    programs: scopedPrograms.length,
    nutrition: scopedNutrition.length,
    stats: periodClients.length + periodPrograms.length + periodNutrition.length + periodSessions.length,
  };
  const activeActivityCount = activityViewCounts[activeView] || 0;
  const coachComparisonRows = useMemo(
    () =>
      analysablePros
        .filter((coach) => !activeCoachFilterSet.size || activeCoachFilterSet.has(coach.uid))
        .map((coach) => {
          const clientCount = periodClients.filter((client) => coach.realUids.includes(client.coachUid) || (!client.coachUid && client.coachName === coach.name)).length;
          const programCount = periodPrograms.filter((program) => coach.realUids.includes(program.coachUid) || (!program.coachUid && program.coachName === coach.name)).length;
          const nutritionCount = periodNutrition.filter((assessment) => coach.realUids.includes(assessment.coachUid) || (!assessment.coachUid && assessment.coachName === coach.name)).length;
          const sessionCount = periodSessions.filter((session) => coach.realUids.includes(session.coachUid) || (!session.coachUid && session.coachName === coach.name)).length;
          const score = clientCount + programCount + nutritionCount + sessionCount;
          return { ...coach, periodClientCount: clientCount, periodProgramCount: programCount, periodNutritionCount: nutritionCount, periodSessionCount: sessionCount, score };
        })
        .sort((a, b) => b.score - a.score || (b.clientCount || 0) - (a.clientCount || 0)),
    [activeCoachFilterSet, analysablePros, periodClients, periodNutrition, periodPrograms, periodSessions]
  );
  const topCoaches = useMemo(
    () => [...analysablePros].sort((a, b) => (b.clientCount || 0) - (a.clientCount || 0)).slice(0, 3),
    [analysablePros]
  );
  const leaderCoach = topCoaches[0];
  const proUsage = limits.proLimit ? Math.round(((stats.proCount || 0) / limits.proLimit) * 100) : null;
  const clientUsage = limits.clientLimit ? Math.round(((stats.clientCount || 0) / limits.clientLimit) * 100) : null;
  const proLimitReached = Boolean(limits.proLimit && (stats.proCount || 0) >= limits.proLimit);
  const activeClubPackageTier = limits.packageTier || user?.packageTier || user?.proAccess?.packageTier || "";
  const isNetworkClubPack = activeClubPackageTier === "network";
  const proLimitUpgradeMessage = isNetworkClubPack
    ? "Vous êtes au maximum du pack Réseau. Pour ajouter plus de pros, contactez-nous sur contact@boostyourlife.coach."
    : "Passez à l’offre Club supérieure pour ajouter un nouveau pro.";
  const trialEndMs = user?.trialEndsAt ? getTrialEndMs(user) : null;
  const isClubTrial = user?.subscriptionStatus === "trialing" && trialEndMs && now < trialEndMs;
  const trialRemaining = useMemo(() => {
    if (!isClubTrial) return null;
    const ms = Math.max(0, trialEndMs - now);
    return {
      days: Math.floor(ms / (24 * 60 * 60 * 1000)),
      hours: Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)),
      minutes: Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000)),
    };
  }, [isClubTrial, now, trialEndMs]);
  const pageKind = useMemo(() => {
    if (location.pathname === "/club-dashboard/create") return "create";
    if (location.pathname === "/club-dashboard/team") return "team";
    if (location.pathname === "/club-dashboard/calendrier") return "calendar";
    if (location.pathname === "/club-dashboard/settings") return "settings";
    if (location.pathname === "/club-dashboard/alertes") return "alerts";
    if (location.pathname === "/club-dashboard/journal") return "log";
    if (location.pathname === "/club-dashboard/audit") return "audit";
    if (location.pathname === "/club-dashboard/objectifs") return "goals";
    if (location.pathname === "/club-dashboard/exports") return "exports";
    if (location.pathname === "/club-dashboard/actions-groupees") return "bulk";
    if (Object.prototype.hasOwnProperty.call(VIEW_BY_PATH, location.pathname)) return "activity";
    const params = new URLSearchParams(location.search);
    const section = params.get("section");
    if (section === "create") return "create";
    if (section === "team") return "team";
    if (section === "activity") return "activity";
    if (section === "settings") return "settings";
    return "dashboard";
  }, [location.pathname, location.search]);
  const showDashboard = pageKind === "dashboard";
  const showCreate = pageKind === "dashboard" || pageKind === "create";
  const showTeam = pageKind === "dashboard" || pageKind === "team";
  const showActivity = pageKind === "activity";
  const showSettings = pageKind === "settings";
  const showCalendar = pageKind === "calendar";
  const showAlerts = pageKind === "alerts";
  const showLog = pageKind === "log";
  const showAudit = pageKind === "audit";
  const showGoals = pageKind === "goals";
  const showExports = pageKind === "exports";
  const showBulk = pageKind === "bulk";
  const showClubTool = showAlerts || showLog || showAudit || showGoals || showExports || showBulk;
  const showGuideBlock = showGuide && showDashboard;
  const goBackToClubDashboard = () => navigate(withAdminClub("/club-dashboard"));
  const clubViews = useMemo(
    () => CLUB_VIEWS.map((view) => ({ ...view, label: t(view.labelKey, view.fallback) })),
    [t]
  );
  const getActivityMeta = useCallback(
    (view) => {
      const meta = ACTIVITY_PAGE_META[view];
      if (!meta) {
        return [
          t("clubDashboard.activity.default.title", "Données club"),
          t("clubDashboard.activity.default.subtitle", "Consultez les clients, programmes, bilans nutrition et statistiques consolidés."),
        ];
      }
      return [t(meta[0], meta[1]), t(meta[2], meta[3])];
    },
    [t]
  );
  const activeActivityMeta = getActivityMeta(activeView);
  const proTypeLabel = useCallback(
    (type) => {
      const meta = PRO_TYPES[type] || PRO_TYPES.sport;
      return t(meta[0], meta[1]);
    },
    [t]
  );
  const pageMeta = {
    dashboard: [t("clubDashboard.pages.dashboard.title", "Dashboard club"), t("clubDashboard.pages.dashboard.subtitle", "Vue d’ensemble de la structure, des capacités et de l’activité récente.")],
    create: [t("clubDashboard.pages.create.title", "Créer un pro"), t("clubDashboard.pages.create.subtitle", "Ajoutez un coach, un diététicien ou un profil hybride dans l’abonnement du club.")],
    team: [t("clubDashboard.pages.team.title", "Pros du club"), t("clubDashboard.pages.team.subtitle", "Gérez les comptes rattachés, les statuts et les accès de chaque intervenant.")],
    activity: activeActivityMeta,
    calendar: [t("clubDashboard.pages.calendar.title", "Calendrier club"), t("clubDashboard.pages.calendar.subtitle", "Visualisez les rendez-vous de l’équipe et ajoutez des évènements aux pros.")],
    alerts: [t("clubDashboard.pages.alerts.title", "Alertes club"), t("clubDashboard.pages.alerts.subtitle", "Priorisez les points qui demandent une action sur les clients, pros, programmes et bilans.")],
    log: [t("clubDashboard.pages.log.title", "Journal d’activité"), t("clubDashboard.pages.log.subtitle", "Comprenez qui a créé ou modifié quoi dans le périmètre club récent.")],
    audit: [t("clubDashboard.pages.audit.title", "Audit données club"), t("clubDashboard.pages.audit.subtitle", "Repérez les dossiers incomplets, référents incertains et zones à nettoyer.")],
    goals: [t("clubDashboard.pages.goals.title", "Objectifs mensuels"), t("clubDashboard.pages.goals.subtitle", "Fixez des repères par pro et comparez l’activité du mois.")],
    exports: [t("clubDashboard.pages.exports.title", "Exports club"), t("clubDashboard.pages.exports.subtitle", "Téléchargez les vues clients, programmes, nutrition et statistiques pour analyse externe.")],
    bulk: [t("clubDashboard.pages.bulk.title", "Actions groupées"), t("clubDashboard.pages.bulk.subtitle", "Retrouvez les cohortes utiles pour agir plus vite sans perdre le contexte.")],
    settings: [t("clubDashboard.pages.settings.title", "Réglages club"), t("clubDashboard.pages.settings.subtitle", "Gérez le nom et le logo utilisés dans les espaces pros rattachés.")],
  }[pageKind] || [t("clubDashboard.pages.default.title", "Espace club"), t("clubDashboard.pages.default.subtitle", "Pilotez votre structure.")];
  const calendarEvents = useMemo(
    () =>
      clubAppointments.map((appointment) => {
        const start = new Date(appointment.startsAt);
        const end = new Date(start.getTime() + (Number(appointment.durationMin || 60) || 60) * 60000);
        return {
          ...appointment,
          start,
          end,
          status: appointment.status || "à venir",
          title: `${appointment.title}${appointment.clientName ? ` · ${appointment.clientName}` : ` · ${appointment.coachName}`}`,
        };
      }),
    [clubAppointments]
  );
  const filteredCalendarEvents = useMemo(() => {
    if (calendarCoachFilter.length === 0) return calendarEvents;
    const selected = new Set(calendarCoachFilter);
    return calendarEvents.filter((event) => selected.has(event.coachUid));
  }, [calendarCoachFilter, calendarEvents]);
  const upcomingFilteredAppointments = useMemo(
    () =>
      filteredCalendarEvents
        .filter((event) => event.start.getTime() >= now)
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(0, 6),
    [filteredCalendarEvents, now]
  );
  const isClubSetupEmpty =
    !teamPros.length &&
    !clubClients.length &&
    !clubPrograms.length &&
    !clubNutrition.length &&
    !clubSessions.length &&
    !upcomingFilteredAppointments.length;
  const todayAppointments = useMemo(
    () =>
      filteredCalendarEvents
        .filter((event) => event.start.getTime() >= todayStart && event.start.getTime() < todayEnd)
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [filteredCalendarEvents, todayEnd, todayStart]
  );
  const todayAppointmentSummary = useMemo(() => {
    const isHandled = (event) => {
      const status = String(event.status || "").toLowerCase();
      return (
        status === "validée" ||
        status === "validee" ||
        status === "done" ||
        status === "completed" ||
        status === "manquée" ||
        status === "manquee" ||
        status === "missed" ||
        status === "annulée" ||
        status === "annulee" ||
        status === "cancelled" ||
        status === "canceled" ||
        event.end.getTime() <= now
      );
    };
    const done = todayAppointments.filter(isHandled).length;
    const next = todayAppointments.find((event) => event.end.getTime() > now && !isHandled(event)) || null;
    const total = todayAppointments.length;
    return {
      done,
      next,
      total,
      progress: total ? Math.min(100, Math.round((done / total) * 100)) : 0,
    };
  }, [now, todayAppointments]
  );
  const recentActivityItems = useMemo(
    () =>
      [
        ...clubClients.map((client) => ({
          id: `client:${client.id}`,
          title: client.name,
          type: "Client",
          coachName: client.coachName,
          activityAt: Number(client.activityAt || 0),
        })),
        ...clubPrograms.map((program) => ({
          id: `program:${program.id}`,
          title: program.title,
          type: "Programme",
          coachName: program.coachName,
          activityAt: Number(program.activityAt || 0),
        })),
        ...clubNutrition.map((assessment) => ({
          id: `nutrition:${assessment.clientId}:${assessment.id}`,
          title: assessment.objective,
          type: "Nutrition",
          coachName: assessment.coachName,
          activityAt: Number(assessment.activityAt || 0),
        })),
      ]
        .filter((item) => item.activityAt > 0)
        .sort((a, b) => b.activityAt - a.activityAt)
        .slice(0, 5),
    [clubClients, clubNutrition, clubPrograms]
  );
  const fullActivityLog = useMemo(
    () =>
      [
        ...clubClients.map((client) => ({
          id: `client:${client.id}`,
          label: client.name,
          type: t("clubDashboard.log.types.client", "Client"),
          owner: displayCoachName(client.coachName),
          at: Number(client.activityAt || 0),
          detail: t("clubDashboard.log.clientDetail", "{{count}} programme(s)", { count: client.programCount || 0 }),
          action: () => navigate(`/clients/${client.id}`),
        })),
        ...clubPrograms.map((program) => ({
          id: `program:${program.id}`,
          label: program.title,
          type: t("clubDashboard.log.types.program", "Programme"),
          owner: displayCoachName(program.coachName),
          at: Number(program.activityAt || 0),
          detail: program.clientName || t("clubDashboard.programs.library", "Bibliothèque pro"),
          action: () =>
            navigate(
              program.clientId && program.programId
                ? `/clients/${program.clientId}/programmes/${program.programId}`
                : `/programmes/${program.id}`
            ),
        })),
        ...clubNutrition.map((assessment) => ({
          id: `nutrition:${assessment.clientId}:${assessment.id}`,
          label: assessment.objective,
          type: t("clubDashboard.log.types.nutrition", "Nutrition"),
          owner: displayCoachName(assessment.coachName),
          at: Number(assessment.activityAt || 0),
          detail: `${assessment.clientName} · ${assessment.status}`,
          action: () => navigate(`/clients/${assessment.clientId}/nutrition/${assessment.id}`),
        })),
      ]
        .filter((item) => item.at > 0)
        .sort((a, b) => b.at - a.at)
        .slice(0, 80),
    [clubClients, clubNutrition, clubPrograms, navigate, t]
  );
  const logPeriodStart = useMemo(() => getPeriodStart(logPeriod, now), [logPeriod, now]);
  const filteredActivityLog = useMemo(
    () => fullActivityLog.filter((item) => Number(item.at || 0) >= logPeriodStart),
    [fullActivityLog, logPeriodStart]
  );
  const groupedActivityLog = useMemo(() => {
    const groups = new Map();
    filteredActivityLog.forEach((item) => {
      const date = new Date(item.at);
      const key = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, items]) => ({ day, items }));
  }, [filteredActivityLog]);
  const clientsWithoutProgram = useMemo(
    () => clubClients.filter((client) => Number(client.programCount || 0) === 0).slice(0, 4),
    [clubClients]
  );
  const allClientsWithoutProgram = useMemo(
    () => clubClients.filter((client) => Number(client.programCount || 0) === 0),
    [clubClients]
  );
  const nutritionDrafts = useMemo(
    () => clubNutrition.filter((assessment) => !["Partagé", "Validé"].includes(assessment.status)),
    [clubNutrition]
  );
  const unknownReferentItems = useMemo(
    () =>
      [
        ...clubClients.filter((item) => !item.coachUid || item.coachName === t("clubDashboard.filters.unknownPro", "Référent non identifié") || item.coachName === "Pro").map((item) => ({ ...item, kind: "client" })),
        ...clubPrograms.filter((item) => !item.coachUid || item.coachName === t("clubDashboard.filters.unknownPro", "Référent non identifié") || item.coachName === "Pro").map((item) => ({ ...item, kind: "program" })),
        ...clubNutrition.filter((item) => !item.coachUid || item.coachName === t("clubDashboard.filters.unknownPro", "Référent non identifié") || item.coachName === "Pro").map((item) => ({ ...item, kind: "nutrition" })),
      ],
    [clubClients, clubNutrition, clubPrograms, t]
  );
  const inactiveCoaches = useMemo(() => {
    const threshold = now - 14 * 24 * 60 * 60 * 1000;
    return coaches
      .map((coach) => {
        const lastActivity = Math.max(
          Number(coach.createdAt || 0),
          ...(coach.recentClients || []).map((client) => Number(client.activityAt || 0)),
          ...(coach.recentPrograms || []).map((program) => Number(program.activityAt || 0)),
          ...(coach.recentNutrition || []).map((assessment) => Number(assessment.activityAt || 0))
        );
        return { ...coach, lastActivity };
      })
      .filter((coach) => coach.status !== "disabled" && coach.lastActivity > 0 && coach.lastActivity < threshold)
      .slice(0, 3);
  }, [coaches, now]);
  const dashboardPriorities = useMemo(() => {
    const items = [];
    if (proLimitReached) {
      items.push({
        title: "Capacité pros atteinte",
        detail: proLimitUpgradeMessage,
        action: "Voir l’équipe",
        onClick: () => openClubSection("team"),
        tone: "red",
      });
    } else if (limits.proLimit && proUsage >= 75) {
      items.push({
        title: "Capacité pros bientôt limite",
        detail: `${stats.proCount || 0} compte(s) utilisé(s) sur ${limits.proLimit}.`,
        action: "Gérer",
        onClick: () => openClubSection("team"),
        tone: "orange",
      });
    }
    if (clientsWithoutProgram.length > 0) {
      items.push({
        title: `${clientsWithoutProgram.length} client(s) sans programme`,
        detail: "À vérifier pour éviter les suivis vides côté client.",
        action: "Clients",
        onClick: () => openClubView("clients"),
        tone: "orange",
      });
    }
    if (todayAppointments.length > 0) {
      items.push({
        title: `${todayAppointments.length} rendez-vous aujourd’hui`,
        detail: "Gardez un oeil sur les points planifiés avec l’équipe.",
        action: "Calendrier",
        onClick: () => openClubSection("calendar"),
        tone: "blue",
      });
    }
    if (inactiveCoaches.length > 0) {
      items.push({
        title: `${inactiveCoaches.length} pro(s) peu actif(s)`,
        detail: "Aucune activité récente détectée sur les 14 derniers jours.",
        action: "Équipe",
        onClick: () => openClubSection("team"),
        tone: "yellow",
      });
    }
    if (!teamPros.length) {
      items.push({
        title: "Aucun pro rattaché",
        detail: "Créez le premier compte pour lancer le suivi club.",
        action: "Créer",
        onClick: () => openCreateCoachSection(),
        tone: "green",
      });
    }
    if (!items.length) {
      items.push({
        title: "Tout est à jour",
        detail: "Aucune alerte forte détectée sur le périmètre club.",
        action: "Statistiques",
        onClick: () => openClubView("stats"),
        tone: "green",
      });
    }
    return items.slice(0, 4);
  }, [clientsWithoutProgram.length, inactiveCoaches.length, limits.proLimit, proLimitReached, proLimitUpgradeMessage, proUsage, stats.proCount, teamPros.length, todayAppointments.length]);
  const clubAlerts = useMemo(() => {
    const alerts = [];
    if (proLimitReached) alerts.push({ tone: "red", title: t("clubDashboard.alerts.proLimit.title", "Capacité pros atteinte"), detail: proLimitUpgradeMessage, action: t("clubDashboard.actions.viewTeam", "Voir l’équipe"), onClick: () => openClubSection("team") });
    if (limits.proLimit && proUsage >= 75 && !proLimitReached) alerts.push({ tone: "orange", title: t("clubDashboard.alerts.proLimitSoon.title", "Capacité pros bientôt limite"), detail: `${stats.proCount || 0}/${limits.proLimit}`, action: t("auto.ClubDashboard.gerer", "Gérer"), onClick: () => openClubSection("team") });
    if (allClientsWithoutProgram.length) alerts.push({ tone: "orange", title: t("clubDashboard.alerts.clientsWithoutProgram.title", "{{count}} client(s) sans programme", { count: allClientsWithoutProgram.length }), detail: t("clubDashboard.alerts.clientsWithoutProgram.detail", "Ces dossiers peuvent être ouverts puis assignés à un programme."), action: t("auto.ClubDashboard.clients_du_club", "Clients du club"), onClick: () => openClubView("clients") });
    if (nutritionDrafts.length) alerts.push({ tone: "purple", title: t("clubDashboard.alerts.nutritionDrafts.title", "{{count}} bilan(s) nutrition à finaliser", { count: nutritionDrafts.length }), detail: t("clubDashboard.alerts.nutritionDrafts.detail", "Certains bilans ne sont pas encore partagés ou validés."), action: t("clubDashboard.views.nutrition", "Nutrition"), onClick: () => openClubView("nutrition") });
    if (inactiveCoaches.length) alerts.push({ tone: "yellow", title: t("clubDashboard.alerts.inactivePros.title", "{{count}} pro(s) peu actif(s)", { count: inactiveCoaches.length }), detail: t("clubDashboard.alerts.inactivePros.detail", "Aucune activité récente détectée sur 14 jours."), action: t("clubDashboard.actions.viewTeam", "Voir l’équipe"), onClick: () => openClubSection("team") });
    if (unknownReferentItems.length) alerts.push({ tone: "blue", title: t("clubDashboard.alerts.unknownReferents.title", "{{count}} donnée(s) à référent incertain", { count: unknownReferentItems.length }), detail: t("clubDashboard.alerts.unknownReferents.detail", "À contrôler dans l’audit pour éviter les ambiguïtés entre comptes."), action: t("clubDashboard.tools.audit", "Audit données"), onClick: () => navigate(withAdminClub("/club-dashboard/audit")) });
    return alerts;
  }, [allClientsWithoutProgram.length, inactiveCoaches.length, limits.proLimit, navigate, nutritionDrafts.length, proLimitReached, proLimitUpgradeMessage, proUsage, stats.proCount, t, unknownReferentItems.length, withAdminClub]);
  const auditFindings = useMemo(() => {
    const findings = [];
    if (unknownReferentItems.length) findings.push({ tone: "orange", title: t("clubDashboard.audit.unknown.title", "Référents à clarifier"), count: unknownReferentItems.length, detail: t("clubDashboard.audit.unknown.detail", "Des clients, programmes ou bilans sont rattachés au club mais leur référent n’est pas parfaitement résolu.") });
    if (allClientsWithoutProgram.length) findings.push({ tone: "yellow", title: t("clubDashboard.audit.noProgram.title", "Clients sans programme"), count: allClientsWithoutProgram.length, detail: t("clubDashboard.audit.noProgram.detail", "Ces clients sont bien dans le club mais n’ont pas encore de programme assigné.") });
    if (nutritionDrafts.length) findings.push({ tone: "purple", title: t("clubDashboard.audit.nutritionDraft.title", "Bilans nutrition non finalisés"), count: nutritionDrafts.length, detail: t("clubDashboard.audit.nutritionDraft.detail", "Ces suivis existent mais ne sont ni validés ni partagés.") });
    if (!coaches.length && analysablePros.length) findings.push({ tone: "blue", title: t("clubDashboard.audit.ownerData.title", "Données responsable détectées"), count: analysablePros.length, detail: t("clubDashboard.audit.ownerData.detail", "Le club contient des données de référent mais aucun pro invité. C’est possible pour un compte responsable, mais à confirmer.") });
    if (!findings.length) findings.push({ tone: "green", title: t("clubDashboard.audit.clean.title", "Périmètre cohérent"), count: 0, detail: t("clubDashboard.audit.clean.detail", "Aucune anomalie forte détectée dans les données club récentes.") });
    return findings;
  }, [allClientsWithoutProgram.length, analysablePros.length, coaches.length, nutritionDrafts.length, t, unknownReferentItems.length]);
  const goalRows = useMemo(
    () =>
      analysablePros.map((coach) => {
        const target = goalTargets[coach.uid] || {};
        const periodClientCount = goalPeriodClients.filter((client) => coach.realUids.includes(client.coachUid) || (!client.coachUid && client.coachName === coach.name)).length;
        const periodProgramCount = goalPeriodPrograms.filter((program) => coach.realUids.includes(program.coachUid) || (!program.coachUid && program.coachName === coach.name)).length;
        const periodNutritionCount = goalPeriodNutrition.filter((assessment) => coach.realUids.includes(assessment.coachUid) || (!assessment.coachUid && assessment.coachName === coach.name)).length;
        const periodSessionCount = goalPeriodSessions.filter((session) => coach.realUids.includes(session.coachUid) || (!session.coachUid && session.coachName === coach.name)).length;
        const metrics = [
          { key: "clients", label: t("dashboard.stats_total_clients", "Clients"), current: periodClientCount, target: Number(target.clients || 0) },
          { key: "programs", label: t("clientsList.table.programs", "Programmes"), current: periodProgramCount, target: Number(target.programs || 0) },
          { key: "nutrition", label: t("clubDashboard.views.nutrition", "Nutrition"), current: periodNutritionCount, target: Number(target.nutrition || 0) },
          { key: "sessions", label: t("clubDashboard.goals.sessions", "Séances"), current: periodSessionCount, target: Number(target.sessions || 0) },
        ].map((metric) => ({
          ...metric,
          target: Number.isFinite(metric.target) ? Math.max(0, metric.target) : 0,
        }));
        const activeMetrics = metrics.filter((metric) => metric.target > 0);
        const activity = activeMetrics.reduce((sum, metric) => sum + Math.min(metric.current, metric.target), 0);
        const targetTotal = activeMetrics.reduce((sum, metric) => sum + metric.target, 0);
        const goalDetails = activeMetrics.map((metric) => `${metric.current}/${metric.target} ${metric.label.toLowerCase()}`).join(" · ");
        return { ...coach, target, activity, targetTotal, metrics, goalDetails, periodClientCount, periodProgramCount, periodNutritionCount, periodSessionCount, progress: targetTotal ? Math.min(100, Math.round((activity / targetTotal) * 100)) : null };
      }),
    [analysablePros, goalPeriodClients, goalPeriodNutrition, goalPeriodPrograms, goalPeriodSessions, goalTargets, t]
  );
  const dashboardCoachRows = useMemo(
    () =>
      [...coaches]
        .sort((a, b) => (b.clientCount || 0) + (b.programCount || 0) - ((a.clientCount || 0) + (a.programCount || 0)))
        .slice(0, 4),
    [coaches]
  );

  const loadSummary = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiFetch(withAdminClub("/clubs/summary"));
      setSummary(data);
      setIdentityForm({
        name: data?.club?.name || "",
        logoUrl: data?.club?.logoUrl || "",
      });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [withAdminClub]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    let alive = true;
    setClubLogoAspectRatio(null);
    (async () => {
      const url = await resolveStorageUrl(identityForm.logoUrl || summary?.club?.logoUrl || "");
      if (alive) setResolvedClubLogoUrl(url || "");
    })();
    return () => {
      alive = false;
    };
  }, [identityForm.logoUrl, summary?.club?.logoUrl]);

  const clubLogoFrameSize = useMemo(() => {
    const ratio = Number(clubLogoAspectRatio || 1);
    if (ratio >= 2.2) return { w: { base: "104px", md: "148px" }, h: { base: "58px", md: "74px" }, radius: { base: "18px", md: "22px" } };
    if (ratio >= 1.35) return { w: { base: "86px", md: "118px" }, h: { base: "58px", md: "74px" }, radius: { base: "18px", md: "22px" } };
    if (ratio <= 0.58) return { w: { base: "58px", md: "74px" }, h: { base: "78px", md: "96px" }, radius: { base: "18px", md: "22px" } };
    if (ratio <= 0.82) return { w: { base: "58px", md: "74px" }, h: { base: "68px", md: "88px" }, radius: { base: "18px", md: "22px" } };
    return { w: { base: "58px", md: "74px" }, h: { base: "58px", md: "74px" }, radius: { base: "18px", md: "22px" } };
  }, [clubLogoAspectRatio]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get("section");
    const view = params.get("view");
    const pathView = VIEW_BY_PATH[location.pathname];
    const pathSection = CLUB_SECTIONS[location.pathname];
    if (pathView) setActiveView(pathView);
    else if (CLUB_VIEWS.some((item) => item.key === view)) setActiveView(view);
    const nextSection = pathSection || section;
    if (nextSection) setTimeout(() => scrollToSection(`club-${nextSection}`), 150);
  }, [location.pathname, location.search]);

  const openClubSection = (section) => {
    const routes = {
      create: "/club-dashboard/create",
      team: "/club-dashboard/team",
      activity: "/club-dashboard/clients",
      calendar: "/club-dashboard/calendrier",
      alerts: "/club-dashboard/alertes",
      log: "/club-dashboard/journal",
      audit: "/club-dashboard/audit",
      goals: "/club-dashboard/objectifs",
      exports: "/club-dashboard/exports",
      bulk: "/club-dashboard/actions-groupees",
      guide: "/club-dashboard?section=guide",
      settings: "/club-dashboard/settings",
    };
    navigate(withAdminClub(routes[section] || "/club-dashboard"));
    setTimeout(() => scrollToSection(`club-${section}`), 120);
  };

  const openClubView = (view) => {
    setActiveView(view);
    const routes = {
      clients: "/club-dashboard/clients",
      programs: "/club-dashboard/programmes",
      nutrition: "/club-dashboard/nutrition",
      stats: "/club-dashboard/statistiques",
    };
    navigate(withAdminClub(routes[view] || `/club-dashboard?section=activity&view=${view}`));
    setTimeout(() => scrollToSection("club-activity"), 120);
  };

  const openClientAsReferent = (client) => {
    if (!client?.id) return;
    const params = new URLSearchParams();
    if (client.coachUid) params.set("clubAssignCoachId", client.coachUid);
    if (adminClubId) {
      params.set("clubId", adminClubId);
      params.set("adminClubId", adminClubId);
    }
    navigate(`/clients/${client.id}${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const toggleGuide = (nextValue) => {
    setShowGuide(nextValue);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("club_dashboard_guide_hidden", nextValue ? "0" : "1");
    }
  };

  const openCoachDetail = (coach) => {
    if (!coach?.uid) return;
    setSelectedCoachUid(coach.uid);
    setActivityCoachFilter([coach.uid]);
    setTimeout(() => scrollToSection("club-coach-detail"), 120);
  };

  const planAppointmentForCoach = (coach) => {
    if (!coach?.uid) return;
    setAppointmentForm((current) => ({ ...current, coachUid: coach.uid }));
    setIsAddAppointmentModalOpen(true);
  };

  const selectedCalendarCoachUid = calendarCoachFilter.length === 1 ? calendarCoachFilter[0] : "";
  const openCalendarAppointmentModal = useCallback(() => {
    setAppointmentForm((current) => ({
      ...current,
      coachUid: selectedCalendarCoachUid || current.coachUid || "",
      clientId: "",
      programId: "",
      sessionIndex: "",
    }));
    setIsAddAppointmentModalOpen(true);
  }, [selectedCalendarCoachUid]);

  const closeCalendarAppointmentModal = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setIsAddAppointmentModalOpen(false);
  }, []);

  useEffect(() => {
    if (location.pathname !== "/club-dashboard/calendrier") return;
    const params = new URLSearchParams(location.search);
    if (params.get("action") !== "new-appointment") return;

    openCalendarAppointmentModal();
    params.delete("action");
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash || ""}`, { replace: true });
  }, [location.hash, location.pathname, location.search, navigate, openCalendarAppointmentModal]);

  const toggleCalendarCoach = (uid) => {
    setCalendarCoachFilter((current) =>
      current.includes(uid) ? current.filter((item) => item !== uid) : [...current, uid]
    );
  };

  const openCreateCoachSection = () => {
    if (proLimitReached) {
      setProLimitModalDismissed(false);
      proLimitModal.onOpen();
      return;
    }
    if (pageKind === "dashboard") {
      inviteProModal.onOpen();
      return;
    }
    openClubSection("create");
  };

  useEffect(() => {
    if (pageKind !== "create") {
      setProLimitModalDismissed(false);
      return;
    }
    if (proLimitReached && !proLimitModalDismissed && !proLimitModal.isOpen) {
      proLimitModal.onOpen();
    }
  }, [pageKind, proLimitModal.isOpen, proLimitModal.onOpen, proLimitModalDismissed, proLimitReached]);

  const closeProLimitModal = () => {
    setProLimitModalDismissed(true);
    proLimitModal.onClose();
  };

  const updateForm = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setInviteLink("");
  };

  const handleLangChange = async (event) => {
    const lng = normalizeLanguage(event.target.value);
    if (!SUPPORTED_LANGUAGES.includes(lng)) return;
    setSelectedLang(lng);
    if (!user?.uid) return;
    setLanguageSaving(true);
    try {
      await ensureLanguageLoaded(lng);
      await i18n.changeLanguage(lng);
      localStorage.setItem("i18nextLng", lng);
      const refUser = doc(db, "users", user.uid);
      try {
        await updateDoc(refUser, {
          preferredLang: lng,
          "settings.defaultLanguage": lng,
        });
      } catch (err) {
        if (err?.code === "not-found" || err?.message?.includes("No document")) {
          await setDoc(refUser, { preferredLang: lng, settings: { defaultLanguage: lng } }, { merge: true });
        } else {
          throw err;
        }
      }
      toast({
        title: t("auto.ClubDashboard.langue_mise_a_jour", "Langue mise à jour"),
        description: t("auto.ClubDashboard.la_preference_sera_reprise_dans_l_espace_club", "La préférence sera reprise dans l’espace club."),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      toast({
        title: t("auto.ClubDashboard.langue_non_enregistree", "Langue non enregistrée"),
        description: err?.message || "Réessayez dans quelques instants.",
        status: "error",
        duration: 4500,
        isClosable: true,
      });
    } finally {
      setLanguageSaving(false);
    }
  };

  const openStripePortal = async () => {
    if (!user?.uid) return;
    if (!hasStripeCustomer) {
      toast({
        title: t("auto.ClubDashboard.stripe_non_disponible", "Stripe non disponible"),
        description: t("auto.ClubDashboard.votre_compte_club_n_est_pas_encore_lie_a_stri", "Votre compte club n’est pas encore lié à Stripe."),
        status: "warning",
        duration: 4500,
        isClosable: true,
      });
      return;
    }
    setStripeLoading(true);
    try {
      const data = await apiFetch("/payments/create-stripe-portal-session", {
        method: "POST",
        body: JSON.stringify({
          userId: user.uid,
          returnUrl: `${window.location.origin}/club-dashboard/settings`,
        }),
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("URL Stripe manquante.");
      }
    } catch (err) {
      toast({
        title: t("auto.ClubDashboard.stripe_indisponible", "Stripe indisponible"),
        description: err?.message || "Impossible d’ouvrir le portail pour le moment.",
        status: "error",
        duration: 4500,
        isClosable: true,
      });
    } finally {
      setStripeLoading(false);
    }
  };

  const sendResetEmail = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      await resetPassword(user.email, selectedLang || "fr");
      toast({
        title: t("auto.ClubDashboard.e_mail_envoye", "E-mail envoyé"),
        description: t("auto.ClubDashboard.le_lien_de_reinitialisation_du_mot_de_passe_a", "Le lien de réinitialisation du mot de passe a été envoyé."),
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch {
      toast({
        title: t("auto.ClubDashboard.e_mail_impossible", "E-mail impossible"),
        description: t("auto.ClubDashboard.impossible_d_envoyer_le_lien_de_reinitialisat", "Impossible d’envoyer le lien de réinitialisation."),
        status: "error",
        duration: 4500,
        isClosable: true,
      });
    } finally {
      setSendingReset(false);
    }
  };

  const createCoach = async (event) => {
    event.preventDefault();
    if (proLimitReached) {
      proLimitModal.onOpen();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const data = await apiFetch(withAdminClub("/clubs/coaches"), {
        method: "POST",
        body: JSON.stringify(form),
      });
      setInviteLink(data.resetLink || "");
      setForm({ firstName: "", lastName: "", email: "", proType: "sport" });
      const emailMessage = data.emailSent
        ? "Un email d’activation vient d’être envoyé automatiquement."
        : "Le compte est créé. Le lien d’activation reste disponible à copier.";
      toast({
        title: t("auto.ClubDashboard.pro_ajoute_au_club", "Pro ajouté au club"),
        description: emailMessage,
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      if (data.emailSent) inviteProModal.onClose();
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Création du pro impossible.");
    } finally {
      setSaving(false);
    }
  };

  const saveClubIdentity = async (event) => {
    event.preventDefault();
    setIdentitySaving(true);
    setError("");
    try {
      const targetClubId = actionClubId || user.uid;
      let logoUrl = identityForm.logoUrl || "";
      if (logoFile) {
        setUploadProgress(10);
        const dataUrl = await fileToDataUrl(logoFile);
        setUploadProgress(60);
        const upload = await apiFetch(withAdminClub("/clubs/logo"), {
          method: "POST",
          body: JSON.stringify({
            fileName: logoFile.name,
            contentType: logoFile.type || "image/png",
            dataUrl,
            clubId: targetClubId,
            adminClubId: targetClubId,
          }),
        });
        logoUrl = upload?.logoUrl || "";
        setUploadProgress(100);
      }
      await apiFetch(withAdminClub("/clubs"), {
        method: "PATCH",
        body: JSON.stringify({ name: identityForm.name, logoUrl, clubId: targetClubId, adminClubId: targetClubId }),
      });
      toast({
        title: t("auto.ClubDashboard.identite_du_club_mise_a_jour", "Identité du club mise à jour"),
        description: t("auto.ClubDashboard.le_nom_et_le_logo_seront_repris_dans_les_espa", "Le nom et le logo seront repris dans les espaces pros rattachés."),
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      setLogoFile(null);
      setUploadProgress(0);
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Mise à jour du club impossible.");
    } finally {
      setIdentitySaving(false);
    }
  };

  const createAppointment = async (event) => {
    event.preventDefault();
    setActionSaving("appointment");
    setError("");
    try {
      const selectedProgram = appointmentProgramOptions.find((program) => (program.programId || program.id) === appointmentForm.programId);
      const selectedSession = appointmentSessionOptions[Number(appointmentForm.sessionIndex)];
      if (appointmentForm.clientId && appointmentForm.type === "sport" && (!selectedProgram || !selectedSession)) {
        toast({ title: t("clubDashboard.calendar.selectProgramSession", "Sélectionnez un programme et une séance."), status: "warning", duration: 3000, isClosable: true });
        return;
      }
      const nutritionLabel = NUTRITION_APPOINTMENT_TYPES.find((item) => item.value === appointmentForm.appointmentKind)?.label || t("clubDashboard.calendar.nutritionAppointment", "Rendez-vous nutrition");
      const internalLabel = t("clubDashboard.calendar.internalEvent", "Évènement interne");
      const payload = {
        ...appointmentForm,
        clientId: appointmentForm.type === "internal" ? "" : appointmentForm.clientId,
        programId: appointmentForm.type === "sport" ? appointmentForm.programId : "",
        sessionIndex: appointmentForm.type === "sport" ? appointmentForm.sessionIndex : "",
        appointmentKind: appointmentForm.type === "internal" ? "internal" : appointmentForm.appointmentKind,
        title:
          appointmentForm.title ||
          (appointmentForm.type === "internal"
            ? internalLabel
            : appointmentForm.type === "nutrition"
            ? nutritionLabel
            : selectedSession
              ? getSessionLabel(selectedSession, Number(appointmentForm.sessionIndex))
              : t("auto.ClubDashboard.bilan_seance_point_suivi", "Bilan, séance, point suivi...")),
        sessionTitle: selectedSession ? getSessionLabel(selectedSession, Number(appointmentForm.sessionIndex)) : "",
        programTitle: selectedProgram?.title || "",
      };
      await apiFetch(withAdminClub("/clubs/appointments"), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({ title: t("auto.ClubDashboard.rendez_vous_ajoute_au_calendrier_club", "Rendez-vous ajouté au calendrier club"), status: "success", duration: 3500, isClosable: true });
      setAppointmentForm({ coachUid: "", clientId: "", type: "sport", programId: "", sessionIndex: "", appointmentKind: "suivi", durationMin: 60, title: "", startsAt: "", note: "" });
      setIsAddAppointmentModalOpen(false);
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Création du rendez-vous impossible.");
    } finally {
      setActionSaving("");
    }
  };

  const openAppointmentDetail = (appointment) => {
    setSelectedAppointment(appointment);
    setAppointmentEditForm({
      title: appointment?.title?.split(" · ")?.[0] || appointment?.title || "",
      startsAt: toDateTimeLocalValue(appointment?.start),
      durationMin: Number(appointment?.durationMin || 60) || 60,
      status: appointment?.status || "à venir",
      note: appointment?.note || "",
    });
    appointmentDetailModal.onOpen();
  };

  const updateAppointment = async (appointment, patch, { close = false, refresh = true } = {}) => {
    if (!appointment?.id) return;
    setActionSaving(`appointment:${appointment.id}`);
    setError("");
    try {
      await apiFetch(withAdminClub(`/clubs/appointments/${appointment.id}`), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (close) appointmentDetailModal.onClose();
      if (refresh) await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Mise à jour du rendez-vous impossible.");
      if (refresh) await loadSummary();
    } finally {
      setActionSaving("");
    }
  };

  const saveAppointmentEdit = async () => {
    if (!selectedAppointment) return;
    await updateAppointment(
      selectedAppointment,
      {
        title: appointmentEditForm.title,
        startsAt: appointmentEditForm.startsAt,
        durationMin: appointmentEditForm.durationMin,
        status: appointmentEditForm.status,
        note: appointmentEditForm.note,
      },
      { close: true }
    );
  };

  const deleteAppointment = async () => {
    if (!selectedAppointment?.id) return;
    setActionSaving(`appointment:${selectedAppointment.id}:delete`);
    setError("");
    try {
      await apiFetch(withAdminClub(`/clubs/appointments/${selectedAppointment.id}`), {
        method: "DELETE",
      });
      appointmentDetailModal.onClose();
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Suppression du rendez-vous impossible.");
    } finally {
      setActionSaving("");
    }
  };

  const moveAppointment = async ({ event, start, end }) => {
    if (isTouchDevice() || !event?.id) return;
    const nextStart = start instanceof Date ? start : new Date(start);
    const nextEnd = end instanceof Date ? end : new Date(end);
    if (!Number.isFinite(nextStart.getTime()) || !Number.isFinite(nextEnd.getTime())) return;
    const durationMin = Math.max(15, Math.round((nextEnd.getTime() - nextStart.getTime()) / 60000) || Number(event.durationMin || 60) || 60);
    await updateAppointment(
      event,
      {
        startsAt: nextStart.toISOString(),
        durationMin,
      },
      { refresh: true }
    );
  };

  const openAuditItem = (item) => {
    if (!item) return;
    if (item.kind === "client" && item.id) {
      navigate(`/clients/${item.id}`);
      return;
    }
    if (item.kind === "program") {
      if (item.clientId && item.programId) navigate(`/clients/${item.clientId}/programmes/${item.programId}`);
      else if (item.id) navigate(`/programmes/${item.id}`);
      return;
    }
    if (item.kind === "nutrition" && item.clientId && item.id) {
      navigate(`/clients/${item.clientId}/nutrition/${item.id}`);
    }
  };

  const repairAuditReferent = async (item) => {
    const key = `${item.kind}:${item.id}`;
    const coachUid = auditRepairCoach[key] || "";
    if (!coachUid) {
      toast({ title: t("clubDashboard.audit.selectProFirst", "Sélectionnez un pro à rattacher"), status: "warning", duration: 2500, isClosable: true });
      return;
    }
    setActionSaving(`audit:${key}`);
    setError("");
    try {
      await apiFetch(withAdminClub("/clubs/audit/referent"), {
        method: "PATCH",
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          clientId: item.clientId || "",
          programId: item.programId || "",
          coachUid,
        }),
      });
      toast({ title: t("clubDashboard.audit.repairSaved", "Référent mis à jour"), status: "success", duration: 3000, isClosable: true });
      setAuditRepairCoach((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || t("clubDashboard.audit.repairFailed", "Correction impossible."));
    } finally {
      setActionSaving("");
    }
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      toast({ title: t("dashboard.toasts.link_copied_title", "Lien copié"), status: "success", duration: 2500, isClosable: true });
    } catch {
      toast({ title: t("auto.ClubDashboard.copie_impossible", "Copie impossible"), description: inviteLink, status: "info", duration: 6000, isClosable: true });
    }
  };

  const saveGoalValue = async (coachUid, key, value) => {
    const numericValue = Math.max(0, Number(value || 0));
    const nextTarget = {
      ...(goalTargets[coachUid] || {}),
      [key]: numericValue,
    };
    setGoalTargets((current) => {
      const next = {
        ...current,
        [coachUid]: {
          ...(current[coachUid] || {}),
          [key]: numericValue,
        },
      };
      if (typeof window !== "undefined") {
        window.localStorage.setItem("club_dashboard_goals", JSON.stringify(next));
        window.localStorage.setItem(`club_dashboard_goals_${goalPeriod}`, JSON.stringify(next));
      }
      return next;
    });
    try {
      await apiFetch(withAdminClub("/clubs/goals"), {
        method: "PATCH",
        body: JSON.stringify({
          period: goalPeriod,
          periodKey: currentGoalPeriodKey,
          month: currentGoalMonth,
          coachUid,
          targets: nextTarget,
        }),
      });
    } catch (err) {
      setError(friendlyError(err));
    }
  };

  const downloadCsv = (filename, headers, rows) => {
    const content = [
      headers.map(csvEscape).join(";"),
      ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(";")),
    ].join("\n");
    const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportClients = () =>
    downloadCsv(
      "club-clients.csv",
      ["id", "name", "email", "coachName", "programCount", "completionPercent", "activityAt"],
      clubClients.map((client) => ({ ...client, coachName: displayCoachName(client.coachName), activityAt: formatDate(client.activityAt) }))
    );
  const exportPrograms = () =>
    downloadCsv(
      "club-programmes.csv",
      ["id", "title", "clientName", "coachName", "source", "activityAt"],
      clubPrograms.map((program) => ({ ...program, coachName: displayCoachName(program.coachName), activityAt: formatDate(program.activityAt) }))
    );
  const exportNutrition = () =>
    downloadCsv(
      "club-nutrition.csv",
      ["id", "clientName", "objective", "status", "coachName", "activityAt"],
      clubNutrition.map((assessment) => ({ ...assessment, coachName: displayCoachName(assessment.coachName), activityAt: formatDate(assessment.activityAt) }))
    );
  const exportStats = () =>
    downloadCsv(
      "club-stats-pros.csv",
      ["name", "clientCount", "programCount", "nutritionCount", "monthlyActivity"],
      goalRows.map((row) => ({
        name: displayName(row),
        clientCount: row.clientCount || 0,
        programCount: row.programCount || 0,
        nutritionCount: row.nutritionCount || 0,
        monthlyActivity: row.activity || 0,
      }))
    );

  const updateCoach = async (coach, patch) => {
    if (!coach?.uid) return;
    const actionKey = `${coach.uid}:${JSON.stringify(patch)}`;
    setActionSaving(actionKey);
    setError("");
    try {
      await apiFetch(withAdminClub(`/clubs/coaches/${encodeURIComponent(coach.uid)}`), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      toast({
        title: patch.status === "disabled" ? "Pro suspendu" : "Pro mis à jour",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Mise à jour du pro impossible.");
    } finally {
      setActionSaving("");
    }
  };

  const deleteCoach = async (coach) => {
    if (!coach?.uid) return;
    const ok = window.confirm(`Supprimer ${displayName(coach)} du club ? Son compte sera désactivé et retiré des listes club.`);
    if (!ok) return;
    setActionSaving(`${coach.uid}:delete`);
    setError("");
    try {
      await apiFetch(withAdminClub(`/clubs/coaches/${encodeURIComponent(coach.uid)}`), { method: "DELETE" });
      if (selectedCoachUid === coach.uid) setSelectedCoachUid("");
      toast({ title: t("auto.ClubDashboard.pro_supprime_du_club", "Pro supprimé du club"), status: "success", duration: 3500, isClosable: true });
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || "Suppression du pro impossible.");
    } finally {
      setActionSaving("");
    }
  };

  if (loading) return <AppLoading label={t("auto.ClubDashboard.chargement_de_l_espace_club", "Chargement de l’espace club...")} />;

  return (
    <Box data-tour-page="club-dashboard" bg={theme.pageBg} minH="100vh" py={{ base: 4, md: 10 }} px={{ base: 3, md: 6 }}>
      <Container maxW="container.xl">
        <VStack align="stretch" spacing={6}>
          {isClubTrial && (
            <Box
              borderRadius="20px"
              bg={theme.surfaceBg}
              border="1px solid"
              borderColor={theme.borderStrong}
              color={theme.textColor}
              boxShadow={theme.cardProps.boxShadow}
              px={{ base: 3, md: 4 }}
              py={{ base: 3, md: 2.5 }}
            >
              <Flex align="center" justify="space-between" gap={3} flexWrap="wrap">
                <HStack spacing={3} minW={0}>
                  <Circle size="34px" bg="rgba(59,130,246,0.12)" color={theme.accentBlue} flexShrink={0}>
                    <Icon as={TimeIcon} color={theme.accentBlue} boxSize="17px" />
                  </Circle>
                  <Box minW={0}>
                    <HStack spacing={2} flexWrap="wrap">
                      <Badge borderRadius="full" colorScheme={trialRemaining?.days <= 5 ? "orange" : "blue"} px={2.5} py={0.5}>{t("auto.ClubDashboard.essai_club", "Essai club")}</Badge>
                      <Text fontWeight="800" noOfLines={1}>
                        {trialRemaining?.days ?? 0}{t("time.days_short", "j")}{trialRemaining?.hours ?? 0}{t("time.hours_short", "h")}{trialRemaining?.minutes ?? 0}{t("auto.ClubDashboard.min_restants", "min restants")}</Text>
                    </HStack>
                    <Text fontSize="sm" color={theme.mutedText} noOfLines={1}>{t("auto.ClubDashboard.les_acces_des_pros_restent_inclus_jusqu_a_la_", "Les accès des pros restent inclus jusqu’à la fin de l’essai.")}</Text>
                  </Box>
                </HStack>
                <Button
                  size="sm"
                  borderRadius="full"
                  variant="outline"
                  borderColor={theme.borderColor}
                  onClick={() => navigate("/plans/professionnel")}
                >{t("auto.ClubDashboard.voir_les_packs", "Voir les packs")}</Button>
              </Flex>
            </Box>
          )}

          {!showDashboard && (
            <Box {...theme.cardProps} p={{ base: 5, md: 7 }}>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<ArrowBackIcon />}
                onClick={goBackToClubDashboard}
                mb={4}
                alignSelf="flex-start"
              >{t("programView.back", "Retour")}</Button>
              <Stack direction={{ base: "column", sm: "row" }} align={{ base: "start", sm: "center" }} justify="space-between" gap={4} mb={3}>
                <Badge colorScheme="orange" borderRadius="full" px={3} py={1}>{t("auto.ClubDashboard.espace_club", "Espace Club")}</Badge>
              </Stack>
              <Heading size="lg">{pageMeta[0]}</Heading>
              <Text color={theme.mutedText} mt={2} maxW="760px">
                {pageMeta[1]}
              </Text>
            </Box>
          )}

          {showDashboard && (
          <Box {...theme.cardProps} id="club-overview" data-tour="club-hero" p={{ base: 4, md: 8 }}>
            <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={6} align={{ base: "stretch", lg: "center" }}>
              <HStack flex="1" minW={0} spacing={{ base: 3, md: 4 }} align="flex-start">
                <Flex
                  w={clubLogoFrameSize.w}
                  h={clubLogoFrameSize.h}
                  borderRadius={clubLogoFrameSize.radius}
                  bg={theme.surfaceBg}
                  border="1px solid"
                  borderColor={theme.borderColor}
                  boxShadow={theme.glassShadow}
                  overflow="hidden"
                  align="center"
                  justify="center"
                  flexShrink={0}
                >
                  <Box
                    as="img"
                    src={resolvedClubLogoUrl || "/logo-byl.png"}
                    alt={resolvedClubLogoUrl ? t("clubDashboard.logo.clubAlt", "Logo du club") : "BoostYourLife.coach"}
                    w="100%"
                    h="100%"
                    maxW="92%"
                    maxH="92%"
                    objectFit="contain"
                    onLoad={(event) => {
                      const img = event.currentTarget;
                      if (img.naturalWidth && img.naturalHeight) {
                        setClubLogoAspectRatio(img.naturalWidth / img.naturalHeight);
                      }
                    }}
                  />
                </Flex>
                <Box minW={0}>
                  <HStack spacing={2} flexWrap="wrap" mb={3}>
                    <Badge colorScheme="orange" borderRadius="full" px={3} py={1}>{t("auto.ClubDashboard.espace_club", "Espace Club")}</Badge>
                    {isClubTrial && (
                      <Badge colorScheme={trialRemaining?.days <= 5 ? "orange" : "blue"} borderRadius="full" px={3} py={1}>{t("auto.ClubDashboard.essai_j", "Essai J-")}{trialRemaining?.days ?? 0}
                      </Badge>
                    )}
                  </HStack>
                  <Heading size={{ base: "md", md: "lg" }} lineHeight="1.05">{summary?.club?.name || t("clubDashboard.pages.dashboard.title", "Dashboard club")}</Heading>
                  <Text color={theme.subtleText} fontSize="sm" fontWeight="800" mt={{ base: 2, md: 3 }} textTransform="capitalize">
                    {formatFullDate(new Date())}
                  </Text>
                  <Text fontSize={{ base: "md", md: "xl" }} fontWeight="900" mt={{ base: 2, md: 3 }}>
                    {getGreeting()}{t("auto.ClubDashboard.voici_le_cockpit_du_club", ", voici le cockpit du club.")}</Text>
                  <Text color={theme.mutedText} mt={2} maxW="760px" fontSize={{ base: "sm", md: "md" }}>{t("auto.ClubDashboard.priorites_equipe_clients_programmes_et_procha", "Priorités, équipe, clients, programmes et prochains rendez-vous au même endroit.")}</Text>
                </Box>
              </HStack>
              <HStack display={{ base: "none", md: "flex" }} align={{ base: "stretch", sm: "center" }} justify={{ base: "stretch", lg: "end" }} spacing={3} flexWrap="wrap">
                <Button {...theme.primaryButtonProps} leftIcon={<AddIcon />} onClick={openCreateCoachSection}>{t("auto.ClubDashboard.inviter_un_pro", "Inviter un pro")}</Button>
                <Button variant="outline" borderRadius="16px" onClick={openCalendarAppointmentModal}>{t("auto.ClubDashboard.planifier_un_rdv", "Planifier un RDV")}</Button>
                <Button variant="outline" borderRadius="16px" onClick={() => openClubSection("settings")}>{t("settings.title", "Réglages")}</Button>
                <Badge colorScheme={proLimitReached ? "red" : "green"} borderRadius="full" px={3} py={1} alignSelf="center">
                  {proLimitReached ? t("dashboard.client_quota_full", "Limite atteinte") : t("clubDashboard.status.operational", "Opérationnel")}
                </Badge>
              </HStack>
            </Stack>

            <SimpleGrid data-tour="club-stats" columns={{ base: 2, md: 3, xl: 6 }} spacing={{ base: 2.5, md: 3 }} mt={{ base: 4, md: 6 }}>
              <Box {...theme.tileProps} p={{ base: 3, md: 4 }}>
                <Text color={theme.mutedText} fontSize="sm">{t("dashboard.banner.today_label", "Aujourd’hui")}</Text>
                <Text fontSize="2xl" fontWeight="900">{todayClientCount + todayProgramCount + todayNutritionCount}</Text>
                <Text color={theme.mutedText} fontSize="sm" noOfLines={{ base: 2, md: 3 }}>
                  {todayClientCount} {t("auto.ClubDashboard.client_s", "client(s),")} {todayProgramCount} {t("auto.ClubDashboard.programme_s", "programme(s),")} {todayNutritionCount} {t("auto.ClubDashboard.bilan_s", "bilan(s)")}</Text>
              </Box>
              <Box {...theme.tileProps} p={{ base: 3, md: 4 }}>
                <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.pros_actifs", "Pros actifs")}</Text>
                <Text fontSize="2xl" fontWeight="900">{proLimitLabel}</Text>
                <Text color={theme.mutedText} fontSize="sm">{stats.activeCoachCount || 0} {t("auto.ClubDashboard.actif_s", "actif(s)")}</Text>
                <Progress value={proUsage ?? 0} size="xs" borderRadius="full" colorScheme={proLimitReached ? "red" : "blue"} bg={theme.surfaceSoft} mt={3} />
              </Box>
              <Box {...theme.tileProps} p={{ base: 3, md: 4 }}>
                <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.clients_suivis", "Clients suivis")}</Text>
                <Text fontSize="2xl" fontWeight="900">{clientLimitLabel}</Text>
                <Text color={theme.mutedText} fontSize="sm" noOfLines={{ base: 2, md: 3 }}>
                  {clientUsage !== null
                    ? t("clubDashboard.capacity.usedPercent", "{{percent}}% de capacité utilisée", { percent: clientUsage })
                    : t("dashboard.client_quota_unlimited", "Capacité illimitée")}
                </Text>
                <Progress value={clientUsage ?? 0} size="xs" borderRadius="full" colorScheme={clientUsage >= 90 ? "red" : "green"} bg={theme.surfaceSoft} mt={3} />
              </Box>
              <Box {...theme.tileProps} p={{ base: 3, md: 4 }}>
                <Text color={theme.mutedText} fontSize="sm">{t("clientsList.table.programs", "Programmes")}</Text>
                <Text fontSize="2xl" fontWeight="900">{stats.programCount || 0}</Text>
                <Text color={theme.mutedText} fontSize="sm" noOfLines={1}>{t("auto.ClubDashboard.crees_par_l_equipe", "Créés par l’équipe")}</Text>
              </Box>
              <Box {...theme.tileProps} p={{ base: 3, md: 4 }}>
                <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.rendez_vous", "Rendez-vous")}</Text>
                <Text fontSize="2xl" fontWeight="900">{upcomingFilteredAppointments.length}</Text>
                <Text color={theme.mutedText} fontSize="sm">{todayAppointments.length} {t("auto.ClubDashboard.aujourd_hui", "aujourd’hui")}</Text>
              </Box>
              <Box {...theme.tileProps} p={{ base: 3, md: 4 }}>
                <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.leader_actuel", "Leader actuel")}</Text>
                <Text fontSize="lg" fontWeight="900" noOfLines={1}>{leaderCoach ? displayName(leaderCoach) : t("clubDashboard.empty.noPro", "Aucun pro")}</Text>
                <Text color={theme.mutedText} fontSize="sm">
                  {leaderCoach
                    ? t("clubDashboard.leader.clientsFollowed", "{{count}} client(s) suivis par le plus actif", { count: leaderCoach.clientCount || 0 })
                    : t("clubDashboard.empty.createProToStart", "Créez un pro pour démarrer")}
                </Text>
              </Box>
            </SimpleGrid>

            <Box {...theme.tileProps} mt={4} p={{ base: 4, md: 5 }}>
              <Stack direction={{ base: "column", lg: "row" }} spacing={{ base: 4, lg: 6 }} align={{ base: "stretch", lg: "center" }} justify="space-between">
                <HStack spacing={3} align="start" flex="1" minW={0}>
                  <Circle size="42px" bg={theme.surfaceSoft} color={theme.textColor} flexShrink={0}>
                    <TimeIcon />
                  </Circle>
                  <Box minW={0}>
                    <Text fontWeight="900">{t("clubDashboard.todaySchedule.title", "Suivi des rendez-vous du jour")}</Text>
                    <Text color={theme.mutedText} fontSize="sm" noOfLines={{ base: 2, md: 1 }}>
                      {todayAppointmentSummary.next
                        ? t("clubDashboard.todaySchedule.next", "Prochain : {{title}} à {{time}}", {
                            title: todayAppointmentSummary.next.title,
                            time: formatTime(todayAppointmentSummary.next.start),
                          })
                        : todayAppointmentSummary.total
                          ? t("clubDashboard.todaySchedule.doneForToday", "Tous les rendez-vous du jour sont passés.")
                          : t("clubDashboard.todaySchedule.empty", "Aucun rendez-vous planifié aujourd’hui.")}
                    </Text>
                  </Box>
                </HStack>
                <Box minW={{ base: "100%", lg: "320px" }}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" color={theme.mutedText}>
                      {t("clubDashboard.todaySchedule.progressLabel", "Progression journée")}
                    </Text>
                    <Text fontWeight="900">
                      {todayAppointmentSummary.done}/{todayAppointmentSummary.total}
                    </Text>
                  </HStack>
                  <Progress
                    value={todayAppointmentSummary.progress}
                    size="sm"
                    borderRadius="full"
                    colorScheme={todayAppointmentSummary.total ? "green" : "gray"}
                    bg={theme.surfaceSoft}
                  />
                </Box>
              </Stack>
            </Box>

            <SimpleGrid display={{ base: "none", md: "grid" }} columns={{ base: 2, md: 4 }} spacing={3} mt={6}>
              {[
                [t("clubDashboard.actions.createPro", "Créer un pro"), "create"],
                [t("clubDashboard.actions.viewTeam", "Voir l’équipe"), "team"],
                [t("clubDashboard.actions.calendar", "Calendrier"), "calendar"],
                [t("clubDashboard.actions.clientsPrograms", "Clients & programmes"), "activity"],
              ].map(([label, target]) => (
                <Button
                  key={target}
                  variant="outline"
                  onClick={() => {
                    if (target === "create") {
                      openCreateCoachSection();
                      return;
                    }
                    openClubSection(target);
                  }}
                >
                  {label}
                </Button>
              ))}
            </SimpleGrid>
          </Box>
          )}

          {showDashboard && isClubSetupEmpty && (
            <Box
              {...theme.cardProps}
              p={{ base: 4, md: 6 }}
              borderColor={theme.accentBlue}
              bg={setupEmptyBg}
            >
              <Stack direction={{ base: "column", lg: "row" }} justify="space-between" align={{ base: "stretch", lg: "center" }} gap={5}>
                <Box maxW="720px">
                  <Badge colorScheme="blue" borderRadius="full" px={3} py={1} mb={3}>
                    {t("clubDashboard.setup.badge", "Configuration")}
                  </Badge>
                  <Heading size="md">{t("clubDashboard.setup.emptyTitle", "Ce club est prêt, il reste à le lancer")}</Heading>
                  <Text color={theme.mutedText} mt={2} fontSize={{ base: "sm", md: "md" }}>
                    {t("clubDashboard.setup.emptyDetail", "Aucun pro, client, programme ou rendez-vous n’est encore rattaché. Le plus efficace est d’ajouter le premier intervenant, puis de relier ses clients au club.")}
                  </Text>
                </Box>
                <HStack display={{ base: "none", md: "flex" }} justify={{ base: "stretch", lg: "end" }} flexWrap="wrap">
                  <Button {...theme.primaryButtonProps} leftIcon={<AddIcon />} onClick={openCreateCoachSection}>
                    {t("auto.ClubDashboard.inviter_un_pro", "Inviter un pro")}
                  </Button>
                  <Button variant="outline" borderRadius="16px" onClick={() => openClubSection("settings")}>
                    {t("clubDashboard.setup.identity", "Identité du club")}
                  </Button>
                </HStack>
              </Stack>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mt={5}>
                {[
                  ["01", t("clubDashboard.setup.stepPro", "Créer le premier pro"), t("clubDashboard.setup.stepProDetail", "Le compte portera les clients, programmes et rendez-vous du club.")],
                  ["02", t("clubDashboard.setup.stepBrand", "Vérifier l’identité"), t("clubDashboard.setup.stepBrandDetail", "Nom, logo et langue serviront de base aux espaces partagés.")],
                  ["03", t("clubDashboard.setup.stepFollow", "Planifier le premier point"), t("clubDashboard.setup.stepFollowDetail", "Le calendrier devient utile dès qu’un rendez-vous est posé.")],
                ].map(([number, title, detail]) => (
                  <Box key={number} {...theme.tileProps} p={{ base: 3, md: 4 }}>
                    <HStack spacing={3} align="start">
                      <Circle size="34px" bg="rgba(59,130,246,0.12)" color={theme.accentBlue} fontWeight="900" flexShrink={0}>
                        {number}
                      </Circle>
                      <Box>
                        <Text fontWeight="900">{title}</Text>
                        <Text color={theme.mutedText} fontSize="sm" mt={1}>{detail}</Text>
                      </Box>
                    </HStack>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}

          {showGuideBlock && (
            <Box {...theme.cardProps} id="club-guide" data-tour="club-guide" p={{ base: 5, md: 6 }} display={{ base: "none", md: "block" }}>
              <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={5} align={{ base: "stretch", lg: "center" }}>
                <Box maxW="680px">
                  <Badge colorScheme="gray" borderRadius="full" px={3} py={1} mb={3}>{t("clubDashboard.guide.badge", "Guide")}</Badge>
                  <Heading size="md">{t("auto.ClubDashboard.fonctionnement_global", "Fonctionnement global")}</Heading>
                  <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.une_aide_de_demarrage_masquable_quand_le_parc", "Une aide de démarrage, masquable quand le parcours est compris.")}</Text>
                </Box>
                <Button {...theme.primaryButtonProps} onClick={() => toggleGuide(false)}>{t("clubDashboard.actions.understood", "J’ai compris")}</Button>
              </Stack>
              <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={3} mt={5}>
                {[
                  ["1", t("clubDashboard.guide.proTitle", "Le club crée le pro"), t("clubDashboard.guide.proDetail", "Prénom, nom, email et spécialité. L’accès est rattaché à l’abonnement du club.")],
                  ["2", t("clubDashboard.guide.activationTitle", "Le pro active son accès"), t("clubDashboard.guide.activationDetail", "Le lien d’activation permet au pro de définir son mot de passe et d’entrer dans son espace.")],
                  ["3", t("clubDashboard.guide.separateTitle", "Chaque pro travaille séparément"), t("clubDashboard.guide.separateDetail", "Clients, patients, programmes et suivis restent gérés dans l’interface habituelle du pro.")],
                  ["4", t("clubDashboard.guide.supervisionTitle", "Le club supervise"), t("clubDashboard.guide.supervisionDetail", "Le dashboard consolide l’équipe, les capacités, les rendez-vous et les activités récentes.")],
                  ["5", t("clubDashboard.guide.limitsTitle", "Les limites sont appliquées"), t("clubDashboard.guide.limitsDetail", "La création est bloquée quand les limites de l’offre club sont atteintes.")],
                  ["6", t("clubDashboard.guide.identityTitle", "L’identité descend du club"), t("clubDashboard.guide.identityDetail", "Logo, nom et préférences servent de base aux documents et espaces partagés.")],
                ].map(([number, title, copy]) => (
                  <Box key={title} {...theme.tileProps} p={4}>
                    <HStack spacing={3} align="start">
                      <Circle size="30px" bg={theme.surfaceSoft} color={theme.textColor} fontWeight="900" flexShrink={0}>
                        {number}
                      </Circle>
                      <Box minW={0}>
                        <Text fontWeight="900" mb={1}>{title}</Text>
                        <Text fontSize="sm" color={theme.mutedText}>{copy}</Text>
                      </Box>
                    </HStack>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          )}

          {showDashboard && (
            <Box {...theme.cardProps} data-tour="club-tools-dashboard" p={{ base: 5, md: 6 }} display={{ base: "none", md: "block" }}>
              <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={4} align={{ base: "stretch", lg: "center" }}>
                <Box maxW="680px">
                  <Heading size="md">{t("clubDashboard.tools.title", "Pilotage club")}</Heading>
                  <Text color={theme.mutedText} fontSize="sm" mt={1}>
                    {t("clubDashboard.tools.subtitle", "Toutes les pages d’exploitation utiles restent dans le périmètre club et ne modifient rien sans action explicite.")}
                  </Text>
                </Box>
                <SimpleGrid columns={{ base: 1, sm: 2, lg: 3, xl: 6 }} spacing={3} flex="1" minW={{ lg: "520px" }}>
                  {CLUB_TOOLS.map((tool) => (
                    <Button
                      key={tool.key}
                      data-club-tool={tool.key}
                      variant="outline"
                      minH="44px"
                      whiteSpace="normal"
                      onClick={() => navigate(withAdminClub(tool.path))}
                    >
                      {t(tool.labelKey, tool.fallback)}
                    </Button>
                  ))}
                </SimpleGrid>
              </Stack>
            </Box>
          )}

          {showDashboard && (
            <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={6}>
              <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={3} mb={4}>
                  <Box>
                    <Heading size="md">{t("auto.ClubDashboard.priorites", "Priorités")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.les_points_qui_meritent_une_action_rapide", "Les points qui méritent une action rapide.")}</Text>
                  </Box>
                  <Button size="sm" variant="outline" onClick={() => openClubView("stats")}>{t("auto.ClubDashboard.voir_les_stats", "Voir les stats")}</Button>
                </Stack>
                <VStack align="stretch" spacing={3}>
                  {dashboardPriorities.map((item) => (
                    <Box key={item.title} {...theme.tileProps} p={4}>
                      <HStack justify="space-between" align="start" gap={3}>
                        <Box minW={0}>
                          <Badge colorScheme={item.tone} borderRadius="full" mb={2}>{t("auto.ClubDashboard.a_traiter", "À traiter")}</Badge>
                          <Text fontWeight="900">{item.title}</Text>
                          <Text color={theme.mutedText} fontSize="sm" mt={1}>{item.detail}</Text>
                        </Box>
                        <Button size="sm" variant="outline" onClick={item.onClick}>
                          {item.action}
                        </Button>
                      </HStack>
                    </Box>
                  ))}
                </VStack>
              </Box>

              <Box {...theme.cardProps} id="club-dashboard-calendar" data-tour="club-dashboard-calendar" p={{ base: 5, md: 6 }} gridColumn={{ xl: "span 2" }}>
                <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={3} mb={4}>
                  <Box>
                    <Heading size="md">{t("auto.ClubDashboard.calendrier_de_l_equipe", "Calendrier de l’équipe")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.une_vue_directe_des_rendez_vous_club_comme_da", "Une vue directe des rendez-vous club, comme dans l’espace coach.")}</Text>
                  </Box>
                  <HStack>
                    <Button size="sm" leftIcon={<AddIcon />} {...theme.primaryButtonProps} onClick={openCalendarAppointmentModal}>{t("exerciseCard.add", "Ajouter")}</Button>
                    <Button size="sm" variant="outline" as={RouterLink} to={withAdminClub("/club-dashboard/calendrier")}>{t("programs.open", "Ouvrir")}</Button>
                  </HStack>
                </Stack>
                <VStack display={{ base: "flex", md: "none" }} align="stretch" spacing={3}>
                  {upcomingFilteredAppointments.length ? (
                    upcomingFilteredAppointments.slice(0, 4).map((event) => {
                      const normalized = String(event?.status || "").toLowerCase();
                      const isDone =
                        normalized === "validée" ||
                        normalized === "validee" ||
                        normalized === "done" ||
                        normalized === "completed";
                      return (
                        <Box
                          key={event.id || `${event.title}:${event.startsAt}`}
                          {...theme.tileProps}
                          p={4}
                          borderColor={isDone ? "green.200" : theme.borderColor}
                          onClick={() => openAppointmentDetail(event)}
                          cursor="pointer"
                        >
                          <HStack justify="space-between" align="start" gap={3}>
                            <Box minW={0}>
                              <Text fontWeight="900" noOfLines={1}>{event.clientName || event.coachName || event.title}</Text>
                              <Text color={theme.mutedText} fontSize="sm" noOfLines={1}>{event.title}</Text>
                              <Text color={theme.mutedText} fontSize="xs" mt={1}>{formatShortDateTime(event.start)}</Text>
                            </Box>
                            <Badge colorScheme={isDone ? "green" : "blue"} borderRadius="full">
                              {isDone ? t("calendar.validated", "Validé") : t("clubDashboard.mobile.planned", "Planifié")}
                            </Badge>
                          </HStack>
                        </Box>
                      );
                    })
                  ) : (
                    <Box {...theme.tileProps} p={4}>
                      <Text fontWeight="900">{t("clubDashboard.todaySchedule.empty", "Aucun rendez-vous planifié aujourd’hui.")}</Text>
                      <Text color={theme.mutedText} fontSize="sm" mt={1}>
                        {t("clubDashboard.setup.stepFollowDetail", "Le calendrier devient utile dès qu’un rendez-vous est posé.")}
                      </Text>
                    </Box>
                  )}
                </VStack>
                <Box
                  display={{ base: "none", md: "block" }}
                  sx={{
                    ".rbc-calendar": { background: "transparent", color: "inherit", borderRadius: "18px", overflow: "hidden" },
                    ".rbc-toolbar": {
                      background: calendarToolbarBg,
                      padding: "0.7rem",
                      borderRadius: "16px",
                      marginBottom: "12px",
                      border: `1px solid ${calendarGridBorder}`,
                      gap: "8px",
                    },
                    ".rbc-toolbar button": {
                      color: calendarButtonColor,
                      background: calendarButtonBg,
                      border: `1px solid ${calendarGridBorder}`,
                      borderRadius: "12px",
                      padding: "7px 10px",
                      fontWeight: 800,
                    },
                    ".rbc-toolbar button:hover, .rbc-toolbar .rbc-active": {
                      background: calendarActiveBg,
                      color: calendarButtonColor,
                    },
                    ".rbc-toolbar-label": {
                      color: calendarButtonColor,
                      fontWeight: 900,
                    },
                    ".rbc-month-view, .rbc-time-view, .rbc-agenda-view": {
                      border: `1px solid ${calendarGridBorder}`,
                      borderRadius: "18px",
                      overflow: "hidden",
                      background: calendarPanelBg,
                    },
                    ".rbc-header": {
                      background: calendarToolbarBg,
                      borderColor: calendarGridBorder,
                      color: calendarButtonColor,
                      padding: "0.6rem 0.4rem",
                      fontWeight: 900,
                    },
                    ".rbc-month-row, .rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot, .rbc-time-header, .rbc-time-content": {
                      borderColor: calendarGridBorder,
                    },
                    ".rbc-date-cell, .rbc-time-gutter, .rbc-agenda-date-cell, .rbc-agenda-time-cell, .rbc-agenda-event-cell": {
                      color: calendarButtonColor,
                    },
                    ".rbc-off-range": { color: theme.subtleText },
                    ".rbc-today": { background: calendarTodayBg },
                    ".rbc-off-range-bg": { background: calendarMutedBg },
                    ".rbc-agenda-table, .rbc-agenda-table tbody > tr > td": {
                      borderColor: calendarGridBorder,
                      color: calendarButtonColor,
                    },
                    ".rbc-event": {
                      borderRadius: "12px",
                      padding: "4px 8px",
                      border: "none",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                    },
                  }}
                >
                  <DnDCalendar
                    localizer={localizer}
                    culture={calendarCulture}
                    formats={calendarFormats}
                    events={filteredCalendarEvents}
                    startAccessor="start"
                    endAccessor="end"
                    style={{ height: 430, borderRadius: 12 }}
                    views={["month", "week", "day", "agenda"]}
                    popup
                    resizable={!isTouchDevice()}
                    onSelectEvent={openAppointmentDetail}
                    onEventDrop={isTouchDevice() ? undefined : moveAppointment}
                    onEventResize={isTouchDevice() ? undefined : moveAppointment}
                    draggableAccessor={(event) => !isTouchDevice() && event?.status !== "validée"}
                    resizableAccessor={(event) => !isTouchDevice() && event?.status !== "validée"}
                    eventPropGetter={(event) => {
                      const normalized = String(event?.status || "").toLowerCase();
                      const bg =
                        normalized === "validée" || normalized === "validee" || normalized === "done"
                          ? "#16A34A"
                          : normalized === "annulée" || normalized === "annulee" || normalized === "cancelled" || normalized === "canceled"
                          ? "#64748B"
                          : normalized === "manquée" || normalized === "manquee"
                          ? "#DC2626"
                          : "#1D4ED8";
                      return {
                        style: {
                        backgroundColor: bg,
                        color: "white",
                        borderRadius: 12,
                        border: "none",
                      },
                      };
                    }}
                    messages={{
                      today: t("calendar.today", "Aujourd’hui"),
                      previous: t("calendar.previous", "Précédent"),
                      next: t("calendar.next", "Suivant"),
                      month: t("calendar.month", "Mois"),
                      week: t("calendar.week", "Semaine"),
                      day: t("calendar.day", "Jour"),
                      agenda: t("calendar.agenda", "Agenda"),
                      noEventsInRange: t("calendar.no_events_in_range", "Aucun rendez-vous sur cette période."),
                      showMore: (total) => t("calendar.show_more", { count: total, defaultValue: `+${total}` }),
                    }}
                  />
                </Box>
              </Box>

              <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={3} mb={4}>
                  <Box>
                    <Heading size="md">{t("auto.ClubDashboard.equipe", "Équipe")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.repartition_rapide_des_pros_actifs", "Répartition rapide des pros actifs.")}</Text>
                  </Box>
                  <Button size="sm" variant="outline" onClick={() => openClubSection("team")}>{t("auto.ClubDashboard.gerer", "Gérer")}</Button>
                </Stack>
                <VStack align="stretch" spacing={3}>
                  {dashboardCoachRows.map((coach) => (
                    <Box key={coach.uid} {...theme.tileProps} p={3}>
                      <HStack justify="space-between" align="start" gap={3}>
                        <Box minW={0}>
                          <Text fontWeight="900" noOfLines={1}>{displayName(coach)}</Text>
                          <Text color={theme.mutedText} fontSize="xs" noOfLines={1}>
                            {proTypeLabel(coach.proType)} · {coach.status === "disabled" ? t("common.suspended", "Suspendu") : t("common.active", "Actif")}
                          </Text>
                        </Box>
                        <Badge borderRadius="full">
                          {coach.clientCount || 0} {t("auto.ClubDashboard.client_s_2", "client(s)")}</Badge>
                      </HStack>
                      <HStack mt={3} spacing={2} flexWrap="wrap">
                        <Badge colorScheme="blue">{coach.programCount || 0} {t("clientsList.badge.programsShort", "prog.")}</Badge>
                        <Badge colorScheme={coach.status === "disabled" ? "red" : "green"}>
                          {coach.status === "disabled" ? "Suspendu" : "Actif"}
                        </Badge>
                      </HStack>
                    </Box>
                  ))}
                  {dashboardCoachRows.length === 0 && (
                    <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucun_pro_pour_le_moment_invitez_le_premier_i", "Aucun pro pour le moment. Invitez le premier intervenant du club.")}</Text>
                  )}
                </VStack>
              </Box>
            </SimpleGrid>
          )}

          {showDashboard && (
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={3} mb={4}>
                  <Box>
                    <Heading size="md">{t("auto.ClubDashboard.activite_recente", "Activité récente")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.derniers_mouvements_sur_le_perimetre_club", "Derniers mouvements sur le périmètre club.")}</Text>
                  </Box>
                  <Button size="sm" variant="outline" onClick={() => openClubView("clients")}>{t("auto.ClubDashboard.explorer", "Explorer")}</Button>
                </Stack>
                <VStack align="stretch" spacing={3}>
                  {recentActivityItems.map((item) => (
                    <HStack key={item.id} justify="space-between" align="start" {...theme.tileProps} p={3}>
                      <Box minW={0}>
                        <HStack spacing={2} mb={1}>
                          <Badge borderRadius="full">{item.type}</Badge>
                          <Text color={theme.mutedText} fontSize="xs">{formatDate(item.activityAt)}</Text>
                        </HStack>
                        <Text fontWeight="900" noOfLines={1}>{item.title}</Text>
                      </Box>
                      <Badge colorScheme="blue" borderRadius="full">{item.coachName}</Badge>
                    </HStack>
                  ))}
                  {recentActivityItems.length === 0 && (
                    <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucune_activite_recente_detectee_pour_le_mome", "Aucune activité récente détectée pour le moment.")}</Text>
                  )}
                </VStack>
              </Box>

              <Box {...theme.cardProps} p={{ base: 5, md: 6 }} display={{ base: "none", md: "block" }}>
                <Heading size="md" mb={4}>{t("auto.ClubDashboard.actions_rapides", "Actions rapides")}</Heading>
                <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
                  <Button variant="outline" onClick={openCreateCoachSection}>{t("auto.ClubDashboard.inviter_un_pro", "Inviter un pro")}</Button>
                  <Button variant="outline" onClick={openCalendarAppointmentModal}>{t("auto.ClubDashboard.planifier_un_rdv", "Planifier un RDV")}</Button>
                  <Button variant="outline" onClick={() => openClubView("clients")}>{t("auto.ClubDashboard.clients_du_club", "Clients du club")}</Button>
                  <Button variant="outline" onClick={() => openClubView("stats")}>{t("coachStats.title", "Statistiques")}</Button>
                  <Button variant="outline" onClick={() => openClubSection("alerts")}>{t("clubDashboard.tools.alerts", "Alertes")}</Button>
                  <Button variant="outline" onClick={() => openClubSection("audit")}>{t("clubDashboard.tools.audit", "Audit données")}</Button>
                </SimpleGrid>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={4}>
                  <Box {...theme.tileProps} p={4}>
                    <Text fontWeight="900">{t("auto.ClubDashboard.clients_sans_programme", "Clients sans programme")}</Text>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {clientsWithoutProgram.length
                        ? `${clientsWithoutProgram.length} client(s) à vérifier en priorité.`
                        : "Aucun client sans programme dans les données récentes."}
                    </Text>
                  </Box>
                  <Box {...theme.tileProps} p={4}>
                    <Text fontWeight="900">{t("auto.ClubDashboard.capacite_clients", "Capacité clients")}</Text>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {clientUsage !== null ? `${clientUsage}% utilisé sur l’offre actuelle.` : "Aucune limite client renseignée."}
                    </Text>
                  </Box>
                </SimpleGrid>
              </Box>
            </SimpleGrid>
          )}

          {showSettings && (
            <VStack align="stretch" spacing={6}>
              <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={4} align={{ base: "stretch", md: "center" }}>
                  <Box>
                    <Heading size="md">{t("auto.ClubDashboard.fonctionnement_global", "Fonctionnement global")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {t("clubDashboard.settings.guideHint", "Le guide peut être réaffiché sur le dashboard si un membre de l’équipe a besoin de revoir le fonctionnement club.")}
                    </Text>
                  </Box>
                  <Button
                    variant="outline"
                    onClick={() => {
                      toggleGuide(true);
                      navigate(withAdminClub("/club-dashboard"));
                      setTimeout(() => scrollToSection("club-guide"), 120);
                    }}
                  >
                    {t("clubDashboard.actions.showGuide", "Afficher le guide")}
                  </Button>
                </Stack>
              </Box>
              <Box {...theme.cardProps} id="club-settings" data-tour="club-settings" p={{ base: 5, md: 6 }}>
                <Stack direction={{ base: "column", lg: "row" }} gap={5} justify="space-between">
                  <Box flex="1">
                    <Heading size="md">{t("auto.ClubDashboard.identite_du_club", "Identité du club")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.le_nom_et_le_logo_du_club_seront_repris_dans_", "Le nom et le logo du club seront repris dans les comptes pros rattachés et serviront de base aux documents partagés.")}</Text>
                  </Box>
                  <Box as="form" onSubmit={saveClubIdentity} flex="2">
                    <VStack align="stretch" spacing={3}>
                      <FormControl isRequired>
                        <FormLabel>{t("auto.ClubDashboard.nom_du_club", "Nom du club")}</FormLabel>
                        <Input
                          {...theme.inputProps}
                          value={identityForm.name}
                          onChange={(e) => setIdentityForm((current) => ({ ...current, name: e.target.value }))}
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel>{t("auto.ClubDashboard.logo_du_club", "Logo du club")}</FormLabel>
                        <Input
                          {...theme.inputProps}
                          type="file"
                          accept="image/*"
                          pt={2}
                          onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
                        />
                        <Text color={theme.mutedText} fontSize="sm" mt={2}>
                          {logoFile
                            ? logoFile.name
                            : identityForm.logoUrl
                            ? t("auto.ClubDashboard.logo_existant_enregistre", "Logo existant enregistré")
                            : t("auto.ClubDashboard.aucun_logo_ajoute", "Aucun logo ajouté pour le moment")}
                          {uploadProgress > 0 ? ` · Upload ${uploadProgress}%` : ""}
                        </Text>
                      </FormControl>
                      <Button type="submit" {...theme.primaryButtonProps} isLoading={identitySaving}>{t("auto.ClubDashboard.enregistrer_l_identite_club", "Enregistrer l’identité club")}</Button>
                    </VStack>
                  </Box>
                </Stack>
              </Box>

              <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={6}>
                <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                  <HStack spacing={3} mb={4} align="flex-start">
                    <Circle size="42px" bg="rgba(59,130,246,0.10)" color={theme.accentBlue} flexShrink={0}>
                      <Icon as={MdLanguage} boxSize="20px" />
                    </Circle>
                    <Box>
                      <Heading size="md">{t("settings.fields.default_language", "Langue par défaut")}</Heading>
                      <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.preference_utilisee_dans_l_espace_club_et_les", "Préférence utilisée dans l’espace club et les comptes rattachés.")}</Text>
                    </Box>
                  </HStack>
                  <FormControl>
                    <FormLabel color={theme.subtleText}>{t("auto.ClubDashboard.langue_active", "Langue active")}</FormLabel>
                    <Select {...theme.inputProps} value={selectedLang} onChange={handleLangChange} isDisabled={languageSaving}>
                      <option value="fr">{t("clientCreation.languages.fr", "Français")}</option>
                      <option value="en">{t("clientCreation.languages.en", "English")}</option>
                      <option value="de">{t("clientCreation.languages.de", "Deutsch")}</option>
                      <option value="it">{t("clientCreation.languages.it", "Italiano")}</option>
                      <option value="es">{t("clientCreation.languages.es", "Español")}</option>
                      <option value="ru">{t("clientCreation.languages.ru", "Русский")}</option>
                      <option value="ar">العربية</option>
                    </Select>
                  </FormControl>
                </Box>

                <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                  <HStack spacing={3} mb={4} align="flex-start">
                    <Circle size="42px" bg="rgba(16,185,129,0.10)" color={theme.accentGreen} flexShrink={0}>
                      <Icon as={MdOutlineCreditCard} boxSize="20px" />
                    </Circle>
                    <Box>
                      <Heading size="md">{t("settings.sections.my_subscription", "Mon abonnement")}</Heading>
                      <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.accedez_au_portail_stripe_pour_gerer_factures", "Accédez au portail Stripe pour gérer factures et abonnement.")}</Text>
                    </Box>
                  </HStack>
                  <HStack spacing={2} mb={4} flexWrap="wrap">
                    <Badge borderRadius="full" colorScheme={user?.subscriptionStatus === "trialing" ? "yellow" : "green"} px={3} py={1}>
                      {user?.subscriptionStatus === "trialing"
                        ? t("auto.ClubDashboard.essai_en_cours", "Essai en cours")
                        : t("auto.ClubDashboard.acces_actif", "Accès actif")}
                    </Badge>
                    <Badge borderRadius="full" px={3} py={1}>
                      {limits.proLimit
                        ? t("auto.ClubDashboard.pros_limit", "{{count}} pros", { count: limits.proLimit })
                        : t("auto.ClubDashboard.pros_illimites", "Pros illimités")}
                    </Badge>
                    <Badge borderRadius="full" px={3} py={1}>
                      {limits.clientLimit
                        ? t("auto.ClubDashboard.clients_limit", "{{count}} clients", { count: limits.clientLimit })
                        : t("auto.ClubDashboard.clients_illimites", "Clients illimités")}
                    </Badge>
                  </HStack>
                  <Button
                    {...theme.primaryButtonProps}
                    isLoading={stripeLoading}
                    loadingText={t("auto.ClubDashboard.connexion_a_stripe", "Connexion à Stripe...")}
                    isDisabled={!hasStripeCustomer}
                    onClick={openStripePortal}
                  >{t("settings.buttons.open_stripe_portal", "Accéder au portail Stripe")}</Button>
                  {!hasStripeCustomer && (
                    <Text color={theme.mutedText} fontSize="sm" mt={3}>{t("auto.ClubDashboard.stripe_sera_disponible_des_qu_un_abonnement_r", "Stripe sera disponible dès qu’un abonnement réel sera lié au club.")}</Text>
                  )}
                </Box>

                <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                  <HStack spacing={3} mb={4} align="flex-start">
                    <Circle size="42px" bg="rgba(139,92,246,0.10)" color="#8B5CF6" flexShrink={0}>
                      <Icon as={MdOutlineLock} boxSize="20px" />
                    </Circle>
                    <Box>
                      <Heading size="md">{t("settings.sections.security", "Sécurité")}</Heading>
                      <Text color={theme.mutedText} fontSize="sm" mt={1}>{t("auto.ClubDashboard.envoyez_un_lien_de_reinitialisation_au_respon", "Envoyez un lien de réinitialisation au responsable club.")}</Text>
                    </Box>
                  </HStack>
                  <Box {...theme.tileProps} p={4} mb={4}>
                    <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.adresse_utilisee", "Adresse utilisée")}</Text>
                    <Text fontWeight="900" noOfLines={1}>{user?.email || t("auto.ClubDashboard.adresse_inconnue", "Adresse inconnue")}</Text>
                  </Box>
                  <Button {...theme.primaryButtonProps} isLoading={sendingReset} onClick={sendResetEmail}>{t("settings.buttons.send_reset", "Envoyer le lien de réinitialisation")}</Button>
                </Box>
              </SimpleGrid>
            </VStack>
          )}

          {error && (
            <Alert status={error.includes("pas encore chargé") ? "warning" : "error"} borderRadius="16px">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {showClubTool && (
            <VStack align="stretch" spacing={6}>
              <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={4} align={{ base: "stretch", lg: "center" }}>
                  <Box>
                    <Heading size="md">{t("clubDashboard.tools.title", "Pilotage club")}</Heading>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {t("clubDashboard.tools.subtitle", "Toutes les pages d’exploitation utiles restent dans le périmètre club et ne modifient rien sans action explicite.")}
                    </Text>
                  </Box>
                  <HStack flexWrap="wrap" justify={{ base: "start", lg: "end" }}>
                    {CLUB_TOOLS.map((tool) => (
                      <Button
                        key={tool.key}
                        size="sm"
                        variant={pageKind === tool.key ? "solid" : "outline"}
                        {...(pageKind === tool.key ? theme.primaryButtonProps : {})}
                        onClick={() => navigate(withAdminClub(tool.path))}
                      >
                        {t(tool.labelKey, tool.fallback)}
                      </Button>
                    ))}
                  </HStack>
                </Stack>
              </Box>

              {showAlerts && (
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                  {clubAlerts.map((alert) => (
                    <Box key={alert.title} {...theme.cardProps} p={{ base: 5, md: 6 }}>
                      <Badge colorScheme={alert.tone} borderRadius="full" px={3} py={1} mb={3}>{t("clubDashboard.tools.alert", "Alerte")}</Badge>
                      <Heading size="sm">{alert.title}</Heading>
                      <Text color={theme.mutedText} mt={2}>{alert.detail}</Text>
                      <Button size="sm" variant="outline" mt={4} onClick={alert.onClick}>{alert.action}</Button>
                    </Box>
                  ))}
                  {clubAlerts.length === 0 && (
                    <Box {...theme.cardProps} p={6}>
                      <Heading size="sm">{t("clubDashboard.alerts.empty.title", "Aucune alerte forte")}</Heading>
                      <Text color={theme.mutedText} mt={2}>{t("clubDashboard.alerts.empty.detail", "Le périmètre club récent semble propre.")}</Text>
                    </Box>
                  )}
                </SimpleGrid>
              )}

              {showLog && (
                <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                  <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={4} align={{ base: "stretch", lg: "center" }} mb={5}>
                    <Box>
                      <Heading size="md">{t("clubDashboard.pages.log.title", "Journal d’activité")}</Heading>
                      <Text color={theme.mutedText} fontSize="sm" mt={1}>
                        {t("clubDashboard.log.periodHelp", "Classez l’activité par période puis parcourez le détail par journée.")}
                      </Text>
                    </Box>
                    <HStack flexWrap="wrap" justify={{ base: "start", lg: "end" }}>
                      {[
                        ["day", t("clubDashboard.periods.day", "Journalier")],
                        ["week", t("clubDashboard.periods.week", "Hebdomadaire")],
                        ["month", t("clubDashboard.periods.month", "Mensuel")],
                        ["year", t("clubDashboard.periods.year", "Annuel")],
                      ].map(([period, label]) => (
                        <Button
                          key={period}
                          size="sm"
                          variant={logPeriod === period ? "solid" : "outline"}
                          {...(logPeriod === period ? theme.primaryButtonProps : {})}
                          onClick={() => setLogPeriod(period)}
                        >
                          {label}
                        </Button>
                      ))}
                    </HStack>
                  </Stack>
                  <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4} mb={5}>
                    {[
                      [t("clubDashboard.log.total", "Activités"), filteredActivityLog.length],
                      [t("clubDashboard.log.days", "Jours actifs"), groupedActivityLog.length],
                      [t("clubDashboard.log.latest", "Dernière activité"), filteredActivityLog[0]?.at ? formatDate(filteredActivityLog[0].at) : t("clubDashboard.empty.noDate", "Aucune date")],
                    ].map(([label, value]) => (
                      <Box key={label} {...theme.tileProps} p={4}>
                        <Text color={theme.mutedText} fontSize="sm">{label}</Text>
                        <Text fontSize="2xl" fontWeight="900">{value}</Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                  {groupedActivityLog.length === 0 ? (
                    <Text color={theme.mutedText}>{t("clubDashboard.log.emptyPeriod", "Aucune activité sur cette période.")}</Text>
                  ) : (
                    <VStack align="stretch" spacing={5}>
                      {groupedActivityLog.map((group) => (
                        <Box key={group.day}>
                          <HStack justify="space-between" mb={3}>
                            <Heading size="sm">{formatDate(group.day)}</Heading>
                            <Badge borderRadius="full" px={3} py={1}>{group.items.length} {t("clubDashboard.audit.items", "élément(s)")}</Badge>
                          </HStack>
                          <VStack align="stretch" spacing={3}>
                            {group.items.map((item) => (
                              <HStack key={item.id} justify="space-between" align="start" {...theme.tileProps} p={4} gap={4}>
                                <Box minW={0}>
                                  <HStack spacing={2} mb={1} flexWrap="wrap">
                                    <Badge borderRadius="full">{item.type}</Badge>
                                    <Text color={theme.mutedText} fontSize="xs">{formatDate(item.at)}</Text>
                                    <Badge colorScheme="blue" borderRadius="full">{item.owner}</Badge>
                                  </HStack>
                                  <Text fontWeight="900" noOfLines={1}>{item.label}</Text>
                                  <Text color={theme.mutedText} fontSize="sm" noOfLines={1}>{item.detail}</Text>
                                </Box>
                                <Button size="sm" variant="outline" onClick={item.action}>{t("programs.open", "Ouvrir")}</Button>
                              </HStack>
                            ))}
                          </VStack>
                        </Box>
                      ))}
                    </VStack>
                  )}
                </Box>
              )}

              {showAudit && (
                <VStack align="stretch" spacing={4}>
                  <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
                    {[
                      {
                        title: t("clubDashboard.audit.actions.createPro.title", "Créer le pro manquant"),
                        detail: t("clubDashboard.audit.actions.createPro.detail", "Ajoutez un compte pro officiel si les données viennent d’un intervenant non rattaché."),
                        action: t("clubDashboard.actions.createPro", "Créer un pro"),
                        onClick: openCreateCoachSection,
                      },
                      {
                        title: t("clubDashboard.audit.actions.assignPrograms.title", "Clients sans programme"),
                        detail: t("clubDashboard.audit.actions.assignPrograms.detail", "{{count}} dossier(s) à ouvrir pour assigner un programme.", { count: allClientsWithoutProgram.length }),
                        action: t("auto.ClubDashboard.clients_du_club", "Clients du club"),
                        onClick: () => openClubView("clients"),
                      },
                      {
                        title: t("clubDashboard.audit.actions.bulk.title", "Traiter par cohorte"),
                        detail: t("clubDashboard.audit.actions.bulk.detail", "Retrouvez les groupes prêts à traiter dans les actions groupées."),
                        action: t("clubDashboard.tools.bulk", "Actions groupées"),
                        onClick: () => navigate(withAdminClub("/club-dashboard/actions-groupees")),
                      },
                      {
                        title: t("clubDashboard.audit.actions.team.title", "Contrôler l’équipe"),
                        detail: t("clubDashboard.audit.actions.team.detail", "Vérifiez les référents détectés et les comptes réellement rattachés."),
                        action: t("clubDashboard.actions.viewTeam", "Voir l’équipe"),
                        onClick: () => openClubSection("team"),
                      },
                    ].map((action) => (
                      <Box key={action.title} {...theme.tileProps} p={4}>
                        <Text fontWeight="900">{action.title}</Text>
                        <Text color={theme.mutedText} fontSize="sm" mt={1}>{action.detail}</Text>
                        <Button size="sm" variant="outline" mt={4} onClick={action.onClick}>{action.action}</Button>
                      </Box>
                    ))}
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                    {auditFindings.map((finding) => (
                      <Box key={finding.title} {...theme.cardProps} p={{ base: 5, md: 6 }}>
                        <Badge colorScheme={finding.tone} borderRadius="full" px={3} py={1} mb={3}>
                          {finding.count} {t("clubDashboard.audit.items", "élément(s)")}
                        </Badge>
                        <Heading size="sm">{finding.title}</Heading>
                        <Text color={theme.mutedText} mt={2}>{finding.detail}</Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                  {allClientsWithoutProgram.length > 0 && (
                    <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                      <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={4} align={{ base: "stretch", md: "center" }}>
                        <Box>
                          <Heading size="sm">{t("clubDashboard.audit.noProgramQueue", "Clients à équiper")}</Heading>
                          <Text color={theme.mutedText} fontSize="sm" mt={1}>
                            {t("clubDashboard.audit.noProgramQueueHelp", "{{count}} client(s) n’ont pas encore de programme assigné.", { count: allClientsWithoutProgram.length })}
                          </Text>
                        </Box>
                        <HStack flexWrap="wrap">
                          {allClientsWithoutProgram.slice(0, 4).map((client) => (
                            <Button key={client.id} size="sm" variant="outline" onClick={() => navigate(`/clients/${client.id}`)}>
                              {client.name || client.email || client.id}
                            </Button>
                          ))}
                          <Button size="sm" {...theme.primaryButtonProps} onClick={() => openClubView("clients")}>
                            {t("clubDashboard.audit.openAllClients", "Voir tous les clients")}
                          </Button>
                        </HStack>
                      </Stack>
                    </Box>
                  )}
                  <Box {...theme.cardProps} p={{ base: 5, md: 6 }} overflowX="auto">
                    <Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} mb={4} gap={3}>
                      <Box>
                        <Heading size="sm">{t("clubDashboard.audit.details", "Détails à contrôler")}</Heading>
                        <Text color={theme.mutedText} fontSize="sm" mt={1}>
                          {t("clubDashboard.audit.detailsHelp", "Ouvrez le dossier ou rattachez directement le bon pro quand l’élément est réparable.")}
                        </Text>
                      </Box>
                      <Badge borderRadius="full" px={3} py={1}>{unknownReferentItems.length} {t("clubDashboard.audit.items", "élément(s)")}</Badge>
                    </Stack>
                    {unknownReferentItems.length === 0 ? (
                      <Text color={theme.mutedText}>{t("clubDashboard.audit.noUnknownReferents", "Aucun référent incertain à corriger.")}</Text>
                    ) : (
                      <Table size="sm">
                        <Thead>
                          <Tr>
                            <Th>{t("clubDashboard.audit.kind", "Type")}</Th>
                            <Th>{t("clubDashboard.audit.item", "Élément")}</Th>
                            <Th>{t("auto.ClubDashboard.pro", "Pro")}</Th>
                            <Th>{t("clientView.lastActivity", "Dernière activité")}</Th>
                            <Th>{t("nutritionCoach.table.actions", "Actions")}</Th>
                          </Tr>
                        </Thead>
                        <Tbody>
                          {unknownReferentItems.slice(0, 30).map((item) => {
                            const key = `${item.kind}:${item.id}`;
                            return (
                              <Tr key={key}>
                                <Td>{item.kind}</Td>
                                <Td>
                                  <Text fontWeight="800">{item.name || item.title || item.objective || item.clientName || item.id}</Text>
                                  {item.clientName && <Text color={theme.mutedText} fontSize="xs">{item.clientName}</Text>}
                                </Td>
                                <Td>{displayCoachName(item.coachName)}</Td>
                                <Td>{formatDate(item.activityAt)}</Td>
                                <Td minW="300px">
                                  <HStack spacing={2} align="center">
                                    <Select
                                      size="sm"
                                      maxW="180px"
                                      value={auditRepairCoach[key] || ""}
                                      onChange={(event) => setAuditRepairCoach((current) => ({ ...current, [key]: event.target.value }))}
                                      isDisabled={!coaches.length}
                                    >
                                      <option value="">{t("clubDashboard.audit.choosePro", "Choisir un pro")}</option>
                                      {coaches.map((coach) => (
                                        <option key={coach.uid} value={coach.uid}>{displayName(coach)}</option>
                                      ))}
                                    </Select>
                                    <Button size="sm" variant="outline" onClick={() => openAuditItem(item)}>
                                      {t("programs.open", "Ouvrir")}
                                    </Button>
                                    <Button
                                      size="sm"
                                      {...theme.primaryButtonProps}
                                      isDisabled={!coaches.length || !auditRepairCoach[key]}
                                      isLoading={actionSaving === `audit:${key}`}
                                      onClick={() => repairAuditReferent(item)}
                                    >
                                      {t("clubDashboard.audit.repair", "Corriger")}
                                    </Button>
                                  </HStack>
                                </Td>
                              </Tr>
                            );
                          })}
                        </Tbody>
                      </Table>
                    )}
                  </Box>
                </VStack>
              )}

              {showGoals && (
                <Box {...theme.cardProps} p={{ base: 5, md: 6 }} overflowX="auto">
                  <Flex justify="space-between" gap={4} align={{ base: "flex-start", md: "center" }} direction={{ base: "column", md: "row" }} mb={4}>
                    <Box>
                      <Heading size="md">{t("clubDashboard.goals.title", "Objectifs")}</Heading>
                      <Text color={theme.mutedText} fontSize="sm" mt={2}>
                        {t("clubDashboard.goals.sharedHelp", "Ces objectifs sont enregistrés pour la période choisie et visibles par le pro concerné dans son dashboard.")}
                      </Text>
                    </Box>
                    <HStack spacing={2} flexWrap="wrap">
                      {["week", "month", "year"].map((period) => (
                        <Button
                          key={period}
                          size="sm"
                          variant={goalPeriod === period ? "solid" : "outline"}
                          {...(goalPeriod === period ? theme.primaryButtonProps : {})}
                          onClick={() => setGoalPeriod(period)}
                        >
                          {t(`clubDashboard.periods.${period}`, period)}
                        </Button>
                      ))}
                    </HStack>
                  </Flex>
                  <Text color={theme.mutedText} fontSize="sm" mt={2} mb={4}>
                    {t("clubDashboard.goals.periodHelp", "La progression compare l’activité de la période sélectionnée aux objectifs saisis pour cette même période.")}
                  </Text>
                  <Table size="sm">
                    <Thead>
                      <Tr>
                        <Th>{t("auto.ClubDashboard.pro", "Pro")}</Th>
                        <Th>{t("dashboard.stats_total_clients", "Clients")}</Th>
                        <Th>{t("clientsList.table.programs", "Programmes")}</Th>
                        <Th>{t("clubDashboard.views.nutrition", "Nutrition")}</Th>
                        <Th>{t("clubDashboard.goals.sessions", "Séances")}</Th>
                        <Th>{t("clientsList.table.progress", "Progression")}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {goalRows.map((row) => (
                        <Tr key={row.uid}>
                          <Td>
                            <Text fontWeight="900">{displayName(row)}</Text>
                            <Text color={theme.mutedText} fontSize="xs">
                              {t("clubDashboard.goals.currentPeriod", "Période")} : {row.periodClientCount || 0} client(s) · {row.periodProgramCount || 0} prog. · {row.periodNutritionCount || 0} nutrition · {row.periodSessionCount || 0} séance(s)
                            </Text>
                          </Td>
                          {["clients", "programs", "nutrition", "sessions"].map((key) => (
                            <Td key={key}>
                              <Input
                                {...theme.inputProps}
                                type="number"
                                min="0"
                                value={row.target[key] || ""}
                                onChange={(event) => saveGoalValue(row.uid, key, event.target.value)}
                                maxW="100px"
                              />
                            </Td>
                          ))}
                          <Td minW="180px">
                            <Text fontWeight="800">{row.progress === null ? t("clubDashboard.goals.noTarget", "Sans objectif") : `${row.progress}%`}</Text>
                            <Progress value={row.progress || 0} size="xs" borderRadius="full" mt={2} colorScheme={row.progress >= 100 ? "green" : "blue"} />
                            {row.goalDetails ? (
                              <Text color={theme.mutedText} fontSize="xs" mt={2}>
                                {row.goalDetails}
                              </Text>
                            ) : (
                              <Text color={theme.mutedText} fontSize="xs" mt={2}>
                                {t("clubDashboard.goals.progressHelp", "Saisissez un objectif pour lancer le suivi.")}
                              </Text>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}

              {showExports && (
                <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
                  {[
                    [t("auto.ClubDashboard.clients_du_club", "Clients du club"), clubClients.length, exportClients],
                    [t("auto.ClubDashboard.programmes_du_club", "Programmes du club"), clubPrograms.length, exportPrograms],
                    [t("auto.ClubDashboard.nutrition_du_club", "Nutrition du club"), clubNutrition.length, exportNutrition],
                    [t("coachStats.title", "Statistiques"), goalRows.length, exportStats],
                  ].map(([label, count, action]) => (
                    <Box key={label} {...theme.cardProps} p={{ base: 5, md: 6 }}>
                      <Text color={theme.mutedText} fontSize="sm">{label}</Text>
                      <Text fontSize="3xl" fontWeight="900">{count}</Text>
                      <Button mt={4} {...theme.primaryButtonProps} onClick={action}>{t("clubDashboard.exports.downloadCsv", "Télécharger CSV")}</Button>
                    </Box>
                  ))}
                </SimpleGrid>
              )}

              {showBulk && (
                <VStack align="stretch" spacing={4}>
                  <Box {...theme.cardProps} p={{ base: 5, md: 6 }}>
                    <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={4} align={{ base: "stretch", lg: "center" }}>
                      <Box maxW="720px">
                        <Heading size="md">{t("clubDashboard.bulk.explainTitle", "À quoi sert cette page ?")}</Heading>
                        <Text color={theme.mutedText} mt={2}>
                          {t("clubDashboard.bulk.explainText", "Elle regroupe les dossiers qui demandent une action simple : assigner un programme, finaliser un bilan nutrition ou rattacher le bon pro. Rien n’est modifié automatiquement.")}
                        </Text>
                      </Box>
                      <Badge alignSelf={{ base: "flex-start", lg: "center" }} borderRadius="full" px={3} py={1}>
                        {t("clubDashboard.bulk.total", "{{count}} à traiter", { count: allClientsWithoutProgram.length + nutritionDrafts.length + unknownReferentItems.length })}
                      </Badge>
                    </Stack>
                  </Box>
                  <SimpleGrid columns={{ base: 1, xl: 3 }} spacing={4}>
                    {[
                      {
                        title: t("auto.ClubDashboard.clients_sans_programme", "Clients sans programme"),
                        detail: t("clubDashboard.bulk.noProgramDetail", "Ces clients existent dans le club mais n’ont aucun programme assigné. Le but est d’ouvrir leur dossier puis d’ajouter ou assigner un programme."),
                        items: allClientsWithoutProgram,
                        actionLabel: t("clubDashboard.bulk.openClients", "Traiter les clients"),
                        onMainAction: () => openClubView("clients"),
                        itemAction: (item) => openClientAsReferent(item),
                      },
                      {
                        title: t("clubDashboard.alerts.nutritionDrafts.short", "Bilans nutrition à finaliser"),
                        detail: t("clubDashboard.bulk.nutritionDetail", "Ces bilans sont en brouillon ou non partagés. Le but est de les ouvrir, corriger si besoin, puis les valider ou les partager."),
                        items: nutritionDrafts,
                        actionLabel: t("clubDashboard.bulk.openNutrition", "Traiter la nutrition"),
                        onMainAction: () => openClubView("nutrition"),
                        itemAction: (item) => navigate(`/clients/${item.clientId}/nutrition/${item.id}`),
                      },
                      {
                        title: t("clubDashboard.alerts.unknownReferents.short", "Référents à clarifier"),
                        detail: t("clubDashboard.bulk.referentDetail", "Ces éléments sont dans le périmètre club mais le pro responsable n’est pas fiable. Le but est de les rattacher depuis l’audit."),
                        items: unknownReferentItems,
                        actionLabel: t("clubDashboard.bulk.openAudit", "Corriger dans l’audit"),
                        onMainAction: () => navigate(withAdminClub("/club-dashboard/audit")),
                        itemAction: null,
                      },
                    ].map(({ title, detail, items, actionLabel, onMainAction, itemAction }) => (
                      <Box key={title} {...theme.cardProps} p={{ base: 5, md: 6 }}>
                        <HStack justify="space-between" mb={3}>
                          <Heading size="sm">{title}</Heading>
                          <Badge borderRadius="full">{items.length}</Badge>
                        </HStack>
                        <Text color={theme.mutedText} fontSize="sm" minH={{ xl: "72px" }}>{detail}</Text>
                        <Button mt={4} size="sm" {...theme.primaryButtonProps} onClick={onMainAction}>
                          {actionLabel}
                        </Button>
                        <VStack align="stretch" spacing={3} mt={5}>
                          {items.slice(0, 5).map((item) => (
                            <HStack key={`${title}:${item.id}`} justify="space-between" {...theme.tileProps} p={3} gap={3}>
                              <Box minW={0}>
                                <Text fontWeight="800" noOfLines={1}>{item.name || item.clientName || item.title || item.objective || item.id}</Text>
                                <Text color={theme.mutedText} fontSize="xs" noOfLines={1}>{displayCoachName(item.coachName)}</Text>
                              </Box>
                              {itemAction && <Button size="xs" variant="outline" onClick={() => itemAction(item)}>{t("programs.open", "Ouvrir")}</Button>}
                            </HStack>
                          ))}
                          {items.length === 0 && <Text color={theme.mutedText}>{t("clubDashboard.bulk.empty", "Rien à traiter ici.")}</Text>}
                        </VStack>
                      </Box>
                    ))}
                  </SimpleGrid>
                </VStack>
              )}
            </VStack>
          )}

          {showCalendar && (
            <Box {...theme.cardProps} id="club-calendar" data-tour="club-calendar" p={{ base: 5, md: 6 }}>
              <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={4} mb={4}>
                <Box>
                  <Heading size="md">{t("auto.ClubDashboard.calendrier_club", "Calendrier club")}</Heading>
                  <Text color={theme.mutedText} mt={1}>{t("auto.ClubDashboard.vue_agenda_des_rendez_vous_de_l_equipe_proche", "Vue agenda des rendez-vous de l’équipe, proche de l’espace coach.")}</Text>
                </Box>
                <Button leftIcon={<AddIcon />} {...theme.primaryButtonProps} onClick={openCalendarAppointmentModal}>{t("exerciseCard.add", "Ajouter")}</Button>
              </Stack>
              <Stack direction={{ base: "column", md: "row" }} gap={2} mb={4} flexWrap="wrap">
                <Button
                  size="sm"
                  variant={calendarCoachFilter.length === 0 ? "solid" : "outline"}
                  {...(calendarCoachFilter.length === 0 ? theme.primaryButtonProps : {})}
                  onClick={() => setCalendarCoachFilter([])}
                >{t("auto.ClubDashboard.tout_le_monde", "Tout le monde")}</Button>
                  {analysablePros.map((coach) => (
                    <Button
                      key={coach.uid}
                    size="sm"
                    variant={calendarCoachFilter.includes(coach.uid) ? "solid" : "outline"}
                    {...(calendarCoachFilter.includes(coach.uid) ? theme.primaryButtonProps : {})}
                    onClick={() => toggleCalendarCoach(coach.uid)}
                  >
                    {displayName(coach)}
                  </Button>
                ))}
              </Stack>
              <Box
                sx={{
                  ".rbc-calendar": { background: "transparent", color: "inherit", borderRadius: "18px", overflow: "hidden" },
                  ".rbc-toolbar": {
                    background: calendarToolbarBg,
                    padding: "0.9rem",
                    borderRadius: "18px",
                    marginBottom: "14px",
                    border: `1px solid ${calendarGridBorder}`,
                    gap: "8px",
                  },
                  ".rbc-toolbar button": {
                    color: calendarButtonColor,
                    background: calendarButtonBg,
                    border: `1px solid ${calendarGridBorder}`,
                    borderRadius: "14px",
                    padding: "8px 12px",
                    fontWeight: 800,
                  },
                  ".rbc-toolbar button:hover, .rbc-toolbar .rbc-active": {
                    background: calendarActiveBg,
                    color: calendarButtonColor,
                  },
                  ".rbc-toolbar-label": {
                    color: calendarButtonColor,
                    fontWeight: 900,
                  },
                  ".rbc-month-view, .rbc-time-view, .rbc-agenda-view": {
                    border: `1px solid ${calendarGridBorder}`,
                    borderRadius: "20px",
                    overflow: "hidden",
                    background: calendarPanelBg,
                  },
                  ".rbc-header": {
                    background: calendarToolbarBg,
                    borderColor: calendarGridBorder,
                    color: calendarButtonColor,
                    padding: "0.75rem 0.5rem",
                    fontWeight: 900,
                  },
                  ".rbc-month-row, .rbc-day-bg + .rbc-day-bg, .rbc-time-slot + .rbc-time-slot, .rbc-time-header, .rbc-time-content": {
                    borderColor: calendarGridBorder,
                  },
                  ".rbc-date-cell, .rbc-time-gutter, .rbc-agenda-date-cell, .rbc-agenda-time-cell, .rbc-agenda-event-cell": {
                    color: calendarButtonColor,
                  },
                  ".rbc-off-range": { color: theme.subtleText },
                  ".rbc-today": { background: calendarTodayBg },
                  ".rbc-off-range-bg": { background: calendarMutedBg },
                  ".rbc-agenda-table, .rbc-agenda-table tbody > tr > td": {
                    borderColor: calendarGridBorder,
                    color: calendarButtonColor,
                  },
                  ".rbc-event": {
                    borderRadius: "12px",
                    padding: "4px 8px",
                    border: "none",
                    boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                  },
                }}
              >
                  <DnDCalendar
                  localizer={localizer}
                  culture={calendarCulture}
                  formats={calendarFormats}
                  events={filteredCalendarEvents}
                  startAccessor="start"
                  endAccessor="end"
                  style={{ height: 620, borderRadius: 12 }}
                  views={["month", "week", "day", "agenda"]}
                  popup
                  resizable={!isTouchDevice()}
                  onSelectEvent={openAppointmentDetail}
                  onEventDrop={isTouchDevice() ? undefined : moveAppointment}
                  onEventResize={isTouchDevice() ? undefined : moveAppointment}
                  draggableAccessor={(event) => !isTouchDevice() && event?.status !== "validée"}
                  resizableAccessor={(event) => !isTouchDevice() && event?.status !== "validée"}
                  eventPropGetter={(event) => {
                    const normalized = String(event?.status || "").toLowerCase();
                    const bg =
                      normalized === "validée" || normalized === "validee" || normalized === "done"
                        ? "#16A34A"
                        : normalized === "annulée" || normalized === "annulee" || normalized === "cancelled" || normalized === "canceled"
                        ? "#64748B"
                        : normalized === "manquée" || normalized === "manquee"
                        ? "#DC2626"
                        : "#1D4ED8";
                    return {
                      style: {
                        backgroundColor: bg,
                        color: "white",
                        borderRadius: 12,
                        border: "none",
                      },
                    };
                  }}
                  messages={{
                    today: t("calendar.today", "Aujourd’hui"),
                    previous: t("calendar.previous", "Précédent"),
                    next: t("calendar.next", "Suivant"),
                    month: t("calendar.month", "Mois"),
                    week: t("calendar.week", "Semaine"),
                    day: t("calendar.day", "Jour"),
                    agenda: t("calendar.agenda", "Agenda"),
                    noEventsInRange: t("calendar.no_events_in_range", "Aucun rendez-vous sur cette période."),
                    showMore: (total) => t("calendar.show_more", { count: total, defaultValue: `+${total}` }),
                  }}
                />
              </Box>
            </Box>
          )}

          {(showCreate || showTeam) && (
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            {showCreate && (
            <Box {...theme.cardProps} id="club-create" data-tour="club-create" p={{ base: 5, md: 6 }}>
              <Heading size="md" mb={2}>{t("auto.ClubDashboard.ajouter_un_pro_au_club", "Ajouter un pro au club")}</Heading>
              <Text color={theme.mutedText} fontSize="sm" mb={4}>{t("auto.ClubDashboard.ce_formulaire_cree_un_compte_pro_independant_", "Ce formulaire crée un compte pro indépendant, mais payé et contrôlé par l’abonnement du club.")}</Text>
              <Box as="form" onSubmit={createCoach}>
                <VStack align="stretch" spacing={4}>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    <FormControl isRequired>
                      <FormLabel>{t("clientCreation.firstName", "Prénom")}</FormLabel>
                      <Input {...theme.inputProps} value={form.firstName} onChange={(e) => updateForm("firstName", e.target.value)} />
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>{t("contact.fields.name.label", "Nom")}</FormLabel>
                      <Input {...theme.inputProps} value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} />
                    </FormControl>
                  </SimpleGrid>
                  <FormControl isRequired>
                    <FormLabel>{t("auto.ClubDashboard.email_professionnel", "Email professionnel")}</FormLabel>
                    <Input {...theme.inputProps} type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("auto.ClubDashboard.acces_metier", "Accès métier")}</FormLabel>
                    <Select {...theme.inputProps} value={form.proType} onChange={(e) => updateForm("proType", e.target.value)}>
                      <option value="sport">{t("auto.ClubDashboard.coach_sportif", "Coach sportif")}</option>
                      <option value="nutrition">{t("auto.ClubDashboard.dieteticien_nutrition", "Diététicien / nutrition")}</option>
                      <option value="complete">{t("auto.ClubDashboard.coach_nutrition", "Coach + nutrition")}</option>
                    </Select>
                  </FormControl>
                  {proLimitReached && (
                    <Alert status="warning" borderRadius="16px">
                      <AlertIcon />{t("auto.ClubDashboard.capacite_maximale_atteinte", "Capacité maximale atteinte :")}{proLimitUpgradeMessage}
                    </Alert>
                  )}
                  <Button type="submit" {...theme.primaryButtonProps} isLoading={saving} isDisabled={proLimitReached}>{t("auto.ClubDashboard.creer_le_compte_pro", "Créer le compte pro")}</Button>
                </VStack>
              </Box>

              {inviteLink && (
                <Alert data-tour="club-invite" status="info" mt={5} borderRadius="16px" alignItems="start">
                  <AlertIcon mt={1} />
                  <Box>
                    <Text fontWeight="800">{t("auto.ClubDashboard.lien_d_activation_du_pro", "Lien d’activation du pro")}</Text>
                    <Text fontSize="sm" color={theme.mutedText} wordBreak="break-all" mt={1}>
                      {inviteLink}
                    </Text>
                    <Button size="sm" mt={3} onClick={copyInvite}>{t("auto.ClubDashboard.copier_le_lien", "Copier le lien")}</Button>
                  </Box>
                </Alert>
              )}
            </Box>
            )}

            {showTeam && (
            <Box
              {...theme.cardProps}
              id="club-team"
              data-tour="club-team"
              p={{ base: 5, md: 6, xl: 7 }}
              gridColumn={{ lg: showCreate ? "auto" : "1 / -1" }}
            >
              <Heading size="md" mb={4}>{t("auto.ClubDashboard.pros_du_club", "Pros du club")}</Heading>
              {teamPros.length === 0 ? (
                <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucun_pro_rattache_pour_le_moment_creez_le_pr", "Aucun pro rattaché pour le moment. Créez le premier compte pour démarrer le suivi club.")}</Text>
              ) : (
                <Box overflowX={{ base: "auto", lg: "visible" }}>
                  <Table size={{ base: "sm", lg: "md" }} sx={{ tableLayout: { lg: "fixed" } }}>
                    <Thead>
                      <Tr>
                        <Th w={{ lg: "38%" }}>{t("auto.ClubDashboard.pro", "Pro")}</Th>
                        <Th w={{ lg: "12%" }}>{t("dashboard.stats_total_clients", "Clients")}</Th>
                        <Th w={{ lg: "14%" }}>{t("clientsList.table.programs", "Programmes")}</Th>
                        <Th w={{ lg: "16%" }}>{t("nutritionCoach.table.status", "Statut")}</Th>
                        <Th w={{ lg: "20%" }}>{t("nutritionCoach.table.actions", "Actions")}</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {teamPros.map((coach) => (
                        <Tr
                          key={coach.uid}
                          cursor="pointer"
                          bg={selectedCoach?.uid === coach.uid ? "blackAlpha.50" : "transparent"}
                          onClick={() => setSelectedCoachUid(coach.uid)}
                        >
                          <Td>
                            <Text fontWeight="800">{displayName(coach)}</Text>
                            <Text fontSize="xs" color={theme.mutedText}>{coach.email}</Text>
                            <HStack mt={2} spacing={2} flexWrap="wrap">
                              <Badge colorScheme={coach.proType === "nutrition" ? "green" : coach.proType === "complete" ? "purple" : "blue"}>
                                {proTypeLabel(coach.proType)}
                              </Badge>
                              {!coach.isManagedMember && (
                                <Badge colorScheme="orange">
                                  {t("clubDashboard.team.detectedReferent", "Référent détecté")}
                                </Badge>
                              )}
                              {isClubTrial && (
                                <Badge colorScheme={trialRemaining?.days <= 5 ? "orange" : "blue"}>{t("auto.ClubDashboard.essai", "Essai")}{trialRemaining?.days ?? 0}{t("time.days_short", "j")}{trialRemaining?.hours ?? 0}{t("time.hours_short", "h")}</Badge>
                              )}
                            </HStack>
                          </Td>
                          <Td>{coach.clientCount || 0}</Td>
                          <Td>{coach.programCount || 0}</Td>
                          <Td>
                            <Badge colorScheme={!coach.isManagedMember ? "orange" : coach.status === "disabled" ? "red" : "green"}>
                              {!coach.isManagedMember ? t("clubDashboard.team.toAttach", "À rattacher") : coach.status === "disabled" ? "Suspendu" : "Actif"}
                            </Badge>
                          </Td>
                          <Td>
                            <HStack spacing={2} onClick={(event) => event.stopPropagation()}>
                              {coach.isManagedMember && (
                                <Button
                                  size="xs"
                                  variant="outline"
                                  isLoading={actionSaving.includes(coach.uid)}
                                  onClick={() =>
                                    updateCoach(coach, {
                                      status: coach.status === "disabled" ? "active" : "disabled",
                                    })
                                  }
                                >
                                  {coach.status === "disabled" ? "Réactiver" : "Suspendre"}
                                </Button>
                              )}
                              <Button size="xs" variant="ghost" onClick={() => openCoachDetail(coach)}>{t("auto.ClubDashboard.detail", "Détail")}</Button>
                              {coach.isManagedMember && (
                                <IconButton
                                  size="xs"
                                  colorScheme="red"
                                  variant="ghost"
                                  aria-label={`Supprimer ${displayName(coach)} du club`}
                                  icon={<DeleteIcon />}
                                  isLoading={actionSaving === `${coach.uid}:delete`}
                                  onClick={() => deleteCoach(coach)}
                                />
                              )}
                            </HStack>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              )}
            </Box>
            )}
          </SimpleGrid>
          )}

          {showTeam && selectedCoach && (
            <Box {...theme.cardProps} id="club-coach-detail" data-tour="club-coach-detail" p={{ base: 5, md: 6 }}>
              <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={4}>
                <Box>
                  <Badge colorScheme={!selectedCoach.isManagedMember ? "orange" : selectedCoach.status === "disabled" ? "red" : "green"} borderRadius="full" px={3} py={1}>
                    {!selectedCoach.isManagedMember ? t("clubDashboard.team.detectedReferent", "Référent détecté") : selectedCoach.status === "disabled" ? "Suspendu" : "Actif"}
                  </Badge>
                  <Heading size="md" mt={3}>{displayName(selectedCoach)}</Heading>
                  <Text color={theme.mutedText}>{selectedCoach.email || t("clubDashboard.team.noMemberEmail", "Compte pro non rattaché")}</Text>
                  <Text color={theme.mutedText} fontSize="sm" mt={2}>
                    {proTypeLabel(selectedCoach.proType)}
                    {selectedCoach.isManagedMember ? ` ${t("auto.ClubDashboard.cree_le", "· créé le")} ${formatDate(selectedCoach.createdAt)}` : ` · ${t("clubDashboard.team.detectedFromData", "détecté via les données club")}`}
                  </Text>
                </Box>
                <HStack flexWrap="wrap">
                  {selectedCoach.isManagedMember && (
                    <Button variant="outline" onClick={() => planAppointmentForCoach(selectedCoach)}>{t("auto.ClubDashboard.planifier_un_rdv", "Planifier un RDV")}</Button>
                  )}
                  <Button variant="outline" onClick={() => openClubView("clients")}>{t("auto.ClubDashboard.voir_ses_clients", "Voir ses clients")}</Button>
                  {selectedCoach.isManagedMember && (
                    <>
                      <Button
                        variant="outline"
                        isLoading={actionSaving.includes(selectedCoach.uid)}
                        onClick={() =>
                          updateCoach(selectedCoach, {
                            status: selectedCoach.status === "disabled" ? "active" : "disabled",
                          })
                        }
                      >
                        {selectedCoach.status === "disabled" ? "Réactiver" : "Suspendre"}
                      </Button>
                      <IconButton
                        colorScheme="red"
                        variant="outline"
                        aria-label={`Supprimer ${displayName(selectedCoach)} du club`}
                        icon={<DeleteIcon />}
                        isLoading={actionSaving === `${selectedCoach.uid}:delete`}
                        onClick={() => deleteCoach(selectedCoach)}
                      />
                    </>
                  )}
                </HStack>
              </Stack>
              <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mt={5}>
                <Box {...theme.tileProps} p={4}>
                  <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.clients_suivis", "Clients suivis")}</Text>
                  <Text fontSize="2xl" fontWeight="900">{selectedCoach.clientCount || 0}</Text>
                </Box>
                <Box {...theme.tileProps} p={4}>
                  <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.programmes_crees", "Programmes créés")}</Text>
                  <Text fontSize="2xl" fontWeight="900">{selectedCoach.programCount || 0}</Text>
                </Box>
                <Box {...theme.tileProps} p={4}>
                  <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.acces_metier", "Accès métier")}</Text>
                  <Text fontSize="lg" fontWeight="900">{proTypeLabel(selectedCoach.proType)}</Text>
                </Box>
              </SimpleGrid>
            </Box>
          )}

          {showActivity && (
          <Box {...theme.cardProps} id="club-activity" data-tour="club-activity" p={{ base: 5, md: 6 }}>
            <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={5} mb={5}>
              <Box>
                <Heading size="md">{t("clubDashboard.activity.workspace.title", "Vue consolidée")}</Heading>
                <Text color={theme.mutedText} mt={1}>
                  {t("clubDashboard.activity.workspace.subtitle", "Filtrez par référent, comparez les données et ouvrez les dossiers sans passer par la fiche équipe.")}
                </Text>
              </Box>
              <HStack flexWrap="wrap">
                {clubViews.map((view) => (
                  <Button
                    key={view.key}
                    variant={activeView === view.key ? "solid" : "outline"}
                    {...(activeView === view.key ? theme.primaryButtonProps : {})}
                    onClick={() => openClubView(view.key)}
                  >
                    {view.label}
                    <Badge
                      ml={2}
                      borderRadius="full"
                      colorScheme={activeView === view.key ? "whiteAlpha" : "blue"}
                      bg={activeView === view.key ? "whiteAlpha.300" : undefined}
                    >
                      {activityViewCounts[view.key] || 0}
                    </Badge>
                  </Button>
                ))}
              </HStack>
            </Stack>

            <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={4} mb={5}>
              <Box {...theme.tileProps} p={4}>
                <Text fontWeight="900" mb={2}>{t("clubDashboard.filters.pros", "Pros à analyser")}</Text>
                <Text color={theme.mutedText} fontSize="sm">
                  {activityCoachFilter.length
                    ? t("clubDashboard.filters.selectedPros", "{{count}} pro(s) sélectionné(s)", { count: activityCoachFilter.length })
                    : t("clubDashboard.filters.allPros", "Tout le club")}
                </Text>
                <HStack mt={4} spacing={2} flexWrap="wrap">
                  <Menu closeOnSelect={false}>
                    <MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronDownIcon />}>
                      {t("clubDashboard.filters.choosePros", "Choisir un ou plusieurs pros")}
                    </MenuButton>
                    <MenuList minW="260px">
                      <MenuOptionGroup
                        type="checkbox"
                        value={activityCoachFilter}
                        onChange={(value) => setActivityCoachFilter(Array.isArray(value) ? value : [value].filter(Boolean))}
                      >
                        {analysablePros.map((coach) => (
                          <MenuItemOption key={coach.uid} value={coach.uid}>
                            {displayName(coach)}
                          </MenuItemOption>
                        ))}
                      </MenuOptionGroup>
                    </MenuList>
                  </Menu>
                  <Button size="sm" variant="ghost" onClick={() => setActivityCoachFilter([])}>
                    {t("auto.ClubDashboard.voir_tout_le_club", "Voir tout le club")}
                  </Button>
                </HStack>
                {selectedActivityCoaches.length > 0 && (
                  <HStack mt={3} spacing={2} flexWrap="wrap">
                    {selectedActivityCoaches.map((coach) => (
                      <Badge key={coach.uid} borderRadius="full" colorScheme="blue">
                        {displayName(coach)}
                      </Badge>
                    ))}
                  </HStack>
                )}
              </Box>

              <Box {...theme.tileProps} p={4}>
                <Text fontWeight="900" mb={3}>{t("dashboard.recent_clients", "Clients récents")}</Text>
                <VStack align="stretch" spacing={2}>
                  {scopedClients.slice(0, 5).map((client) => (
                    <HStack key={client.id} justify="space-between" align="start">
                      <Box minW={0}>
                        <Text fontWeight="800" fontSize="sm" noOfLines={1}>{client.name}</Text>
                        <Text color={theme.mutedText} fontSize="xs">{formatDate(client.activityAt)}</Text>
                      </Box>
                      <Badge>{client.coachName}</Badge>
                    </HStack>
                  ))}
                  {scopedClients.length === 0 && (
                    <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.aucun_client_recent", "Aucun client récent.")}</Text>
                  )}
                </VStack>
              </Box>

              <Box {...theme.tileProps} p={4}>
                <Text fontWeight="900" mb={3}>{t("auto.ClubDashboard.programmes_recents", "Programmes récents")}</Text>
                <VStack align="stretch" spacing={2}>
                  {scopedPrograms.slice(0, 5).map((program) => (
                    <HStack key={program.id} justify="space-between" align="start">
                      <Box minW={0}>
                        <Text fontWeight="800" fontSize="sm" noOfLines={1}>{program.title}</Text>
                        <Text color={theme.mutedText} fontSize="xs">{formatDate(program.activityAt)}</Text>
                      </Box>
                      <Badge>{program.coachName}</Badge>
                    </HStack>
                  ))}
                  {scopedPrograms.length === 0 && (
                    <Text color={theme.mutedText} fontSize="sm">{t("auto.ClubDashboard.aucun_programme_recent", "Aucun programme récent.")}</Text>
                  )}
                </VStack>
              </Box>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, sm: 2, xl: 5 }} spacing={4} mb={5}>
              {[
                {
                  key: "clients",
                  label: t("clubDashboard.activity.metrics.clients", "Clients"),
                  value: scopedClients.length,
                  helper: activeCoachFilterSet.size
                    ? t("clubDashboard.activity.metrics.filtered", "Dans le filtre sélectionné")
                    : t("clubDashboard.activity.metrics.wholeClub", "Sur tout le club"),
                },
                {
                  key: "programs",
                  label: t("clubDashboard.activity.metrics.programs", "Programmes"),
                  value: scopedPrograms.length,
                  helper: t("clubDashboard.activity.metrics.programsHelp", "Créés ou assignés par les pros affichés"),
                },
                {
                  key: "nutrition",
                  label: t("clubDashboard.activity.metrics.nutrition", "Suivis nutrition"),
                  value: scopedNutrition.length,
                  helper: t("clubDashboard.activity.metrics.nutritionClients", "{{count}} client(s) avec un suivi nutrition", { count: scopedNutritionClientCount }),
                },
                {
                  key: "sessions",
                  label: t("clubDashboard.activity.metrics.sessions", "Séances réalisées"),
                  value: scopedSessions.length,
                  helper: t("clubDashboard.activity.metrics.sessionsHelp", "Sessions validées ou terminées avec un client"),
                },
                {
                  key: "stats",
                  label: t("clubDashboard.activity.metrics.periodActivity", "Activité période"),
                  value: periodClients.length + periodPrograms.length + periodNutrition.length + periodSessions.length,
                  helper: t("clubDashboard.activity.metrics.periodHelp", "Selon la période statistiques active"),
                },
              ].map((metric) => {
                const isActiveMetric = activeView === metric.key;
                return (
                  <Box
                    key={metric.key}
                    {...theme.tileProps}
                    p={4}
                    borderColor={isActiveMetric ? "blue.400" : theme.borderColor}
                    boxShadow={isActiveMetric ? "0 18px 36px rgba(17, 58, 99, 0.12)" : theme.tileProps.boxShadow}
                  >
                    <HStack justify="space-between" align="start" gap={3}>
                      <Box minW={0}>
                        <Text color={theme.mutedText} fontSize="sm">{metric.label}</Text>
                        <Text fontSize="2xl" fontWeight="900">{metric.value}</Text>
                      </Box>
                      {isActiveMetric && (
                        <Badge borderRadius="full" colorScheme="blue">
                          {t("clubDashboard.activity.metrics.active", "Actif")}
                        </Badge>
                      )}
                    </HStack>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>{metric.helper}</Text>
                  </Box>
                );
              })}
            </SimpleGrid>

            <Box {...theme.tileProps} p={{ base: 4, md: 5 }} overflowX="auto">
              {activeView === "clients" && (
                <>
                  <HStack justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
                    <Heading size="sm">{t("auto.ClubDashboard.clients_du_club", "Clients du club")}</Heading>
                    <Badge borderRadius="full" px={3} py={1}>{t("clubDashboard.activity.visibleCount", "{{count}} affiché(s)", { count: activeActivityCount })}</Badge>
                  </HStack>
                  {scopedClients.length === 0 ? (
                    <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucun_client_dans_ce_perimetre", "Aucun client dans ce périmètre.")}</Text>
                  ) : (
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>{t("clientsList.table.client", "Client")}</Th>
                          <Th>{t("auto.ClubDashboard.pro_referent", "Pro référent")}</Th>
                          <Th>{t("clientsList.table.programs", "Programmes")}</Th>
                          <Th>{t("clientsList.table.progress", "Progression")}</Th>
                          <Th>{t("clientView.lastActivity", "Dernière activité")}</Th>
                          <Th>{t("nutritionCoach.table.actions", "Actions")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {scopedClients.slice(0, 20).map((client) => (
                          <Tr key={client.id}>
                            <Td>
                              <Text fontWeight="800">{client.name}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{client.email}</Text>
                            </Td>
                            <Td>{client.coachName}</Td>
                            <Td>{client.programCount || 0}</Td>
                            <Td>{Number.isFinite(Number(client.completionPercent)) ? `${Math.round(Number(client.completionPercent))}%` : "0%"}</Td>
                            <Td>{formatDate(client.activityAt)}</Td>
                            <Td>
                              <Button size="xs" variant="outline" onClick={() => openClientAsReferent(client)}>{t("auto.ClubDashboard.ouvrir_assigner", "Ouvrir / assigner")}</Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </>
              )}

              {activeView === "programs" && (
                <>
                  <HStack justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
                    <Heading size="sm">{t("auto.ClubDashboard.programmes_du_club", "Programmes du club")}</Heading>
                    <Badge borderRadius="full" px={3} py={1}>{t("clubDashboard.activity.visibleCount", "{{count}} affiché(s)", { count: activeActivityCount })}</Badge>
                  </HStack>
                  {scopedPrograms.length === 0 ? (
                    <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucun_programme_dans_ce_perimetre", "Aucun programme dans ce périmètre.")}</Text>
                  ) : (
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>{t("sessionPlayer.program", "Programme")}</Th>
                          <Th>{t("clientsList.table.client", "Client")}</Th>
                          <Th>{t("auto.ClubDashboard.cree_par", "Créé par")}</Th>
                          <Th>{t("clientView.lastActivity", "Dernière activité")}</Th>
                          <Th>{t("nutritionCoach.table.actions", "Actions")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {scopedPrograms.slice(0, 20).map((program) => (
                          <Tr key={program.id}>
                            <Td fontWeight="800">{program.title}</Td>
                            <Td>{program.clientName || "Bibliothèque pro"}</Td>
                            <Td>{program.coachName}</Td>
                            <Td>{formatDate(program.activityAt)}</Td>
                            <Td>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() =>
                                  navigate(
                                    program.clientId && program.programId
                                      ? `/clients/${program.clientId}/programmes/${program.programId}`
                                      : `/programmes/${program.id}`
                                  )
                                }
                              >{t("programs.open", "Ouvrir")}</Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </>
              )}

              {activeView === "nutrition" && (
                <>
                  <HStack justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
                    <Heading size="sm">{t("auto.ClubDashboard.nutrition_du_club", "Nutrition du club")}</Heading>
                    <Badge borderRadius="full" px={3} py={1}>{t("clubDashboard.activity.visibleCount", "{{count}} affiché(s)", { count: activeActivityCount })}</Badge>
                  </HStack>
                  {scopedNutrition.length === 0 ? (
                    <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucun_bilan_nutrition_trouve_dans_ce_perimetr", "Aucun bilan nutrition trouvé dans ce périmètre.")}</Text>
                  ) : (
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>{t("auto.ClubDashboard.bilan", "Bilan")}</Th>
                          <Th>{t("clientsList.table.client", "Client")}</Th>
                          <Th>{t("auto.ClubDashboard.pro", "Pro")}</Th>
                          <Th>{t("nutritionCoach.table.status", "Statut")}</Th>
                          <Th>{t("nutritionCoach.table.actions", "Actions")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {scopedNutrition.slice(0, 20).map((assessment) => (
                          <Tr key={`${assessment.clientId}:${assessment.id}`}>
                            <Td>
                              <Text fontWeight="800">{assessment.objective}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{formatDate(assessment.activityAt)}</Text>
                            </Td>
                            <Td>{assessment.clientName}</Td>
                            <Td>{assessment.coachName}</Td>
                            <Td><Badge>{assessment.status}</Badge></Td>
                            <Td>
                              <Button size="xs" variant="outline" onClick={() => navigate(`/clients/${assessment.clientId}/nutrition/${assessment.id}`)}>{t("programs.open", "Ouvrir")}</Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  )}
                </>
              )}

              {activeView === "stats" && (
                <>
                  <HStack justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
                    <Heading size="sm">{t("auto.ClubDashboard.statistiques_club", "Statistiques club")}</Heading>
                    <Badge borderRadius="full" px={3} py={1}>{t("clubDashboard.activity.visibleCount", "{{count}} affiché(s)", { count: activeActivityCount })}</Badge>
                  </HStack>
                  <SimpleGrid columns={{ base: 1, md: 2, xl: 5 }} spacing={4}>
                    {[
                      [t("clubDashboard.stats.periodActivity", "Activité période"), periodClients.length + periodPrograms.length + periodNutrition.length + periodSessions.length, `${periodClients.length} client(s), ${periodPrograms.length} programme(s), ${periodNutrition.length} bilan(s), ${periodSessions.length} séance(s)`],
                      [t("auto.ClubDashboard.pros_actifs", "Pros actifs"), stats.activeCoachCount || 0, `${stats.proCount || 0} pro(s) rattaché(s) au total`],
                      [t("auto.ClubDashboard.clients_suivis", "Clients suivis"), scopedClients.length, clientUsage !== null ? `${clientUsage}% de la capacité utilisée` : "Tous pros confondus"],
                      [t("clientsList.table.programs", "Programmes"), scopedPrograms.length, t("clubDashboard.stats.programsHelp", "Créés ou assignés par l’équipe du club")],
                      [t("clubDashboard.stats.sessionsPlayed", "Séances réalisées"), scopedSessions.length, t("clubDashboard.stats.sessionsPlayedHelp", "Sessions validées ou terminées avec un client")],
                    ].map(([label, value, helper]) => (
                      <Box key={label} {...theme.tileProps} p={4}>
                        <Text color={theme.mutedText} fontSize="sm">{label}</Text>
                        <Text fontSize="2xl" fontWeight="900">{value}</Text>
                        <Text color={theme.mutedText} fontSize="sm">{helper}</Text>
                      </Box>
                    ))}
                  </SimpleGrid>
                  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4} mt={4}>
                    <Box {...theme.tileProps} p={4}>
                      <Text fontWeight="900" mb={3}>{t("clubDashboard.stats.comparePros", "Comparer les pros")}</Text>
                      <VStack align="stretch" spacing={2}>
                        {coachComparisonRows.map((coach) => (
                          <Box key={coach.uid} borderBottom="1px solid" borderColor={theme.borderColor} pb={2}>
                            <HStack justify="space-between" gap={3}>
                            <Box minW={0}>
                              <Text fontWeight="800" noOfLines={1}>{displayName(coach)}</Text>
                              <Text color={theme.mutedText} fontSize="xs">
                                {proTypeLabel(coach.proType)} · {coach.status === "disabled" ? t("common.suspended", "Suspendu") : t("common.active", "Actif")}
                              </Text>
                            </Box>
                            <Badge borderRadius="full">
                              {coach.score} {t("clubDashboard.stats.actions", "action(s)")}
                            </Badge>
                            </HStack>
                            <SimpleGrid columns={{ base: 2, md: 4 }} spacing={2} mt={2}>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodClientCount} client(s)</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodProgramCount} {t("clubDashboard.stats.programsShort", "prog. créés")}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodNutritionCount} nutrition</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodSessionCount} {t("clubDashboard.stats.sessionsShort", "séance(s)")}</Text>
                            </SimpleGrid>
                          </Box>
                        ))}
                        {coachComparisonRows.length === 0 && <Text color={theme.mutedText}>{t("auto.ClubDashboard.aucun_pro_pour_le_moment", "Aucun pro pour le moment.")}</Text>}
                      </VStack>
                    </Box>
                    <Box {...theme.tileProps} p={4}>
                      <Text fontWeight="900" mb={3}>{t("auto.ClubDashboard.periodes_a_analyser", "Périodes à analyser")}</Text>
                      <SimpleGrid columns={{ base: 1, sm: 3 }} spacing={2}>
                        {[
                          ["day", t("clubDashboard.periods.day", "Journalier")],
                          ["month", t("clubDashboard.periods.month", "Mensuel")],
                          ["year", t("clubDashboard.periods.year", "Annuel")],
                        ].map(([period, label]) => (
                          <Button
                            key={period}
                            variant={statsPeriod === period ? "solid" : "outline"}
                            {...(statsPeriod === period ? theme.primaryButtonProps : {})}
                            onClick={() => setStatsPeriod(period)}
                          >
                            {label}
                          </Button>
                        ))}
                      </SimpleGrid>
                      <Text color={theme.mutedText} mt={3} fontSize="sm">
                        {t("clubDashboard.stats.periodHelp", "Les chiffres se recalculent selon la période et le filtre pro sélectionnés.")}
                      </Text>
                    </Box>
                  </SimpleGrid>
                </>
              )}
            </Box>
          </Box>
          )}
        </VStack>
      </Container>
      <Modal isOpen={proLimitModal.isOpen} onClose={closeProLimitModal} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="24px">
          <ModalHeader>{t("auto.ClubDashboard.limite_de_pros_atteinte", "Limite de pros atteinte")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontWeight="800">{t("auto.ClubDashboard.votre_pack_permet", "Votre pack permet")} {limits.proLimit || 0} {t("auto.ClubDashboard.pro_2", "pro")}{limits.proLimit > 1 ? "s" : ""}{t("auto.ClubDashboard.vous_avez_atteint_cette_capacite", ". Vous avez atteint cette capacité.")}</Text>
            <Text color={theme.mutedText} mt={3}>
              {proLimitUpgradeMessage}
            </Text>
          </ModalBody>
          <ModalFooter gap={3} flexWrap="wrap">
            <Button variant="ghost" onClick={closeProLimitModal}>{t("auto.ClubDashboard.plus_tard", "Plus tard")}</Button>
            <Button
              {...theme.primaryButtonProps}
              onClick={() => {
                closeProLimitModal();
                if (isNetworkClubPack) {
                  navigate("/contact");
                  return;
                }
                navigate("/plans/professionnel");
              }}
            >
              {isNetworkClubPack ? "Contacter BYL" : "Voir les packs"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={inviteProModal.isOpen} onClose={inviteProModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="22px">
          <ModalHeader>{t("auto.ClubDashboard.inviter_un_pro", "Inviter un pro")}</ModalHeader>
          <ModalCloseButton />
          <Box as="form" onSubmit={createCoach}>
            <ModalBody>
              <VStack align="stretch" spacing={4}>
                <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                  <FormControl isRequired>
                    <FormLabel>{t("clientCreation.firstName", "Prénom")}</FormLabel>
                    <Input {...theme.inputProps} value={form.firstName} onChange={(e) => updateForm("firstName", e.target.value)} />
                  </FormControl>
                  <FormControl isRequired>
                    <FormLabel>{t("contact.fields.name.label", "Nom")}</FormLabel>
                    <Input {...theme.inputProps} value={form.lastName} onChange={(e) => updateForm("lastName", e.target.value)} />
                  </FormControl>
                </SimpleGrid>
                <FormControl isRequired>
                  <FormLabel>{t("auto.ClubDashboard.email_professionnel", "Email professionnel")}</FormLabel>
                  <Input {...theme.inputProps} type="email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("auto.ClubDashboard.acces_metier", "Accès métier")}</FormLabel>
                  <Select {...theme.inputProps} value={form.proType} onChange={(e) => updateForm("proType", e.target.value)}>
                    <option value="sport">{t("auto.ClubDashboard.coach_sportif", "Coach sportif")}</option>
                    <option value="nutrition">{t("auto.ClubDashboard.dieteticien_nutrition", "Diététicien / nutrition")}</option>
                    <option value="complete">{t("auto.ClubDashboard.coach_nutrition", "Coach + nutrition")}</option>
                  </Select>
                </FormControl>
                {inviteLink && (
                  <Alert status="info" borderRadius="16px" alignItems="start">
                    <AlertIcon mt={1} />
                    <Box>
                      <Text fontWeight="800">{t("auto.ClubDashboard.lien_d_activation_du_pro", "Lien d’activation du pro")}</Text>
                      <Text fontSize="sm" color={theme.mutedText} wordBreak="break-all" mt={1}>{inviteLink}</Text>
                      <Button size="sm" mt={3} onClick={copyInvite}>{t("auto.ClubDashboard.copier_le_lien", "Copier le lien")}</Button>
                    </Box>
                  </Alert>
                )}
              </VStack>
            </ModalBody>
            <ModalFooter gap={3}>
              <Button variant="ghost" onClick={inviteProModal.onClose}>{t("auto.ClubDashboard.plus_tard", "Plus tard")}</Button>
              <Button type="submit" {...theme.primaryButtonProps} isLoading={saving} isDisabled={proLimitReached}>
                {t("auto.ClubDashboard.creer_le_compte_pro", "Créer le compte pro")}
              </Button>
            </ModalFooter>
          </Box>
        </ModalContent>
      </Modal>
      <Modal isOpen={appointmentDetailModal.isOpen} onClose={appointmentDetailModal.onClose} isCentered size="lg">
        <ModalOverlay />
        <ModalContent borderRadius="22px">
          <ModalHeader>{t("clubDashboard.calendar.eventDetails", "Rendez-vous club")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack align="stretch" spacing={4}>
              <Box {...theme.tileProps} p={4}>
                <HStack justify="space-between" gap={3} align="start">
                  <Box minW={0}>
                    <Text fontWeight="900" noOfLines={2}>{selectedAppointment?.title || t("auto.ClubDashboard.rendez_vous", "Rendez-vous")}</Text>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {formatShortDateTime(selectedAppointment?.start)} · {selectedAppointment?.durationMin || 60} min
                    </Text>
                    <Text color={theme.mutedText} fontSize="sm" mt={1}>
                      {selectedAppointment?.coachName || t("clubDashboard.empty.noPro", "Aucun pro")}
                      {selectedAppointment?.clientName ? ` · ${selectedAppointment.clientName}` : ""}
                    </Text>
                  </Box>
                  <Badge borderRadius="full" colorScheme={selectedAppointment?.status === "validée" ? "green" : selectedAppointment?.status === "annulée" ? "gray" : selectedAppointment?.status === "manquée" ? "red" : "blue"}>
                    {selectedAppointment?.status || t("status.upcoming", "À venir")}
                  </Badge>
                </HStack>
              </Box>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                <FormControl>
                  <FormLabel>{t("auto.ClubDashboard.titre", "Titre")}</FormLabel>
                  <Input {...theme.inputProps} value={appointmentEditForm.title} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, title: e.target.value }))} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("nutritionCoach.table.status", "Statut")}</FormLabel>
                  <Select {...theme.inputProps} value={appointmentEditForm.status} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, status: e.target.value }))}>
                    <option value="à venir">{t("status.upcoming", "À venir")}</option>
                    <option value="validée">{t("status.validated", "Validée")}</option>
                    <option value="manquée">{t("status.missed", "Manquée")}</option>
                    <option value="annulée">{t("common.cancelled", "Annulée")}</option>
                  </Select>
                </FormControl>
                <FormControl>
                  <FormLabel>{t("form.datetime", "Date et heure")}</FormLabel>
                  <Input {...theme.inputProps} type="datetime-local" value={appointmentEditForm.startsAt} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, startsAt: e.target.value }))} />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("labels.duration", "Durée")}</FormLabel>
                  <Select {...theme.inputProps} value={appointmentEditForm.durationMin} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, durationMin: Number(e.target.value) }))}>
                    {APPOINTMENT_DURATIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 60 ? "1 heure" : `${minutes} minutes`}
                      </option>
                    ))}
                  </Select>
                </FormControl>
              </SimpleGrid>
              <FormControl>
                <FormLabel>{t("auto.ClubDashboard.note_interne", "Note interne")}</FormLabel>
                <Textarea {...theme.inputProps} value={appointmentEditForm.note} rows={3} onChange={(e) => setAppointmentEditForm((current) => ({ ...current, note: e.target.value }))} />
              </FormControl>

              <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={2}>
                <Button
                  colorScheme="green"
                  variant="outline"
                  isLoading={actionSaving === `appointment:${selectedAppointment?.id}`}
                  onClick={() => updateAppointment(selectedAppointment, { status: "validée" }, { close: true })}
                >
                  {t("common.validate", "Valider")}
                </Button>
                <Button
                  variant="outline"
                  isLoading={actionSaving === `appointment:${selectedAppointment?.id}`}
                  onClick={() => updateAppointment(selectedAppointment, { status: "annulée" }, { close: true })}
                >
                  {t("common.cancel", "Annuler")}
                </Button>
                <Button
                  colorScheme="red"
                  variant="outline"
                  isLoading={actionSaving === `appointment:${selectedAppointment?.id}`}
                  onClick={() => updateAppointment(selectedAppointment, { status: "manquée" }, { close: true })}
                >
                  {t("common.missed", "Manquée")}
                </Button>
                <Button
                  colorScheme="red"
                  variant="ghost"
                  isLoading={actionSaving === `appointment:${selectedAppointment?.id}:delete`}
                  onClick={deleteAppointment}
                >
                  {t("common.delete", "Supprimer")}
                </Button>
              </SimpleGrid>
            </VStack>
          </ModalBody>
          <ModalFooter gap={3}>
            <Button variant="ghost" onClick={appointmentDetailModal.onClose}>{t("exerciseCard.cancel", "Fermer")}</Button>
            <Button {...theme.primaryButtonProps} isLoading={actionSaving === `appointment:${selectedAppointment?.id}`} onClick={saveAppointmentEdit}>
              {t("programBuilder.cta.saveShort", "Enregistrer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      <Modal isOpen={isAddAppointmentModalOpen} onClose={closeCalendarAppointmentModal} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="22px" mx={{ base: 3, md: 0 }}>
          <ModalHeader>{t("auto.ClubDashboard.ajouter_un_evenement_club", "Ajouter un évènement club")}</ModalHeader>
          <IconButton
            type="button"
            icon={<CloseIcon />}
            top={4}
            right={4}
            boxSize="44px"
            position="absolute"
            zIndex={2}
            borderRadius="full"
            border="1px solid"
            borderColor={theme.borderColor}
            bg={theme.surfaceBg}
            color={theme.textColor}
            _hover={{ bg: theme.surfaceSoft }}
            aria-label={t("exerciseCard.cancel", "Fermer")}
            onClick={closeCalendarAppointmentModal}
          />
          <Box as="form" onSubmit={createAppointment}>
            <ModalBody>
              <VStack align="stretch" spacing={4}>
                <FormControl isRequired>
                  <FormLabel>{t("auto.ClubDashboard.pro_concerne", "Pro concerné")}</FormLabel>
                  <Select
                    {...theme.inputProps}
                    value={appointmentForm.coachUid}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, coachUid: e.target.value, clientId: "", programId: "", sessionIndex: "" }))}
                  >
                    <option value="">{t("auto.ClubDashboard.selectionner_un_pro", "Sélectionner un pro")}</option>
                    {analysablePros.filter((coach) => coach.uid && coach.uid !== "__unknown__").map((coach) => (
                      <option key={coach.uid} value={coach.uid}>
                        {displayName(coach)}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{t("auto.CoachDashboard.type_de_rendez_vous", "Type de rendez-vous")}</FormLabel>
                  <Select
                    {...theme.inputProps}
                    value={appointmentForm.type}
	                    onChange={(e) => {
	                      const nextType = e.target.value;
	                      setAppointmentForm((current) => ({
	                        ...current,
	                        type: nextType,
	                        clientId: nextType === "internal" ? "" : current.clientId,
	                        programId: "",
	                        sessionIndex: "",
	                        appointmentKind: nextType === "internal" ? "internal" : nextType === "nutrition" ? "suivi" : "",
	                        title: nextType === "internal" ? t("clubDashboard.calendar.internalEvent", "Évènement interne") : "",
	                        durationMin: nextType === "nutrition" ? 30 : 60,
	                      }));
	                    }}
	                  >
	                    <option value="sport">{t("auto.CoachDashboard.sport", "Sport")}</option>
	                    <option value="nutrition">{t("nutrition.title", "Nutrition")}</option>
	                    <option value="internal">{t("clubDashboard.calendar.internalEvent", "Évènement interne")}</option>
	                  </Select>
	                </FormControl>
	                {appointmentForm.type !== "internal" && (
	                <FormControl>
	                  <FormLabel>{t("clubDashboard.calendar.client", "Client concerné")}</FormLabel>
	                  <Select
	                    {...theme.inputProps}
                    value={appointmentForm.clientId}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, clientId: e.target.value, programId: "", sessionIndex: "" }))}
                    isDisabled={!appointmentForm.coachUid}
                  >
                    <option value="">
                      {appointmentForm.coachUid
                        ? t("clubDashboard.calendar.noClient", "Aucun client, évènement interne")
                        : t("clubDashboard.calendar.selectProFirst", "Sélectionnez d’abord un pro")}
                    </option>
                    {appointmentClientOptions.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name || client.email || client.id}
                      </option>
                    ))}
                  </Select>
	                  <Text color={theme.mutedText} fontSize="xs" mt={2}>
	                    {t("clubDashboard.calendar.clientVisibilityHelp", "Avec un client sélectionné, le rendez-vous apparaît aussi dans le calendrier du coach et du client.")}
	                  </Text>
	                </FormControl>
	                )}
                {appointmentForm.clientId && appointmentForm.type === "sport" && (
                  <>
                    <FormControl isRequired>
                      <FormLabel>{t("form.program", "Programme")}</FormLabel>
                      <Select
                        {...theme.inputProps}
                        value={appointmentForm.programId}
                        onChange={(e) => setAppointmentForm((current) => ({ ...current, programId: e.target.value, sessionIndex: "", title: "" }))}
                      >
                        <option value="">{t("form.select_program", "Choisir un programme")}</option>
                        {appointmentProgramOptions.map((program) => (
                          <option key={program.programId || program.id} value={program.programId || program.id}>
                            {program.title}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl isRequired>
                      <FormLabel>{t("form.session", "Séance")}</FormLabel>
                      <Select
                        {...theme.inputProps}
                        value={appointmentForm.sessionIndex}
                        onChange={(e) => {
                          const index = e.target.value;
                          const session = appointmentSessionOptions[Number(index)];
                          setAppointmentForm((current) => ({
                            ...current,
                            sessionIndex: index,
                            title: session ? getSessionLabel(session, Number(index)) : current.title,
                          }));
                        }}
                        isDisabled={!appointmentForm.programId}
                      >
                        <option value="">{t("form.select_session", "Choisir une séance")}</option>
                        {appointmentSessionOptions.map((session, index) => (
                          <option key={index} value={index}>
                            {getSessionLabel(session, index)}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}
                {appointmentForm.type === "nutrition" && (
                  <FormControl isRequired>
                    <FormLabel>{t("auto.CoachDashboard.rendez_vous_nutrition", "Rendez-vous nutrition")}</FormLabel>
                    <Select
                      {...theme.inputProps}
                      value={appointmentForm.appointmentKind}
                      onChange={(e) => {
                        const nextKind = e.target.value;
                        const label = NUTRITION_APPOINTMENT_TYPES.find((item) => item.value === nextKind)?.label || "";
                        setAppointmentForm((current) => ({ ...current, appointmentKind: nextKind, title: label }));
                      }}
                    >
                      {NUTRITION_APPOINTMENT_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <FormControl>
                  <FormLabel>{t("auto.ClubDashboard.titre", "Titre")}</FormLabel>
                  <Input
                    {...theme.inputProps}
                    value={appointmentForm.title}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, title: e.target.value }))}
                    placeholder={t("auto.ClubDashboard.bilan_seance_point_suivi", "Bilan, séance, point suivi...")}
                  />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{t("labels.duration", "Durée")}</FormLabel>
                  <Select
                    {...theme.inputProps}
                    value={appointmentForm.durationMin}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, durationMin: Number(e.target.value) }))}
                  >
                    {APPOINTMENT_DURATIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes === 60 ? "1 heure" : `${minutes} minutes`}
                      </option>
                    ))}
                  </Select>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{t("form.datetime", "Date et heure")}</FormLabel>
                  <Input
                    {...theme.inputProps}
                    type="datetime-local"
                    value={appointmentForm.startsAt}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, startsAt: e.target.value }))}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{t("auto.ClubDashboard.note_interne", "Note interne")}</FormLabel>
                  <Textarea
                    {...theme.inputProps}
                    value={appointmentForm.note}
                    onChange={(e) => setAppointmentForm((current) => ({ ...current, note: e.target.value }))}
                    placeholder={t("auto.ClubDashboard.objectif_du_rendez_vous_consignes_contexte", "Objectif du rendez-vous, consignes, contexte...")}
                  />
                </FormControl>
              </VStack>
            </ModalBody>
            <ModalFooter gap={3}>
              <Button type="button" variant="ghost" onClick={closeCalendarAppointmentModal}>
                {t("exerciseCard.cancel", "Fermer")}
              </Button>
              <Button type="submit" {...theme.primaryButtonProps} isLoading={actionSaving === "appointment"}>{t("exerciseCard.add", "Ajouter")}</Button>
            </ModalFooter>
          </Box>
        </ModalContent>
      </Modal>
    </Box>
  );
}
