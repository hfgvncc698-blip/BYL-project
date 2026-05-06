// src/pages/ProgramBuilderPage.jsx
import React, { useState } from "react";
import {
  Box,
  Grid,
  GridItem,
} from "@chakra-ui/react";
import ExerciseBank from "../components/ExerciseBank.jsx";
import ProgramBuilder from "../components/ProgramBuilder.jsx";
import { useAppTheme } from "../styles/appTheme";

export default function ProgramBuilderPage() {
  // Pont entre la Banque et le Builder
  const [selectedExercises, setSelectedExercises] = useState([]);
  const theme = useAppTheme();
  const pageBg = theme.pageBg;

  return (
    <Box bg={pageBg} w="100%" minH="calc(100vh - 0px)" /* Navbar/Footer gérés par App.jsx */>
      <Grid
        // 👉 Pleine largeur mobile, 2 colonnes seulement à partir de lg
        templateColumns={{ base: "1fr", lg: "360px 1fr" }}
        gap={{ base: 0, lg: 6 }}
        px={{ base: 0, md: 4 }}
        py={{ base: 2, md: 4 }}
        maxW="1400px"
        mx="auto"
      >
        {/* Colonne Banque — totalement retirée du flow en mobile */}
        <GridItem
          display={{ base: "none", lg: "block" }}
          minW={0}
          overflow="hidden"
        >
          <Box
            position="sticky"
            top={{ base: 0, md: 78 }} // petit décalage sous le header
            maxH="calc(100vh - 96px)"
            overflow="auto"
            px={0}
          >
            <ExerciseBank
              // onAdd pousse dans la sélection, le Builder intègre ensuite
              onAdd={(ex) => setSelectedExercises((prev) => [...prev, ex])}
              // on garde tes filtres/recherche internes de la banque
            />
          </Box>
        </GridItem>

        {/* Colonne Builder — occupe 100% sur mobile */}
        <GridItem minW={0}>
          <ProgramBuilder
            selectedExercises={selectedExercises}
            setSelectedExercises={setSelectedExercises}
          />
        </GridItem>
      </Grid>
    </Box>
  );
}
