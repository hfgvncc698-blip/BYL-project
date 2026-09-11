import React from "react";
import { Box, Progress, Text, usePrefersReducedMotion } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

export default function PageLoadingStatus({ state }) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  return <>
    {state.debug && <Box as="output" data-testid="page-loading-timing" display="block" fontSize="xs" p={2}>{JSON.stringify(state)}</Box>}
    {state.hasCache && state.status !== "ready" && state.status !== "error" && (
      <Progress height="2px" width="100%" borderRadius="full" colorScheme="blue"
        isIndeterminate={!reducedMotion} value={reducedMotion ? 100 : undefined}
        aria-label={t("common.loading", "Chargement…")} />
    )}
    {state.hasCache && state.status === "error" && <Text role="status" fontSize="xs" color="gray.500">
      {t("dashboard.refresh_failed", "Actualisation impossible. Les dernières données enregistrées restent affichées.")}
    </Text>}
  </>;
}
