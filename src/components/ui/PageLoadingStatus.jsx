import React from "react";
import { Box, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

export default function PageLoadingStatus({ state }) {
  const { t } = useTranslation();
  return <>
    {state.debug && <Box as="output" data-testid="page-loading-timing" display="block" fontSize="xs" p={2}>{JSON.stringify(state)}</Box>}
    {state.hasCache && state.status !== "ready" && <Text role="status" fontSize="xs" color="gray.500">
      {state.status === "error"
        ? t("dashboard.refresh_failed", "Actualisation impossible. Les dernières données enregistrées restent affichées.")
        : t("dashboard.refreshing_saved_data", "Données enregistrées affichées · Actualisation en cours…")}
    </Text>}
  </>;
}
