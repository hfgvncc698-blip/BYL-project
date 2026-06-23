import { useState } from "react";
import { Box, Text, Button, Badge, HStack } from "@chakra-ui/react";
import ProgramModal from "./ProgramModal";
import i18n from "../i18n/index";
import { formatProgramActiveWeeks, getProgramActiveWeeksLabel } from "../utils/programDuration";

const ProgramCard = ({ program }) => {
  const [isModalOpen, setModalOpen] = useState(false);

  return (
    <Box p={4} bg="gray.900" color="white" borderRadius="lg" boxShadow="xl">
      <Text fontSize="xl" fontWeight="bold">{program.nomProgramme}</Text>
      <Text fontSize="md">{program.exercises ? program.exercises.length : 0}{i18n.t("auto.ProgramCard.exercices", "exercices")}</Text>
      {formatProgramActiveWeeks(program, i18n.t.bind(i18n)) && (
        <HStack mt={2}>
          <Badge colorScheme="blue">
            {getProgramActiveWeeksLabel(i18n.t.bind(i18n))} : {formatProgramActiveWeeks(program, i18n.t.bind(i18n))}
          </Badge>
        </HStack>
      )}

      <Button colorScheme="blue" mt={3} onClick={() => setModalOpen(true)}>{i18n.t("auto.ProgramCard.voir_le_programme", "Voir le programme")}</Button>

      {/* Modal */}
      <ProgramModal isOpen={isModalOpen} onClose={() => setModalOpen(false)} program={program} />
    </Box>
  );
};

export default ProgramCard;
