// Payment status comes only from the authenticated server finalization response.
import React, { useEffect, useMemo, useState } from "react";
import { Box, Heading, Text, VStack, Icon, Button, Spinner, useColorModeValue } from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon, InfoIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../utils/api";
import { classifyPaymentReturn } from "../utils/paymentReturn";

export default function Success() {
  const { user, loading: authLoading, hasCoachAccess } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation("common");
  const sessionId = useMemo(() => new URLSearchParams(location.search).get("session_id"), [location.search]);
  const [state, setState] = useState({ phase: "verifying", paid: false });
  const [attempt, setAttempt] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [profileWaitExpired, setProfileWaitExpired] = useState(false);
  const cardBg = useColorModeValue("gray.100", "gray.700");

  useEffect(() => {
    if (authLoading) return;
    if (!sessionId) { setState({ phase: "missing", paid: false }); return; }
    if (!user?.uid) { setState({ phase: "login", paid: false }); return; }
    const controller = new AbortController();
    let cancelled = false;
    let poll;
    const timeout = setTimeout(() => controller.abort(), 45000);
    setState(previous => ({ phase: "verifying", receipt: sessionId, uid: user.uid, paid: previous.receipt === sessionId && previous.uid === user.uid && previous.paid }));
    void apiFetch("/payments/finalize-session", {
      method: "POST",
      signal: controller.signal,
      body: JSON.stringify({ session_id: sessionId }),
    }).then(result => {
      if (cancelled) return;
      const next = classifyPaymentReturn(result);
      setState({ ...next, receipt: sessionId, uid: user.uid });
      if (next.phase === "processing" && attempt < 9) {
        poll = setTimeout(() => setAttempt(value => value + 1), 2000);
      }
    }).catch(error => {
      if (cancelled) return;
      setState(previous => error.status === 409 && error.data?.reason === "payment-not-confirmed"
        ? { phase: "pending", paid: false, receipt: sessionId, uid: user.uid }
        : { ...previous, phase: "error" });
    }).finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); clearTimeout(poll); controller.abort(); };
  }, [authLoading, user?.uid, sessionId, attempt, retryKey]);

  // Wait for AuthContext's live profile before entering a protected pro route.
  // Do not redirect a paid customer back to the paywall on a stale auth snapshot.
  const waitingProfile = state.phase === "confirmed" && state.type === "subscription" && !hasCoachAccess;
  useEffect(() => {
    if (state.phase === "confirmed" && !waitingProfile && state.destination) {
      navigate(state.destination, { replace: true });
    }
  }, [navigate, state, waitingProfile]);
  useEffect(() => {
    setProfileWaitExpired(false);
    if (!waitingProfile) return;
    const timeout = setTimeout(() => setProfileWaitExpired(true), 10000);
    return () => clearTimeout(timeout);
  }, [waitingProfile, retryKey]);

  const retry = () => { setAttempt(0); setRetryKey(value => value + 1); };
  const busy = state.phase === "verifying" ||
    (state.phase === "processing" && attempt < 9) ||
    (waitingProfile && !profileWaitExpired);
  const error = ["error", "missing", "inactive"].includes(state.phase);
  const title = state.paid
    ? t("payment.return.confirmed", "Paiement confirmé")
    : state.phase === "verifying"
    ? t("payment.return.verifying", "Vérification du paiement…")
    : t("payment.return.unconfirmed", "Paiement non confirmé");
  const messages = {
    verifying: t("payment.return.verifyingDescription", "Nous vérifions le résultat auprès du serveur de paiement."),
    missing: t("payment.return.missing", "Ce lien ne contient aucune référence de paiement. Aucun paiement ne peut être confirmé depuis cette page."),
    login: t("payment.return.login", "Connectez-vous avec le compte utilisé pour cet achat afin de vérifier le paiement."),
    pending: t("payment.return.pending", "Le paiement n’est pas encore confirmé. Il peut être en attente, avoir été annulé ou refusé. Vérifiez son état avant de recommencer un achat."),
    processing: t("payment.return.processing", "Votre paiement est confirmé. La préparation de votre programme est en cours ; vous pouvez relancer la vérification sans repayer."),
    error: t("payment.return.error", "La vérification ou la préparation n’a pas abouti. Réessayez sans effectuer un nouveau paiement. Si le problème persiste, contactez le support."),
    inactive: t("payment.return.inactive", "Cet achat est confirmé, mais l’abonnement n’est actuellement pas actif. Consultez votre facturation."),
    confirmed: waitingProfile
      ? t("payment.return.profile", "Votre paiement est confirmé. La mise à jour de votre accès est en cours.")
      : t("payment.return.ready", "Votre espace est prêt. Vous allez être redirigé."),
  };
  return (
    <Box minH="calc(100vh - 160px)" display="flex" alignItems="center" justifyContent="center" px={4}>
      <Box bg={cardBg} borderRadius="2xl" px={{ base: 6, md: 10 }} py={{ base: 8, md: 10 }} maxW="520px" w="full">
        <VStack spacing={5} textAlign="center" aria-live="polite">
          <Icon as={state.paid ? CheckCircleIcon : error ? WarningIcon : InfoIcon} boxSize={10} color={state.paid ? "green.400" : error ? "orange.400" : "blue.400"} />
          <Heading size="md">{title}</Heading>
          <Text>{messages[state.phase]}</Text>
          {busy && <Spinner aria-label={t("payment.return.verifying", "Vérification du paiement…")} />}
          {state.phase === "login" ? (
            <Button onClick={() => navigate("/login?next=" + encodeURIComponent(location.pathname + location.search))}>{t("auth.login.submit", "Se connecter")}</Button>
          ) : sessionId && !busy && state.phase !== "inactive" ? (
            <Button onClick={retry}>{t("payment.return.retry", "Vérifier à nouveau")}</Button>
          ) : null}
          {state.destination && !waitingProfile && (
            <Button onClick={() => navigate(state.destination)}>{t("payment.return.open", "Ouvrir mon espace")}</Button>
          )}
          <Button variant="ghost" onClick={() => navigate(user?.role === "coach" || user?.role === "admin" ? "/coach-dashboard" : "/mes-programmes")}>
            {t("payment.return.leave", "Revenir à mon espace")}
          </Button>
        </VStack>
      </Box>
    </Box>
  );
}
