// src/pages/PlanParticulier.jsx
import React from 'react';
import {
  Box,
  Container,
  Heading,
  SimpleGrid,
  VStack,
  Text,
  Button,
  Badge,
  HStack,
  useColorModeValue,
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

export default function PlanParticulier() {
  // Color mode aware values
  const bgPage = useColorModeValue('gray.50', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.700');
  const textColor = useColorModeValue('gray.800', 'gray.100');
  const mutedText = useColorModeValue('gray.600', 'gray.300');
  const highlightBorder = useColorModeValue('blue.300', 'blue.500');

  return (
    <Box bg={bgPage} minH="100vh" py={16}>
      <Container maxW="container.lg">
        <Heading mb={8} textAlign="center" color={textColor}>
          Nos formules Particuliers
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
          {/* Essai 14 jours */}
          <Box
            bg={cardBg}
            boxShadow="md"
            borderRadius="lg"
            p={6}
            position="relative"
            display="flex"
            flexDir="column"
          >
            <Badge position="absolute" top={4} right={4} colorScheme="green">
              Essai 14 j
            </Badge>
            <Heading size="md" mb={4} color={textColor}>
              14 jours d’essai
            </Heading>
            <VStack align="start" spacing={2} color={mutedText}>
              <Text>✓ Accès complet à tous les programmes</Text>
              <Text>✓ Suivi personnalisé et rappels</Text>
              <Text>✓ Sans engagement, annulez à tout moment</Text>
            </VStack>
            <HStack mt="auto">
              <Button
                as={RouterLink}
                to="/register?plan=particulier&trial=14"
                colorScheme="green"
                isFullWidth
                size="md"
                variant="solid"
              >
                Commencer l’essai
              </Button>
            </HStack>
          </Box>

          {/* Achat unique */}
          <Box
            bg={cardBg}
            boxShadow="md"
            borderRadius="lg"
            p={6}
            display="flex"
            flexDir="column"
          >
            <Heading size="md" mb={4} color={textColor}>
              Achat unique
            </Heading>
            <VStack align="start" spacing={2} color={mutedText}>
              <Text>✓ Programme pré-établi : 29 €</Text>
              <Text ml={4}>Idéal pour débuter rapidement avec un programme standard.</Text>
              <Text>✓ Programme personnalisé : 89 €</Text>
              <Text ml={4}>Conçu sur-mesure selon vos objectifs spécifiques.</Text>
            </VStack>
            <HStack spacing={4} mt="auto">
              <Button
                as={RouterLink}
                to="/register?plan=particulier&purchase=predefined"
                colorScheme="blue"
                flex={1}
                variant="solid"
                size="md"
              >
                Acheter à 29 €
              </Button>
              <Button
                as={RouterLink}
                to="/register?plan=particulier&purchase=custom"
                colorScheme="green"
                flex={1}
                variant="solid"
                size="md"
              >
                Acheter à 89 €
              </Button>
            </HStack>
          </Box>

          {/* Abonnement - Populaire */}
          <Box
            bg={cardBg}
            boxShadow="lg"
            borderRadius="lg"
            p={6}
            position="relative"
            borderWidth="2px"
            borderColor={highlightBorder}
            display="flex"
            flexDir="column"
          >
            <Badge position="absolute" top={4} right={4} colorScheme="blue">
              Populaire
            </Badge>
            <Heading size="md" mb={4} color={textColor}>
              Abonnement
            </Heading>
            <VStack align="start" spacing={2} color={mutedText}>
              <Text>✓ Mensuel : 49 €/mois</Text>
              <Text ml={4}>Suivi régulier et mises à jour incluses.</Text>
              <Text>✓ Annuel : 490 €/an (2 mois offerts)</Text>
              <Text ml={4}>Meilleur tarif, engagement 12 mois.</Text>
            </VStack>
            <HStack spacing={4} mt="auto">
              <Button
                as={RouterLink}
                to="/register?plan=particulier&billing=monthly"
                colorScheme="blue"
                flex={1}
                variant="solid"
                size="md"
              >
                49€/mois
              </Button>
              <Button
                as={RouterLink}
                to="/register?plan=particulier&billing=annual"
                colorScheme="blue"
                flex={1}
                variant="outline"
                size="md"
              >
                490€/an
              </Button>
            </HStack>
          </Box>
        </SimpleGrid>
      </Container>
    </Box>
  );
}

