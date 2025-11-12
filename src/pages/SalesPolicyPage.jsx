// src/pages/SalesPolicyPage.jsx
import React from 'react';
import { Box, Heading, Text, Stack, List, ListItem } from '@chakra-ui/react';
import { useTranslation, Trans } from 'react-i18next';

export default function SalesPolicyPage() {
  const { t } = useTranslation();

  return (
    <Box p={8} maxW="800px" mx="auto">
      <Heading as="h1" mb={6} textAlign="center">
        {t('legal.sales_title')}
      </Heading>

      <Stack spacing={6}>
        {/* Intro */}
        <Box>
          <Text>
            <Trans i18nKey="legal.sales_intro">
              Cette politique de vente s’applique à <b>BoostYourLife</b>.
            </Trans>
          </Text>
        </Box>

        {/* 1. Tarifs & paiements */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            {t('legal.sales_pricing_title')}
          </Heading>
          <List pl={4} spacing={2}>
            <ListItem>• {t('legal.sales_pricing_li1')}</ListItem>
            <ListItem>• {t('legal.sales_pricing_li2')}</ListItem>
            <ListItem>• {t('legal.sales_pricing_li3')}</ListItem>
          </List>
        </Box>

        {/* 2. Droit de rétractation */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            {t('legal.sales_withdrawal_title')}
          </Heading>
          <Text mb={3}>{t('legal.sales_withdrawal_p1')}</Text>
          <Text mb={3}>{t('legal.sales_withdrawal_p2')}</Text>
          <Text>
            <Trans i18nKey="legal.sales_withdrawal_p3">
              Pour exercer votre droit de rétractation, contactez <b>support@boostyourlife.coach</b>.
            </Trans>
          </Text>
        </Box>

        {/* 3. Livraison des services */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            {t('legal.sales_delivery_title')}
          </Heading>
          <Text>{t('legal.sales_delivery_p1')}</Text>
        </Box>

        {/* 4. Support client */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            {t('legal.sales_support_title')}
          </Heading>
          <Text>
            <Trans i18nKey="legal.sales_support_p1">
              Contactez <b>support@boostyourlife.coach</b>. Réponse sous 48h.
            </Trans>
          </Text>
        </Box>

        {/* Date MAJ */}
        <Box>
          <Text fontSize="sm" color="gray.600">
            {t('legal.sales_last_update')}
          </Text>
        </Box>
      </Stack>
    </Box>
  );
}

