import React from "react";
import { Box, Divider, Heading, Link, List, ListItem, Stack, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../styles/appTheme";
import { getLegalPageCopy } from "./legalPageCopy";

function Section({ section }) {
  const theme = useAppTheme();

  return (
    <Box>
      <Heading as="h2" size="md" mb={3} color={theme.textColor}>
        {section.title}
      </Heading>
      <Stack spacing={3} color={theme.mutedText} fontSize={{ base: "sm", md: "md" }} lineHeight="1.75">
        {(section.paragraphs || []).map((paragraph) => (
          <Text key={paragraph}>{paragraph}</Text>
        ))}
        {section.items?.length ? (
          <List spacing={2} pl={5} styleType="disc">
            {section.items.map((item) => (
              <ListItem key={item}>{item}</ListItem>
            ))}
          </List>
        ) : null}
      </Stack>
    </Box>
  );
}

export default function LegalDocumentPage({ page }) {
  const { i18n } = useTranslation("common");
  const theme = useAppTheme();
  const copy = getLegalPageCopy(i18n.resolvedLanguage || i18n.language, page);

  return (
    <Box bg={theme.pageBg} minH="100vh" py={{ base: 6, md: 10 }} px={{ base: 4, md: 8 }}>
      <Box {...theme.cardProps} maxW="920px" mx="auto" p={{ base: 6, md: 10 }}>
        <Stack spacing={7}>
          <Box textAlign={{ base: "left", md: "center" }}>
            <Text fontSize="sm" color={theme.mutedText} mb={2}>
              {copy.eyebrow}
            </Text>
            <Heading as="h1" size={{ base: "lg", md: "xl" }} color={theme.textColor}>
              {copy.title}
            </Heading>
            <Text mt={4} color={theme.mutedText} lineHeight="1.75">
              {copy.intro}
            </Text>
          </Box>

          <Divider borderColor={theme.borderColor} />

          <Stack spacing={7}>
            {copy.sections.map((section) => (
              <Section key={section.title} section={section} />
            ))}
          </Stack>

          <Divider borderColor={theme.borderColor} />

          <Stack spacing={2} color={theme.subtleText || theme.mutedText} fontSize="sm">
            <Text>
              {copy.lastUpdateLabel} : {copy.lastUpdate}
            </Text>
            <Text>
              <Link href={`mailto:${copy.contactEmail}`} color={theme.accentBlue || theme.accentColor}>
                {copy.contactEmail}
              </Link>
            </Text>
            {copy.footer ? <Text>{copy.footer}</Text> : null}
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
