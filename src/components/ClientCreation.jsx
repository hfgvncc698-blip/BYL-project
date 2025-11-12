// src/components/ClientCreation.jsx
import React, { useState } from "react";
import {
  Box, Heading, Input, Select, Textarea, Button, VStack, HStack,
  useColorModeValue, useToast, FormControl, FormLabel,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  useDisclosure, Text
} from "@chakra-ui/react";
import {
  doc, setDoc, serverTimestamp, getDocs, getDoc,
  collection, query, where, updateDoc, arrayUnion
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

// App secondaire pour créer un user sans déconnecter le coach
import { initializeApp, getApps, getApp, deleteApp } from "firebase/app";
import {
  getAuth as getAuthSecondary,
  createUserWithEmailAndPassword as createUserSecondary,
  sendPasswordResetEmail, // ✅ email intégré Firebase (pas de provider externe)
} from "firebase/auth";

/* ---- conversions ---- */
const KG_PER_LB = 0.45359237;
const IN_PER_FT = 12;
const CM_PER_IN = 2.54;
const toNumber = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const ClientCreation = ({ onClose, onCreated, hideTitle = false }) => {
  const { t } = useTranslation("common");
  const { user } = useAuth();
  const toast = useToast();

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
  const [mergeClientId, setMergeClientId] = useState(null);
  const [mergeClient, setMergeClient] = useState(null);
  const [pendingOfflineClient, setPendingOfflineClient] = useState(null);

  const handleChange = (e) => setClient({ ...client, [e.target.name]: e.target.value });

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
      ...base,
      heightCm: heightCmOut,
      weightKg: weightKgOut,
      settings: {
        ...(base.settings || {}),
        units: { height: heightUnit, weight: weightUnit },
        defaultLanguage: base.langue,
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

  /* --------- Lier un compte existant par e-mail --------- */
  const linkExistingByEmail = async (emailNorm) => {
    const qUsers = query(collection(db, "users"), where("email", "==", emailNorm));
    const usersSnap = await getDocs(qUsers);

    if (usersSnap.empty) {
      // fallback: client existant par email dans /clients
      const qClients = query(collection(db, "clients"), where("email", "==", emailNorm));
      const clientsSnap = await getDocs(qClients);
      if (!clientsSnap.empty) {
        const ref = clientsSnap.docs[0].ref;
        await updateDoc(ref, {
          ...buildComputedPayload({
            ...client,
            email: emailNorm,
            prenom: client.prenom.trim(),
            nom: client.nom.trim(),
          }),
          coachIds: arrayUnion(user.uid),
        });
        return { uid: ref.id, created: false, updatedExistingClient: true };
      }
      throw new Error("email_exists_but_user_doc_missing");
    }

    const userDoc = usersSnap.docs[0];
    const uid = userDoc.id;

    const clientRef = doc(db, "clients", uid);
    const clientSnap = await getDoc(clientRef);

    const clientPayload = buildComputedPayload({
      ...client,
      email: emailNorm,
      prenom: client.prenom.trim(),
      nom: client.nom.trim(),
      creeLe: clientSnap.exists() ? clientSnap.data()?.creeLe || serverTimestamp() : serverTimestamp(),
      createdBy: user.uid,
    });

    if (clientSnap.exists()) {
      await updateDoc(clientRef, {
        ...clientPayload,
        coachIds: arrayUnion(user.uid),
      });
    } else {
      await setDoc(clientRef, {
        ...clientPayload,
        coachIds: [user.uid],
      });
    }

    return { uid, created: false };
  };

  /* ----------------- fusion (doublon offline) ----------------- */
  const handleMerge = async () => {
    if (!mergeClientId) return;
    try {
      const payload = buildComputedPayload({
        ...client,
        email: client.email || "",
        creeLe: mergeClient?.creeLe || serverTimestamp(),
        createdBy: user.uid,
      });
      await updateDoc(doc(db, "clients", mergeClientId), {
        ...payload,
        coachIds: arrayUnion(user.uid),
      });
      toast({ title: t("common.confirm"), description: t("clientCreation.modalConfirm"), status: "success", duration: 5000 });
      setMergeClientId(null); setMergeClient(null);
      setClient(initialClientState);
      onMergeClose(); onCreated?.(); onClose?.();
    } catch (error) {
      toast({ title: t("errors.update_error") || "Erreur fusion client", description: error.message, status: "error", duration: 5000 });
    }
  };

  /* ----------------- submit ----------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.uid) return;
    setLoading(true);

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
        // essayer de créer le compte via app secondaire
        const baseConfig = getApp().options;
        const secondary =
          getApps().find((a) => a.name === "BYL-Secondary")
          ?? initializeApp(baseConfig, "BYL-Secondary");
        const secondaryAuth = getAuthSecondary(secondary);

        const tempPwd = Math.random().toString(36).slice(-10) + "A!1$";

        let createdUser;
        try {
          createdUser = await createUserSecondary(secondaryAuth, email, tempPwd);
        } catch (err) {
          console.error("Auth create error:", err?.code, err?.message);

          // s'il existe déjà -> lier au coach + mettre à jour clients/{uid}
          if (err?.code === "auth/email-already-in-use") {
            await deleteApp(secondary).catch(() => {});
            const res = await linkExistingByEmail(email);
            toast({
              title: "Client lié à votre liste",
              description: "Le compte existait déjà ; le client a été rattaché.",
              status: "success",
              duration: 6000,
            });
            setClient(initialClientState);
            onCreated?.(); onClose?.();
            setLoading(false);
            return;
          }

          if (err?.code === "auth/operation-not-allowed") {
            toast({ title: "E-mail/mot de passe désactivé dans Firebase.", status: "error", duration: 6000 });
            await deleteApp(secondary).catch(() => {});
            setLoading(false);
            return;
          }
          throw err;
        }

        const uid = createdUser.user.uid;

        // ✅ ENVOI EMAIL INTÉGRÉ (définir / réinitialiser le mot de passe)
        try {
          await sendPasswordResetEmail(secondaryAuth, email, {
            url: "https://boostyourlife.coach/login",
            handleCodeInApp: false,
          });
        } catch (err) {
          console.error("Firebase reset email error:", err);
          // on n’arrête pas le flux pour autant : le compte est créé
        }

        await deleteApp(secondary).catch(() => {});

        // Ecritures Firestore
        await setDoc(doc(db, "users", uid), {
          email,
          role: "particulier",
          firstName: client.prenom.trim(),
          lastName: client.nom.trim(),
          telephone: client.telephone?.trim() || null,
          createdAt: serverTimestamp(),
          loginMethod: "email",
          settings: {
            defaultLanguage: client.langue,
          }
        });

        const clientPayload = buildComputedPayload({
          ...client,
          email,
          prenom: client.prenom.trim(),
          nom: client.nom.trim(),
          creeLe: serverTimestamp(),
          createdBy: user.uid,
        });

        await setDoc(doc(db, "clients", uid), {
          ...clientPayload,
          coachIds: [user.uid],
        });

        toast({
          title: t("clientCreation.save"),
          description: "Un e-mail de configuration du mot de passe a été envoyé par Firebase.",
          status: "success",
          duration: 7000
        });

        setClient(initialClientState);
        onCreated?.(); onClose?.();
      } catch (error) {
        console.error("Client creation failed:", error);
        toast({
          title: t("errors.update_error") || "Erreur lors de la création/liaison du client",
          description: error?.message || String(error),
          status: "error",
          duration: 7000
        });
      } finally {
        setLoading(false);
      }
      return;
    }

    // --- Méthode téléphone (invitation) ---
    if (client.loginMethod === "phone") {
      if (!client.telephone) {
        toast({ title: t("clientCreation.phone"), description: t("errors.missingPhone") || "Numéro de téléphone requis", status: "error", duration: 4000 });
        setLoading(false);
        return;
      }
      try {
        const pseudoUid = `tel_${client.telephone.replace(/\D/g, "")}`;
        await setDoc(doc(db, "users", pseudoUid), {
          phone: client.telephone,
          role: "particulier",
          firstName: client.prenom.trim(),
          lastName: client.nom.trim(),
          email: (client.email || "").trim() || null,
          createdAt: serverTimestamp(),
          loginMethod: "phone",
          invitePending: true,
          settings: { defaultLanguage: client.langue }
        });

        const clientPayload = buildComputedPayload({
          ...client,
          email: (client.email || "").trim(),
          prenom: client.prenom.trim(),
          nom: client.nom.trim(),
          creeLe: serverTimestamp(),
          createdBy: user.uid,
          invitePending: true,
        });

        await setDoc(doc(db, "clients", pseudoUid), {
          ...clientPayload,
          coachIds: [user.uid],
        });

        toast({
          title: t("clientCreation.save"),
          description: "Le client activera son compte lors de sa 1ère connexion.",
          status: "success", duration: 7000
        });
        setClient(initialClientState);
        onCreated?.(); onClose?.();
      } catch (error) {
        toast({ title: t("errors.update_error") || "Erreur lors de la création du client", description: error.message, status: "error", duration: 6000 });
      } finally {
        setLoading(false);
      }
    }
  };

  /* offline-only (pas d’email) */
  const handleNoAccessConfirm = async () => {
    if (!pendingOfflineClient || !user?.uid) { onNoAccessClose(); return; }
    setLoading(true);
    const c = pendingOfflineClient;
    const pseudoUid = `offline_${c.prenom.trim().toLowerCase()}_${c.nom.trim().toLowerCase()}_${Date.now()}`;
    try {
      const clientPayload = buildComputedPayload({
        ...c,
        email: "",
        creeLe: serverTimestamp(),
        createdBy: user.uid,
        offlineOnly: true,
      });
      await setDoc(doc(db, "clients", pseudoUid), {
        ...clientPayload,
        coachIds: [user.uid],
      });
      toast({ title: t("clientCreation.save"), description: t("clientCreation.modalNoAccessText"), status: "info", duration: 7000 });
      setClient(initialClientState);
      setPendingOfflineClient(null);
      onCreated?.(); onClose?.();
    } catch (error) {
      toast({ title: t("errors.update_error") || "Erreur lors de la création du client", description: error.message, status: "error", duration: 6000 });
    } finally {
      setLoading(false); onNoAccessClose();
    }
  };

  /* UI */
  const cardBg = useColorModeValue("gray.50", "gray.700");
  const weightPlaceholder = weightUnit === "kg" ? `${t("clientCreation.weight")} (kg)` : `${t("clientCreation.weight")} (lbs)`;
  const heightPlaceholderCm = `${t("clientCreation.height")} (cm)`;

  return (
    <Box bg={cardBg} p={6} borderRadius="lg" boxShadow="md">
      {!hideTitle && <Heading size="md" mb={4}>{t("clientCreation.title")}</Heading>}

      <form onSubmit={handleSubmit}>
        <VStack spacing={4}>
          <FormControl isRequired>
            <FormLabel>{t("clientCreation.loginMethod")}</FormLabel>
            <Select name="loginMethod" value={client.loginMethod} onChange={handleChange}>
              <option value="email">{t("clientCreation.loginMethodEmail")}</option>
              <option value="phone">{t("clientCreation.loginMethodPhone")}</option>
            </Select>
          </FormControl>

          <HStack w="full">
            <Input name="prenom" placeholder={t("clientCreation.firstName")} value={client.prenom} onChange={handleChange} required />
            <Input name="nom" placeholder={t("clientCreation.lastName")} value={client.nom} onChange={handleChange} required />
          </HStack>

          {client.loginMethod === "email" && (
            <Input type="email" name="email" placeholder={t("clientCreation.email")} value={client.email} onChange={handleChange} />
          )}
          {client.loginMethod === "phone" && (
            <Input type="tel" name="telephone" placeholder={t("clientCreation.phone")} value={client.telephone} onChange={handleChange} required />
          )}
          {client.loginMethod === "email" && (
            <Input name="telephone" placeholder={t("clientCreation.phoneOptional")} value={client.telephone} onChange={handleChange} />
          )}

          <HStack w="full">
            <Input type="date" name="dateNaissance" value={client.dateNaissance} onChange={handleChange} />
            <Select name="sexe" value={client.sexe} onChange={handleChange} required>
              <option value="">{t("clientCreation.gender")}</option>
              <option value="Homme">{t("clientCreation.genderMale")}</option>
              <option value="Femme">{t("clientCreation.genderFemale")}</option>
            </Select>
          </HStack>

          {/* Taille */}
          <FormControl>
            <FormLabel>{t("clientCreation.height")}</FormLabel>
            {heightUnit === "cm" ? (
              <HStack>
                <Input placeholder={heightPlaceholderCm} type="number" inputMode="decimal" step="1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                <Select w="28" value={heightUnit} onChange={(e) => onHeightUnitChange(e.target.value)}>
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </Select>
              </HStack>
            ) : (
              <HStack>
                <Input placeholder="ft" type="number" inputMode="numeric" step="1" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} />
                <Input placeholder="in" type="number" inputMode="numeric" step="1" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
                <Select w="28" value={heightUnit} onChange={(e) => onHeightUnitChange(e.target.value)}>
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </Select>
              </HStack>
            )}
          </FormControl>

          {/* Poids */}
          <FormControl>
            <FormLabel>{t("clientCreation.weight")}</FormLabel>
            <HStack>
              <Input name="poids" placeholder={weightPlaceholder} type="number" inputMode="decimal" step={weightUnit === "kg" ? "0.1" : "1"} value={client.poids} onChange={handleChange} />
              <Select w="28" value={weightUnit} onChange={(e) => onWeightUnitChange(e.target.value)}>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </Select>
            </HStack>
          </FormControl>

          <Select name="niveauSportif" value={client.niveauSportif} onChange={handleChange} required>
            {levelOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>

          <Select name="objectifs" value={client.objectifs} onChange={handleChange} required>
            {objectiveOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>

          <Select name="langue" value={client.langue} onChange={handleChange}>
            {languageOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </Select>

          <Textarea name="notes" placeholder={t("clientCreation.notes")} value={client.notes} onChange={handleChange} />

          <Button type="submit" colorScheme="blue" w="full" isLoading={loading}>
            {t("clientCreation.save")}
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
            <Button onClick={handleNoAccessConfirm} colorScheme="blue" isLoading={loading}>OK</Button>
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
            <Box mt={3} p={3} bg="gray.100" borderRadius="md">
              <Text>{t("clientCreation.firstName")} : {mergeClient?.prenom}</Text>
              <Text>{t("clientCreation.lastName")} : {mergeClient?.nom}</Text>
              <Text>{t("clientCreation.notes")} : {mergeClient?.notes}</Text>
            </Box>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="green" mr={3} onClick={handleMerge}>{t("clientCreation.modalConfirm")}</Button>
            <Button variant="ghost" onClick={onMergeClose}>{t("clientCreation.modalCancel")}</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default ClientCreation;

