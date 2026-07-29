// src/pages/Success.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Heading,
  Text,
  VStack,
  Icon,
  Button,
  Fade,
  Spinner,
  Badge,
  useColorModeValue,
} from "@chakra-ui/react";
import { CheckCircleIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebaseConfig";
import { doc, onSnapshot, collection, getDocs } from "firebase/firestore";
import { useTranslation } from "react-i18next";

import { apiFetch } from "../utils/api";
import { resolveClientSnapshotForUser } from "../utils/clientResolver";

export default function Success() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("common");

  const [verifying, setVerifying] = useState(true);
  const [paid, setPaid] = useState(false);
  const [premiumRedirectPath, setPremiumRedirectPath] = useState("");

  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const action =
    searchParams.get("action") ||
    (location.pathname.includes("programmes-premium") ? "premium" : "") ||
    (location.pathname.includes("questionnaire") ? "program" : "");
  const role = searchParams.get("role") || "coach";
  const sessionId = searchParams.get("session_id");
  const isPremium = action === "premium";

  const cardBg = useColorModeValue("gray.100", "gray.700");

  // 1) Forcer la finalisation + vérifier la session
  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        if (sessionId) {
          // a) Forcer la MAJ Firestore depuis Stripe
          const finalizeResult = await apiFetch("/payments/finalize-session", {
            method: "POST",
            body: JSON.stringify({ session_id: sessionId }),
          });
          if (!cancelled && action === "premium" && finalizeResult?.ok) {
            const viewerPath =
              finalizeResult.viewerUrl ||
              (finalizeResult.clientId && finalizeResult.programAssignmentId
                ? `/clients/${finalizeResult.clientId}/programmes/${finalizeResult.programAssignmentId}`
                : "");
            if (viewerPath) setPremiumRedirectPath(viewerPath);
          }

          // b) Vérifier la session (feedback rapide)
          const data = await apiFetch(`/payments/session?session_id=${encodeURIComponent(sessionId)}`);
          const isPaid =
            data?.payment_status === "paid" || data?.status === "complete";
          if (!cancelled) setPaid(Boolean(isPaid));

          if (!cancelled && action === "premium" && isPaid && finalizeResult?.ok) {
            const viewerPath =
              finalizeResult.viewerUrl ||
              (finalizeResult.clientId && finalizeResult.programAssignmentId
                ? `/clients/${finalizeResult.clientId}/programmes/${finalizeResult.programAssignmentId}`
                : "");
            navigate(viewerPath || "/mes-programmes", { replace: true });
            return;
          }
        }

        // c) Reconcile (sécurité)
        if (user?.uid) {
          await apiFetch("/payments/reconcile", {
            method: "POST",
            body: JSON.stringify({ uid: user.uid }),
          });
        }
      } catch {
        // silencieux: l'écoute Firestore prend le relais
      } finally {
        if (!cancelled) setVerifying(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [action, navigate, sessionId, user?.uid]);

  // 2) Écoute temps réel Firestore pour déclencher la redirection
  useEffect(() => {
    if (!user?.uid) return;
    const ref = doc(db, "users", user.uid);

    const unsub = onSnapshot(ref, (snap) => {
      const u = snap.data() || {};
      const trialEndAny = u.trialEnd || u.trialEndsAt;
      const trialEndDate = trialEndAny?.toDate
        ? trialEndAny.toDate()
        : trialEndAny
        ? new Date(trialEndAny)
        : null;
      const trialActive =
        u.subscriptionStatus === "trialing" &&
        trialEndDate &&
        trialEndDate.getTime() > Date.now();
      const isActive =
        u.hasActiveSubscription === true ||
        u.subscriptionStatus === "active" ||
        trialActive;

      if (isPremium && paid) {
        navigate(premiumRedirectPath || "/mes-programmes", { replace: true });
        return;
      }

      if (isActive) {
        const redirectPath =
          action === "program"
            ? "/auto-program-preview"
            : role === "coach"
            ? "/coach-dashboard"
            : "/user-dashboard";

        // Si achat 'program', attendre que le programme apparaisse
        if (action === "program") {
          (async () => {
            const clientSnap = await resolveClientSnapshotForUser(user, {
              logPrefix: "PaymentSuccess",
            });
            if (!clientSnap?.id) {
              navigate("/auto-program-preview");
              return;
            }
            const snapProgs = await getDocs(
              collection(db, "clients", clientSnap.id, "programmes")
            );
            const all = snapProgs.docs.map((d) => ({ id: d.id, ...d.data() }));
            const latest = all
              .sort(
                (a, b) =>
                  new Date(b.createdAt || b.created_at || 0) -
                  new Date(a.createdAt || a.created_at || 0)
              )[0];
            if (latest)
              navigate("/auto-program-preview", {
                state: { programId: latest.id, fromCreation: true, from: "checkout" },
              });
            else navigate("/auto-program-preview"); // fallback
          })();
        } else {
          navigate(redirectPath);
        }
      }
    });

    return () => unsub();
  }, [user?.uid, navigate, action, role, isPremium, paid, premiumRedirectPath]);

  const isProgram = action === "program" || isPremium;

  // Titres traduits avec fallbacks
  const title = isProgram
    ? paid
      ? t(
          "payment.success.program_paid_creating",
          "Paiement confirmé, création de ton programme…"
        )
      : t(
          "payment.success.program_valid_creating",
          "Paiement validé, création de ton programme…"
        )
    : paid
    ? t("payment.success.paid", "Paiement confirmé !")
    : t("payment.success.valid", "Paiement validé !");

  const redirectHint = isProgram
    ? isPremium
      ? t(
          "payment.success.redirect_to_programs",
          "Ton programme est ajouté à ton espace. Tu vas être redirigé·e vers le viewer."
        )
      : t(
        "payment.success.redirect_when_ready",
        "Tu seras redirigé·e dès que le programme est prêt."
      )
    : t(
        "payment.success.redirect_to_dashboard",
        "Tu vas être redirigé·e vers ton tableau de bord."
      );

  const badgeText = verifying
    ? t("payment.success.finalizing", "Finalisation en cours…")
    : paid
    ? t("payment.success.confirmed", "Paiement confirmé")
    : t("payment.success.checked", "Paiement vérifié");

  const goNowLabel = t("payment.success.go_now", "Aller maintenant");
  const waitingHint = t(
    "payment.success.please_wait",
    "Merci de patienter quelques secondes…"
  );

  return (
    <Box
      minH="calc(100vh - 160px)"
      display="flex"
      alignItems="center"
      justifyContent="center"
      px={4}
    >
      <Fade in={true}>
        <Box
          bg={cardBg}
          borderRadius="2xl"
          px={{ base: 6, md: 10 }}
          py={{ base: 8, md: 10 }}
          boxShadow="lg"
          textAlign="center"
          maxW="520px"
          w="full"
        >
          <VStack spacing={4}>
            <Icon
              as={CheckCircleIcon}
              w={12}
              h={12}
              color={paid ? "green.400" : "yellow.400"}
            />
            <Heading size="md">{title}</Heading>

            <VStack spacing={1}>
              <Text fontSize="sm" opacity={0.85}>
                {redirectHint}
              </Text>
              {sessionId && (
                <Badge
                  colorScheme={verifying ? "yellow" : paid ? "green" : "gray"}
                >
                  {badgeText}
                </Badge>
              )}
            </VStack>

            <VStack spacing={2} pt={2}>
              <Spinner thickness="3px" speed="0.7s" />
              <Text fontSize="xs" opacity={0.6}>
                {waitingHint}
              </Text>
            </VStack>

            {!isProgram && (
              <Button
                onClick={() =>
                  navigate(role === "coach" ? "/coach-dashboard" : "/user-dashboard")
                }
                variant="ghost"
                size="sm"
              >
                {goNowLabel}
              </Button>
            )}
          </VStack>
        </Box>
      </Fade>
    </Box>
  );
}
