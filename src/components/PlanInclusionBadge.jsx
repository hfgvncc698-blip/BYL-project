import React from "react";
import { Badge } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";

export default function PlanInclusionBadge({ included }) {
  const { t } = useTranslation("common");
  if (included) return null;
  return (
    <Badge borderRadius="full" colorScheme="gray" flexShrink={0}>
      {t("profile.actions.notIncluded", "Non inclus")}
    </Badge>
  );
}
