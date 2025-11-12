// src/components/PaymentResultModal.jsx
import React, { useEffect } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalBody,
  ModalFooter,
  Button,
  VStack,
  Text,
  Icon,
  useColorModeValue,
} from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";
import { useNavigate } from "react-router-dom";

export default function PaymentResultModal({
  isOpen,
  status, // "success" | "cancel"
  redirectTo,
  message,
  subtext,
  delay = 2200,
}) {
  const navigate = useNavigate();
  const isSuccess = status === "success";

  // Auto redirect
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        navigate(redirectTo);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, redirectTo, delay, navigate]);

  const color = isSuccess ? "green.400" : "red.400";
  const icon = isSuccess ? CheckCircleIcon : WarningIcon;
  const btnLabel = isSuccess
    ? "Aller au tableau de bord"
    : "Réessayer le paiement";

  // Visuel pro
  return (
    <Modal isOpen={isOpen} onClose={() => navigate(redirectTo)} isCentered>
      <ModalOverlay />
      <ModalContent
        py={8}
        px={6}
        borderRadius="2xl"
        boxShadow="2xl"
        maxW="sm"
        textAlign="center"
      >
        <VStack spacing={4}>
          <Icon
            as={icon}
            w={16}
            h={16}
            color={color}
            transition="transform 0.3s"
            animation={isSuccess ? "bounce 1s" : "shake 0.6s"}
          />
          <Text fontWeight="bold" fontSize="2xl" color={color}>
            {message ||
              (isSuccess
                ? "Paiement validé, merci pour votre achat !"
                : "Paiement annulé")}
          </Text>
          <Text color="gray.600" fontSize="md">
            {subtext ||
              (isSuccess
                ? "Vous allez être redirigé vers votre espace dans un instant."
                : "Veuillez vérifier vos informations et réessayer.")}
          </Text>
        </VStack>
        <ModalFooter justifyContent="center" mt={6}>
          <Button
            colorScheme={isSuccess ? "green" : "red"}
            variant="solid"
            size="lg"
            px={8}
            borderRadius="full"
            onClick={() => navigate(redirectTo)}
          >
            {btnLabel}
          </Button>
        </ModalFooter>
      </ModalContent>
      {/* Mini animation CSS pour un rendu pro */}
      <style>
        {`
          @keyframes bounce {
            0%, 100% { transform: scale(1);}
            50% { transform: scale(1.2);}
          }
          @keyframes shake {
            0% { transform: translateX(0);}
            25% { transform: translateX(-6px);}
            50% { transform: translateX(6px);}
            75% { transform: translateX(-6px);}
            100% { transform: translateX(0);}
          }
        `}
      </style>
    </Modal>
  );
}

