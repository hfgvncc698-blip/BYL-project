import { Avatar, Badge, Box, HStack, Text, VStack } from "@chakra-ui/react";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/appTheme";

export default function MessagingContactList({ contacts, selectedId = "", onSelect, compact = false }) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  if (!contacts.length) {
    return (
      <Box px={4} py={8} textAlign="center">
        <Text fontWeight="900">{t("messaging.noContactsTitle")}</Text>
        <Text mt={1} fontSize="sm" color={theme.mutedText}>{t("messaging.noContactsBody")}</Text>
      </Box>
    );
  }

  return (
    <VStack align="stretch" spacing={1.5}>
      {contacts.map((contact) => (
        <Box
          as="button"
          type="button"
          key={contact.id}
          w="full"
          textAlign="left"
          p={compact ? 2.5 : 3}
          borderRadius="16px"
          border="1px solid"
          borderColor={selectedId === contact.id ? "blue.400" : theme.borderColor}
          bg={selectedId === contact.id ? "rgba(37,124,255,0.08)" : "transparent"}
          _hover={{ bg: "rgba(37,124,255,0.06)", borderColor: "blue.300" }}
          onClick={() => onSelect?.(contact)}
        >
          <HStack spacing={3}>
            <Avatar size={compact ? "sm" : "md"} name={contact.title} />
            <Box minW={0} flex="1">
              <HStack justify="space-between" gap={2}>
                <Text fontWeight="900" noOfLines={1}>{contact.title}</Text>
                {contact.unread ? <Badge colorScheme="blue" borderRadius="full">{t("messaging.new")}</Badge> : null}
              </HStack>
              <Text mt={0.5} fontSize="xs" color={theme.mutedText} noOfLines={1}>
                {contact.conversation?.lastMessage || contact.email || contact.relationshipLabel || t("messaging.clientOrPatient")}
              </Text>
            </Box>
          </HStack>
        </Box>
      ))}
    </VStack>
  );
}
