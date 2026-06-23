// src/pages/AdminCoach.jsx
import React, { useEffect, useMemo, useState } from "react";
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
import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, db } from "../firebaseConfig";
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
  MdPeople,
  MdFitnessCenter,
  MdLockReset,
  MdManageAccounts,
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

function toLocale(v) {
  const d = v?.toDate
    ? v.toDate()
    : typeof v === "string" || typeof v === "number"
    ? new Date(v)
    : null;
  return d ? d.toLocaleString() : "—";
}

const toMillis = (v) => {
  const d = v?.toDate
    ? v.toDate()
    : typeof v === "string" || typeof v === "number"
    ? new Date(v)
    : null;
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

function toDatetimeLocal(v) {
  const d = v?.toDate
    ? v.toDate()
    : typeof v === "string" || typeof v === "number"
    ? new Date(v)
    : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

function pickName(obj, fallback = "—") {
  const a = `${obj?.firstName || ""} ${obj?.lastName || ""}`.trim();
  if (a) return a;
  const b = `${obj?.prenom || ""} ${obj?.nom || ""}`.trim();
  if (b) return b;
  const c = `${obj?.displayName || ""}`.trim();
  if (c) return c;
  return fallback;
}

function pickProgramName(program = {}, fallback = "Programme") {
  return String(
    program.nomProgramme ||
      program.programName ||
      program.nom ||
      program.name ||
      program.titre ||
      program.title ||
      program.objectif ||
      fallback
  ).trim() || fallback;
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

function getAccessMeta(user) {
  const rawStatus = String(user?.subscriptionStatus || "").toLowerCase();
  const status = rawStatus || (user?.hasActiveSubscription ? "active" : "free");

  if (status === "trialing") {
    return { status, color: "purple", label: "Période d’essai", paidActive: false };
  }
  if (status === "active") {
    return { status, color: "green", label: "Abonnement payant actif", paidActive: true };
  }
  if (status === "past_due" || status === "unpaid") {
    return { status, color: "orange", label: "Paiement en retard", paidActive: false };
  }
  if (status === "canceled" || status === "cancelled") {
    return { status: "canceled", color: "red", label: "Accès annulé", paidActive: false };
  }
  return { status: status || "free", color: "gray", label: "Free", paidActive: false };
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

function buildLocalBillingInfo(user, fallbackReason = "stripe-unavailable") {
  const accessMeta = getAccessMeta(user);
  return {
    stripeAvailable: false,
    fallbackReason,
    customer: user?.stripeCustomerId ? { id: user.stripeCustomerId } : null,
    subscription: user?.stripeSubscriptionId
      ? {
          id: user.stripeSubscriptionId,
          status: accessMeta.status,
          startedAt: user.trialStartedAt || null,
          currentPeriodEnd: user.nextInvoiceAt || user.trialEndsAt || user.trialEnd || null,
        }
      : null,
    firestore: {
      stripeCustomerId: user?.stripeCustomerId || null,
      stripeSubscriptionId: user?.stripeSubscriptionId || null,
      subscriptionStatus: accessMeta.status,
      hasActiveSubscription: accessMeta.paidActive,
      trialStartedAt: user?.trialStartedAt || null,
      trialEndsAt: user?.trialEndsAt || user?.trialEnd || null,
      nextInvoiceAt: user?.nextInvoiceAt || null,
    },
    invoices: [],
    hasPaymentDelay: false,
    amountDue: 0,
    amountDueLabel: moneyMinor(0, "eur"),
  };
}

function normalizeOrigin(p) {
  return String(p?.origine || p?.origin || p?.source || "").toLowerCase();
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

function getProgramOpenPath(p) {
  // adapte si tes routes diffèrent
  if (isAutoProgram(p)) return `/auto-program-preview/${p.id}`;
  return `/programmes/${p.id}`;
}

export default function AdminCoach() {
  const { id } = useParams(); // uid coach
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
  const [userData, setUserData] = useState(null); // users/:id (si existe)
  const [coachData, setCoachData] = useState(null); // coachs/:id (si existe)
  const [clients, setClients] = useState([]); // clients créés par le coach
  const [programs, setPrograms] = useState([]); // programmes créés par le coach
  const [error, setError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);

  // Stripe
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeInfo, setStripeInfo] = useState(null);
  const [invoiceAmount, setInvoiceAmount] = useState("39.99");
  const [invoiceCurrency, setInvoiceCurrency] = useState("eur");
  const [invoiceDesc, setInvoiceDesc] = useState("Facture manuelle (admin)");
  const [invoicePriceId, setInvoicePriceId] = useState("");
  const [stripePrices, setStripePrices] = useState([]);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [sendEmail, setSendEmail] = useState("yes");
  const [trialEndInput, setTrialEndInput] = useState("");
  const [accessStatus, setAccessStatus] = useState("free");
  const [invoiceActionBusy, setInvoiceActionBusy] = useState("");

  const [busy, setBusy] = useState({
    portal: false,
    reconcile: false,
    createInvoice: false,
    deleteCoach: false,
    cancelAccess: false,
    editTrial: false,
    resetPassword: false,
    setAccess: false,
  });

  useEffect(() => {
    if (!userData) return;
    setAccessStatus(userData.subscriptionStatus || (userData.hasActiveSubscription ? "active" : "free"));
    setTrialEndInput(toDatetimeLocal(userData.trialEndsAt || userData.trialEnd));
  }, [userData]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setLoading(true);
      setError("");
      setUserData(null);
      setCoachData(null);
      setClients([]);
      setPrograms([]);
      setStripeInfo(null);

      try {
        // 1) users/{uid}
        const uSnap = await getDoc(doc(db, "users", id));
        if (!mounted) return;
        if (uSnap.exists()) setUserData({ id, ...(uSnap.data() || {}) });

        // 2) coachs/{uid}
        const cSnap = await getDoc(doc(db, "coachs", id));
        if (!mounted) return;
        if (cSnap.exists()) setCoachData({ id, ...(cSnap.data() || {}) });

        // 3) clients créés par ce coach (createdBy == uid)
        let cl = [];
        try {
          const qC = query(
            collection(db, "clients"),
            where("createdBy", "==", id),
            orderBy("createdAt", "desc"),
            limit(200)
          );
          const cs = await getDocs(qC);
          cs.forEach((d) => cl.push({ id: d.id, ...(d.data() || {}) }));
        } catch {
          const qC = query(collection(db, "clients"), where("createdBy", "==", id));
          const cs = await getDocs(qC);
          cs.forEach((d) => cl.push({ id: d.id, ...(d.data() || {}) }));
        }
        setClients(cl);

        // 4) programmes créés par ce coach (createdBy == uid) (fallback coachId/coachUid)
        let pr = [];
        const tryQueries = [
          () =>
            query(
              collection(db, "programmes"),
              where("createdBy", "==", id),
              orderBy("createdAt", "desc"),
              limit(200)
            ),
          () =>
            query(
              collection(db, "programmes"),
              where("coachId", "==", id),
              orderBy("createdAt", "desc"),
              limit(200)
            ),
          () =>
            query(
              collection(db, "programmes"),
              where("coachUid", "==", id),
              orderBy("createdAt", "desc"),
              limit(200)
            ),
        ];

        let got = false;
        for (const buildQ of tryQueries) {
          if (got) break;
          try {
            const ps = await getDocs(buildQ());
            ps.forEach((d) => pr.push({ id: d.id, ...(d.data() || {}) }));
            if (pr.length) got = true;
          } catch {
            // ignore, try next
          }
        }

        if (!pr.length) {
          // fallback sans orderBy (si index manquant)
          try {
            const ps = await getDocs(query(collection(db, "programmes"), where("createdBy", "==", id)));
            ps.forEach((d) => pr.push({ id: d.id, ...(d.data() || {}) }));
          } catch {}
        }

        setPrograms(pr);

        if (!uSnap.exists() && !cSnap.exists()) {
          setError("Aucun document trouvé : ni users/{id} ni coachs/{id}.");
        }
      } catch (e) {
        console.error("AdminCoach error:", e);
        setError("Erreur de chargement du coach.");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, reloadTick]);

  const titleName = useMemo(() => {
    return pickName(userData || coachData || {}, id);
  }, [userData, coachData, id]);

  const email = userData?.email || coachData?.email || "—";
  const role = userData?.role || "coach";

  const subscriptionBadge = useMemo(() => {
    if (!userData) return null;
    return getAccessMeta(userData);
  }, [userData]);

  const lastActivityValue = useMemo(
    () =>
      lastVisitAfterCreation(
        userData?.createdAt || coachData?.createdAt,
        userData?.lastVisitAt,
        userData?.lastLoginAt,
        userData?.lastSeenAt,
        userData?.lastActivityAt,
        userData?.lastActiveAt,
        userData?.location?.updatedAt,
        coachData?.lastVisitAt,
        coachData?.lastLoginAt,
        coachData?.lastSeenAt,
        coachData?.lastActivityAt,
        coachData?.lastActiveAt,
        coachData?.location?.updatedAt
      ),
    [coachData, userData]
  );
  const lastActivityLocation = formatLocation(userData?.location || coachData?.location);

  // --- Stripe actions (identiques à AdminClient)
  const openStripePortal = async () => {
    setBusy((s) => ({ ...s, portal: true }));
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
        toast({ title: i18n.t("auto.AdminCoach.stripe", "Stripe"), description: data?.error || "Stripe non configuré.", status: "warning", duration: 5000, isClosable: true });
        return;
      }
      if (data?.url) window.open(data.url, "_blank", "noopener,noreferrer");
      else throw new Error("no-url");
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.stripe_portal", "Stripe portal"), description: e.message || "Erreur", status: "error", duration: 5000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, portal: false }));
    }
  };

  const reconcileStripe = async () => {
    setBusy((s) => ({ ...s, reconcile: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "reconcile-error");
      toast({ title: i18n.t("auto.AdminCoach.reconcile", "Reconcile"), description: `OK — status: ${data?.status || "?"}`, status: "success", duration: 3500, isClosable: true });
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.reconcile", "Reconcile"), description: e.message || "Erreur", status: "error", duration: 5000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, reconcile: false }));
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
      setStripeInfo(buildLocalBillingInfo(userData, e.message || "summary-error"));
      if (!silent) {
        toast({
          title: i18n.t("auto.ClubDashboard.stripe_indisponible", "Stripe indisponible"),
          description: i18n.t("auto.AdminCoach.j_affiche_les_infos_firestore_disponibles_redemarr", "J’affiche les infos Firestore disponibles. Redémarre le backend ou vérifie la clé Stripe pour les factures réelles."),
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
    if (loading || !userData) return;
    refreshStripe({ silent: true });
  }, [loading, userData?.id]);

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
        console.warn("[AdminCoach] Stripe prices unavailable:", e?.message || e);
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
    setBusy((s) => ({ ...s, createInvoice: true }));
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
        title: data?.emailWarning ? "Facture créée, email non envoyé" : "Facture créée",
        description: data?.invoiceId
          ? `Invoice: ${data.invoiceId}${data?.amountDueLabel ? ` • ${data.amountDueLabel}` : ""}${
              data?.emailWarning ? ` • ${data.emailWarning}` : ""
            }`
          : "OK",
        status: data?.emailWarning ? "warning" : "success",
        duration: data?.emailWarning ? 7000 : 4000,
        isClosable: true,
      });
      refreshStripe({ silent: true });
    } catch (e) {
      toast({
        title: i18n.t("auto.AdminCoach.creer_facture", "Créer facture"),
        description: e.message || "Erreur (normal tant que le backend n’est pas branché)",
        status: "error",
        duration: 6000,
        isClosable: true,
      });
    } finally {
      setBusy((s) => ({ ...s, createInvoice: false }));
    }
  };

  // --- actions sensibles (backend à brancher ensuite)
  const deleteCoach = async () => {
    setBusy((s) => ({ ...s, deleteCoach: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: id }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "delete-error");
      toast({ title: i18n.t("auto.AdminCoach.compte_supprime", "Compte supprimé"), description: i18n.t("auto.AdminCoach.auth_firestore", "Auth + Firestore"), status: "success", duration: 4000, isClosable: true });
      navigate("/admin");
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.supprimer_coach", "Supprimer coach"), description: e.message || "Endpoint backend non branché", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, deleteCoach: false }));
    }
  };

  const cancelAccess = async () => {
    setBusy((s) => ({ ...s, cancelAccess: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/cancel-subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "cancel-error");
      toast({ title: i18n.t("auto.AdminCoach.acces_coupe", "Accès coupé"), description: i18n.t("auto.AdminCoach.abonnement_annule_acces_mis_a_jour", "Abonnement annulé / accès mis à jour"), status: "success", duration: 4000, isClosable: true });
      setReloadTick((tick) => tick + 1);
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.couper_acces", "Couper accès"), description: e.message || "Endpoint backend non branché", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, cancelAccess: false }));
    }
  };

  const editTrial = async () => {
    setBusy((s) => ({ ...s, editTrial: true }));
    try {
      const exactTrialEnd = trialEndInput ? new Date(trialEndInput) : null;
      if (!exactTrialEnd || Number.isNaN(exactTrialEnd.getTime())) {
        throw new Error("date de fin invalide");
      }
      if (exactTrialEnd.getTime() <= Date.now()) {
        throw new Error("choisir une date de fin future");
      }
      const r = await fetch(`${getApiBase()}/payments/admin/set-trial`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, trialEnd: exactTrialEnd.toISOString() }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "trial-error");
      toast({
        title: i18n.t("auto.AdminCoach.essai_modifie", "Essai modifié"),
        description: data?.trialEnd ? `Fin: ${toLocale(data.trialEnd)}` : "OK",
        status: "success",
        duration: 4000,
        isClosable: true,
      });
      setAccessStatus("trialing");
      setReloadTick((tick) => tick + 1);
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.modifier_essai", "Modifier essai"), description: e.message || "Endpoint backend non branché", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, editTrial: false }));
    }
  };

  const openInvoiceUrl = (invoice) => {
    const url = invoice?.hostedInvoiceUrl || invoice?.invoicePdf || "";
    if (!url) {
      toast({
        title: i18n.t("auto.AdminCoach.ouvrir_facture", "Ouvrir facture"),
        description: i18n.t("auto.AdminCoach.aucun_lien_stripe_disponible_pour_cette_facture", "Aucun lien Stripe disponible pour cette facture."),
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

  const updateAccessStatus = async () => {
    setBusy((s) => ({ ...s, setAccess: true }));
    try {
      const r = await fetch(`${getApiBase()}/payments/admin/set-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ uid: userData?.id || id, email, status: accessStatus }),
      });
      const data = await readJsonResponse(r);
      if (!r.ok) throw new Error(data?.error || "access-error");
      toast({ title: i18n.t("auto.AdminCoach.acces_mis_a_jour", "Accès mis à jour"), description: `Statut: ${data?.status || accessStatus}`, status: "success", duration: 4000, isClosable: true });
      setReloadTick((tick) => tick + 1);
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.modifier_acces", "Modifier accès"), description: e.message || "Erreur", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, setAccess: false }));
    }
  };

  const sendResetPassword = async () => {
    setBusy((s) => ({ ...s, resetPassword: true }));
    try {
      if (!email || email === "—") throw new Error("email manquant");
      await sendPasswordResetEmail(auth, email);
      toast({ title: i18n.t("auto.AdminCoach.email_envoye", "Email envoyé"), description: i18n.t("auto.AdminCoach.lien_de_reinitialisation_du_mot_de_passe_envoye", "Lien de réinitialisation du mot de passe envoyé."), status: "success", duration: 4000, isClosable: true });
    } catch (e) {
      toast({ title: i18n.t("auto.AdminCoach.mot_de_passe_oublie", "Mot de passe oublié"), description: e.message || "Erreur", status: "error", duration: 6000, isClosable: true });
    } finally {
      setBusy((s) => ({ ...s, resetPassword: false }));
    }
  };

  if (loading) {
    return <AppLoading label={i18n.t("auto.AdminCoach.chargement_du_coach", "Chargement du coach...")} />;
  }

  return (
    <Box p={{ base: 4, md: 8 }} bg={theme.pageBg} color={theme.textColor} minH="calc(100vh - 112px)" sx={adminPageSx}>
      <VStack align="stretch" spacing={6} maxW="1480px" mx="auto">
      <HStack justify="space-between" align="start" flexWrap="wrap" gap={3} mb={4}>
        <HStack flexWrap="wrap" gap={2}>
          <Button variant="outline" leftIcon={<Icon as={MdArrowBack} />} onClick={() => navigate("/admin")}>{i18n.t("auto.CoachDashboard.retour_admin", "Retour admin")}</Button>
          <Tag colorScheme="blue">{i18n.t("auto.AdminCoach.coach_uid", "Coach UID:")}{id}</Tag>
        </HStack>

        <HStack flexWrap="wrap" gap={2}>
          <Button {...theme.primaryButtonProps} leftIcon={<Icon as={MdPlaylistAdd} />} onClick={() => navigate(`/exercise-bank/program-builder/new?adminCoachId=${id}`)}>{i18n.t("auto.AdminCoach.creer_comme_ce_coach", "Créer comme ce coach")}</Button>
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
                  <Badge colorScheme="cyan">{i18n.t("auto.AdminCoach.role", "rôle:")}{role || "coach"}</Badge>
                </WrapItem>
                {!!subscriptionBadge && (
                  <WrapItem>
                    <Badge colorScheme={subscriptionBadge.color}>{subscriptionBadge.label}</Badge>
                  </WrapItem>
                )}
                <WrapItem>
                  <Badge colorScheme="blue">{clients.length}{i18n.t("auto.ClubDashboard.client_s_2", "client(s)")}</Badge>
                </WrapItem>
                <WrapItem>
                  <Badge colorScheme="purple">{programs.length}{i18n.t("auto.AdminCoach.programme_s", "programme(s)")}</Badge>
                </WrapItem>
              </Wrap>
            </Box>

            <HStack flexWrap="wrap" gap={2}>
              <Button variant="outline" rightIcon={<Icon as={MdOpenInNew} />} onClick={() => navigate(`/coach-dashboard?adminCoachId=${id}`)}>{i18n.t("auto.AdminCoach.dashboard_en_vue_coach", "Dashboard en vue coach")}</Button>
            </HStack>
          </HStack>

          <Divider my={4} />

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("auto.AdminCoach.cree_le_users_coachs", "Créé le (users/coachs)")}</Text>
              <Text fontWeight="700">{toLocale(userData?.createdAt || coachData?.createdAt)}</Text>
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("clientView.lastActivity", "Dernière activité")}</Text>
              <Text fontWeight="700">{toLocale(lastActivityValue)}</Text>
              {lastActivityLocation !== "—" && (
                <Text fontSize="sm" color={muted}>
                  {lastActivityLocation}
                </Text>
              )}
            </Box>

            <Box p={3} bg={softBg} borderRadius="xl" border="1px solid" borderColor={borderCol}>
              <Text fontSize="sm" color={muted}>{i18n.t("auto.AdminCoach.essai_facturation", "Essai / Facturation")}</Text>
              <Text fontWeight="700">{userData ? `Essai fin: ${toLocale(userData.trialEndsAt)}` : "—"}</Text>
              <Text fontSize="sm" color={muted}>
                {userData ? `Prochaine facture: ${toLocale(userData.nextInvoiceAt)}` : ""}
              </Text>
            </Box>
          </SimpleGrid>
        </CardBody>
      </Card>

      <Tabs variant="enclosed" colorScheme="blue">
        <TabList flexWrap="wrap">
          <Tab>{i18n.t("auto.AdminCoach.resume", "Résumé")}</Tab>
          <Tab>{i18n.t("dashboard.stats_total_clients", "Clients")}</Tab>
          <Tab>{i18n.t("clientsList.table.programs", "Programmes")}</Tab>
          <Tab>{i18n.t("nutritionCoach.table.actions", "Actions")}</Tab>
          <Tab>{i18n.t("auto.AdminCoach.stripe", "Stripe")}</Tab>
          <Tab>{i18n.t("auto.AdminCoach.donnees_brutes", "Données brutes")}</Tab>
        </TabList>

        <TabPanels>
          {/* Résumé */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminCoach.infos_compte", "Infos compte")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.users", "users/")}{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!userData ? (
                    <Text color={muted}>{i18n.t("auto.AdminCoach.aucun_compte_trouve_users", "Aucun compte trouvé (users).")}</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>{i18n.t("clientCreation.email", "Email")}</Th><Td>{userData.email || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("auth.register.role", "Rôle")}</Th><Td>{userData.role || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminCoach.abonnement_payant_actif", "Abonnement payant actif")}</Th><Td>{getAccessMeta(userData).paidActive ? "Oui" : "Non"}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminCoach.statut_d_acces", "Statut d’accès")}</Th><Td>{getAccessMeta(userData).label}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminCoach.essai_se_termine", "Essai se termine")}</Th><Td>{toLocale(userData.trialEndsAt)}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminCoach.prochaine_facture", "Prochaine facture")}</Th><Td>{toLocale(userData.nextInvoiceAt)}</Td></Tr>
                        <Tr><Th>{i18n.t("clientView.createdOn", "Créé le")}</Th><Td>{toLocale(userData.createdAt)}</Td></Tr>
                        <Tr>
                          <Th>{i18n.t("auto.ClubDashboard.derniere_visite", "Dernière visite")}</Th>
                          <Td>
                            <Text fontWeight="700">{toLocale(lastActivityValue)}</Text>
                            {lastActivityLocation !== "—" && (
                              <Text fontSize="sm" color={muted}>{lastActivityLocation}</Text>
                            )}
                          </Td>
                        </Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>

              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminCoach.infos_coach", "Infos coach")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.coachs", "coachs/")}{id}
                  </Text>
                </CardHeader>
                <CardBody>
                  {!coachData ? (
                    <Text color={muted}>{i18n.t("auto.AdminCoach.aucune_fiche_coach_trouvee_coachs", "Aucune fiche coach trouvée (coachs).")}</Text>
                  ) : (
                    <Table size="sm">
                      <Tbody>
                        <Tr><Th>{i18n.t("contact.fields.name.label", "Nom")}</Th><Td>{pickName(coachData, "—")}</Td></Tr>
                        <Tr><Th>{i18n.t("clientCreation.email", "Email")}</Th><Td>{coachData.email || "—"}</Td></Tr>
                        <Tr><Th>{i18n.t("clientView.createdOn", "Créé le")}</Th><Td>{toLocale(coachData.createdAt)}</Td></Tr>
                        <Tr><Th>{i18n.t("auto.AdminCoach.zone", "Zone")}</Th><Td>{coachData.zone || coachData.city || "—"}</Td></Tr>
                      </Tbody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Clients */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <Box>
                    <Heading size="md">{i18n.t("auto.AdminCoach.clients_crees", "Clients créés")}</Heading>
                    <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.recherche_clients_createdby", "Recherche: clients.createdBy ==")}{id}
                    </Text>
                  </Box>
                  <Tag colorScheme="blue">{clients.length}{i18n.t("auto.AdminCoach.trouve_s", "trouvé(s)")}</Tag>
                </HStack>
              </CardHeader>
              <CardBody>
                {clients.length === 0 ? (
                  <Text color={muted}>{i18n.t("auto.AdminCoach.aucun_client", "Aucun client.")}</Text>
                ) : (
                  <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                    <Table size="sm">
                      <Tbody>
                        {clients.map((c) => (
                          <Tr key={c.id} _hover={{ bg: softBg }}>
                            <Td maxW={{ base: "240px", md: "520px" }}>
                              <Text fontWeight="700" noOfLines={1}>{pickName(c, c.id)}</Text>
                              <Text fontSize="sm" color={muted} noOfLines={1}>
                                {c.email || "—"}{i18n.t("auto.AdminCoach.cree", "• Créé:")}{toLocale(c.createdAt)}
                              </Text>
                              <Text fontSize="xs" color={muted} noOfLines={1}>{i18n.t("auto.AdminCoach.id", "ID:")}{c.id}
                              </Text>
                            </Td>
                            <Td>
                              <HStack justify="flex-end" flexWrap="wrap" gap={2}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  leftIcon={<Icon as={MdPeople} />}
                                  onClick={() => navigate(`/admin/client/${c.id}`)}
                                >{i18n.t("nav.admin_view", "Admin")}</Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  rightIcon={<Icon as={MdOpenInNew} />}
                                  onClick={() => navigate(`/clients/${c.id}?adminCoachId=${id}`)}
                                >{i18n.t("auto.AdminCoach.vue_coach", "Vue coach")}</Button>
                              </HStack>
                            </Td>
                          </Tr>
                        ))}
                      </Tbody>
                    </Table>
                  </Box>
                )}
              </CardBody>
            </Card>
          </TabPanel>

          {/* Programmes */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={2}>
                  <Box>
                    <Heading size="md">{i18n.t("auto.ClubDashboard.programmes_crees", "Programmes créés")}</Heading>
                    <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.recherche_programmes_createdby", "Recherche: programmes.createdBy ==")}{id}{i18n.t("auto.AdminCoach.fallback_coachid_coachuid", "(fallback coachId/coachUid)")}</Text>
                  </Box>
                  <Tag colorScheme="purple">{programs.length}{i18n.t("auto.AdminCoach.trouve_s", "trouvé(s)")}</Tag>
                </HStack>
              </CardHeader>
              <CardBody>
                {programs.length === 0 ? (
                  <Text color={muted}>{i18n.t("auto.AdminCoach.aucun_programme", "Aucun programme.")}</Text>
                ) : (
                  <Box overflowX="auto" borderRadius="lg" border="1px solid" borderColor={borderCol}>
                    <Table size="sm">
                      <Tbody>
                        {programs.map((p) => {
                          const pname = pickProgramName(p, p.id);
                          const originLabel = p.origine || p.origin || p.source || "—";
                          const openPath = getProgramOpenPath(p);

                          return (
                            <Tr key={p.id} _hover={{ bg: softBg }}>
                              <Td maxW={{ base: "240px", md: "520px" }}>
                                <Text fontWeight="700" noOfLines={1}>{String(pname)}</Text>
                                <Text fontSize="sm" color={muted} noOfLines={2}>{i18n.t("auto.AdminCoach.cree_2", "Créé:")}{toLocale(p.createdAt)}{i18n.t("auto.AdminCoach.origine", "• Origine:")}{originLabel}
                                </Text>
                                <Text fontSize="xs" color={muted} noOfLines={1}>{i18n.t("auto.AdminCoach.id", "ID:")}{p.id}</Text>
                              </Td>
                              <Td>
                                <HStack justify="flex-end" flexWrap="wrap" gap={2}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    leftIcon={<Icon as={MdFitnessCenter} />}
                                    onClick={() => navigate(`${openPath}?adminCoachId=${id}`)}
                                  >{i18n.t("programs.open", "Ouvrir")}</Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    rightIcon={<Icon as={MdOpenInNew} />}
                                    onClick={() => navigate(`/exercise-bank/program-builder/${p.id}?adminCoachId=${id}`)}
                                  >{i18n.t("programView.edit", "Modifier")}</Button>
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

          {/* Actions */}
          <TabPanel px={0}>
            <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
              <CardHeader>
                <HStack justify="space-between" align="center" flexWrap="wrap" gap={3}>
                  <Box>
                    <Heading size="md">{i18n.t("auto.AdminCoach.pilotage_du_coach", "Pilotage du coach")}</Heading>
                    <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.essai_acces_mot_de_passe_et_actions_sensibles_sans", "Essai, accès, mot de passe et actions sensibles sans passer par Firestore.")}</Text>
                  </Box>
                  <Icon as={MdManageAccounts} boxSize={6} color={muted} />
                </HStack>
              </CardHeader>
              <CardBody>
                <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={5} alignItems="start">
                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminCoach.fin_d_acces_essai", "Fin d'accès / essai")}</FormLabel>
                    <VStack align="stretch" spacing={2}>
                      <Input
                        type="datetime-local"
                        value={trialEndInput}
                        onChange={(e) => setTrialEndInput(e.target.value)}
                      />
                      <Button leftIcon={<Icon as={MdEdit} />} onClick={editTrial} isLoading={busy.editTrial} width="100%">{i18n.t("auto.AdminCoach.appliquer", "Appliquer")}</Button>
                    </VStack>
                  </FormControl>

                  <FormControl>
                    <FormLabel>{i18n.t("auto.AdminCoach.statut_d_acces_2", "Statut d'accès")}</FormLabel>
                    <VStack align="stretch" spacing={2}>
                      <Select value={accessStatus} onChange={(e) => setAccessStatus(e.target.value)}>
                        <option value="free">{i18n.t("auto.AdminCoach.free", "Free")}</option>
                        <option value="trialing">{i18n.t("auto.AdminCoach.periode_d_essai", "Période d’essai")}</option>
                        <option value="active">{i18n.t("auto.AdminCoach.abonnement_payant_actif", "Abonnement payant actif")}</option>
                        <option value="past_due">{i18n.t("auto.AdminCoach.retard_paiement", "Retard paiement")}</option>
                        <option value="canceled">{i18n.t("clientsList.sub.canceled", "Annulé")}</option>
                      </Select>
                      <Button leftIcon={<Icon as={MdManageAccounts} />} onClick={updateAccessStatus} isLoading={busy.setAccess} width="100%">{i18n.t("auto.AdminCoach.mettre_a_jour", "Mettre à jour")}</Button>
                    </VStack>
                  </FormControl>

                  <VStack align="stretch" spacing={2}>
                    <Button leftIcon={<Icon as={MdLockReset} />} variant="outline" onClick={sendResetPassword} isLoading={busy.resetPassword}>{i18n.t("auto.AdminCoach.envoyer_lien_mot_de_passe_oublie", "Envoyer lien mot de passe oublié")}</Button>
                    <Button leftIcon={<Icon as={MdBlock} />} colorScheme="orange" variant="outline" onClick={cancelAccess} isLoading={busy.cancelAccess}>{i18n.t("auto.AdminCoach.annuler_abonnement_couper_acces", "Annuler abonnement / couper accès")}</Button>
                    <Button leftIcon={<Icon as={MdDelete} />} colorScheme="red" variant="outline" onClick={deleteCoach} isLoading={busy.deleteCoach}>{i18n.t("auto.AdminCoach.supprimer_le_compte_coach", "Supprimer le compte coach")}</Button>
                  </VStack>
                </SimpleGrid>
              </CardBody>
            </Card>
          </TabPanel>

          {/* Stripe */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminCoach.stripe_admin", "Stripe — Admin")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.donnees_stripe_consolidees_factures_retards_et_abo", "Données Stripe consolidées, factures, retards et abonnement.")}</Text>
                </CardHeader>
                <CardBody>
                  <HStack flexWrap="wrap" gap={2} mb={4}>
                    <Button
                      leftIcon={<Icon as={MdPayment} />}
                      onClick={openStripePortal}
                      isLoading={busy.portal}
                      variant="outline"
                    >{i18n.t("auto.AdminCoach.portail_stripe", "Portail Stripe")}</Button>
                    <Button
                      leftIcon={<Icon as={MdRefresh} />}
                      onClick={refreshStripe}
                      isLoading={stripeLoading}
                      variant="outline"
                    >{i18n.t("auto.AdminCoach.rafraichir", "Rafraîchir")}</Button>
                    <Button
                      leftIcon={<Icon as={MdReceipt} />}
                      onClick={reconcileStripe}
                      isLoading={busy.reconcile}
                      variant="outline"
                    >{i18n.t("auto.AdminCoach.reconcile", "Reconcile")}</Button>
                  </HStack>

                  <VStack align="stretch" spacing={1} color={muted} fontSize="sm">
                    <Text><Text as="span" fontWeight="700">{i18n.t("auto.AdminCoach.portail_stripe", "Portail Stripe")}</Text>{i18n.t("auto.AdminCoach.ouvre_le_portail_stripe_du_customer_pour_consulter", "ouvre le portail Stripe du customer pour consulter/gérer côté Stripe.")}</Text>
                    <Text><Text as="span" fontWeight="700">{i18n.t("auto.AdminCoach.rafraichir", "Rafraîchir")}</Text>{i18n.t("auto.AdminCoach.relit_stripe_sans_modifier_les_donnees", "relit Stripe sans modifier les données.")}</Text>
                    <Text><Text as="span" fontWeight="700">{i18n.t("auto.AdminCoach.reconcile", "Reconcile")}</Text>{i18n.t("auto.AdminCoach.resynchronise_firestore_avec_stripe_pour_remettre_", "resynchronise Firestore avec Stripe pour remettre le statut, l’abonnement et les dates à jour.")}</Text>
                  </VStack>

                  {stripeInfo?.fallbackReason || stripeInfo?.stripeAvailable === false ? (
                    <Alert status="warning" borderRadius="lg" mt={4}>
                      <AlertIcon />
                      <Box>
                        <Text fontWeight="700">{i18n.t("auto.AdminCoach.stripe_n_a_pas_repondu_pour_ce_profil", "Stripe n’a pas répondu pour ce profil.")}</Text>
                        <Text fontSize="sm">{i18n.t("auto.AdminCoach.les_valeurs_affichees_viennent_de_firestore_les_fa", "Les valeurs affichées viennent de Firestore. Les factures, paiements et retards réels apparaîtront quand le backend Stripe sera joignable.")}</Text>
                      </Box>
                    </Alert>
                  ) : null}

                  {stripeInfo ? (
                    <VStack align="stretch" spacing={4} mt={4}>
                      <Table size="sm">
                        <Tbody>
                          <Tr><Th>{i18n.t("auto.AdminCoach.customer", "Customer")}</Th><Td>{stripeInfo.customer?.id || stripeInfo.firestore?.stripeCustomerId || "—"}</Td></Tr>
                          <Tr><Th>{i18n.t("clientsList.table.subscription", "Abonnement")}</Th><Td>{stripeInfo.subscription?.status || stripeInfo.firestore?.subscriptionStatus || "—"}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminCoach.depuis_le", "Depuis le")}</Th><Td>{toLocale(stripeInfo.subscription?.startedAt || stripeInfo.firestore?.trialStartedAt)}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminCoach.periode_en_cours", "Période en cours")}</Th><Td>{toLocale(stripeInfo.subscription?.currentPeriodStart)} → {toLocale(stripeInfo.subscription?.currentPeriodEnd || stripeInfo.firestore?.nextInvoiceAt)}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminCoach.retard_paiement", "Retard paiement")}</Th><Td>{stripeInfo.hasPaymentDelay ? "Oui" : "Non"}</Td></Tr>
                          <Tr><Th>{i18n.t("auto.AdminCoach.montant_du", "Montant dû")}</Th><Td>{stripeInfo.amountDueLabel || "—"}</Td></Tr>
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
                                    <Text fontSize="xs" color={muted}>{i18n.t("auto.AdminCoach.creee", "Créée:")}{toLocale(invoice.created)}{i18n.t("auto.AdminCoach.echeance", "• Échéance:")}{toLocale(invoice.dueDate)}
                                    </Text>
                                  </Td>
                                  <Td minW="110px">{invoiceStatusLabel(invoice.status)}</Td>
                                  <Td minW="90px">{invoice.paid ? "Payée" : invoice.amountRemaining > 0 ? "À payer" : "—"}</Td>
                                  <Td minW="130px">{moneyMinor(invoice.amountPaid, invoice.currency)} / {moneyMinor(invoice.amountDue, invoice.currency)}</Td>
                                  <Td minW="150px">{invoice.finalizedAt ? "Finalisée" : invoice.attempted ? "Tentative" : "Brouillon"}</Td>
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
                                          >{i18n.t("auto.AdminCoach.finaliser", "Finaliser")}</Button>
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
                                          >{i18n.t("auto.AdminCoach.renvoyer", "Renvoyer")}</Button>
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
                                          >{i18n.t("auto.AdminCoach.payee", "Payée")}</Button>
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
                                          >{i18n.t("auto.AdminCoach.impayee", "Impayée")}</Button>
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
                              <Tr><Td color={muted}>{i18n.t("auto.AdminCoach.aucune_facture_stripe_trouvee", "Aucune facture Stripe trouvée.")}</Td></Tr>
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
                  <Heading size="md">{i18n.t("auto.AdminCoach.creer_une_facture", "Créer une facture")}</Heading>
                  <Text color={muted} fontSize="sm">{i18n.t("auto.AdminCoach.cree_un_invoice_item_puis_une_invoice_stripe", "Crée un invoice item puis une invoice Stripe.")}</Text>
                </CardHeader>
                <CardBody>
                  <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>{i18n.t("auto.AdminCoach.prix_stripe", "Prix Stripe")}</FormLabel>
                      <Select
                        value={invoicePriceId}
                        onChange={(e) => handleInvoicePriceChange(e.target.value)}
                        isDisabled={pricesLoading}
                      >
                        <option value="">
                          {pricesLoading
                            ? i18n.t("auto.AdminCoach.chargement_des_prix", "Chargement des prix…")
                            : i18n.t("auto.AdminCoach.montant_manuel", "Montant manuel")}
                        </option>
                        {stripePrices.map((price) => (
                          <option key={price.id} value={price.id}>
                            {price.label}
                          </option>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminCoach.montant", "Montant")}</FormLabel>
                      <Input value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="39.99" isDisabled={!!invoicePriceId} />
                    </FormControl>
                    <FormControl>
                      <FormLabel>{i18n.t("auto.AdminCoach.devise", "Devise")}</FormLabel>
                      <Select value={invoiceCurrency} onChange={(e) => setInvoiceCurrency(e.target.value)} isDisabled={!!invoicePriceId}>
                        <option value="eur">EUR</option>
                        <option value="usd">USD</option>
                        <option value="gbp">GBP</option>
                      </Select>
                    </FormControl>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>{i18n.t("auto.AdminCoach.description", "Description")}</FormLabel>
                      <Input value={invoiceDesc} onChange={(e) => setInvoiceDesc(e.target.value)} placeholder={i18n.t("auto.AdminCoach.facture_manuelle_admin", "Facture manuelle (admin)")} />
                    </FormControl>
                    <FormControl gridColumn={{ base: "auto", md: "1 / -1" }}>
                      <FormLabel>{i18n.t("auto.AdminCoach.envoyer_par_email", "Envoyer par email")}</FormLabel>
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
                    isLoading={busy.createInvoice}
                  >{i18n.t("auto.AdminCoach.creer_la_facture", "Créer la facture")}</Button>
                </CardBody>
              </Card>
            </SimpleGrid>
          </TabPanel>

          {/* Données brutes */}
          <TabPanel px={0}>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={6}>
              <Card bg={cardBg} borderRadius="2xl" shadow="sm" border="1px solid" borderColor={borderCol}>
                <CardHeader>
                  <Heading size="md">{i18n.t("auto.AdminCoach.users", "users/")}{id}</Heading>
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
                  <Heading size="md">{i18n.t("auto.AdminCoach.coachs", "coachs/")}{id}</Heading>
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
                    {JSON.stringify(coachData || null, null, 2)}
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
