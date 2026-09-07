// src/pages/AdminGeo.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  SimpleGrid,
  Card,
  CardHeader,
  CardBody,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  HStack,
  Input,
  Tag,
  Text,
  Button,
  Progress,
  useToast,
  Switch,
  FormControl,
  FormLabel,
  Select,
  Stack,
  Badge,
  VStack,
  Icon,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";

// ====== Carte 2D (Leaflet)
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, CircleMarker, Popup, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from "firebase/firestore";

import AppLoading from "../components/ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import { MdArrowBack } from "react-icons/md";
import { getApiBase } from "../utils/apiBase";
import { getAuthHeaders } from "../utils/authHeaders";
import { useAuth } from "../AuthContext";
import { db } from "../firebase";
import i18n from "../i18n/index";

/* ------------------------------------ utils ------------------------------------ */
async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    if (response.status >= 500 && response.headers.get("content-type")?.includes("text/plain")) {
      return { error: "API locale indisponible : démarre le backend avec npm run dev:api." };
    }
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    if (response.status >= 500 && response.headers.get("content-type")?.includes("text/plain")) {
      return { error: "API locale indisponible : démarre le backend avec npm run dev:api." };
    }
    return { error: text };
  }
}

function fmtDay(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i += 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(fmtDay(d));
  }
  return out;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDate(value) {
  if (!value) return null;
  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatVisitPlace(visit = {}) {
  const city = String(visit.city || "").trim();
  const country = String(visit.country || "").trim().toUpperCase();
  const label = [
    city && city.toLowerCase() !== "unknown" ? city : "",
    country && country !== "UN" ? country : "",
  ]
    .filter(Boolean)
    .join(", ");
  return label;
}

function getLocalPageviewDay() {
  try {
    return localStorage.getItem("BYL_LAST_PAGEVIEW_DAY") || "";
  } catch {
    return "";
  }
}

function cleanText(value, max = 120, fallback = "") {
  const text = String(value || "").trim();
  return (text || fallback).slice(0, max);
}

function slug(value) {
  return String(value || "unknown")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unknown";
}

function makeGeoId(country, city) {
  const safeCountry = cleanText(country, 2, "UN").toUpperCase();
  const safeCity = cleanText(city, 120, "unknown");
  return `${safeCountry}__${slug(safeCity)}`;
}

function isKnownGeo(country, city) {
  return (
    cleanText(country, 2, "UN").toUpperCase() !== "UN" &&
    cleanText(city, 120, "unknown").toLowerCase() !== "unknown"
  );
}

function pickPersonName(data = {}, fallback = "") {
  return (
    `${data.firstName || ""} ${data.lastName || ""}`.trim() ||
    `${data.prenom || ""} ${data.nom || ""}`.trim() ||
    data.displayName ||
    data.name ||
    fallback
  );
}

function isNullIsland(lat, lng) {
  return lat === 0 && lng === 0;
}

function distanceKm(a, b) {
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function clusterGeoPoints(points, radiusKm) {
  if (!radiusKm) return points.map((point) => ({ ...point, members: [point], isCluster: false }));
  const groups = [];
  [...points]
    .sort((a, b) => Number(b.value || 0) - Number(a.value || 0))
    .forEach((point) => {
      const group = groups.find((candidate) => distanceKm(candidate, point) <= radiusKm);
      if (!group) {
        groups.push({ ...point, members: [point] });
        return;
      }
      group.members.push(point);
      const totalWeight = group.members.reduce((sum, member) => sum + Math.max(1, Number(member.value || 0)), 0);
      group.lat = group.members.reduce((sum, member) => sum + member.lat * Math.max(1, Number(member.value || 0)), 0) / totalWeight;
      group.lon = group.members.reduce((sum, member) => sum + member.lon * Math.max(1, Number(member.value || 0)), 0) / totalWeight;
      group.value = group.members.reduce((sum, member) => sum + Number(member.value || 0), 0);
    });
  return groups.map((group) => ({
    ...group,
    clusterId: group.members.map((member) => member.geoId).sort().join("|"),
    isCluster: group.members.length > 1,
  }));
}

function normalizedRole(role) {
  const value = String(role || "").toLowerCase();
  if (["client", "user", "particulier", "patient"].includes(value)) return "client";
  if (value.includes("coach")) return "coach";
  if (value.includes("club") || value.includes("salle")) return "club";
  if (value.includes("admin")) return "admin";
  return "unknown";
}

async function loadAdminGeoFromFirestore() {
  const today = fmtDay(new Date());
  const [geoSnap, dailySnap, hourlySnap, globalDailySnap, todayEventsSnap, todayVisitorsSnap] = await Promise.all([
    getDocs(collection(db, "analytics_geo")),
    getDocs(collection(db, "analytics_geo_daily")),
    getDocs(collection(db, "analytics_geo_hourly")),
    getDocs(collection(db, "analytics_daily")),
    getDocs(query(
      collection(db, "analytics_daily", today, "events"),
      orderBy("seenAt", "desc"),
      limit(120)
    )).catch(() => ({ docs: [] })),
    getDocs(query(
      collection(db, "analytics_daily", today, "visitors"),
      limit(120)
    )).catch(() => ({ docs: [] })),
  ]);

  const citiesBase = geoSnap.docs.map((docSnap) => {
    const x = docSnap.data() || {};
    const country = cleanText(x.country, 2, "UN").toUpperCase();
    const city = cleanText(x.city, 120, "unknown");
    const lat = typeof x.lat === "number" ? x.lat : null;
    const lon = typeof x.lon === "number" ? x.lon : null;
    const hasCoords = lat != null && lon != null && !isNullIsland(lat, lon);
    return {
      id: docSnap.id,
      geoId: docSnap.id,
      country,
      city,
      pv: Number(x.pv || 0),
      usersAllTime: Number(x.users || 0),
      lat: hasCoords ? lat : null,
      lon: hasCoords ? lon : null,
      lastSeenAt: toIso(x.lastSeenAt || x.updatedAt),
      updatedAt: toIso(x.updatedAt),
    };
  }).filter((row) => row.country !== "UN" && row.city.toLowerCase() !== "unknown");

  const geoDaily = dailySnap.docs.map((docSnap) => {
    const x = docSnap.data() || {};
    const [docDay, ...geoIdParts] = String(docSnap.id || "").split("__");
    const country = cleanText(x.country, 2, "UN").toUpperCase();
    const city = cleanText(x.city, 120, "unknown");
    return {
      id: docSnap.id,
      day: x.day || docDay || null,
      geoId: x.geoId || geoIdParts.join("__") || null,
      country,
      city,
      pv: Number(x.pv || 0),
      uniqueVisitors: Number(x.uniqueVisitors || 0),
      lastSeenAt: toIso(x.lastSeenAt || x.updatedAt),
      updatedAt: toIso(x.updatedAt),
    };
  }).filter((row) => row.country !== "UN" && row.city.toLowerCase() !== "unknown");

  const geoHourly = hourlySnap.docs.map((docSnap) => {
    const x = docSnap.data() || {};
    const country = cleanText(x.country, 2, "UN").toUpperCase();
    const city = cleanText(x.city, 120, "unknown");
    return {
      id: docSnap.id,
      day: x.day || null,
      hour: typeof x.hour === "number" ? x.hour : null,
      geoId: x.geoId || null,
      country,
      city,
      pv: Number(x.pv || 0),
      uniqueVisitors: Number(x.uniqueVisitors || 0),
      lastSeenAt: toIso(x.lastSeenAt || x.updatedAt),
      updatedAt: toIso(x.updatedAt),
    };
  }).filter((row) => row.country !== "UN" && row.city.toLowerCase() !== "unknown");

  const globalDaily = globalDailySnap.docs.map((docSnap) => {
    const x = docSnap.data() || {};
    const day = x.day || docSnap.id;
    return {
      id: docSnap.id,
      day,
      pv: Number(x.pageviews || x.pv || 0),
      uniqueVisitors: Number(x.uniqueVisitors || 0),
    };
  }).filter((row) => row.day);

  const visitorRows = todayVisitorsSnap.docs.map((docSnap) => {
    const x = docSnap.data() || {};
    const visitorId = x.visitorId || docSnap.id;
    const uid = String(visitorId || "").startsWith("uid:") ? String(visitorId).slice(4) : "";
    return {
      id: docSnap.id,
      visitorId,
      uid,
      role: cleanText(x.role, 40, "unknown"),
      pathFirst: cleanText(x.pathFirst, 180, ""),
      pathLast: cleanText(x.pathLast || x.pathFirst, 180, ""),
      country: cleanText(x.country, 2, "UN").toUpperCase(),
      city: cleanText(x.city, 120, "unknown"),
      lat: typeof x.lat === "number" ? x.lat : null,
      lng: typeof x.lng === "number" ? x.lng : null,
      timeZone: cleanText(x.timeZone, 80, ""),
      firstSeenAt: toIso(x.firstSeenAt),
      lastSeenAt: toIso(x.lastSeenAt || x.firstSeenAt),
      source: "firestore-visitor",
    };
  });

  const events = todayEventsSnap.docs.map((docSnap) => {
    const x = docSnap.data() || {};
    const visitorId = x.visitorId || "";
    const uid = cleanText(x.uid, 120, "") || (String(visitorId).startsWith("uid:") ? String(visitorId).slice(4) : "");
    return {
      id: `event:${docSnap.id}`,
      eventId: docSnap.id,
      visitorId,
      uid,
      role: cleanText(x.role, 40, "unknown"),
      pathFirst: cleanText(x.path, 180, ""),
      pathLast: cleanText(x.path, 180, ""),
      country: cleanText(x.country, 2, "UN").toUpperCase(),
      city: cleanText(x.city, 120, "unknown"),
      lat: typeof x.lat === "number" ? x.lat : null,
      lng: typeof x.lng === "number" ? x.lng : null,
      timeZone: cleanText(x.timeZone, 80, ""),
      firstSeenAt: toIso(x.seenAt),
      lastSeenAt: toIso(x.seenAt),
      source: "firestore-event",
    };
  });

  const recentBase = events.length > 0 ? events : visitorRows;
  const usersById = new Map();
  await Promise.all(
    [...new Set(recentBase.map((event) => event.uid).filter(Boolean))].map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        if (!snap.exists()) return;
        const data = snap.data() || {};
        usersById.set(uid, {
          name: pickPersonName(data, uid),
          email: data.email || "",
          role: data.role || "",
          location: data.location || null,
        });
      } catch {
        // Visitors remain visible even if user enrichment fails.
      }
    })
  );

  const recentVisitors = recentBase.map((event) => {
    const person = usersById.get(event.uid);
    return {
      ...event,
      personName: person?.name || (event.uid ? event.uid : "Visiteur anonyme"),
      email: person?.email || "",
      role: person?.role || event.role,
      country: event.country !== "UN" ? event.country : cleanText(person?.location?.country, 2, event.country).toUpperCase(),
      city: event.city.toLowerCase() !== "unknown" ? event.city : cleanText(person?.location?.city, 120, event.city),
      lat: event.lat != null ? event.lat : (typeof person?.location?.lat === "number" ? person.location.lat : null),
      lng: event.lng != null ? event.lng : (typeof person?.location?.lng === "number" ? person.location.lng : null),
    };
  }).sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));

  return { ok: true, today, citiesBase, geoDaily, geoHourly, globalDaily, recentVisitors };
}

