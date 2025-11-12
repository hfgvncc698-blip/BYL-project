// src/pages/PrivacyPolicyPage.jsx
import React from 'react';
import { Box, Heading, Text, Stack, List, ListItem } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';

export default function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <Box p={8} maxW="800px" mx="auto">
      <Heading as="h1" mb={6} textAlign="center">
        {t('legal.privacy_title', 'Politique de confidentialité')}
      </Heading>

      <Stack spacing={6}>
        {/* Responsable */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            {t('legal.controller', 'Responsable de traitement')}
          </Heading>
          <Text>
            BoostYourLife<br />
            13 chemin de Garibondy 06110 Le Cannet<br />
            SIRET : 821 489 317 000 23<br />
            Email : contact@boostyourlife.coach
          </Text>
        </Box>

        {/* Intro */}
        <Box>
          <Text>
            {t('legal.intro', 'Chez BoostYourLife, nous attachons une grande importance à la protection de votre vie privée.')}
          </Text>
        </Box>

        {/* 1. Données collectées */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            1. {t('legal.collected_data_title', 'Données collectées')}
          </Heading>
          <List pl={4} spacing={2}>
            <ListItem>{t('legal.collected_data.registration', 'Informations d’inscription : nom, email.')}</ListItem>
            <ListItem>{t('legal.collected_data.profile', 'Données de profil : âge, sexe, niveau sportif.')}</ListItem>
            <ListItem>{t('legal.collected_data.activity', 'Activités et performances : entraînements, progrès.')}</ListItem>
            <ListItem>{t('legal.collected_data.tech', 'Données techniques : IP, navigateur, connexion.')}</ListItem>
          </List>
        </Box>

        {/* 2. Finalités */}
        <Box>
          <Heading as="h2" size="md" mb={2}>
            2. {t('legal.purposes_title', 'Finalités & base légale')}
          </Heading>
          <List pl={4} spacing={2}>
            <ListItem>{t('legal.purposes.service', 'Fournir et personnaliser nos services (contrat).')}</ListItem>
            <ListItem>{t('legal.purposes.tracking', 'Suivre vos progrès (intérêt légitime).')}</ListItem>
            <ListItem>{t('legal.purposes.communication', 'Communication et offres (consentement).')}</ListItem>
            <ListItem>{t('legal.purposes.security', 'Sécurité et prévention de la fraude.')}</ListItem>
          </List>
        </Box>

        {/* ... (le reste des sections idem, chacune mappée à une clé i18n) ... */}

        {/* Date de mise à jour */}
        <Box>
          <Text fontSize="sm" color="gray.600">
            {t('legal.last_update', 'Date de dernière mise à jour : 1er mai 2025')}
          </Text>
        </Box>
      </Stack>
    </Box>
  );
}

