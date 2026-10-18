import SessionCancellationRequests from '../components/dashboard/SessionCancellationRequests';
import TutorialSettingsPanel from '../components/TutorialSettingsPanel';
const ClubClientImport = React.lazy(() => import("../components/dashboard/ClubClientImport"));
import useClubUnreadCount from '../components/messaging/useClubUnreadCount';
import { eventLastPacks } from "../utils/lastPackSession.mjs";
import StableCalendar from "../components/calendar/StableCalendar";
import ClubCalendarConnect from "../components/dashboard/ClubCalendarConnect";
import ClubAppointmentDialog from '../components/dashboard/ClubAppointmentDialog';
import { clubText, clubLocale } from "../i18n/clubText";
import { ClubSubscriptionPlans, ClubPaymentTasks } from "../components/dashboard/ClubSubscriptions";
import CalendarValidationMark from "../components/calendar/CalendarValidationMark";
import { calendarEventAppearance, calendarEventStatusKey } from "../utils/calendarEventAppearance.mjs";
import ClubPlanningDownload from "../components/dashboard/ClubPlanningDownload";
import FormerClubClients from "../components/dashboard/FormerClubClients";
import useSessionDraft from "../hooks/useSessionDraft";
import ClubRegistrationSettings from "../components/dashboard/ClubRegistrationSettings";
import ClubCalendarSlotHint from "../components/dashboard/ClubCalendarSlotHint";
import ClubCalendarEventPreview from "../components/dashboard/ClubCalendarEventPreview";
import ClubGroupFields from "../components/dashboard/ClubGroupFields";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Portal,
  Select,
  SimpleGrid,
  Stack,
  Tabs, Tab, TabList, TabPanels, TabPanel,
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
  MenuItem,
  MenuDivider,
  MenuOptionGroup,
  MenuItemOption,
} from "@chakra-ui/react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { AddIcon, ArrowBackIcon, ChevronDownIcon, CloseIcon, DeleteIcon, TimeIcon } from "@chakra-ui/icons";
import { momentLocalizer } from "react-big-calendar";
import dragAndDropAddon from "react-big-calendar/lib/addons/dragAndDrop";
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

import i18n, { ensureLanguageLoaded } from "../i18n/index";
import { clubCoachKey, clubCoachColors } from "../utils/clubCalendarColors.mjs";
import { getCalendarCulture, getCalendarFormats, getCalendarAgendaMessages } from "../utils/calendarLocale";
import { useAppTheme } from "../styles/appTheme";
import AppLoading from "../components/ui/AppLoading";
import ClubActivityTrend from "../components/dashboard/ClubActivityTrend";
import ClubLogo from "../components/dashboard/ClubLogo";
import ClubMobileCalendar from "../components/dashboard/ClubMobileCalendar";
import ClubMessagingPanel from "../components/messaging/ClubMessagingPanel";
import EmailNotificationPreferenceCard from "../components/EmailNotificationPreferenceCard";
import { useAuth } from "../AuthContext";
import { MdLanguage, MdOutlineCreditCard, MdOutlineLock, MdOutlineChat, MdFilterList } from "react-icons/md";
import { resolveDragAndDropFactory } from "../utils/reactBigCalendarDnd";

// Keep month boundaries and week views aligned with the coach calendar in every language.
["fr", "en", "de", "it", "es", "ru", "ar"].forEach((locale) => {
  moment.updateLocale(locale, { week: { dow: 1, doy: 4 } });
});
moment.locale("fr");
const localizer = momentLocalizer(moment);
localizer.startOfWeek = () => 1;
const withDragAndDrop = resolveDragAndDropFactory(dragAndDropAddon);
const DnDCalendar = withDragAndDrop ? withDragAndDrop(StableCalendar) : StableCalendar;
const formatCalendarTime = date => {
  const locale = i18n.language || i18n.resolvedLanguage || "fr";
  if (locale.startsWith("fr")) return `${date.getHours()} h${date.getMinutes() ? ` ${String(date.getMinutes()).padStart(2, "0")}` : ""}`;
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", hour12: locale.startsWith("en") }).format(date);
};
const formatCalendarSlotTime = date => new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr", { hour: "2-digit", minute: "2-digit" }).format(date);
const formatCalendarTimeRange = ({ start, end }) => `${formatCalendarTime(start)} – ${formatCalendarTime(end)}`;
const calendarFormats = {
  timeGutterFormat: formatCalendarTime,
  eventTimeRangeFormat: formatCalendarTimeRange,
  agendaTimeFormat: formatCalendarTime,
  agendaTimeRangeFormat: formatCalendarTimeRange,
  eventTimeRangeStartFormat: ({ start }) => `${formatCalendarTime(start)} –`,
  eventTimeRangeEndFormat: ({ end }) => `– ${formatCalendarTime(end)}`,

  monthHeaderFormat: (date) =>
    new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { month: "long", year: "numeric" }).format(date),
  weekdayFormat: (date) =>
    new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { weekday: "short" }).format(date).replace(".", ""),
  dayHeaderFormat: (date) =>
    new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { weekday: "long", day: "2-digit", month: "long" }).format(date),
  dayRangeHeaderFormat: ({ start, end }) =>
    `${new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { day: "2-digit", month: "short" }).format(start)} - ${new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(end)}`,
  agendaHeaderFormat: ({ start, end }) =>
    `${new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { day: "2-digit", month: "short" }).format(start)} - ${new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(end)}`,
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
  if(value==="Non attribué")return clubText("Non attribué");
  if (!value || value === "Pro") return i18n.t("clubDashboard.filters.unknownPro", clubText("Référent non identifié"));
  return value;
}

