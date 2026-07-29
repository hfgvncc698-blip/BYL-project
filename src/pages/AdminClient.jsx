// src/pages/AdminClient.jsx
import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Text,
  Card,
  CardHeader,
  CardBody,
  SimpleGrid,
  Badge,
  HStack,
  VStack,
  Divider,
  Button,
  Table,
  Tbody,
  Tr,
  Th,
  Td,
  Tag,
  Icon,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Alert,
  AlertIcon,
  useToast,
  Input,
  Select,
  FormControl,
  FormLabel,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useNavigate, useParams } from "react-router-dom";
import { doc, getDoc, collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "../firebaseConfig";
import {
  MdOpenInNew,
  MdArrowBack,
  MdPlaylistAdd,
  MdDelete,
  MdBlock,
  MdEdit,
  MdRefresh,
  MdPayment,
  MdReceipt,
  MdSend,
  MdCheckCircle,
  MdCancel,
  MdReport,
} from "react-icons/md";
import AppLoading from "../components/ui/AppLoading";
import { useAppTheme } from "../styles/appTheme";
import { getAuthHeaders } from "../utils/authHeaders";
import { getApiBase } from "../utils/apiBase";
import i18n from "../i18n/index";

const AdminClientEmailPanel = lazy(() => import("../components/admin/AdminClientEmailPanel"));

function toLocale(v) {
  const d = v?.toDate ? v.toDate() : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d ? d.toLocaleString() : "—";
}

const toMillis = (v) => {
  const d = v?.toDate ? v.toDate() : typeof v === "string" || typeof v === "number" ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.getTime() : 0;
};

const lastVisitAfterCreation = (createdAt, ...values) => {
  const createdMs = toMillis(createdAt);
  for (const value of values) {
    const visitMs = toMillis(value);
    if (!visitMs) continue;
    if (!createdMs || visitMs >= createdMs - 60 * 1000) return value;
  }
  return null;
};

function formatLocation(location) {
  const city = String(location?.city || "").trim();
  const country = String(location?.country || "").trim().toUpperCase();
  return [city, country].filter(Boolean).join(", ") || "—";
}

function moneyMinor(value, currency = "eur") {
  const amount = Number(value || 0) / 100;
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: String(currency || "eur").toUpperCase(),
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${String(currency || "eur").toUpperCase()}`;
  }
}

function invoiceStatusLabel(status) {
  const s = String(status || "").toLowerCase();
  if (s === "draft") return "Brouillon";
  if (s === "open") return "À payer";
  if (s === "paid") return "Payée";
  if (s === "void") return "Annulée";
  if (s === "uncollectible") return "Impayée";
  return status || "—";
}

function pickName(obj, fallback = "—") {
  const a = `${obj?.firstName || ""} ${obj?.lastName || ""}`.trim();
  if (a) return a;
  const b = `${obj?.prenom || ""} ${obj?.nom || ""}`.trim();
  if (b) return b;
  return fallback;
}

function normalizeOrigin(p) {
  const o = String(p?.origine || p?.origin || p?.source || p?.generatedBy || p?.meta?.source || "").toLowerCase();
  return o;
}

function isAutoProgram(p) {
  const o = normalizeOrigin(p);
  return (
    o.includes("auto") ||
    o.includes("questionnaire") ||
    o.includes("generated") ||
    p?.isAuto === true ||
    p?.auto === true
  );
}

/**
 * ✅ OUVERTURE programme :
 * - Auto -> autoprogram preview
 * - Sinon -> ProgramView côté coach sur la bonne route:
 *   /clients/{clientId}/programmes/{programId}
 */
function getProgramOpenPath({ clientId, program }) {
  if (!clientId || !program?.id) return null;
  if (isAutoProgram(program)) return `/auto-program-preview/${clientId}/${program.id}`;
  return `/clients/${clientId}/programmes/${program.id}`;
}

/** ✅ Builder route (manuel seulement) */
function getBuilderPath({ clientId, program }) {
  if (!clientId || !program?.id) return null;
  if (isAutoProgram(program)) return null;
  return `/clients/${clientId}/programmes/${program.id}/program-builder`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function buildLocalBillingInfo(record, fallbackReason = "stripe-unavailable") {
  return {
    stripeAvailable: false,
    fallbackReason,
    customer: record?.stripeCustomerId ? { id: record.stripeCustomerId } : null,
    subscription: record?.stripeSubscriptionId
      ? {
          id: record.stripeSubscriptionId,
          status: record.subscriptionStatus || (record.hasActiveSubscription ? "active" : "free"),
          startedAt: record.trialStartedAt || null,
          currentPeriodEnd: record.nextInvoiceAt || record.trialEndsAt || record.trialEnd || null,
        }
      : null,
    firestore: {
      stripeCustomerId: record?.stripeCustomerId || null,
      stripeSubscriptionId: record?.stripeSubscriptionId || null,
      subscriptionStatus: record?.subscriptionStatus || (record?.hasActiveSubscription ? "active" : "free"),
      hasActiveSubscription: !!record?.hasActiveSubscription,
      trialStartedAt: record?.trialStartedAt || null,
      trialEndsAt: record?.trialEndsAt || record?.trialEnd || null,
      nextInvoiceAt: record?.nextInvoiceAt || null,
    },
    invoices: [],
    hasPaymentDelay: false,
    amountDue: 0,
    amountDueLabel: moneyMinor(0, "eur"),
  };
}

/** =======================
 *  Chargement programmes
 *  ======================= */
async function loadClientPrograms(clientId) {
  const out = [];

  // 1) ✅ VRAIE SOURCE: clients/{id}/programmes
  try {
    const subSnap = await getDocs(collection(db, "clients", clientId, "programmes"));
    subSnap.forEach((d) => {
      const p = d.data() || {};
      out.push({
        id: d.id,
        ...p,
        __where: "clientsSub",
      });
    });
  } catch (e) {
    // pas bloquant
    console.warn("loadClientPrograms: subcollection clients/{id}/programmes error", e);
  }

  // Si on en a déjà, on peut retourner direct (priorité totale)
  if (out.length > 0) return enrichProgramsWithLatestSessions(clientId, out);

  // 2) Fallback: collection globale programmes (legacy / anciens cas)
  const tryQueries = [
    // assignedTo contient uid
    query(collection(db, "programmes"), where("assignedTo", "array-contains", clientId)),
    // clients contient id (parfois)
    query(collection(db, "programmes"), where("clients", "array-contains", clientId)),
    // clientId direct
    query(collection(db, "programmes"), where("clientId", "==", clientId)),
    query(collection(db, "programmes"), where("ownerId", "==", clientId)),
    query(collection(db, "programmes"), where("userId", "==", clientId)),
  ];

  for (const qy of tryQueries) {
    try {
      const snap = await getDocs(qy);
      snap.forEach((d) => {
        if (out.some((x) => x.id === d.id)) return;
        out.push({ id: d.id, ...(d.data() || {}), __where: "programmesGlobal" });
      });
    } catch (e) {
      // ignore
    }
  }

  return enrichProgramsWithLatestSessions(clientId, out);
}

async function loadUnifiedProfile({ id, userData, clientData }) {
  const email = String(userData?.email || clientData?.email || "").trim().toLowerCase();
  const uid =
    userData?.id ||
    clientData?.linkedUserId ||
    clientData?.uid ||
    clientData?.accountUid ||
    "";
  const accountMap = new Map();
  const clientMap = new Map();

  const addAccountSnap = (snap) => {
    if (snap?.exists()) accountMap.set(snap.id, { id: snap.id, ...(snap.data() || {}) });
  };
  const addClientSnap = (snap) => {
    if (snap?.exists()) clientMap.set(snap.id, { id: snap.id, ...(snap.data() || {}) });
  };

  await Promise.all([
    id ? getDoc(doc(db, "users", id)).then(addAccountSnap).catch(() => null) : Promise.resolve(),
    uid ? getDoc(doc(db, "users", uid)).then(addAccountSnap).catch(() => null) : Promise.resolve(),
    id ? getDoc(doc(db, "clients", id)).then(addClientSnap).catch(() => null) : Promise.resolve(),
    uid ? getDoc(doc(db, "clients", uid)).then(addClientSnap).catch(() => null) : Promise.resolve(),
  ]);

  const queries = [];
  if (email) {
    queries.push(getDocs(query(collection(db, "users"), where("email", "==", email), limit(5))).catch(() => null));
    queries.push(getDocs(query(collection(db, "users"), where("emailLower", "==", email), limit(5))).catch(() => null));
    queries.push(getDocs(query(collection(db, "clients"), where("email", "==", email), limit(20))).catch(() => null));
    queries.push(getDocs(query(collection(db, "clients"), where("emailLower", "==", email), limit(20))).catch(() => null));
  }
  if (uid) {
    queries.push(getDocs(query(collection(db, "clients"), where("linkedUserId", "==", uid), limit(20))).catch(() => null));
    queries.push(getDocs(query(collection(db, "clients"), where("uid", "==", uid), limit(20))).catch(() => null));
  }

  const snaps = await Promise.all(queries);
  snaps.forEach((snap) => {
    snap?.docs?.forEach((docSnap) => {
      if (docSnap.ref.path.startsWith("users/")) addAccountSnap(docSnap);
      if (docSnap.ref.path.startsWith("clients/")) addClientSnap(docSnap);
    });
  });

  const clients = await Promise.all(
    [...clientMap.values()].map(async (client) => {
      const programsForClient = await loadClientPrograms(client.id).catch(() => []);
      return {
        ...client,
        programCount: programsForClient.length,
      };
    })
  );
  const coachIds = [
    ...new Set(
      clients
        .flatMap((client) => [
          client.createdBy,
          client.coachId,
          ...(Array.isArray(client.coachIds) ? client.coachIds : []),
        ])
        .filter(Boolean)
    ),
  ];

  return {
    accounts: [...accountMap.values()],
    clients,
    totalPrograms: clients.reduce((sum, client) => sum + Number(client.programCount || 0), 0),
    coachIds,
  };
}

async function enrichProgramsWithLatestSessions(clientId, programs) {
  if (!clientId || !programs.length) return programs;
  return Promise.all(
    programs.map(async (program) => {
      if (program.__where !== "clientsSub") return program;
      try {
        const snap = await getDocs(collection(db, "clients", clientId, "programmes", program.id, "sessionsEffectuees"));
        let latest = null;
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const value =
            data.dateEffectuee ||
            data.completedAt ||
            data.validatedAt ||
            data.updatedAt ||
            data.createdAt;
          if (!value) return;
          if (!latest || toMillis(value) > toMillis(latest)) latest = value;
        });
        return latest ? { ...program, _latestSessionAt: latest } : program;
      } catch {
        return program;
      }
    })
  );
}

export default function AdminClient() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const theme = useAppTheme();
  const cardBg = theme.surfaceBg;
  const borderCol = theme.borderColor;
  const softBg = theme.surfaceSoft;
  const muted = theme.mutedText;
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
    ".chakra-tabs__tablist": { borderColor: theme.borderColor },
    ".chakra-tabs__tab[aria-selected=true]": {
      bg: theme.surfaceSoft,
      borderColor: theme.borderColor,
      color: theme.textColor,
    },
  };

  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState(null); // "Compte" | "Fiche" | null
  const [userData, setUserData] = useState(null); // users/:id
  const [clientData, setClientData] = useState(null); // clients/:id (si existe)
  const [coachMeta, setCoachMeta] = useState(null);
  const [linkedUserByEmail, setLinkedUserByEmail] = useState(null);
  const [unifiedProfile, setUnifiedProfile] = useState(null);
  const [analyticsVisit, setAnalyticsVisit] = useState(null);
  const [programs, setPrograms] = useState([]); // programmes liés (clients/{id}/programmes)
  const [error, setError] = useState("");

  // --- Stripe local state (admin) ---
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeInfo, setStripeInfo] = useState(null);
  const [invoiceAmount, setInvoiceAmount] = useState("39.99");
  const [invoiceCurrency, setInvoiceCurrency] = useState("eur");
  const [invoiceDesc, setInvoiceDesc] = useState("Facture manuelle (admin)");
  const [invoicePriceId, setInvoicePriceId] = useState("");
  const [stripePrices, setStripePrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [sendEmail, setSendEmail] = useState("yes");
  const [trialDays, setTrialDays] = useState("14");
  const [invoiceActionBusy, setInvoiceActionBusy] = useState("");

  // --- Actions sensibles loading ---
  const [dangerLoading, setDangerLoading] = useState({
    deleteAccount: false,
    cancelAccess: false,
    editTrial: false,
    reconcile: false,
    portal: false,
    createInvoice: false,
    passwordReset: false,
  });

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError("");
      setKind(null);
      setUserData(null);
      setClientData(null);
      setPrograms([]);

      try {
        // 1) users/:id ?
        const uSnap = await getDoc(doc(db, "users", id));
        if (!mounted) return;

        // On charge aussi la fiche clients/:id si elle existe (même id)
        const cSnap = await getDoc(doc(db, "clients", id));
        if (!mounted) return;

        if (uSnap.exists()) {
          const u = uSnap.data() || {};
          const linkedClientId = u.linkedClientId || u.clientId || id;
          const linkedClientSnap =
            linkedClientId && linkedClientId !== id
              ? await getDoc(doc(db, "clients", linkedClientId)).catch(() => null)
              : cSnap;
          const effectiveClientId = linkedClientSnap?.exists() ? linkedClientSnap.id : id;
          setKind("Compte");
          setUserData({ id, ...u });
          if (linkedClientSnap?.exists()) {
            setClientData({ id: linkedClientSnap.id, ...(linkedClientSnap.data() || {}) });
          } else if (cSnap.exists()) {
            setClientData({ id, ...(cSnap.data() || {}) });
          }

          // ✅ programmes: source = clients/{id}/programmes (prioritaire)
          const progs = await loadClientPrograms(effectiveClientId);
          if (!mounted) return;
          setPrograms(progs);
          return;
        }

        if (cSnap.exists()) {
          const c = cSnap.data() || {};
          setKind("Fiche");
          setClientData({ id, ...c });

          // ✅ programmes: source = clients/{id}/programmes (prioritaire)
          const progs = await loadClientPrograms(id);
          if (!mounted) return;
          setPrograms(progs);
          return;
        }

        setError("Aucun document trouvé : ni users/{id} (Compte) ni clients/{id} (Fiche).");
      } catch (e) {
        console.error("AdminClient error:", e);
        setError("Erreur de chargement du profil.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  useEffect(() => {
    let mounted = true;
    const coachId = clientData?.createdBy || clientData?.coachId || "";

    (async () => {
      setCoachMeta(null);
      setLinkedUserByEmail(null);

      if (coachId) {
        const [userSnap, coachSnap] = await Promise.all([
          getDoc(doc(db, "users", coachId)).catch(() => null),
          getDoc(doc(db, "coachs", coachId)).catch(() => null),
        ]);
        if (mounted) {
          const data = userSnap?.exists?.() ? userSnap.data() : coachSnap?.exists?.() ? coachSnap.data() : null;
          setCoachMeta(data ? { id: coachId, ...data } : { id: coachId });
        }
      }

      const lookupEmail = (clientData?.email || userData?.email || "").trim().toLowerCase();
      if (lookupEmail && (!userData || userData.email !== lookupEmail)) {
        const snap = await getDocs(query(collection(db, "users"), where("email", "==", lookupEmail), limit(1))).catch(() => null);
        const docSnap = snap?.docs?.[0];
        if (mounted && docSnap) setLinkedUserByEmail({ id: docSnap.id, ...docSnap.data() });
      }
    })();

    return () => {
      mounted = false;
    };
  }, [clientData, userData]);

  useEffect(() => {
    let mounted = true;
    setUnifiedProfile(null);
    if (!userData && !clientData) {
      return () => {
        mounted = false;
      };
    }

    (async () => {
      const profile = await loadUnifiedProfile({ id, userData, clientData }).catch(() => null);
      if (mounted) setUnifiedProfile(profile);
    })();

    return () => {
      mounted = false;
    };
  }, [clientData, id, userData]);

  useEffect(() => {
    let mounted = true;
    const uid = userData?.id || linkedUserByEmail?.id || (kind === "Compte" ? id : "");

    (async () => {
      setAnalyticsVisit(null);
      if (!uid || loading) return;
      try {
        const r = await fetch(`${getApiBase()}/analytics/admin/visitor/${encodeURIComponent(uid)}?days=90`, {
          headers: { ...(await getAuthHeaders()) },
          credentials: "include",
        });
        const data = await readJsonResponse(r);
        if (!mounted || !r.ok || !data?.found) return;
        setAnalyticsVisit(data.visit || null);
      } catch (e) {
        console.warn("AdminClient analytics visitor unavailable", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, kind, loading, linkedUserByEmail?.id, userData?.id]);

  const titleName = useMemo(() => pickName(userData || clientData || {}, id), [userData, clientData, id]);

  const email = userData?.email || clientData?.email || "—";
  const role = userData?.role || "—";

  const subscriptionBadge = useMemo(() => {
    if (!userData) return null;
    if (userData.hasActiveSubscription) return { color: "green", label: "Abonnement actif" };
    if (userData.subscriptionStatus) return { color: "gray", label: userData.subscriptionStatus };
    return { color: "gray", label: "free" };
  }, [userData]);

  const programsCount = programs.length;
  const latestCompletedSessionAt = useMemo(() => {
    return programs.reduce((latest, program) => {
      const value = program?._latestSessionAt;
      if (!value) return latest;
      return !latest || toMillis(value) > toMillis(latest) ? value : latest;
    }, null);
  }, [programs]);
  const lastVisitValue = useMemo(
    () =>
      lastVisitAfterCreation(
        userData?.createdAt || clientData?.createdAt,
        analyticsVisit?.lastSeenAt,
        userData?.lastVisitAt,
        userData?.lastLoginAt,
        userData?.lastSeenAt,
        userData?.lastActivityAt,
        userData?.lastActiveAt,
        userData?.location?.updatedAt,
        latestCompletedSessionAt,
        clientData?.lastVisitAt,
        clientData?.lastLoginAt,
        clientData?.lastSeenAt,
        clientData?.lastActivityAt,
        clientData?.lastActiveAt,
        clientData?.location?.updatedAt
      ),
    [analyticsVisit, clientData, latestCompletedSessionAt, userData]
  );
  const lastVisitLocation = formatLocation(analyticsVisit || userData?.location || clientData?.location);

  // =========================
  // Stripe Admin handlers
  // =========================
  const openStripePortal = async () => {
    setDangerLoading((s) => ({ ...s, portal: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/create-stripe-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          userId: userData?.id || id,
          email,
          returnUrl: window.location.href,
        }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "portal-error");
      if (data?.stripeAvailable === false) {
        toast({
          title: i18n.t("auto.AdminClient.stripe", "Stripe"),
          description: data?.error || "Stripe non configuré.",
          status: "warning",
          duration: 5000,
          isClosable: true,
        });
        return;
      }
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else throw new Error("no-url");
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.stripe_portal", "Stripe portal"),
        description: e.message || "Erreur",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, portal: false }));
    }
  };

  const reconcileStripe = async () => {
    setDangerLoading((s) => ({ ...s, reconcile: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "reconcile-error");

      toast({
        title: i18n.t("auto.AdminClient.reconcile", "Reconcile"),
        description: `OK — status: ${data?.status || "?"}`,
        status: "success",
        duration: 3500,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.reconcile", "Reconcile"),
        description: e.message || "Erreur",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, reconcile: false }));
    }
  };

  const refreshStripe = async ({ silent = false } = {}) => {
    setStripeLoading(true);
    try {
      const params = new URLSearchParams({
        uid: userData?.id || id,
        email: email === "—" ? "" : email,
      });
      const r = await fetch(`${getApiBase()}/payments/admin/billing-summary?${params.toString()}`, {
        headers: { ...(await getAuthHeaders()) },
        credentials: "include",
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "summary-error");
      setStripeInfo(data);
    } catch (e) {
      setStripeInfo(buildLocalBillingInfo(userData || linkedUserByEmail || clientData, e.message || "summary-error"));
      if (!silent) {
        toast({
          title: i18n.t("auto.ClubDashboard.stripe_indisponible", "Stripe indisponible"),
          description: i18n.t("auto.AdminClient.j_affiche_les_infos_firestore_disponibles_redemarr", "J’affiche les infos Firestore disponibles. Redémarre le backend ou vérifie la clé Stripe pour les factures réelles."),
          status: "warning",
          duration: 7000,
          isClosable: true,
        });
      }
    } finally {
      setStripeLoading(false);
    }
  };

  useEffect(() => {
    if (loading || (!userData && !clientData)) return;
    refreshStripe({ silent: true });
  }, [loading, userData?.id, clientData?.id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setPricesLoading(true);
      try {
        const r = await fetch(`${getApiBase()}/payments/admin/prices`, {
          headers: { ...(await getAuthHeaders()) },
          credentials: "include",
        });
        const data = await readJsonResponse(r);
        if (!r.ok) throw new Error(data?.error || "prices-error");
        if (mounted) setStripePrices(Array.isArray(data?.prices) ? data.prices : []);
      } catch (e) {
        if (mounted) setStripePrices([]);
        console.warn("[AdminClient] Stripe prices unavailable:", e?.message || e);
      } finally {
        if (mounted) setPricesLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleInvoicePriceChange = (value) => {
    setInvoicePriceId(value);
    const price = stripePrices.find((item) => item.id === value);
    if (!price) return;
    setInvoiceAmount(String((Number(price.unitAmount || 0) / 100).toFixed(2)));
    setInvoiceCurrency(String(price.currency || "eur").toLowerCase());
    setInvoiceDesc(price.productName || price.nickname || price.id);
  };

  const createInvoice = async () => {
    setDangerLoading((s) => ({ ...s, createInvoice: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/create-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          uid: userData?.id || id,
          email,
          amount: Number(String(invoiceAmount || "0").replace(",", ".")),
          currency: String(invoiceCurrency || "eur").toLowerCase(),
          description: invoiceDesc || "Facture manuelle (admin)",
          priceId: invoicePriceId || undefined,
          sendEmail: sendEmail === "yes",
        }),
      });

      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "invoice-error");

      toast({
        title: i18n.t("auto.AdminClient.facture_creee", "Facture créée"),
        description: data?.invoiceId
          ? `Invoice: ${data.invoiceId}${data?.amountDueLabel ? ` • ${data.amountDueLabel}` : ""}`
          : "OK",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      refreshStripe({ silent: true });
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.creer_facture", "Créer facture"),
        description: e.message || "Erreur — (normal tant que le backend /payments/admin/create-invoice n’est pas branché)",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, createInvoice: false }));
    }
  };

  const openInvoiceUrl = (invoice) => {
    const url = invoice?.hostedInvoiceUrl || invoice?.invoicePdf || "";
    if (!url) {
      toast({
        title: i18n.t("auto.AdminClient.ouvrir_facture", "Ouvrir facture"),
        description: i18n.t("auto.AdminClient.aucun_lien_stripe_disponible_pour_cette_facture", "Aucun lien Stripe disponible pour cette facture."),
        status: "warning",
        duration: 5000,
        isClosable: true,
      });
      return;
    }
    window.location.assign(url);
  };

  const runInvoiceAction = async (invoice, action) => {
    const invoiceId = invoice?.id;
    if (!invoiceId) return;
    const labels = {
      send: "Renvoyer la facture",
      finalize: "Finaliser la facture",
      mark_paid: "Marquer comme payée",
      mark_uncollectible: "Marquer impayée",
      void: "Annuler la facture",
    };
    if (["mark_paid", "mark_uncollectible", "void"].includes(action)) {
      const ok = window.confirm(`${labels[action]} ${invoice.number || invoiceId} ?`);
      if (!ok) return;
    }
    setInvoiceActionBusy(`${invoiceId}:${action}`);
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/invoice-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          uid: userData?.id || id,
          email,
          invoiceId,
          action,
        }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "invoice-action-error");
      toast({
        title: labels[action] || "Facture mise à jour",
        description: data?.invoice?.number || invoice.number || invoiceId,
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      refreshStripe({ silent: true });
    } catch (e) {
      toast({
        title: labels[action] || "Action facture",
        description: e.message || "Erreur Stripe",
        status: "error",
        duration: 7000,
        isClosable: true,
      });
    } finally {
      setInvoiceActionBusy("");
    }
  };

  // =========================
  // Actions sensibles (backend à brancher)
  // =========================
  const deleteAccount = async () => {
    setDangerLoading((s) => ({ ...s, deleteAccount: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: id }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "delete-error");

      toast({
        title: i18n.t("auto.AdminClient.compte_supprime", "Compte supprimé"),
        description: i18n.t("auto.AdminClient.auth_firestore_si_endpoint_implemente", "Auth + Firestore (si endpoint implémenté)."),
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      navigate("/admin");
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.supprimer_compte", "Supprimer compte"),
        description: e.message || "Endpoint backend non branché (normal pour l’instant).",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, deleteAccount: false }));
    }
  };

  const cancelAccess = async () => {
    setDangerLoading((s) => ({ ...s, cancelAccess: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "cancel-error");

      toast({
        title: i18n.t("auto.AdminClient.acces_coupe", "Accès coupé"),
        description: i18n.t("auto.AdminClient.abonnement_annule_acces_mis_a_jour", "Abonnement annulé / accès mis à jour."),
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.annuler_abonnement_couper_acces", "Annuler abonnement / couper accès"),
        description: e.message || "Endpoint backend non branché (normal pour l’instant).",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, cancelAccess: false }));
    }
  };

  const sendPasswordReset = async () => {
    setDangerLoading((s) => ({ ...s, passwordReset: true }));
    try {
      const targetEmail = email === "—" ? "" : email;
      const r = await fetch(`${getApiBase()}/payments/admin/send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({
          uid: userData?.id || linkedUserByEmail?.id || id,
          email: targetEmail,
          lang:
            userData?.preferredLang ||
            userData?.preferredLanguage ||
            userData?.settings?.langCode ||
            userData?.settings?.defaultLanguage ||
            clientData?.preferredLang ||
            clientData?.settings?.langCode ||
            clientData?.settings?.defaultLanguage ||
            clientData?.langue ||
            "fr",
        }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "password-reset-error");

      toast({
        title: i18n.t("auto.AdminClient.email_reinitialisation_envoye", "E-mail de réinitialisation envoyé"),
        description: data?.email || targetEmail || "OK",
        status: "success",
        duration: 4500,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.reinitialisation_mot_de_passe", "Réinitialisation mot de passe"),
        description: e.message || "Impossible d’envoyer l’e-mail.",
        status: "error",
        duration: 7000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, passwordReset: false }));
    }
  };

  const editTrial = async () => {
    setDangerLoading((s) => ({ ...s, editTrial: true }));
    try {
      const days = Number(String(trialDays || "0").replace(",", "."));
      const r = await fetch(`${getApiBase()}/payments/admin/set-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, days }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "trial-error");

      toast({
        title: i18n.t("auto.AdminClient.periode_d_essai_modifiee", "Période d’essai modifiée"),
        description: "OK",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminClient.modifier_periode_d_essai", "Modifier période d’essai"),
        description: e.message || "Endpoint backend non branché (normal pour l’instant).",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setDangerLoading((s) => ({ ...s, editTrial: false }));
    }
  };

  if (loading) {
    return <AppLoading label={i18n.t("auto.AdminClient.chargement_du_client", "Chargement du client...")} />;
  }

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" sx={adminPageSx}>
      <VStack align="stretch" spacing={6} maxW="1480px" mx="auto">
      <HStack justify="space-between" align="start" flexWrap="wrap" gap={3} mb={4}>
        <HStack flexWrap="wrap" gap={2}>
          <Button variant="outline" leftIcon={<Icon as={MdArrowBack} />} onClick={() => navigate("/admin")}>{i18n.t("auto.CoachDashboard.retour_admin", "Retour admin")}</Button>
          <Tag colorScheme="blue">{i18n.t("auto.AdminClient.id", "ID:")}{id}</Tag>
        </HStack>

        <HStack flexWrap="wrap" gap={2}>
          <Button {...theme.primaryButtonProps} leftIcon={<Icon as={MdPlaylistAdd} />} onClick={() => navigate(`/exercise-bank?adminClientId=${id}&adminCreatedBy=BYL`)}>{i18n.t("auto.AdminClient.creer_assigner_comme_byl", "Créer / assigner comme BYL")}</Button>
        </HStack>
      </HStack>

      {error && (
        <Alert status="error" borderRadius="lg" mb={4}>
          <AlertIcon />
          {error}
        </Alert>
      )}

      <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol} mb={6}>
        <CardBody>
          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Box minW={{ base: "100%", md: "auto" }}>
              <Heading size="lg" noOfLines={2}>
                {titleName}
              </Heading>
              <Text color={muted} noOfLines={1}>
                {email}
              </Text>
              <Wrap mt={2} spacing={2}>
                <WrapItem>
                  <Badge colorScheme={kind === "Compte" ? "purple" : "teal"}>{kind || "—"}</Badge>
                </WrapItem>
                {!!userData?.role && (
                  <WrapItem>
                    <Badge colorScheme="cyan">{i18n.t("auto.AdminClient.role", "rôle:")}{role}</Badge>
                  </WrapItem>
                )}
                {!!subscriptionBadge && (
                  <WrapItem>
                    <Badge colorScheme={subscriptionBadge.color}>{subscriptionBadge.label}</Badge>
                  </WrapItem>
                )}
                <WrapItem>
                  <Badge colorScheme="blue">{programsCount}{i18n.t("auto.AdminClient.programme_s", "programme(s)")}</Badge>
                </WrapItem>
              </Wrap>
            </Box>

            <HStack flexWrap="wrap" gap={2}>
              <Button variant="outline" rightIcon={<Icon as={MdOpenInNew} />} onClick={() => navigate(`/clients/${id}?adminMode=1`)}>{i18n.t("auto.AdminClient.ouvrir_fiche_en_vue_coach", "Ouvrir fiche en vue coach")}</Button>
            </HStack>
          </HStack>

          <Divider my={4} />

          <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4}>
            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("clientView.createdOn", "Créé le")}</Text>
              <Text fontWeight="700">{toLocale(userData?.createdAt || clientData?.createdAt)}</Text>
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("auto.AdminClient.coach_fiche", "Coach (fiche)")}</Text>
              <Text fontWeight="700" noOfLines={1}>
                {coachMeta ? pickName(coachMeta, "Nom coach indisponible") : clientData?.createdBy || "—"}
              </Text>
              {coachMeta?.id && (
                <Text fontSize="xs" color={muted} noOfLines={1}>{i18n.t("auto.AdminClient.id", "ID:")}{coachMeta.id}</Text>
              )}
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Text>
              <Text fontWeight="700">{toLocale(lastVisitValue)}</Text>
              {lastVisitLocation !== "—" && (
                <Text fontSize="sm" color={muted} noOfLines={1}>
                  {lastVisitLocation}
                </Text>
              )}
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("auto.AdminClient.essai_facturation", "Essai / Facturation")}</Text>
              <Text fontWeight="700">{userData ? `Essai fin: ${toLocale(userData.trialEndsAt)}` : "—"}</Text>
              <Text fontSize="sm" color={muted}>
                {userData ? `Prochaine facture: ${toLocale(userData.nextInvoiceAt)}` : ""}
              </Text>
            </Box>
          </SimpleGrid>
        </CardBody>
      </Card>

      {linkedUserByEmail && linkedUserByEmail.id !== id && (
        <Alert status="info" borderRadius="lg">
          <AlertIcon />{i18n.t("auto.AdminClient.cette_fiche_crm_est_separee_du_compte_utilisateur", "Cette fiche CRM est séparée du compte utilisateur")}{pickName(linkedUserByEmail, linkedUserByEmail.email || linkedUserByEmail.id)}{i18n.t("auto.AdminClient.les_programmes_affiches_ici_sont_ceux_de_clients", ". Les programmes affichés ici sont ceux de clients/")}{id}{i18n.t("auto.AdminClient.programmes_pas_ceux_de_users", "/programmes, pas ceux de users/")}{linkedUserByEmail.id}.
        </Alert>
      )}

      <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
        <CardHeader>
          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Box>
              <Heading size="md">Profil unifié</Heading>
              <Text color={muted} fontSize="sm">
                Compte de connexion, fiche(s) CRM et programmes retrouvés par uid/email.
              </Text>
            </Box>
            <Wrap spacing={2}>
              <WrapItem>
                <Badge colorScheme="purple">{unifiedProfile?.accounts?.length || 0} compte(s)</Badge>
              </WrapItem>
              <WrapItem>
                <Badge colorScheme="teal">{unifiedProfile?.clients?.length || 0} fiche(s)</Badge>
              </WrapItem>
              <WrapItem>
                <Badge colorScheme="blue">{unifiedProfile?.totalPrograms || 0} programme(s)</Badge>
              </WrapItem>
            </Wrap>
          </HStack>
        </CardHeader>
        <CardBody pt={0}>
          {!unifiedProfile ? (
            <Text color={muted}>Analyse des liens en cours...</Text>
          ) : (
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={4}>
              <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
                <Text fontSize="sm" fontWeight="800" mb={2}>Comptes</Text>
                {unifiedProfile.accounts.length === 0 ? (
                  <Text fontSize="sm" color={muted}>Aucun compte users lié.</Text>
                ) : (
                  <VStack align="stretch" spacing={2}>
                    {unifiedProfile.accounts.map((account) => (
                      <Box key={account.id}>
                        <Text fontWeight="700" noOfLines={1}>{pickName(account, account.email || account.id)}</Text>
                        <Text fontSize="xs" color={muted} noOfLines={1}>users/{account.id} • {account.role || "particulier"}</Text>
                      </Box>
                    ))}
                  </VStack>
                )}
              </Box>

              <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
                <Text fontSize="sm" fontWeight="800" mb={2}>Fiches client</Text>
                {unifiedProfile.clients.length === 0 ? (
                  <Text fontSize="sm" color={muted}>Aucune fiche clients liée.</Text>
                ) : (
                  <VStack align="stretch" spacing={2}>
                    {unifiedProfile.clients.map((client) => (
                      <HStack key={client.id} justify="space-between" gap={3}>
                        <Box minW={0}>
                          <Text fontWeight="700" noOfLines={1}>{pickName(client, client.email || client.id)}</Text>
                          <Text fontSize="xs" color={muted} noOfLines={1}>clients/{client.id}</Text>
                        </Box>
                        <HStack flexShrink={0}>
                          <Badge colorScheme={client.id === id ? "green" : "gray"}>{client.id === id ? "ouverte" : "liée"}</Badge>
                          <Badge colorScheme="blue">{client.programCount || 0} prog.</Badge>
                        </HStack>
                      </HStack>
                    ))}
                  </VStack>
                )}
              </Box>
            </SimpleGrid>
          )}
          {unifiedProfile?.coachIds?.length > 0 && (
            <Wrap mt={4} spacing={2}>
              {unifiedProfile.coachIds.map((coachId) => (
                <WrapItem key={coachId}>
                  <Tag size="sm" borderRadius="full">coach:{coachId}</Tag>
                </WrapItem>
              ))}
            </Wrap>
          )}
        </CardBody>
      </Card>

      <Tabs
        variant="enclosed"
        colorScheme="blue"
        isLazy
        lazyBehavior="keepMounted"
      >
        <TabList flexWrap="wrap">
          <Tab>{i18n.t("auto.AdminClient.resume", "Résumé")}</Tab>
          <Tab>{i18n.t("clientsList.table.programs", "Programmes")}</Tab>
          <Tab>{i18n.t("auto.AdminClient.stripe", "Stripe")}</Tab>
          <Tab>E-mails</Tab>
          <Tab>{i18n.t("auto.AdminClient.donnees_brutes", "Données brutes")}</Tab>
        </TabList>

        <TabPanels>
          {/* Résumé */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminClient.infos_compte", "Infos compte")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminClient.users", "users/")}{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!userData ? (
                    <Text color={muted}>{i18n.t("auto.AdminClient.aucun_compte_trouve_users", "Aucun compte trouvé (users).")}</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>{i18n.t("clientCreation.email", "Email")}</Th><Td>{userData.email || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("auth.register.role", "Rôle")}</Th><Td>{userData.role || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminClient.abonnement_actif", "Abonnement actif")}</Th><Td>{userData.hasActiveSubscription ? "Oui" : "Non"}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminClient.status", "Status")}</Th><Td>{userData.subscriptionStatus || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminClient.essai_demarre", "Essai démarré")}</Th><Td>{toLocale(userData.trialStartedAt)}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminClient.essai_se_termine", "Essai se termine")}</Th><Td>{toLocale(userData.trialEndsAt)}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminClient.prochaine_facture", "Prochaine facture")}</Th><Td>{toLocale(userData.nextInvoiceAt)}</Td></Tr>
                        <Tr><Th>{i18n.t("clientView.createdOn", "Créé le")}</Th><Td>{toLocale(userData.createdAt)}</Td></Tr>
                        <Tr>
                          <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                          <Td>
                            <Text>{toLocale(lastVisitValue)}</Text>
                            {lastVisitLocation !== "—" && <Text fontSize="xs" color={muted}>{lastVisitLocation}</Text>}
                          </Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminClient.infos_fiche", "Infos fiche")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminClient.clients", "clients/")}{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!clientData ? (
                    <Text color={muted}>{i18n.t("auto.AdminClient.aucune_fiche_trouvee_clients", "Aucune fiche trouvée (clients).")}</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>{i18n.t("contact.fields.name.label", "Nom")}</Th><Td>{pickName(clientData, "—")}</Td></Tr>
                        <Tr><Th>{i18n.t("clientCreation.email", "Email")}</Th><Td>{clientData.email || "—"}</Td></Tr>
                        <Tr>
                          <Th>{i18n.t("coachStats.badge", "Coach")}</Th>
                          <Td>
                            <Text fontWeight="700">{coachMeta ? pickName(coachMeta, "Nom coach indisponible") : clientData.createdBy || "—"}</Text>
                            {coachMeta?.id && <Text fontSize="xs" color={muted}>{i18n.t("auto.AdminClient.id", "ID:")}{coachMeta.id}</Text>}
                          </Td>
                        </Tr>
                        <Tr><Th>{i18n.t("clientCreation.level", "Niveau")}</Th><Td>{clientData.niveau || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("nutritionCoach.table.objective", "Objectif")}</Th><Td>{clientData.objectif || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("clientCreation.gender", "Sexe")}</Th><Td>{clientData.sexe || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("clientCreation.phone", "Téléphone")}</Th><Td>{clientData.telephone || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminClient.creee_le", "Créée le")}</Th><Td>{toLocale(clientData.createdAt)}</Td></Tr>
                        <Tr>
                          <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                          <Td>
                            <Text>{toLocale(lastVisitValue)}</Text>
                            {lastVisitLocation !== "—" && <Text fontSize="xs" color={muted}>{lastVisitLocation}</Text>}
                          </Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Programmes */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <Box>
                    <Heading size="md">{i18n.t("auto.AdminClient.programmes_lies", "Programmes liés")}</Heading>
                    <Text color={muted} fontSize="sm">{i18n.t("auto.AdminClient.source", "Source:")}<b>{i18n.t("auto.AdminClient.clients", "clients/")}{id}{i18n.t("auto.AdminClient.programmes", "/programmes")}</b>{i18n.t("auto.AdminClient.prioritaire_fallback_programmes", "(prioritaire) • fallback: programmes/*")}</Text>
                  </Box>
                  <Tag colorScheme="blue">{programsCount}{i18n.t("auto.AdminClient.trouve_s", "trouvé(s)")}</Tag>
                </HStack>
              </CardHeader>

              <CardBody>
                {programs.length === 0 ? (
                  <Text color={muted}>{i18n.t("auto.AdminClient.aucun_programme_lie", "Aucun programme lié.")}</Text>
                ) : (
                  <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                    <Table size="sm">
                      <Tbody>
                        {programs.map((p) => {
                          const pname = p.nom || p.name || p.title || p.programName || p.titre || p.objectif || p.id;
                          const originLabel = p.origine || p.origin || p.source || p.generatedBy || p.meta?.source || "—";

                          const openPath = getProgramOpenPath({ clientId: id, program: p });
                          const builderPath = getBuilderPath({ clientId: id, program: p });

                          return (
                            <Tr key={p.id} _hover={{ bg: softBg }}>
                              <Td maxW={{ base: "240px", md: "520px" }}>
                                <Text fontWeight="700" noOfLines={1}>
                                  {String(pname)}
                                </Text>
                                <Text fontSize="sm" color={muted} noOfLines={2}>{i18n.t("auto.AdminClient.cree", "Créé:")}{toLocale(p.createdAt)}{i18n.t("auto.AdminClient.origine", "• Origine:")}{originLabel}
                                  {p.__where ? ` • Source: ${p.__where}` : ""}
                                </Text>
                                <Text fontSize="xs" color={muted} noOfLines={1}>{i18n.t("auto.AdminClient.id", "ID:")}{p.id}
                                </Text>
                              </Td>
                              <Td>
                                <HStack justify="flex-end" flexWrap="wrap" gap={2}>
                                  {openPath && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      rightIcon={<Icon as={MdOpenInNew} />}
                                      onClick={() => navigate(openPath)}
                                    >{i18n.t("programs.open", "Ouvrir")}</Button>
                                  )}

                                  {builderPath && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      rightIcon={<Icon as={MdEdit} />}
                                      onClick={() => navigate(builderPath)}
                                    >{i18n.t("auto.AdminClient.builder", "Builder")}</Button>
                                  )}
                                </HStack>
                              </Td>
                            </Tr>
                          );
                        })}
                      </Tbody>
                    </Table>
                  </Box>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* Stripe */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminClient.stripe_admin", "Stripe — Admin")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminClient.donnees_stripe_consolidees_factures_retards_et_abo", "Données Stripe consolidées, factures, retards et abonnement.")}</Text>
                </CardHeader>
                <CardBody>
                  <HStack flexWrap="wrap" gap={2} mb={4}>
                    <Button
                      leftIcon={<Icon as={MdPayment} />}
                      onClick={openStripePortal}
                      isLoading={dangerLoading.portal}
                      variant="outline"
                    >{i18n.t("auto.AdminClient.portail_stripe", "Portail Stripe")}</Button>
                    <Button
                      leftIcon={<Icon as={MdRefresh} />}
                      onClick={refreshStripe}
                      isLoading={stripeLoading}
                      variant="outline"
                    >{i18n.t("auto.AdminClient.rafraichir", "Rafraîchir")}</Button>
                    <Button
                      leftIcon={<Icon as={MdReceipt} />}
                      onClick={reconcileStripe}
                      isLoading={dangerLoading.reconcile}
                      variant="outline"
                    >{i18n.t("auto.AdminClient.reconcile", "Reconcile")}</Button>
                  </HStack>

                  <VStack align="stretch" spacing={1} color={muted} fontSize="sm">
                    <Text><Text as="span" fontWeight="700">{i18n.t("auto.AdminClient.portail_stripe", "Portail Stripe")}</Text>{i18n.t("auto.AdminClient.ouvre_le_portail_stripe_du_customer_pour_consulter", "ouvre le portail Stripe du customer pour consulter/gérer côté Stripe.")}</Text>
                    <Text><Text as="span" fontWeight="700">{i18n.t("auto.AdminClient.rafraichir", "Rafraîchir")}</Text>{i18n.t("auto.AdminClient.relit_stripe_sans_modifier_les_donnees", "relit Stripe sans modifier les données.")}</Text>
                    <Text><Text as="span" fontWeight="700">{i18n.t("auto.AdminClient.reconcile", "Reconcile")}</Text>{i18n.t("auto.AdminClient.resynchronise_firestore_avec_stripe_pour_remettre_", "resynchronise Firestore avec Stripe pour remettre le statut, l’abonnement et les dates à jour.")}</Text>
                  </VStack>

                  {stripeInfo?.fallbackReason || stripeInfo?.stripeAvailable === false ? (
                    <Alert status="warning" borderRadius="lg" mt={4}>
                      <AlertIcon />
                      <Box>
                        <Text fontWeight="700">{i18n.t("auto.AdminClient.stripe_n_a_pas_repondu_pour_ce_profil", "Stripe n’a pas répondu pour ce profil.")}</Text>
                        <Text fontSize="sm">{i18n.t("auto.AdminClient.les_valeurs_affichees_viennent_de_firestore_les_fa", "Les valeurs affichées viennent de Firestore. Les factures, paiements et retards réels apparaîtront quand le backend Stripe sera joignable.")}</Text>
                      </Box>
                    </Alert>
                  ) : null}

                  {stripeInfo ? (
                    <VStack align="stretch" spacing={4} mt={4}>
                      <Table size="sm">
                        <Tbody>
                          <Tr><Th>{i18n.t("auto.AdminClient.customer", "Customer")}</Th><Td>{stripeInfo.customer?.id || stripeInfo.firestore?.stripeCustomerId || "—"}</Td></Tr>
                          <Tr><Th>{i18n.t("clientsList.table.subscription", "Abonnement")}</Th><Td>{stripeInfo.subscription?.status || stripeInfo.firestore?.subscriptionStatus || "—"}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminClient.depuis_le", "Depuis le")}</Th><Td>{toLocale(stripeInfo.subscription?.startedAt || stripeInfo.firestore?.trialStartedAt)}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminClient.periode_en_cours", "Période en cours")}</Th><Td>{toLocale(stripeInfo.subscription?.currentPeriodStart)} → {toLocale(stripeInfo.subscription?.currentPeriodEnd || stripeInfo.firestore?.nextInvoiceAt)}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminClient.retard_paiement", "Retard paiement")}</Th><Td>{stripeInfo.hasPaymentDelay ? "Oui" : "Non"}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminClient.montant_du", "Montant dû")}</Th><Td>{stripeInfo.amountDueLabel || "—"}</Td></Tr>
                        </Tbody>
                      </Table>

                      <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                        <Table size="sm">
                          <Tbody>
                            {(stripeInfo.invoices || []).map((invoice) => {
                              const status = String(invoice.status || "").toLowerCase();
                              const isBusy = (action) => invoiceActionBusy === `${invoice.id}:${action}`;
                              const canSend = ["draft", "open"].includes(status) && invoice.collectionMethod === "send_invoice";
                              const canMarkPaid = ["open", "uncollectible"].includes(status);
                              const canMarkUncollectible = status === "open";
                              const canVoid = ["draft", "open", "uncollectible"].includes(status);

                              return (
                                <Tr key={invoice.id}>
                                  <Td minW="240px">
                                    <Text fontWeight="700">{invoice.number || invoice.id}</Text>
                                    <Text fontSize="xs" color={muted}>{i18n.t("auto.AdminClient.creee", "Créée:")}{toLocale(invoice.created)}{i18n.t("auto.AdminClient.echeance", "• Échéance:")}{toLocale(invoice.dueDate)}
                                    </Text>
                                  </Td>
                                  <Td minW="110px">{invoiceStatusLabel(invoice.status)}</Td>
                                  <Td minW="90px">{invoice.paid ? "Payée" : invoice.amountRemaining > 0 ? "À payer" : "—"}</Td>
                                  <Td minW="130px">{moneyMinor(invoice.amountPaid, invoice.currency)} / {moneyMinor(invoice.amountDue, invoice.currency)}</Td>
                                  <Td minW="110px">{invoice.finalizedAt ? "Finalisée" : invoice.attempted ? "Tentative" : "Brouillon"}</Td>
                                  <Td minW="330px">
                                    <Wrap spacing={2}>
                                      {(invoice.hostedInvoiceUrl || invoice.invoicePdf) && (
                                        <WrapItem>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            rightIcon={<Icon as={MdOpenInNew} />}
                                            onClick={() => openInvoiceUrl(invoice)}
                                          >{i18n.t("programs.open", "Ouvrir")}</Button>
                                        </WrapItem>
                                      )}
                                      {status === "draft" && (
                                        <WrapItem>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            leftIcon={<Icon as={MdCheckCircle} />}
                                            isLoading={isBusy("finalize")}
                                            onClick={() => runInvoiceAction(invoice, "finalize")}
                                          >{i18n.t("auto.AdminClient.finaliser", "Finaliser")}</Button>
                                        </WrapItem>
                                      )}
                                      {canSend && (
                                        <WrapItem>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            leftIcon={<Icon as={MdSend} />}
                                            isLoading={isBusy("send")}
                                            onClick={() => runInvoiceAction(invoice, "send")}
                                          >{i18n.t("auto.AdminClient.renvoyer", "Renvoyer")}</Button>
                                        </WrapItem>
                                      )}
                                      {canMarkPaid && (
                                        <WrapItem>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            colorScheme="green"
                                            leftIcon={<Icon as={MdCheckCircle} />}
                                            isLoading={isBusy("mark_paid")}
                                            onClick={() => runInvoiceAction(invoice, "mark_paid")}
                                          >{i18n.t("auto.AdminClient.payee", "Payée")}</Button>
                                        </WrapItem>
                                      )}
                                      {canMarkUncollectible && (
                                        <WrapItem>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            colorScheme="orange"
                                            leftIcon={<Icon as={MdReport} />}
                                            isLoading={isBusy("mark_uncollectible")}
                                            onClick={() => runInvoiceAction(invoice, "mark_uncollectible")}
                                          >{i18n.t("auto.AdminClient.impayee", "Impayée")}</Button>
                                        </WrapItem>
                                      )}
                                      {canVoid && (
                                        <WrapItem>
                                          <Button
                                            size="xs"
                                            variant="outline"
                                            colorScheme="red"
                                            leftIcon={<Icon as={MdCancel} />}
                                            isLoading={isBusy("void")}
                                            onClick={() => runInvoiceAction(invoice, "void")}
                                          >{i18n.t("exerciseCard.cancel", "Annuler")}</Button>
                                        </WrapItem>
                                      )}
                                    </Wrap>
                                  </Td>
                                </Tr>
                              );
                            })}
                            {(!stripeInfo.invoices || stripeInfo.invoices.length === 0) && (
                              <Tr><Td color={muted}>{i18n.t("auto.AdminClient.aucune_facture_stripe_trouvee", "Aucune facture Stripe trouvée.")}</Td></Tr>
                            )}
                          </Tbody>
                        </Table>
                      </Box>
                    </VStack>
                  ) : null}
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminClient.creer_une_facture", "Créer une facture")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminClient.cree_un_invoice_item_puis_une_invoice_stripe_optio", "Crée un invoice item puis une invoice Stripe (optionnel: envoyer par email).")}</Text>
                </CardHeader>
                <CardBody>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>{i18n.t("auto.AdminClient.prix_stripe", "Prix Stripe")}</FormLabel>
                      <Select
                        value={invoicePriceId}
                        onChange={(e) => handleInvoicePriceChange(e.target.value)}
                        isDisabled={pricesLoading}
                      >
                        <option value="">
                          {pricesLoading
                            ? i18n.t("auto.AdminClient.chargement_des_prix", "Chargement des prix…")
                            : i18n.t("auto.AdminClient.montant_manuel", "Montant manuel")}
                        </option>
                        {stripePrices.map((price) => (
                          <option key={price.id} value={price.id}>
                            {price.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminClient.montant", "Montant")}</FormLabel>
                      <Input value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="39.99" isDisabled={!!invoicePriceId} />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminClient.devise", "Devise")}</FormLabel>
                      <Select value={invoiceCurrency} onChange={(e) => setInvoiceCurrency(e.target.value)} isDisabled={!!invoicePriceId}>
                        <option value="eur">EUR</option>
                        <option value="usd">USD</option>
                        <option value="gbp">GBP</option>
                      </Select>
                    </FormControl>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>{i18n.t("auto.AdminClient.description", "Description")}</FormLabel>
                      <Input value={invoiceDesc} onChange={(e) => setInvoiceDesc(e.target.value)} placeholder={i18n.t("auto.AdminClient.facture_manuelle_admin", "Facture manuelle (admin)")} />
                    </FormControl>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>{i18n.t("auto.AdminClient.envoyer_par_email", "Envoyer par email")}</FormLabel>
                      <Select value={sendEmail} onChange={(e) => setSendEmail(e.target.value)}>
                        <option value="yes">{i18n.t("common.yes", "Oui")}</option>
                        <option value="no">{i18n.t("common.no", "Non")}</option>
                      </Select>
                    </FormControl>
                  </SimpleGrid>

                  <Button
                    mt={4}
                    width="100%"
                    colorScheme="blue"
                    leftIcon={<Icon as={MdReceipt} />}
                    onClick={createInvoice}
                    isLoading={dangerLoading.createInvoice}
                  >{i18n.t("auto.AdminClient.creer_la_facture", "Créer la facture")}</Button>

                  <Divider my={6} />

                  <Box>
                    <Text fontWeight="800" mb={2}>{i18n.t("auto.AdminClient.actions_sensibles_backend_a_brancher_ensuite", "Actions sensibles (backend à brancher ensuite)")}</Text>

                    <VStack align="stretch" spacing={2}>
                      <Button
                        leftIcon={<Icon as={MdDelete} />}
                        colorScheme="red"
                        variant="outline"
                        onClick={deleteAccount}
                        isLoading={dangerLoading.deleteAccount}
                      >{i18n.t("auto.AdminClient.supprimer_compte_auth_firestore", "Supprimer compte (Auth + Firestore)")}</Button>

                      <Button
                        leftIcon={<Icon as={MdSend} />}
                        colorScheme="blue"
                        variant="outline"
                        onClick={sendPasswordReset}
                        isLoading={dangerLoading.passwordReset}
                        isDisabled={!userData && !linkedUserByEmail}
                      >{i18n.t("auto.AdminClient.envoyer_reset_password", "Envoyer e-mail mot de passe")}</Button>

                      <Button
                        leftIcon={<Icon as={MdBlock} />}
                        colorScheme="orange"
                        variant="outline"
                        onClick={cancelAccess}
                        isLoading={dangerLoading.cancelAccess}
                      >{i18n.t("auto.AdminClient.annuler_abonnement_couper_acces", "Annuler abonnement / couper accès")}</Button>

                      <HStack>
                        <Input
                          value={trialDays}
                          onChange={(e) => setTrialDays(e.target.value)}
                          placeholder="14"
                          maxW="120px"
                        />
                        <Button
                          leftIcon={<Icon as={MdEdit} />}
                          variant="outline"
                          onClick={editTrial}
                          isLoading={dangerLoading.editTrial}
                          flex="1"
                        >{i18n.t("auto.AdminClient.regler_l_essai_jours", "Régler l’essai (jours)")}</Button>
                      </HStack>

                      <Text fontSize="sm" color={muted}>{i18n.t("auto.AdminClient.les_actions_modifient_firestore_et_stripe_quand_un", "Les actions modifient Firestore et Stripe quand un customer/subscription existe.")}</Text>
                    </VStack>
                  </Box>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* E-mails */}
          <TabPanel px={0}>
            <Suspense fallback={<AppLoading label="Chargement des e-mails..." />}>
              <AdminClientEmailPanel clientId={id} />
            </Suspense>
          </TabPanel>

          {/* Données brutes */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminClient.users", "users/")}{id}</Heading>
                </CardHeader>
                <CardBody>
                  <Box
                    as="pre"
                    p={3}
                    bg={softBg}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor={borderCol}
                    overflow="auto"
                    fontSize="xs"
                    whiteSpace="pre-wrap"
                  >
                    {JSON.stringify(userData || null, null, 2)}
                  </Box>
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminClient.clients", "clients/")}{id}</Heading>
                </CardHeader>
                <CardBody>
                  <Box
                    as="pre"
                    p={3}
                    bg={softBg}
                    borderRadius="lg"
                    border="1px solid"
                    borderColor={borderCol}
                    overflow="auto"
                    fontSize="xs"
                    whiteSpace="pre-wrap"
                  >
                    {JSON.stringify(clientData || null, null, 2)}
                  </Box>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>
        </TabPanels>
      </Tabs>
      </VStack>
    </Box>
  );
}
