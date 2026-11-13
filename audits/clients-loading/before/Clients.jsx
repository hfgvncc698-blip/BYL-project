const ClubReferents = lazy(() => import("./dashboard/ClubReferents"));
// src/pages/Clients.jsx
import React, { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Box,
  Flex,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Button,
  Heading,
  Input,
  InputGroup,
  InputLeftElement,
  useColorModeValue,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Select,
  Alert,
  AlertIcon,
  IconButton,
  Badge,
  Link as ChakraLink,
  Progress,
  Text,
  HStack,
  Tooltip,
  VStack,
  Container,
  SimpleGrid,
  ButtonGroup,
  FormControl,
  FormLabel,
  Stack,
  useDisclosure,
  useToast,
  useBreakpointValue,
} from "@chakra-ui/react";
import { AddIcon, SearchIcon } from "@chakra-ui/icons";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { clubText } from "../i18n/clubText";
import { useAuth } from "../AuthContext";
import {
  collection,
  doc,
  serverTimestamp,
  where,
  orderBy,
  limit,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import {coachPageScope,coachPageSource} from "../utils/coachPageSource";
import CoachPageAccess from "./dashboard/CoachPageAccess";
import {useCoachPageViewer} from '../utils/useCoachPageViewer';
import {listBatch} from "../utils/coachListRows";
import {selectClientMetricRows} from "../utils/clientVisibleMetrics";
import { clientsGetDocs as getDocs, clientsQuery as query } from "../utils/firestoreMetrics.js";
import { recordMetric } from "../utils/browserMetrics.js";
import { FiTrash2 } from "react-icons/fi";
import PageBackButton from "./ui/PageBackButton";
import PageLoadingStatus from "./ui/PageLoadingStatus";
import { usePageLoading } from "../hooks/usePageLoading";
import { confirmOperation } from "../utils/confirmedOperation";
import { createProgramAssignmentOperation } from "../utils/programWriteOperations";
import AssignmentPlacement from './client/AssignmentPlacement';
import { AppMetricValue, AppSectionHeader, AppSurface } from "./ui/AppPrimitives.jsx";
import { apiFetch } from "../utils/api";
import { notify } from "../utils/notify";
import { useAppTheme } from "../styles/appTheme";
import { hasPlanModule } from "../utils/proPlanAccess";
import {
  getProgramPlannedSessionTotal,
} from "../utils/programDuration";
import {
  readPageDataCacheEntry,
  updatePageDataCache,
  writePageDataCache,
} from "../utils/pageDataCache";

const loadClientCreation = () => import("../components/ClientCreation.jsx");
const ClientCreation = React.lazy(loadClientCreation);
const warmedClientRoutes = new Set();

const warmClientRoute = (clientId) => {
  if (!clientId || warmedClientRoutes.has(clientId)) return;
  warmedClientRoutes.add(clientId);
  void import("./ClientView.jsx");

};

const DAYS_ACTIVE_CUTOFF = 30;
const CLIENTS_PAGE_CACHE_TTL_MS = 10 * 60 * 1000;
const TOUR_DEMO_CLIENT_ID = "__tour_demo_client__";
const TOUR_DEMO_CLIENT = {
  id: TOUR_DEMO_CLIENT_ID,
  prenom: "Client",
  nom: "Démo",
  email: "demo@boostyourlife.coach",
  __tourDemo: true,
};

const normalizeClientSearchText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();

const getCachedClientActivityMs = (client) =>
  toMillis(client?.lastSession) || 0;

const getCachedSportProgramCount = (client) => {
  const candidates = [
    client?.sportProgramCount,
    client?.programmesSportifs,
    client?.programmesCount,
    client?.programmeCount,
    client?.nbProgrammes,
  ];
  const value = candidates.map(Number).find((n) => Number.isFinite(n) && n > 0);
  return value || 0;
};

/* -------------------- Utils (comme CoachDashboard) -------------------- */
function getTotalSessionsFromProgrammeDoc(p) {
  if (!p) return 0;
  if (Array.isArray(p.sessions)) return p.sessions.length;
  if (Array.isArray(p.seances)) return p.seances.length;
  if (typeof p.totalSessions === "number") return p.totalSessions;
  if (typeof p.nbSeances === "number") return p.nbSeances;
  return 0;
}

const toMillis = (ts) =>
  ts?.toDate
    ? ts.toDate().getTime()
    : ts?.seconds
      ? Number(ts.seconds) * 1000
    : typeof ts === "number"
      ? ts > 1e12
        ? ts
        : ts * 1000
      : ts instanceof Date
        ? ts.getTime()
        : typeof ts === "string"
          ? Date.parse(ts) || 0
          : 0;

const selectCachedClientRows = (
  payload = {},
  { sportView = false, nutritionMode = false, filter = "", activeCutoffMs = 0 } = {}
) => {
  const programmeCounts = payload.programmeCountMap || {};
  const interactionMap = payload.lastInteractionMap || {};
  const lastSessionMap = payload.lastSessionMap || {};
  let visibleClients = payload.clients || [];

  if (sportView) {
    visibleClients = visibleClients.filter(
      (client) => Number(programmeCounts[client.id] ?? getCachedSportProgramCount(client) ?? 0) > 0
    );
  }
  if (filter === "active" || filter === "inactive") {
    visibleClients = visibleClients.filter((client) => {
      const lastSessionValue = lastSessionMap[client.id];
      const activityMs = (nutritionMode && payload.nutritionLastFollowMap?.[client.id]) || (Object.hasOwn(interactionMap,client.id) ? interactionMap[client.id] : Math.max(
        Number(interactionMap[client.id] || 0),
        lastSessionValue ? new Date(lastSessionValue).getTime() || 0 : 0,
        getCachedClientActivityMs(client)
      ));
      return filter === "active" ? activityMs >= activeCutoffMs : activityMs < activeCutoffMs;
    });
  }
  return visibleClients;
};



// ✅ Helpers “nom identique Builder” (copié de CoachDashboard)
const capitalizeFirst = (s = "") => {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const prettifyKey = (key = "") => {
  const s = String(key || "").trim();
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
};

const makeDefaultProgramName = (objectifUIKey, objectifFallback, nbSeances) => {
  const baseKey = objectifUIKey || objectifFallback || "";
  const label = capitalizeFirst(prettifyKey(baseKey));
  const n = Number(nbSeances) || 1;
  if (!label) return `Programme — ${n}x/Sem`;
  return `${label} — ${n}x/Sem`;
};

const normalizeNameForCompare = (s = "") =>
  String(s || "")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isLegacyAutoName = (existingName, objectifUIKey, objectifFallback, nbSeances) => {
  const n = Number(nbSeances) || 1;
  const candidateNew = normalizeNameForCompare(
    makeDefaultProgramName(objectifUIKey, objectifFallback, n)
  );

  const old1 = normalizeNameForCompare(`${objectifFallback || ""} — ${n}x/Sem`);
  const old2 = normalizeNameForCompare(`${objectifFallback || ""} — ${n}x/sem`);
  const old3 = normalizeNameForCompare(`${objectifFallback || ""} - ${n}x/Sem`);
  const old4 = normalizeNameForCompare(`${objectifFallback || ""} - ${n}x/sem`);
  const old5 = normalizeNameForCompare(`${objectifUIKey || ""} — ${n}x/Sem`);
  const old6 = normalizeNameForCompare(`${objectifUIKey || ""} - ${n}x/Sem`);

  const cur = normalizeNameForCompare(existingName);

  if (!cur) return true;
  if (cur === candidateNew) return true;
  if (cur === old1 || cur === old2 || cur === old3 || cur === old4 || cur === old5 || cur === old6)
    return true;

  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback)) return true;
  if (objectifUIKey && cur === normalizeNameForCompare(objectifUIKey)) return true;

  return false;
};

// ✅ Nom identique Builder (pour documents de la collection programmes)
const prettyProgramNameBase = (p) => {
  if (!p) return "—";

  const objectifUiKey = p.objectifUI || "";
  const objectifFallback = p.objectif || "";
  const n = getTotalSessionsFromProgrammeDoc(p) || 1;

  const defaultName = makeDefaultProgramName(objectifUiKey, objectifFallback, n);
  const rawName =
    p.nomProgramme && typeof p.nomProgramme === "string" ? p.nomProgramme.trim() : "";

  if (rawName && isLegacyAutoName(rawName, objectifUiKey, objectifFallback, n)) {
    return defaultName;
  }
  if (rawName) return rawName;

  return defaultName || "—";
};