function formatDate(value) {
  if (!value) return i18n.t("clubDashboard.empty.noActivity", clubText("Aucune activité"));
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return i18n.t("clubDashboard.empty.noActivity", clubText("Aucune activité"));
  return new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDateTime(value) {
  if (!value) return i18n.t("clubDashboard.empty.noDate", clubText("Aucune date"));
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (!Number.isFinite(date.getTime())) return i18n.t("clubDashboard.empty.noDate", clubText("Aucune date"));
  return new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
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
  return new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr-FR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(value);
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
    return clubText("Le module Club n’est pas encore chargé côté API. Si le serveur backend tourne depuis avant l’ajout de cette page, il faut le redémarrer puis rafraîchir.");
  }
  if (error?.status === 403) {
    return clubText("Action refusée pour ce club. Vérifie que le club cible est bien sélectionné, puis réessaie depuis le dashboard club.");
  }
  return message || clubText("Impossible de charger le dashboard club.");
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
  { key: "offers", path: "/club-dashboard/offres", labelKey: "clubDashboard.tools.offers", fallback: "Offres" },
  { key: "log", path: "/club-dashboard/journal", labelKey: "clubDashboard.tools.log", fallback: "Journal" },
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
    () => getCalendarCulture(translationI18n.language || translationI18n.resolvedLanguage || "fr"),
    [translationI18n.resolvedLanguage, translationI18n.language]
  );
  useEffect(() => {
    moment.locale(calendarCulture);
  }, [calendarCulture]);
  const clubMessaging = useDisclosure({defaultIsOpen:new URLSearchParams(window.location.search).has('conversation')});
  const baseTheme = useAppTheme();
  // Match the coach workspace surfaces without changing other application pages.
  const clubSurface = useColorModeValue("rgba(255,255,255,0.95)", "rgba(11,16,27,0.95)");
  const clubSoft = useColorModeValue("rgba(248,250,252,0.95)", "rgba(255,255,255,0.03)");
  const clubShadow = useColorModeValue("0 20px 50px rgba(15,23,42,0.08)", "0 20px 60px rgba(0,0,0,0.35)");
  const clubHero = useColorModeValue(
    "linear-gradient(112deg, rgba(255,255,255,0.98) 0%, rgba(239,246,255,0.98) 58%, rgba(224,242,254,0.92) 100%)",
    "linear-gradient(112deg, rgba(15,23,42,0.98) 0%, rgba(17,36,68,0.96) 58%, rgba(12,45,67,0.94) 100%)"
  );
  const theme = {
    ...baseTheme,
    surfaceBg: clubSurface,
    surfaceSoft: clubSoft,
    glassShadow: clubShadow,
    cardProps: { ...baseTheme.cardProps, bg: clubSurface, borderRadius: "24px", boxShadow: clubShadow },
    tileProps: { ...baseTheme.tileProps, bg: clubSoft, borderRadius: "16px" },
    inputProps: { ...baseTheme.inputProps, bg: clubSoft },
  };
  const toast = useToast();
  const calendarToolbarBg = useColorModeValue("rgba(15,23,42,0.03)", "rgba(255,255,255,0.08)");
  const calendarPanelBg = useColorModeValue("rgba(15,23,42,0.01)", "rgba(2,6,23,0.34)");
  const calendarGridBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.20)");
  const calendarButtonColor = useColorModeValue("#0F172A", "rgba(255,255,255,0.92)");
  const calendarButtonBg = useColorModeValue("transparent", "rgba(255,255,255,0.08)");
  const calendarActiveBg = useColorModeValue("rgba(59,130,246,0.10)", "rgba(96,165,250,0.24)");
  const calendarMutedBg = useColorModeValue("rgba(15,23,42,0.015)", "rgba(255,255,255,0.035)");
  const calendarTodayBg = useColorModeValue("rgba(59,130,246,0.06)", "rgba(96,165,250,0.18)");
  
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
  const [cancellationCount,setCancellationCount]=useState(0);
  const [paymentDueCount, setPaymentDueCount] = useState(0);
  useEffect(() => {
    if (isAdmin) return;
    let active = true;
    const load = () => {apiFetch("/clubs/payment-dues").then(data => { if (active) setPaymentDueCount(data.dues.length); }).catch(() => {});apiFetch("/coach-sessions/cancellation-requests").then(data=>{if(active)setCancellationCount(data.requests.length);}).catch(()=>{});};
    load(); const timer = setInterval(load, 60000); window.addEventListener("focus", load);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", load); };
  }, [isAdmin]);
  const [saving, setSaving] = useState(false);
  const [actionSaving, setActionSaving] = useState("");
  const [auditRepairCoach, setAuditRepairCoach] = useState({});
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const summaryLoadVersion = useRef(0);
  const loadedClubId = summary?.club?.id && summary.club.id !== "admin-club-preview" ? summary.club.id : "";
  const actionClubId = adminClubId || loadedClubId || user?.clubId || "";
  const clubUnreadCount = useClubUnreadCount(actionClubId);
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
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("week");
  const [calendarCourseSearch, setCalendarCourseSearch] = useState("");
  const [calendarCoachSearch, setCalendarCoachSearch] = useState("");
  const [groupClients, setGroupClients] = useState([]);
  const [groupClientsLoading, setGroupClientsLoading] = useState(false);
  const [groupClientsError, setGroupClientsError] = useState("");
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
  const [logoPreviewUrl, setLogoPreviewUrl] = useState("");
  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedLang, setSelectedLang] = useState(
    user?.settings?.defaultLanguage || user?.preferredLang || "fr"
  );
  const [clubNameDraft, setClubNameDraft] = useSessionDraft(user?.uid ? `club-name:${user.uid}:${adminClubId || ''}` : null, null);
  const [identityForm, setIdentityForm] = useState({
    name: "",
    logoUrl: "",
  });
  
  
  useEffect(() => {
    if (clubNameDraft !== null) setIdentityForm(current => ({ ...current, name: clubNameDraft }));
  }, [clubNameDraft, summary?.club?.name]);
  const [appointmentForm, setAppointmentForm] = useState({
    coachUid: "",
    clientId: "",
    type: "sport",
    programId: "",
    sessionIndex: "",
    appointmentKind: "suivi",
    capacity: 10, participantIds: [],
    durationMin: 60,
    title: "",
    startsAt: "",
    note: "",
  });
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [appointmentDetailLoading, setAppointmentDetailLoading] = useState(false);
  const [appointmentDetailError, setAppointmentDetailError] = useState("");
  const appointmentDetailRequest = useRef(null);
  useEffect(() => {
    if (!appointmentDetailModal.isOpen) appointmentDetailRequest.current = null;
  }, [appointmentDetailModal.isOpen]);
  const needsGroupClients = appointmentForm.type === "group" || selectedAppointment?.type === "group" || (summary?.appointments || summary?.upcomingAppointments || []).length > 0;
  useEffect(() => {
    if (!needsGroupClients) return;
    let active = true;
    setGroupClientsLoading(true);
    setGroupClientsError("");
    const load = () => apiFetch(withAdminClub("/clubs/group-class-clients")).then(data => {
      if (active) { setGroupClients(data.clients || []); setGroupClientsError(""); }
    }).catch(() => {
      if (active) setGroupClientsError(t("clubDashboard.group.loadError", "Impossible de charger les participants."));
    }).finally(() => { if (active) setGroupClientsLoading(false); });
    load();
    const timer = setInterval(load, 60000);
    window.addEventListener('focus', load);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', load); };
  }, [needsGroupClients, summary, withAdminClub, t, appointmentDetailModal.isOpen]);

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
      if ((!uid && !name) || name === 'Non attribué') return;
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
  const teamPros = analysablePros.filter(pro => ![summary?.club?.ownerUid, summary?.club?.ownerId].filter(Boolean).includes(pro.realUid));
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
  const directoryClients = activeView === 'clients' ? (summary?.clientDirectory || clubClients) : clubClients;
  const clientState = client => {
    const state = client.membershipAccess || 'active';
    const reason = client.membershipReason;
    const disabled = ['inactive', 'expired', 'left'].includes(state);
    return { disabled, color: reason === 'unpaid' || client.hasUnpaid ? 'red' : reason === 'contract_end' ? 'orange' : state === 'active' ? 'green' : 'gray',
      label: reason === 'unpaid' || client.hasUnpaid ? `${disabled ? clubText("Désactivé · ") : ''}${clubText('Impayé')}` : reason === 'contract_end' ? clubText("Fin de contrat") : state === 'left' ? clubText("Ancien membre") : state === 'inactive' ? (reason === 'other' ? clubText("Désactivé · autre motif") : clubText("Désactivé")) : state === 'expired' ? clubText("Contrat terminé") : state === 'suspended' ? clubText("Cours suspendus") : state === 'scheduled' ? clubText("À venir") : clubText("Actif") };
  };
  const [clientStatusFilter, setClientStatusFilter] = useState('all');
  const scopedClients = activeCoachFilterSet.size
    ? directoryClients.filter((client) => selectedActivityRealUids.has(client.coachUid) || (!client.coachUid && selectedActivityNames.has(client.coachName)))
    : directoryClients;
  const [expandedClientCards, setExpandedClientCards] = useState({});
  const [importClientsOpen, setImportClientsOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [activitySearches, setActivitySearches] = useState({ programs: "", nutrition: "", stats: "" });
  const activitySearch = activitySearches[activeView] || "";
  const normalizeSearch = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
  const clientSearchTerms = normalizeSearch(clientSearch).split(/\s+/).filter(Boolean);
  const [clientSort, setClientSort] = useState("firstName");
  const [nutritionSort,setNutritionSort]=useState("activity");
  const [nutritionStatusFilter,setNutritionStatusFilter]=useState("all");
  const clientCollator = new Intl.Collator(clubLocale(), { sensitivity: "base", numeric: true });
  const matchesClientStatus = client => {
    const state = client.membershipAccess || 'active';
    return clientStatusFilter === 'all'
      || (clientStatusFilter === 'disabled' && ['inactive', 'expired', 'left'].includes(state))
      || (clientStatusFilter === 'unpaid' && (client.membershipReason === 'unpaid' || client.hasUnpaid))
      || (clientStatusFilter === 'contract_end' && (client.membershipReason === 'contract_end' || state === 'expired'))
      || state === clientStatusFilter;
  };
  const compareClients = (a,b,sort=clientSort) => {
    if (sort === 'activity') {
      const time = value => { const n = new Date(value || 0).getTime(); return Number.isFinite(n) ? n : 0; };
      const difference = time(b.activityAt) - time(a.activityAt);
      if (difference) return difference;
    }
    const first = client => client.firstName || client.prenom || client.name || '';
    const last = client => client.lastName || client.nom || client.name || '';
    const primary = sort === 'lastName' ? last : first;
    const secondary = sort === 'lastName' ? first : last;
    return clientCollator.compare(primary(a), primary(b)) || clientCollator.compare(secondary(a), secondary(b)) || String(a.id).localeCompare(String(b.id));
  };
  const searchedClients = scopedClients.filter(client=>matchesClientStatus(client)&&clientSearchTerms.every(term=>normalizeSearch([client.name,client.email,client.coachName].filter(Boolean).join(' ')).includes(term))).sort(compareClients);
  const [teamSearch, setTeamSearch] = useState("");
  const teamSearchTerms = normalizeSearch(teamSearch).split(/\s+/).filter(Boolean);
  const searchedTeamPros = teamPros.filter((coach) => {
    const text = normalizeSearch([displayName(coach), coach.email].filter(Boolean).join(" "));
    return teamSearchTerms.every((term) => text.includes(term));
  });
  const scopedPrograms = activeCoachFilterSet.size
    ? clubPrograms.filter((program) => selectedActivityRealUids.has(program.coachUid) || (!program.coachUid && selectedActivityNames.has(program.coachName)))
    : clubPrograms;
  const scopedNutrition = activeCoachFilterSet.size
    ? clubNutrition.filter((assessment) => selectedActivityRealUids.has(assessment.coachUid) || (!assessment.coachUid && selectedActivityNames.has(assessment.coachName)))
    : clubNutrition;
  const scopedSessions = activeCoachFilterSet.size
    ? clubSessions.filter((session) => selectedActivityRealUids.has(session.coachUid) || (!session.coachUid && selectedActivityNames.has(session.coachName)))
    : clubSessions;
  const activitySearchTerms = normalizeSearch(activitySearch).split(/\s+/).filter(Boolean);
  const matchesActivitySearch = (values) => {
    const text = normalizeSearch(values.filter(Boolean).join(" "));
    return activitySearchTerms.every((term) => text.includes(term));
  };
  const searchedPrograms = scopedPrograms.filter((program) =>
    matchesActivitySearch([program.title, program.clientName, program.coachName])
  );
  const nutritionClients = new Map(directoryClients.map(client=>[client.id,client]));
  const nutritionIdentity = assessment => ({...nutritionClients.get(assessment.clientId),id:assessment.clientId,name:nutritionClients.get(assessment.clientId)?.name||assessment.clientName,activityAt:assessment.activityAt});
  const searchedNutrition = scopedNutrition.filter(assessment =>
    matchesActivitySearch([assessment.objective,assessment.clientName,assessment.coachName,assessment.status]) &&
    (nutritionStatusFilter==='all'||assessment.status===nutritionStatusFilter)
  ).sort((a,b)=>compareClients(nutritionIdentity(a),nutritionIdentity(b),nutritionSort)||String(a.id).localeCompare(String(b.id)));
  const [now, setNow] = useState(Date.now());
  const calendarScrollTime = useMemo(() => {
    const time = new Date(now);
    time.setHours(Math.max(0, time.getHours() - 1), 0, 0, 0);
    return time;
  }, [now]);
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
    programs: searchedPrograms.length,
    nutrition: searchedNutrition.length,
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
  const searchedCoachComparisonRows = coachComparisonRows.filter((coach) =>
    matchesActivitySearch([displayName(coach), coach.email])
  );
  const proUsage = limits.proLimit ? Math.round(((stats.proCount || 0) / limits.proLimit) * 100) : null;
  const clientUsage = limits.clientLimit ? Math.round(((stats.clientCount || 0) / limits.clientLimit) * 100) : null;
  const proLimitReached = Boolean(limits.proLimit && (stats.proCount || 0) >= limits.proLimit);
  const activeClubPackageTier = limits.packageTier || user?.packageTier || user?.proAccess?.packageTier || "";
  const isNetworkClubPack = activeClubPackageTier === "network";
  const proLimitUpgradeMessage = isNetworkClubPack
    ? clubText("Vous êtes au maximum du pack Réseau. Pour ajouter plus de pros, contactez-nous sur contact@boostyourlife.coach.")
    : clubText("Passez à l’offre Club supérieure pour ajouter un nouveau pro.");
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
    if (location.pathname === "/club-dashboard/create") return "dashboard";
    if (location.pathname === "/club-dashboard/team") return "team";
    if (location.pathname === "/club-dashboard/calendrier") return "calendar";
    if (location.pathname === "/club-dashboard/offres") return "offers";
    if (location.pathname === "/club-dashboard/settings") return "settings";
    if (location.pathname === "/club-dashboard/alertes") return "bulk";
    if (location.pathname === "/club-dashboard/journal") return "log";
    if (location.pathname === "/club-dashboard/audit") return "bulk";
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
  useEffect(() => {
    if (["/club-dashboard/alertes", "/club-dashboard/audit"].includes(location.pathname)) {
      navigate({ pathname: "/club-dashboard/actions-groupees", search: location.search, hash: location.hash }, { replace: true });
    }
  }, [location.pathname, location.search, location.hash, navigate]);
  const showDashboard = pageKind === "dashboard";

  const showTeam = pageKind === "team";
  const showActivity = pageKind === "activity";
  const showOffers = pageKind === "offers";
  const showSettings = pageKind === "settings";
  const showCalendar = pageKind === "calendar";
  const showLog = pageKind === "log";
  const showGoals = pageKind === "goals";
  const showExports = pageKind === "exports";
  const showBulk = pageKind === "bulk";
  useEffect(() => {
    if (loading || !showBulk) return;
    const id = location.hash.slice(1);
    if (!["priority-programs", "priority-nutrition", "priority-referents", "priority-payments", "priority-cancellations"].includes(id)) return;
    const frame = requestAnimationFrame(() => {
      const section = document.getElementById(id);
      section?.focus({ preventScroll: true });
      section?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, showBulk, location.hash]);
  const showClubTool = showLog || showGoals || showExports || showBulk || showOffers;
  
  const goBackToClubDashboard = () => navigate(withAdminClub("/club-dashboard"));
  const getActivityMeta = useCallback(
    (view) => {
      const meta = ACTIVITY_PAGE_META[view];
      if (!meta) {
        return [
          t("clubDashboard.activity.default.title", "Données club"),
          t("clubDashboard.activity.default.subtitle", "Consultez les clients, programmes, bilans nutrition et statistiques consolidés."),
        ];
      }
      return [clubText(meta[1]), clubText(meta[3])];
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
    log: [t("clubDashboard.pages.log.title", "Journal d’activité"), t("clubDashboard.pages.log.subtitle", "Comprenez qui a créé ou modifié quoi dans le périmètre club récent.")],
    goals: [t("clubDashboard.pages.goals.title", "Objectifs mensuels"), t("clubDashboard.pages.goals.subtitle", "Fixez des repères par pro et comparez l’activité du mois.")],
    exports: [t("clubDashboard.pages.exports.title", "Exports club"), t("clubDashboard.pages.exports.subtitle", "Téléchargez les vues clients, programmes, nutrition et statistiques pour analyse externe.")],
    bulk: [t("clubDashboard.tools.management", "Gestion"), t("clubDashboard.pages.bulk.subtitle", "Retrouvez les cohortes utiles pour agir plus vite sans perdre le contexte.")],
    offers: [t("clubDashboard.tools.management", "Gestion"), t("clubDashboard.offers.subtitle", "Packs de séances et abonnements du club.")],
    settings: [t("clubDashboard.pages.settings.title", "Réglages club"), t("clubDashboard.pages.settings.subtitle", "Gérez le nom et le logo utilisés dans les espaces pros rattachés.")],
  }[pageKind] || [t("clubDashboard.pages.default.title", "Espace club"), t("clubDashboard.pages.default.subtitle", "Pilotez votre structure.")];
  const calendarCoaches = useMemo(() => {
    const entries = new Map(coaches.map(coach => [coach.uid, displayName(coach)]));
    clubAppointments.forEach(appointment => {
      const key = clubCoachKey(appointment);
      if (!entries.has(key)) entries.set(key, displayCoachName(appointment.coachName));
    });
    return [...entries].sort(([a], [b]) => a.localeCompare(b));
  }, [coaches, clubAppointments]);
  const coachColors = useMemo(() => clubCoachColors(calendarCoaches.map(([uid]) => uid)), [calendarCoaches]);
  const calendarEventStyle = useCallback(event => ({ style: {
    backgroundColor: calendarEventAppearance(event).backgroundColor,
    color: "white", borderRadius: 8, border: "none",
  } }), []);
  const coachLegend = calendarCoaches.length > 0 && (
    <Flex gap={3} flexWrap="wrap">
      {calendarCoaches.map(([uid, name]) => (
        <HStack key={uid} spacing={2} fontSize="sm">
          <Circle size="10px" flexShrink={0} bg={coachColors.get(uid)} />
          <Text>{name}</Text>
        </HStack>
      ))}
    </Flex>
  );
  const calendarCoachSelector = (
    <HStack spacing={2} flexWrap="wrap">
      <Menu closeOnSelect={false}>
        <MenuButton as={Button} size="sm" variant="outline" leftIcon={<Icon as={MdFilterList} />} rightIcon={<ChevronDownIcon />}>
          {calendarCourseSearch ? t("clubDashboard.filters.active", "Filtres actifs") : calendarCoachFilter.length ? t("clubDashboard.filters.selectedPros", "{{count}} pro(s) sélectionné(s)", { count: calendarCoachFilter.length }) : t("clubDashboard.filters.allPros", "Tout le club")}
        </MenuButton>
        <MenuList p={3} maxW="320px">
          <Input mb={3} size="sm" type="search" value={calendarCourseSearch}
            onChange={event => setCalendarCourseSearch(event.target.value)}
            placeholder={t("clubDashboard.filters.courseSearch", "Rechercher un cours")}
            aria-label={t("clubDashboard.filters.courseSearch", "Rechercher un cours")} />
          <Input mb={2} size="sm" type="search" value={calendarCoachSearch}
            onChange={event => setCalendarCoachSearch(event.target.value)}
            placeholder={t("clubDashboard.team.searchPlaceholder", "Rechercher un professionnel")}
            aria-label={t("clubDashboard.team.searchPlaceholder", "Rechercher un professionnel")} />
          <Box maxH="240px" overflowY="auto">
            <MenuOptionGroup type="checkbox" value={calendarCoachFilter} onChange={value => setCalendarCoachFilter(Array.isArray(value) ? value : [])}>
              {calendarCoaches.filter(([, name]) => normalizeSearch(name).includes(normalizeSearch(calendarCoachSearch))).map(([uid, name]) =>
                <MenuItemOption key={uid} value={uid}>{name}</MenuItemOption>)}
            </MenuOptionGroup>
          </Box>
        </MenuList>
      </Menu>
      {(calendarCoachFilter.length > 0 || calendarCourseSearch) && <Button size="sm" variant="ghost" onClick={() => { setCalendarCoachFilter([]); setCalendarCourseSearch(""); setCalendarCoachSearch(""); }}>{t("auto.ClubDashboard.voir_tout_le_club", "Voir tout le club")}</Button>}
    </HStack>
  );
  const planningDownload = <ClubPlanningDownload appointments={clubAppointments} coaches={calendarCoaches} clubName={summary?.club?.name} clubLogoUrl={summary?.club?.logoUrl || "/logo-byl.png"} calendarDate={calendarDate} selectedCoaches={calendarCoachFilter} />;
  const calendarEvents = useMemo(
    () =>
      clubAppointments.map((appointment) => {
        const start = new Date(appointment.startsAt);
        const end = new Date(start.getTime() + (Number(appointment.durationMin || 60) || 60) * 60000);
        return {
          ...appointment,
          lastSessionPacks: eventLastPacks(groupClients.flatMap(client => (client.packs || []).map(pack => ({...pack,clientName:client.name}))), appointment),
          start,
          end,
          status: appointment.type === "group" && (!appointment.status || appointment.status === "à venir") && end.getTime() <= now ? "validée" : appointment.status || "à venir",
          title: appointment.type === "group" ? appointment.title : `${appointment.type === "group" ? t("clubDashboard.group.title", "Cours collectif") + " · " : ""}${appointment.title}${appointment.type === "group" ? ` (${appointment.participantIds?.length || 0}/${appointment.capacity})` : ""}${appointment.clientName ? ` · ${appointment.clientName}` : ""} · ${calendarCoaches.find(([uid]) => uid === clubCoachKey(appointment))?.[1] || displayCoachName(appointment.coachName)} · ${t(calendarEventStatusKey(appointment))}`,
        };
      }),
    [clubAppointments, calendarCoaches, t, now, groupClients]
  );
  const openCalendarDetailRef = useRef(null);
  const calendarPointerStart = useRef(null);
  const calendarSlotHintRef = useRef(null);
  const previewCalendarSelection = range => {
    if (range.end.getTime() - range.start.getTime() > 180 * 60000) return false;
    calendarSlotHintRef.current?.select(range);
    return true;
  };
  const calendarPointerHandlers = {
    onMouseDownCapture: e => {
      const id = e.target.closest('[data-club-event-id]')?.dataset.clubEventId;
      calendarPointerStart.current = id && !e.target.closest('.rbc-addons-dnd-resize-ns-anchor, .rbc-addons-dnd-resize-ew-anchor') ? { id, x: e.clientX, y: e.clientY } : null;
    },
    onMouseUpCapture: e => {
      const start = calendarPointerStart.current;
      calendarPointerStart.current = null;
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) {
        const event = calendarEvents.find(item => item.id === start.id);
        if (event) openCalendarDetailRef.current?.(event);
      }
    },
  };
  const calendarComponents = useMemo(() => ({
    event: ({ event }) => <><Text pr="18px" noOfLines={1}>{event.title}</Text><CalendarValidationMark event={event} /></>,
    eventWrapper: props => <ClubCalendarEventPreview {...props} clients={groupClients} loading={groupClientsLoading} error={groupClientsError} onSelect={event => openCalendarDetailRef.current?.(event)} />,
  }), [groupClients, groupClientsLoading, groupClientsError]);
  const filteredCalendarEvents = useMemo(() => {
    const selected = new Set(calendarCoachFilter);
    return calendarEvents.filter(event => (!selected.size || selected.has(event.coachUid)) && (!calendarCourseSearch || (event.type === "group" && normalizeSearch(event.title).includes(normalizeSearch(calendarCourseSearch)))));
  }, [calendarCoachFilter, calendarCourseSearch, calendarEvents]);
  const upcomingFilteredAppointments = useMemo(
    () =>
      filteredCalendarEvents
        .filter((event) => event.start.getTime() >= now && !["validée", "validee", "done", "completed", "manquée", "manquee", "missed", "annulée", "annulee", "cancelled", "canceled"].includes(String(event.status || "").toLowerCase()))
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
        status === "canceled"
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
          detail: `${assessment.clientName} · ${clubText(assessment.status)}`,
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
  
  const allClientsWithoutProgram = useMemo(
    () => clubClients.filter((client) => Number(client.programCount || 0) === 0),
    [clubClients]
  );
  const nutritionDrafts = useMemo(
    () => clubNutrition.filter((assessment) => !['Partagé', 'Validé'].includes(assessment.status)),
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
  
  const clubAlerts = useMemo(() => {
    const alerts = [];
    if (proLimitReached) alerts.push({ tone: "red", title: t("clubDashboard.alerts.proLimit.title", "Capacité pros atteinte"), detail: proLimitUpgradeMessage, action: t("clubDashboard.actions.viewTeam", "Voir l’équipe"), onClick: () => openClubSection("team") });
    if (limits.proLimit && proUsage >= 75 && !proLimitReached) alerts.push({ tone: "orange", title: t("clubDashboard.alerts.proLimitSoon.title", "Capacité pros bientôt limite"), detail: `${stats.proCount || 0}/${limits.proLimit}`, action: t("auto.ClubDashboard.gerer", "Gérer"), onClick: () => openClubSection("team") });
    if (inactiveCoaches.length) alerts.push({ tone: "yellow", title: t("clubDashboard.alerts.inactivePros.title", "{{count}} pro(s) peu actif(s)", { count: inactiveCoaches.length }), detail: t("clubDashboard.alerts.inactivePros.detail", "Aucune activité récente détectée sur 14 jours."), action: t("clubDashboard.actions.viewTeam", "Voir l’équipe"), onClick: () => openClubSection("team") });
    return alerts;
  }, [inactiveCoaches.length, limits.proLimit, proLimitReached, proLimitUpgradeMessage, proUsage, stats.proCount, t]);
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
  

  const loadSummary = useCallback(async () => {
    const version = ++summaryLoadVersion.current;
    setError("");
    try {
      const data = await apiFetch(withAdminClub("/clubs/summary"));
      if (version !== summaryLoadVersion.current) return;
      setSummary(data);
      setIdentityForm({
        name: data?.club?.name || "",
        logoUrl: data?.club?.logoUrl || "",
      });
    } catch (err) {
      if (version === summaryLoadVersion.current) setError(friendlyError(err));
    } finally {
      if (version === summaryLoadVersion.current) setLoading(false);
    }
  }, [withAdminClub, user?.uid, user?.clubId]);

  useEffect(() => {
    // Blank only when changing identity/club, not after every saved action.
    setSummary(null);
    setLoading(true);
    loadSummary();
    return () => { summaryLoadVersion.current += 1; };
  }, [loadSummary]);

  

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get("section");
    const view = params.get("view");
    const pathView = VIEW_BY_PATH[location.pathname];
    if (pathView) setActiveView(pathView);
    else if (CLUB_VIEWS.some((item) => item.key === view)) setActiveView(view);
    // Only explicit dashboard section links should scroll past the page header.
    if (location.pathname === "/club-dashboard" && section) {
      const timer = setTimeout(() => scrollToSection(`club-${section}`), 150);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, location.search]);

  const openClubSection = (section) => {
    const routes = {
      create: "/club-dashboard/create",
      team: "/club-dashboard/team",
      activity: "/club-dashboard/clients",
      calendar: "/club-dashboard/calendrier",
      alerts: "/club-dashboard/actions-groupees",
      log: "/club-dashboard/journal",
      audit: "/club-dashboard/actions-groupees",
      goals: "/club-dashboard/objectifs",
      exports: "/club-dashboard/exports",
      bulk: "/club-dashboard/actions-groupees",
      guide: "/club-dashboard?section=guide",
      settings: "/club-dashboard/settings",
    };
    navigate(withAdminClub(routes[section] || "/club-dashboard"));
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

  

  const openCoachDetail = (coach) => {
    if (!coach?.uid) return;
    setSelectedCoachUid(coach.uid);
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
      type: "sport",
      recurrenceFrequency: "none",
      recurrenceUntil: "",
      participantIds: [],
      coachUid: selectedCalendarCoachUid || current.coachUid || "",
      clientId: "",
      programId: "",
      sessionIndex: "",
    }));
    setIsAddAppointmentModalOpen(true);
  }, [selectedCalendarCoachUid]);

  const openSelectedCalendarSlot = ({ start, end, action }) => {
    if (!["week", "day"].includes(calendarView)) return;
    const durationMin = action === "select"
      ? Math.max(15, Math.min(180, Math.round((end.getTime() - start.getTime()) / 60000)))
      : 60;
    setAppointmentForm({
      coachUid: selectedCalendarCoachUid, clientId: "", type: "sport", title: "",
      startsAt: toDateTimeLocalValue(start), durationMin, note: "",
      programId: "", sessionIndex: "", appointmentKind: "suivi",
      capacity: 10, participantIds: [], recurrenceFrequency: "none", recurrenceUntil: "",
    });
    setIsAddAppointmentModalOpen(true);
  };

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



  const openCreateCoachSection = () => {
    if (proLimitReached) {
      setProLimitModalDismissed(false);
      proLimitModal.onOpen();
      return;
    }
    inviteProModal.onOpen();
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
        description: err?.message || clubText("Réessayez dans quelques instants."),
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
        throw new Error(clubText("URL Stripe manquante."));
      }
    } catch (err) {
      toast({
        title: t("auto.ClubDashboard.stripe_indisponible", "Stripe indisponible"),
        description: err?.message || clubText("Impossible d’ouvrir le portail pour le moment."),
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
      setInviteLink("");
      setForm({ firstName: "", lastName: "", email: "", proType: "sport" });
      const emailMessage = data.emailSent
        ? clubText("Un email d’activation vient d’être envoyé automatiquement.")
        : clubText("Le compte est créé, mais l’e-mail d’activation n’a pas pu partir. Le professionnel peut utiliser « Mot de passe oublié » sur la page de connexion pour recevoir son lien personnel.");
      toast({
        title: t("auto.ClubDashboard.pro_ajoute_au_club", "Pro ajouté au club"),
        description: emailMessage,
        status: data.emailSent ? "success" : "warning",
        duration: 4000,
        isClosable: true,
      });
      if (data.emailSent) inviteProModal.onClose();
      await loadSummary();
    } catch (err) {
      setError(err?.data?.error === "existing-account-requires-invitation"
        ? clubText("Cette adresse possède déjà un compte. Aucun accès n’a été modifié. Un administrateur doit valider son rattachement avec l’accord du titulaire.")
        : friendlyError(err) || clubText("Création du pro impossible."));
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
      setClubNameDraft(null);
      setLogoFile(null);
      setUploadProgress(0);
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || clubText("Mise à jour du club impossible."));
    } finally {
      setIdentitySaving(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(location.search);
    const action = params.get("quickAction");
    const legacyCreate = location.pathname === "/club-dashboard/create";
    if (!legacyCreate && action !== "pro" && action !== "plan") return;
    if (legacyCreate || action === "pro") {
      if (proLimitReached) proLimitModal.onOpen();
      else inviteProModal.onOpen();
    } else {
      openCalendarAppointmentModal();
    }
    params.delete("quickAction");
    navigate(`${legacyCreate ? "/club-dashboard" : location.pathname}${params.size ? `?${params}` : ""}`, { replace: true });
  }, [loading, location.pathname, location.search, navigate, proLimitReached, proLimitModal.onOpen, inviteProModal.onOpen, openCalendarAppointmentModal]);

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
      const nutritionLabel = clubText(NUTRITION_APPOINTMENT_TYPES.find((item) => item.value === appointmentForm.appointmentKind)?.label) || t("clubDashboard.calendar.nutritionAppointment", "Rendez-vous nutrition");
      const internalLabel = t("clubDashboard.calendar.internalEvent", "Évènement interne");
      const payload = {
        ...appointmentForm,
        startsAt: new Date(appointmentForm.startsAt).toISOString(),
        recurrence: { frequency: appointmentForm.recurrenceFrequency || "none", until: appointmentForm.recurrenceUntil, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        clientId: ["internal", "group"].includes(appointmentForm.type) ? "" : appointmentForm.clientId,
        programId: appointmentForm.type === "sport" ? appointmentForm.programId : "",
        sessionIndex: appointmentForm.type === "sport" ? appointmentForm.sessionIndex : "",
        appointmentKind: appointmentForm.type === "internal" ? "internal" : appointmentForm.appointmentKind,
        title:
          appointmentForm.type === "group" ? appointmentForm.title.trim() : appointmentForm.title ||
          (appointmentForm.type === "internal"
            ? internalLabel
            : appointmentForm.type === "nutrition"
            ? nutritionLabel
            : selectedSession
              ? getSessionLabel(selectedSession, Number(appointmentForm.sessionIndex))
              : t("auto.ClubDashboard.bilan_seance_point_suivi", "Bilan, séance, point suivi...")),
        sessionTitle: appointmentForm.type === "sport" && selectedSession ? getSessionLabel(selectedSession, Number(appointmentForm.sessionIndex)) : "",
        programTitle: appointmentForm.type === "sport" ? selectedProgram?.title || "" : "",
      };
      const creation = await apiFetch(withAdminClub("/clubs/appointments"), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({ title: creation.createdCount ? t("clubDashboard.recurrence.created", { defaultValue: "{{count}} séances ajoutées au calendrier", count: creation.createdCount }) : t("auto.ClubDashboard.rendez_vous_ajoute_au_calendrier_club", "Rendez-vous ajouté au calendrier club"), status: "success", duration: 3500, isClosable: true });
      setAppointmentForm({ coachUid: "", clientId: "", type: "sport", capacity: 10, participantIds: [], programId: "", sessionIndex: "", appointmentKind: "suivi", durationMin: 60, title: "", startsAt: "", note: "" });
      setIsAddAppointmentModalOpen(false);
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || clubText("Création du rendez-vous impossible."));
      toast({ title: err?.data?.error || friendlyError(err) || clubText("Création du rendez-vous impossible."), status: "error", isClosable: true });
    } finally {
      setActionSaving("");
    }
  };

  const appointmentFormFor = appointment => ({
        notifyParticipants: false,
        title: appointment.title || "",
        startsAt: toDateTimeLocalValue(appointment.start),
        durationMin: Number(appointment.durationMin || 60) || 60,
        status: appointment.status || "à venir",
        note: appointment.note || "",
        registrationMode: appointment.registrationMode || "inherit",
        waitlistIds: appointment.waitlistIds || [],
        capacity: appointment.capacity || 10, participantIds: appointment.participantIds || [], coachUid: appointment.coachUid || "",
      });

  const openAppointmentDetail = async (previousAppointment) => {
    if (!previousAppointment?.id || appointmentDetailRequest.current?.id === previousAppointment.id) return;
    const request = { id: previousAppointment.id };
    appointmentDetailRequest.current = request;
    setSelectedAppointment(previousAppointment);
    setAppointmentEditForm(appointmentFormFor({ ...previousAppointment, start: previousAppointment.start || new Date(previousAppointment.startsAt) }));
    setAppointmentDetailError("");
    setAppointmentDetailLoading(true);
    appointmentDetailModal.onOpen();
    try {
      const data = await apiFetch(withAdminClub(`/clubs/appointments/${encodeURIComponent(previousAppointment.id)}`));
      if (appointmentDetailRequest.current !== request) return;
      const fresh = data.appointment;
      if (!fresh) throw new Error(clubText("Ce rendez-vous n’est plus disponible."));
      const appointment = { ...fresh, difficultyRating: fresh.difficultyRating ?? previousAppointment.difficultyRating, start: new Date(fresh.startsAt) };
      setSelectedAppointment(appointment);
      setAppointmentEditForm(appointmentFormFor(appointment));
    } catch (err) {
      if (appointmentDetailRequest.current === request) setAppointmentDetailError(friendlyError(err) || clubText("Impossible d’actualiser le rendez-vous."));
    } finally {
      if (appointmentDetailRequest.current === request) setAppointmentDetailLoading(false);
    }
  };

  openCalendarDetailRef.current = openAppointmentDetail;
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('appointment');
    if (loading || !actionClubId || !id) return;
    openCalendarDetailRef.current({id});
    params.delete('appointment');
    navigate({pathname:location.pathname, search:params.toString()}, {replace:true});
  }, [loading, actionClubId, location.pathname, location.search, navigate]);

  const updateAppointment = async (appointment, patch, { close = false, refresh = true } = {}) => {
    if (!appointment?.id) return;
    setActionSaving(`appointment:${appointment.id}`);
    setError("");
    try {
      const result = await apiFetch(withAdminClub(`/clubs/appointments/${appointment.id}`), {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (patch.notifyParticipants) toast({status:result.emailDelivery?.failed ? 'warning':'info', title:clubText('Inscription enregistrée'), description:t('calendar.email_delivery_result', '{{sent}} envoyé(s) · {{skipped}} non envoyé(s) (préférences ou adresse) · {{failed}} échec(s)', {sent:result.emailDelivery?.sent || 0, skipped:result.emailDelivery?.skipped || 0, failed:result.emailDelivery?.failed || 0})});
      if (close) appointmentDetailModal.onClose();
      if (refresh) await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || clubText("Mise à jour du rendez-vous impossible."));
      toast({ title: err?.data?.error || friendlyError(err) || clubText("Mise à jour du rendez-vous impossible."), status: "error", isClosable: true });
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
        notifyParticipants: appointmentEditForm.notifyParticipants === true,
        title: appointmentEditForm.title,
        startsAt: appointmentEditForm.startsAt,
        durationMin: appointmentEditForm.durationMin,
        status: appointmentEditForm.status,
        note: appointmentEditForm.note,
        ...(selectedAppointment.type === "group" ? { registrationMode: appointmentEditForm.registrationMode || "inherit", capacity: appointmentEditForm.capacity, participantIds: appointmentEditForm.participantIds, waitlistIds: appointmentEditForm.waitlistIds, expectedReservations: { participantIds: selectedAppointment.participantIds || [], waitlistIds: selectedAppointment.waitlistIds || [] }, coachUid: appointmentEditForm.coachUid } : {}),
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
      setError(friendlyError(err) || clubText("Suppression du rendez-vous impossible."));
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
        title: patch.status === "disabled" ? clubText("Pro suspendu") : clubText("Pro mis à jour"),
        status: "success",
        duration: 3000,
        isClosable: true,
      });
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || clubText("Mise à jour du pro impossible."));
    } finally {
      setActionSaving("");
    }
  };

  const deleteCoach = async (coach) => {
    if (!coach?.uid) return;
    const ok = window.confirm(clubText("Supprimer {{name}} du club ? Son compte sera désactivé et retiré des listes club.", {name:displayName(coach)}));
    if (!ok) return;
    setActionSaving(`${coach.uid}:delete`);
    setError("");
    try {
      await apiFetch(withAdminClub(`/clubs/coaches/${encodeURIComponent(coach.uid)}`), { method: "DELETE" });
      if (selectedCoachUid === coach.uid) setSelectedCoachUid("");
      toast({ title: t("auto.ClubDashboard.pro_supprime_du_club", "Pro supprimé du club"), status: "success", duration: 3500, isClosable: true });
      await loadSummary();
    } catch (err) {
      setError(friendlyError(err) || clubText("Suppression du pro impossible."));
    } finally {
      setActionSaving("");
    }
  };

  if (loading) return <AppLoading label={t("auto.ClubDashboard.chargement_de_l_espace_club", "Chargement de l’espace club...")} />;

  return (
    <Box data-tour-page="club-dashboard" bg={theme.pageBg} color={theme.textColor} minH="100vh" position="relative" overflow="clip"
      py={{ base: 3, md: 3.5, xl: 4 }} px={{ base: 2.5, md: 3.5, xl: 4.5 }}
      sx={{ "& .chakra-button": { borderRadius: "14px" }, "& th": { color: theme.mutedText }, "& .chakra-heading": { letterSpacing: "-0.025em" } }}>
      <ClubCalendarSlotHint ref={calendarSlotHintRef} formatTime={formatCalendarSlotTime} disabled={isAddAppointmentModalOpen || appointmentDetailModal.isOpen || !["week", "day"].includes(calendarView)} />
      <Box aria-hidden="true" position="absolute" top="-140px" right="-100px" w="420px" h="420px" borderRadius="full" bg="rgba(59,130,246,0.10)" filter="blur(90px)" pointerEvents="none" />
      <Portal>
        <IconButton data-tour="club-messaging"
          position="fixed" zIndex={1350} right={{ base: 4, md: 6 }} bottom={{ base: "calc(92px + env(safe-area-inset-bottom, 0px))", md: 5 }}
          w="56px" h="56px" borderRadius="full" bg="#257CFF" color="white"
          boxShadow="0 14px 32px rgba(37,124,255,0.38)" _hover={{ bg: "blue.600" }}
          aria-label={t("clubMessaging.title")} icon={<><Icon as={MdOutlineChat} boxSize="24px" />{clubUnreadCount > 0 && <Badge position="absolute" top="-4px" right="-4px" bg="red.500" color="white" borderRadius="full" minW="22px" h="22px" display="flex" alignItems="center" justifyContent="center" fontWeight="900" border="2px solid" borderColor={theme.surfaceBgStrong}>{clubUnreadCount > 99 ? "99+" : clubUnreadCount}</Badge>}</>}
          onClick={clubMessaging.onOpen}
        />
      </Portal>
      <Modal isOpen={clubMessaging.isOpen} onClose={clubMessaging.onClose} scrollBehavior="inside" blockScrollOnMount={false}>
        <ModalContent position="fixed" right={{ base: 2, md: 6 }} bottom={{ base: "12px", md: "88px" }}
          m={0} w={{ base: "calc(100vw - 16px)", md: "420px" }} maxW="420px"
          h="600px" maxH="calc(100dvh - 100px)" borderRadius="24px" overflow="hidden"
          bg={theme.surfaceBgStrong} color={theme.textColor} boxShadow="0 22px 70px rgba(15,23,42,0.24)">
          <ModalHeader fontSize="md" pr={12} borderBottomWidth="1px">{t("clubMessaging.title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody p={0} display="flex" flexDirection="column" overflow="hidden">
            <ClubMessagingPanel embedded clubId={actionClubId} onOpenAppointment={appointment => { clubMessaging.onClose(); openAppointmentDetail(appointment); }} />
          </ModalBody>
        </ModalContent>
      </Modal>
      {importClientsOpen && <React.Suspense fallback={null}><ClubClientImport coaches={coaches} onClose={() => setImportClientsOpen(false)} onImported={loadSummary} /></React.Suspense>}
      <Container maxW="1680px" px={0} position="relative">
        <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
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
            <Stack direction="row" align={{ base: "flex-start", md: "center" }}
              spacing={{ base: 3, md: 4 }} {...theme.cardProps} p={{ base: 4, md: 5 }}>
              <Button size="sm" variant="outline" aria-label={t("programView.back", "Retour")}
                w={showClubTool ? "36px" : { base: "36px", md: "auto" }} minW="36px" h="36px" px={{ base: 0, md: 3 }}
                borderRadius="full" gap={2} mt={{ base: 0.5, md: 0 }}
                onClick={goBackToClubDashboard} flexShrink={0}>
                <ArrowBackIcon boxSize="16px" />
                <Text as="span" display={showClubTool ? "none" : { base: "none", md: "inline" }}>{t("programView.back", "Retour")}</Text>
              </Button>
              <Flex flex="1" minW={0} direction={showClubTool ? "column" : { base: "column", lg: "row" }} gap={showClubTool ? 1 : { base: 2, lg: 6 }} align={showClubTool ? "start" : { base: "start", lg: "center" }} justify="space-between">
                  <Heading fontSize={showClubTool ? {base:"20px",md:"24px"} : { base: "22px", md: "30px" }} lineHeight="1.2" letterSpacing="-0.025em" flexShrink={0}>{pageMeta[0]}</Heading>
                  <Text color={theme.mutedText} maxW={showClubTool ? "full" : { lg: "55%" }} fontSize={{ base: "13px", md: "sm" }} lineHeight="1.5">{pageMeta[1]}</Text>
                </Flex>
            </Stack>
          )}

          {showDashboard && (
            <>
              {!isAdmin && summary && (summary.clientDirectory || clubClients).length === 0 && <Box {...theme.cardProps} p={4}>
                <Heading size="sm">{clubText('Vous avez déjà des clients ?')}</Heading>
                <Text mt={2} fontSize="sm">{clubText('Importez votre fichier Excel ou CSV pour démarrer sans ressaisie.')}</Text>
                <Button mt={3} onClick={() => setImportClientsOpen(true)}>{clubText('Importer mes clients')}</Button>
              </Box>}
              <Box {...theme.cardProps} id="club-overview" data-tour="club-hero" bgImage={clubHero} p={{ base: 4, md: 6 }}>
                <Flex align="center" justify="space-between" gap={3} wrap="wrap" mb={4}>
                  <HStack spacing={{ base: 3, md: 4 }} minW={0}>
                    <ClubLogo
                      src={summary?.club?.logoUrl}
                      alt={t("auto.ClubDashboard.logo_du_club", "Logo du club")}
                      boxSize={{ base: "52px", md: "68px" }}
                      flexShrink={0}
                      borderRadius="16px"
                      p={2}
                    />
                    <Box minW={0}>
                      <Heading size={{ base: "md", md: "lg" }}>{t("nav.dashboard", "Tableau de bord")}</Heading>
                      <Text mt={1} color={theme.mutedText} fontSize="sm">{formatFullDate(new Date())}</Text>
                    </Box>
                  </HStack>
                  <Button
                    size="sm"
                    variant="outline"
                    borderRadius="full"
                    minH="40px"
                    px={3}
                    textTransform="uppercase"
                    onClick={() => navigate(withAdminClub("/club-dashboard/actions-groupees"))}
                  >
                    {t("clubDashboard.bulk.total", "{{count}} à traiter", { count: allClientsWithoutProgram.length + nutritionDrafts.length + unknownReferentItems.length + clubAlerts.length + paymentDueCount + cancellationCount })}
                  </Button>
                </Flex>
                <Stack direction={{ base: "column", md: "row" }} spacing={5} align={{ base: "stretch", md: "center" }}>
                  <Box flex="1" minW={0}>
                    <Text fontWeight="700">{t("clubDashboard.todaySchedule.title", "Suivi des rendez-vous du jour")}</Text>
                    <Text mt={1} fontSize="sm" color={theme.mutedText}>{todayAppointmentSummary.total
                      ? t("clubDashboard.todaySchedule.remaining", "{{count}} rendez-vous restant(s)", { count: todayAppointmentSummary.total - todayAppointmentSummary.done })
                      : t("clubDashboard.todaySchedule.empty", "Aucun rendez-vous planifié aujourd’hui.")}</Text>
                  </Box>
                  <Box flex="1" minW={0}>
                    <HStack justify="space-between" mb={2} fontSize="sm">
                      <Text>{t("clubDashboard.todaySchedule.progressLabel", "Progression journée")}</Text>
                      <Text fontWeight="800">{todayAppointmentSummary.total ? `${todayAppointmentSummary.done} / ${todayAppointmentSummary.total}` : "—"}</Text>
                    </HStack>
                    <Progress aria-label={t("clubDashboard.todaySchedule.progressLabel", "Progression journée")} value={todayAppointmentSummary.progress} size="sm" colorScheme="blue" borderRadius="full" bg={theme.surfaceSoft} />
                  </Box>
                </Stack>
              </Box>
              <Box display="grid" gridTemplateColumns={{ base: "minmax(0, 1fr)", lg: "minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr)" }} gap={3} alignItems="stretch">
                <Box {...theme.cardProps} p={4} minW={0} borderTopWidth="3px" borderTopColor="blue.400">
                  <Heading size="sm" mb={3}>{t("clubDashboard.clarity.next", "Prochain rendez-vous")}</Heading>
                  {(todayAppointmentSummary.next || upcomingFilteredAppointments[0]) ? (() => {
                    const event = todayAppointmentSummary.next || upcomingFilteredAppointments[0];
                    return <>
                      <Text fontSize="lg" fontWeight="800">{event.start.toLocaleTimeString(calendarCulture, { hour: "2-digit", minute: "2-digit" })}</Text>
                      <Text fontSize="sm" color={theme.mutedText}>{event.start.toLocaleDateString(calendarCulture, { weekday: "long", day: "numeric", month: "long" })}</Text>
                      <Text mt={3} fontWeight="700">{event.title}</Text>
                      <Flex justify="flex-end" mt={4}><Button size="sm" {...theme.primaryButtonProps} onClick={() => openAppointmentDetail(event)}>{t("programs.open", "Ouvrir")}</Button></Flex>
                    </>;
                  })() : <>
                    <Text color={theme.mutedText} fontSize="sm">{t("clubDashboard.clarity.noUpcoming", "Aucun rendez-vous à venir.")}</Text>
                    <Button mt={4} size="sm" variant="outline" onClick={openCalendarAppointmentModal}>{t("nav.new_appointment", "Nouveau rendez-vous")}</Button>
                  </>}
                </Box>
                <Box minW={0}>
                  <Text fontSize="sm" fontWeight="700" mb={2}>{t("clubDashboard.clarity.overview", "Le club en chiffres")}</Text>
                  <SimpleGrid columns={2} spacing={3}>
                    {[
                      [t("auto.ClubDashboard.pros_actifs", "Pros actifs"), stats.activeCoachCount || 0, "/club-dashboard/team"],
                      [t("auto.ClubDashboard.clients_suivis", "Clients suivis"), clubClients.length, "/club-dashboard/clients"],
                      [t("dashboard.stats_total_programs", "Programmes"), clubPrograms.length, "/club-dashboard/programmes"],
                      [t("nav.nutrition", "Nutrition"), clubNutrition.length, "/club-dashboard/nutrition"],
                    ].map(([label, value, route]) => (
                      <HStack as="button" type="button" onClick={() => navigate(withAdminClub(route))} key={label} {...theme.cardProps} minH="88px" p={4} justify="space-between" gap={2} textAlign="start" _hover={{ borderColor: "blue.400" }}>
                        <Text fontWeight="700" fontSize="sm">{label}</Text>
                        <Text fontSize="2xl" fontWeight="900" textAlign="right" flexShrink={0}>{value}</Text>
                      </HStack>
                    ))}
                  </SimpleGrid>
                </Box>
                  <Box {...theme.cardProps} p={4} minW={0}>
                    <Text fontWeight="700" mb={2}>{t("auto.ClubDashboard.priorites", "Priorités")}</Text>
                    {isClubSetupEmpty ? <>
                      <Text fontSize="sm" color={theme.mutedText}>{t("clubDashboard.setup.emptyDetail", "Ajoutez votre premier professionnel pour démarrer le suivi du club.")}</Text>
                      <Button mt={3} size="sm" {...theme.primaryButtonProps} onClick={openCreateCoachSection}>{t("clubDashboard.setup.stepPro", "Créer le premier pro")}</Button>
                    </> : <>
                      <VStack align="stretch" spacing={2}>
                        {[
                          [t("auto.ClubDashboard.clients_sans_programme", "Clients sans programme"), allClientsWithoutProgram.length, "priority-programs"],
                          [t("clubDashboard.alerts.nutritionDrafts.short", "Bilans nutrition à finaliser"), nutritionDrafts.length, "priority-nutrition"],
                          [t("clubDashboard.tools.audit", "Vérifier les référents"), unknownReferentItems.length, "priority-referents"],
                          [clubText("Règlements à vérifier"), paymentDueCount, "priority-payments"],
                          [clubText("Annulations à examiner"), cancellationCount, "priority-cancellations"],
                        ].filter(([, count]) => count > 0).map(([label, count, target]) => <Button as={RouterLink} to={withAdminClub("/club-dashboard/actions-groupees")+"#"+target} key={target} variant="ghost" size="sm" w="full" h="auto" minH="36px" py={2} px={2} justifyContent="space-between" gap={3} textAlign="left" whiteSpace="normal" fontWeight="normal"><Text as="span">{label}</Text><Text as="span" fontWeight="700">{count}</Text></Button>)}
                        {!(allClientsWithoutProgram.length + nutritionDrafts.length + unknownReferentItems.length + paymentDueCount + cancellationCount) && <Text color={theme.mutedText} fontSize="sm">{t("clubDashboard.bulk.empty", "Rien à traiter ici.")}</Text>}
                      </VStack>
                      <Flex justify="flex-end" mt={3}><Button size="sm" variant="outline" onClick={() => navigate(withAdminClub("/club-dashboard/actions-groupees"))}>{t("clubDashboard.pages.bulk.title", "À traiter")}</Button></Flex>
                    </>}
                  </Box>
              </Box>
              <Box {...theme.cardProps} id="club-dashboard-calendar" {...calendarPointerHandlers} data-tour="club-dashboard-calendar" p={{ base: 4, md: 5 }}>
                <Flex justify="space-between" align="center" gap={3} mb={3} flexWrap="wrap">
                  <Heading size="md">{t("auto.ClubDashboard.calendrier_de_l_equipe", "Calendrier de l’équipe")}</Heading>
                  <HStack spacing={2} flexWrap="wrap" justify="flex-end" marginLeft="auto">
                    {calendarCoachSelector}
                    <ClubCalendarConnect clubId={actionClubId}/>
                    <Button size="sm" variant="outline" as={RouterLink} to={withAdminClub("/club-dashboard/calendrier")}>
                      {t("programs.open", "Ouvrir")}
                    </Button>
                                      <Button size="sm" leftIcon={<AddIcon />} {...theme.primaryButtonProps} onClick={openCalendarAppointmentModal}>{t("exerciseCard.add", "Ajouter")}</Button>
</HStack>
                </Flex>
                <Flex justify="space-between" align="center" flexWrap="wrap" gap={3} mb={3}>
                  {coachLegend}
                </Flex>
                <ClubMobileCalendar events={filteredCalendarEvents} colors={coachColors} onSelectEvent={openAppointmentDetail} />
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
                    ".rbc-time-view .rbc-event, .rbc-time-view .rbc-addons-dnd-resizable": { display: "flex", flexDirection: "column", overflow: "hidden" },
                    ".rbc-time-view .rbc-addons-dnd-resizable": { height: "100%", minHeight: 0 },
                    ".rbc-time-view .rbc-event .rbc-event-content": { order: 0, flex: "0 0 auto", fontWeight: 800, fontSize: "13px", lineHeight: "16px", minHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
                    ".rbc-time-view .rbc-event .rbc-event-label": { order: 1, flex: "0 1 auto", fontSize: "10px", lineHeight: "12px", opacity: 0.85, minHeight: 0, overflow: "hidden" },
                    ".rbc-time-view .rbc-event": { padding: "2px 5px" },
                    ".rbc-event": {
                      borderRadius: "12px",
                      padding: "4px 8px",
                      border: "none",
                      boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                    },
                  }}
                >
                  <DnDCalendar
                    key={calendarCulture}
                    date={calendarDate}
                    onNavigate={setCalendarDate}
                    view={calendarView}
                    onView={setCalendarView}
                    selectable={["week", "day"].includes(calendarView) && !isTouchDevice() ? "ignoreEvents" : false}
                    step={15}
                    timeslots={4}
                    onSelecting={previewCalendarSelection}
                    slotPropGetter={date => ({ "data-club-slot-time": date.getTime() })}
                    onSelectSlot={openSelectedCalendarSlot}
                    scrollToTime={calendarScrollTime}
                    localizer={localizer}
                    culture={calendarCulture}
                    formats={{ ...calendarFormats, ...getCalendarFormats(calendarCulture) }}
                    components={calendarComponents}
                    componentIdentity={calendarComponents}
                    tooltipAccessor={() => null}
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
                    draggableAccessor={(event) => !isTouchDevice() && (event?.type === "group" || event?.status !== "validée")}
                    resizableAccessor={(event) => !isTouchDevice() && (event?.type === "group" || event?.status !== "validée")}
                    eventPropGetter={calendarEventStyle}
                    dayLayoutAlgorithm="no-overlap"
                    messages={{
                      ...getCalendarAgendaMessages(calendarCulture),
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

            </>
          )}

          {showSettings && (
            <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
              <TutorialSettingsPanel role="club" />
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
                          onChange={(e) => { setClubNameDraft(e.target.value); setIdentityForm((current) => ({ ...current, name: e.target.value })); }}
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
                        <HStack mt={3} spacing={3}>
                          <ClubLogo
                            src={logoPreviewUrl || identityForm.logoUrl}
                            alt={t("auto.ClubDashboard.logo_du_club", "Logo du club")}
                            boxSize="64px" borderRadius="12px" p={2}
                          />
                        <Text color={theme.mutedText} fontSize="sm">
                          {logoFile
                            ? logoFile.name
                            : identityForm.logoUrl
                            ? t("auto.ClubDashboard.logo_existant_enregistre", "Logo existant enregistré")
                            : t("clubDashboard.defaultLogo", "Logo BYL utilisé par défaut")}
                          {uploadProgress > 0 ? ` · Upload ${uploadProgress}%` : ""}
                        </Text>
                        </HStack>
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

                <EmailNotificationPreferenceCard
                  compact
                  surfaceProps={theme.cardProps}
                  textColor={theme.textColor}
                  mutedText={theme.mutedText}
                  borderColor={theme.borderColor}
                  softBg={theme.surfaceSoft}
                  accentColor={theme.accentBlue}
                />

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
            <Alert status={error.includes(clubText("pas encore chargé")) ? "warning" : "error"} borderRadius="16px">
              <AlertIcon />
              {error}
            </Alert>
          )}

          {showClubTool && (
            <VStack align="stretch" spacing={{ base: 3, md: 4 }}>
              <Box overflowX="auto" pb={1}>
                <HStack as="nav" aria-label={t("clubDashboard.tools.management", "Gestion")} w="max-content" maxW="none" spacing={1} bg={theme.surfaceBgStrong} borderWidth="1px" borderColor={theme.borderColor} borderRadius="full" p={1}>
                  {[...CLUB_TOOLS].sort((a, b) => (a.key === "bulk" ? -1 : b.key === "bulk" ? 1 : 0)).map((tool) => (
                    <Button as={RouterLink} to={withAdminClub(tool.path)} key={tool.key} size="sm" borderRadius="full" px={{base:4,md:6}} h="40px"
                      aria-current={pageKind === tool.key ? "page" : undefined}
                      variant={pageKind === tool.key ? "solid" : "ghost"}
                      {...(pageKind === tool.key ? theme.primaryButtonProps : {})}>
                      {t(tool.labelKey, tool.fallback)}
                    </Button>
                  ))}
                </HStack>
              </Box>

              {showOffers && (
                <Tabs variant="soft-rounded" isLazy><TabList gap={2} mb={5} flexWrap="wrap">{['Mes offres','Inscriptions aux cours collectifs'].map(label=><Tab key={label} _selected={{bg:'gray.900',color:'white'}}>{clubText(label)}</Tab>)}</TabList><TabPanels><TabPanel p={0}><Stack spacing={5}>
                  {!isAdmin && <ClubSubscriptionPlans clients={summary?.clientDirectory || clubClients} />}
                  </Stack></TabPanel><TabPanel p={0}><ClubRegistrationSettings club={summary?.club} url={withAdminClub("/clubs/")} onSaved={loadSummary} theme={theme} /></TabPanel></TabPanels></Tabs>
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
                              {t("clubDashboard.goals.currentPeriod", "Période")} : {row.periodClientCount || 0} {clubText("client(s) ·")} {row.periodProgramCount || 0} {clubText("prog. ·")} {row.periodNutritionCount || 0} {clubText("nutrition ·")} {row.periodSessionCount || 0} {clubText("séance(s)")} </Text>
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
                <VStack data-tour="club-management" align="stretch" spacing={5}>
                  {!isAdmin && <Box id="priority-cancellations" tabIndex={-1} scrollMarginTop="100px"><SessionCancellationRequests onCount={setCancellationCount}/></Box>}
                  {!isAdmin && <Box id="priority-payments" tabIndex={-1} scrollMarginTop="100px"><ClubPaymentTasks onCount={setPaymentDueCount} /></Box>}
                  <Box py={2} px={1}>
                    <Stack direction={{ base: "column", lg: "row" }} justify="space-between" gap={4} align={{ base: "stretch", lg: "center" }}>
                      <Box maxW="720px">
                        <Heading size="sm">{t("clubDashboard.bulk.explainTitle", "À quoi sert cette page ?")}</Heading>
                        <Text color={theme.mutedText} fontSize="sm" mt={1}>
                          {t("clubDashboard.bulk.explainText", "Elle regroupe les dossiers qui demandent une action simple : assigner un programme, finaliser un bilan nutrition ou rattacher le bon pro. Rien n’est modifié automatiquement.")}
                        </Text>
                      </Box>
                      <Badge alignSelf={{ base: "flex-start", lg: "center" }} borderRadius="full" px={3} py={1}>
                        {t("clubDashboard.bulk.total", "{{count}} à traiter", { count: allClientsWithoutProgram.length + nutritionDrafts.length + unknownReferentItems.length + clubAlerts.length + paymentDueCount + cancellationCount })}
                      </Badge>
                    </Stack>
                  </Box>
              {clubAlerts.length > 0 && (
                <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                  {clubAlerts.map((alert) => (
                    <Box key={alert.title} {...theme.cardProps} p={4} borderTop="3px solid" borderTopColor={`${alert.tone}.400`}>
                      <Badge colorScheme={alert.tone} borderRadius="full" px={3} py={1} mb={3}>{t("clubDashboard.pages.bulk.title", "À traiter")}</Badge>
                      <Heading size="sm">{alert.title}</Heading>
                      <Text color={theme.mutedText} mt={2}>{alert.detail}</Text>
                      <Button size="sm" variant="outline" mt={4} onClick={alert.onClick}>{alert.action}</Button>
                    </Box>
                  ))}
                </SimpleGrid>
              )}

                  <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
                    {[
                      {
                        id: "priority-programs",
                        accent: "blue.400",
                        title: t("auto.ClubDashboard.clients_sans_programme", "Clients sans programme"),
                        detail: t("clubDashboard.bulk.noProgramDetail", "Ces clients existent dans le club mais n’ont aucun programme assigné. Le but est d’ouvrir leur dossier puis d’ajouter ou assigner un programme."),
                        items: allClientsWithoutProgram,
                        actionLabel: t("clubDashboard.bulk.openClients", "Traiter les clients"),
                        onMainAction: () => openClubView("clients"),
                        itemAction: (item) => openClientAsReferent(item),
                      },
                      {
                        id: "priority-nutrition",
                        accent: "teal.400",
                        title: t("clubDashboard.alerts.nutritionDrafts.short", "Bilans nutrition à finaliser"),
                        detail: t("clubDashboard.bulk.nutritionDetail", "Ces bilans sont en brouillon ou non partagés. Le but est de les ouvrir, corriger si besoin, puis les valider ou les partager."),
                        items: nutritionDrafts,
                        actionLabel: t("clubDashboard.bulk.openNutrition", "Traiter la nutrition"),
                        onMainAction: () => openClubView("nutrition"),
                        itemAction: (item) => navigate(`/clients/${item.clientId}/nutrition/${item.id}`),
                      },
                    ].map(({ id, accent, title, detail, items, actionLabel, onMainAction, itemAction }) => (
                      <Box id={id} tabIndex={-1} scrollMarginTop="100px" key={title} {...theme.cardProps} p={{base:4,md:5}} borderTop="3px solid" borderTopColor={accent}>
                        <HStack justify="space-between" mb={3}>
                          <Heading size="sm">{title}</Heading>
                          <Badge colorScheme={items.length ? "blue" : "gray"} borderRadius="full" px={3} py={1}>{items.length}</Badge>
                        </HStack>
                        <Text color={theme.mutedText} fontSize="sm" >{detail}</Text>
                        {items.length > 0 && <Flex justify="flex-end" mt={4}><Button size="sm" {...theme.primaryButtonProps} onClick={onMainAction}>
                          {actionLabel}
                        </Button></Flex>}
                        <VStack align="stretch" spacing={0} mt={3}>
                          {items.slice(0, 5).map((item) => (
                            <HStack key={`${title}:${item.id}`} justify="space-between" w="full" py={3} borderTopWidth="1px" borderColor={theme.borderColor} gap={3}>
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
                          <Box id="priority-referents" tabIndex={-1} scrollMarginTop="100px" {...theme.cardProps} borderTop="3px solid" borderTopColor="purple.400" p={{ base: 4, md: 5 }} overflowX="auto">
                    <Stack direction={{ base: "column", md: "row" }} justify="space-between" align={{ base: "stretch", md: "center" }} mb={4} gap={3}>
                      <Box>
                        <Heading size="sm">{t("clubDashboard.alerts.unknownReferents.short", "Référents à clarifier")}</Heading>
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
                          {unknownReferentItems.map((item) => {
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
            </VStack>
          )}

          {showCalendar && (
            <Box {...theme.cardProps} id="club-calendar" {...calendarPointerHandlers} data-tour="club-calendar" p={{ base: 5, md: 6 }}>
              <Stack direction={{ base: "column", md: "row" }} justify="space-between" gap={4} mb={4}>
                <HStack flexWrap="wrap" justify="flex-end" w="full">
                {planningDownload}
                <ClubCalendarConnect clubId={actionClubId}/>
                <Button size="sm" leftIcon={<AddIcon />} {...theme.primaryButtonProps} onClick={openCalendarAppointmentModal}>{t("exerciseCard.add", "Ajouter")}</Button>
                </HStack>
              </Stack>
              <Flex justify="space-between" align="center" flexWrap="wrap" gap={3} mb={3}>
                {coachLegend}
                <Box marginInlineStart="auto">{calendarCoachSelector}</Box>
              </Flex>
              <ClubMobileCalendar events={filteredCalendarEvents} colors={coachColors} onSelectEvent={openAppointmentDetail} />
              <Box display={{ base: "none", md: "block" }}
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
                  ".rbc-time-view .rbc-event, .rbc-time-view .rbc-addons-dnd-resizable": { display: "flex", flexDirection: "column", overflow: "hidden" },
                    ".rbc-time-view .rbc-addons-dnd-resizable": { height: "100%", minHeight: 0 },
                    ".rbc-time-view .rbc-event .rbc-event-content": { order: 0, flex: "0 0 auto", fontWeight: 800, fontSize: "13px", lineHeight: "16px", minHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
                    ".rbc-time-view .rbc-event .rbc-event-label": { order: 1, flex: "0 1 auto", fontSize: "10px", lineHeight: "12px", opacity: 0.85, minHeight: 0, overflow: "hidden" },
                    ".rbc-time-view .rbc-event": { padding: "2px 5px" },
                    ".rbc-event": {
                    borderRadius: "12px",
                    padding: "4px 8px",
                    border: "none",
                    boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                  },
                }}
              >
                  <DnDCalendar
                    key={calendarCulture}
                    date={calendarDate}
                    onNavigate={setCalendarDate}
                    view={calendarView}
                    onView={setCalendarView}
                    selectable={["week", "day"].includes(calendarView) && !isTouchDevice() ? "ignoreEvents" : false}
                    step={15}
                    timeslots={4}
                    onSelecting={previewCalendarSelection}
                    slotPropGetter={date => ({ "data-club-slot-time": date.getTime() })}
                    onSelectSlot={openSelectedCalendarSlot}
                  scrollToTime={calendarScrollTime}
                  localizer={localizer}
                  culture={calendarCulture}
                  formats={{ ...calendarFormats, ...getCalendarFormats(calendarCulture) }}
                  components={calendarComponents}
                    componentIdentity={calendarComponents}
                  tooltipAccessor={() => null}
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
                  draggableAccessor={(event) => !isTouchDevice() && (event?.type === "group" || event?.status !== "validée")}
                  resizableAccessor={(event) => !isTouchDevice() && (event?.type === "group" || event?.status !== "validée")}
                  eventPropGetter={calendarEventStyle}
                  dayLayoutAlgorithm="no-overlap"
                  messages={{
                      ...getCalendarAgendaMessages(calendarCulture),
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

          {showTeam && (
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
            {showTeam && (
            <Box
              {...theme.cardProps}
              id="club-team"
              data-tour="club-team"
              p={{ base: 5, md: 6, xl: 7 }}
              gridColumn="1 / -1"
            >
              <Heading size="md" mb={4}>{t("auto.ClubDashboard.pros_du_club", "Pros du club")}</Heading>
              <Input
                type="search"
                value={teamSearch}
                onChange={(event) => setTeamSearch(event.target.value)}
                placeholder={t("clubDashboard.team.searchPlaceholder", "Rechercher un professionnel")}
                aria-label={t("clubDashboard.team.searchPlaceholder", "Rechercher un professionnel")}
                mb={4}
              />
              {searchedTeamPros.length === 0 ? (
                <Text color={theme.mutedText}>{teamSearch.trim()
                  ? t("clubDashboard.team.searchEmpty", "Aucun professionnel ne correspond à votre recherche.")
                  : t("auto.ClubDashboard.aucun_pro_rattache_pour_le_moment_creez_le_pr", "Aucun pro rattaché pour le moment. Créez le premier compte pour démarrer le suivi club.")}</Text>
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
                      {searchedTeamPros.map((coach) => (
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
                              {!coach.isManagedMember ? t("clubDashboard.team.toAttach", "À rattacher") : coach.status === "disabled" ? clubText("Suspendu") : clubText("Actif")}
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
                                  {coach.status === "disabled" ? clubText("Réactiver") : clubText("Suspendre")}
                                </Button>
                              )}
                              <Button size="xs" variant="ghost" onClick={() => openCoachDetail(coach)}>{t("auto.ClubDashboard.detail", "Détail")}</Button>
                              {coach.isManagedMember && (
                                <IconButton
                                  size="xs"
                                  colorScheme="red"
                                  variant="ghost"
                                  aria-label={clubText("Supprimer {{name}} du club", {name:displayName(coach)})}
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

          {showActivity && (
          <Box {...theme.cardProps} id="club-activity" data-tour="club-activity" p={{ base: 4, md: 5 }}>
            <Box>
                  <HStack justify="space-between" align="center" mb={4} gap={3} flexWrap="wrap">
                    <Heading size="sm">{t(CLUB_VIEWS.find((view) => view.key === activeView)?.labelKey, CLUB_VIEWS.find((view) => view.key === activeView)?.fallback)}</Heading>
                    <HStack spacing={2} ml="auto" flexWrap="wrap" justify="flex-end">
                      {activeView === "clients" && !isAdmin && <Button data-tour="club-client-import" size="sm" variant="outline" onClick={() => setImportClientsOpen(true)}>{clubText("Importer mes clients")}</Button>}
                      {activeView !== "stats" && <Badge borderRadius="full" px={3} py={1}>{t("clubDashboard.activity.visibleCount", "{{count}} affiché(s)", { count: activeView === "clients" ? searchedClients.length : activeActivityCount })}</Badge>}
                    </HStack>
                  </HStack>
                  <Stack direction={activeView === "clients" ? "row" : { base: "column", md: "row" }} spacing={3} mb={4} align={{ base: "stretch", md: "center" }}>
                  <Input
                    type="search"
                    value={activeView === "clients" ? clientSearch : activitySearch}
                    onChange={(event) => activeView === "clients"
                      ? setClientSearch(event.target.value)
                      : setActivitySearches((current) => ({ ...current, [activeView]: event.target.value }))}
                    placeholder={activeView === "clients" ? t("clientsList.searchPlaceholder", "Rechercher un client") : activeView === "nutrition" ? clubText("Rechercher un bilan, un patient ou un professionnel") : t(`clubDashboard.search.${activeView}`)}
                    aria-label={activeView === "clients" ? t("clientsList.searchPlaceholder", "Rechercher un client") : activeView === "nutrition" ? clubText("Rechercher un bilan, un patient ou un professionnel") : t(`clubDashboard.search.${activeView}`)}
                    flex={activeView === "clients" ? 1 : { base: "none", md: 1 }}
                    h="46px"
                    minH="46px"
                    px={4}
                    fontSize="16px"
                    minW={0}
                  />
                  {activeView === "stats" && (
                      <SimpleGrid columns={3} spacing={2}>
                        {[
                          ["day", t("clubDashboard.periods.day", "Journalier")],
                          ["month", t("clubDashboard.periods.month", "Mensuel")],
                          ["year", t("clubDashboard.periods.year", "Annuel")],
                        ].map(([period, label]) => (
                          <Button
                            key={period}
                            size="sm"
                            aria-pressed={statsPeriod === period}
                            variant={statsPeriod === period ? "solid" : "outline"}
                            {...(statsPeriod === period ? theme.primaryButtonProps : {})}
                            onClick={() => setStatsPeriod(period)}
                          >
                            {label}
                          </Button>
                        ))}
                      </SimpleGrid>
                  )}
                  <Menu closeOnSelect={false} placement="bottom-end" strategy="fixed" boundary="clippingParents" gutter={8}>
                    {["clients","nutrition"].includes(activeView) ? <MenuButton as={IconButton} aria-label={clubText("Filtres")} title={clubText("Filtres")} icon={<Icon as={MdFilterList} boxSize="20px" />} variant="outline" w="44px" minW="44px" h="46px" flexShrink={0} colorScheme={activityCoachFilter.length || (activeView === "clients" && (clientStatusFilter !== "all" || clientSort !== "firstName")) || (activeView === "nutrition" && (nutritionStatusFilter !== "all" || nutritionSort !== "activity")) ? "blue" : undefined} /> : <MenuButton as={Button} size="sm" variant="outline" rightIcon={<ChevronDownIcon />}>
                      {t("clubDashboard.filters.choosePros", "Choisir un ou plusieurs pros")}
                    </MenuButton>}
                    <Portal>
                    <MenuList minW={0} w="320px" maxW="calc(100vw - 24px)" maxH={{ base: "min(35dvh, 280px)", md: "min(50vh, 420px)" }} zIndex={1500} overflowY="auto" overscrollBehavior="contain" sx={{ "& [role^=menuitem]": { whiteSpace: "normal", overflowWrap: "anywhere" } }}>
                      {["clients","nutrition"].includes(activeView) && <>
                        <MenuOptionGroup title={clubText("Trier par")} type="radio" value={activeView==="nutrition"?nutritionSort:clientSort} onChange={activeView==="nutrition"?setNutritionSort:setClientSort}>
                          <MenuItemOption value="firstName">{clubText("Prénom (A–Z)")}</MenuItemOption>
                          <MenuItemOption value="lastName">{clubText("Nom (A–Z)")}</MenuItemOption>
                          <MenuItemOption value="activity">{t("clientView.lastActivity", "Dernière activité")}</MenuItemOption>
                        </MenuOptionGroup><MenuDivider />
                      </>}
                      {activeView === "clients" && !isAdmin && <>
                        <MenuOptionGroup title={clubText("État du client")} type="radio" value={clientStatusFilter} onChange={setClientStatusFilter}>
                          {[["all", clubText("Tous les états")], ["active", clubText("Clients actifs")], ["disabled", clubText("Clients désactivés / anciens")], ["unpaid", clubText("Impayés")], ["contract_end", clubText("Fins de contrat")], ["left", clubText("Anciens membres")], ["suspended", clubText("Accès aux cours suspendu")], ["scheduled", clubText("Entrées à venir")]].map(([value, label]) => <MenuItemOption key={value} value={value}>{label}</MenuItemOption>)}
                        </MenuOptionGroup>
                        <MenuDivider />
                      </>}
                      {activeView==="nutrition"&&<><MenuOptionGroup title={clubText('État du bilan')} type="radio" value={nutritionStatusFilter} onChange={setNutritionStatusFilter}>{[['all','Tous les bilans'],['Brouillon','Brouillons'],['En cours','En cours'],['Validé','Validés'],['Partagé','Partagés avec le patient']].map(([value,label])=><MenuItemOption key={value} value={value}>{clubText(label)}</MenuItemOption>)}</MenuOptionGroup><MenuDivider/></>}
                      <MenuOptionGroup title={["clients","nutrition"].includes(activeView) ? clubText("Professionnels") : undefined}
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
                      {["clients","nutrition"].includes(activeView) && <>
                        <MenuDivider />
                        <MenuItem onClick={() => { setActivityCoachFilter([]); if(activeView==="nutrition"){setNutritionStatusFilter("all");setNutritionSort("activity");}else{setClientStatusFilter("all"); setClientSort("firstName");} }}>{clubText("Réinitialiser les filtres")}</MenuItem>
                      </>}
                    </MenuList>
                    </Portal>
                  </Menu>
                    {!["clients","nutrition"].includes(activeView) && activityCoachFilter.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setActivityCoachFilter([])}>
                        {t("auto.ClubDashboard.voir_tout_le_club", "Voir tout le club")}
                      </Button>
                    )}
                  </Stack>
                  {activeView !== "clients" && selectedActivityCoaches.length > 0 && (
                    <HStack spacing={2} mb={4} flexWrap="wrap">
                      {selectedActivityCoaches.map((coach) => (
                        <Badge key={coach.uid} borderRadius="full">{displayName(coach)}</Badge>
                      ))}
                    </HStack>
                  )}
              {activeView === "clients" && (
                <>
                  {searchedClients.length === 0 ? (
                    <Text color={theme.mutedText}>{clientSearch.trim() ? t("clientsList.searchEmpty", "Aucun client ne correspond à votre recherche.") : t("auto.ClubDashboard.aucun_client_dans_ce_perimetre", "Aucun client dans ce périmètre.")}</Text>
                  ) : (
                    <>
                    <Stack key={`${clientSort}:${clientSearch}:${clientStatusFilter}:${activityCoachFilter.join(",")}`} display={{ base: "flex", md: "none" }} spacing={2} maxH="440px" overflowY="auto" overflowX="hidden" tabIndex={0} role="region" aria-label={t("auto.CoachMobileNav.clients", "Clients")} pr={1} sx={{ scrollbarGutter: "stable" }}>
                      {searchedClients.map(client => {
                        const state = clientState(client);
                        const expanded = !!expandedClientCards[client.id];
                        const fields = [
                          [t("auto.ClubDashboard.pro_referent", "Pro référent"), displayCoachName(client.coachName)],
                          [t("clientView.lastActivity", "Dernière activité"), formatDate(client.activityAt)],
                          [t("clientsList.table.programs", "Programmes"), client.membershipAccess === 'left' ? '—' : client.programCount || 0],
                          [t("clientsList.table.progress", "Progression"), client.membershipAccess === 'left' ? '—' : `${Number.isFinite(Number(client.completionPercent)) ? Math.round(Number(client.completionPercent)) : 0}%`],
                        ];
                        return <Box key={client.id} borderWidth="1px" borderColor={theme.borderColor} borderRadius="14px" p={3} minW={0} flexShrink={0} bg={theme.surfaceBgStrong}>
                          <Button variant="ghost" w="full" h="auto" p={0} justifyContent="space-between" whiteSpace="normal" aria-expanded={expanded} onClick={() => setExpandedClientCards(current => ({...current, [client.id]: !current[client.id]}))} rightIcon={<ChevronDownIcon transform={expanded ? "rotate(180deg)" : undefined} />}><Box flex="1" textAlign="left" minW={0}><Flex justify="space-between" align="start" gap={2} flexWrap="wrap">
                            <Text fontSize="sm" fontWeight="800" overflowWrap="anywhere" color={state.disabled ? 'gray.500' : undefined} textDecoration={state.disabled ? 'line-through' : undefined}>{client.name}</Text>
                            {!isAdmin && <Badge colorScheme={state.color} flexShrink={0}>{state.label}</Badge>}
                          </Flex><Text fontSize="xs" fontWeight="normal" color={theme.mutedText} mt={1} overflowWrap="anywhere">{displayCoachName(client.coachName)}</Text></Box></Button>
                          {expanded && <>
                          <Text mt={1} fontSize="xs" color={theme.mutedText} overflowWrap="anywhere">{client.email}</Text>
                          {!isAdmin && client.leftAt && <Text fontSize="xs" mt={1} color={theme.mutedText}>{clubText("Depuis le")} {new Date(client.leftAt).toLocaleDateString(clubLocale())}</Text>}
                          <SimpleGrid columns={2} columnGap={3} rowGap={1} mt={2}>
                            {fields.map(([label, value]) => <Box key={label} minW={0}><Text fontSize="xs" color={theme.mutedText}>{label}</Text><Text fontSize="xs" fontWeight="600" overflowWrap="anywhere">{value}</Text></Box>)}
                          </SimpleGrid>
                          <Flex justify="flex-end" mt={2}><Button size="xs" variant="outline" maxW="full" whiteSpace="normal" h="auto" minH="32px" py={1} onClick={() => openClientAsReferent(client)}>{t("programs.open", "Ouvrir")}</Button></Flex>
                          </>}
                        </Box>;
                      })}
                    </Stack>
                    <Box display={{ base: "none", md: "block" }} overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>{t("clientsList.table.client", "Client")}</Th>
                          {!isAdmin && <Th>{clubText("État")}</Th>}
                          <Th>{t("auto.ClubDashboard.pro_referent", "Pro référent")}</Th>
                          <Th>{t("clientsList.table.programs", "Programmes")}</Th>
                          <Th>{t("clientsList.table.progress", "Progression")}</Th>
                          <Th>{t("clientView.lastActivity", "Dernière activité")}</Th>
                          <Th>{t("nutritionCoach.table.actions", "Actions")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {searchedClients.map((client) => (
                          <Tr key={client.id}>
                            <Td>
                              <Button variant="link" h="auto" minW={0} textAlign="left" whiteSpace="normal" fontWeight="800" color={clientState(client).disabled ? 'gray.500' : 'inherit'} textDecoration={clientState(client).disabled ? 'line-through' : undefined} onClick={() => openClientAsReferent(client)}>{client.name}</Button>
                              <Text fontSize="xs" color={theme.mutedText}>{client.email}</Text>
                            </Td>
                            {!isAdmin && <Td>
                              <Badge whiteSpace="nowrap" colorScheme={clientState(client).color}>{clientState(client).label}</Badge>
                              {client.leftAt ? <Text fontSize="xs" color={theme.mutedText}>{clubText("Depuis le")} {new Date(client.leftAt).toLocaleDateString(clubLocale())}</Text> : null}
                            </Td>}
                            <Td>{displayCoachName(client.coachName)}</Td>
                            <Td>{client.membershipAccess === 'left' ? '—' : client.programCount || 0}</Td>
                            <Td>{client.membershipAccess === 'left' ? '—' : Number.isFinite(Number(client.completionPercent)) ? `${Math.round(Number(client.completionPercent))}%` : "0%"}</Td>
                            <Td>{formatDate(client.activityAt)}</Td>
                            <Td>
                              <Button size="sm" onClick={() => openClientAsReferent(client)}>{clubText("Ouvrir la fiche client")}</Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    </Box>
                    </>
                  )}
                  <FormerClubClients urlFor={withAdminClub} onChanged={loadSummary} onAdministration={openClientAsReferent} />
                </>
              )}

              {activeView === "programs" && (
                <>
                  {searchedPrograms.length === 0 ? (
                    <Text color={theme.mutedText}>{activitySearch.trim() ? t("clubDashboard.search.empty") : t("auto.ClubDashboard.aucun_programme_dans_ce_perimetre", "Aucun programme dans ce périmètre.")}</Text>
                  ) : (
                    <Box overflowX="auto">
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
                        {searchedPrograms.map((program) => (
                          <Tr key={program.id}>
                            <Td fontWeight="800">{program.title}</Td>
                            <Td>{program.clientName || clubText("Bibliothèque pro")}</Td>
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
                    </Box>
                  )}
                </>
              )}

              {activeView === "nutrition" && (
                <>
                  {searchedNutrition.length === 0 ? (
                    <Text color={theme.mutedText}>{activitySearch.trim() ? t("clubDashboard.search.empty") : t("auto.ClubDashboard.aucun_bilan_nutrition_trouve_dans_ce_perimetr", "Aucun bilan nutrition trouvé dans ce périmètre.")}</Text>
                  ) : (
                    <Box overflowX="auto">
                    <Table size="sm">
                      <Thead>
                        <Tr>
                          <Th>{t("auto.ClubDashboard.bilan", "Bilan")}</Th>
                          <Th>{clubText("Patient")}</Th>
                          <Th>{t("auto.ClubDashboard.pro", "Pro")}</Th>
                          <Th>{t("nutritionCoach.table.status", "Statut")}</Th>
                          <Th>{t("nutritionCoach.table.actions", "Actions")}</Th>
                        </Tr>
                      </Thead>
                      <Tbody>
                        {searchedNutrition.map((assessment) => (
                          <Tr key={`${assessment.clientId}:${assessment.id}`}>
                            <Td>
                              <Text fontWeight="800">{assessment.objective}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{formatDate(assessment.activityAt)}</Text>
                            </Td>
                            <Td>{assessment.clientName}</Td>
                            <Td>{assessment.coachName}</Td>
                            <Td><Badge>{clubText(assessment.status)}</Badge></Td>
                            <Td>
                              <Button size="xs" variant="outline" onClick={() => navigate(`/clients/${assessment.clientId}/nutrition/${assessment.id}`)}>{t("programs.open", "Ouvrir")}</Button>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                    </Box>
                  )}
                </>
              )}

              {activeView === "stats" && (
                <>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
                    {[
                      [t("clubDashboard.stats.periodActivity", "Activité période"), periodClients.length + periodPrograms.length + periodNutrition.length + periodSessions.length, clubText("{{clients}} clients, {{programs}} programmes, {{nutrition}} bilans, {{sessions}} séances", {clients:periodClients.length, programs:periodPrograms.length, nutrition:periodNutrition.length, sessions:periodSessions.length})],
                      ...(!activeCoachFilterSet.size ? [[t("auto.ClubDashboard.pros_actifs", "Pros actifs"), stats.activeCoachCount || 0, `${stats.proCount || 0} pro(s) rattaché(s) au total`]] : []),
                      [t("auto.ClubDashboard.clients_suivis", "Clients suivis"), scopedClients.length, activeCoachFilterSet.size ? selectedActivityCoaches.map(displayName).join(", ") : clientUsage !== null ? clubText("{{count}}% de la capacité utilisée", {count:clientUsage}) : clubText("Tous pros confondus")],
                      [t("clientsList.table.programs", "Programmes"), scopedPrograms.length, t("clubDashboard.stats.programsHelp", "Créés ou assignés par l’équipe du club")],
                      [t("nav.nutrition", "Nutrition"), scopedNutrition.length, t("clubDashboard.trend.nutritionHelp")],
                      [t("clubDashboard.stats.sessionsPlayed", "Séances réalisées"), scopedSessions.length, t("clubDashboard.stats.sessionsPlayedHelp", "Sessions validées ou terminées avec un client")],
                    ].map(([label, value, helper]) => (
                      <Box key={label} {...theme.tileProps} p={4}>
                        <HStack justify="space-between" gap={4}>
                          <Box minW={0}>
                            <Text fontWeight="700">{label}</Text>
                            <Text color={theme.mutedText} fontSize="sm" mt={1}>{helper}</Text>
                          </Box>
                          <Text fontSize="2xl" fontWeight="900" flexShrink={0} textAlign="right">{value}</Text>
                        </HStack>
                      </Box>
                    ))}
                  </SimpleGrid>
                  <ClubActivityTrend clients={scopedClients} programs={scopedPrograms}
                    nutrition={scopedNutrition} sessions={scopedSessions}
                    period={statsPeriod} now={now} theme={theme} />
                    <Box {...theme.tileProps} p={4} mt={4}>
                      <Text fontWeight="900" mb={3}>{t("clubDashboard.stats.comparePros", "Comparer les pros")}</Text>
                      <VStack align="stretch" spacing={2}>
                        {searchedCoachComparisonRows.map((coach) => (
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
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodClientCount} {clubText("client(s)")}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodProgramCount} {t("clubDashboard.stats.programsShort", "prog. créés")}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodNutritionCount} {t("clubDashboard.views.nutrition")}</Text>
                              <Text fontSize="xs" color={theme.mutedText}>{coach.periodSessionCount} {t("clubDashboard.stats.sessionsShort", "séance(s)")}</Text>
                            </SimpleGrid>
                          </Box>
                        ))}
                        {searchedCoachComparisonRows.length === 0 && <Text color={theme.mutedText}>{activitySearch.trim() ? t("clubDashboard.search.empty") : t("auto.ClubDashboard.aucun_pro_pour_le_moment", "Aucun pro pour le moment.")}</Text>}
                      </VStack>
                    </Box>
                </>
              )}
            </Box>
          </Box>
          )}
        </VStack>
      </Container>
      <Modal isOpen={Boolean(showTeam && selectedCoach)} onClose={() => setSelectedCoachUid("")} isCentered size="md" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="22px" mx={4} maxH="85dvh">
          <ModalHeader pr={12}>{selectedCoach && displayName(selectedCoach)}</ModalHeader>
          <ModalCloseButton />
          {selectedCoach && (
            <ModalBody pb={6}>
              <VStack align="stretch" spacing={4}>
                <Box>
                  <HStack flexWrap="wrap" mb={2}>
                    <Badge colorScheme={!selectedCoach.isManagedMember ? "orange" : selectedCoach.status === "disabled" ? "red" : "green"} borderRadius="full">
                      {!selectedCoach.isManagedMember ? t("clubDashboard.team.detectedReferent", "Référent détecté") : selectedCoach.status === "disabled" ? t("common.suspended", "Suspendu") : t("common.active", "Actif")}
                    </Badge>
                    <Text fontSize="sm" color={theme.mutedText}>{proTypeLabel(selectedCoach.proType)}</Text>
                  </HStack>
                  <Text fontSize="sm" color={theme.mutedText} overflowWrap="anywhere">
                    {selectedCoach.email || t("clubDashboard.team.noMemberEmail", "Compte pro non rattaché")}
                  </Text>
                </Box>
                <SimpleGrid columns={2} spacing={3}>
                  <HStack {...theme.tileProps} p={4} justify="space-between" gap={3} gridColumn="1 / -1">
                    <Box>
                      <Text fontSize="lg" fontWeight="700">{t("auto.ClubDashboard.clients_suivis", "Clients suivis")}</Text>
                      <Text fontSize="sm" color={theme.mutedText} mt={1}>
                        {selectedCoach.proType === "complete"
                          ? t("footer.resourcesSportNutrition", "Sport et nutrition")
                          : selectedCoach.proType === "nutrition" ? t("nav.nutrition", "Nutrition") : t("common.sport", "Sport")}
                      </Text>
                    </Box>
                    <Text fontSize="3xl" fontWeight="800">{selectedCoach.clientCount || 0}</Text>
                  </HStack>
                  {[
                    [t("auto.ClubDashboard.programmes_crees", "Programmes créés"), selectedCoach.programCount || 0],
                    ...(["nutrition", "complete"].includes(selectedCoach.proType) || selectedCoach.nutritionCount > 0
                      ? [[t("nav.nutrition", "Nutrition"), selectedCoach.nutritionCount || 0]]
                      : []),
                  ].map(([label, value]) => (
                    <HStack key={label} {...theme.tileProps} p={3} justify="space-between" gap={2}>
                      <Text fontSize="sm">{label}</Text>
                      <Text fontSize="xl" fontWeight="800">{value}</Text>
                    </HStack>
                  ))}
                </SimpleGrid>
                <Button {...theme.primaryButtonProps} onClick={() => {
                  setActivityCoachFilter([selectedCoach.uid]);
                  setSelectedCoachUid("");
                  openClubView("clients");
                }}>{t("auto.ClubDashboard.voir_ses_clients", "Voir ses clients")}</Button>
                <Button variant="outline" onClick={() => {
                  setActivityCoachFilter([selectedCoach.uid]);
                  setActivitySearches((previous) => ({ ...previous, stats: "" }));
                  setSelectedCoachUid("");
                  openClubView("stats");
                }}>{clubText("Voir ses statistiques")}</Button>
                {selectedCoach.isManagedMember && (
                  <>
                    <Button variant="outline" onClick={() => {
                      planAppointmentForCoach(selectedCoach);
                      setSelectedCoachUid("");
                    }}>{t("auto.ClubDashboard.planifier_un_rdv", "Planifier un RDV")}</Button>
                  </>
                )}
              </VStack>
            </ModalBody>
          )}
        </ModalContent>
      </Modal>
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
              {isNetworkClubPack ? clubText("Contacter BYL") : clubText("Voir les packs")}
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
      <ClubAppointmentDialog {...{appointmentDetailModal, appointmentDetailLoading, appointmentDetailError, appointmentDetailRequest, openAppointmentDetail, selectedAppointment, theme, formatShortDateTime, appointmentEditForm, setAppointmentEditForm, coaches, displayName, groupClients, groupClientsLoading, groupClientsError, actionSaving, deleteAppointment, saveAppointmentEdit}}/>
      <Modal isOpen={isAddAppointmentModalOpen} onClose={closeCalendarAppointmentModal} isCentered scrollBehavior="inside">
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
          <Box as="form" onSubmit={createAppointment} display="flex" flexDirection="column" minH={0} overflow="hidden">
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
                            capacity: current.capacity || 10, participantIds: current.participantIds || [],
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
                    <option value="group">{t("clubDashboard.group.title", "Cours collectif")}</option>
	                  </Select>
	                </FormControl>
	                {!["internal", "group"].includes(appointmentForm.type) && (
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
                {appointmentForm.type === "group" && <ClubGroupFields manageParticipants={false} value={appointmentForm} onChange={setAppointmentForm} clients={groupClients} loading={groupClientsLoading} error={groupClientsError} />}
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
                        setAppointmentForm((current) => ({ ...current, appointmentKind: nextKind, title: clubText(label) }));
                      }}
                    >
                      {NUTRITION_APPOINTMENT_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {clubText(item.label)}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                )}
                <FormControl>
                  <FormLabel>{t("auto.ClubDashboard.titre", "Titre")}</FormLabel>
                  <Input
                    {...theme.inputProps}
                    required={appointmentForm.type === "group"}
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
                    {[...new Set([...APPOINTMENT_DURATIONS, appointmentForm.durationMin])].sort((a, b) => a - b).map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {clubText("{{count}} minutes", {count:minutes})}
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
                  <Box>
                    <FormControl>
                      <FormLabel>{t("clubDashboard.recurrence.label", "Répétition")}</FormLabel>
                      <Select value={appointmentForm.recurrenceFrequency || "none"} onChange={e => setAppointmentForm(current => ({ ...current, recurrenceFrequency: e.target.value }))}>
                        <option value="none">{t("clubDashboard.recurrence.none", "Ne pas répéter")}</option>
                        <option value="daily">{t("clubDashboard.recurrence.daily", "Chaque jour")}</option>
                        <option value="weekly">{t("clubDashboard.recurrence.weekly", "Chaque semaine")}</option>
                        <option value="monthly">{t("clubDashboard.recurrence.monthly", "Chaque mois")}</option>
                      </Select>
                    </FormControl>
                    {appointmentForm.recurrenceFrequency && appointmentForm.recurrenceFrequency !== "none" && <>
                      <FormControl isRequired mt={3}>
                        <FormLabel>{t("clubDashboard.recurrence.until", "Jusqu’au (inclus)")}</FormLabel>
                        <Input type="date" min={appointmentForm.startsAt?.slice(0,10)} value={appointmentForm.recurrenceUntil || ""} onChange={e => setAppointmentForm(current => ({ ...current, recurrenceUntil: e.target.value }))} />
                      </FormControl>
                      <Text mt={2} fontSize="xs" color={theme.mutedText}>{appointmentForm.type === "group" ? clubText("Inscriptions indépendantes pour chaque séance.") : clubText("Même horaire et même client. Chaque rendez-vous reste modifiable séparément.")} {appointmentForm.clientId && !["group", "internal"].includes(appointmentForm.type) ? clubText("166 rendez-vous maximum par série.") : clubText("Un an maximum.")}</Text>
                    </>}
                  </Box>
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
