import { useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Avatar,
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Text,
  VStack,
  useToast,
} from "@chakra-ui/react";
import { DeleteIcon } from "@chakra-ui/icons";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "../../styles/appTheme";

const SWIPE_WIDTH = 76;
const SWIPE_TRIGGER = 32;

export default function MessagingContactList({ contacts, selectedId = "", onSelect, onDelete, compact = false }) {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const toast = useToast();
  const [openId, setOpenId] = useState("");
  const [deletingId, setDeletingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const cancelDeleteRef = useRef(null);
  const touchStartRef = useRef({ x: 0, y: 0 });
  const activeSwipeRef = useRef("");
  const dragOffsetRef = useRef(0);
  const draggedRef = useRef(false);

  const startSwipe = (event, contactId) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    activeSwipeRef.current = contactId;
    dragOffsetRef.current = 0;
    draggedRef.current = false;
    if (openId && openId !== contactId) setOpenId("");
  };

  const moveSwipe = (event, contactId) => {
    const touch = event.touches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) <= Math.abs(deltaY) || deltaX >= 0) return;
    draggedRef.current = true;
    dragOffsetRef.current = Math.max(-SWIPE_WIDTH, deltaX);
    setOpenId(contactId);
    setDragOffset(dragOffsetRef.current);
  };

  const endSwipe = (contactId) => {
    if (activeSwipeRef.current !== contactId) return;
    setOpenId(dragOffsetRef.current <= -SWIPE_TRIGGER ? contactId : "");
    setDragOffset(0);
    dragOffsetRef.current = 0;
    activeSwipeRef.current = "";
  };

  const deleteConversation = async (contact) => {
    if (!onDelete || deletingId) return;
    setDeletingId(contact.id);
    try {
      await onDelete(contact);
      setOpenId("");
    } catch (error) {
      toast({
        title: error?.message || t("messaging.deleteConversationError"),
        status: "error",
        duration: 2500,
        isClosable: true,
      });
    } finally {
      setDeletingId("");
      setPendingDelete(null);
    }
  };

  if (!contacts.length) {
    return (
      <Box px={4} py={8} textAlign="center">
        <Text fontWeight="900">{t("messaging.noContactsTitle")}</Text>
        <Text mt={1} fontSize="sm" color={theme.mutedText}>{t("messaging.noContactsBody")}</Text>
      </Box>
    );
  }

  return (
    <>
      <VStack align="stretch" spacing={1.5}>
      {contacts.map((contact) => {
        const canDelete = Boolean(onDelete && contact.conversation);
        const isOpen = canDelete && openId === contact.id;
        const translateX = isOpen ? (dragOffset || -SWIPE_WIDTH) : 0;
        return (
          <Box key={contact.id} position="relative" overflow="hidden" borderRadius="16px">
            {canDelete ? (
              <IconButton
                position="absolute"
                insetEnd={0}
                top={{ base: 0, md: "50%" }}
                bottom={{ base: 0, md: "auto" }}
                transform={{ base: "none", md: "translateY(-50%)" }}
                display={{ base: isOpen ? "inline-flex" : "none", md: "inline-flex" }}
                w={{ base: `${SWIPE_WIDTH}px`, md: "36px" }}
                h={{ base: "full", md: "36px" }}
                minH={{ base: "full", md: "36px" }}
                me={{ base: 0, md: 2 }}
                borderRadius={{ base: 0, md: "full" }}
                colorScheme="red"
                variant={{ base: "solid", md: "ghost" }}
                zIndex={3}
                aria-label={t("messaging.deleteConversationAria")}
                title={t("messaging.deleteConversation")}
                icon={<DeleteIcon />}
                isLoading={deletingId === contact.id}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDelete(contact);
                }}
              />
            ) : null}
            <Box
              as="button"
              type="button"
              position="relative"
              zIndex={1}
              w="full"
              textAlign="left"
              p={compact ? 2.5 : 3}
              pe={{ base: compact ? 2.5 : 3, md: canDelete ? 12 : (compact ? 2.5 : 3) }}
              borderRadius="16px"
              border="1px solid"
              borderColor={selectedId === contact.id ? "blue.400" : theme.borderColor}
              bg={selectedId === contact.id ? "rgba(37,124,255,0.08)" : theme.surfaceBgStrong}
              _hover={{ bg: "rgba(37,124,255,0.06)", borderColor: "blue.300" }}
              transform={`translateX(${translateX}px)`}
              transition={dragOffset ? "none" : "transform 180ms ease"}
              touchAction="pan-y"
              onTouchStart={(event) => startSwipe(event, contact.id)}
              onTouchMove={(event) => moveSwipe(event, contact.id)}
              onTouchEnd={() => endSwipe(contact.id)}
              onClick={() => {
                if (draggedRef.current) {
                  draggedRef.current = false;
                  return;
                }
                if (isOpen) {
                  setOpenId("");
                  return;
                }
                onSelect?.(contact);
              }}
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
          </Box>
        );
      })}
      </VStack>

      <AlertDialog
        isOpen={Boolean(pendingDelete)}
        leastDestructiveRef={cancelDeleteRef}
        onClose={() => {
          if (!deletingId) setPendingDelete(null);
        }}
        isCentered
      >
        <AlertDialogOverlay>
          <AlertDialogContent mx={4} bg={theme.surfaceBgStrong} color={theme.textColor} borderRadius="20px">
            <AlertDialogHeader fontWeight="900">{t("messaging.deleteConversationTitle")}</AlertDialogHeader>
            <AlertDialogBody color={theme.mutedText}>{t("messaging.deleteConversationBody")}</AlertDialogBody>
            <AlertDialogFooter gap={2}>
              <Button ref={cancelDeleteRef} variant="ghost" onClick={() => setPendingDelete(null)} isDisabled={Boolean(deletingId)}>
                {t("common.cancel")}
              </Button>
              <Button
                colorScheme="red"
                isLoading={Boolean(deletingId)}
                onClick={() => void deleteConversation(pendingDelete)}
              >
                {t("actions.delete")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </>
  );
}