/* ------------------- Helpers dates pour l'Input type=date ------------------- */
function toDateInputValue(anyTs) {
  if (!anyTs) return "";
  const d = anyTs?.toDate?.() ?? (typeof anyTs === "number" ? new Date(anyTs) : new Date(anyTs));
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* ------------------- Constantes Selects ------------------- */
const GOALS = [
  { value: "weight_loss", fr: "Perte de poids", en: "Weight loss" },
  { value: "muscle_gain", fr: "Prise de masse", en: "Muscle gain" },
  { value: "strength", fr: "Force", en: "Strength" },
  { value: "endurance", fr: "Endurance", en: "Endurance" },
  { value: "return_sport", fr: "Retour au sport", en: "Return to sport" },
  { value: "postural", fr: "Postural", en: "Postural" },
];

const LEVELS = [
  { value: "beginner", fr: "Débutant", en: "Beginner" },
  { value: "intermediate", fr: "Intermédiaire", en: "Intermediate" },
  { value: "advanced", fr: "Avancé", en: "Advanced" },
];

const NUTRITION_GOALS = [
  { value: "reequilibrage", fr: "Rééquilibrage alimentaire", en: "Nutrition reset" },
  { value: "weight_loss", fr: "Perte de poids", en: "Weight loss" },
  { value: "muscle_gain", fr: "Prise de masse", en: "Muscle gain" },
  { value: "performance", fr: "Performance sportive", en: "Performance nutrition" },
  { value: "health", fr: "Santé et habitudes", en: "Health and habits" },
];

const LANGS = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "es", label: "Español" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
];

