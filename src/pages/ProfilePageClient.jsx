// src/pages/ProfilePageClient.jsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  FormControl,
  FormLabel,
  Input,
  Button,
  Stack,
  useToast,
  Spinner,
  Select,
  HStack,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from "@chakra-ui/react";
import { useAuth } from "../AuthContext";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useTranslation } from "react-i18next";

// 🔐 Firebase Auth (email + reauth)
import {
  getAuth,
  updateEmail as updateAuthEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
  sendEmailVerification,
} from "firebase/auth";

/* ---- conversions identiques à ClientCreation.jsx ---- */
const KG_PER_LB = 0.45359237;
const IN_PER_FT = 12;
const CM_PER_IN = 2.54;
const toNumber = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/* ---------- Langues (codes ISO + libellés UI) ---------- */
const LANGS = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "es", label: "Español" },
  { code: "ru", label: "Русский" },
  { code: "ar", label: "العربية" },
];
const codeFromAny = (val) => {
  if (!val) return "fr";
  const hit =
    LANGS.find((l) => l.code === val) ||
    LANGS.find((l) => l.label?.toLowerCase() === String(val).toLowerCase());
  return hit?.code || "fr";
};
const labelFromCode = (code) =>
  LANGS.find((l) => l.code === code)?.label || "Français";

