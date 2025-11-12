// src/pages/AccountBilling.jsx
import React, { useState } from "react";
import { Box, Heading, Text, Button, useToast } from "@chakra-ui/react";
import { useAuth } from "../AuthContext";

// ✅ base API centralisée
import { getApiBase } from "../utils/apiBase";
const API_BASE = getApiBase();

export default function AccountBilling() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleOpenPortal = async () => {
    if (!user) {
      toast({ title: "Connexion requise", status: "warning" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/stripe-portal/create-stripe-portal-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // important si tu utilises des cookies de session
        body: JSON.stringify({ userId: user.uid }),
      });

      const data = await response.json().catch(() => null);
      if (response.ok && data?.url) {
        window.location.href = data.url; // Redirection réelle Stripe
      } else {
        toast({
          title: "Erreur Stripe",
          description: data?.error || `HTTP ${response.status}`,
          status: "error",
        });
      }
    } catch (e) {
      toast({
        title: "Erreur réseau",
        description: e?.message || String(e),
        status: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxW="lg" mx="auto" py={16} px={4}>
      <Heading size="lg" mb={6}>Gérer mon abonnement</Heading>
      <Text mb={8} color="gray.600">
        Depuis cet espace, vous pouvez gérer votre abonnement, consulter vos factures et changer de formule.
      </Text>
      <Button
        colorScheme="blue"
        borderRadius="xl"
        fontWeight="bold"
        onClick={handleOpenPortal}
        isLoading={loading}
        loadingText="Redirection en cours…"
      >
        Accéder au portail de gestion Stripe
      </Button>
    </Box>
  );
}

