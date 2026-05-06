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
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { useAppTheme } from "../styles/appTheme";

export default function PlanParticulier() {
  const theme = useAppTheme();

  return (
    <Box bg={theme.pageBg} minH="100vh" py={{ base: 6, md: 10 }} px={{ base: 4, md: 6 }}>
      <Container maxW="container.lg">
        <Heading mb={8} textAlign="center" color={theme.textColor}>
          Nos formules Particuliers
        </Heading>

        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
          {/* Essai 14 jours */}
          <Box
            {...theme.cardProps}
            p={6}
            position="relative"
            display="flex"
            flexDir="column"
          >
            <Badge position="absolute" top={4} right={4} colorScheme="green">
              Essai 14 j
            </Badge>
            <Heading size="md" mb={4} color={theme.textColor}>
              14 jours d’essai
            </Heading>
            <VStack align="start" spacing={2} color={theme.mutedText}>
              <Text>✓ Accès complet à tous les programmes</Text>
              <Text>✓ Suivi personnalisé et rappels</Text>
              <Text>✓ Sans engagement, annulez à tout moment</Text>
            </VStack>
            <HStack mt="auto">
              <Button
                as={RouterLink}
                to="/register?plan=particulier&trial=14"
                {...theme.primaryButtonProps}
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
            {...theme.cardProps}
            p={6}
            display="flex"
            flexDir="column"
          >
            <Heading size="md" mb={4} color={theme.textColor}>
              Achat unique
            </Heading>
            <VStack align="start" spacing={2} color={theme.mutedText}>
              <Text>✓ Programme pré-établi : 29 €</Text>
              <Text ml={4}>Idéal pour débuter rapidement avec un programme standard.</Text>
              <Text>✓ Programme personnalisé : 89 €</Text>
              <Text ml={4}>Conçu sur-mesure selon vos objectifs spécifiques.</Text>
            </VStack>
            <HStack spacing={4} mt="auto">
              <Button
                as={RouterLink}
                to="/register?plan=particulier&purchase=predefined"
                {...theme.primaryButtonProps}
                flex={1}
                variant="solid"
                size="md"
              >
                Acheter à 29 €
              </Button>
              <Button
                as={RouterLink}
                to="/register?plan=particulier&purchase=custom"
                {...theme.primaryButtonProps}
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
            {...theme.cardProps}
            p={6}
            position="relative"
            borderWidth="2px"
            borderColor={theme.borderStrong}
            display="flex"
            flexDir="column"
          >
            <Badge position="absolute" top={4} right={4} colorScheme="blue">
              Populaire
            </Badge>
            <Heading size="md" mb={4} color={theme.textColor}>
              Abonnement
            </Heading>
            <VStack align="start" spacing={2} color={theme.mutedText}>
              <Text>✓ Mensuel : 49 €/mois</Text>
              <Text ml={4}>Suivi régulier et mises à jour incluses.</Text>
              <Text>✓ Annuel : 490 €/an (2 mois offerts)</Text>
              <Text ml={4}>Meilleur tarif, engagement 12 mois.</Text>
            </VStack>
            <HStack spacing={4} mt="auto">
              <Button
                as={RouterLink}
                to="/register?plan=particulier&billing=monthly"
                {...theme.primaryButtonProps}
                flex={1}
                variant="solid"
                size="md"
              >
                49€/mois
              </Button>
              <Button
                as={RouterLink}
                to="/register?plan=particulier&billing=annual"
                {...theme.primaryButtonProps}
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
