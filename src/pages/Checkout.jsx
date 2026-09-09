// src/pages/Checkout.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { Box, Heading, Text, Button, Stack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../styles/appTheme";

// Historical product links must never simulate a successful payment.
export default function Checkout() {
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const theme = useAppTheme();

  return (
    <Box bg={theme.pageBg} minH="100vh" p={{ base: 4, md: 8 }}>
    <Box {...theme.cardProps} maxW="lg" mx="auto" p={{ base: 6, md: 10 }} textAlign="center">
      <Stack spacing={5}>
        <Heading size="lg">{t('payment.legacy.title', 'Choisir une offre')}</Heading>
        <Text>{t('payment.legacy.description', 'Ce lien est ancien et ne lance aucun paiement. Retrouvez les offres disponibles ci-dessous.')}</Text>
        <Button {...theme.primaryButtonProps} onClick={() => navigate('/plans/professionnel')}>{t('payment.legacy.pro', 'Offres professionnelles')}</Button>
        <Button onClick={() => navigate('/programmes-premium')}>{t('payment.legacy.programs', 'Programmes Premium')}</Button>
        <Button variant="ghost" onClick={() => navigate('/questionnaire')}>{t('payment.legacy.custom', 'Programme sur mesure')}</Button>
      </Stack>
    </Box>
    </Box>
  );
}
