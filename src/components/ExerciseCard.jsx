// src/components/ExerciseCard.jsx
import React, { useRef, useState, useCallback, useMemo } from "react";
import {
  Box,
  Button,
  Image,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Grid,
  GridItem,
  List,
  ListItem,
  ListIcon,
  useColorModeValue,
  HStack,
  Tag,
  TagLabel,
  Icon,
} from "@chakra-ui/react";
import { InfoOutlineIcon, AddIcon } from "@chakra-ui/icons";
import {
  MdFitnessCenter,
  MdOutlineHealing,
  MdOutlineMenuBook,
  MdCheckCircle,
  MdSwapHoriz,
  MdWarning,
  MdOutlineLink,
  MdDirectionsRun,
  MdAccessibilityNew,
  MdAirlineSeatReclineNormal,
  MdSportsGymnastics,
  MdSelfImprovement,
  MdBackHand,
  MdFitnessCenter as MdArm,
  MdAir,
} from "react-icons/md";
import { FaDumbbell } from "react-icons/fa";
import { GiLeg, GiAbdominalArmor, GiShoulderArmor, GiChestArmor, GiSpineArrow } from "react-icons/gi";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

/* ================= helpers ================= */
const safeArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/* ✅ icône selon groupe musculaire */
const muscleIconFromGroup = (groupRaw) => {
  const g = norm(groupRaw);

  // jambes
  if (
    ["jambes", "legs", "quadriceps", "quads", "ischio-jambiers", "ischio jambiers", "hamstrings", "adducteurs", "adductors", "fessiers", "glutes", "mollets", "calves"].some((k) =>
      g.includes(k)
    )
  )
    return GiLeg;

  // abdos
  if (["abdominaux", "abs", "core", "transverse", "obliques"].some((k) => g.includes(k))) return GiAbdominalArmor;

  // pectoraux
  if (["pectoraux", "chest", "pecs"].some((k) => g.includes(k))) return GiChestArmor;

  // dos / dorsaux / trapèzes / lombaires
  if (["dos", "back", "dorsaux", "lats", "trap", "trapezes", "trapèzes", "lombaires", "lower back"].some((k) => g.includes(k)))
    return GiSpineArrow;

  // épaules / deltoïdes
  if (["epaules", "épaules", "shoulders", "deltoides", "deltoïdes", "delts"].some((k) => g.includes(k))) return GiShoulderArmor;

  // bras (biceps / triceps / avant-bras)
  if (["biceps", "triceps", "avant-bras", "avant bras", "forearms"].some((k) => g.includes(k))) return MdArm;

  // cardio / full body
  if (["cardio", "endurance", "hiit", "full body", "fullbody", "full-body"].some((k) => g.includes(k))) return MdDirectionsRun;

  // mobilité / stretching
  if (["mobilite", "mobilité", "mobility", "stretching", "etirement", "etirements"].some((k) => g.includes(k))) return MdSelfImprovement;

  return FaDumbbell; // fallback
};

