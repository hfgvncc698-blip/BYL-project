// src/pages/Checkout.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Heading, Text, Spinner, Button } from "@chakra-ui/react";
import { useTranslation, Trans } from "react-i18next";
import { useAppTheme } from "../styles/appTheme";

// Simule une future intégration avec Stripe
export default function Checkout() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const theme = useAppTheme();

  // --- Dans la version finale, tu déclencheras ici une requête à ton backend pour créer une session Stripe
  // --- Puis tu redirigeras l'utilisateur vers la page de paiement Stripe
  const handlePay = () => {
    // Simuler un paiement
    setTimeout(() => {
      navigate("/payment-success");
    }, 1200);
  };

  return (
    <Box bg={theme.pageBg} minH="100vh" p={{ base: 4, md: 8 }}>
    <Box {...theme.cardProps} maxW="lg" mx="auto" p={{ base: 6, md: 10 }} textAlign="center">
      <Heading mb={4}>{t("payment.checkout.title")}</Heading>
      <Text fontSize="xl" mb={8} color={theme.mutedText}>
        <Trans
          i18nKey="payment.checkout.subtitle"
          values={{ productId }}
          components={{ b: <b /> }}
        />
      </Text>
      {/* Ici tu mettras StripeCheckoutButton */}
      <Button
        {...theme.primaryButtonProps}
        size="lg"
        onClick={handlePay}
      >
        {t("payment.checkout.button")}
      </Button>
      <Spinner
        display="block"
        mx="auto"
        mt={8}
        thickness="4px"
        color={theme.textColor}
        speed="0.8s"
      />
      <Text mt={8} color={theme.subtleText} fontSize="sm">
        {t("payment.checkout.note")}
      </Text>
    </Box>
    </Box>
  );
}
