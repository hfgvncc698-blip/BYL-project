// src/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { auth, db } from "./firebaseConfig";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  setDoc,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { getApiBase } from "./utils/apiBase";
import { getProPlanAccess } from "./utils/proPlanAccess";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

const TRIAL_DAYS = 14;
const VIEW_AS_KEY = "BYL_VIEW_AS"; // persistance de la vue choisie (admin/coach)
const ADMIN_PRO_ACCESS = getProPlanAccess("complete", "unlimited");
const FULL_PRO_TRIAL_ACCESS = getProPlanAccess("complete", "unlimited");
const FULL_CLUB_TRIAL_ACCESS = getProPlanAccess("club", "network");

const readCachedUser = () => {
  if (typeof window === "undefined") return null;
  try {
    const cached = JSON.parse(window.localStorage.getItem("user") || "null");
    if (!cached?.uid || !cached?.role) return null;
    return {
      ...cached,
      trialStartedAt: cached.trialStartedAt ? new Date(cached.trialStartedAt) : null,
      trialEndsAt: cached.trialEndsAt ? new Date(cached.trialEndsAt) : null,
      nextInvoiceAt: cached.nextInvoiceAt ? new Date(cached.nextInvoiceAt) : null,
    };
  } catch {
    return null;
  }
};

