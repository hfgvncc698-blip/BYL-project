// src/components/ExerciseCard.jsx
import React, { useRef, useState, useCallback } from "react";
import {
  Box, Button, Image, Text, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalBody, ModalCloseButton, Grid, GridItem, List,
  ListItem, ListIcon, useColorModeValue, HStack
} from "@chakra-ui/react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  MdFitnessCenter, MdOutlineHealing, MdOutlineMenuBook, MdCheckCircle,
  MdSwapHoriz, MdWarning, MdOutlineLink
} from "react-icons/md";
import { useTranslation } from "react-i18next";

function ExerciseCardComponent({
  exercise,
  onAdd,
  onReplace,
  replaceMode = false,
  isTarget = false,
  onCancelReplace
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const addingRef = useRef(false);

  const cardBg = useColorModeValue("gray.100", "gray.700");
  const textColor = useColorModeValue("gray.800", "gray.200");
  const btnBg = useColorModeValue("white", "gray.600");
  const btnTextColor = useColorModeValue("gray.800", "gray.100");

  // Texte & icône du bouton principal
  let label = t("exerciseCard.add", "Ajouter");
  let leftIcon = <span style={{ fontSize: "1.2em", color: btnTextColor }}>➕</span>;
  if (replaceMode) {
    leftIcon = <MdSwapHoriz />;
    label = isTarget ? t("exerciseCard.cancel", "Annuler") : t("exerciseCard.replace", "Remplacer");
  }

  // ——— Handler robuste: click + touch + pointer, anti double-tap ———
  const fireAction = useCallback(() => {
    if (addingRef.current) return;
    addingRef.current = true;
    try {
      if (replaceMode) {
        if (isTarget && onCancelReplace) onCancelReplace();
        else if (onReplace) onReplace(exercise);
      } else if (onAdd) {
        onAdd({ ...exercise }); // éviter mutation partagée
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
    // iOS/Chrome mobile: certains onClick ne montent pas -> fallback pointer/touch
    e.preventDefault();
    e.stopPropagation();
    fireAction();
  };

  const sharedButtonStyles = {
    type: "button",
    bg: btnBg,
    color: btnTextColor,
    borderRadius: "full",
    size: "md",
    minW: "110px",
    fontWeight: "bold",
    boxShadow: "md",
    border: isTarget ? "2px solid #3182ce" : undefined,
    variant: "ghost",
    _hover: { bg: useColorModeValue("gray.50", "gray.500"), transform: "scale(1.04)" }
  };

  const missing = t("exerciseCard.missing", "Données manquantes");
  const name = exercise.nom || t("exerciseCard.missingName", "Nom manquant");

  const gmArr = Array.isArray(exercise.groupe_musculaire)
    ? exercise.groupe_musculaire
    : (exercise.groupe_musculaire ? [exercise.groupe_musculaire] : []);
  const groupeMusculaire = gmArr.length ? gmArr.join(", ") : missing;

  const musclesSecondaires = Array.isArray(exercise.muscles_secondaires) && exercise.muscles_secondaires.length
    ? exercise.muscles_secondaires.join(", ")
    : missing;

  // différentes orthographes possibles dans la base
  const articulationsList = exercise.articulations_solicitees ?? exercise.articulations_sollicitees;
  const articulations = Array.isArray(articulationsList) && articulationsList.length
    ? articulationsList.join(", ")
    : missing;

  const ligaments = Array.isArray(exercise.tendons_solicites) && exercise.tendons_solicites.length
    ? exercise.tendons_solicites.join(", ")
    : missing;

  const variantes = Array.isArray(exercise.variantes) && exercise.variantes.length
    ? exercise.variantes.join(", ")
    : t("exerciseCard.noVariant", "Aucune variante disponible");

  const contraintes = Array.isArray(exercise.contraintes)
    ? (exercise.contraintes.length ? exercise.contraintes.join(", ") : t("exerciseCard.noConstraints", "Aucune contrainte spécifiée"))
    : (exercise.contraintes || t("exerciseCard.noConstraints", "Aucune contrainte spécifiée"));

  const cardMaxH = 300; // pour garder des cartes homogènes dans la grille

  return (
    <Box
      borderWidth="2px"
      borderRadius="xl"
      borderColor={useColorModeValue("gray.300", "gray.600")}
      bg={cardBg}
      p={3}
      textAlign="center"
      color={textColor}
      boxShadow="sm"
      transition="all 0.2s"
      _hover={{ boxShadow: "md", transform: "scale(1.02)" }}
      display="flex"
      flexDirection="column"
      alignItems="center"
      overflowY="auto"
      maxHeight={`${cardMaxH}px`}
    >
      <Image
        src={exercise.image || "placeholder.png"}
        alt={name}
        borderRadius="md"
        mb={2}
        boxSize="60px"
        objectFit="contain"
        draggable={false}
        pointerEvents="none"
      />

      <Text fontWeight="bold" fontSize="md" mb={2} color={textColor} noOfLines={2}>
        {name}
      </Text>

      <HStack mt={2} spacing={2} w="100%" maxW="260px" mx="auto" justifyContent="center">
        <Button
          {...sharedButtonStyles}
          leftIcon={leftIcon}
          onClick={handleClick}
          onPointerUp={handlePointerUp}
          onTouchEnd={handlePointerUp}
          flex="1"
        >
          <span style={{ color: !replaceMode ? btnTextColor : undefined, fontWeight: "bold" }}>
            {label}
          </span>
        </Button>

        <Button
          {...sharedButtonStyles}
          leftIcon={<InfoOutlineIcon boxSize={4} />}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(true); }}
          onPointerUp={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(true); }}
          onTouchEnd={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(true); }}
          flex="1"
        >
          {t("exerciseCard.details", "Détails")}
        </Button>
      </HStack>

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="xl" bg={cardBg} color={textColor}>
          <ModalHeader>{name}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Grid templateColumns="30px 1fr" gap={3}>
              <GridItem><MdFitnessCenter size={20} /></GridItem>
              <GridItem>
                <Text fontWeight="bold">{t("exerciseCard.fields.mainGroup", "Groupe musculaire")} :</Text>
                <Text>{groupeMusculaire}</Text>
              </GridItem>

              <GridItem><MdFitnessCenter size={20} /></GridItem>
              <GridItem>
                <Text fontWeight="bold">{t("exerciseCard.fields.secondary", "Muscles secondaires")} :</Text>
                <Text>{musclesSecondaires}</Text>
              </GridItem>

              <GridItem><MdOutlineHealing size={20} /></GridItem>
              <GridItem>
                <Text fontWeight="bold">{t("exerciseCard.fields.joints", "Articulations sollicitées")} :</Text>
                <Text>{articulations}</Text>
              </GridItem>

              <GridItem><MdOutlineLink size={20} /></GridItem>
              <GridItem>
                <Text fontWeight="bold">{t("exerciseCard.fields.ligaments", "Ligaments sollicités")} :</Text>
                <Text>{ligaments}</Text>
              </GridItem>

              <GridItem><MdSwapHoriz size={20} /></GridItem>
              <GridItem>
                <Text fontWeight="bold">{t("exerciseCard.fields.variants", "Variantes")} :</Text>
                <Text>{variantes}</Text>
              </GridItem>

              <GridItem><MdWarning size={20} color="red" /></GridItem>
              <GridItem>
                <Text fontWeight="bold" color="red.500">{t("exerciseCard.fields.constraints", "Contraintes")} :</Text>
                <Text>{contraintes}</Text>
              </GridItem>

              <GridItem><MdOutlineMenuBook size={20} /></GridItem>
              <GridItem>
                <Text fontWeight="bold">{t("exerciseCard.fields.cues", "Consignes d'exécution")} :</Text>
                {exercise.consignes && Object.keys(exercise.consignes).length > 0 ? (
                  <List spacing={2} mt={2}>
                    {Object.entries(exercise.consignes).map(([key, val], i) => (
                      <ListItem key={i} display="flex" alignItems="center">
                        <ListIcon as={MdCheckCircle} color="green.500" />
                        <Text><strong>{key} :</strong> {val}</Text>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Text>{missing}</Text>
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
    prev.exercise.id === next.exercise.id &&
    prev.replaceMode === next.replaceMode &&
    prev.isTarget === next.isTarget
);

