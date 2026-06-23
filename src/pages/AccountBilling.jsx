// src/pages/AccountBilling.jsx
import React, { useState } from "react";
import { Box, Heading, Text, Button, useToast } from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { useAppTheme } from "../styles/appTheme";
import { notify } from "../utils/notify";
import { getAuthHeaders } from "../utils/authHeaders";

// ✅ base API centralisée
import { getApiBase } from "../utils/apiBase";
import i18n from "../i18n/index";
const API_BASE = getApiBase();

export default function AccountBilling() {
  const { user } = useAuth();
  const theme = useAppTheme();
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleOpenPortal = async () => {
    if (!user) {
      notify(toast, "saveError", {
        status: "warning",
        title: "Connexion requise",
        description: "Connectez-vous pour gérer votre abonnement.",
      });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stripe-portal/create-stripe-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include", // important si tu utilises des cookies de session
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.url) {
        window.location.href = data.url; // Redirection réelle Stripe
      } else {
        notify(toast, "saveError", {
          title: "Erreur Stripe",
          description: data?.error || `HTTP ${response.status}`,
        });
      }
    } catch (e) {
      notify(toast, "saveError", {
        title: "Erreur réseau",
        description: e?.message || String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box bg={theme.pageBg} minH="100vh" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
    <Box {...theme.cardProps} maxW="lg" mx="auto" p={{ base: 6, md: 8 }}>
      <Heading size="lg" mb={6}>{i18n.t("auto.AccountBilling.gerer_mon_abonnement", "Gérer mon abonnement")}</Heading>
      <Text mb={8} color={theme.mutedText}>{i18n.t("auto.AccountBilling.depuis_cet_espace_vous_pouvez_gerer_votre_abonneme", "Depuis cet espace, vous pouvez gérer votre abonnement, consulter vos factures et changer de formule.")}</Text>
      <Button
        {...theme.primaryButtonProps}
        fontWeight="bold"
        onClick={handleOpenPortal}
        isLoading={loading}
        loadingText={i18n.t("auto.AccountBilling.redirection_en_cours", "Redirection en cours…")}
      >{i18n.t("auto.AccountBilling.acceder_au_portail_de_gestion_stripe", "Accéder au portail de gestion Stripe")}</Button>
    </Box>
    </Box>
  );
}
