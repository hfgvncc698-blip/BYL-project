import React from "react";
import { Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, Button, Text, VStack } from "@chakra-ui/react";

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
            <Text>Aucun exercice disponible.</Text>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ProgramModal;