async function createStripeCustomerForRegisteredUser(fbUser, payload) {
  if (!fbUser?.getIdToken) return;
  try {
    const token = await fbUser.getIdToken(true);
    const response = await fetch(`${getApiBase()}/payments/register-customer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn("[register] Stripe customer not created:", response.status, text);
    }
  } catch (error) {
    console.warn("[register] Stripe customer creation skipped:", error?.message || error);
  }
}

/* ----------------- Utils ----------------- */
const toDate = (v) =>
  v?.toDate
    ? v.toDate()
    : typeof v === "number" || typeof v === "string"
    ? new Date(v)
    : null;

const safeTime = (d) => {
  const dt = d instanceof Date ? d : null;
  const t = dt ? dt.getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const langCodeFromAny = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return (navigator.language || "fr").slice(0, 2).toLowerCase();
  if (raw.startsWith("en") || raw.includes("english") || raw.includes("anglais")) return "en";
  if (raw.startsWith("es") || raw.includes("español") || raw.includes("espanol") || raw.includes("espagnol")) return "es";
  if (raw.startsWith("de") || raw.includes("deutsch") || raw.includes("allemand")) return "de";
  if (raw.startsWith("it") || raw.includes("italiano")) return "it";
  if (raw.startsWith("ru") || raw.includes("русский")) return "ru";
  if (raw.startsWith("ar") || raw.includes("العربية") || raw.includes("arab")) return "ar";
  return "fr";
};

const normalizeUserDoc = (uid, data, fb) => {
  const isClubAccount =
    data?.accountType === "club_owner" ||
    data?.accountType === "club_member" ||
    data?.clubRole === "owner" ||
    data?.onboardingPackage === "club" ||
    data?.packageKey === "club";
  const rawRole = data?.role ?? "particulier"; // "admin" | "coach" | "particulier"
  const role = rawRole === "particulier" && isClubAccount ? "coach" : rawRole;
  const isAdminUser = role === "admin";
  const trialEndsAt = toDate(data?.trialEndsAt);
  const isActiveCoachTrial =
    role === "coach" &&
    data?.subscriptionStatus === "trialing" &&
    safeTime(trialEndsAt) &&
    safeTime(trialEndsAt) > Date.now();
  const isClubTrial = isClubAccount;
  const adminAccess = isAdminUser
    ? {
        ...ADMIN_PRO_ACCESS,
        modules: [...ADMIN_PRO_ACCESS.modules],
      }
    : null;
  const trialAccess = isActiveCoachTrial
    ? {
        ...(isClubTrial ? FULL_CLUB_TRIAL_ACCESS : FULL_PRO_TRIAL_ACCESS),
        modules: [...(isClubTrial ? FULL_CLUB_TRIAL_ACCESS.modules : FULL_PRO_TRIAL_ACCESS.modules)],
      }
    : null;

  return {
    uid,
    email: fb?.email ?? data?.email ?? null,
    firstName: data?.firstName ?? data?.prenom ?? "Utilisateur",
    lastName: data?.lastName ?? data?.nom ?? "",
    role,
    accountType: data?.accountType ?? (data?.clubRole ? "club_member" : ""),
    clubId: data?.clubId ?? null,
    clubRole: data?.clubRole ?? null,
    clubName: data?.clubName ?? null,
    clubLogoUrl: data?.clubLogoUrl ?? null,
    clubPrimaryColor: data?.clubPrimaryColor ?? null,

    // ⚠️ harmonisation : parfois tu écris preferredLanguage, parfois preferredLang
    preferredLang:
      data?.preferredLang ??
      data?.preferredLanguage ??
      (navigator.language || "fr").slice(0, 2).toLowerCase(),

    // ⚠️ IMPORTANT : ce flag doit refléter un abonnement PAYANT.
    // Un coach en TRIAL doit avoir hasActiveSubscription=false (accès géré par trialEndsAt + subscriptionStatus).
    hasActiveSubscription: !!data?.hasActiveSubscription,
    subscriptionStatus: data?.subscriptionStatus ?? null,
    planType: data?.planType ?? null,
    packageKey: adminAccess?.packageKey ?? trialAccess?.packageKey ?? data?.packageKey ?? data?.onboardingPackage ?? "",
    packageTier: adminAccess?.packageTier ?? trialAccess?.packageTier ?? data?.packageTier ?? data?.onboardingPackageTier ?? "",
    clientLimit: adminAccess ? adminAccess.clientLimit : trialAccess ? trialAccess.clientLimit : data?.clientLimit ?? null,
    proLimit: adminAccess ? adminAccess.proLimit : trialAccess ? trialAccess.proLimit : data?.proLimit ?? null,
    modules: adminAccess ? adminAccess.modules : trialAccess ? trialAccess.modules : data?.modules ?? [],
    proAccess: adminAccess ?? trialAccess ?? data?.proAccess ?? null,

    trialStartedAt: toDate(data?.trialStartedAt),
    trialEndsAt,
    nextInvoiceAt: toDate(data?.nextInvoiceAt),

    stripeCustomerId: data?.stripeCustomerId ?? null,
    stripeSubscriptionId: data?.stripeSubscriptionId ?? null,
    linkedClientId: data?.linkedClientId ?? null,
    emailPreferences: data?.emailPreferences ?? {},

    logoUrl: data?.logoUrl ?? null,
    primaryColor: data?.primaryColor ?? null,
    settings: data?.settings ?? {},
  };
};

async function findClientProfileForAuthUser(firebaseUser) {
  const email = normalizeEmail(firebaseUser?.email);
  const queries = [];

  if (firebaseUser?.uid) {
    queries.push(query(collection(db, "clients"), where("linkedUserId", "==", firebaseUser.uid), limit(1)));
    queries.push(query(collection(db, "clients"), where("uid", "==", firebaseUser.uid), limit(1)));
  }
  if (email) {
    queries.push(query(collection(db, "clients"), where("emailLower", "==", email), limit(1)));
    queries.push(query(collection(db, "clients"), where("email", "==", email), limit(1)));
  }

  for (const q of queries) {
    try {
      const snap = await getDocs(q);
      if (!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() || {} };
    } catch {}
  }

  return null;
}

async function seedUserDocFromClient(firebaseUser, provider = null) {
  const linkedClient = await findClientProfileForAuthUser(firebaseUser);
  const c = linkedClient?.data || {};
  const email = normalizeEmail(firebaseUser?.email || c.email);
  const firstName = String(c.prenom || c.firstName || firebaseUser?.displayName?.split(" ")?.[0] || "").trim();
  const lastName = String(c.nom || c.lastName || "").trim();
  const defaultLanguage = c.settings?.defaultLanguage || c.settings?.langCode || c.langue || c.language || c.lang || "fr";
  const langCode = langCodeFromAny(defaultLanguage);

  return {
    email: email || firebaseUser?.email || null,
    emailLower: email || null,
    firstName: firstName || "Utilisateur",
    lastName: lastName || "",
    displayName: `${firstName} ${lastName}`.trim() || firebaseUser?.displayName || "",
    role: "particulier",
    hasActiveSubscription: false,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    preferredLang: langCode,
    provider,
    linkedClientId: linkedClient?.id || null,
    settings: {
      defaultLanguage,
      langCode,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/* ----------------- Provider ----------------- */
export const AuthProvider = ({ children }) => {
  // Affiche immédiatement le dernier profil validé, puis on le resynchronise
  // en arrière-plan avec Firebase Auth et Firestore.
  const [user, setUser] = useState(readCachedUser); // <-- doc Firestore normalisé
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const unsubUserRef = useRef(null); // pour nettoyer l’ancienne souscription

  /** viewAs = "admin" | "coach" | null (null = auto) */
  const [viewAs, _setViewAs] = useState(() => {
    try {
      return localStorage.getItem(VIEW_AS_KEY) || null;
    } catch {
      return null;
    }
  });

  /* -- Sélecteur sécurisé pour changer de vue (sans changer les droits réels) -- */
  const setViewAs = (next) => {
    if (!user?.role) return;

    if (user.role === "admin") {
      // admin peut choisir "admin" ou "coach"
      if (next === "admin" || next === "coach") {
        _setViewAs(next);
        try {
          localStorage.setItem(VIEW_AS_KEY, next);
        } catch {}
      }
    } else if (user.role === "coach") {
      // coach reste coach
      _setViewAs("coach");
      try {
        localStorage.setItem(VIEW_AS_KEY, "coach");
      } catch {}
    } else {
      // particulier/other : pas de viewAs
      _setViewAs(null);
      try {
        localStorage.removeItem(VIEW_AS_KEY);
      } catch {}
    }
  };

  /* -- Rôle effectif utilisé par l’UI -- */
  const effectiveRole = useMemo(() => {
    if (!user?.role) return null;
    if (user.role === "admin") return viewAs || "admin";
    return user.role;
  }, [user?.role, viewAs]);

  const isAuthenticated = Boolean(user);
  const isAdmin = user?.role === "admin";
  const isCoach = effectiveRole === "coach";

  /* ----------------- ✅ TRIAL + ACCÈS PRO (FIX) ----------------- */
  const isTrialActive = useMemo(() => {
    if (!user) return false;
    if (user.role !== "coach") return false;
    if (user.accountType === "club_member" && user.clubId) return true;

    // accepte trialing + endsAt futur
    const endsAtMs = safeTime(user.trialEndsAt);
    const now = Date.now();

    return (
      user.subscriptionStatus === "trialing" &&
      !!endsAtMs &&
      endsAtMs > now
    );
  }, [user]);

  // accès coach = abonnement payant OU trial actif
  const hasCoachAccess = useMemo(() => {
    if (!user) return false;
    if (user.role !== "coach" && user.role !== "admin") return false;

    // admin a accès
    if (user.role === "admin") return true;

    return user.hasActiveSubscription === true || isTrialActive === true;
  }, [user, isTrialActive]);

  /* -- Compat : ancien flag showAdminView/toggleAdminView (mappés sur viewAs) -- */
  const showAdminView = isAdmin && effectiveRole === "admin";
  const toggleAdminView = () => {
    if (isAdmin) setViewAs(effectiveRole === "admin" ? "coach" : "admin");
  };

  /* -- Listen user auth + abonnement temps réel au doc Firestore -- */
  useEffect(() => {
    const unAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        // stoppe l’ancien onSnapshot si existant
        if (unsubUserRef.current) {
          unsubUserRef.current();
          unsubUserRef.current = null;
        }

        if (firebaseUser) {
          const userRef = doc(db, "users", firebaseUser.uid);

          // on s'abonne au doc pour réagir aux mises à jour externes (webhooks/cron/etc.)
          unsubUserRef.current = onSnapshot(
            userRef,
            async (snap) => {
              if (snap.exists()) {
                const normalized = normalizeUserDoc(
                  firebaseUser.uid,
                  snap.data(),
                  firebaseUser
                );
                setUser(normalized);
                try {
                  localStorage.setItem("user", JSON.stringify(normalized));
                } catch {}

                // Ajuster viewAs en fonction du rôle réel
                if (normalized.role === "admin") {
                  // admin : conserver la dernière vue ou défaut "admin"
                  if (viewAs === null) {
                    const saved = (() => {
                      try {
                        return localStorage.getItem(VIEW_AS_KEY);
                      } catch {
                        return null;
                      }
                    })();
                    _setViewAs(saved === "coach" ? "coach" : "admin");
                  }
                } else if (normalized.role === "coach") {
                  // coach : forcer coach
                  if (viewAs !== "coach") {
                    _setViewAs("coach");
                    try {
                      localStorage.setItem(VIEW_AS_KEY, "coach");
                    } catch {}
                  }
                } else {
                  // particulier/other
                  if (viewAs !== null) {
                    _setViewAs(null);
                    try {
                      localStorage.removeItem(VIEW_AS_KEY);
                    } catch {}
                  }
                }
              } else {
                // création minimale si le doc manque
                const seed = await seedUserDocFromClient(firebaseUser);
                await setDoc(userRef, seed, { merge: true });
              }
              setLoading(false);
            },
            (err) => {
              console.error("onSnapshot user error:", err);
              setLoading(false);
            }
          );
        } else {
          setUser(null);
          try {
            localStorage.removeItem("user");
          } catch {}
          setLoading(false);
          // si déconnecté, on nettoie la vue
          _setViewAs(null);
          try {
            localStorage.removeItem(VIEW_AS_KEY);
          } catch {}
        }
      } catch (err) {
        console.error(err);
        setError("Problème récupération utilisateur.");
        setLoading(false);
      }
    });

    return () => {
      unAuth();
      if (unsubUserRef.current) unsubUserRef.current();
    };
     
  }, []);

  /* -- (Optionnel) gérer la fin d'un redirect Apple -- */
  useEffect(() => {
    (async () => {
      try {
        const res = await getRedirectResult(auth);
        if (res?.user) {
          const u = res.user;
          const userRef = doc(db, "users", u.uid);
          const userDoc = await getDoc(userRef);
          if (!userDoc.exists()) {
            await setDoc(userRef, await seedUserDocFromClient(u, "apple"), { merge: true });
          }
        }
      } catch {
        // silencieux
      }
    })();
  }, []);

  /* ----------------- Actions Auth ----------------- */

  // Connexion Email
  const loginWithEmail = async (email, password, callback) => {
    setError(null);
    setLoading(true);
    try {
      const { user: fbUser } = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      if (callback) {
        const ref = doc(db, "users", fbUser.uid);
        const snap = await getDoc(ref);
        const data = snap.data() || {};
        const normalized = normalizeUserDoc(fbUser.uid, data, fbUser);
        setUser(normalized);
        try {
          localStorage.setItem("user", JSON.stringify(normalized));
        } catch {}
        setDoc(
          ref,
          {
            passwordSetupRequired: false,
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((writeError) => {
          console.warn("[auth] post-login user update skipped:", writeError?.message || writeError);
        });

        // ✅ callback historique mais inclut l'accès trial
        const endsAt = toDate(data.trialEndsAt);
        const endsAtMs = safeTime(endsAt);
        const trialOk =
          data.role === "coach" &&
          data.subscriptionStatus === "trialing" &&
          endsAtMs &&
          endsAtMs > Date.now();
        const clubAccessOk =
          (data.accountType === "club_member" && data.clubId) ||
          data.accountType === "club_owner" ||
          data.clubRole === "owner";
        const callbackRole = clubAccessOk ? "coach" : data.role || "particulier";

        callback(callbackRole, !!data.hasActiveSubscription || !!trialOk || !!clubAccessOk, data);
      }
    } catch (err) {
      console.error(err);
      setError("Email ou mot de passe incorrect.");
    } finally {
      setLoading(false);
    }
  };

  // Connexion Google
  const loginWithGoogle = async (callback) => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const { user: fbUser } = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", fbUser.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(
          userRef,
          await seedUserDocFromClient(fbUser, "google"),
          { merge: true }
        );
      }
      if (callback) {
        const snap = await getDoc(userRef);
        const data = snap.data() || {};
        const normalized = normalizeUserDoc(fbUser.uid, data, fbUser);
        setUser(normalized);
        try {
          localStorage.setItem("user", JSON.stringify(normalized));
        } catch {}
        setDoc(
          userRef,
          {
            passwordSetupRequired: false,
            lastLoginAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch((writeError) => {
          console.warn("[auth] post-login user update skipped:", writeError?.message || writeError);
        });

        const endsAt = toDate(data.trialEndsAt);
        const endsAtMs = safeTime(endsAt);
        const trialOk =
          data.role === "coach" &&
          data.subscriptionStatus === "trialing" &&
          endsAtMs &&
          endsAtMs > Date.now();
        const clubAccessOk =
          (data.accountType === "club_member" && data.clubId) ||
          data.accountType === "club_owner" ||
          data.clubRole === "owner";
        const callbackRole = clubAccessOk ? "coach" : data.role || "particulier";

        callback(callbackRole, !!data.hasActiveSubscription || !!trialOk || !!clubAccessOk, data);
      }
    } catch (err) {
      console.error(err);
      setError("Connexion Google échouée.");
    } finally {
      setLoading(false);
    }
  };

  // Connexion / Inscription Apple
  const loginWithApple = async (callback) => {
    setError(null);
    setLoading(true);
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("name");
      provider.addScope("email");

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        await signInWithRedirect(auth, provider);
        return; // le flux reprend via getRedirectResult
      }

      const { user: fbUser } = await signInWithPopup(auth, provider);
      const userRef = doc(db, "users", fbUser.uid);
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        await setDoc(
          userRef,
          await seedUserDocFromClient(fbUser, "apple"),
          { merge: true }
        );
      }
      if (callback) {
        const snap = await getDoc(userRef);
        const data = snap.data() || {};

        const endsAt = toDate(data.trialEndsAt);
        const endsAtMs = safeTime(endsAt);
        const trialOk =
          data.role === "coach" &&
          data.subscriptionStatus === "trialing" &&
          endsAtMs &&
          endsAtMs > Date.now();

        callback(data.role || "particulier", !!data.hasActiveSubscription || !!trialOk);
      }
    } catch (err) {
      console.error(err);
      setError("Connexion Apple échouée.");
    } finally {
      setLoading(false);
    }
  };

  // Register email (avec essai coach direct possible)
  const registerWithEmail = async (
    email,
    password,
    firstName,
    lastName,
    role = "particulier",
    birthDate,
    consent
  ) => {
    setError(null);
    setLoading(true);
    try {
      const { user: fbUser } = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // Facultatif: displayName côté Firebase Auth
      try {
        await updateProfile(fbUser, {
          displayName: `${firstName || ""} ${lastName || ""}`.trim(),
        });
      } catch {}

      const userRef = doc(db, "users", fbUser.uid);

      const isClubOwner =
        role === "coach" &&
        (consent?.accountType === "club_owner" || consent?.onboardingPackage === "club");
      const clubId = isClubOwner ? fbUser.uid : consent?.clubId || null;
      const clubName =
        consent?.clubName ||
        (isClubOwner ? `${firstName || "Club"} ${lastName || ""}`.trim() : "");

      const base = {
        email,
        firstName: firstName || "Utilisateur",
        lastName: lastName || "",
        role,
        accountType: isClubOwner ? "club_owner" : consent?.accountType || "",
        clubId,
        clubRole: isClubOwner ? "owner" : consent?.clubRole || "",
        clubName,
        birthDate: birthDate || "",
        preferredLang: (navigator.language || "fr").slice(0, 2).toLowerCase(),
        ageVerified: !!consent?.ageVerified,
        cguAccepted: !!consent?.cguAccepted,
        cgvAccepted: !!consent?.cgvAccepted,
        acceptedAt: consent?.acceptedAt || new Date().toISOString(),
        cguVersion: consent?.cguVersion || "v1.0",
        cgvVersion: consent?.cgvVersion || "v1.0",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      let trialPart = {};
      if (role === "coach") {
        const requestedPackageKey = consent?.onboardingPackage || "";
        const requestedPackageTier = consent?.onboardingPackageTier || "";
        const selectedAccess = isClubOwner ? FULL_CLUB_TRIAL_ACCESS : FULL_PRO_TRIAL_ACCESS;
        const now = Date.now();
        const requestedTrialDays = Number(consent?.trialDays || TRIAL_DAYS);
        const trialDays =
          Number.isFinite(requestedTrialDays) && requestedTrialDays > 0
            ? Math.min(Math.round(requestedTrialDays), 30)
            : TRIAL_DAYS;
        trialPart = {
          subscriptionStatus: "trialing",
          trialStartedAt: Timestamp.fromDate(new Date(now)),
          trialEndsAt: Timestamp.fromDate(
            new Date(now + trialDays * 24 * 60 * 60 * 1000)
          ),
          trialStatus: "running",
          trialDays,
          requestedPackageKey,
          requestedPackageTier,
          onboardingPackage: selectedAccess.packageKey,
          onboardingPackageTier: selectedAccess.packageTier,
          packageKey: selectedAccess.packageKey,
          packageTier: selectedAccess.packageTier,
          clientLimit: selectedAccess.clientLimit,
          proLimit: selectedAccess.proLimit,
          modules: selectedAccess.modules,
          proAccess: selectedAccess,

          // ✅ IMPORTANT : un trial n'est PAS un abonnement payant
          hasActiveSubscription: false,

          stripeCustomerId: null,
          stripeSubscriptionId: null,
        };
      } else {
        trialPart = {
          hasActiveSubscription: false,
          stripeCustomerId: null,
          stripeSubscriptionId: null,
          subscriptionStatus: "free",
        };
      }

      await setDoc(userRef, { ...base, ...trialPart }, { merge: true });
      if (isClubOwner) {
        const clubRef = doc(db, "clubs", clubId);
        await setDoc(
          clubRef,
          {
            name: clubName || `${firstName || "Club"} ${lastName || ""}`.trim(),
            ownerUid: fbUser.uid,
            ownerEmail: email,
            planTier: trialPart.packageTier || "network",
            trialDays: trialPart.trialDays || 30,
            status: "trialing",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        await setDoc(
          doc(db, "clubs", clubId, "members", fbUser.uid),
          {
            uid: fbUser.uid,
            email,
            firstName: firstName || "Responsable",
            lastName: lastName || "",
            role: "owner",
            status: "active",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await createStripeCustomerForRegisteredUser(fbUser, {
        email,
        firstName,
        lastName,
        role,
      });
      // le onSnapshot remplira `user`
    } catch (err) {
      console.error(err);
      setError("Inscription échouée.");
    } finally {
      setLoading(false);
    }
  };

  // Démarrer un essai coach pour un utilisateur existant
  const startCoachTrialIfNeeded = async (uid) => {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    const now = Date.now();
    await setDoc(
      userRef,
      {
        role: "coach",
        subscriptionStatus: "trialing",
        trialStartedAt: Timestamp.fromDate(new Date(now)),
        trialEndsAt: Timestamp.fromDate(
          new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000)
        ),
        trialStatus: "running",

        // ✅ IMPORTANT : un trial n'est PAS un abonnement payant
        hasActiveSubscription: false,

        stripeCustomerId: null,
        stripeSubscriptionId: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  // Reset password
  const resetPassword = async (email, lang) => {
    setError(null);
    const browser = (navigator?.language || "en").slice(0, 2).toLowerCase();
    const supported = ["fr", "en", "de", "it", "es", "ru", "ar"];
    const langCode = supported.includes(lang)
      ? lang
      : supported.includes(browser)
      ? browser
      : "en";
    auth.languageCode = langCode;

    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : "https://boost-your-life.com";
    const actionCodeSettings = {
      url: `${origin}/login?reset=1`,
      handleCodeInApp: false,
    };

    try {
      await sendPasswordResetEmail(auth, email, actionCodeSettings);
      return true;
    } catch (err) {
      console.error("resetPassword error:", err);
      throw err;
    }
  };

  // Logout
  const logout = async (navigate) => {
    await signOut(auth);
    setUser(null);
    try {
      localStorage.removeItem("user");
    } catch {}
    _setViewAs(null);
    try {
      localStorage.removeItem(VIEW_AS_KEY);
    } catch {}
    if (navigate) navigate("/login");
  };

  /* ----------------- Context value ----------------- */
  const value = useMemo(
    () => ({
      // données
      user,
      isAuthenticated,
      loading,
      error,

      // rôles / vues
      viewAs, // "admin" | "coach" | null
      setViewAs, // switch sécurisé
      effectiveRole, // rôle utilisé par l’UI (admin peut “voir comme” coach)
      isAdmin, // rôle réel === admin
      isCoach, // rôle effectif === coach

      // ✅ accès pro
      isTrialActive,
      hasCoachAccess, // <= C'EST CE FLAG QU'IL FAUT UTILISER DANS LES GUARDS

      // compat (si du code existant l’utilise)
      showAdminView, // true quand l’admin est en vue Admin
      toggleAdminView, // bascule admin ↔ coach

      // actions auth
      loginWithEmail,
      loginWithGoogle,
      loginWithApple,
      registerWithEmail,
      logout,
      resetPassword,
      startCoachTrialIfNeeded,
    }),
    [
      user,
      isAuthenticated,
      loading,
      error,
      viewAs,
      effectiveRole,
      isAdmin,
      isCoach,
      showAdminView,
      isTrialActive,
      hasCoachAccess,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
