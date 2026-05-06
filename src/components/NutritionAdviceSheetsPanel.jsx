/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  HStack,
  Heading,
  Input,
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
  useToast,
} from "@chakra-ui/react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { getAdviceSheetPreview, mergeAdviceSheets } from "../utils/nutritionAdviceSheets";
import { notify } from "../utils/notify";

const makeCustomId = () => `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const splitLines = (value) =>
  String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

export default function NutritionAdviceSheetsPanel({
  clientId,
  assessmentId,
  docData,
  selectedIds,
  onSelectedIdsChange,
  patientNote,
  onPatientNoteChange,
  patientNoteShared,
  onPatientNoteSharedChange,
  onDownloadPdf,
  isDownloadingPdf,
  blocked,
  theme,
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    category: "",
    summary: "",
    keyPoints: "",
    practicalTips: "",
  });
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

  const toggleSheet = (id) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange?.([...next]);
  };

  const saveCustomSheet = async () => {
    const title = draft.title.trim();
    if (!title || !clientId || !assessmentId) return;
    setSaving(true);
    try {
      const sheet = {
        id: makeCustomId(),
        title,
        category: draft.category.trim() || "Fiche personnalisée",
        accent: "#2563EB",
        tags: ["personnalisée"],
        summary: draft.summary.trim() || "Conseil personnalisé ajouté par le professionnel.",
        keyPoints: splitLines(draft.keyPoints),
        practicalTips: splitLines(draft.practicalTips),
        createdAt: new Date().toISOString(),
      };

      const ref = doc(db, "clients", clientId, "nutrition_assessments", assessmentId);
      await updateDoc(ref, {
        nutritionAdviceSheets: {
          ...(docData?.nutritionAdviceSheets || {}),
          custom: [...customSheets, sheet],
          selectedIds: [...new Set([...(selectedIds || []), sheet.id])],
        },
        updatedAt: serverTimestamp(),
      });
      onSelectedIdsChange?.([...new Set([...(selectedIds || []), sheet.id])]);
      setDraft({ title: "", category: "", summary: "", keyPoints: "", practicalTips: "" });
      setDraftOpen(false);
      notify(toast, "saveSuccess", { title: "Fiche créée", description: "Elle est sélectionnée pour le partage." });
    } catch (error) {
      notify(toast, "saveError", { title: "Création impossible", description: error?.message || "Impossible de créer la fiche." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box borderWidth="1px" borderColor={theme.borderColor} borderRadius="2xl" bg={theme.surfaceBg} p={{ base: 4, md: 5 }}>
      <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
        <Box>
          <Text fontSize="xs" fontWeight="800" letterSpacing="0.08em" color={theme.mutedText}>
            ÉTAPE 3
          </Text>
          <Heading size="sm" mt={1}>
            Fiches conseils à partager
          </Heading>
          <Text fontSize="sm" color={theme.mutedText} mt={1}>
            Sélectionne les fiches web visibles côté patient. Les fiches non cochées restent internes.
          </Text>
        </Box>
        <HStack spacing={2} flexWrap="wrap" justify="flex-end">
          <Button
            variant="outline"
            onClick={onDownloadPdf}
            isLoading={isDownloadingPdf}
            isDisabled={!selectedSheets.length}
          >
            PDF fiches conseils
          </Button>
          <Button variant="outline" onClick={() => setLibraryOpen((value) => !value)}>
            {libraryOpen ? "Masquer les fiches" : `Voir les fiches (${selectedSet.size} sélectionnée${selectedSet.size > 1 ? "s" : ""})`}
          </Button>
        </HStack>
      </HStack>

      {!libraryOpen ? (
        <Box mt={4} p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="xl" bg={theme.surfaceSoft}>
          <Text fontSize="sm" fontWeight="700">
            {selectedSet.size} fiche{selectedSet.size > 1 ? "s" : ""} sélectionnée{selectedSet.size > 1 ? "s" : ""}
          </Text>
          <HStack mt={3} spacing={2} flexWrap="wrap">
            {selectedSheets.length ? (
              selectedSheets.slice(0, 8).map((sheet) => {
                const preview = getAdviceSheetPreview(sheet);
                return (
                  <Tag key={sheet.id} size="sm" borderRadius="full" bg={`${preview.accent}22`} color={preview.accent}>
                    <TagLabel>{preview.title}</TagLabel>
                  </Tag>
                );
              })
            ) : (
              <Text fontSize="sm" color={theme.mutedText}>
                Aucune fiche sélectionnée pour le moment.
              </Text>
            )}
            {selectedSheets.length > 8 ? (
              <Tag size="sm" borderRadius="full">
                <TagLabel>+{selectedSheets.length - 8}</TagLabel>
              </Tag>
            ) : null}
          </HStack>
        </Box>
      ) : null}

      <Box mt={4} p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="xl" bg={theme.surfaceSoft}>
        <HStack justify="space-between" align="start" gap={3} flexWrap="wrap">
          <Box>
            <Heading size="sm">Note patient</Heading>
            <Text fontSize="sm" color={theme.mutedText} mt={1}>
              Ajoute une note simple à transmettre au patient, ou garde-la en interne si elle n’est pas cochée.
            </Text>
          </Box>
          <Checkbox
            isChecked={!!patientNoteShared}
            onChange={(e) => onPatientNoteSharedChange?.(e.target.checked)}
            isDisabled={blocked || !String(patientNote || "").trim()}
          >
            Transmettre
          </Checkbox>
        </HStack>
        <Textarea
          mt={3}
          value={patientNote || ""}
          onChange={(e) => onPatientNoteChange?.(e.target.value)}
          placeholder="Exemple : priorité sur l’hydratation cette semaine, garder le yaourt du soir, limiter les boissons sucrées..."
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
              borderRadius="xl"
              bg={selected ? theme.surfaceSoft : theme.surfaceBg}
              boxShadow={selected ? "md" : "none"}
            >
              <HStack justify="space-between" align="start" gap={3}>
                <Box>
                  <Badge bg={`${preview.accent}22`} color={preview.accent} borderRadius="full" px={2}>
                    {preview.category}
                  </Badge>
                  <Heading size="sm" mt={3}>
                    {preview.title}
                  </Heading>
                </Box>
                <Checkbox isChecked={selected} onChange={() => toggleSheet(sheet.id)} isDisabled={blocked}>
                  Partager
                </Checkbox>
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
                <Button size="sm" variant="outline" onClick={() => setActiveSheetId(sheet.id)}>
                  Voir la fiche
                </Button>
              </HStack>
            </Box>
          );
          })}
        </SimpleGrid>
      ) : null}

      <Modal isOpen={Boolean(activePreview)} onClose={() => setActiveSheetId(null)} size="3xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent borderRadius="2xl">
          <ModalHeader>
            <Badge bg={`${activePreview?.accent || "#2563EB"}22`} color={activePreview?.accent || "#2563EB"} borderRadius="full" px={2}>
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
              <Box p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="xl" bg={theme.surfaceBg}>
                <Heading size="sm" mb={3}>
                  Points clés
                </Heading>
                <Stack spacing={2}>
                  {(activePreview?.keyPoints || []).map((point) => (
                    <Text key={point} fontSize="sm">
                      • {point}
                    </Text>
                  ))}
                </Stack>
              </Box>
              <Box p={4} borderWidth="1px" borderColor={theme.borderColor} borderRadius="xl" bg={theme.surfaceBg}>
                <Heading size="sm" mb={3}>
                  Conseils pratiques
                </Heading>
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
            <Button variant="outline" onClick={() => setActiveSheetId(null)}>
              Fermer
            </Button>
            {activeSheet ? (
              <Button
                {...theme.primaryButtonProps}
                onClick={() => toggleSheet(activeSheet.id)}
                isDisabled={blocked}
              >
                {selectedSet.has(activeSheet.id) ? "Retirer du partage" : "Partager cette fiche"}
              </Button>
            ) : null}
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}