function Clients() {
  const {user:appUser}=useAuth();
  const user=useCoachPageViewer(appUser,'clients');
  const isAdmin=user?.role==='admin';
  const params=new URLSearchParams(useLocation().search);
  const target=(isAdmin && params.get("adminCoachId")) || user?.uid;
  const scope=coachPageScope(user,target,user?.clubId || '');
  return scope ? <ClientsView key={scope} scope={scope} user={user} isAdmin={isAdmin}/> : <CoachPageAccess pending={user===undefined}/>;
}
const ClientsView = ({scope,user,isAdmin}) => {
  const { begin: beginPageLoad, state: pageLoadState, fresh: forceFresh } = usePageLoading();
  const { t, i18n } = useTranslation();

  const isMobileClientsLayout = useBreakpointValue(
    { base: true, md: false },
    { ssr: false }
  ) ?? true;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const params = new URLSearchParams(location.search);
  const filter = params.get("filter");
  const listView = params.get("view");
  const adminCoachId = params.get("adminCoachId") || "";
  const effectiveCoachUid = isAdmin && adminCoachId ? adminCoachId : user?.uid;
  const source=useMemo(()=>coachPageSource(scope,effectiveCoachUid,isAdmin),[scope,effectiveCoachUid,isAdmin]);
  const [viewStale,setViewStale]=useState(false);
  const [page,setPage]=useState(0);
  const priorityIds=useRef([]);
  const hasNutritionAccess = hasPlanModule(user, "nutrition");
  const hasSportAccess = hasPlanModule(user, "sport");
  const nutritionOnly = hasNutritionAccess && !hasSportAccess;
  const mixedNutritionView = hasNutritionAccess && hasSportAccess && listView === "nutrition";
  const sportView = hasSportAccess && listView === "sport" && filter === "with-program";
  const nutritionMode = nutritionOnly || mixedNutritionView;
  const activeCutoffMs = useMemo(
    () => Date.now() - DAYS_ACTIVE_CUTOFF * 24 * 60 * 60 * 1000,
    []
  );
  const withAdminCoach = (path) => {
    if (!isAdmin || !adminCoachId) return path;
    return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
  };

  const clientsPageCacheKey = useMemo(
    () =>
      effectiveCoachUid
        ? [
            "byl:coach-view:clients",
            scope,
            filter,
            nutritionMode ? "nutrition" : "sport",
            nutritionOnly ? "nutrition-all" : "nutrition-followed",
            sportView ? "sport-only" : "all",
          ].join(":")
        : null,
    [scope,effectiveCoachUid, filter, nutritionMode, nutritionOnly, sportView]
  );
  const clientsOverviewCacheKey = useMemo(
    () => (effectiveCoachUid ? `byl:coach-view:overview:${scope}` : null),
    [effectiveCoachUid,scope]
  );
  const canUseDashboardOverview = !nutritionMode;
  const initialClientsPageCacheEntry = useMemo(
    () =>
      forceFresh || !source.roots.current() ? null : readPageDataCacheEntry(clientsPageCacheKey, { ttlMs: CLIENTS_PAGE_CACHE_TTL_MS }) ||
      (canUseDashboardOverview
        ? readPageDataCacheEntry(clientsOverviewCacheKey, { ttlMs: CLIENTS_PAGE_CACHE_TTL_MS })
        : null),
    [forceFresh, canUseDashboardOverview, clientsOverviewCacheKey, clientsPageCacheKey]
  );
  const initialData = initialClientsPageCacheEntry?.data;
  const authorizedIds = useMemo(()=>new Set(source.roots.current()?.docs.map(d=>d.id)),[source,initialData]);
  const initialClientsPageCache = !initialData?.partial && initialData?.clients?.every(c=>authorizedIds.has(c.id)) ? initialData : null;
  const initialVisibleClients = useMemo(
    () => selectCachedClientRows(initialClientsPageCache || {}, { sportView, nutritionMode, filter, activeCutoffMs }),
    [activeCutoffMs, filter, initialClientsPageCache, sportView]
  );

  const [clientScope, setClientScope] = useState("mine");
  const [clients, setClients] = useState(() => initialVisibleClients);
  const [programmes, setProgrammes] = useState(() => initialClientsPageCache?.programmes || []);
  const [loading, setLoading] = useState(() => !initialClientsPageCache);

  const [selectedClient, setSelectedClient] = useState(null);
  const [assignmentPlacement, setAssignmentPlacement] = useState('auto');
  useEffect(() => setAssignmentPlacement('auto'), [selectedClient]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProgramme, setSelectedProgramme] = useState("");
  const assignmentOperationRef = useRef(null);
  const assignmentBusyRef = useRef(false);
  const [assigningProgram, setAssigningProgram] = useState(false);
  const [assignProgramsLoading, setAssignProgramsLoading] = useState(false);
  const [assignProgramsError, setAssignProgramsError] = useState(false);

  // Templates are only needed when assigning, not to display client metrics.
  // The assignment itself still reads the full, current template before saving.
  useEffect(() => {
    if (!isModalOpen || !effectiveCoachUid) return;
    let alive = true;
    setAssignProgramsLoading(true);
    setAssignProgramsError(false);
    getDocs(query(collection(db, "programmes"), where("createdBy", "==", effectiveCoachUid), orderBy("createdAt", "desc"), limit(200)))
      .catch(() => getDocs(query(collection(db, "programmes"), where("createdBy", "==", effectiveCoachUid), limit(200))))
      .then(snapshot => {
        if (!alive) return;
        const templates = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        templates.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setProgrammes(templates);
      })
      .catch(() => { if (alive) setAssignProgramsError(true); })
      .finally(() => { if (alive) setAssignProgramsLoading(false); });
    return () => { alive = false; };
  }, [effectiveCoachUid, isModalOpen]);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");

  const [progressMap, setProgressMap] = useState(() => initialClientsPageCache?.progressMap || {});
  const [sessionsPerWeekMap, setSessionsPerWeekMap] = useState(
    () => initialClientsPageCache?.sessionsPerWeekMap || {}
  );
  const [lastSessionMap, setLastSessionMap] = useState(() =>
    Object.fromEntries(
      Object.entries(initialClientsPageCache?.lastSessionMap || {}).map(([clientId, value]) => [
        clientId,
        value ? new Date(value) : null,
      ])
    )
  );
  const [programmeCountMap, setProgrammeCountMap] = useState(
    () => initialClientsPageCache?.programmeCountMap || {}
  );
  const [lastInteractionMap, setLastInteractionMap] = useState(
    () => initialClientsPageCache?.lastInteractionMap || {}
  );
  const [nutritionAssessmentCountMap, setNutritionAssessmentCountMap] = useState(
    () => initialClientsPageCache?.nutritionAssessmentCountMap || {}
  );
  const [nutritionLastFollowMap, setNutritionLastFollowMap] = useState(
    () => initialClientsPageCache?.nutritionLastFollowMap || {}
  );
  const [showTourDemoClient, setShowTourDemoClient] = useState(false);

  const createClientModal = useDisclosure();
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editClient, setEditClient] = useState(null);

  useEffect(() => {
    const onDemo = (event) => setShowTourDemoClient(!!event.detail?.active);
    window.addEventListener("byl:clients-demo", onDemo);
    return () => window.removeEventListener("byl:clients-demo", onDemo);
  }, []);

  const isFr = i18n.language?.startsWith?.("fr");

  const hydrateClientsPagePayload = useCallback((payload = {}) => {
    setClients(selectCachedClientRows(payload, { sportView, nutritionMode, filter, activeCutoffMs }));
    setProgrammes(payload.programmes || []);
    setProgressMap(payload.progressMap || {});
    setSessionsPerWeekMap(payload.sessionsPerWeekMap || {});
    setLastSessionMap(
      Object.fromEntries(
        Object.entries(payload.lastSessionMap || {}).map(([clientId, value]) => [
          clientId,
          value ? new Date(value) : null,
        ])
      )
    );
    setProgrammeCountMap(payload.programmeCountMap || {});
    setLastInteractionMap(payload.lastInteractionMap || {});
    setNutritionAssessmentCountMap(payload.nutritionAssessmentCountMap || {});
    setNutritionLastFollowMap(payload.nutritionLastFollowMap || {});
    setLoading(false);
  }, [activeCutoffMs, filter, sportView,nutritionMode]);

  useLayoutEffect(() => {
    if (forceFresh || !source.roots.current()) return;
    const entry =
      readPageDataCacheEntry(clientsPageCacheKey, { ttlMs: CLIENTS_PAGE_CACHE_TTL_MS }) ||
      (canUseDashboardOverview
        ? readPageDataCacheEntry(clientsOverviewCacheKey, { ttlMs: CLIENTS_PAGE_CACHE_TTL_MS })
        : null);
    if (entry && !entry.data.partial && entry.data.clients.every(c=>authorizedIds.has(c.id))) hydrateClientsPagePayload(entry.data);
  }, [forceFresh, canUseDashboardOverview, clientsOverviewCacheKey, clientsPageCacheKey, hydrateClientsPagePayload]);

	  const fetchData = useCallback(async (changedId) => {
    if(forceFresh)source.purge();
    else if(typeof changedId==="string")source.purge(changedId);
    const load=beginPageLoad();
    try {
      const roots=await source.roots.read('clients');
      if(!load.current())return;
      const list=roots.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>
        `${a.prenom??''} ${a.nom??''}`.localeCompare(`${b.prenom??''} ${b.nom??''}`));
      const ids=new Set(list.map(c=>c.id));
      const cached=readPageDataCacheEntry(clientsPageCacheKey) || (canUseDashboardOverview && readPageDataCacheEntry(clientsOverviewCacheKey));
      if(cached && !cached.data.partial && cached.data.clients.every(c=>ids.has(c.id))){
        hydrateClientsPagePayload(cached.data);load.cache({clients:cached.data.clients.length});
      } else {
        setClients(selectCachedClientRows({clients:list},{sportView,nutritionMode,filter,activeCutoffMs}));
      }
      setLoading(false);
      const payload={clients:list,programmes:[],progressMap:{},sessionsPerWeekMap:{},lastSessionMap:{},programmeCountMap:{},
        lastInteractionMap:{},nutritionLastFollowMap:{},nutritionAssessmentCountMap:{}};
      const exhaustiveMetrics=!!(filter || sportView || nutritionMode);
      const metricRows=selectClientMetricRows(list,priorityIds.current,exhaustiveMetrics);
      // Never advertise a visible-page summary as a complete dashboard cache.
      payload.partial=metricRows.length<list.length;
      const remaining=new Map(metricRows.map(c=>[c.id,c]));
      while(remaining.size){
        if(!load.current())return;
        const batch=[];
        for(const id of [...priorityIds.current,...remaining.keys()]){
          if(!remaining.has(id))continue;
          batch.push(remaining.get(id));remaining.delete(id);
          if(batch.length===25)break;
        }
        const stats=await listBatch(source,effectiveCoachUid,batch,!nutritionMode,changedId);
        if(!load.current())return;
        batch.forEach((c,i)=>{
          const m=stats[i], id=c.id;
          payload.progressMap[id]=m.progress;payload.sessionsPerWeekMap[id]=m.sessionsPerWeek;
          payload.lastSessionMap[id]=m.lastSessionDate?.toISOString() || (nutritionMode && c.lastSession?.toDate?.()?.toISOString()) || null;
          payload.programmeCountMap[id]=nutritionMode?getCachedSportProgramCount(c):m.programmeCount;
          payload.nutritionAssessmentCountMap[id]=m.nutritionCount ?? (Number(c.nutritionAssessmentCount || c.nutritionAssessmentsCount || c.nutritionFollowupCount || c.nutritionBilansCount || c.nbBilansNutrition)||0);
          payload.nutritionLastFollowMap[id]=m.nutritionCount===null ? Math.max(toMillis(c.lastNutritionFollow),toMillis(c.nutritionLastFollow),toMillis(c.lastNutritionAssessmentAt),toMillis(c.nutritionUpdatedAt),getCachedClientActivityMs(c)) : m.nutritionLast;
          payload.lastInteractionMap[id]=nutritionMode?getCachedClientActivityMs(c):m._lastInteractionMs;
        });
        if(remaining.size && !filter && !nutritionMode && batch.some(c=>priorityIds.current.includes(c.id)))
          hydrateClientsPagePayload({...payload,progressMap:{...payload.progressMap},sessionsPerWeekMap:{...payload.sessionsPerWeekMap},
            programmeCountMap:{...payload.programmeCountMap},lastInteractionMap:{...payload.lastInteractionMap},nutritionLastFollowMap:{...payload.nutritionLastFollowMap},
            nutritionAssessmentCountMap:{...payload.nutritionAssessmentCountMap}});
      }
      if(nutritionMode && !nutritionOnly)payload.clients=list.filter(c=>payload.nutritionAssessmentCountMap[c.id]>0);
      if(filter==='active' || filter==='inactive'){
        const visible=payload.clients.filter(c=>{
          const ms=(nutritionMode && payload.nutritionLastFollowMap[c.id]) || payload.lastInteractionMap[c.id];
          return filter==='active' ? ms>=activeCutoffMs : !(ms>=activeCutoffMs);
        });
        payload.clients=visible;
      }
      hydrateClientsPagePayload(payload);
      if(!source.roots.fresh() || !navigator.onLine){setViewStale(true);load.cache({clients:payload.clients.length});return;}
      writePageDataCache(clientsPageCacheKey,payload);
      if(!filter && !sportView && !nutritionMode)writePageDataCache(clientsOverviewCacheKey,payload);
      setViewStale(!source.roots.fresh());load.ready({clients:payload.clients.length,metricsClients:metricRows.length});
    } catch(error) {
      if(!load.current())return;
      if(error.status===403 || error.status===401 || error.code==='permission-denied'){
        source.purge();hydrateClientsPagePayload({});
      }
      setLoading(false);setViewStale(true);load.error();
    }
  },[source,beginPageLoad,forceFresh,effectiveCoachUid,clientsPageCacheKey,clientsOverviewCacheKey,canUseDashboardOverview,filter,sportView,activeCutoffMs,nutritionMode,nutritionOnly,hydrateClientsPagePayload]);

  useEffect(()=>{
    let timer;
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>fetchData(),80);};
    const stale=()=>setViewStale(true);
    const stop=source.roots.watch('clients',{stale,partial:(docs,reslicing)=>{
      if(reslicing){beginPageLoad();setIsModalOpen(false);setIsClientModalOpen(false);setIsDeleteOpen(false);}
      setClients(selectCachedClientRows({clients:docs.map(d=>({...d.data(),id:d.id}))},{sportView,nutritionMode,filter,activeCutoffMs}));
      setLoading(false);
    },confirmed:()=>{if(!source.roots.current()?.size)setClients([]);},changed:(snap,changes)=>{
      beginPageLoad();
      if(changes.some(c=>c.type==='removed')){
        const ids=new Set(snap.docs.map(d=>d.id));
        setClients(previous=>previous.filter(c=>ids.has(c.id)));
        setSelectedClient(null);setEditClient(null);setIsModalOpen(false);setIsClientModalOpen(false);
      }
      refresh();
    },error:()=>{beginPageLoad().error();source.purge();hydrateClientsPagePayload({});setViewStale(true);setIsModalOpen(false);setIsClientModalOpen(false);setIsDeleteOpen(false);}});
    const foreground=()=>{if(document.visibilityState!=='hidden')refresh();};
    const interval=setInterval(foreground,5*60000);
    window.addEventListener('focus',foreground);window.addEventListener('online',foreground);
    window.addEventListener('offline',stale);document.addEventListener('visibilitychange',foreground);
    fetchData();
    return ()=>{stop();clearTimeout(timer);clearInterval(interval);
      window.removeEventListener('focus',foreground);window.removeEventListener('online',foreground);
      window.removeEventListener('offline',stale);document.removeEventListener('visibilitychange',foreground);};
  },[source,fetchData,beginPageLoad,hydrateClientsPagePayload]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia?.("(max-width: 767px)")?.matches) return;
    const timeoutId = window.setTimeout(() => {
      document.getElementById("clients-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const openAssignModal = (clientId) => {
    setSelectedClient(clientId);
    setSelectedProgramme("");
    setIsModalOpen(true);
  };

  const handleAssign = async () => {
    if (!selectedClient || !selectedProgramme || assignmentBusyRef.current) return;
    assignmentBusyRef.current = true;
    setAssigningProgram(true);
    try {
      await confirmOperation(assignmentOperationRef, `${effectiveCoachUid}:${selectedClient}:${selectedProgramme}:${assignmentPlacement}`, () =>
        createProgramAssignmentOperation({
          db, clientId: selectedClient, programId: selectedProgramme, coachId: effectiveCoachUid,
          placement: assignmentPlacement,
          loadProgram: async (transaction) => {
            const tplRef = doc(db, "programmes", selectedProgramme);
            const tplSnap = await transaction.get(tplRef);
            if (!tplSnap.exists()) throw new Error("Programme introuvable.");
            const tpl = tplSnap.data();
            const totalSessions = getTotalSessionsFromProgrammeDoc(tpl);
            return {
              ...tpl, coachId: effectiveCoachUid, createdBy: effectiveCoachUid,
              assignedBy: effectiveCoachUid, assignedAt: serverTimestamp(),
              totalSessions: typeof totalSessions === "number" ? totalSessions : null,
              progress: 0, status: "active", origine: "coach-assign",
            };
          },
        })
      );

      setIsModalOpen(false);
      void fetchData(selectedClient);

      notify(toast, "programAssigned", {
        title: t("clientsList.assignModal.successTitle", "Programme assigné"),
        description: t("clientsList.assignModal.successDesc", "Le programme a bien été attribué au client."),
      });
    } catch (err) {
      console.error("Assign error:", err);
      notify(toast, "programAssignError", {
        ...(err?.code === "write-previous-confirmed" ? { status: "info" } : {}),
        title: err?.code === "write-previous-confirmed" ? "Opération précédente confirmée" : t("clientsList.assignModal.errorTitle", "Erreur"),
        description: err?.message || t("clientsList.assignModal.errorDesc", "Impossible d’assigner le programme."),
      });
    } finally {
      assignmentBusyRef.current = false;
      setAssigningProgram(false);
    }
  };

  const openDeleteModal = (id) => {
    setDeleteTarget(id);
    setIsDeleteOpen(true);
  };

	  const handleDelete = async () => {
	    if (!deleteTarget) return;
	    await deleteDoc(doc(db, "clients", deleteTarget));
	    const nextClients = clients.filter((c) => c.id !== deleteTarget);
	    const nextPayload = {
	      clients: nextClients.map(client => ({ ...client, programmesAssignes: undefined })),
	      programmes: [],
	      progressMap,
	      sessionsPerWeekMap,
	      lastSessionMap: Object.fromEntries(
	        Object.entries(lastSessionMap).map(([clientId, value]) => [
	          clientId,
	          value?.toISOString ? value.toISOString() : value || null,
	        ])
	      ),
	      programmeCountMap,
	      lastInteractionMap,
	      nutritionAssessmentCountMap,
	      nutritionLastFollowMap,
	    };
	    setClients(nextClients);
	    updatePageDataCache(clientsPageCacheKey, (cached) =>
	      cached ? { ...cached, clients: (cached.clients || []).filter((c) => c.id !== deleteTarget) } : cached
	    );
	    writePageDataCache(clientsPageCacheKey, nextPayload);
	    setIsDeleteOpen(false);
	  };

  const goalOptions = useMemo(
    () => (nutritionMode ? NUTRITION_GOALS : GOALS).map((g) => ({ value: g.value, label: isFr ? g.fr : g.en })),
    [isFr, nutritionMode]
  );

  const levelOptions = useMemo(
    () => LEVELS.map((l) => ({ value: l.value, label: isFr ? l.fr : l.en })),
    [isFr]
  );

  const [cf_first, setCfFirst] = useState("");
  const [cf_last, setCfLast] = useState("");
  const [cf_email, setCfEmail] = useState("");
  const [cf_phone, setCfPhone] = useState("");
  const [cf_birth, setCfBirth] = useState("");
  const [cf_goal, setCfGoal] = useState("weight_loss");
  const [cf_level, setCfLevel] = useState("beginner");
  const [cf_height, setCfHeight] = useState("");
  const [cf_weight, setCfWeight] = useState("");
  const [cf_lang, setCfLang] = useState("fr");
  const [isSavingClient, setIsSavingClient] = useState(false);

  const openClientForm = (clientOrNull) => {
    setEditClient(clientOrNull);
    if (clientOrNull) {
      setCfFirst(clientOrNull.prenom ?? clientOrNull.firstName ?? "");
      setCfLast(clientOrNull.nom ?? clientOrNull.lastName ?? "");
      setCfEmail(clientOrNull.email ?? "");
      setCfPhone(clientOrNull.phone ?? clientOrNull.telephone ?? "");
      setCfBirth(toDateInputValue(clientOrNull.birthDate || clientOrNull.dateNaissance));
      setCfGoal(clientOrNull.goal || clientOrNull.objectif || "weight_loss");
      setCfLevel(clientOrNull.level || clientOrNull.niveau || "beginner");
      setCfHeight(clientOrNull.heightCm ?? "");
      setCfWeight(clientOrNull.weightKg ?? "");
      setCfLang(clientOrNull.preferredLang || clientOrNull.settings?.defaultLanguage || "fr");
    }
    setIsClientModalOpen(true);
  };

  const saveClient = async ({ forceEmail = false } = {}) => {
    if (!editClient?.id || isSavingClient) return;
    const previousEmail = String(editClient.email || editClient.emailLower || "").trim().toLowerCase();
    const nextEmail = cf_email.trim().toLowerCase();
    const payload = {
      prenom: cf_first.trim(),
      firstName: cf_first.trim(),
      nom: cf_last.trim(),
      lastName: cf_last.trim(),
      email: nextEmail,
      phone: cf_phone.trim() || "",
      telephone: cf_phone.trim() || "",
      birthDate: cf_birth,
      dateNaissance: cf_birth,
      objectif: cf_goal,
      goal: cf_goal,
      niveau: cf_level,
      level: cf_level,
      heightCm: cf_height ? Number(cf_height) : null,
      weightKg: cf_weight ? Number(cf_weight) : null,
      preferredLang: cf_lang,
      settings: { defaultLanguage: cf_lang },
      sendActivationEmail: forceEmail,
    };

    try {
      setIsSavingClient(true);
      const result = await apiFetch(`/clubs/clients/${encodeURIComponent(editClient.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      setIsClientModalOpen(false);
      setEditClient(null);

      const changedEmail = nextEmail && nextEmail !== previousEmail;
      if (result.emailSent) {
        notify(toast, "clientInviteSent", {
          title: t("clientsList.edit.emailSentTitle", "Client mis à jour"),
          description: t("clientsList.edit.emailSentDesc", "Les informations sont enregistrées et l’e-mail d’accès vient d’être envoyé."),
          duration: 5200,
        });
      } else if (changedEmail || result.emailAttempted || result.emailDelivery === "activation-link-generated") {
        notify(toast, "saveSuccess", {
          status: "warning",
          title: t("clientsList.edit.savedNoEmailTitle", "Client mis à jour"),
          description: result.emailWarning
            ? t("clientsList.edit.savedEmailWarningDesc", "Les informations sont enregistrées, mais l’e-mail n’a pas pu partir : {{error}}", {
                error: result.emailWarning,
              })
            : t(
                "clientsList.edit.savedNoEmailDesc",
                "Les informations sont enregistrées, mais l’e-mail d’accès n’a pas pu être envoyé automatiquement."
              ),
          duration: 5200,
        });
      } else {
        notify(toast, "saveSuccess", {
          title: t("clientsList.edit.savedTitle", "Client mis à jour"),
          description: t("clientsList.edit.savedDesc", "Les informations du client sont bien enregistrées."),
          duration: 4200,
        });
      }
      await fetchData(editClient?.id);
    } catch (err) {
      console.error("Client save error:", err);
      const errorCode = err?.data?.error || err?.message || "";
      const duplicateEmail =
        errorCode === "client-email-already-used" ||
        errorCode === "email-belongs-to-another-account" ||
        errorCode === "existing-account-is-not-client" ||
        errorCode === "linked-account-is-not-client";
      notify(toast, "saveError", {
        title: duplicateEmail
          ? t("clientsList.edit.emailConflictTitle", "E-mail déjà utilisé")
          : t("clientsList.edit.errorTitle", "Client non enregistré"),
        description: duplicateEmail
          ? t("clientsList.edit.emailConflictDesc", "Cette adresse est déjà liée à un autre compte. Utilisez une autre adresse ou vérifiez le profil existant.")
          : t("clientsList.edit.errorDesc", "Impossible d’enregistrer ce client pour le moment."),
      });
    } finally {
      setIsSavingClient(false);
    }
  };

  const tourDemoClient = useMemo(
    () =>
      nutritionMode
        ? { ...TOUR_DEMO_CLIENT, prenom: "Patient", objectif: "reequilibrage", goal: "reequilibrage" }
        : TOUR_DEMO_CLIENT,
    [nutritionMode]
  );

  const clientsForDisplay = showTourDemoClient ? [tourDemoClient, ...clients] : clients;
  const normalizedSearchQuery = normalizeClientSearchText(searchQuery);

  const filteredClients = clientsForDisplay
    .filter((c) =>
      c.__tourDemo ||
      normalizeClientSearchText(`${c.prenom ?? ""} ${c.nom ?? ""}`).includes(normalizedSearchQuery)
    )
    .sort((a, b) =>
      `${a.prenom ?? ""} ${a.nom ?? ""}`.localeCompare(`${b.prenom ?? ""} ${b.nom ?? ""}`)
    );

  function clientForNavigation(c) {
    const bundle=source.present('bundle/'+c.id,JSON.stringify(c.dashboardProgramRevision));
    if(!bundle || !source.roots.fresh())return c;
    return {...c,programmesAssignes:bundle.programs.docs.map(d=>({...d.data(),id:d.id,
      sessionsEffectuees:bundle.histories.get(d.id).docs.map(row=>({...row.data(),id:row.id}))}))};
  }
  const pageCount=Math.max(1,Math.ceil(filteredClients.length/25));
  const currentPage=Math.min(page,pageCount-1);
  const pageRows=filteredClients.slice(currentPage*25,(currentPage+1)*25);
  const visibleMetricKey=JSON.stringify(pageRows.map(c=>c.id));
  const previousMetricKey=useRef('[]');
  useLayoutEffect(()=>{priorityIds.current=JSON.parse(visibleMetricKey);},[visibleMetricKey]);
  useEffect(()=>{
    const previous=previousMetricKey.current;
    previousMetricKey.current=visibleMetricKey;
    // Initial enrichment already requests the first page. Later page/search
    // changes use the same authorized source and its in-flight deduplication.
    if(previous!=='[]' && visibleMetricKey!=='[]' && previous!==visibleMetricKey && !filter && !sportView && !nutritionMode)void fetchData();
  },[visibleMetricKey,fetchData,filter,sportView,nutritionMode]);
  useEffect(()=>setPage(0),[searchQuery,filter,nutritionMode,sportView]);
  const theme = useAppTheme();
  const hasSearch = searchQuery.trim().length > 0;
  const bg = theme.pageBg;
  
  const headColor = theme.textColor;
  const borderColor = theme.borderColor;
  const muted = theme.mutedText;
  const filterBg = theme.surfaceBg;
  const statBg = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const tableHeadBg = theme.surfaceBgStrong;
  const rowHover = useColorModeValue("rgba(59,130,246,0.05)", "rgba(59,130,246,0.08)");

  const newClientLabel = nutritionMode
    ? t("clientsList.actions.newNutritionFollowup", "Nouveau suivi")
    : t("clientsList.actions.newClient", isFr ? "Nouveau client" : "New client");
  const filterLabels = nutritionMode
    ? {
        active: t("clientsList.filters.nutritionActive", "Suivis récents"),
        inactive: t("clientsList.filters.nutritionInactive", "À relancer"),
        all: t("clientsList.filters.nutritionAll", "Tous les patients"),
      }
    : {
        active: t("clientsList.filters.active", { days: DAYS_ACTIVE_CUTOFF }),
        inactive: t("clientsList.filters.inactive"),
        all: t("clientsList.filters.all"),
      };
  const statusText = (isActive, forNutrition = nutritionMode) =>
    forNutrition
      ? isActive
        ? t("clientsList.status.nutritionActive", "Suivi récent")
        : t("clientsList.status.nutritionInactive", "À relancer")
      : t(isActive ? "clientsList.status.active" : "clientsList.status.inactive");
  const nutritionLastFollowDate = (client) => {
    if (client.__tourDemo) return new Date();
    const ms = Number(nutritionLastFollowMap[client.id] || lastInteractionMap[client.id] || 0) || 0;
    return ms > 0 ? new Date(ms) : null;
  };

  const isActiveByInteraction = (clientId) => {
    const ms = Number((nutritionMode ? nutritionLastFollowMap[clientId] || lastInteractionMap[clientId] : lastInteractionMap[clientId]) || 0) || 0;
    return ms > 0 && ms >= activeCutoffMs;
  };
  const getFollowKind = (client, nbProg = 0) => {
    const nutritionCount = Number(nutritionAssessmentCountMap[client.id] || 0) || 0;
    if (nbProg > 0 && nutritionCount > 0) {
      return { label: t("clientsList.followKinds.sportNutrition", "Sport + nutrition"), colorScheme: "purple" };
    }
    if (nbProg > 0) {
      return { label: t("clientsList.followKinds.sport", "Client sport"), colorScheme: "blue" };
    }
    if (nutritionCount > 0 || nutritionMode || client.hasNutritionFollowup || client.nutritionFollowup) {
      return { label: t("clientsList.followKinds.nutrition", "Patient nutrition"), colorScheme: "teal" };
    }
    return { label: t("clientsList.followKinds.toProgram", "À programmer"), colorScheme: "orange" };
  };
  const isNutritionRow = (client) => nutritionMode || (
    !Number(programmeCountMap[client.id] || 0) && (
      Number(nutritionAssessmentCountMap[client.id] || 0) > 0 ||
      !!client.hasNutritionFollowup || !!client.nutritionFollowup
    )
  );
  const buildClientsPath = (nextFilter) => {
    const nextParams = new URLSearchParams();
    if (mixedNutritionView) nextParams.set("view", "nutrition");
    if (nextFilter) nextParams.set("filter", nextFilter);
    const queryString = nextParams.toString();
    return withAdminCoach(`/clients${queryString ? `?${queryString}` : ""}`);
  };

  return (
    <Box data-tour-page="coach-clients" bg={bg} minH="100vh" pb={{ base: 28, md: 0 }}>
      <PageLoadingStatus state={pageLoadState} />
      {!viewStale && !loading && pageLoadState.status==='loading' && clients.length>0 && <Text role="status" fontSize="sm">{t('clientsList.loadingStats','Actualisation des indicateurs…')}</Text>}
      {viewStale && <Text role="status">{t("dashboard.refresh_failed","Actualisation impossible. Les dernières données enregistrées restent affichées.")}</Text>}
      <Container maxW="7xl" py={{ base: 4, md: 10 }} px={{ base: 3, md: 6 }}>
        {loading && (
          <Progress
            aria-label={t("common.loading", "Chargement...")}
            isIndeterminate
            size="xs"
            borderRadius="full"
            mb={3}
          />
        )}
        <AppSurface bg={theme.surfaceBg} mb={{ base: 4, md: 6 }} p={{ base: 4, md: 5 }}>
          <Flex align="flex-start" gap={3}>
            <PageBackButton fallbackTo={withAdminCoach("/coach-dashboard")} />
            <AppSectionHeader
              flex="1"
              title={nutritionMode ? t("clientsList.headingPatients", "Mes patients") : t("clientsList.heading")}
              subtitle={nutritionMode ? t("clientsList.nutritionSubtitle", "Gérez vos patients, leurs coordonnées et leurs suivis nutrition depuis un seul espace.") : t(
                "clientFollowList.subtitle",
                "Gérez vos clients sportifs, leur activité récente et leurs programmes depuis un seul espace."
              )}
              headingAs="h1"
              action={(
                <Button
                  data-tour="clients-new-client"
                  {...theme.primaryButtonProps}
                  leftIcon={<AddIcon boxSize="14px" />}
                  onClick={
                    nutritionMode
                      ? () => navigate(withAdminCoach("/nutrition-coach?new=1"))
                      : () => {
                          loadClientCreation().catch(() => {});
                          createClientModal.onOpen();
                        }
                  }
                >
                  {newClientLabel}
                </Button>
              )}
              direction={{ base: "column", lg: "row" }}
              align={{ base: "stretch", lg: "center" }}
            />
          </Flex>
        </AppSurface>

        {user?.clubId && <HStack mb={5} spacing={2} role="group">
          <Button variant={clientScope === "mine" ? "solid" : "outline"} onClick={() => setClientScope("mine")}>{nutritionMode ? t("clientsList.headingPatients", "Mes patients") : t("clientsList.heading")}</Button>
          <Button variant={clientScope === "club" ? "solid" : "outline"} onClick={() => setClientScope("club")}>{user?.clubName?.trim() ? clubText(nutritionMode ? 'Annuaire des patients · {{clubName}}' : 'Annuaire des clients · {{clubName}}', { clubName: user.clubName.trim() }) : clubText(nutritionMode ? 'Annuaire des patients du club' : 'Annuaire des clients du club')}</Button>
        </HStack>}
        {user?.clubId && clientScope === "club" ? <Suspense fallback={null}><ClubReferents onAssigned={() => fetchData()} /></Suspense> : <>
        <SimpleGrid
          columns={{ base: 1, sm: 3 }}
          spacing={{ base: 2, md: 4 }}
          mb={6}
        >
          <AppSurface variant="tile" bg={theme.surfaceBgStrong} p={{ base: 3, md: 4 }}>
            <Flex align="center" justify="space-between" gap={{ base: 2, md: 4 }} h="100%">
              <Stack spacing={1} minW={0} justify="center">
                <Heading as="h2" size="md" color={theme.textColor} fontWeight="900" lineHeight="1.15" noOfLines={2}>{t("auto.Clients.total", "Total")}</Heading>
                <Text fontSize="xs" color={theme.subtleText} fontWeight="400" lineHeight="1.25" noOfLines={2}>
                  {nutritionMode ? t("clientsList.stats.patients", "Patients suivis") : t("clientsList.stats.clients", "Clients")}
                </Text>
              </Stack>
              <AppMetricValue flexShrink={0} fontSize={{ base: "2xl", md: "32px" }}>{clients.length}</AppMetricValue>
            </Flex>
          </AppSurface>
          <AppSurface variant="tile" bg={theme.surfaceBgStrong} p={{ base: 3, md: 4 }}>
            <Flex align="center" justify="space-between" gap={{ base: 2, md: 4 }} h="100%">
              <Stack spacing={1} minW={0} justify="center">
                <Heading as="h2" size="md" color={theme.textColor} fontWeight="900" lineHeight="1.15" noOfLines={2}>
                  {nutritionMode ? t("clientsList.stats.recentFollows", "Suivis récents") : t("clientsList.stats.active", "Actifs")}
                </Heading>
                <Text fontSize="xs" color={theme.subtleText} fontWeight="400" lineHeight="1.25" noOfLines={2}>
                  {nutritionMode
                    ? t("clientsList.stats.nutritionInteraction", "Interaction nutrition sur {{days}} jours", { days: DAYS_ACTIVE_CUTOFF })
                    : t("clientsList.stats.sportInteraction", "Interaction sur les {{days}} derniers jours", { days: DAYS_ACTIVE_CUTOFF })}
                </Text>
              </Stack>
              <AppMetricValue flexShrink={0} fontSize={{ base: "2xl", md: "32px" }}>{clients.filter((c) => isActiveByInteraction(c.id)).length}</AppMetricValue>
            </Flex>
          </AppSurface>
          <AppSurface variant="tile" bg={theme.surfaceBgStrong} p={{ base: 3, md: 4 }}>
            <Flex align="center" justify="space-between" gap={{ base: 2, md: 4 }} h="100%">
              <Stack spacing={1} minW={0} justify="center">
                <Heading as="h2" size="md" color={theme.textColor} fontWeight="900" lineHeight="1.15" noOfLines={2}>
                  {nutritionMode ? t("clientsList.stats.filteredPatients", "Patients filtrés") : t("clientsList.stats.shown", "Affichés")}
                </Heading>
                <Text fontSize="xs" color={theme.subtleText} fontWeight="400" lineHeight="1.25" noOfLines={2}>
                  {nutritionMode
                    ? t("clientsList.stats.nutritionFilteredHint", "Selon le suivi et la recherche")
                    : t("clientsList.stats.shownHint", "Résultats selon vos filtres et votre recherche")}
                </Text>
              </Stack>
              <AppMetricValue flexShrink={0} fontSize={{ base: "2xl", md: "32px" }}>{filteredClients.length}</AppMetricValue>
            </Flex>
          </AppSurface>
        </SimpleGrid>

        <Box id="clients-results" layerStyle="glassCard" p={{ base: 3, md: 6 }} mb={8} scrollMarginTop={{ base: "150px", md: "24px" }}>
          <Flex gap={3} mb={{ base: 4, md: 5 }} direction={{ base: "column", md: "row" }} align={{ base: "stretch", md: "center" }} justify="space-between">
            <InputGroup maxW={{ base: "100%", md: "430px" }}>
              <InputLeftElement pointerEvents="none">
                <SearchIcon color={theme.mutedText} />
              </InputLeftElement>
              <Input
                placeholder={nutritionMode ? t("clientsList.searchPatientPlaceholder", "Rechercher un patient") : t("clientsList.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                borderRadius="full"
                bg={theme.surfaceSoft}
                borderColor={theme.borderColor}
                _hover={{ borderColor: theme.borderColorStrong }}
                _focusVisible={{ borderColor: "#3B82F6", boxShadow: "0 0 0 1px #3B82F6" }}
              />
            </InputGroup>

            <HStack spacing={2} flexWrap="wrap" justify={{ base: "flex-start", md: "flex-end" }}>
              <Button
                data-tour="clients-filters"
                size="sm"
                borderRadius="full"
                variant={filter === "active" ? "solid" : "outline"}
                onClick={() => navigate(buildClientsPath("active"))}
              >
                {filterLabels.active}
              </Button>
              <Button
                size="sm"
                borderRadius="full"
                variant={filter === "inactive" ? "solid" : "outline"}
                onClick={() => navigate(buildClientsPath("inactive"))}
              >
                {filterLabels.inactive}
              </Button>
              <Button size="sm" borderRadius="full" variant={!filter ? "solid" : "outline"} onClick={() => navigate(buildClientsPath())}>
                {filterLabels.all}
              </Button>
            </HStack>

            {hasSearch && (
              <HStack
                display={{ base: "flex", md: "none" }}
                w="full"
                justify="space-between"
                color={muted}
                fontSize="sm"
                fontWeight="700"
              >
                <Text noOfLines={1}>
                  {filteredClients.length} {nutritionMode ? "patient(s)" : "client(s)"}
                </Text>
                <Button size="xs" variant="ghost" borderRadius="full" onClick={() => setSearchQuery("")}>
                  Effacer
                </Button>
              </HStack>
            )}
          </Flex>

          {!isMobileClientsLayout && (
          <Box overflowX="auto">
            <Table
              variant="simple"
              colorScheme="gray"
              width="100%"
              sx={{ tableLayout: "fixed", "& th, & td": { px: 2 } }}
            >
              <Thead bg={tableHeadBg}>
                <Tr>
                  <Th w={nutritionMode ? "25%" : "24%"}>{nutritionMode ? "Patient" : t("clientsList.table.client")}</Th>
                  {!nutritionMode && <Th w="8%">{t("clientFollowList.follow")}</Th>}
                  <Th w={nutritionMode ? "15%" : "12%"}>{t("clientFollowList.last")}</Th>
                  <Th w={nutritionMode ? "14%" : "10%"}>{t("clientFollowList.status")}</Th>
                  {!nutritionMode && <Th w="21%">{t("clientFollowList.details")}</Th>}
                  <Th w={nutritionMode ? "46%" : "25%"} isNumeric>{t("clientsList.table.action")}</Th>
                </Tr>
              </Thead>
              <Tbody>
                {pageRows.map((c) => {
                  const rowNutrition = isNutritionRow(c);
                  const last = rowNutrition ? nutritionLastFollowDate(c) : c.__tourDemo ? new Date() : lastSessionMap[c.id] || c.lastSession?.toDate?.() || null;
                  const isActive = c.__tourDemo ? true : rowNutrition ? !!last && last.getTime() >= activeCutoffMs : isActiveByInteraction(c.id);
                  const progStat = c.__tourDemo ? { percent: 67, completed: 4, total: 6 } : progressMap[c.id] || { percent: 0, completed: 0, total: 0 };
                  const perWeek = c.__tourDemo ? 2 : sessionsPerWeekMap[c.id] ?? 0;
                  const nbProg = c.__tourDemo ? 2 : programmeCountMap[c.id] ?? 0;
                  const followKind = getFollowKind(c, nbProg);

                  return (
                    <Tr key={c.id} data-tour={c.__tourDemo ? "clients-demo-row" : undefined} _hover={{ bg: rowHover }}>
                      <Td minW={0}>
                        <VStack align="start" spacing={0}>
                          <ChakraLink
                            as={c.__tourDemo ? "span" : Link}
                            to={c.__tourDemo ? undefined : `/clients/${c.id}`}
                            state={c.__tourDemo ? undefined : { prefetchedClient: clientForNavigation(c) }}
                            onPointerEnter={() => !c.__tourDemo && warmClientRoute(c.id)}
                            onFocus={() => !c.__tourDemo && warmClientRoute(c.id)}
                            color={headColor}
                            fontWeight="800"
                          >
                            {c.prenom} {c.nom}
                          </ChakraLink>
                          <Text fontSize="sm" color={muted}>
                            {c.email || c.phone || t("clientsList.noContact", "Aucun contact renseigné")}
                          </Text>
                          <Badge colorScheme={followKind.colorScheme} borderRadius="full" px={2.5} py={0.5} mt={1}>
                            {followKind.label}
                          </Badge>
                        </VStack>
                      </Td>

                      {!nutritionMode && (
                      <Td>
                        <Badge px={2.5} py={1} borderRadius="full" bg={statBg} color={headColor}>
                          {rowNutrition ? Number(nutritionAssessmentCountMap[c.id] || 0) : nbProg}
                        </Badge>
                        <Text fontSize="xs" color={muted}>{rowNutrition ? t("nutritionCoach.stats.assessments", "Bilans") : t("clientsList.table.programs")}</Text>
                      </Td>
                      )}

                      <Td>{last ? last.toLocaleDateString() : "N/A"}</Td>

                      <Td>
                        <Tooltip
                          label={
                            rowNutrition
                              ? isActive
                                ? t("clientsList.tooltip.nutritionRecent", "Interaction nutrition récente")
                                : t("clientsList.tooltip.nutritionNone", "Aucune interaction nutrition récente")
                              : last
                              ? t("clientsList.tooltip.lastOn", { date: last.toLocaleDateString() })
                              : t("clientsList.tooltip.none")
                          }
                          hasArrow
                        >
                          <Badge colorScheme={isActive ? "green" : "orange"} px={2.5} py={1} borderRadius="full">
                            {statusText(isActive, rowNutrition)}
                          </Badge>
                        </Tooltip>
                      </Td>

                      {!nutritionMode && (
                      <Td>
                        {rowNutrition ? <Text fontSize="sm" color={muted}>{t("clientFollowList.nutritionDetails")}</Text> : (
                        <Box minW={0} w="100%">
                          <HStack justify="space-between" mb={1}>
                            <Text fontSize="sm" color={muted}>
                              {t("clientsList.progress.sessions", {
                                done: progStat.completed,
                                total: progStat.total,
                              })}
                            </Text>
                            <Text fontSize="sm" fontWeight="semibold">
                              {progStat.percent}%
                            </Text>
                          </HStack>
                          <Progress value={progStat.percent} size="sm" borderRadius="full" />
                          <Text mt={1} fontSize="xs" color={muted}>
                            {t("clientsList.progress.perWeek", { n: perWeek })}
                          </Text>
                        </Box>
                        )}
                      </Td>
                      )}

                      <Td isNumeric w={nutritionMode ? "46%" : "25%"}>
                        <ButtonGroup spacing={1.5} display="inline-flex" whiteSpace="nowrap">
                          <Button
                            data-tour={c.__tourDemo ? "clients-demo-edit" : undefined}
                            size="sm"
                            variant="outline"
                            onClick={() => !c.__tourDemo && openClientForm(c)}
                          >
                            {t("common.edit", "Edit")}
                          </Button>
                          {!rowNutrition && (
                          <Button
                            data-tour={c.__tourDemo ? "clients-demo-assign" : undefined}
                            size="sm"
                            onClick={() => !c.__tourDemo && openAssignModal(c.id)}
                          >
                            {t("clientsList.actions.assign")}
                          </Button>
                          )}
                          <IconButton
                            aria-label={t("clientsList.actions.deleteAria")}
                            icon={<FiTrash2 />}
                            colorScheme="red"
                            variant="solid"
                            size="sm"
                            isDisabled={c.__tourDemo}
                            onClick={() => !c.__tourDemo && openDeleteModal(c.id)}
                          />
                        </ButtonGroup>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </Box>
          )}

          {isMobileClientsLayout && (
          <Box>
            <VStack spacing={3} align="stretch">
              {pageRows.map((c) => {
                const rowNutrition = isNutritionRow(c);
                const last = rowNutrition ? nutritionLastFollowDate(c) : c.__tourDemo ? new Date() : lastSessionMap[c.id] || c.lastSession?.toDate?.() || null;
                const isActive = c.__tourDemo ? true : rowNutrition ? !!last && last.getTime() >= activeCutoffMs : isActiveByInteraction(c.id);
                const progStat = c.__tourDemo ? { percent: 67, completed: 4, total: 6 } : progressMap[c.id] || { percent: 0, completed: 0, total: 0 };
                const perWeek = c.__tourDemo ? 2 : sessionsPerWeekMap[c.id] ?? 0;
                const nbProg = c.__tourDemo ? 2 : programmeCountMap[c.id] ?? 0;
                const followKind = getFollowKind(c, nbProg);
                const nutritionCount = Number(nutritionAssessmentCountMap[c.id] || 0) || 0;
                const clientPath = c.__tourDemo ? undefined : `/clients/${c.id}`;

                return (
                  <Box
                    key={c.id}
                    data-tour={c.__tourDemo ? "clients-demo-row" : undefined}
                    position="relative"
                    bg={filterBg}
                    border="1px solid"
                    borderColor={borderColor}
                    borderRadius="22px"
                    p={4}
                    boxShadow="glass"
                    backdropFilter="blur(14px)"
                  >
                    <HStack justify="space-between" align="start" spacing={3}>
                      <Box minW={0}>
                        <Text fontWeight="900" fontSize="lg" lineHeight="1.2" noOfLines={1}>
                          <ChakraLink
                            as={c.__tourDemo ? "span" : Link}
                            to={clientPath}
                            state={c.__tourDemo ? undefined : { prefetchedClient: clientForNavigation(c) }}
                            onPointerEnter={() => !c.__tourDemo && warmClientRoute(c.id)}
                            onFocus={() => !c.__tourDemo && warmClientRoute(c.id)}
                            color={headColor}
                          >
                            {c.prenom} {c.nom}
                          </ChakraLink>
                        </Text>
                        <Text mt={1} fontSize="sm" color={muted} noOfLines={1}>
                          {c.email || c.phone || t("clientsList.noContact", "Aucun contact renseigné")}
                        </Text>
                      </Box>
                      <Badge colorScheme={isActive ? "green" : "orange"} px={2.5} py={1} borderRadius="full" flexShrink={0}>
                        {statusText(isActive, rowNutrition)}
                      </Badge>
                    </HStack>

                    <HStack spacing={2} mt={3} wrap="wrap">
                      <Badge colorScheme={followKind.colorScheme} borderRadius="full" px={2.5} py={1}>
                        {followKind.label}
                      </Badge>
                    </HStack>

                    <SimpleGrid columns={3} spacing={2} mt={3}>
                      <Box bg={theme.surfaceSoft} border="1px solid" borderColor={borderColor} borderRadius="16px" p={2.5}>
                        <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {rowNutrition ? t("nutritionCoach.stats.assessments", "Bilans") : t("auto.CoachMobileNav.programmes", "Programmes")}
                        </Text>
                        <Text mt={1} fontSize="xl" fontWeight="950" lineHeight="1">
                          {rowNutrition ? nutritionCount : nbProg}
                        </Text>
                      </Box>
                      <Box bg={theme.surfaceSoft} border="1px solid" borderColor={borderColor} borderRadius="16px" p={2.5}>
                        <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {t("clientView.lastShort", "Dern.")}
                        </Text>
                        <Text mt={1} fontSize="sm" fontWeight="850" lineHeight="1.2" noOfLines={1}>
                          {last ? last.toLocaleDateString() : "—"}
                        </Text>
                      </Box>
                      <Box bg={theme.surfaceSoft} border="1px solid" borderColor={borderColor} borderRadius="16px" p={2.5}>
                        <Text fontSize="10px" color={muted} fontWeight="900" textTransform="uppercase" noOfLines={1}>
                          {rowNutrition ? t("clientFollowList.status") : t("clientView.percentCompleted", "% terminé")}
                        </Text>
                        <Text mt={1} fontSize={rowNutrition ? "sm" : "xl"} fontWeight="950" lineHeight="1.3">
                          {rowNutrition ? statusText(isActive, true) : `${progStat.percent}%`}
                        </Text>
                      </Box>
                    </SimpleGrid>

                    {!rowNutrition && (
                      <Box mt={3}>
                        <HStack justify="space-between" mb={1}>
                          <Text fontSize="sm" color={muted}>
                            {progStat.completed}/{progStat.total} {t("dashboard.sessions", "Séances")}
                          </Text>
                          <Text fontSize="sm" color={muted}>
                            {t("clientsList.progress.perWeek", { n: perWeek })}
                          </Text>
                        </HStack>
                        <Progress value={progStat.percent} size="sm" borderRadius="full" />
                      </Box>
                    )}

                    <HStack spacing={2} mt={4}>
                      <IconButton
                        aria-label={t("clientsList.actions.deleteAria")}
                        icon={<FiTrash2 />}
                        size="sm"
                        borderRadius="full"
                        colorScheme="red"
                        isDisabled={c.__tourDemo}
                        onClick={() => !c.__tourDemo && openDeleteModal(c.id)}
                      />
                      <Button
                        size="sm"
                        borderRadius="full"
                        flex="1"
                        isDisabled={c.__tourDemo}
                        onPointerEnter={() => !c.__tourDemo && warmClientRoute(c.id)}
                        onFocus={() => !c.__tourDemo && warmClientRoute(c.id)}
                        onClick={() => clientPath && navigate(clientPath, { state: { prefetchedClient: clientForNavigation(c) } })}
                      >
                        {t("common.view", "Voir")}
                      </Button>
                      <Button
                        data-tour={c.__tourDemo ? "clients-demo-edit" : undefined}
                        size="sm"
                        variant="outline"
                        borderRadius="full"
                        onClick={() => !c.__tourDemo && openClientForm(c)}
                      >
                        {t("common.edit", "Edit")}
                      </Button>
                      {!rowNutrition && (
                        <Button
                          data-tour={c.__tourDemo ? "clients-demo-assign" : undefined}
                          size="sm"
                          borderRadius="full"
                          flex="1"
                          onClick={() => !c.__tourDemo && openAssignModal(c.id)}
                        >
                          {t("clientsList.actions.assign")}
                        </Button>
                      )}
                    </HStack>
                  </Box>
                );
              })}
            </VStack>
          </Box>
          )}
        </Box>

        {pageCount>1 && <HStack justify="center" mb={4}>
          <Button size="sm" isDisabled={!currentPage} onClick={()=>setPage(currentPage-1)} aria-label={t('common.previous','Précédent')}>‹</Button>
          <Text>{currentPage+1} / {pageCount}</Text>
          <Button size="sm" isDisabled={currentPage+1===pageCount} onClick={()=>setPage(currentPage+1)} aria-label={t('common.next','Suivant')}>›</Button>
        </HStack>}
        </>}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{t("clientsList.assignModal.title", "Assigner un programme")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              {assignProgramsLoading && <Text role="status" fontSize="sm" mb={2}>{t("common.loading", "Chargement...")}</Text>}
              {assignProgramsError && <Alert status="error" mb={2}><AlertIcon />{t("settings.toasts.update_error", "Erreur de chargement")}</Alert>}
              <Select
                placeholder={t("clientsList.assignModal.placeholder", "Sélectionnez un programme")}
                value={selectedProgramme}
                onChange={(e) => setSelectedProgramme(e.target.value)}
              >
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {prettyProgramNameBase(p)}
                  </option>
                ))}
              </Select>
            <AssignmentPlacement clientId={selectedClient} value={assignmentPlacement} onChange={setAssignmentPlacement} disabled={assigningProgram} />
          </ModalBody>
            <ModalFooter>
              <Button mr={3} onClick={handleAssign} isLoading={assigningProgram} isDisabled={!selectedProgramme || assignProgramsLoading || assignProgramsError}>
                {t("common.confirm", "Confirmer")}
              </Button>
              <Button variant="ghost" onClick={() => setIsModalOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        <Modal isOpen={isDeleteOpen} onClose={() => setIsDeleteOpen(false)} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{nutritionMode ? t("clientsList.deleteModal.patientTitle", "Supprimer le patient") : t("clientsList.deleteModal.title", "Supprimer le client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Alert status="warning">
                <AlertIcon />
                {nutritionMode ? t("clientsList.deleteModal.patientBody", "Êtes-vous sûr de vouloir supprimer ce patient ?") : t("clientsList.deleteModal.body", "Êtes-vous sûr de vouloir supprimer ce client ?")}
              </Alert>
            </ModalBody>
            <ModalFooter>
              <Button colorScheme="red" mr={3} onClick={handleDelete}>
                {t("common.delete", "Supprimer")}
              </Button>
              <Button variant="ghost" onClick={() => setIsDeleteOpen(false)}>
                {t("common.cancel", "Annuler")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>

        {createClientModal.isOpen && (
        <Modal isOpen onClose={createClientModal.onClose} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{newClientLabel}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <React.Suspense fallback={<Box minH="180px" />}>
                <ClientCreation
                  onClose={async () => {
                    createClientModal.onClose();
                    await fetchData();
                  }}
                />
              </React.Suspense>
            </ModalBody>
          </ModalContent>
        </Modal>
        )}

        <Modal
          isOpen={isClientModalOpen}
          onClose={() => setIsClientModalOpen(false)}
          size={{ base: "full", md: "xl" }}
          isCentered
          scrollBehavior="inside"
        >
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{nutritionMode ? t("clientsList.editPatient", "Modifier le patient") : t("clientView.editClient", "Modifier le client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Stack spacing={3}>
                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.firstName", "Prénom")}</FormLabel>
                    <Input value={cf_first} onChange={(e) => setCfFirst(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.lastName", "Nom")}</FormLabel>
                    <Input value={cf_last} onChange={(e) => setCfLast(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.email", "Email")}</FormLabel>
                    <Input type="email" value={cf_email} onChange={(e) => setCfEmail(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.phoneOptional", "Téléphone (optionnel)")}</FormLabel>
                    <Input value={cf_phone} onChange={(e) => setCfPhone(e.target.value)} />
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
                    <Input type="date" value={cf_birth} onChange={(e) => setCfBirth(e.target.value)} />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.language", "Langue préférée")}</FormLabel>
                    <Select value={cf_lang} onChange={(e) => setCfLang(e.target.value)}>
                      {LANGS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{nutritionMode ? t("clientsList.fields.activityProfile", "Profil d'activité") : t("clientCreation.level", "Niveau")}</FormLabel>
                    <Select value={cf_level} onChange={(e) => setCfLevel(e.target.value)}>
                      {levelOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl>
                    <FormLabel>{nutritionMode ? t("clientsList.fields.nutritionGoal", "Objectif nutrition") : t("clientCreation.objective", "Objectif")}</FormLabel>
                    <Select value={cf_goal} onChange={(e) => setCfGoal(e.target.value)}>
                      {goalOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>

                <Stack spacing={4} direction={{ base: "column", md: "row" }}>
                  <FormControl>
                    <FormLabel>{t("clientCreation.height", "Taille (cm)")}</FormLabel>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={cf_height}
                      onChange={(e) => setCfHeight(e.target.value)}
                    />
                  </FormControl>
                  <FormControl>
                    <FormLabel>{t("clientCreation.weight", "Poids (kg)")}</FormLabel>
                    <Input
                      type="number"
                      min="0"
                      step="0.1"
                      value={cf_weight}
                      onChange={(e) => setCfWeight(e.target.value)}
                    />
                  </FormControl>
                </Stack>
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button
                mr={3}
                variant="outline"
                onClick={() => saveClient({ forceEmail: true })}
                isDisabled={isSavingClient || !cf_email.trim()}
                isLoading={isSavingClient}
              >
                {t("clientsList.edit.resendAccessEmail", "Renvoyer l’e-mail d’accès")}
              </Button>
              <Button mr={3} onClick={() => setIsClientModalOpen(false)} isDisabled={isSavingClient}>
                {t("common.cancel", "Annuler")}
              </Button>
              <Button colorScheme="blue" onClick={() => saveClient()} isLoading={isSavingClient}>
                {t("common.save", "Enregistrer")}
              </Button>
            </ModalFooter>
          </ModalContent>
        </Modal>
      </Container>
    </Box>
  );
};

export default Clients;
