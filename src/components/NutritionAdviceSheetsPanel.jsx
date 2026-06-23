 
import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  HStack,
  Heading,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Stack,
  Tag,
  TagLabel,
  Text,
  Textarea,
  useColorModeValue,
} from "@chakra-ui/react";
import { } from "firebase/firestore";

import { getAdviceSheetPreview, mergeAdviceSheets } from "../utils/nutritionAdviceSheets";

import i18n from "../i18n/index";





export default function NutritionAdviceSheetsPanel({
  
  docData,
  selectedIds,
  onSelectedIdsChange,
  patientNote,
  onPatientNoteChange,
  patientNoteShared,
  onPatientNoteSharedChange,
  blocked,
  theme,
}) {
  
  const accentPillBgAlpha = useColorModeValue("22", "3D");
  const accentPillBorderAlpha = useColorModeValue("33", "66");
  const accentPillTextColor = useColorModeValue(null, "whiteAlpha.900");
  const [activeSheetId, setActiveSheetId] = useState(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const customSheets = docData?.nutritionAdviceSheets?.custom || [];
  const sheets = useMemo(() => mergeAdviceSheets(customSheets), [customSheets]);
  const selectedSet = useMemo(() => new Set(selectedIds || []), [selectedIds]);
  const selectedSheets = useMemo(
    () => sheets.filter((sheet) => selectedSet.has(sheet.id)),
    [sheets, selectedSet]
  );
  const activeSheet = useMemo(
    () => sheets.find((sheet) => sheet.id === activeSheetId) || null,
    [activeSheetId, sheets]
  );
  const activePreview = useMemo(
    () => (activeSheet ? getAdviceSheetPreview(activeSheet) : null),
    [activeSheet]
  );
  const accentPillProps = (accent = "#2563EB") => ({
    bg: `${accent}${accentPillBgAlpha}`,
    color: accentPillTextColor || accent,
    borderWidth: "1px",
    borderColor: `${accent}${accentPillBorderAlpha}`,
    fontWeight: "800",
  });

  const toggleSheet = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange?.([...next]);
  };

  

  return (
    <Box
      borderWidth="1px"
      borderColor={theme.borderColor}
      borderRadius="lg"
      bg={theme.surfaceBg}
      p={{ base: 4, md: 5 }}
      boxShadow="0 14px 34px rgba(15, 23, 42, 0.06)"
    >
      <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
        <Box>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.mutedText}>{i18n.t("auto.NutritionAdviceSheetsPanel.etape_3", "ÉTAPE 3")}</Text>
          <Heading size="sm" mt={1}>{i18n.t("auto.NutritionAdviceSheetsPanel.fiches_conseils_a_partager", "Fiches conseils à partager")}</Heading>
          <Text fontSize="sm" color={theme.mutedText} mt={1}>{i18n.t("auto.NutritionAdviceSheetsPanel.selectionne_les_fiches_web_visibles_cote_patient_l", "Sélectionne les fiches web visibles côté patient. Les fiches non cochées restent internes.")}</Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap" justify="flex-end">
          <Button variant="outline" onClick={() => setLibraryOpen((value) => !value)}>
            {libraryOpen
              ? i18n.t("auto.NutritionAdviceSheetsPanel.masquer_les_fiches", "Masquer les fiches")
              : i18n.t("auto.NutritionAdviceSheetsPanel.voir_les_fiches_count", "Voir les fiches ({{count}} sélectionnée(s))", {
                  count: selectedSet.size,
                })}
          </Button>
        </HStack>
      </HStack>

      {!libraryOpen ? (
        <Box mt={4} p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="md" bg={theme.surfaceSoft}>
          <Text fontSize="sm" fontWeight="700">
            {i18n.t(
              "auto.NutritionAdviceSheetsPanel.selected_sheets_count",
              "{{count}} fiche(s) sélectionnée(s)",
              { count: selectedSet.size }
            )}
          </Text>
          <HStack mt={3} spacing={2} flexWrap="wrap">
            {selectedSheets.length ? (
              selectedSheets.slice(0, 8).map((sheet) => {
                const preview = getAdviceSheetPreview(sheet);
                return (
                  <Tag key={sheet.id} size="sm" borderRadius="full" {...accentPillProps(preview.accent)}>
                    <TagLabel>{preview.title}</TagLabel>
                  </Tag>
                );
              })
            ) : (
              <Text fontSize="sm" color={theme.mutedText}>{i18n.t("auto.NutritionAdviceSheetsPanel.aucune_fiche_selectionnee_pour_le_moment", "Aucune fiche sélectionnée pour le moment.")}</Text>
            )}
            {selectedSheets.length > 8 ? (
              <Tag size="sm" borderRadius="full">
                      <TagLabel>{i18n.t("auto.NutritionAdviceSheetsPanel.plus_count", "+{{count}}", { count: selectedSheets.length - 8 })}</TagLabel>
              </Tag>
            ) : null}
          </HStack>
        </Box>
      ) : null}

      <Box mt={4} p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="md" bg={theme.surfaceSoft}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <Box>
            <Heading size="sm">{i18n.t("auto.NutritionAdviceSheetsPanel.note_patient", "Note patient")}</Heading>
            <Text fontSize="sm" color={theme.mutedText} mt={1}>{i18n.t("auto.NutritionAdviceSheetsPanel.ajoute_une_note_simple_a_transmettre_au_patient_ou", "Ajoute une note simple à transmettre au patient, ou garde-la en interne si elle n’est pas cochée.")}</Text>
          </Box>
          <Checkbox
            isChecked={!!patientNoteShared}
            onChange={(e) => onPatientNoteSharedChange?.(e.target.checked)}
            isDisabled={blocked || !String(patientNote || "").trim()}
          >{i18n.t("auto.NutritionAdviceSheetsPanel.transmettre", "Transmettre")}</Checkbox>
        </HStack>
        <Textarea
          mt={3}
          value={patientNote || ""}
          onChange={(e) => onPatientNoteChange?.(e.target.value)}
          placeholder={i18n.t("auto.NutritionAdviceSheetsPanel.exemple_priorite_sur_l_hydratation_cette_semaine_g", "Exemple : priorité sur l’hydratation cette semaine, garder le yaourt du soir, limiter les boissons sucrées...")}
          bg={theme.surfaceBg}
          isDisabled={blocked}
        />
      </Box>

      {libraryOpen ? (
        <SimpleGrid columns={{ base: 1, md: 2, xl: 3 }} spacing={4} mt={4}>
          {sheets.map((sheet) => {
          const selected = selectedSet.has(sheet.id);
          const preview = getAdviceSheetPreview(sheet);
          return (
            <Box
              key={sheet.id}
              p={4}
              borderWidth="1px"
              borderColor={selected ? preview.accent : theme.borderColor}
              borderRadius="md"
              bg={selected ? theme.surfaceSoft : theme.surfaceBg}
              boxShadow={selected ? "md" : "none"}
            >
              <HStack justify="space-between" align="start" gap={3}>
                <Box>
                  <Badge {...accentPillProps(preview.accent)} borderRadius="full" px={2}>
                    {preview.category}
                  </Badge>
                  <Heading size="sm" mt={3}>
                    {preview.title}
                  </Heading>
                </Box>
                <Checkbox isChecked={selected} onChange={() => toggleSheet(sheet.id)} isDisabled={blocked}>{i18n.t("auto.NutritionAdviceSheetsPanel.partager", "Partager")}</Checkbox>
              </HStack>
              <Text fontSize="sm" color={theme.mutedText} mt={3}>
                {preview.summary}
              </Text>
              <Divider my={3} />
              <Stack spacing={1}>
                {preview.keyPoints.slice(0, 3).map((point) => (
                  <Text key={point} fontSize="sm">
                    • {point}
                  </Text>
                ))}
              </Stack>
              <HStack mt={3} spacing={2} flexWrap="wrap" justify="space-between">
                <HStack spacing={2} flexWrap="wrap">
                  {preview.tags.slice(0, 3).map((tag) => (
                    <Tag key={tag} size="sm" borderRadius="full">
                      <TagLabel>{tag}</TagLabel>
                    </Tag>
                  ))}
                </HStack>
                <Button size="sm" variant="outline" onClick={() => setActiveSheetId(sheet.id)}>{i18n.t("auto.NutritionAdviceSheetsPanel.voir_la_fiche", "Voir la fiche")}</Button>
              </HStack>
            </Box>
          );
          })}
        </SimpleGrid>
      ) : null}

      <Modal isOpen={Boolean(activePreview)} onClose={() => setActiveSheetId(null)} size="3xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="lg">
          <ModalHeader>
            <Badge {...accentPillProps(activePreview?.accent || "#2563EB")} borderRadius="full" px={2}>
              {activePreview?.category}
            </Badge>
            <Heading size="md" mt={3}>
              {activePreview?.title}
            </Heading>
            <Text fontSize="sm" fontWeight="500" color={theme.mutedText} mt={2}>
              {activePreview?.summary}
            </Text>
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <Box p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="md" bg={theme.surfaceBg}>
                <Heading size="sm" mb={3}>{i18n.t("auto.NutritionAdviceSheetsPanel.points_cles", "Points clés")}</Heading>
                <Stack spacing={2}>
                  {(activePreview?.keyPoints || []).map((point) => (
                    <Text key={point} fontSize="sm">
                      • {point}
                    </Text>
                  ))}
                </Stack>
              </Box>
              <Box p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="md" bg={theme.surfaceBg}>
                <Heading size="sm" mb={3}>{i18n.t("auto.NutritionAdviceSheetsPanel.conseils_pratiques", "Conseils pratiques")}</Heading>
                <Stack spacing={2}>
                  {(activePreview?.practicalTips || []).map((tip) => (
                    <Text key={tip} fontSize="sm">
                      • {tip}
                    </Text>
                  ))}
                </Stack>
              </Box>
            </SimpleGrid>
            <HStack mt={4} spacing={2} flexWrap="wrap">
              {(activePreview?.tags || []).map((tag) => (
                <Tag key={tag} size="sm" borderRadius="full">
                  <TagLabel>{tag}</TagLabel>
                </Tag>
              ))}
            </HStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button variant="outline" onClick={() => setActiveSheetId(null)}>{i18n.t("programView.close", "Fermer")}</Button>
            {activeSheet ? (
              <Button
                {...theme.primaryButtonProps}
                onClick={() => toggleSheet(activeSheet.id)}
                isDisabled={blocked}
              >
                {selectedSet.has(activeSheet.id)
                  ? i18n.t("auto.NutritionAdviceSheetsPanel.retirer_du_partage", "Retirer du partage")
                  : i18n.t("auto.NutritionAdviceSheetsPanel.partager_cette_fiche", "Partager cette fiche")}
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
