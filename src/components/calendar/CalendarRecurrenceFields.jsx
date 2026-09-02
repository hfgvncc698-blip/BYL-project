import React, { useMemo } from "react";
import { FormControl, FormLabel, Input, Select, SimpleGrid, Text } from "@chakra-ui/react";
import { expandRecurringDates } from "../../utils/calendarRecurrence";

const optionStyle = { color: "black" };

export default function CalendarRecurrenceFields({ value, onChange, startDateTime, t, inputProps = {} }) {
  const frequency = value?.frequency || "none";
  const occurrenceCount = useMemo(
    () => expandRecurringDates(startDateTime, value).length,
    [startDateTime, value]
  );

  return (
    <>
      <FormControl>
        <FormLabel>{t("calendar.recurrence.label", "Récurrence")}</FormLabel>
        <Select
          value={frequency}
          onChange={(event) => onChange({ ...value, frequency: event.target.value })}
          {...inputProps}
        >
          <option value="none" style={optionStyle}>{t("calendar.recurrence.none", "Ne pas répéter")}</option>
          <option value="daily" style={optionStyle}>{t("calendar.recurrence.daily", "Tous les jours")}</option>
          <option value="weekly" style={optionStyle}>{t("calendar.recurrence.weekly", "Toutes les semaines")}</option>
          <option value="monthly" style={optionStyle}>{t("calendar.recurrence.monthly", "Tous les mois")}</option>
          <option value="yearly" style={optionStyle}>{t("calendar.recurrence.yearly", "Tous les ans")}</option>
        </Select>
      </FormControl>

      {frequency !== "none" && (
        <>
          <SimpleGrid columns={2} spacing={2.5} w="full">
            <FormControl>
              <FormLabel>{t("calendar.recurrence.ends", "Fin")}</FormLabel>
              <Select
                value={value?.endMode || "count"}
                onChange={(event) => onChange({ ...value, endMode: event.target.value })}
                {...inputProps}
              >
                <option value="count" style={optionStyle}>{t("calendar.recurrence.after_count", "Après un nombre")}</option>
                <option value="until" style={optionStyle}>{t("calendar.recurrence.on_date", "À une date")}</option>
              </Select>
            </FormControl>
            {value?.endMode === "until" ? (
              <FormControl isRequired>
                <FormLabel>{t("calendar.recurrence.until", "Jusqu’au")}</FormLabel>
                <Input
                  type="date"
                  min={startDateTime ? String(startDateTime).slice(0, 10) : undefined}
                  value={value?.until || ""}
                  onChange={(event) => onChange({ ...value, until: event.target.value })}
                  {...inputProps}
                />
              </FormControl>
            ) : (
              <FormControl isRequired>
                <FormLabel>{t("calendar.recurrence.occurrences", "Occurrences")}</FormLabel>
                <Input
                  type="number"
                  min={2}
                  max={100}
                  value={value?.count || 4}
                  onChange={(event) => onChange({ ...value, count: Number(event.target.value) })}
                  {...inputProps}
                />
              </FormControl>
            )}
          </SimpleGrid>
          <Text alignSelf="flex-start" fontSize="xs" color="gray.500">
            {occurrenceCount > 0
              ? t("calendar.recurrence.summary", "{{count}} rendez-vous seront créés", { count: occurrenceCount })
              : t("calendar.recurrence.invalid_end", "Choisissez une fin postérieure au premier rendez-vous.")}
          </Text>
        </>
      )}
    </>
  );
}
