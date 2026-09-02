import React from "react";
import {
  Box,
  Button,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/appTheme";

export default function SessionScheduleSuggestionModal({
  isOpen,
  onClose,
  onConfirm,
  isSaving,
  suggestion,
  activeLanguage,
}) {
  const { t } = useTranslation("common");
  const theme = useAppTheme();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeOnEsc={!isSaving}
      closeOnOverlayClick={!isSaving}
      isCentered
    >
      <ModalOverlay />
      <ModalContent maxW="lg" borderRadius="24px">
        <ModalHeader textAlign="center">
          {t("sessionPlayer.scheduleSuggestionTitle", "Planifier la prochaine séance ?")}
        </ModalHeader>
        <ModalCloseButton isDisabled={isSaving} />
        <ModalBody>
          {suggestion && (
            <VStack align="stretch" spacing={4}>
              <Text textAlign="center" color={theme.mutedText}>
                {suggestion.source === "coach_habit"
                  ? t(
                      "sessionPlayer.scheduleSuggestionCoachDescription",
                      "Vous accompagnez régulièrement {{client}} à ce rythme. Voulez-vous programmer le prochain coaching ?",
                      { client: suggestion.clientName }
                    )
                  : t(
                      "sessionPlayer.scheduleSuggestionClientDescription",
                      "Ce créneau correspond à votre rythme habituel. Voulez-vous ajouter la prochaine séance au calendrier ?"
                    )}
              </Text>
              <Box p={4} borderRadius="18px" border="1px solid" borderColor={theme.borderColor} bg={theme.surfaceBg}>
                <Text fontWeight="900">{suggestion.nextSessionTitle}</Text>
                <Text mt={1} color={theme.mutedText}>
                  {suggestion.target.toLocaleDateString(activeLanguage, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}{" "}
                  · {suggestion.target.toLocaleTimeString(activeLanguage, { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </Box>
            </VStack>
          )}
        </ModalBody>
        <ModalFooter gap={3} flexWrap="wrap">
          <Button variant="ghost" onClick={onClose} isDisabled={isSaving}>
            {t("sessionPlayer.scheduleSuggestionLater", "Pas maintenant")}
          </Button>
          <Button
            colorScheme="blue"
            borderRadius="full"
            onClick={onConfirm}
            isLoading={isSaving}
            loadingText={t("common.saving", "Enregistrement…")}
          >
            {t("sessionPlayer.scheduleSuggestionConfirm", "Ajouter au calendrier")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
