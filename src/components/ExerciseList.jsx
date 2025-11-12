import React, { useState, useEffect } from "react";
import { Box, Flex, Input, Button, useColorMode, Card, Text, Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalCloseButton, VStack, HStack, Image } from "@chakra-ui/react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { FaSun, FaMoon } from "react-icons/fa";
import jsPDF from "jspdf";

const exercisesData = [
  { id: "1", name: "Squat", image: "squat.jpg", details: "Séries: 3, Répétitions: 12, Repos: 60s" },
  { id: "2", name: "Développé couché", image: "benchpress.jpg", details: "Séries: 4, Répétitions: 10, Repos: 90s" },
  { id: "3", name: "Tractions", image: "pullup.jpg", details: "Séries: 3, Répétitions: 8, Repos: 60s" },
];

const ExerciseList = () => {
  const { colorMode, toggleColorMode } = useColorMode();
  const [search, setSearch] = useState("");
  const [program, setProgram] = useState([]);
  const [selectedExercise, setSelectedExercise] = useState(null);

  useEffect(() => {
    const savedProgram = JSON.parse(localStorage.getItem("workoutProgram"));
    if (savedProgram) {
      setProgram(savedProgram);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("workoutProgram", JSON.stringify(program));
  }, [program]);

  const filteredExercises = exercisesData.filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase())
  );

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const items = Array.from(program);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setProgram(items);
  };

  const addToProgram = (exercise) => {
    setProgram([...program, exercise]);
  };

  return (
    <Flex h="90vh" gap={4} p={4}>
      {/* Colonne des exercices disponibles */}
      <Box w="50%" p={4} overflowY="auto" maxH="100%" border="1px solid #ccc" borderRadius="md" boxShadow="md">
        <Flex justify="space-between" mb={4}>
          <Input
            placeholder="Rechercher un exercice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button onClick={toggleColorMode} ml={2}>
            {colorMode === "light" ? <FaMoon /> : <FaSun />}
          </Button>
        </Flex>
        <VStack spacing={4} align="stretch">
          {filteredExercises.map((exercise) => (
            <Card key={exercise.id} p={3}>
              <HStack align="center" spacing={4}>
                <Image src={exercise.image} boxSize="50px" objectFit="cover" borderRadius="md" />
                <Box>
                  <Text fontWeight="bold">{exercise.name}</Text>
                  <HStack mt={2}>
                    <Button size="sm" colorScheme="blue" onClick={() => addToProgram(exercise)}>Ajouter</Button>
                    <Button size="sm" colorScheme="gray" onClick={() => setSelectedExercise(exercise)}>Voir détails</Button>
                  </HStack>
                </Box>
              </HStack>
            </Card>
          ))}
        </VStack>
      </Box>

      {/* Colonne du programme en cours */}
      <Box w="50%" p={4} overflowY="auto" maxH="100%" border="1px solid #ccc" borderRadius="md" boxShadow="md">
        <Text fontSize="xl" fontWeight="bold" mb={4}>Programme en cours</Text>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="program">
            {(provided) => (
              <Box ref={provided.innerRef} {...provided.droppableProps}>
                <VStack spacing={3} align="stretch">
                  {program.map((exercise, index) => (
                    <Draggable key={exercise.id} draggableId={exercise.id} index={index}>
                      {(provided) => (
                        <Card ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} p={3}>
                          <HStack justify="space-between">
                            <Box>
                              <Text fontWeight="bold">{exercise.name}</Text>
                              <Text fontSize="sm">{exercise.details}</Text>
                            </Box>
                          </HStack>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </VStack>
              </Box>
            )}
          </Droppable>
        </DragDropContext>
      </Box>

      {/* Modal d'affichage des détails */}
      {selectedExercise && (
        <Modal isOpen={true} onClose={() => setSelectedExercise(null)}>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{selectedExercise.name}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <Text><strong>Détails :</strong> {selectedExercise.details}</Text>
            </ModalBody>
          </ModalContent>
        </Modal>
      )}
    </Flex>
  );
};

export default ExerciseList;
