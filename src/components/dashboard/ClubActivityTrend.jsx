import React, { useMemo } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useTranslation } from "react-i18next";
import { buildClubActivityTrend } from "../../utils/clubActivityTrend.mjs";

export default function ClubActivityTrend({ clients, programs, nutrition, sessions, period, now, theme }) {
  const { t, i18n } = useTranslation();
  const data = useMemo(() => buildClubActivityTrend({ clients, programs, nutrition, sessions }, period, now),
    [clients, programs, nutrition, sessions, period, now]);
  const labels = {
    clients: t("dashboard.stats_total_clients", "Clients"),
    programs: t("dashboard.stats_total_programs", "Programmes"),
    nutrition: t("nav.nutrition", "Nutrition"),
    sessions: t("clubDashboard.stats.sessionsPlayed", "Séances réalisées"),
  };
  const formatDate = (value) => new Intl.DateTimeFormat(i18n.language || i18n.resolvedLanguage || "fr", period === "day"
    ? { day: "numeric", month: "short" }
    : period === "year" ? { year: "numeric" } : { month: "short", year: "2-digit" }).format(new Date(value));
  const hasData = data.some((row) => row.clients + row.programs + row.nutrition + row.sessions > 0);
  return (
    <Box {...theme.tileProps} p={4} mt={4}>
      <Heading size="sm">{t("clubDashboard.trend.title")}</Heading>
      <Text color={theme.mutedText} fontSize="sm" mt={1}>{t(`clubDashboard.trend.${period}`)}</Text>
      {hasData ? (
        <Box h={{ base: "280px", md: "300px" }} mt={4} role="img" aria-label={t("clubDashboard.trend.title")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 5, left: -20 }} accessibilityLayer>
              <CartesianGrid stroke="currentColor" opacity={0.12} vertical={false} />
              <XAxis dataKey="at" tickFormatter={formatDate} minTickGap={25} tick={{ fill: "currentColor", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "currentColor", fontSize: 12 }} />
              <Tooltip labelFormatter={formatDate} contentStyle={{ background: "var(--chakra-colors-chakra-body-bg)", borderRadius: 12 }} />
              <Legend />
              {Object.entries({ clients: "#4299e1", programs: "#a78bfa", nutrition: "#38b2ac", sessions: "#ed8936" }).map(([key, color], index) => (
                <Line key={key} dataKey={key} name={labels[key]} stroke={color} strokeWidth={2.5}
                  strokeDasharray={index ? `${index * 3} 3` : undefined} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      ) : <Text py={6} color={theme.mutedText}>{t("clubDashboard.trend.empty")}</Text>}
      <Text color={theme.mutedText} fontSize="xs" mt={3}>{t("clubDashboard.trend.scope")}</Text>
    </Box>
  );
}
