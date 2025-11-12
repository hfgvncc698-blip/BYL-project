// src/pages/PremiumPrograms.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Heading, SimpleGrid, Text, Button, useToast,
  Skeleton, useColorModeValue, VStack, HStack, Image, Badge, Divider, List, ListItem
} from "@chakra-ui/react";
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebaseConfig";
import { collection, getDocs, query, where } from "firebase/firestore";
import { MdOutlineAccessTime, MdFitnessCenter } from "react-icons/md";

// ---------- Helpers ----------
function formatPrice(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return null;
  return num.toFixed(2).replace(".", ",") + " €";
}
const pick = (a, b) => (a ?? b ?? null); // util pour fallback FR/EN

// ---------- Modal Détails ----------
function ProgramDetailsModal({ isOpen, onClose, program, onBuy }) {
  const border = useColorModeValue("gray.200", "gray.700");
  const muted = useColorModeValue("gray.600", "gray.300");

  if (!program) return null;

  const goal = pick(program.goal, program.objectif);
  const level = pick(program.level, program.niveauSportif);
  const sessions = pick(program.sessionsPerWeek, program.nbSeances);
  const durMin = program.durationPerSessionMin ?? 45;
  const durWeeks = program.durationWeeks ?? null;
  const location = program.location ?? null;
  const materiel = Array.isArray(program.materiel) ? program.materiel : (program.materiel ? [program.materiel] : []);
  const hasPromo = Boolean(program?.isPromo && program?.promoPriceEUR);
  const normal = formatPrice(program?.priceEUR);
  const promo = formatPrice(program?.promoPriceEUR);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent overflow="hidden" rounded="2xl">
        <ModalHeader>{program.name || program.nomProgramme || "Programme Premium"}</ModalHeader>
        <ModalCloseButton />

        <ModalBody>
          {program.imageUrl && (
            <Image
              src={program.imageUrl}
              alt={program.name || program.nomProgramme}
              w="100%"
              h="180px"
              objectFit="cover"
              rounded="md"
              mb={4}
            />
          )}

          {/* Badges clés */}
          <HStack spacing={2} mb={3} wrap="wrap">
            {goal && <Badge colorScheme="purple">{goal}</Badge>}
            {level && <Badge>{level}</Badge>}
            {location && <Badge variant="subtle">{location}</Badge>}
            {sessions && (
              <Badge variant="outline"><MdFitnessCenter style={{ marginRight: 4 }} /> {sessions} / sem</Badge>
            )}
            {durMin && (
              <Badge variant="outline"><MdOutlineAccessTime style={{ marginRight: 4 }} /> {durMin} min</Badge>
            )}
            {durWeeks && <Badge variant="outline">{durWeeks} sem</Badge>}
          </HStack>

          {/* Prix */}
          <HStack mb={3}>
            {hasPromo && promo ? (
              <>
                {normal && <Text as="s" color={muted}>{normal}</Text>}
                <Text fontWeight="bold" fontSize="xl" color="blue.400">{promo}</Text>
              </>
            ) : (
              <Text fontWeight="bold" fontSize="xl" color="blue.400">
                {normal || "Prix affiché sur Stripe"}
              </Text>
            )}
          </HStack>

          {/* Descriptions */}
          <Text color={muted} mb={3}>
            {program.shortDesc || "Programme structuré, prêt à démarrer."}
          </Text>
          {program.longDescription && (
            <Text mb={4}>{program.longDescription}</Text>
          )}

          {/* Matériel */}
          {materiel.length > 0 && (
            <>
              <Heading size="sm" mb={2}>Matériel requis</Heading>
              <HStack spacing={2} mb={4} wrap="wrap">
                {materiel.map((m, i) => <Badge key={i} variant="subtle">{m}</Badge>)}
              </HStack>
            </>
          )}

          {/* Semaine type */}
          {Array.isArray(program.weekStructure) && program.weekStructure.length > 0 && (
            <>
              <Heading size="sm" mb={2}>Semaine type</Heading>
              <Box borderWidth="1px" borderColor={border} rounded="lg" p={3} mb={4}>
                <List spacing={2}>
                  {program.weekStructure.map((d, i) => (
                    <ListItem key={i}>
                      <Text as="span" fontWeight="semibold">{d.day} — {d.title}</Text>
                      {Array.isArray(d.focus) && d.focus.length > 0 && (
                        <Text as="span" color={muted}> : {d.focus.join(", ")}</Text>
                      )}
                    </ListItem>
                  ))}
                </List>
              </Box>
            </>
          )}

          {/* Bénéfices */}
          {Array.isArray(program.benefits) && program.benefits.length > 0 && (
            <>
              <Heading size="sm" mb={2}>Points forts</Heading>
              <List spacing={1} styleType="disc" pl={5} mb={2}>
                {program.benefits.map((b, i) => <ListItem key={i}>{b}</ListItem>)}
              </List>
            </>
          )}
        </ModalBody>

        <Divider />
        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
            <Button colorScheme="blue" onClick={() => onBuy(program)}>Acheter</Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ---------- Page ----------
export default function PremiumPrograms() {
  const toast = useToast();
  const navigate = useNavigate();

  const cardBg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("gray.200", "gray.700");
  const pageBg = useColorModeValue("gray.50", "gray.900");

  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);

  // état du modal
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const openModal = (prog) => { setSelected(prog); setIsOpen(true); };
  const closeModal = () => { setIsOpen(false); setSelected(null); };

  // ----------- Load Premium programs from Firestore (sans index composite)
  useEffect(() => {
    const run = async () => {
      try {
        const col = collection(db, "programmes");
        const q = query(col, where("origine", "==", "premium")); // filtre minimal
        const snap = await getDocs(q);

        const rows = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(p => (p?.isActive ?? true) && (p?.isPremiumOnly ?? true))
          .sort((a, b) => (a?.featuredRank ?? 999) - (b?.featuredRank ?? 999));

        setPrograms(rows);
      } catch (err) {
        console.error(err);
        toast({ description: "Impossible de charger les programmes premium.", status: "error" });
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [toast]);

  // ----------- Stripe checkout
  const handleBuyProgram = async (prog) => {
    try {
      const usePromo = Boolean(prog?.isPromo && prog?.promoPriceEUR);
      const amountEUR = usePromo ? prog.promoPriceEUR : prog.priceEUR;

      const res = await fetch("http://localhost:5000/api/payments/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          mode: "payment",
          type: "premium",
          programId: prog.id,
          slug: prog.slug || null,
          stripePriceId: prog.stripePriceId || null,
          amountEUR,
          meta: {
            origine: prog.origine || "premium",
            catalog: prog.catalog || "premium",
            isPromo: usePromo,
            priceEUR: prog.priceEUR ?? null,
            promoPriceEUR: prog.promoPriceEUR ?? null
          },
        }),
      });

      const data = await res.json();
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data?.error || "Erreur inconnue.");
      }
    } catch (err) {
      toast({ description: "Erreur lors du paiement : " + err.message, status: "error", duration: 6000 });
    }
  };

  const handleViewRoute = (prog) => navigate(`/premium/${prog.slug || prog.id}`);

  const grid = useMemo(() => {
    if (loading) {
      return (
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
          <Skeleton h="280px" rounded="2xl" />
          <Skeleton h="280px" rounded="2xl" display={{ base: "none", md: "block" }} />
          <Skeleton h="280px" rounded="2xl" display={{ base: "none", md: "block" }} />
        </SimpleGrid>
      );
    }

    return (
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={8}>
        {programs.map((prog) => {
          const hasPromo = Boolean(prog?.isPromo && prog?.promoPriceEUR);
          const normal = formatPrice(prog?.priceEUR);
          const promo = formatPrice(prog?.promoPriceEUR);

          return (
            <Box
              key={prog.id}
              p={0}
              borderRadius="2xl"
              boxShadow="md"
              bg={cardBg}
              borderWidth="1px"
              borderColor={border}
              overflow="hidden"
              display="flex"
              flexDirection="column"
            >
              {prog.imageUrl && (
                <Image
                  src={prog.imageUrl}
                  alt={prog.name || prog.nomProgramme || "Programme Premium"}
                  w="100%"
                  h="160px"
                  objectFit="cover"
                />
              )}

              <Box p={6} display="flex" flexDirection="column" flex="1">
                <HStack mb={3} spacing={2} wrap="wrap">
                  {pick(prog.goal, prog.objectif) && <Badge colorScheme="purple">{pick(prog.goal, prog.objectif)}</Badge>}
                  {pick(prog.level, prog.niveauSportif) && <Badge>{pick(prog.level, prog.niveauSportif)}</Badge>}
                  {prog.location && <Badge variant="subtle">{prog.location}</Badge>}
                  {pick(prog.sessionsPerWeek, prog.nbSeances) && (
                    <Badge variant="outline">{pick(prog.sessionsPerWeek, prog.nbSeances)} / sem</Badge>
                  )}
                </HStack>

                <Heading size="md" mb={2}>
                  {prog.name || prog.nomProgramme || "Programme Premium"}
                </Heading>

                <Text color={useColorModeValue("gray.600", "gray.300")} mb={4}>
                  {prog.shortDesc || "Programme structuré, prêt à démarrer."}
                </Text>

                <HStack mt="auto" justify="space-between" align="center">
                  <Box>
                    {hasPromo && promo ? (
                      <HStack spacing={2} align="baseline">
                        {normal && <Text as="s" fontSize="md" color={useColorModeValue("gray.500", "gray.400")}>{normal}</Text>}
                        <Text fontWeight="bold" fontSize="xl" color="blue.400">{promo}</Text>
                      </HStack>
                    ) : (
                      <Text fontWeight="bold" fontSize="xl" color="blue.400">
                        {normal || "Prix affiché sur Stripe"}
                      </Text>
                    )}
                  </Box>

                  <HStack>
                    {/* Ouvre le modal détails */}
                    <Button variant="outline" borderRadius="xl" onClick={() => openModal(prog)}>
                      Détails
                    </Button>
                    <Button colorScheme="blue" borderRadius="xl" onClick={() => handleBuyProgram(prog)}>
                      Acheter
                    </Button>
                  </HStack>
                </HStack>

                {/* Lien vers une page détail (optionnel) */}
                {/* <Button mt={3} variant="ghost" size="sm" onClick={() => handleViewRoute(prog)}>Voir la page</Button> */}
              </Box>
            </Box>
          );
        })}
      </SimpleGrid>
    );
  }, [loading, programs, cardBg, border]);

  return (
    <Box bg={pageBg} minH="100vh">
      <Box maxW="container.xl" mx="auto" py={{ base: 10, md: 12 }} px={{ base: 4, md: 6 }}>
        <VStack spacing={2} mb={8}>
          <Heading size="xl" textAlign="center">Programmes Premium</Heading>
          <Text color={useColorModeValue("gray.500", "gray.300")} textAlign="center">
            Des programmes prêts à l’emploi, conçus par BoostYourLife.
          </Text>
        </VStack>

        {grid}
      </Box>

      <ProgramDetailsModal
        isOpen={isOpen}
        onClose={closeModal}
        program={selected}
        onBuy={handleBuyProgram}
      />
    </Box>
  );
}

