// src/pages/TermsOfServicePage.jsx
import React from "react";
import {
  Box,
  Heading,
  Text,
  Stack,
  List,
  ListItem,
  useColorModeValue,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

export default function TermsOfServicePage() {
  const { t } = useTranslation("common");

  const pageBg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const borderCol = useColorModeValue("gray.200", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");

  return (
    <Box bg={pageBg} minH="100vh" py={{ base: 6, md: 10 }} px={{ base: 4, md: 8 }}>
      <Box
        maxW="900px"
        mx="auto"
        bg={cardBg}
        border="1px solid"
        borderColor={borderCol}
        borderRadius="2xl"
        p={{ base: 6, md: 10 }}
        boxShadow="sm"
      >
        <Heading
          as="h1"
          mb={6}
          textAlign="center"
          letterSpacing="-0.02em"
        >
          {t("legal.tos.title", "Conditions générales d'utilisation")}
        </Heading>

        <Stack spacing={6}>
          {/* Intro */}
          <Box>
            <Text color={muted}>
              {t(
                "legal.tos.intro",
                "Les présentes conditions générales d'utilisation (CGU) régissent l'accès et l'utilisation de la plateforme BoostYourLife par les coachs et les particuliers. En utilisant nos services, vous acceptez ces conditions."
              )}
            </Text>
          </Box>

          {/* 1. Accès au service */}
          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("legal.tos.access_title", "1. Accès au service")}
            </Heading>
            <Text>
              {t(
                "legal.tos.access_body",
                "L'accès à la plateforme nécessite la création d'un compte avec une adresse e-mail valide. Vous êtes responsable de la confidentialité de vos identifiants."
              )}
            </Text>
          </Box>

          {/* 2. Compte utilisateur */}
          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("legal.tos.account_title", "2. Compte utilisateur")}
            </Heading>
            <List pl={4} spacing={2}>
              <ListItem>
                {t(
                  "legal.tos.account_li1",
                  "Vous garantissez l'exactitude des informations fournies."
                )}
              </ListItem>
              <ListItem>
                {t(
                  "legal.tos.account_li2",
                  "Vous pouvez modifier ou supprimer votre compte à tout moment."
                )}
              </ListItem>
              <ListItem>
                {t(
                  "legal.tos.account_li3",
                  "En cas d'utilisation abusive, nous nous réservons le droit de suspendre votre accès."
                )}
              </ListItem>
            </List>
          </Box>

          {/* 3. Propriété intellectuelle */}
          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("legal.tos.ip_title", "3. Propriété intellectuelle")}
            </Heading>
            <Text>
              {t(
                "legal.tos.ip_body",
                "Tous les contenus (textes, images, programmes, etc.) présents sur BoostYourLife sont protégés par le droit d'auteur. Toute reproduction est interdite sans autorisation."
              )}
            </Text>
          </Box>

          {/* 4. Responsabilités / Liability */}
          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("legal.tos.liability_title", "4. Responsabilités")}
            </Heading>
            <Text>
              {t(
                "legal.tos.liability_body",
                "BoostYourLife fournit des outils d'accompagnement et de suivi, mais ne peut pas garantir de résultats spécifiques. L'utilisateur doit consulter un professionnel de santé avant de commencer tout programme intensif."
              )}
            </Text>
          </Box>

          {/* 5. Modifications */}
          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("legal.tos.changes_title", "5. Modification des CGU")}
            </Heading>
            <Text>
              {t(
                "legal.tos.changes_body",
                "Nous pouvons mettre à jour ces conditions. Les changements seront notifiés sur cette page avec la date de dernière mise à jour."
              )}
            </Text>
          </Box>

          {/* Last update */}
          <Box>
            <Text fontSize="sm" color={muted}>
              {t("legal.tos.last_update", "Date de dernière mise à jour : 1er mai 2025")}
            </Text>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}

