 
import { useMemo, useState } from "react";
import {
  Alert,
  AlertDescription,
  AlertIcon,
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
  useDisclosure,
  VStack,
} from "@chakra-ui/react";
import { createNutritionAssessmentFromProfile } from "../utils/nutritionPrefill";
import { apiFetch } from "../utils/api";
import { notify } from "../utils/notify";
import i18n from "../i18n/index";

const INITIAL_STATE = {
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  langue: "fr",
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

const LANGUAGE_OPTIONS = [
  { value: "fr", labelKey: "clientCreation.languages.fr", fallback: "Français" },
  { value: "en", labelKey: "clientCreation.languages.en", fallback: "English" },
  { value: "de", labelKey: "clientCreation.languages.de", fallback: "Deutsch" },
  { value: "it", labelKey: "clientCreation.languages.it", fallback: "Italiano" },
  { value: "es", labelKey: "clientCreation.languages.es", fallback: "Español" },
  { value: "ru", labelKey: "clientCreation.languages.ru", fallback: "Русский" },
  { value: "ar", labelKey: "clientCreation.languages.ar", fallback: "العربية" },
];

const OBJECTIF_LABEL_KEYS = {
  "Rééquilibrage alimentaire": "reequilibrage_alimentaire",
  "Perte de poids": "perte_de_poids",
  "Prise de masse": "prise_de_masse",
  "Femme enceinte (1er trimestre)": "femme_enceinte_1er_trimestre",
  "Femme enceinte (2ème trimestre)": "femme_enceinte_2eme_trimestre",
  "Femme enceinte (3ème trimestre)": "femme_enceinte_3eme_trimestre",
  "Femme allaitante": "femme_allaitante",
};

const objectiveDisplayLabel = (objective = "") => {
  const key = OBJECTIF_LABEL_KEYS[objective];
  return key ? i18n.t(`auto.nutritionObjectives.${key}`, objective) : objective;
};

export default function NutritionQuickCreateModal({ isOpen, onClose, user, clientLimit = null, navigate, toast }) {
  const [form, setForm] = useState(INITIAL_STATE);
  const [loading, setLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const limitModal = useDisclosure();
  const [limitUsage, setLimitUsage] = useState({ used: 0, limit: clientLimit });
  const formId = "nutrition-quick-create-form";

  const hasEmail = useMemo(() => String(form.email || "").trim().length > 0, [form.email]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetAndClose = (options = {}) => {
    setForm(INITIAL_STATE);
    setCreateError("");
    onClose?.(options);
  };

  const ensureClientCapacity = async () => {
    if (!user?.uid) {
      throw new Error("Session introuvable. Recharge la page puis réessaie.");
    }
    const capacity = await apiFetch("/clubs/client-capacity");
    if (capacity?.allowed || capacity?.limit == null) return true;
    setLimitUsage({
      used: capacity.used || 0,
      limit: capacity.limit,
      clubManaged: Boolean(capacity.clubManaged),
      packageTier: capacity.packageTier || "",
      upgradeMessage: capacity.upgradeMessage || "",
    });
    limitModal.onOpen();
    return false;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (loading) return;
    setCreateError("");
    if (!String(form.prenom || "").trim() || !String(form.nom || "").trim()) {
      setCreateError("Le prénom et le nom sont requis pour démarrer un suivi nutrition.");
      notify(toast, "saveError", {
        title: "Informations incomplètes",
        description: "Le prénom et le nom sont requis pour démarrer un suivi nutrition.",
      });
      return;
    }

    setLoading(true);
    try {
      const hasCapacity = await ensureClientCapacity();
      if (!hasCapacity) return;
      const { clientId, assessmentId, clientStatus } = await createNutritionAssessmentFromProfile({
        profile: {
          ...form,
          heightCm: form.heightCm ? Number(String(form.heightCm).replace(",", ".")) : null,
          weightKg: form.weightKg ? Number(String(form.weightKg).replace(",", ".")) : null,
        },
        createdByUid: user?.uid,
        clubId: user?.clubId || null,
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
      const message = error?.message || "Le suivi nutrition n’a pas pu être créé.";
      setCreateError(message);
      notify(toast, "saveError", {
        title: "Création impossible",
        description: message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={resetAndClose} isCentered size="xl">
        <ModalOverlay />
        <ModalContent borderRadius="24px">
          <ModalHeader>{i18n.t("nav.new_nutrition_followup", "Nouveau suivi diététique")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack id={formId} as="form" spacing={4} align="stretch" onSubmit={handleSubmit}>
              <Text fontSize="sm" color="gray.500">{i18n.t("auto.NutritionQuickCreateModal.commence_un_bilan_nutrition_meme_si_le_client_n_a_", "Commence un bilan nutrition même si le client n’a pas encore de fiche complète. Si l’email existe déjà, le dernier historique sera repris automatiquement.")}</Text>

              {createError ? (
                <Alert status="error" borderRadius="14px">
                  <AlertIcon />
                  <AlertDescription>{createError}</AlertDescription>
                </Alert>
              ) : null}

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl isRequired>
                  <FormLabel>{i18n.t("clientCreation.firstName", "Prénom")}</FormLabel>
                  <Input value={form.prenom} onChange={(e) => setField("prenom", e.target.value)} />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{i18n.t("contact.fields.name.label", "Nom")}</FormLabel>
                  <Input value={form.nom} onChange={(e) => setField("nom", e.target.value)} />
                </FormControl>
              </SimpleGrid>

              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                <FormControl>
                  <FormLabel>{i18n.t("clientCreation.email", "Email")}</FormLabel>
                  <Input
                    type="email"
                    value={form.email}
                    onChange={(e) => setField("email", e.target.value)}
                    placeholder={i18n.t("auto.NutritionQuickCreateModal.patient_email_com", "patient@email.com")}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>{i18n.t("clientCreation.phone", "Téléphone")}</FormLabel>
                  <Input value={form.telephone} onChange={(e) => setField("telephone", e.target.value)} />
                </FormControl>
              </SimpleGrid>

              <FormControl>
                <FormLabel>{i18n.t("nutritionCoach.create.clientLanguage", "Langue du client")}</FormLabel>
                <Select value={form.langue} onChange={(e) => setField("langue", e.target.value)}>
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {i18n.t(option.labelKey, option.fallback)}
                    </option>
                  ))}
                </Select>
                <Text mt={1} fontSize="xs" color="gray.500">
                  {i18n.t(
                    "nutritionCoach.create.clientLanguageHelp",
                    "Cette langue sera utilisée pour le compte client et le premier e-mail d’accès."
                  )}
                </Text>
              </FormControl>

            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
              <FormControl>
                <FormLabel>{i18n.t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
                <Input
                  type="date"
                  value={form.dateNaissance}
                  onChange={(e) => setField("dateNaissance", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("clientCreation.gender", "Sexe")}</FormLabel>
                <Select value={form.sexe} onChange={(e) => setField("sexe", e.target.value)}>
                  <option value="">{i18n.t("common.select", "Sélectionner")}</option>
                  <option value="Homme">{i18n.t("clientCreation.genderMale", "Homme")}</option>
                  <option value="Femme">{i18n.t("clientCreation.genderFemale", "Femme")}</option>
                </Select>
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("nutritionCoach.table.objective", "Objectif")}</FormLabel>
                <Select value={form.objectif} onChange={(e) => setField("objectif", e.target.value)}>
                  <option value="">{i18n.t("common.select", "Sélectionner")}</option>
                  {OBJECTIF_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {objectiveDisplayLabel(option)}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              <FormControl>
                <FormLabel>{i18n.t("clientCreation.height", "Taille (cm)")}</FormLabel>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={form.heightCm}
                  onChange={(e) => setField("heightCm", e.target.value)}
                />
              </FormControl>
              <FormControl>
                <FormLabel>{i18n.t("clientCreation.weight", "Poids (kg)")}</FormLabel>
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
              <Button variant="outline" onClick={resetAndClose} isDisabled={loading}>{i18n.t("exerciseCard.cancel", "Annuler")}</Button>
              <Button
                colorScheme="blue"
                type="submit"
                form={formId}
                isLoading={loading}
                loadingText={i18n.t("common.creating", "Création...")}
              >
                {i18n.t("auto.NutritionQuickCreateModal.creer_le_suivi", "Créer le suivi")}
              </Button>
            </HStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={limitModal.isOpen} onClose={limitModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent borderRadius="24px">
          <ModalHeader>{i18n.t("auto.NutritionQuickCreateModal.limite_de_patients_atteinte", "Limite de patients atteinte")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              {i18n.t(
                "auto.NutritionQuickCreateModal.votre_pack_permet_patients",
                "Votre pack permet {{limit}} patient(s). Vous en avez déjà {{used}}.",
                { limit: limitUsage.limit, used: limitUsage.used }
              )}
            </Text>
            <Text mt={3} color="gray.500">
              {limitUsage.clubManaged
                ? limitUsage.upgradeMessage || "La capacité est partagée par tout le club. Demandez au responsable de passer au pack supérieur, ou contactez contact@boostyourlife.coach si vous êtes déjà au maximum."
                : "Passez au palier supérieur pour ajouter de nouveaux patients et poursuivre votre suivi nutrition."}
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={limitModal.onClose}>{i18n.t("auto.ClubDashboard.plus_tard", "Plus tard")}</Button>
            <Button
              onClick={() => {
                limitModal.onClose();
                navigate(limitUsage.packageTier === "network" ? "/contact" : "/plans/professionnel");
              }}
            >
              {limitUsage.packageTier === "network" ? "Contacter BYL" : "Améliorer le pack"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
