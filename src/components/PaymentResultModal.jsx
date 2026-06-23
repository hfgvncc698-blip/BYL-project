// src/components/PaymentResultModal.jsx
import React, { useEffect } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalFooter,
  Button,
  VStack,
  Text,
  Icon,
} from "@chakra-ui/react";
import { CheckCircleIcon, WarningIcon } from "@chakra-ui/icons";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function PaymentResultModal({
  isOpen,
  status, // "success" | "cancel"
  redirectTo,
  message,
  subtext,
  subMessage,
  buttonText,
  onButtonClick,
  delay = 2200,
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const isSuccess = status === "success";
  const safeRedirectTo = redirectTo || (isSuccess ? "/user-dashboard" : "/programmes-premium");
  const description = subtext || subMessage;
  const handleClose = () => {
    if (onButtonClick) {
      onButtonClick();
      return;
    }
    navigate(safeRedirectTo);
  };

  // Auto redirect
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        if (onButtonClick) onButtonClick();
        else navigate(safeRedirectTo);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onButtonClick, safeRedirectTo, delay, navigate]);

  const color = isSuccess ? "green.400" : "red.400";
  const icon = isSuccess ? CheckCircleIcon : WarningIcon;
  const btnLabel = isSuccess
    ? t("payment.result.dashboard", "Aller au tableau de bord")
    : t("payment.result.retry", "Réessayer le paiement");

  // Visuel pro
  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered>
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
                ? t("payment.result.successTitle", "Paiement validé, merci pour votre achat !")
                : t("payment.result.cancelTitle", "Paiement annulé"))}
          </Text>
          <Text color="gray.600" fontSize="md">
            {description ||
              (isSuccess
                ? t("payment.result.successDescription", "Vous allez être redirigé vers votre espace dans un instant.")
                : t("payment.result.cancelDescription", "Veuillez vérifier vos informations et réessayer."))}
          </Text>
        </VStack>
        <ModalFooter justifyContent="center" mt={6}>
          <Button
            colorScheme={isSuccess ? "green" : "red"}
            variant="solid"
            size="lg"
            px={8}
            borderRadius="full"
            onClick={handleClose}
          >
            {buttonText || btnLabel}
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
