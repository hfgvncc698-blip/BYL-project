// src/pages/AboutPage.jsx
import React from "react";
import {
  Box,
  Heading,
  Text,
  Stack,
  Divider,
  Button,
  Container,
  List,
  ListItem,
  ListIcon,
} from "@chakra-ui/react";
import { CheckCircleIcon } from "@chakra-ui/icons";
import { Link as RouterLink } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";

/**
 * Utility robuste (compatible vieux Safari/Android) :
 * - évite Object.values (non supporté sur anciens iOS)
 * - accepte array, objet {0:"...",1:"..."} ou string avec retours à la ligne
 * - ne jette jamais d'erreur -> retourne toujours un tableau
 */
function toArrayMaybe(v) {
  try {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      // tri par clé numérique/alpha pour un ordre stable
      const keys = Object.keys(v).sort((a, b) => {
        const na = +a, nb = +b;
        const aIsNum = String(na) === a;
        const bIsNum = String(nb) === b;
        if (aIsNum && bIsNum) return na - nb;
        if (aIsNum) return -1;
        if (bIsNum) return 1;
        return a.localeCompare(b);
      });
      return keys.map((k) => v[k]);
    }
    if (typeof v === "string") {
      return v
        .split(/\r?\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } catch (_e) {}
  return [];
}

export default function AboutPage() {
  const { t } = useTranslation("common");

  // Récupère et normalise les listes depuis i18n (jamais undefined)
  const features = toArrayMaybe(
    t("about.features.items", { returnObjects: true, defaultValue: [] })
  );
  const why = toArrayMaybe(
    t("about.why.items", { returnObjects: true, defaultValue: [] })
  );

  return (
    <Box py={{ base: 8, md: 12 }}>
      <Container maxW="4xl">
        <Heading as="h1" textAlign="center" mb={8}>
          {t("about.title")}
        </Heading>

        <Stack spacing={8}>
          <Text fontSize="lg" lineHeight="tall">
            <Trans
              i18nKey="about.intro"
              // on rend <b> en <span> pour éviter du <p> dans <p>
              components={{ b: <Text as="span" fontWeight="bold" /> }}
            />
          </Text>

          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("about.mission.title")}
            </Heading>
            <Text color="gray.600">{t("about.mission.body")}</Text>
          </Box>

          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("about.features.title")}
            </Heading>
            <List spacing={2} pl={1}>
              {features.length === 0 ? (
                <Text color="gray.500">{t("about.features.empty", { defaultValue: "" })}</Text>
              ) : (
                features.map((line, i) => (
                  <ListItem key={`f-${i}`}>
                    <ListIcon as={CheckCircleIcon} color="blue.500" />
                    {String(line)}
                  </ListItem>
                ))
              )}
            </List>
          </Box>

          <Divider />

          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("about.autonomy.title")}
            </Heading>
            <Text color="gray.600">{t("about.autonomy.body")}</Text>
          </Box>

          <Box>
            <Heading as="h2" size="md" mb={2}>
              {t("about.why.title")}
            </Heading>
            <List spacing={2} pl={1}>
              {why.length === 0 ? (
                <Text color="gray.500">{t("about.why.empty", { defaultValue: "" })}</Text>
              ) : (
                why.map((line, i) => (
                  <ListItem key={`w-${i}`}>
                    <ListIcon as={CheckCircleIcon} color="blue.500" />
                    {String(line)}
                  </ListItem>
                ))
              )}
            </List>
          </Box>

          <Box textAlign="center" pt={2}>
            <Button
              as={RouterLink}
              to="/register"
              size="lg"
              colorScheme="blue"
              px={8}
            >
              {t("about.cta")}
            </Button>
          </Box>
        </Stack>
      </Container>
    </Box>
  );
}

