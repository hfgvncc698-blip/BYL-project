import React from "react";
import { Box, Grid, Text } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

const kgToLbs = (kg) =>
  kg == null || Number.isNaN(Number(kg)) ? "" : +(Number(kg) * 2.2046226218).toFixed(1);

export default function ClientMeasurementCharts({
  measures = [],
  weightUnit = "kg",
  subtlePanelBg,
  panelBorder,
  shadow,
  lineStroke,
}) {
  const { t } = useTranslation();
  const definitions = [
    ["poids", `${t("stats.fields.weight", "Poids")} (${weightUnit})`, (value) => (weightUnit === "kg" ? value : kgToLbs(value))],
    ["bmi", t("stats.fields.bmi", "IMC"), (value) => value],
    ["fatMass", t("stats.fields.fat", "Masse grasse"), (value) => value],
    ["muscleMass", `${t("stats.fields.muscle", "Masse musculaire")} (${weightUnit})`, (value) => (weightUnit === "kg" ? value : kgToLbs(value))],
    ["waterMass", t("stats.fields.water", "Eau"), (value) => value],
    ["boneMass", `${t("stats.fields.bone", "Masse osseuse")} (${weightUnit})`, (value) => (weightUnit === "kg" ? value : kgToLbs(value))],
    ["metabolicAge", t("stats.fields.metabolicAge", "Âge métabolique"), (value) => value],
    ["visceralFatScore", t("stats.fields.visceralFat", "Graisse viscérale"), (value) => value],
  ];

  return (
    <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={6}>
      {definitions.map(([field, label, map]) => {
        let data = measures
          .filter((entry) => entry[field] != null)
          .map((entry) => ({ date: entry.date, value: map(entry[field]) }));
        if (field === "bmi") {
          data = measures
            .filter((entry) => entry.poids != null && entry.taille != null)
            .map((entry) => ({
              date: entry.date,
              value: +(entry.poids / (entry.taille / 100) ** 2).toFixed(1),
            }));
        }
        if (data.length < 2) return null;

        return (
          <Box key={field} bg={subtlePanelBg} border="1px solid" borderColor={panelBorder} p={4} borderRadius="22px" boxShadow={shadow}>
            <Text fontWeight="bold" mb={2}>{label}</Text>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis allowDecimals={false} />
                <RechartsTooltip />
                <Line type="monotone" dataKey="value" stroke={lineStroke} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </Box>
        );
      })}
    </Grid>
  );
}
