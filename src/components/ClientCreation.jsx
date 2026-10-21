import { clubText } from "../i18n/clubText";
// src/components/ClientCreation.jsx
import React, { useState } from "react";
import {
  Box, Heading, Input, Select, Textarea, Button, VStack, HStack,
  useColorModeValue, useToast, FormControl, FormLabel,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  useDisclosure, Text, SimpleGrid, Divider, Alert, AlertIcon, Badge
} from "@chakra-ui/react";
import {
  doc, setDoc, serverTimestamp, getDocs,
  collection, query, where, updateDoc, arrayUnion
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../utils/api";
import { notify } from "../utils/notify";

/* ---- conversions ---- */
const KG_PER_LB = 0.45359237;
const IN_PER_FT = 12;
const CM_PER_IN = 2.54;
const toNumber = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const langCodeFromAny = (value) => {
  const l = String(value || "").trim().toLowerCase();
  if (l.startsWith("en") || l.includes("english") || l.includes("anglais")) return "en";
  if (l.startsWith("de") || l.includes("deutsch") || l.includes("allemand")) return "de";
  if (l.startsWith("it") || l.includes("italiano")) return "it";
  if (l.startsWith("es") || l.includes("español") || l.includes("espanol") || l.includes("espagnol")) return "es";
  if (l.startsWith("ru") || l.includes("русский")) return "ru";
  if (l.includes("arab") || l.includes("العربية") || l === "ar") return "ar";
  return "fr";
};

const ClientCreation = ({
  onClose,
  onCreated,
  hideTitle = true,
  ownerUid = "",
  clubId = "",
  clubName = "",
}) => {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const navigate = useNavigate();
  const effectiveOwnerUid = ownerUid || user?.uid || "";
  const toast = useToast();
  const clientLimit =
    typeof user?.proAccess?.clientLimit === "number"
      ? user.proAccess.clientLimit
      : typeof user?.clientLimit === "number"
      ? user.clientLimit
      : null;

  /* ----- options UI ----- */
  const levelOptions = [
    { value: "Débutant",       label: t("clientCreation.levels.beginner") },
    { value: "Intermédiaire",  label: t("clientCreation.levels.intermediate") },
    { value: "Confirmé",       label: t("clientCreation.levels.advanced") },
  ];
  const objectiveOptions = [
    { value: "Prise de masse",  label: t("clientCreation.objectives.gain") },
    { value: "Perte de poids",  label: t("clientCreation.objectives.loss") },
    { value: "Force",           label: t("clientCreation.objectives.strength") },
    { value: "Endurance",       label: t("clientCreation.objectives.endurance") },
    { value: "Remise au sport", label: t("clientCreation.objectives.restart") },
    { value: "Postural",        label: t("clientCreation.objectives.posture") },
  ];
  const languageOptions = [
    { value: "Français", label: t("clientCreation.languages.fr") },
    { value: "English",  label: t("clientCreation.languages.en") },
    { value: "Deutsch",  label: t("clientCreation.languages.de") },
    { value: "Italiano", label: t("clientCreation.languages.it") },
    { value: "Español",  label: t("clientCreation.languages.es") },
    { value: "Русский",  label: t("clientCreation.languages.ru") },
    { value: "العربية",  label: t("clientCreation.languages.ar") },
  ];

  const initialClientState = {
    prenom: "", nom: "", email: "", telephone: "",
    dateNaissance: "",
    niveauSportif: levelOptions[0].value,
    objectifs: objectiveOptions[1].value,
    notes: "", langue: languageOptions[0].value,
    poids: "",
    sexe: "", loginMethod: "email",
  };

  const [client, setClient] = useState(initialClientState);
  const [loading, setLoading] = useState(false);

  /* unités / taille */
  const [heightUnit, setHeightUnit] = useState("cm");
  const [weightUnit, setWeightUnit] = useState("kg");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");

  /* modals */
  const { isOpen: isNoAccessOpen, onOpen: onNoAccessOpen, onClose: onNoAccessClose } = useDisclosure();
  const { isOpen: isMergeOpen, onOpen: onMergeOpen, onClose: onMergeClose } = useDisclosure();
  const { isOpen: isLimitOpen, onOpen: onLimitOpen, onClose: onLimitClose } = useDisclosure();
  const [mergeClientId, setMergeClientId] = useState(null);
  const [mergeClient, setMergeClient] = useState(null);
  const [pendingOfflineClient, setPendingOfflineClient] = useState(null);
  const [limitUsage, setLimitUsage] = useState({ used: 0, limit: clientLimit });
  const [existingLookup, setExistingLookup] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const handleChange = (e) => {
    setClient({ ...client, [e.target.name]: e.target.value });
    if (e.target.name === "email") setExistingLookup(null);
  };

  const lookupExistingClient = async () => {
    const email = (client.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setExistingLookup(null);
      return null;
    }
    setLookupLoading(true);
    try {
      const result = await apiFetch(`/clubs/client-lookup?email=${encodeURIComponent(email)}`);
      setExistingLookup(result?.exists ? result : null);
      return result?.exists ? result : null;
    } catch (error) {
      console.warn("Client lookup failed:", error);
      setExistingLookup(null);
      return null;
    } finally {
      setLookupLoading(false);
    }
  };

  const ensureClientCapacity = async () => {
    if (!user?.uid) return false;
    try {
      const capacity = await apiFetch("/clubs/client-capacity");
      if (capacity?.allowed || capacity?.limit == null) return true;
      setLimitUsage({
        used: capacity.used || 0,
        limit: capacity.limit,
        clubManaged: Boolean(capacity.clubManaged),
        packageTier: capacity.packageTier || "",
        upgradeMessage: capacity.upgradeMessage || "",
      });
      onLimitOpen();
    } catch (error) {
      console.error("Client capacity check failed:", error);
      notify(toast, "saveError", {
        title: t("errors.update_error") || clubText("Création impossible"),
        description:
          error?.message ||
          clubText("Impossible de vérifier la limite de clients pour le moment. Réessayez dans quelques secondes."),
      });
    }
    return false;
  };

  /* --------- payload calculé Firestore --------- */
  const buildComputedPayload = (base) => {
    // height -> cm
    let heightCmOut = null;
    if (heightUnit === "cm") {
      const v = toNumber(heightCm);
      heightCmOut = v == null ? null : Math.round(v);
    } else {
      const ft = toNumber(heightFt) ?? 0;
      const inch = toNumber(heightIn) ?? 0;
      const totalIn = ft * IN_PER_FT + inch;
      heightCmOut = Math.round(totalIn * CM_PER_IN);
    }
    // weight -> kg
    const w = toNumber(base.poids);
    const weightKgOut =
      w == null ? null : (weightUnit === "lbs" ? +(w * KG_PER_LB).toFixed(1) : +(+w).toFixed(1));

    return {
      ...Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'notes')),
      clubId: base.clubId || clubId || null,
      clubName: base.clubName || clubName || null,
      heightCm: heightCmOut,
      weightKg: weightKgOut,
      settings: {
        ...(base.settings || {}),
        units: { height: heightUnit, weight: weightUnit },
        defaultLanguage: base.langue,
        langCode: langCodeFromAny(base.langue),
      },
      updatedAt: serverTimestamp(),
    };
  };

  /* --------- conversions UI --------- */
  const onHeightUnitChange = (next) => {
    if (next === heightUnit) return;
    if (next === "ft") {
      const cm = toNumber(heightCm);
      if (cm != null) {
        const totalIn = cm / CM_PER_IN;
        const ft = Math.floor(totalIn / IN_PER_FT);
        const inch = Math.round(totalIn - ft * IN_PER_FT);
        setHeightFt(String(ft));
        setHeightIn(String(inch));
      }
    } else {
      const ft = toNumber(heightFt) ?? 0;
      const inch = toNumber(heightIn) ?? 0;
      const cm = Math.round((ft * IN_PER_FT + inch) * CM_PER_IN);
      setHeightCm(cm ? String(cm) : "");
    }
    setHeightUnit(next);
  };
  const onWeightUnitChange = (next) => {
    if (next === weightUnit) return;
    const cur = toNumber(client.poids);
    if (cur != null) {
      const converted = (next === "kg")
        ? (cur * KG_PER_LB).toFixed(1)      // lbs -> kg
        : (cur / KG_PER_LB).toFixed(0);     // kg -> lbs
      setClient((c) => ({ ...c, poids: converted }));
    }
    setWeightUnit(next);
  };

  const buildAccountRequest = (email) => {
    const computed = buildComputedPayload({
      ...client,
      email,
      prenom: client.prenom.trim(),
      nom: client.nom.trim(),
    });
    return {
      ...computed,
      updatedAt: undefined,
      firstName: client.prenom.trim(),
      lastName: client.nom.trim(),
      ownerUid: effectiveOwnerUid,
      clubId: clubId || null,
      clubName: clubName || null,
      units: { height: heightUnit, weight: weightUnit },
    };
  };

  /* --------- Lier un compte existant par e-mail --------- */
  const saveCreatedNote = async (clientId, text = client.notes) => {
    if (!text?.trim()) return;
    try {
      if (!clientId) throw new Error('missing-client');
      const url = `/clubs/clients/${encodeURIComponent(clientId)}/internal-note`;
      const previous = await apiFetch(url);
      await apiFetch(url, {method:'PUT', body:JSON.stringify({text:previous.text ? `${previous.text}\n\n${text}` : text, version:previous.version})});
    } catch {
      toast({status:'error',duration:null,isClosable:true,title:t('clientView.internalNotes.title'),description:t('clientView.internalNotes.createError')});
    }
  };
  const linkExistingAccount = async (email) => {
    const linked = await apiFetch("/clubs/link-existing-client", {
      method: "POST", body: JSON.stringify(buildAccountRequest(email)),
    });
    await saveCreatedNote(linked.clientId);
    return linked;
  };
  /* ----------------- fusion (doublon offline) ----------------- */
  const handleMerge = async () => {
    if (!mergeClientId) return;
    try {
      const payload = buildComputedPayload({
        ...client,
        email: client.email || "",
        creeLe: mergeClient?.creeLe || serverTimestamp(),
        createdBy: effectiveOwnerUid,
      });
      await updateDoc(doc(db, "clients", mergeClientId), {
        ...payload,
        coachIds: arrayUnion(effectiveOwnerUid),
      });
      await saveCreatedNote(mergeClientId);
      notify(toast, "clientLinked", {
        title: t("common.confirm"),
        description: t("clientCreation.modalConfirm"),
      });
      setMergeClientId(null); setMergeClient(null);
      setClient(initialClientState);
      onMergeClose(); onCreated?.(); onClose?.();
    } catch (error) {
      notify(toast, "saveError", {
        title: t("errors.update_error") || clubText("Fusion impossible"),
        description: error.message,
      });
    }
  };

  /* ----------------- submit ----------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;
    setLoading(true);
    const hasCapacity = await ensureClientCapacity();
    if (!hasCapacity) {
      setLoading(false);
      return;
    }

    if (client.loginMethod === "email") {
      const email = (client.email || "").trim().toLowerCase();

      if (!email) {
        setPendingOfflineClient({ ...client });
        onNoAccessOpen();
        // tentative fusion doublon "offline"
        try {
          const qDup = query(
            collection(db, "clients"),
            where("prenom", "==", client.prenom.trim()),
            where("nom", "==", client.nom.trim()),
            where("email", "==", "")
          );
          const snap = await getDocs(qDup);
          if (!snap.empty) {
            const existing = snap.docs[0];
            setMergeClientId(existing.id);
            setMergeClient(existing.data());
            onMergeOpen();
          }
        } catch { /* ignore */ }
        setLoading(false);
        return;
      }

      try {
        const existing = existingLookup || (await lookupExistingClient());
        if (existing?.exists && existing?.authExists !== false) {
          if (existing.canStartFollowup) {
            const followup = await apiFetch('/clubs/independent-followups', { method: 'POST', body: JSON.stringify({ email }) });
            await saveCreatedNote(followup.clientId);
            notify(toast, 'clientLinked', { title: clubText('Nouveau suivi indépendant'), description: clubText('Le suivi est créé. Le client peut le consulter avec son compte habituel.') });
            if (followup.emailWarning) toast({ status: 'warning', title: clubText('Suivi créé, e-mail non envoyé'), description: clubText('Le suivi reste accessible dans l’espace client.') });
            setClient(initialClientState); setExistingLookup(null);
            onCreated?.(); onClose?.(); setLoading(false); return;
          }
          if (!existing.canLink) {
            notify(toast, "saveError", {
              title: clubText("Compte existant non rattachable"),
              description:
                clubText("Ce compte appartient déjà à un autre espace ou à un profil professionnel. Un administrateur doit valider son transfert."),
            });
            setLoading(false);
            return;
          }

          const linked = await linkExistingAccount(email);

          notify(toast, "clientLinked", {
            title: clubText("Client existant rattaché"),
            description: linked?.hasPrograms
              ? clubText("Le coach verra aussi les programmes déjà présents sur cette fiche.")
              : clubText("Le compte existant est maintenant visible dans la liste clients."),
          });
          if (linked?.emailWarning) toast({ status: "warning", title: clubText("Client rattaché, e-mail non envoyé"), description: clubText("Le message de bienvenue n’a pas pu être envoyé.") });
          setClient(initialClientState);
          setExistingLookup(null);
          onCreated?.(); onClose?.();
          setLoading(false);
          return;
        }

        let created;
        try {
          created = await apiFetch("/clubs/clients", {
            method: "POST",
            body: JSON.stringify(buildAccountRequest(email)),
          });
        } catch (createError) {
          if (
            createError?.status === 409 &&
            createError?.data?.error === "client-account-already-exists" &&
            createError?.data?.canLink
          ) {
            const linked = await linkExistingAccount(email);
            notify(toast, "clientLinked", {
              title: clubText("Client existant rattaché"),
              description: linked?.hasPrograms
                ? clubText("Le compte existant a été rattaché au coach avec ses programmes.")
                : clubText("Le compte existant a été rattaché au coach."),
            });
            setClient(initialClientState);
            setExistingLookup(null);
            onCreated?.();
            onClose?.();
            return;
          }
          throw createError;
        }

        await saveCreatedNote(created?.clientId);
        if (created?.emailSent) {
          notify(toast, "clientCreatedWithEmail");
        } else {
          notify(toast, "clientCreated", {
            status: "warning",
            title: clubText("Client créé, e-mail non envoyé"),
            description:
              clubText("Le compte est bien créé, mais l’e-mail d’accès n’a pas pu partir. Ouvre la fiche client puis utilise « Renvoyer l’accès »."),
            duration: 7000,
          });
        }

        setClient(initialClientState);
        setExistingLookup(null);
        onCreated?.(); onClose?.();
      } catch (error) {
        console.error("Client creation failed:", error);
        notify(toast, "saveError", {
          title: t("errors.update_error") || clubText("Création impossible"),
          description: error?.message || clubText("Le client n'a pas pu être créé pour le moment."),
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // --- Méthode téléphone : désactivée tant que Firebase SMS n'est pas branché ---
    if (client.loginMethod === "phone") {
      notify(toast, "phoneLoginUnavailable", {
        title: t("clientCreation.phoneLoginUnavailableTitle") || clubText("Connexion téléphone indisponible"),
        description:
          t("clientCreation.phoneLoginUnavailableDescription") ||
          clubText("La connexion par téléphone nécessite une validation SMS Firebase complète. Pour l’instant, créez l’accès client par email pour garder un parcours sécurisé."),
      });
      setLoading(false);
      return;
    }
  };

  /* offline-only (pas d’email) */
  const handleNoAccessConfirm = async () => {
    if (!pendingOfflineClient || !effectiveOwnerUid) { onNoAccessClose(); return; }
    setLoading(true);
    const c = pendingOfflineClient;
    const pseudoUid = `offline_${c.prenom.trim().toLowerCase()}_${c.nom.trim().toLowerCase()}_${Date.now()}`;
    try {
      const clientPayload = buildComputedPayload({
        ...c,
        email: "",
        creeLe: serverTimestamp(),
        createdBy: effectiveOwnerUid,
        offlineOnly: true,
      });
      await setDoc(doc(db, "clients", pseudoUid), {
        ...clientPayload,
        coachIds: [effectiveOwnerUid],
      });
      await saveCreatedNote(pseudoUid, c.notes);
      notify(toast, "clientCreated", {
        status: "info",
        title: t("clientCreation.save"),
        description: t("clientCreation.modalNoAccessText"),
        duration: 7000,
      });
      setClient(initialClientState);
      setPendingOfflineClient(null);
      onCreated?.(); onClose?.();
    } catch (error) {
      notify(toast, "saveError", {
        title: t("errors.update_error") || clubText("Création impossible"),
        description: error.message,
      });
    } finally {
      setLoading(false); onNoAccessClose();
    }
  };

  /* UI */
  const fieldHint = useColorModeValue("gray.600", "whiteAlpha.700");
  const mergePreviewBg = useColorModeValue("rgba(59,130,246,0.08)", "rgba(59,130,246,0.12)");
  const weightPlaceholder = weightUnit === "kg" ? `${t("clientCreation.weight")} (kg)` : `${t("clientCreation.weight")} (lbs)`;
  const heightPlaceholderCm = `${t("clientCreation.height")} (cm)`;

  return (
    <Box pb={{ base: 4, md: 5 }}>
      {!hideTitle && (
        <Box mb={5}>
          <Heading size="md" mb={1}>
            {t("clientCreation.title")}
          </Heading>
          <Text fontSize="sm" color="textMuted">{t("auto.ClientCreation.creez_une_fiche_client_complete_avec_ses_informati", "Créez une fiche client complète avec ses informations de contact, son profil et ses préférences.")}</Text>
        </Box>
      )}

      <form onSubmit={handleSubmit}>
        <VStack spacing={5} align="stretch">
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired={!existingLookup?.canStartFollowup}>
              <FormLabel>{t("clientCreation.firstName")}</FormLabel>
              <Input name="prenom" placeholder={t("clientCreation.firstName")} value={client.prenom} onChange={handleChange} required={!existingLookup?.canStartFollowup} />
            </FormControl>
            <FormControl isRequired={!existingLookup?.canStartFollowup}>
              <FormLabel>{t("clientCreation.lastName")}</FormLabel>
              <Input name="nom" placeholder={t("clientCreation.lastName")} value={client.nom} onChange={handleChange} required={!existingLookup?.canStartFollowup} />
            </FormControl>
          </SimpleGrid>

          <FormControl>
            <FormLabel>{t("clientCreation.email")}</FormLabel>
            <Input
              type="email"
              name="email"
              placeholder={t("clientCreation.email")}
              value={client.email}
              onChange={handleChange}
              onBlur={lookupExistingClient}
            />
            <Text mt={2} fontSize="xs" color={fieldHint}>
              {existingLookup?.canStartFollowup ? clubText("Le client recevra un e-mail d’information. Son mot de passe reste inchangé.") : t("clientCreation.emailAccessHint", "L’accès sécurisé du client sera envoyé uniquement par e-mail.")}
            </Text>
            {lookupLoading && (
              <Text mt={2} fontSize="xs" color={fieldHint}>{clubText("Vérification du compte existant...")}</Text>
            )}
            {existingLookup?.exists && (
              <Alert mt={3} status={existingLookup.canLink || existingLookup.canStartFollowup ? "info" : "warning"} borderRadius="lg">
                <AlertIcon />
                <Box>
                  <HStack spacing={2} flexWrap="wrap">
                    <Text fontWeight="800">
                      {existingLookup.canLink || existingLookup.canStartFollowup ? clubText("Compte client existant trouvé") : clubText("Email déjà utilisé")}
                    </Text>
                    {existingLookup.hasPrograms && (
                      <Badge colorScheme="blue">
                        {clubText("{{count}} programme(s)", { count: existingLookup.client?.programCount || 0 })}
                      </Badge>
                    )}
                  </HStack>
                  <Text fontSize="sm">
                    {existingLookup.canStartFollowup ? clubText("Ce client a déjà un compte. Un nouveau dossier indépendant sera créé, sans modifier ses autres suivis.") : existingLookup.canLink
                      ? (clubId ? clubText("À la validation, cette fiche sera rattachée à votre club, sans créer de doublon.") : clubText("À la validation, cette fiche sera rattachée à votre compte professionnel, sans créer de doublon."))
                      : clubText("Cet email appartient déjà à un compte pro/admin et ne peut pas être ajouté comme client.")}
                  </Text>
                </Box>
              </Alert>
            )}
          </FormControl>
          <FormControl>
            <FormLabel>{t("clientCreation.phoneOptional")}</FormLabel>
            <Input name="telephone" placeholder={t("clientCreation.phoneOptional")} value={client.telephone} onChange={handleChange} />
          </FormControl>

          <Divider borderColor="borderSubtle" />

          <Box>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="textMuted" fontWeight="800">{t("profile_short.title", "Profil")}</Text>
            <Text mt={1} fontSize="sm" color={fieldHint}>{t("auto.ClientCreation.renseignez_les_informations_utiles_au_suivi_sporti", "Renseignez les informations utiles au suivi sportif.")}</Text>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>{t("clientCreation.birthDate", "Date de naissance")}</FormLabel>
              <Input type="date" name="dateNaissance" value={client.dateNaissance} onChange={handleChange} />
            </FormControl>
            <FormControl isRequired={!existingLookup?.canStartFollowup}>
              <FormLabel>{t("clientCreation.gender")}</FormLabel>
              <Select name="sexe" value={client.sexe} onChange={handleChange} required={!existingLookup?.canStartFollowup}>
                <option value="">{t("clientCreation.gender")}</option>
                <option value="Homme">{t("clientCreation.genderMale")}</option>
                <option value="Femme">{t("clientCreation.genderFemale")}</option>
              </Select>
            </FormControl>
          </SimpleGrid>

          <FormControl>
            <FormLabel>{t("clientCreation.height")}</FormLabel>
            {heightUnit === "cm" ? (
              <HStack align="start">
                <Input placeholder={heightPlaceholderCm} type="number" inputMode="decimal" step="1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                <Select w="28" value={heightUnit} onChange={(e) => onHeightUnitChange(e.target.value)}>
                  <option value="cm">{t("units.cm", "cm")}</option>
                  <option value="ft">{t("auto.ClientCreation.ft", "ft")}</option>
                </Select>
              </HStack>
            ) : (
              <HStack align="start">
                <Input placeholder={t("auto.ClientCreation.ft", "ft")} type="number" inputMode="numeric" step="1" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} />
                <Input placeholder={t("auto.ClientCreation.in", "in")} type="number" inputMode="numeric" step="1" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
                <Select w="28" value={heightUnit} onChange={(e) => onHeightUnitChange(e.target.value)}>
                  <option value="cm">{t("units.cm", "cm")}</option>
                  <option value="ft">{t("auto.ClientCreation.ft", "ft")}</option>
                </Select>
              </HStack>
            )}
          </FormControl>

          <FormControl>
            <FormLabel>{t("clientCreation.weight")}</FormLabel>
            <HStack align="start">
              <Input name="poids" placeholder={weightPlaceholder} type="number" inputMode="decimal" step={weightUnit === "kg" ? "0.1" : "1"} value={client.poids} onChange={handleChange} />
              <Select w="28" value={weightUnit} onChange={(e) => onWeightUnitChange(e.target.value)}>
                <option value="kg">{t("units.kg", "kg")}</option>
                <option value="lbs">{t("units.lbs", "lbs")}</option>
              </Select>
            </HStack>
          </FormControl>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl isRequired={!existingLookup?.canStartFollowup}>
              <FormLabel>{t("auto.ClientCreation.niveau_sportif", "Niveau sportif")}</FormLabel>
              <Select name="niveauSportif" value={client.niveauSportif} onChange={handleChange} required={!existingLookup?.canStartFollowup}>
                {levelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
            </FormControl>

            <FormControl isRequired={!existingLookup?.canStartFollowup}>
              <FormLabel>{t("auto.ClientCreation.objectif_principal", "Objectif principal")}</FormLabel>
              <Select name="objectifs" value={client.objectifs} onChange={handleChange} required={!existingLookup?.canStartFollowup}>
                {objectiveOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </Select>
            </FormControl>
          </SimpleGrid>

          <Divider borderColor="borderSubtle" />

          <Box>
            <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color="textMuted" fontWeight="800">{t("settings.sections.preferences", "Préférences")}</Text>
            <Text mt={1} fontSize="sm" color={fieldHint}>{t("auto.ClientCreation.definissez_la_langue_de_reference_et_les_notes_uti", "Définissez la langue de référence et les notes utiles pour l’accompagnement.")}</Text>
          </Box>

          <FormControl>
            <FormLabel>{t("clientCreation.language", "Langue")}</FormLabel>
            <Select name="langue" value={client.langue} onChange={handleChange}>
              {languageOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel>{t("clientView.internalNotes.title")}</FormLabel>
            <Textarea
              name="notes"
              placeholder={t("clientView.internalNotes.privacy")}
              maxLength={8000}
              value={client.notes}
              onChange={handleChange}
              minH="140px"
              resize="vertical"
            />
          </FormControl>

          <Divider borderColor="borderSubtle" />

          <Button type="submit" w="full" isLoading={loading}>
            {existingLookup?.canStartFollowup ? clubText("Créer le suivi indépendant") : t("clientCreation.save")}
          </Button>
        </VStack>
      </form>

      {/* MODAL : Pas d’accès */}
      <Modal isOpen={isNoAccessOpen} onClose={onNoAccessClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("clientCreation.modalNoAccessTitle")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody><Text>{t("clientCreation.modalNoAccessText")}</Text></ModalBody>
          <ModalFooter>
            <Button onClick={handleNoAccessConfirm} isLoading={loading}>OK</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* MODAL : Fusion doublon */}
      <Modal isOpen={isMergeOpen} onClose={onMergeClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("clientCreation.modalMergeTitle")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>{t("clientCreation.modalMergeText")}</Text>
            <Box mt={4} p={4} bg={mergePreviewBg} borderRadius="18px" border="1px solid" borderColor="borderSubtle">
              <Text>{t("clientCreation.firstName")} : {mergeClient?.prenom}</Text>
              <Text>{t("clientCreation.lastName")} : {mergeClient?.nom}</Text>
              <Text>{t("clientCreation.notes")} : {mergeClient?.notes}</Text>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={handleMerge}>{t("clientCreation.modalConfirm")}</Button>
            <Button variant="ghost" onClick={onMergeClose}>{t("clientCreation.modalCancel")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* MODAL : Limite du pack */}
      <Modal isOpen={isLimitOpen} onClose={onLimitClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("auto.ClientCreation.limite_de_clients_atteinte", "Limite de clients atteinte")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text>
              {t(
                "auto.ClientCreation.votre_pack_permet_clients",
                "Votre pack permet {{limit}} client(s). Vous en avez déjà {{used}}.",
                { limit: limitUsage.limit, used: limitUsage.used }
              )}
            </Text>
            <Text mt={3} color={fieldHint}>
              {limitUsage.clubManaged
                ? limitUsage.upgradeMessage || clubText("La capacité est partagée par tout le club. Demandez au responsable de passer au pack supérieur, ou contactez contact@boostyourlife.coach si vous êtes déjà au maximum.")
                : clubText("Passez au palier supérieur pour ajouter de nouveaux clients et débloquer plus de capacité.")}
            </Text>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onLimitClose}>{t("auto.ClubDashboard.plus_tard", "Plus tard")}</Button>
            <Button
              onClick={() => {
                onLimitClose();
                navigate(limitUsage.packageTier === "network" ? "/contact" : "/plans/professionnel");
              }}
            >
              {limitUsage.packageTier === "network" ? clubText("Contacter BYL") : clubText("Améliorer le pack")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default ClientCreation;