function ExerciseCardComponent({
  exercise,
  onAdd,
  onReplace,
  replaceMode = false,
  isTarget = false,
  onCancelReplace,
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isProgramBuilder = useMemo(() => pathname.includes("/program-builder"), [pathname]);

  const [isOpen, setIsOpen] = useState(false);
  const addingRef = useRef(false);

  /* ================= UI ================= */
  const bg = useColorModeValue("white", "gray.800");
  const border = useColorModeValue("blackAlpha.100", "whiteAlpha.200");
  const text = useColorModeValue("gray.900", "gray.50");
  const muted = useColorModeValue("gray.600", "gray.300");
  const chipBg = useColorModeValue("gray.100", "whiteAlpha.100");

  const primaryBtnBg = useColorModeValue("blue.600", "blue.400");
  const primaryBtnHover = useColorModeValue("blue.700", "blue.500");
  const ghostBtnBg = useColorModeValue("gray.50", "whiteAlpha.100");
  const ghostBtnHover = useColorModeValue("gray.100", "whiteAlpha.200");

  /* ================= DATA ================= */
  const missing = t("exerciseCard.missing", "Données manquantes");
  const name = exercise?.nom || t("exerciseCard.missingName", "Nom manquant");

  const gmArr = safeArr(exercise?.groupe_musculaire);
  const groupe = gmArr.length ? gmArr[0] : missing;

  const materielArr = safeArr(exercise?.materiel);
  const materiel = materielArr.length ? materielArr[0] : t("exerciseCard.none", "Aucun");

  const niveau =
    typeof exercise?.niveau === "string" && exercise.niveau.trim()
      ? exercise.niveau.trim()
      : t("exerciseCard.allLevels", "Tous niveaux");

  const articulationsList = exercise?.articulations_solicitees ?? exercise?.articulations_sollicitees;
  const articulations =
    Array.isArray(articulationsList) && articulationsList.length ? articulationsList.join(", ") : missing;

  const ligaments =
    Array.isArray(exercise?.tendons_solicites) && exercise.tendons_solicites.length
      ? exercise.tendons_solicites.join(", ")
      : missing;

  const musclesSecondaires =
    Array.isArray(exercise?.muscles_secondaires) && exercise.muscles_secondaires.length
      ? exercise.muscles_secondaires.join(", ")
      : missing;

  const variantes =
    Array.isArray(exercise?.variantes) && exercise.variantes.length
      ? exercise.variantes.join(", ")
      : t("exerciseCard.noVariant", "Aucune variante disponible");

  const contraintes = Array.isArray(exercise?.contraintes)
    ? exercise.contraintes.length
      ? exercise.contraintes.join(", ")
      : t("exerciseCard.noConstraints", "Aucune contrainte spécifiée")
    : exercise?.contraintes || t("exerciseCard.noConstraints", "Aucune contrainte spécifiée");

  const hasImage = Boolean(exercise?.image && String(exercise.image).trim());

  // ✅ Icone dynamique
  const MuscleIcon = useMemo(() => muscleIconFromGroup(groupe), [groupe]);

  /* ================= ACTION BTN (builder only) ================= */
  let label = t("exerciseCard.add", "Ajouter");
  let leftIcon = <AddIcon />; // ✅ plus clean que "+"
  if (replaceMode) {
    leftIcon = <MdSwapHoriz />;
    label = isTarget ? t("exerciseCard.cancel", "Annuler") : t("exerciseCard.replace", "Remplacer");
  }

  const fireAction = useCallback(() => {
    if (addingRef.current) return;
    addingRef.current = true;
    try {
      if (replaceMode) {
        if (isTarget && onCancelReplace) onCancelReplace();
        else if (onReplace) onReplace(exercise);
      } else if (onAdd) {
        onAdd({ ...exercise });
      }
    } finally {
      setTimeout(() => (addingRef.current = false), 150);
    }
  }, [replaceMode, isTarget, onCancelReplace, onReplace, onAdd, exercise]);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fireAction();
  };
  const handlePointerUp = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fireAction();
  };
  const openDetails = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  return (
    <Box
      bg={bg}
      border="1px solid"
      borderColor={border}
      borderRadius="xl"
      px={3}
      py={2.5}
      boxShadow="none"
      transition="all .12s ease"
      _hover={{ borderColor: useColorModeValue("blackAlpha.200", "whiteAlpha.300") }}
      color={text}
    >
      {/* ===== Ligne principale ultra compacte ===== */}
      <HStack spacing={3} align="center">
        {/* ✅ initiale => icône muscle (ou image si dispo) */}
        <Box
          w="34px"
          h="34px"
          borderRadius="lg"
          bg={chipBg}
          border="1px solid"
          borderColor={border}
          overflow="hidden"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flex="0 0 auto"
        >
          {hasImage ? (
            <Image
              src={exercise.image}
              alt={name}
              boxSize="34px"
              objectFit="cover"
              draggable={false}
              pointerEvents="none"
            />
          ) : (
            <Icon as={MuscleIcon} boxSize={5} opacity={0.9} />
          )}
        </Box>

        <Box flex="1" minW={0}>
          {/* ✅ MODIF ICI : afficher le nom en entier (wrap) */}
          <Text
            fontWeight="800"
            fontSize="sm"
            whiteSpace="normal"
            wordBreak="break-word"
            lineHeight="1.2"
          >
            {name}
          </Text>

          <Text fontSize="xs" color={muted} noOfLines={1}>
            {groupe}
          </Text>
        </Box>

        {/* ✅ badge matériel à droite */}
        <HStack spacing={2} flex="0 0 auto">
          <Tag size="sm" borderRadius="full" bg={chipBg} border="1px solid" borderColor={border}>
            <TagLabel noOfLines={1}>{materiel}</TagLabel>
          </Tag>
        </HStack>
      </HStack>

      {/* ===== Meta ===== */}
      <Text mt={2} fontSize="xs" color={muted} noOfLines={1}>
        {niveau} • {t("exerciseCard.meta.fast", "Voir détails pour consignes")}
      </Text>

      {/* ===== Boutons ===== */}
      <HStack spacing={2} mt={2.5}>
        {isProgramBuilder && (
          <Button
            leftIcon={leftIcon}
            onClick={handleClick}
            onPointerUp={handlePointerUp}
            onTouchEnd={handlePointerUp}
            h="32px"
            px={4}
            borderRadius="full"
            bg={primaryBtnBg}
            color="white"
            fontWeight="800"
            fontSize="sm"
            _hover={{ bg: primaryBtnHover }}
            _active={{ transform: "scale(0.99)" }}
            type="button"
            flex="1"
          >
            {label}
          </Button>
        )}

        <Button
          leftIcon={<InfoOutlineIcon boxSize={4} />}
          onClick={openDetails}
          onPointerUp={openDetails}
          onTouchEnd={openDetails}
          h="32px"
          px={4}
          borderRadius="full"
          bg={ghostBtnBg}
          fontWeight="800"
          fontSize="sm"
          _hover={{ bg: ghostBtnHover }}
          _active={{ transform: "scale(0.99)" }}
          type="button"
          flex="1"
        >
          {t("exerciseCard.details", "Détails")}
        </Button>
      </HStack>

      {/* ===== Modal ===== */}
      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} isCentered size="lg">
        <ModalOverlay />
        <ModalContent borderRadius="2xl" bg={bg} color={text} overflow="hidden">
          <ModalHeader fontWeight="900">{name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Grid templateColumns="30px 1fr" gap={3}>
              <GridItem>
                <MdFitnessCenter size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="800">{t("exerciseCard.fields.mainGroup", "Groupe musculaire")} :</Text>
                <Text color={muted}>{gmArr.length ? gmArr.join(", ") : missing}</Text>
              </GridItem>

              <GridItem>
                <MdFitnessCenter size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="800">{t("exerciseCard.fields.secondary", "Muscles secondaires")} :</Text>
                <Text color={muted}>{musclesSecondaires}</Text>
              </GridItem>

              <GridItem>
                <MdOutlineHealing size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="800">{t("exerciseCard.fields.joints", "Articulations sollicitées")} :</Text>
                <Text color={muted}>{articulations}</Text>
              </GridItem>

              <GridItem>
                <MdOutlineLink size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="800">{t("exerciseCard.fields.ligaments", "Ligaments sollicités")} :</Text>
                <Text color={muted}>{ligaments}</Text>
              </GridItem>

              <GridItem>
                <MdSwapHoriz size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="800">{t("exerciseCard.fields.variants", "Variantes")} :</Text>
                <Text color={muted}>{variantes}</Text>
              </GridItem>

              <GridItem>
                <MdWarning size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="800" color="red.500">
                  {t("exerciseCard.fields.constraints", "Contraintes")} :
                </Text>
                <Text color={muted}>{contraintes}</Text>
              </GridItem>

              <GridItem>
                <MdOutlineMenuBook size={20} />
              </GridItem>
              <GridItem>
                <Text fontWeight="900">{t("exerciseCard.fields.cues", "Consignes d'exécution")} :</Text>
                {exercise?.consignes && Object.keys(exercise.consignes).length > 0 ? (
                  <List spacing={2} mt={2}>
                    {Object.entries(exercise.consignes).map(([key, val], i) => (
                      <ListItem key={i} display="flex" alignItems="start">
                        <ListIcon as={MdCheckCircle} color="green.500" mt="2px" />
                        <Text>
                          <strong>{key} :</strong> {val}
                        </Text>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Text color={muted}>{missing}</Text>
                )}
              </GridItem>
            </Grid>
          </ModalBody>
        </ModalContent>
      </Modal>
    </Box>
  );
}

export default React.memo(
  ExerciseCardComponent,
  (prev, next) =>
    prev.exercise?.id === next.exercise?.id &&
    prev.replaceMode === next.replaceMode &&
    prev.isTarget === next.isTarget
);
