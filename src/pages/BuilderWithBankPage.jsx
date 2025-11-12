// src/pages/BuilderWithBankPage.jsx
import React, { useState } from "react";
import {
  Box,
  Container,
  Grid,
  GridItem,
  IconButton,
  useDisclosure,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerCloseButton,
  DrawerBody,
  useColorModeValue,
} from "@chakra-ui/react";
import { MdLibraryBooks } from "react-icons/md";

import ProgramBuilder from "../components/ProgramBuilder";
import ExerciseBank from "../components/ExerciseBank";

export default function BuilderWithBankPage() {
  const bg = useColorModeValue("gray.50", "gray.900");
  const { isOpen, onOpen, onClose } = useDisclosure();

  // Pont banque -> builder
  const [selectedExercises, setSelectedExercises] = useState([]);
  const [replaceIndex, setReplaceIndex] = useState(null);

  const handleAdd = (payload) => {
    const arr = Array.isArray(payload) ? payload : [payload];
    setSelectedExercises(arr);
    onClose();
  };

  return (
    <Box bg={bg} minH="100vh" w="100%" overflowX="hidden">
      <Container
        maxW={{ base: "full", xl: "container.xl", "2xl": "7xl" }}
        px={{ base: 3, md: 6 }}
        py={{ base: 3, md: 6 }}
      >
        <Grid
          alignItems="start"
          columnGap={{ base: 0, lg: 8 }}
          // ⬅️ Sidebar FIXE 420px + builder élastique sans overflow
          templateColumns={{ base: "1fr", lg: "420px minmax(0, 1fr)" }}
        >
          {/* -------- BANQUE (desktop) -------- */}
          <GridItem display={{ base: "none", lg: "block" }} minW={0}>
            <Box
              position="sticky"
              top="80px"                               // sous la navbar
              maxH="calc(100dvh - 100px)"             // hauteur visible réelle
              overflowY="auto"
              overflowX="hidden"
              pr={2}
            >
              {/* Forcer largeur/contrainte interne pour éviter tout écrasement */}
              <Box
                w="100%"
                minW={0}
                sx={{
                  "& *": { maxWidth: "100%", minWidth: 0 },
                }}
              >
                <ExerciseBank onAdd={handleAdd} />
              </Box>
            </Box>
          </GridItem>

          {/* -------- BUILDER -------- */}
          <GridItem minW={0}>
            <Box
              w="100%"
              minW={0}
              // largeur max “confort” pour du formulaire lisible
              maxW={{ base: "100%", xl: "1200px", "2xl": "1300px" }}
            >
              <ProgramBuilder
                selectedExercises={selectedExercises}
                setSelectedExercises={setSelectedExercises}
                replaceIndex={replaceIndex}
                setReplaceIndex={setReplaceIndex}
              />
            </Box>
          </GridItem>
        </Grid>
      </Container>

      {/* -------- Bouton mobile pour ouvrir la banque -------- */}
      <IconButton
        aria-label="Ouvrir la banque d’exercices"
        icon={<MdLibraryBooks />}
        colorScheme="blue"
        position="fixed"
        right="20px"
        bottom="20px"
        borderRadius="full"
        size="lg"
        boxShadow="lg"
        display={{ base: "inline-flex", lg: "none" }}
        onClick={onOpen}
      />

      {/* -------- Drawer mobile (plein écran) -------- */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="full">
        <DrawerOverlay />
        <DrawerContent overflow="hidden">
          <DrawerCloseButton />
          <DrawerHeader>Banque d’exercices</DrawerHeader>
          <DrawerBody p={0} display="flex">
            <Box
              key={isOpen ? "bank-open" : "bank-closed"}
              w="100vw"
              h="100%"
              overflowY="auto"
            >
              <Box
                w="100%"
                minW={0}
                sx={{
                  "& *": { maxWidth: "100%", minWidth: 0 },
                }}
              >
                <ExerciseBank onAdd={handleAdd} />
              </Box>
            </Box>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}

