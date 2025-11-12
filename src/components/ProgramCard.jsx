import { useState } from "react";
import { Box, Text, Button } from "@chakra-ui/react";
import ProgramModal from "./ProgramModal";

const ProgramCard = ({ program }) => {
  const [isModalOpen, setModalOpen] = useState(false);

  return (
    <Box p={4} bg="gray.900" color="white" borderRadius="lg" boxShadow="xl">
      <Text fontSize="xl" fontWeight="bold">{program.nomProgramme}</Text>
      <Text fontSize="md">{program.exercises ? program.exercises.length : 0} exercices</Text>

      <Button colorScheme="blue" mt={3} onClick={() => setModalOpen(true)}>
        Voir le programme
      </Button>

      {/* Modal */}
      <ProgramModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} program={program} />
    </Box>
  );
};

export default ProgramCard;