export default function ProfilePageClient() {
  const { t, i18n } = useTranslation("common");
  const { user } = useAuth();
  const auth = getAuth();
  const toast = useToast();

  const [isLoading, setLoading] = useState(true);

  // unités & taille/poids
  const [heightUnit, setHeightUnit] = useState("cm"); // "cm" | "ft"
  const [weightUnit, setWeightUnit] = useState("kg"); // "kg" | "lbs"
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");

  // 🔤 langue (on stocke le code) + le reste du formulaire
  const [langCode, setLangCode] = useState("fr");
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dateNaissance: "",
    sexe: "",
    poids: "",
    niveauSportif: "Débutant",
    objectifs: "Perte de poids",
    notes: "",
  });

  const [initialEmail, setInitialEmail] = useState("");

  // Modal re-auth
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthPwd, setReauthPwd] = useState("");
  const [pendingNewEmail, setPendingNewEmail] = useState("");

  /* ---------- applyLanguage: change toute l'appli immédiatement ---------- */
  const applyLanguage = (code) => {
    const next = codeFromAny(code);
    i18n.changeLanguage(next);
    localStorage.setItem("i18nextLng", next);
    // RTL pour arabe
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
      document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    }
  };

  /* ---------- Chargement initial users/{uid} + clients/{uid} ---------- */
  useEffect(() => {
    if (!user?.uid) return;
    const load = async () => {
      try {
        const usersRef = doc(db, "users", user.uid);
        const clientsRef = doc(db, "clients", user.uid);
        const [userSnap, clientSnap] = await Promise.all([
          getDoc(usersRef),
          getDoc(clientsRef),
        ]);

        if (userSnap.exists()) {
          const u = userSnap.data();
          setForm((prev) => ({
            ...prev,
            firstName: u.firstName || "",
            lastName: u.lastName || "",
            email: u.email || "",
            phone: u.telephone || u.phone || "",
          }));
          setInitialEmail(u.email || "");
        }

        if (clientSnap.exists()) {
          const c = clientSnap.data();

          // unités (défaut cm/kg)
          const units = c?.settings?.units || { height: "cm", weight: "kg" };
          setHeightUnit(units.height === "ft" ? "ft" : "cm");
          setWeightUnit(units.weight === "lbs" ? "lbs" : "kg");

          // taille
          const cm = c.heightCm ?? (c.taille ?? null);
          if (cm != null) {
            if (units.height === "cm") setHeightCm(String(cm));
            else {
              const totalIn = cm / CM_PER_IN;
              const ft = Math.floor(totalIn / IN_PER_FT);
              const inch = Math.round(totalIn - ft * IN_PER_FT);
              setHeightFt(String(ft));
              setHeightIn(String(inch));
            }
          }

          // poids (affiché selon unité)
          const kg = c.weightKg ?? (c.poids != null ? toNumber(c.poids) : null);
          let poidsAffiche = "";
          if (kg != null) {
            poidsAffiche =
              units.weight === "kg"
                ? String(kg)
                : String(Math.round(kg / KG_PER_LB));
          }

          // langue (accepte code, label, ou settings.langCode)
          const loadedCode =
            c?.settings?.langCode ||
            codeFromAny(c?.langue) ||
            codeFromAny(i18n.language);
          setLangCode(loadedCode);
          applyLanguage(loadedCode);

          setForm((prev) => ({
            ...prev,
            dateNaissance: c.dateNaissance || "",
            sexe: c.sexe || "",
            poids: poidsAffiche,
            niveauSportif: c.niveauSportif || prev.niveauSportif,
            objectifs: c.objectifs || prev.objectifs,
            notes: c.notes || "",
            email: prev.email || c.email || "",
            phone: prev.phone || c.telephone || "",
            firstName: prev.firstName || c.prenom || "",
            lastName: prev.lastName || c.nom || "",
          }));
        } else {
          // si pas de doc client, au moins synchroniser i18n sur users/defaultLanguage si dispo
          const next = codeFromAny(i18n.language);
          setLangCode(next);
          applyLanguage(next);
        }
      } catch (error) {
        toast({
          title: t("profile.toasts.load_error_title"),
          description: error?.message || t("profile.toasts.load_error_desc"),
          status: "error",
          isClosable: true,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ---------- Handlers champs ---------- */
  const onField = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

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
    const cur = toNumber(form.poids);
    if (cur != null) {
      const converted =
        next === "kg"
          ? (cur * KG_PER_LB).toFixed(1) // lbs -> kg
          : (cur / KG_PER_LB).toFixed(0); // kg -> lbs
      setForm((c) => ({ ...c, poids: converted }));
    }
    setWeightUnit(next);
  };

  const onLanguageChange = (e) => {
    const next = codeFromAny(e.target.value);
    setLangCode(next);
    applyLanguage(next); // ⬅️ change immédiatement tout le site
  };

  /* ---------- Payload client (conversions) ---------- */
  const buildComputedClientPayload = (emailOverride) => {
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
    const w = toNumber(form.poids);
    const weightKgOut =
      w == null
        ? null
        : weightUnit === "lbs"
        ? +(w * KG_PER_LB).toFixed(1)
        : +(+w).toFixed(1);

    const emailToUse = (emailOverride ?? form.email ?? "").trim();
    const langLabel = labelFromCode(langCode);

    return {
      prenom: form.firstName?.trim() || "",
      nom: form.lastName?.trim() || "",
      email: emailToUse,
      telephone: (form.phone || "").trim(),
      dateNaissance: form.dateNaissance || "",
      sexe: form.sexe || "",
      niveauSportif: form.niveauSportif || "",
      objectifs: form.objectifs || "",
      langue: langLabel, // compat historique
      notes: form.notes || "",
      heightCm: heightCmOut,
      weightKg: weightKgOut,
      settings: {
        units: { height: heightUnit, weight: weightUnit },
        defaultLanguage: langLabel,
        langCode, // ✅ nouveau champ stable
      },
      updatedAt: serverTimestamp(),
    };
  };

  /* ---------- Mise à jour Firestore (users + clients) ---------- */
  const updateFirestoreDocs = async (emailOverride) => {
    const emailToUse = (emailOverride ?? form.email ?? "").trim();
    const usersRef = doc(db, "users", user.uid);
    const clientsRef = doc(db, "clients", user.uid);
    const langLabel = labelFromCode(langCode);

    await updateDoc(usersRef, {
      firstName: form.firstName?.trim(),
      lastName: form.lastName?.trim(),
      email: emailToUse,
      telephone: (form.phone || "").trim(),
      defaultLanguage: langLabel,
      updatedAt: serverTimestamp(),
    });

    const clientPayload = buildComputedClientPayload(emailToUse);
    await updateDoc(clientsRef, clientPayload);
  };

  /* ---------- Submit ---------- */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user?.uid || !auth.currentUser) return;
    setLoading(true);

    try {
      const newEmail = (form.email || "").trim();
      const emailChanged =
        newEmail && initialEmail && newEmail.toLowerCase() !== initialEmail.toLowerCase();

      if (emailChanged) {
        try {
          await updateAuthEmail(auth.currentUser, newEmail);
          await sendEmailVerification(auth.currentUser).catch(() => {});
          await updateFirestoreDocs(newEmail);
          setInitialEmail(newEmail);

          toast({
            status: "success",
            title: t("profile.toasts.updated_title", "Informations mises à jour"),
            description: t(
              "profile.toasts.email_changed",
              "Votre email de connexion a été mis à jour. Vérifiez votre boîte mail pour confirmer."
            ),
          });
        } catch (err) {
          if (err?.code === "auth/requires-recent-login") {
            setPendingNewEmail(newEmail);
            setReauthPwd("");
            setReauthOpen(true);
            return;
          }
          let msg = t("profile.toasts.update_error_desc", "Veuillez réessayer.");
          if (err?.code === "auth/email-already-in-use") {
            msg = t("errors.email_in_use", "Cette adresse e-mail est déjà utilisée.");
          } else if (err?.code === "auth/invalid-email") {
            msg = t("errors.invalid_email", "Adresse e-mail invalide.");
          }
          throw new Error(msg);
        }
      } else {
        await updateFirestoreDocs();
        toast({
          status: "success",
          title: t("profile.toasts.updated_title", "Informations mises à jour"),
          description: t(
            "profile.toasts.updated_desc",
            "Vos informations ont bien été enregistrées."
          ),
        });
      }
    } catch (error) {
      toast({
        status: "error",
        title: t("profile.toasts.update_error_title", "Échec de la mise à jour"),
        description: error?.message || t("profile.toasts.update_error_desc", "Veuillez réessayer."),
      });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Reauth modal confirm ---------- */
  const handleConfirmReauth = async () => {
    if (!auth.currentUser || !pendingNewEmail) {
      setReauthOpen(false);
      return;
    }
    setLoading(true);
    try {
      const cred = EmailAuthProvider.credential(initialEmail, reauthPwd);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await updateAuthEmail(auth.currentUser, pendingNewEmail);
      await sendEmailVerification(auth.currentUser).catch(() => {});
      await updateFirestoreDocs(pendingNewEmail);
      setInitialEmail(pendingNewEmail);
      toast({
        status: "success",
        title: t("profile.toasts.updated_title", "Informations mises à jour"),
        description: t(
          "profile.toasts.email_changed",
          "Votre email de connexion a été mis à jour. Vérifiez votre boîte mail pour confirmer."
        ),
      });
      setReauthOpen(false);
      setPendingNewEmail("");
      setReauthPwd("");
    } catch (err) {
      let msg = t("profile.toasts.update_error_desc", "Veuillez réessayer.");
      if (err?.code === "auth/wrong-password") {
        msg = t("errors.wrong_password", "Mot de passe incorrect.");
      } else if (err?.code === "auth/too-many-requests") {
        msg = t("errors.too_many_requests", "Trop de tentatives, réessayez plus tard.");
      } else if (err?.code === "auth/email-already-in-use") {
        msg = t("errors.email_in_use", "Cette adresse e-mail est déjà utilisée.");
      } else if (err?.code === "auth/invalid-email") {
        msg = t("errors.invalid_email", "Adresse e-mail invalide.");
      }
      toast({ status: "error", title: t("profile.toasts.update_error_title"), description: msg });
    } finally {
      setLoading(false);
    }
  };

  /* ---------- UI ---------- */
  if (isLoading) {
    return (
      <Box p={8} textAlign="center">
        <Spinner size="xl" />
        <Box mt={3}>{t("common.loading", "Chargement…")}</Box>
      </Box>
    );
  }

  const weightPlaceholder =
    weightUnit === "kg"
      ? `${t("clientCreation.weight")} (kg)`
      : `${t("clientCreation.weight")} (lbs)`;
  const heightPlaceholderCm = `${t("clientCreation.height")} (cm)`;

  return (
    <Box p={8} maxW="720px" mx="auto">
      <Heading as="h1" mb={6} textAlign="center">
        {t("profile.title", "Mon profil")}
      </Heading>

      <Box as="form" onSubmit={handleSubmit}>
        <Stack spacing={4}>
          <HStack>
            <FormControl isRequired>
              <FormLabel>{t("profile.labels.firstName")}</FormLabel>
              <Input
                name="firstName"
                value={form.firstName}
                onChange={onField}
                placeholder={t("profile.placeholders.firstName")}
                autoComplete="given-name"
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>{t("profile.labels.lastName")}</FormLabel>
              <Input
                name="lastName"
                value={form.lastName}
                onChange={onField}
                placeholder={t("profile.placeholders.lastName")}
                autoComplete="family-name"
              />
            </FormControl>
          </HStack>

          <FormControl isRequired>
            <FormLabel>{t("profile.labels.email")}</FormLabel>
            <Input
              type="email"
              name="email"
              value={form.email}
              onChange={onField}
              placeholder={t("profile.placeholders.email")}
              autoComplete="email"
            />
          </FormControl>

          <FormControl>
            <FormLabel>{t("profile.labels.phone")}</FormLabel>
            <Input
              name="phone"
              value={form.phone}
              onChange={onField}
              placeholder={t("profile.placeholders.phone")}
              autoComplete="tel"
            />
          </FormControl>

          <HStack>
            <FormControl>
              <FormLabel>{t("clientCreation.birthDate")}</FormLabel>
              <Input
                type="date"
                name="dateNaissance"
                value={form.dateNaissance}
                onChange={onField}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t("clientCreation.gender")}</FormLabel>
              <Select name="sexe" value={form.sexe} onChange={onField}>
                <option value="">{t("common.select", "Sélectionner")}</option>
                <option value="Homme">{t("clientCreation.genderMale")}</option>
                <option value="Femme">{t("clientCreation.genderFemale")}</option>
              </Select>
            </FormControl>
          </HStack>

          {/* Taille */}
          <FormControl>
            <FormLabel>{t("clientCreation.height")}</FormLabel>
            {heightUnit === "cm" ? (
              <HStack>
                <Input
                  placeholder={heightPlaceholderCm}
                  type="number"
                  inputMode="decimal"
                  step="1"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                />
                <Select
                  w="28"
                  value={heightUnit}
                  onChange={(e) => onHeightUnitChange(e.target.value)}
                >
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </Select>
              </HStack>
            ) : (
              <HStack>
                <Input
                  placeholder="ft"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                />
                <Input
                  placeholder="in"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                />
                <Select
                  w="28"
                  value={heightUnit}
                  onChange={(e) => onHeightUnitChange(e.target.value)}
                >
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
              <Input
                name="poids"
                placeholder={
                  weightUnit === "kg"
                    ? `${t("clientCreation.weight")} (kg)`
                    : `${t("clientCreation.weight")} (lbs)`
                }
                type="number"
                inputMode="decimal"
                step={weightUnit === "kg" ? "0.1" : "1"}
                value={form.poids}
                onChange={onField}
              />
              <Select
                w="28"
                value={weightUnit}
                onChange={(e) => onWeightUnitChange(e.target.value)}
              >
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </Select>
            </HStack>
          </FormControl>

          <FormControl>
            <FormLabel>{t("clientCreation.level")}</FormLabel>
            <Select
              name="niveauSportif"
              value={form.niveauSportif}
              onChange={onField}
              required
            >
              <option value="Débutant">{t("clientCreation.levels.beginner")}</option>
              <option value="Intermédiaire">{t("clientCreation.levels.intermediate")}</option>
              <option value="Confirmé">{t("clientCreation.levels.advanced")}</option>
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel>{t("clientCreation.objective")}</FormLabel>
            <Select
              name="objectifs"
              value={form.objectifs}
              onChange={onField}
              required
            >
              <option value="Prise de masse">{t("clientCreation.objectives.gain")}</option>
              <option value="Perte de poids">{t("clientCreation.objectives.loss")}</option>
              <option value="Force">{t("clientCreation.objectives.strength")}</option>
              <option value="Endurance">{t("clientCreation.objectives.endurance")}</option>
              <option value="Remise au sport">{t("clientCreation.objectives.restart")}</option>
              <option value="Postural">{t("clientCreation.objectives.posture")}</option>
            </Select>
          </FormControl>

          {/* 🔤 Langue (code) — change le site instantanément */}
          <FormControl>
            <FormLabel>{t("clientCreation.language")}</FormLabel>
            <Select value={langCode} onChange={onLanguageChange}>
              {LANGS.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </Select>
          </FormControl>

          <FormControl>
            <FormLabel>{t("clientCreation.notes")}</FormLabel>
            <Input
              name="notes"
              value={form.notes}
              onChange={onField}
              placeholder={t("clientCreation.notes")}
            />
          </FormControl>

          <Button type="submit" colorScheme="blue" isLoading={isLoading}>
            {t("profile.actions.save")}
          </Button>
        </Stack>
      </Box>

      {/* Modal reauth pour changement d'email */}
      <Modal isOpen={reauthOpen} onClose={() => setReauthOpen(false)} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t("profile.reauth.title", "Confirmer votre identité")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Stack spacing={3}>
              <Box fontSize="sm" color="gray.600">
                {t(
                  "profile.reauth.body",
                  "Pour modifier votre adresse e-mail, entrez votre mot de passe actuel."
                )}
              </Box>
              <FormControl>
                <FormLabel>{t("auth.password", "Mot de passe")}</FormLabel>
                <Input
                  type="password"
                  value={reauthPwd}
                  onChange={(e) => setReauthPwd(e.target.value)}
                  placeholder="••••••••"
                />
              </FormControl>
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={() => setReauthOpen(false)}>
              {t("common.cancel", "Annuler")}
            </Button>
            <Button colorScheme="blue" onClick={handleConfirmReauth} isLoading={isLoading}>
              {t("common.confirm", "Confirmer")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}

