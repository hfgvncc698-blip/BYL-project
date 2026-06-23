import React from "react";
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Text, VStack } from "@chakra-ui/react";
import i18n from "../i18n/index";

const ProgramModal = ({ isOpen, onClose, program }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{program?.nomProgramme || "Programme"}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          {program?.exercises && program.exercises.length > 0 ? (
            <VStack align="start" spacing={3}>
              {program.exercises.map((exercise, index) => (
                <Text key={index}>
                  {exercise.nom} - {exercise.repetitions ? `${exercise.repetitions} répétitions` : exercise.duree}
                </Text>
              ))}
            </VStack>
          ) : (
            <Text>{i18n.t("auto.ProgramModal.aucun_exercice_disponible", "Aucun exercice disponible.")}</Text>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ProgramModal;

