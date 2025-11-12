// src/pages/ProgramBuilderPage.jsx
import React, { useState } from "react";
import { Box, Flex, useColorModeValue } from "@chakra-ui/react";
import ExerciseBank from "./ExerciseBank";
import ProgramBuilder from "./ProgramBuilder";

const SIDEBAR_W = 360;   // largeur fixe de la banque
const SIDEBAR_MIN = 320;

export default function ProgramBuilderPage() {
  const divider = useColorModeValue("gray.200", "gray.600");

  // passerelle banque -> builder
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [replaceIndex, setReplaceIndex] = useState(null);

  return (
    <Flex w="100%" h="100vh" overflow="hidden">
      {/* Banque d'exercices, largeur fixe */}
      <Box
        as="aside"
        flex="0 0 auto"
        w={`${SIDEBAR_W}px`}
        minW={`${SIDEBAR_MIN}px`}
        h="100%"
        overflow="hidden"
        borderRight="1px solid"
        borderColor={divider}
      >
        <Box h="100%" overflowY="auto" px={3} pt={3}>
          <ExerciseBank
            onAdd={(ex) => setSelectedExercises((prev) => [...prev, ex])}
            onReplace={(ex) => setSelectedExercises([ex])}
            replaceMode={replaceIndex !== null}
            onCancelReplace={() => setReplaceIndex(null)}
          />
        </Box>
      </Box>

      {/* Builder prend tout l’espace restant */}
      <Box flex="1 1 0" minW={0} h="100%" overflowY="auto" overflowX="hidden">
        <ProgramBuilder
          selectedExercises={selectedExercises}
          setSelectedExercises={setSelectedExercises}
          replaceIndex={replaceIndex}
          setReplaceIndex={setReplaceIndex}
        />
      </Box>
    </Flex>
  );
}