async function loadAdminGeoData() {
  const response = await fetch(`${getApiBase()}/analytics/admin/geo`, {
    headers: { ...(await getAuthHeaders({ forceRefresh: true })) },
    credentials: "include",
    cache: "no-store",
  });
  const data = await readJsonResponse(response);
  if (response.ok) return { ...data, source: "api" };
  if (response.status === 404) {
    const fallbackData = await loadAdminGeoFromFirestore();
    return { ...fallbackData, source: "firestore-fallback" };
  }
  throw new Error(data?.error || `analytics-admin-geo-failed-${response.status}`);
}

// Fit map to markers
function FitToMarkers({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    const bounds = points.reduce(
      (acc, p) => acc.extend([p.lat, p.lon]),
      window.L.latLngBounds([points[0].lat, points[0].lon])
    );
    map.fitBounds(bounds.pad(0.2), { animate: true });
  }, [points, map]);
  return null;
}

function MapZoomListener({ onZoomChange }) {
  const map = useMapEvents({
    zoomend: () => onZoomChange(map.getZoom()),
  });
  useEffect(() => {
    onZoomChange(map.getZoom());
  }, [map, onZoomChange]);
  return null;
}

function MapFocusController({ target, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (!target || typeof target.lat !== "number" || typeof target.lon !== "number") return undefined;
    map.flyTo([target.lat, target.lon], Math.max(13, map.getZoom()), { animate: true, duration: 0.45 });
    const timer = window.setTimeout(() => {
      markerRefs.current.get(target.geoId)?.openPopup();
    }, 600);
    return () => window.clearTimeout(timer);
  }, [map, markerRefs, target]);
  return null;
}

// KPI card
function StatCard({ title, value, help }) {
  const theme = useAppTheme();
  return (
    <Stat {...theme.tileProps} p={4}>
      <StatLabel color={theme.mutedText}>{title}</StatLabel>
      <StatNumber color={theme.textColor}>{value}</StatNumber>
      {help && <StatHelpText color={theme.mutedText}>{help}</StatHelpText>}
    </Stat>
  );
}

const METRICS = [
  { key: "pv", label: "Visites" },
  { key: "uv", label: "Visiteurs uniques" }, // ✅ wording identique dashboard
];

const WINDOWS = [
  { key: "today", label: "Aujourd’hui" },
  { key: "7d", label: "7 jours" },
  { key: "30d", label: "30 jours" },
  { key: "all", label: "Toujours" },
];

