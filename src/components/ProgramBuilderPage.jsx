// src/pages/ProgramBuilderPage.jsx
import React, { useLayoutEffect, useState } from "react";
import { Box, Flex, useColorModeValue } from "@chakra-ui/react";
import ExerciseBank from "./ExerciseBank";
import ProgramBuilder from "./ProgramBuilder";

const SIDEBAR_W = 360;   // largeur fixe de la banque
const SIDEBAR_MIN = 320;

function useHeaderHeight() {
  const [height, setHeight] = useState(56);

  useLayoutEffect(() => {
    const measure = () => {
      const header = document.querySelector("header, nav");
      setHeight(header ? Math.max(48, Math.round(header.getBoundingClientRect().height)) : 56);
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  return height;
}

export default function ProgramBuilderPage() {
  const divider = useColorModeValue("gray.200", "gray.600");
  const headerH = useHeaderHeight();

  // passerelle banque -> builder
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [replaceIndex, setReplaceIndex] = useState(null);

  useLayoutEffect(() => {
    const root = document.getElementById("root");
    if (!root) return undefined;

    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <Flex
      data-tour-page="program-builder"
      w="100%"
      h={`calc(100dvh - ${headerH}px)`}
      overflow="hidden"
    >
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
      <Box
        data-builder-scroll-container="true"
        flex="1 1 0"
        minW={0}
        h="100%"
        overflowY="auto"
        overflowX="hidden"
      >
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
