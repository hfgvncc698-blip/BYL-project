import { Box, Button, HStack, Link as ChakraLink, Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Text, VStack } from "@chakra-ui/react";
import { CopyIcon } from "@chakra-ui/icons";
import { useTranslation } from "react-i18next";

export default function CoachCalendarLinkModal({ calendarLinkModal, surfaceBgStrong, textColor, borderColor, mutedText, handleGenerateCalendarLink, calendarLinkLoading, modeValue, calendarSubscriptionUrl, activeBlue, handleCopyCalendarUrl }) {
  const { t } = useTranslation();
  return (
      <Modal isOpen={calendarLinkModal.isOpen}
onClose={calendarLinkModal.onClose}
isCentered>
        <ModalOverlay />
        <ModalContent
          bg={surfaceBgStrong}
          color={textColor}
          borderRadius="22px"
          border="1px solid"
          borderColor={borderColor}
        >
          <ModalHeader>{t("dashboard.connect_calendar", "Connecter mon calendrier")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={2.5} align="stretch">
               <Text fontSize="sm" color={mutedText}>
                 {t("dashboard.calendar_link_modal.description", "Copiez ce lien d’abonnement pour synchroniser les séances dans votre agenda externe.")}
               </Text>

              <Button
                onClick={handleGenerateCalendarLink}
                isLoading={calendarLinkLoading}
                borderRadius="16px"

                bg={modeValue("#111827", "rgba(255,255,255,0.16)")}
                color="white"
                _hover={{ bg: modeValue("#1F2937", "rgba(255,255,255,0.22)") }}
                _active={{ bg: modeValue("#374151", "rgba(255,255,255,0.28)") }}
              >
                {t("dashboard.calendar_link_modal.generate_copy", "Générer et copier le lien")}
              </Button>
              {calendarSubscriptionUrl ? (
                <Box
                  p={3.5}
                  borderRadius="16px"
                  bg={modeValue("rgba(15,23,42,0.03)",
"rgba(255,255,255,0.04)")}
                  border="1px solid"
                  borderColor={borderColor}
                >
                  <Text fontSize="sm" fontWeight="700" mb={2}>
                     {t("dashboard.calendar_link_modal.subscription_link_label", "Lien d’abonnement")}:
                  </Text>
                  <ChakraLink
                     href={calendarSubscriptionUrl}
                     isExternal
                     color={activeBlue}
                     fontSize="sm"
                     wordBreak="break-all"
                  >
                     {calendarSubscriptionUrl}
                  </ChakraLink>
                  <HStack mt={4} spacing={2.5}>
                     <Button size="sm" leftIcon={<CopyIcon />}
borderRadius="12px" onClick={handleCopyCalendarUrl}>
                       {t("common.copy", "Copier")}
                     </Button>
                     <Button
                       size="sm"
                       borderRadius="12px"
                       variant="outline"
                       onClick={() =>
window.open(calendarSubscriptionUrl, "_blank",
"noopener,noreferrer")}
                     >
                       {t("common.view", "Voir")}
                     </Button>
                  </HStack>
                  <Text fontSize="xs" color={mutedText} mt={3}>
                     {t("dashboard.calendar_link_modal.help_ios",
"Dans Google Agenda : Ajouter via une URL.")}

{t("dashboard.calendar_link_modal.help_ios", "Sur iPhone / Apple Calendar : Ajouter un calendrier par abonnement.")}
                  </Text>

                     </Box>
                   ) : null}
                 </VStack>
               </ModalBody>
               <ModalFooter>

                  <Button
                    variant="ghost"
                    color={textColor}
                    borderRadius="16px"
                    onClick={calendarLinkModal.onClose}
                  >
                    {t("common.close", "Fermer")}
                  </Button>
                </ModalFooter>
             </ModalContent>
           </Modal>
  );
}
