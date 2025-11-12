// src/pages/Checkout.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Heading, Text, Spinner, Button } from "@chakra-ui/react";
import { useTranslation, Trans } from "react-i18next";

// Simule une future intégration avec Stripe
export default function Checkout() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation("common");

  // --- Dans la version finale, tu déclencheras ici une requête à ton backend pour créer une session Stripe
  // --- Puis tu redirigeras l'utilisateur vers la page de paiement Stripe
  const handlePay = () => {
    // Simuler un paiement
    setTimeout(() => {
      navigate("/payment-success");
    }, 1200);
  };

  return (
    <Box maxW="lg" mx="auto" py={20} textAlign="center">
      <Heading mb={4}>{t("payment.checkout.title")}</Heading>
      <Text fontSize="xl" mb={8}>
        <Trans
          i18nKey="payment.checkout.subtitle"
          values={{ productId }}
          components={{ b: <b /> }}
        />
      </Text>
      {/* Ici tu mettras StripeCheckoutButton */}
      <Button
        colorScheme="blue"
        size="lg"
        borderRadius="xl"
        onClick={handlePay}
      >
        {t("payment.checkout.button")}
      </Button>
      <Spinner
        display="block"
        mx="auto"
        mt={8}
        thickness="4px"
        color="blue.500"
        speed="0.8s"
      />
      <Text mt={8} color="gray.500" fontSize="sm">
        {t("payment.checkout.note")}
      </Text>
    </Box>
  );
}

