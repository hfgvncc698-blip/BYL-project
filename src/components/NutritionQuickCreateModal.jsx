/* eslint-disable react/prop-types */
import { useMemo, useState } from "react";
import {
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Select,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import { createNutritionAssessmentFromProfile } from "../utils/nutritionPrefill";
import { notify } from "../utils/notify";

const INITIAL_STATE = {
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  dateNaissance: "",
  sexe: "",
  objectif: "",
  heightCm: "",
  weightKg: "",
};

const OBJECTIF_OPTIONS = [
  "Rééquilibrage alimentaire",
  "Perte de poids",
  "Prise de masse",
  "Femme enceinte (1er trimestre)",
  "Femme enceinte (2ème trimestre)",
  "Femme enceinte (3ème trimestre)",
  "Femme allaitante",
];

export default function NutritionQuickCreateModal({ isOpen, onClose, user, navigate, toast }) {
  const [form, setForm] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(false);

  const hasEmail = useMemo(() => String(form.email || "").trim().length > 0, [form.email]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetAndClose = (options = {}) => {
    setForm(INITIAL_STATE);
    onClose?.(options);
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!String(form.prenom || "").trim() || !String(form.nom || "").trim()) {
      notify(toast, "saveError", {
        title: "Informations incomplètes",
        description: "Le prénom et le nom sont requis pour démarrer un suivi nutrition.",
      });
      return;
    }

    setLoading(true);
    try {
      const { clientId, assessmentId, clientStatus } = await createNutritionAssessmentFromProfile({
        profile: {
          ...form,
          heightCm: form.heightCm ? Number(String(form.heightCm).replace(",", ".")) : null,
          weightKg: form.weightKg ? Number(String(form.weightKg).replace(",", ".")) : null,
        },
        createdByUid: user?.uid,
      });

      const description =
        clientStatus === "existing"
          ? "Le dossier existant a été repris avec son historique nutrition."
          : hasEmail
          ? "Le client a été créé et une invitation de connexion a été préparée."
          : "Une fiche hors-ligne a été créée. Tu pourras ajouter l’accès patient plus tard.";

      notify(toast, "nutritionDraftCreated", {
        title: "Suivi nutrition créé",
        description,
      });

      resetAndClose({ skipRouteCleanup: true });
      navigate(`/clients/${clientId}/nutrition/${assessmentId}`);
    } catch (error) {
      notify(toast, "saveError", {
        title: "Création impossible",
        description: error?.message || "Le suivi nutrition n’a pas pu être créé.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={resetAndClose} isCentered size="xl">
      <ModalOverlay />
      <ModalContent borderRadius="24px">
        <ModalHeader>Nouveau suivi diététique</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack as="form" spacing={4} align="stretch" onSubmit={handleSubmit}>
            <Text fontSize="sm" color="gray.500">
              Commence un bilan nutrition même si le client n’a pas encore de fiche complète.
              Si l’email existe déjà, le dernier historique sera repris automatiquement.
            </Text>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl isRequired>
                <FormLabel>Prénom</FormLabel>
                <Input value={form.prenom} onChange={(e) => setField("prenom", e.target.value)} />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Nom</FormLabel>
                <Input value={form.nom} onChange={(e) => setField("nom", e.target.value)} />
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>Email</FormLabel>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="patient@email.com"
                />
              </FormControl>
              <FormControl>
                <FormLabel>Téléphone</FormLabel>
                <Input value={form.telephone} onChange={(e) => setField("telephone", e.target.value)} />
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <FormControl>
                <FormLabel>Date de naissance</FormLabel>
                <Input
                  type="date"
                  value={form.dateNaissance}
                  onChange={(e) => setField("dateNaissance", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Sexe</FormLabel>
                <Select value={form.sexe} onChange={(e) => setField("sexe", e.target.value)}>
                  <option value="">Sélectionner</option>
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>Objectif</FormLabel>
                <Select value={form.objectif} onChange={(e) => setField("objectif", e.target.value)}>
                  <option value="">Sélectionner</option>
                  {OBJECTIF_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>Taille (cm)</FormLabel>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.heightCm}
                  onChange={(e) => setField("heightCm", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>Poids (kg)</FormLabel>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.weightKg}
                  onChange={(e) => setField("weightKg", e.target.value)}
                />
              </FormControl>
            </SimpleGrid>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="outline" onClick={resetAndClose}>
              Annuler
            </Button>
            <Button colorScheme="blue" onClick={handleSubmit} isLoading={loading}>
              Créer le suivi
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