/* ------------------------------------ Page ------------------------------------ */
export default function AdminGeo() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // base cities from analytics_geo
  // { geoId, country, city, pv, users, lat, lon }
  const [citiesBase, setCitiesBase] = useState([]);

  // geo daily docs (analytics_geo_daily)
  // { day, geoId, country, city, pv, uniqueVisitors }
  const [geoDaily, setGeoDaily] = useState([]);

  // geo hourly docs (analytics_geo_hourly)
  // { day, hour, geoId, country, city, pv, uniqueVisitors }
  const [geoHourly, setGeoHourly] = useState([]);

  // global daily docs (analytics_daily), source de vérité pour les compteurs globaux.
  const [globalDaily, setGlobalDaily] = useState([]);
  const [recentVisitors, setRecentVisitors] = useState([]);
  const [mapVisitors, setMapVisitors] = useState({});
  const [visitorHistories, setVisitorHistories] = useState({});
  const [expandedVisitorId, setExpandedVisitorId] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [localPageviewDay, setLocalPageviewDay] = useState(getLocalPageviewDay);

  const [metric, setMetric] = useState("uv"); // pv | uv
  const [windowKey, setWindowKey] = useState("today"); // today | 7d | 30d | all

  const [minVal, setMinVal] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [personSearch, setPersonSearch] = useState("");
  const [mergeRadiusKm, setMergeRadiusKm] = useState(2);
  const [mapZoom, setMapZoom] = useState(2);
  const [mapFocus, setMapFocus] = useState(null);
  const mapRef = useRef(null);
  const markerRefs = useRef(new Map());
  const visitorLoadKeysRef = useRef(new Set());

  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState(0);
  const [autoEnrich, setAutoEnrich] = useState(true);
  const autoRanRef = useRef(false);

  const toast = useToast();

  const theme = useAppTheme();
  const cardBg = theme.surfaceBg;
  const bubbleFill = theme.accentBlue;
  const bubbleStroke = theme.primary;
  const adminPageSx = {
    ".chakra-card": {
      bg: theme.surfaceBg,
      border: "1px solid",
      borderColor: theme.borderColor,
      borderRadius: "2xl",
      boxShadow: theme.cardProps.boxShadow,
      overflow: "hidden",
    },
    ".chakra-card__header": {
      borderBottom: "1px solid",
      borderColor: theme.borderColor,
    },
    ".chakra-table th": {
      color: theme.mutedText,
      borderColor: theme.borderColor,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      fontSize: "xs",
    },
    ".chakra-table td": { borderColor: theme.borderColor },
    ".chakra-input, .chakra-select": {
      bg: theme.surfaceSoft,
      borderColor: theme.borderColor,
    },
    ".leaflet-tooltip.geo-cluster-count": {
      bg: "transparent",
      border: 0,
      boxShadow: "none",
      color: "white",
      fontWeight: 800,
      fontSize: "12px",
    },
  };

  const todayKey = useMemo(() => fmtDay(new Date()), []);
  const handleMapZoomChange = useCallback((zoom) => setMapZoom(zoom), []);

  useEffect(() => {
    const handler = () => setLocalPageviewDay(getLocalPageviewDay());
    window.addEventListener("BYL_PAGEVIEW_MARKED", handler);
    return () => window.removeEventListener("BYL_PAGEVIEW_MARKED", handler);
  }, []);

  useEffect(() => {
    setVisitorHistories({});
    setExpandedVisitorId("");
  }, [windowKey]);

  // Load analytics via backend Admin SDK, with Firestore fallback if prod backend is behind.
  useEffect(() => {
    let mounted = true;

    (async () => {
      if (authLoading) return;
      setLoading(true);
      setLoadError("");
      try {
        if (!user?.uid || !isAdmin) {
          throw new Error("admin-session-required");
        }
        const data = await loadAdminGeoData();

        if (mounted) {
          setCitiesBase(Array.isArray(data.citiesBase) ? data.citiesBase : []);
          setGeoDaily(Array.isArray(data.geoDaily) ? data.geoDaily : []);
          setGeoHourly(Array.isArray(data.geoHourly) ? data.geoHourly : []);
          setGlobalDaily(Array.isArray(data.globalDaily) ? data.globalDaily : []);
          setRecentVisitors(Array.isArray(data.recentVisitors) ? data.recentVisitors : []);
          setLastLoadedAt(new Date());
        }
      } catch (e) {
        console.error("AdminGeo fetch error:", e);
        const message =
          e?.message === "admin-session-required"
            ? "Session admin non prête ou non autorisée."
            : `Erreur analytics admin: ${e?.message || "inconnue"}`;
        if (mounted) setLoadError(message);
        toast({ status: "error", description: message });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, [toast, authLoading, user?.uid, isAdmin]);

  const reloadAnalytics = useCallback(async ({ silent = false } = {}) => {
    if (!user?.uid || !isAdmin) throw new Error("admin-session-required");
    if (!silent) setRefreshing(true);
    try {
      const data = await loadAdminGeoData();
      setCitiesBase(Array.isArray(data.citiesBase) ? data.citiesBase : []);
      setGeoDaily(Array.isArray(data.geoDaily) ? data.geoDaily : []);
      setGeoHourly(Array.isArray(data.geoHourly) ? data.geoHourly : []);
      setGlobalDaily(Array.isArray(data.globalDaily) ? data.globalDaily : []);
      setRecentVisitors(Array.isArray(data.recentVisitors) ? data.recentVisitors : []);
      setLastLoadedAt(new Date());
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [user?.uid, isAdmin]);

  const loadMapVisitors = useCallback(async (point) => {
    if (!point?.geoId || !user?.uid || !isAdmin) return;
    const cacheKey = `${windowKey}:${point.geoId}`;
    if (visitorLoadKeysRef.current.has(cacheKey)) return;
    visitorLoadKeysRef.current.add(cacheKey);
    setMapVisitors((current) => ({
      ...current,
      [cacheKey]: { ...(current[cacheKey] || {}), loading: true, error: "" },
    }));
    try {
      const response = await fetch(
        `${getApiBase()}/analytics/admin/geo/${encodeURIComponent(point.geoId)}/visitors?window=${encodeURIComponent(windowKey)}`,
        {
          headers: { ...(await getAuthHeaders()) },
          credentials: "include",
          cache: "no-store",
        }
      );
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || `geo-visitors-${response.status}`);
      setMapVisitors((current) => ({
        ...current,
        [cacheKey]: { loading: false, error: "", visitors: Array.isArray(data.visitors) ? data.visitors : [] },
      }));
      return Array.isArray(data.visitors) ? data.visitors : [];
    } catch (error) {
      setMapVisitors((current) => ({
        ...current,
        [cacheKey]: { loading: false, error: error?.message || "geo-visitors-failed", visitors: [] },
      }));
      return [];
    } finally {
      visitorLoadKeysRef.current.delete(cacheKey);
    }
  }, [isAdmin, user?.uid, windowKey]);

  const loadVisitorHistory = useCallback(async (visitor) => {
    if (!visitor?.uid || !user?.uid || !isAdmin) return;
    setExpandedVisitorId((current) => current === visitor.visitorId ? "" : visitor.visitorId);
    if (visitorHistories[visitor.uid]?.history || visitorHistories[visitor.uid]?.loading) return;
    setVisitorHistories((current) => ({
      ...current,
      [visitor.uid]: { loading: true, error: "", history: null },
    }));
    const days = windowKey === "today" ? 1 : windowKey === "7d" ? 7 : windowKey === "30d" ? 30 : 120;
    try {
      const response = await fetch(
        `${getApiBase()}/analytics/admin/visitor/${encodeURIComponent(visitor.uid)}?days=${days}`,
        {
          headers: { ...(await getAuthHeaders()) },
          credentials: "include",
          cache: "no-store",
        }
      );
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || `visitor-history-${response.status}`);
      setVisitorHistories((current) => ({
        ...current,
        [visitor.uid]: { loading: false, error: "", history: data.history || null },
      }));
    } catch (error) {
      setVisitorHistories((current) => ({
        ...current,
        [visitor.uid]: { loading: false, error: error?.message || "visitor-history-failed", history: null },
      }));
    }
  }, [isAdmin, user?.uid, visitorHistories, windowKey]);

  useEffect(() => {
    if (authLoading || !user?.uid || !isAdmin) return undefined;
    const id = window.setInterval(() => {
      reloadAnalytics({ silent: true }).catch(() => {});
    }, 15000);
    return () => window.clearInterval(id);
  }, [authLoading, user?.uid, isAdmin, reloadAnalytics]);

  // Compute day set for selected window
  const daySet = useMemo(() => {
    if (windowKey === "today") return new Set([fmtDay(new Date())]);
    if (windowKey === "7d") return new Set(lastNDays(7));
    if (windowKey === "30d") return new Set(lastNDays(30));
    return null; // all-time
  }, [windowKey]);

  // Aggregate values per geoId depending on window + metric
  const aggByGeoId = useMemo(() => {
    // all-time comes from analytics_geo directly
    if (windowKey === "all") {
      const out = {};
      citiesBase.forEach((c) => {
        out[c.geoId] = metric === "pv" ? (c.pv || 0) : (c.usersAllTime || 0);
      });
      return out;
    }

    // otherwise use analytics_geo_daily
    const out = {};
    geoDaily.forEach((d) => {
      if (!d.geoId || !d.day) return;
      if (!daySet?.has(d.day)) return;

      const val = metric === "pv" ? (d.pv || 0) : (d.uniqueVisitors || 0);
      out[d.geoId] = (out[d.geoId] || 0) + val;
    });

    if (metric === "uv" && windowKey === "today") {
      const seenTodayVisitors = new Set();
      const fallbackByGeoId = {};
      recentVisitors.forEach((visit) => {
        const visitDate = toDate(visit.lastSeenAt || visit.firstSeenAt);
        if (!visitDate || fmtDay(visitDate) !== todayKey) return;
        if (!isKnownGeo(visit.country, visit.city)) return;
        const visitorKey = visit.visitorId || visit.uid || visit.id;
        const geoId = visit.geoId || makeGeoId(visit.country, visit.city);
        const uniqueKey = `${geoId}__${visitorKey || `${visit.country}-${visit.city}`}`;
        if (seenTodayVisitors.has(uniqueKey)) return;
        seenTodayVisitors.add(uniqueKey);
        fallbackByGeoId[geoId] = (fallbackByGeoId[geoId] || 0) + 1;
      });
      Object.entries(fallbackByGeoId).forEach(([geoId, count]) => {
        out[geoId] = Math.max(out[geoId] || 0, count);
      });
    }
    return out;
  }, [windowKey, metric, citiesBase, geoDaily, daySet, recentVisitors, todayKey]);

  // Merge base (coords/city) + aggregated value
  const cities = useMemo(() => {
    const byGeoId = new Map(
      citiesBase.map((c) => [
        c.geoId,
        {
          ...c,
          value: aggByGeoId[c.geoId] || 0,
        },
      ])
    );
    if (metric === "uv" && windowKey === "today") {
      recentVisitors.forEach((visit) => {
        const visitDate = toDate(visit.lastSeenAt || visit.firstSeenAt);
        if (!visitDate || fmtDay(visitDate) !== todayKey) return;
        if (!isKnownGeo(visit.country, visit.city)) return;
        const geoId = visit.geoId || makeGeoId(visit.country, visit.city);
        if (byGeoId.has(geoId)) return;
        byGeoId.set(geoId, {
          id: geoId,
          geoId,
          country: cleanText(visit.country, 2, "UN").toUpperCase(),
          city: cleanText(visit.city, 120, "unknown"),
          pv: 0,
          usersAllTime: 0,
          lat: typeof visit.lat === "number" && !isNullIsland(visit.lat, Number(visit.lng)) ? visit.lat : null,
          lon: typeof visit.lng === "number" && !isNullIsland(Number(visit.lat), visit.lng) ? visit.lng : null,
          lastSeenAt: visit.lastSeenAt || visit.firstSeenAt || null,
          updatedAt: visit.lastSeenAt || visit.firstSeenAt || null,
          value: aggByGeoId[geoId] || 0,
          _fromRecentVisitor: true,
        });
      });
    }
    const arr = [...byGeoId.values()];
    return arr.sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [citiesBase, aggByGeoId, metric, windowKey, recentVisitors, todayKey]);

  // KPI (global)
  const kpi = useMemo(() => {
    const total = cities.reduce((a, c) => a + (c.value || 0), 0);
    const nbCities = citiesBase.length;

    const byCountry = {};
    cities.forEach((c) => {
      byCountry[c.country] = (byCountry[c.country] || 0) + (c.value || 0);
    });

    const top = Object.entries(byCountry)
      .map(([k, v]) => ({ country: k, value: v }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)[0];
    const topCity = cities.find((c) => (c.value || 0) > 0);

    return {
      total,
      nbCities,
      topCountry: top?.country || "-",
      topCountryValue: top?.value || 0,
      topCity: topCity?.city || "-",
      topCityCountry: topCity?.country || "",
      topCityValue: topCity?.value || 0,
    };
  }, [cities, citiesBase.length]);

  const globalKpiTotal = useMemo(() => {
    const selectedDocs =
      windowKey === "all"
        ? globalDaily
        : globalDaily.filter((d) => d.day && daySet?.has(d.day));

    const fromGlobal = selectedDocs.reduce(
      (sum, d) => sum + (metric === "pv" ? Number(d.pv || 0) : Number(d.uniqueVisitors || 0)),
      0
    );
    const liveLocalVisitor =
      metric === "uv" && windowKey === "today" && localPageviewDay === todayKey ? 1 : 0;

    // Si la source globale n'existe pas encore, on garde le total géolocalisé.
    return Math.max(fromGlobal || kpi.total, liveLocalVisitor);
  }, [globalDaily, windowKey, daySet, metric, kpi.total, localPageviewDay, todayKey]);

  

  

  // Filter + search
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return cities
      .filter((c) => (c.value || 0) >= (minVal || 0))
      .filter((c) =>
        s
          ? (c.city || "").toLowerCase().includes(s) || (c.country || "").toLowerCase().includes(s)
          : true
      )
      .sort((a, b) => (b.value || 0) - (a.value || 0));
  }, [cities, minVal, search]);

  const peopleFilterActive = roleFilter !== "all" || Boolean(personSearch.trim());
  const visitorMatchesFilters = useCallback((visitor) => {
    if (roleFilter !== "all" && normalizedRole(visitor?.role) !== roleFilter) return false;
    const needle = personSearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!needle) return true;
    const haystack = `${visitor?.personName || ""} ${visitor?.email || ""}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    return haystack.includes(needle);
  }, [personSearch, roleFilter]);

  useEffect(() => {
    if (!peopleFilterActive) return;
    filtered.slice(0, 50).forEach((point) => {
      const cacheKey = `${windowKey}:${point.geoId}`;
      if (!mapVisitors[cacheKey]) loadMapVisitors(point);
    });
  }, [filtered, loadMapVisitors, mapVisitors, peopleFilterActive, windowKey]);

  const visibleCities = useMemo(() => {
    if (!peopleFilterActive) return filtered;
    return filtered.filter((point) => {
      const state = mapVisitors[`${windowKey}:${point.geoId}`];
      if (!state || state.loading) return true;
      return (state.visitors || []).some(visitorMatchesFilters);
    });
  }, [filtered, mapVisitors, peopleFilterActive, visitorMatchesFilters, windowKey]);
  const displayedRecentVisitors = useMemo(
    () => recentVisitors.filter(visitorMatchesFilters),
    [recentVisitors, visitorMatchesFilters]
  );

  const peopleFilterLoading = peopleFilterActive && filtered.some((point) => {
    const state = mapVisitors[`${windowKey}:${point.geoId}`];
    return !state || state.loading;
  });

  const mapPoints = useMemo(
    () => visibleCities.filter((c) => typeof c.lat === "number" && typeof c.lon === "number"),
    [visibleCities]
  );

  const visualClusterRadiusKm = useMemo(() => {
    if (mapZoom <= 4) return 700;
    if (mapZoom <= 6) return 250;
    if (mapZoom <= 8) return 75;
    if (mapZoom <= 10) return 15;
    if (mapZoom <= 12) return mergeRadiusKm;
    return 0;
  }, [mapZoom, mergeRadiusKm]);
  const renderedMapPoints = useMemo(
    () => clusterGeoPoints(mapPoints, visualClusterRadiusKm),
    [mapPoints, visualClusterRadiusKm]
  );
  const focusCityOnMap = useCallback((city) => {
    if (typeof city?.lat !== "number" || typeof city?.lon !== "number") return;
    loadMapVisitors(city);
    setMapFocus({ ...city, requestId: Date.now() });
  }, [loadMapVisitors]);

  // Dernière visite active aujourd’hui par ville (selon métrique)
  const lastVisitByGeoIdToday = useMemo(() => {
    const out = {}; // geoId -> { lastHour, lastValue, lastSeenAt }
    geoHourly.forEach((h) => {
      if (!h.geoId || !h.day || h.hour == null) return;
      if (h.day !== todayKey) return;

      const val = metric === "pv" ? (h.pv || 0) : (h.uniqueVisitors || 0);
      if (val <= 0) return;

      const seenMs = toDate(h.lastSeenAt || h.updatedAt)?.getTime() || 0;
      const prev = out[h.geoId];
      if (!prev || seenMs > prev.seenMs || (!seenMs && h.hour > prev.lastHour)) {
        out[h.geoId] = {
          lastHour: h.hour,
          lastValue: val,
          lastSeenAt: h.lastSeenAt || h.updatedAt || "",
          seenMs,
        };
      }
    });

    geoDaily.forEach((d) => {
      if (!d.geoId || d.day !== todayKey) return;
      const val = metric === "pv" ? (d.pv || 0) : (d.uniqueVisitors || 0);
      const seenMs = toDate(d.lastSeenAt || d.updatedAt)?.getTime() || 0;
      if (!seenMs) return;
      const prev = out[d.geoId];
      if (!prev || seenMs > prev.seenMs) {
        out[d.geoId] = {
          lastHour: new Date(seenMs).getHours(),
          lastValue: val,
          lastSeenAt: d.lastSeenAt || d.updatedAt || "",
          seenMs,
        };
      }
    });
    return out;
  }, [geoDaily, geoHourly, todayKey, metric]);

  // Eligible for geocoding
  const eligibleToGeocode = (c) =>
    (c.lat == null || c.lon == null) &&
    c.country &&
    c.country !== "UN" &&
    c.city &&
    String(c.city).toLowerCase() !== "unknown";

  // Enrich coords
  const enrichMissingCoords = async (source = "manual") => {
    const missing = filtered.filter(eligibleToGeocode);

    if (missing.length === 0) {
      if (source === "manual") {
        toast({ status: "success", description: i18n.t("auto.AdminGeo.toutes_les_villes_affichees_ont_des_coordonnees", "Toutes les villes affichées ont des coordonnées.") });
      }
      return;
    }

    setEnriching(true);
    setProgress(0);

    const batch = source === "auto" ? Math.min(missing.length, 30) : missing.length;
    const toProcess = missing.slice(0, batch);

    try {
      const response = await fetch(`${getApiBase()}/analytics/admin/geo/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders({ forceRefresh: true })) },
        credentials: "include",
        body: JSON.stringify({ geoIds: toProcess.map((city) => city.geoId), limit: batch }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data?.error || "analytics-geo-enrich-failed");
      setProgress(100);
      if (Array.isArray(data.updated) && data.updated.length > 0) {
        await reloadAnalytics();
      }
    } catch (e) {
      console.warn("geocode error", e);
      if (source === "manual") {
        toast({ status: "error", description: i18n.t("auto.AdminGeo.enrichissement_impossible_via_l_api_admin", "Enrichissement impossible via l’API admin.") });
      }
    } finally {
      setEnriching(false);
    }

    if (source === "manual") {
      toast({ status: "success", description: i18n.t("auto.AdminGeo.enrichissement_termine", "Enrichissement terminé.") });
    }
  };

  // Auto-run once
  useEffect(() => {
    if (loading) return;
    if (autoRanRef.current) return;
    if (!autoEnrich) return;

    const hasMissingEligible = filtered.some(eligibleToGeocode);
    if (!hasMissingEligible) {
      autoRanRef.current = true;
      return;
    }
    autoRanRef.current = true;
    enrichMissingCoords("auto");
     
  }, [loading, autoEnrich, filtered]);

  const windowLabel = WINDOWS.find((w) => w.key === windowKey)?.label || "30 jours";

  const maxVal = useMemo(() => {
    const m = Math.max(1, ...cities.map((c) => c.value || 0));
    return Math.max(10, Math.ceil(m));
  }, [cities]);

  // ✅ label UI clarifié pour la fenêtre "Toujours" en visiteurs uniques
  const metricLabelUi = useMemo(() => {
    if (metric !== "uv") return "Visites";
    return windowKey === "all" ? "Visiteurs uniques (toujours)" : "Visiteurs uniques";
  }, [metric, windowKey]);

  if (loading) {
    return <AppLoading label={i18n.t("auto.AdminGeo.chargement_de_la_geographie", "Chargement de la géographie...")} />;
  }

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" sx={adminPageSx}>
      <VStack align="stretch" spacing={6} maxW="1680px" mx="auto">
      <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
        <Button
          variant="outline"
          leftIcon={<Icon as={MdArrowBack} />}
          onClick={() => navigate("/admin")}
        >{i18n.t("auto.AdminGeo.retour_dashboard_admin", "Retour dashboard admin")}</Button>
        <HStack spacing={2}>
          <Button
            size="sm"
            variant="outline"
            isLoading={refreshing}
            onClick={() => reloadAnalytics().catch((e) => {
              toast({ status: "error", description: e?.message || "Actualisation impossible" });
            })}
          >
            Actualiser
          </Button>
          <Badge borderRadius="full" px={3} py={1}>{i18n.t("auto.AdminGeo.analytics_geolocalisees", "Analytics géolocalisées")}</Badge>
        </HStack>
      </HStack>

      <Box
        {...theme.cardProps}
        p={{ base: 5, md: 7 }}
        position="relative"
        overflow="hidden"
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 14% 8%, rgba(59,130,246,.18), transparent 34%), radial-gradient(circle at 86% 12%, rgba(16,185,129,.14), transparent 30%)",
        }}
      >
        <Box position="relative">
          <Badge borderRadius="full" px={3} mb={3}>{i18n.t("auto.AdminGeo.admin_analytics", "Admin analytics")}</Badge>
          <Heading letterSpacing="-0.05em">{i18n.t("auto.AdminGeo.geographie_trafic_par_villes", "Géographie — trafic par villes")}</Heading>
          <Text color={theme.mutedText} mt={2}>{i18n.t("auto.AdminGeo.visualisez_les_villes_pays_et_volumes_de_visites_a", "Visualisez les villes, pays et volumes de visites avec les mêmes repères que le dashboard.")}</Text>
        </Box>
      </Box>

      {loadError && (
        <Alert status="error" borderRadius="xl">
          <AlertIcon />
          <Box>
            <Text fontWeight="700">{i18n.t("auto.AdminGeo.analytics_non_chargees", "Analytics non chargées")}</Text>
            <Text fontSize="sm">{loadError}</Text>
          </Box>
        </Alert>
      )}

      <SimpleGrid columns={{ base: 1, md: 2, xl: 6 }} spacing={4}>
        <StatCard
          title={`${metricLabelUi} (${windowLabel})`}
          value={globalKpiTotal}
          help={metric === "pv" ? "pages vues" : "visiteurs uniques"}
        />
        <StatCard title={i18n.t("auto.AdminGeo.villes_suivies", "Villes suivies")} value={kpi.nbCities} help="docs uniques" />
        <StatCard
          title={i18n.t("auto.AdminGeo.pays_top", "Pays top")}
          value={kpi.topCountry}
          help={`${kpi.topCountryValue} ${metric === "pv" ? "visites" : (windowKey === "all" ? "uniques (toujours)" : "visiteurs uniques")}`}
        />
        <StatCard
          title={i18n.t("auto.AdminGeo.ville_top", "Ville top")}
          value={kpi.topCity}
          help={`${kpi.topCityCountry ? `${kpi.topCityCountry} • ` : ""}${kpi.topCityValue} ${metric === "pv" ? "visites" : (windowKey === "all" ? "uniques (toujours)" : "visiteurs uniques")}`}
        />

        <Card bg={cardBg} borderRadius="xl" shadow="sm">
          <CardBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <Box>
                <Text fontSize="sm" color={theme.mutedText} mb={1}>{i18n.t("auto.AdminGeo.metrique", "Métrique")}</Text>
                <Select
                  value={metric}
                  onChange={(e) => { setMetric(e.target.value); setMinVal(1); }}
                >
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>{m.label}</option>
                  ))}
                </Select>
              </Box>
              <Box>
                <Text fontSize="sm" color={theme.mutedText} mb={1}>{i18n.t("auto.AdminGeo.fenetre", "Fenêtre")}</Text>
                <Select
                  value={windowKey}
                  onChange={(e) => { setWindowKey(e.target.value); setMinVal(1); }}
                >
                  {WINDOWS.map((w) => (
                    <option key={w.key} value={w.key}>{w.label}</option>
                  ))}
                </Select>
              </Box>
            </SimpleGrid>

            {/* ✅ Clarification sémantique */}
            {metric === "uv" && windowKey === "all" && (
              <Box mt={3}>
                <Badge colorScheme="purple" variant="subtle">{i18n.t("auto.AdminGeo.toujours_uniques_all_time_par_ville_analytics_geo_", "“Toujours” = uniques all-time par ville (analytics_geo.users)")}</Badge>
              </Box>
            )}
            {metric === "uv" && windowKey !== "all" && (
              <Box mt={3}>
                <Badge colorScheme="blue" variant="subtle">
                  {windowLabel}{i18n.t("auto.AdminGeo.somme_des_uniques_journaliers_analytics_geo_daily_", "= somme des uniques journaliers (analytics_geo_daily.uniqueVisitors)")}</Badge>
              </Box>
            )}

            <HStack spacing={3} mt={4}>
              <Tag size="md">{i18n.t("auto.AdminGeo.filtre", "Filtre ≥")}{minVal} {metric === "pv" ? "visites" : (windowKey === "all" ? "uniques" : "visiteurs uniques")}
              </Tag>
              <Slider
                aria-label={i18n.t("auto.AdminGeo.min_val", "min-val")}
                min={1}
                max={maxVal}
                value={minVal}
                onChange={setMinVal}
              >
                <SliderTrack><SliderFilledTrack /></SliderTrack>
                <SliderThumb />
              </Slider>
            </HStack>

            <HStack mt={3}>
              <Input
                placeholder={i18n.t("auto.AdminGeo.recherche_ville_ou_pays_iso2", "Recherche ville ou pays (ISO2)")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button onClick={() => {
                setSearch("");
                setPersonSearch("");
                setRoleFilter("all");
                setMergeRadiusKm(2);
                setMinVal(1);
              }}>{i18n.t("exerciseBank.reset", "Réinitialiser")}</Button>
            </HStack>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} mt={3}>
              <FormControl>
                <FormLabel fontSize="sm" mb={1}>Rôle</FormLabel>
                <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                  <option value="all">Tous les rôles</option>
                  <option value="client">Clients / patients</option>
                  <option value="coach">Coachs</option>
                  <option value="club">Clubs / salles</option>
                  <option value="admin">Administrateurs</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm" mb={1}>Personne</FormLabel>
                <Input
                  placeholder="Nom ou e-mail"
                  value={personSearch}
                  onChange={(event) => setPersonSearch(event.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel fontSize="sm" mb={1}>Regrouper les positions proches</FormLabel>
                <Select value={mergeRadiusKm} onChange={(event) => setMergeRadiusKm(Number(event.target.value))}>
                  <option value={1}>Rayon de 1 km</option>
                  <option value={2}>Rayon de 2 km</option>
                  <option value={5}>Rayon de 5 km</option>
                </Select>
              </FormControl>
            </SimpleGrid>
            {peopleFilterLoading && (
              <HStack mt={3} spacing={2}>
                <Progress size="xs" isIndeterminate flex="1" />
                <Text fontSize="xs" color={theme.mutedText}>Application du filtre aux différentes zones…</Text>
              </HStack>
            )}

            <FormControl display="flex" alignItems="center" mt={4}>
              <FormLabel htmlFor="auto-enrich" mb="0">{i18n.t("auto.AdminGeo.auto_geocoder_a_l_ouverture", "Auto-géocoder à l’ouverture")}</FormLabel>
              <Switch
                id="auto-enrich"
                isChecked={autoEnrich}
                onChange={(e) => setAutoEnrich(e.target.checked)}
                colorScheme="blue"
              />
            </FormControl>

            {/* Petit rappel heure locale */}
            <Box mt={3}>
              <Badge colorScheme="gray" variant="subtle">{i18n.t("auto.AdminGeo.heures_heure_locale_du_visiteur_analytics_geo_hour", "Heures = heure locale du visiteur (analytics_geo_hourly)")}</Badge>
            </Box>
          </CardBody>
        </Card>
      </SimpleGrid>

      <Card maxH={{ base: "430px", md: "460px" }} display="flex" flexDirection="column">
        <CardHeader>
          <Stack spacing={3}>
            <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
              <Heading size="md">{i18n.t("auto.AdminGeo.dernieres_visites_aujourd_hui", "Dernières visites aujourd’hui")}</Heading>
              <HStack flexWrap="wrap">
                {lastLoadedAt && (
                  <Tag variant="subtle" colorScheme="gray">
                    MAJ {formatDateTime(lastLoadedAt)}
                  </Tag>
                )}
                <Tag>{displayedRecentVisitors.length} {i18n.t("auto.AdminGeo.visiteur_s", "visiteur(s)")}</Tag>
              </HStack>
            </HStack>
            <HStack flexWrap="wrap" gap={2}>
              <Tag variant="subtle" colorScheme="blue">{metricLabelUi}</Tag>
              <Tag variant="subtle" colorScheme="purple">{windowLabel}</Tag>
              <Tag variant="subtle" colorScheme="gray">
                {i18n.t("auto.AdminGeo.filtre", "Filtre ≥")}{minVal}
              </Tag>
              {search.trim() ? (
                <Tag variant="subtle" colorScheme="teal">
                  {i18n.t("auto.AdminGeo.recherche_ville_ou_pays_iso2", "Recherche ville ou pays (ISO2)")}: {search.trim()}
                </Tag>
              ) : null}
              {roleFilter !== "all" ? <Tag colorScheme="orange">Rôle : {roleFilter}</Tag> : null}
              {personSearch.trim() ? <Tag colorScheme="cyan">Personne : {personSearch.trim()}</Tag> : null}
            </HStack>
          </Stack>
        </CardHeader>
        <CardBody overflowY="auto" p={0}>
          <Box overflowX="auto" px={{ base: 3, md: 4 }} pb={4}>
            <Table size="sm" variant="simple" minW="760px">
              <Thead position="sticky" top={0} zIndex={1} bg={cardBg}>
                <Tr>
                  <Th>{i18n.t("auto.AdminGeo.personne", "Personne")}</Th>
                  <Th>{i18n.t("auto.AdminGeo.lieu", "Lieu")}</Th>
                  <Th>{i18n.t("auto.AdminGeo.derniere_ouverture", "Dernière ouverture")}</Th>
                  <Th>{i18n.t("auto.AdminGeo.page", "Page")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {displayedRecentVisitors.map((visit, index) => {
                  const place = formatVisitPlace(visit);
                  return (
                    <Tr key={`${visit.visitorId || visit.uid || visit.id || "visit"}-${visit.lastSeenAt || visit.firstSeenAt || index}`}>
                      <Td maxW="260px">
                        <Text fontWeight="700" noOfLines={1}>{visit.personName || "Visiteur anonyme"}</Text>
                        <Text fontSize="xs" color={theme.mutedText} noOfLines={1}>
                          {visit.email || visit.uid || visit.visitorId || "—"}
                        </Text>
                      </Td>
                      <Td>{place || "—"}</Td>
                      <Td>{formatDateTime(visit.lastSeenAt || visit.firstSeenAt) || "—"}</Td>
                      <Td maxW="260px">
                        <Text noOfLines={1}>{visit.pathLast || visit.pathFirst || "—"}</Text>
                      </Td>
                    </Tr>
                  );
                })}
                {displayedRecentVisitors.length === 0 && (
                  <Tr>
                    <Td colSpan={4} color={theme.mutedText}>{i18n.t("auto.AdminGeo.aucune_visite_enregistree_aujourd_hui", "Aucune visite enregistrée aujourd’hui.")}</Td>
                  </Tr>
                )}
              </Tbody>
            </Table>
          </Box>
        </CardBody>
      </Card>

      {/* ------------------------------ Carte 2D ------------------------------ */}
      <Card>
        <CardHeader>
          <HStack justify="space-between" align="center">
            <Heading size="md">{i18n.t("auto.AdminGeo.carte", "Carte —")}{metricLabelUi} ({windowLabel})
            </Heading>
            <Button
              size="sm"
              {...theme.primaryButtonProps}
              onClick={() => enrichMissingCoords("manual")}
              isLoading={enriching}
              loadingText={i18n.t("auto.AdminGeo.enrichissement", "Enrichissement…")}
            >{i18n.t("auto.AdminGeo.enrichir_coordonnees_admin", "Enrichir coordonnées (admin)")}</Button>
          </HStack>
        </CardHeader>

        <CardBody>
          {enriching && <Progress value={progress} size="sm" mb={3} />}
            <Box w="100%" h={{ base: "420px", md: "560px" }} borderRadius="lg" overflow="hidden">
              <MapContainer
                ref={mapRef}
                style={{ width: "100%", height: "100%" }}
                center={[20, 0]}
                zoom={2}
                minZoom={2}
                worldCopyJump
                preferCanvas
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />
                <FitToMarkers points={mapPoints} />
                <MapZoomListener onZoomChange={handleMapZoomChange} />
                <MapFocusController target={mapFocus} markerRefs={markerRefs} />
                {renderedMapPoints.map((c) => {
                  const v = Math.max(1, c.value || 0);
                  const r = c.isCluster ? Math.max(13, Math.sqrt(v) * 3) : Math.max(5, Math.sqrt(v) * 2.2);

                  if (c.isCluster) {
                    return (
                      <CircleMarker
                        key={`cluster:${c.clusterId}`}
                        center={[c.lat, c.lon]}
                        radius={r}
                        pathOptions={{
                          color: theme.primary,
                          weight: 2,
                          fillColor: bubbleFill,
                          fillOpacity: 0.9,
                        }}
                        eventHandlers={{
                          click: () => {
                            const currentZoom = mapRef.current?.getZoom() || mapZoom;
                            mapRef.current?.flyTo(
                              [c.lat, c.lon],
                              Math.min(13, currentZoom + 3),
                              { animate: true, duration: 0.45 }
                            );
                          },
                        }}
                      >
                        <Tooltip permanent direction="center" className="geo-cluster-count" opacity={1}>
                          {c.value}
                        </Tooltip>
                        <Tooltip direction="top" offset={[0, -r]}>
                          <strong>{c.members.length} zones proches</strong> — {c.value} {metric === "pv" ? "visites" : "visiteurs uniques"}
                          <br />Cliquez pour zoomer et les séparer.
                        </Tooltip>
                      </CircleMarker>
                    );
                  }

                  const label =
                    metric === "pv"
                      ? `${c.value} visites`
                      : (windowKey === "all"
                          ? `${c.value} uniques (toujours)`
                          : `${c.value} visiteurs uniques`);

                  const last = lastVisitByGeoIdToday[c.geoId];
                  const lastLabel = formatDateTime(last?.lastSeenAt) || (last ? `${pad2(last.lastHour)}h` : "—");
                  const visitorState = mapVisitors[`${windowKey}:${c.geoId}`] || {};
                  const displayedVisitors = (visitorState.visitors || []).filter(visitorMatchesFilters);

                  return (
                    <CircleMarker
                      key={c.geoId}
                      ref={(layer) => {
                        if (layer) markerRefs.current.set(c.geoId, layer);
                        else markerRefs.current.delete(c.geoId);
                      }}
                      center={[c.lat, c.lon]}
                      radius={r}
                      pathOptions={{
                        color: bubbleStroke,
                        weight: 1,
                        fillColor: bubbleFill,
                        fillOpacity: 0.75,
                      }}
                      eventHandlers={{ click: () => loadMapVisitors(c) }}
                    >
                      <Tooltip direction="top" offset={[0, -2]}>
                        <strong>{c.city}</strong> ({c.country}) — {label}
                        <br />
                        <span style={{ opacity: 0.85 }}>{i18n.t("auto.AdminGeo.derniere_visite", "Dernière visite :")}{lastLabel}</span>
                      </Tooltip>
                      <Popup minWidth={280} maxWidth={340}>
                        <Box minW="250px">
                          <Text fontWeight="800">{c.city} ({c.country})</Text>
                          <Text fontSize="xs" color="gray.600" mb={2}>{label}</Text>
                          {visitorState.loading ? (
                            <HStack py={2}><Progress size="xs" isIndeterminate flex="1" /><Text fontSize="xs">Chargement…</Text></HStack>
                          ) : visitorState.error ? (
                            <Text fontSize="sm" color="red.500">Impossible de charger les personnes.</Text>
                          ) : displayedVisitors.length ? (
                            <VStack align="stretch" spacing={2} maxH="240px" overflowY="auto">
                              {displayedVisitors.map((visitor) => {
                                const historyState = visitor.uid ? visitorHistories[visitor.uid] || {} : {};
                                const isExpanded = expandedVisitorId === visitor.visitorId;
                                return (
                                <Box key={visitor.visitorId} pb={2} borderBottom="1px solid" borderColor="gray.200">
                                  <HStack justify="space-between" align="start">
                                    <Text fontWeight="700" fontSize="sm">{visitor.personName || "Visiteur anonyme"}</Text>
                                    <Badge colorScheme="blue" fontSize="10px">{visitor.role || "—"}</Badge>
                                  </HStack>
                                  {visitor.email ? <Text fontSize="xs" color="gray.600">{visitor.email}</Text> : null}
                                  <Text fontSize="xs" color="gray.500">
                                    Dernière connexion : {formatDateTime(visitor.lastSeenAt || visitor.firstSeenAt) || "—"}
                                  </Text>
                                  {visitor.uid && (
                                    <Button
                                      mt={1}
                                      size="xs"
                                      variant="ghost"
                                      px={0}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        loadVisitorHistory(visitor);
                                      }}
                                    >
                                      {isExpanded ? "Masquer l’historique" : "Voir l’historique"}
                                    </Button>
                                  )}
                                  {isExpanded && (
                                    <Box mt={1} p={2} bg="gray.50" borderRadius="md">
                                      {historyState.loading ? (
                                        <Progress size="xs" isIndeterminate />
                                      ) : historyState.error ? (
                                        <Text fontSize="xs" color="red.500">Historique indisponible.</Text>
                                      ) : historyState.history ? (
                                        <Stack spacing={1}>
                                          <Text fontSize="xs" fontWeight="700">
                                            {historyState.history.daysVisited} jour(s) de connexion • {historyState.history.citiesVisited} ville(s)
                                          </Text>
                                          {(historyState.history.locations || []).slice(0, 6).map((location) => (
                                            <HStack key={location.geoId} justify="space-between" fontSize="xs">
                                              <Text>{location.city}, {location.country}</Text>
                                              <Text color="gray.500">{location.daysVisited} j.</Text>
                                            </HStack>
                                          ))}
                                        </Stack>
                                      ) : (
                                        <Text fontSize="xs" color="gray.500">Aucun déplacement antérieur disponible.</Text>
                                      )}
                                    </Box>
                                  )}
                                </Box>
                              );})}
                            </VStack>
                          ) : (
                            <Text fontSize="sm" color="gray.600">Aucune personne identifiée pour cette période.</Text>
                          )}
                        </Box>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </Box>
        </CardBody>
      </Card>

      {/* Tableau Top villes */}
      <Card>
        <CardHeader>
          <HStack justify="space-between" align="center">
            <Heading size="md">{i18n.t("auto.AdminGeo.top_villes", "Top villes")}</Heading>
            <Tag>
              {metricLabelUi} • {windowLabel} • {visibleCities.length} ville(s)
            </Tag>
          </HStack>
        </CardHeader>

        <CardBody>
          <Table size="sm" variant="striped">
            <Thead>
              <Tr>
                <Th>{i18n.t("auto.AdminGeo.ville", "Ville")}</Th>
                <Th>{i18n.t("auto.AdminGeo.pays", "Pays")}</Th>
                <Th isNumeric>
                  {metric === "pv"
                    ? "Visites"
                    : (windowKey === "all" ? "Uniques (toujours)" : "Visiteurs uniques")}
                </Th>
                <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                <Th>{i18n.t("auto.AdminGeo.coordonnees", "Coordonnées")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              {visibleCities.slice(0, 50).map((c) => {
                const last = lastVisitByGeoIdToday[c.geoId];
                const lastLabel = formatDateTime(last?.lastSeenAt) || (last ? `${pad2(last.lastHour)}h` : "");
                return (
                  <Tr
                    key={c.geoId}
                    cursor={typeof c.lat === "number" && typeof c.lon === "number" ? "pointer" : "default"}
                    _hover={typeof c.lat === "number" && typeof c.lon === "number" ? { bg: "blue.50" } : undefined}
                    tabIndex={typeof c.lat === "number" && typeof c.lon === "number" ? 0 : undefined}
                    onClick={() => focusCityOnMap(c)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") focusCityOnMap(c);
                    }}
                    aria-label={`Afficher ${c.city} sur la carte`}
                  >
                    <Td>{c.city}</Td>
                    <Td>{c.country}</Td>
                    <Td isNumeric>{c.value}</Td>
                    <Td>
                      {last
                        ? (
                          <Text as="span">
                            {lastLabel}
                            <Text as="span" color="gray.500"> (</Text>
                            <Text as="span" color="gray.500">
                              {metric === "pv" ? `${last.lastValue} visites` : `${last.lastValue} uniques`}
                            </Text>
                            <Text as="span" color="gray.500">)</Text>
                          </Text>
                        )
                        : <Text as="span" color="gray.500">—</Text>}
                    </Td>
                    <Td>
                      {typeof c.lat === "number" && typeof c.lon === "number"
                        ? `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`
                        : <Text as="span" color="gray.500">{i18n.t("auto.AdminGeo.a_geocoder", "— à géocoder —")}</Text>}
                    </Td>
                  </Tr>
                );
              })}
              {visibleCities.length === 0 && (
                <Tr><Td colSpan={5} color="gray.500">{i18n.t("programView.noData", "Aucune donnée.")}</Td></Tr>
              )}
            </Tbody>
          </Table>

          <Stack spacing={1} mt={3}>
            <Text color="gray.500" fontSize="sm">{i18n.t("auto.AdminGeo.l_enrichissement_ecrit", "L’enrichissement écrit")}<code>{i18n.t("auto.AdminGeo.lat", "lat")}</code>/<code>{i18n.t("auto.AdminGeo.lon", "lon")}</code>{i18n.t("auto.AdminGeo.dans", "dans")}<code>{i18n.t("auto.AdminGeo.analytics_geo", "analytics_geo")}</code>{i18n.t("auto.AdminGeo.une_fois_pour_toutes", "(une fois pour toutes).")}</Text>
            <Text color="gray.500" fontSize="sm">{i18n.t("auto.AdminGeo.aujourd_hui_7j_30j_utilisent", "Aujourd’hui/7j/30j utilisent")}<code>{i18n.t("auto.AdminGeo.analytics_geo_daily", "analytics_geo_daily")}</code>{i18n.t("auto.AdminGeo.pv", "(PV +")}<code>{i18n.t("auto.AdminGeo.uniquevisitors", "uniqueVisitors")}</code>{i18n.t("auto.AdminGeo.par_ville_et_par_jour", "par ville et par jour).")}</Text>
            <Text color="gray.500" fontSize="sm">{i18n.t("auto.AdminGeo.toujours_utilise", "Toujours utilise")}<code>{i18n.t("auto.AdminGeo.analytics_geo_pv", "analytics_geo.pv")}</code>{i18n.t("auto.AdminGeo.et", "et")}<code>{i18n.t("auto.AdminGeo.analytics_geo_users", "analytics_geo.users")}</code>{i18n.t("auto.AdminGeo.uniques_all_time_par_ville", "(uniques all-time par ville).")}</Text>
            <Text color="gray.500" fontSize="sm">{i18n.t("auto.AdminGeo.heures_aujourd_hui_utilisent", "Heures (aujourd’hui) utilisent")}<code>{i18n.t("auto.AdminGeo.analytics_geo_hourly", "analytics_geo_hourly")}</code>{i18n.t("auto.AdminGeo.pv", "(PV +")}<code>{i18n.t("auto.AdminGeo.uniquevisitors", "uniqueVisitors")}</code>{i18n.t("auto.AdminGeo.par_ville_et_par_heure", "par ville et par heure).")}</Text>
          </Stack>
        </CardBody>
      </Card>
      </VStack>
    </Box>
  );
}
