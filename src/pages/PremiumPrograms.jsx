// src/pages/PremiumPrograms.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Heading, Text, Button, HStack, Badge, Spinner, Icon,
  useColorModeValue, useToast, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Divider, SimpleGrid, Stack,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";
import {
  MdFitnessCenter,
  MdOutlineAccessTime,
  MdOutlineAccessibilityNew,
  MdOutlineDirectionsRun,
  MdOutlineFavorite,
  MdOutlineFlashOn,
  MdOutlineLocalFireDepartment,
  MdOutlineSelfImprovement,
  MdOutlineTrendingUp,
  MdOutlineWorkspacePremium,
} from "react-icons/md";
import { useAppTheme } from "../styles/appTheme";
import PageBackButton from "../components/ui/PageBackButton";
import { formatProgramActiveWeeks } from "../utils/programDuration";
import { estimateSessionDurationSeconds } from "../utils/trainingEngine";

// ✅ helper HTTP centralisé (gère la base /api et credentials)
import { apiFetch } from "../utils/api";

/* ---------- Helpers ---------- */
const fmtPrice = (n, lng = "fr", currency = "EUR") => {
  const v = Number(n);
  if (!isFinite(v)) return null;
  try {
    return new Intl.NumberFormat(lng, { style: "currency", currency }).format(v);
  } catch {
    return v.toFixed(2).replace(".", ",") + " €";
  }
};
const getProgrammeDisplayName = (p) =>
  p?.name || p?.nomProgramme || p?.title || p?.objectif || "Programme";
const langKey = (lng) => String(lng || "fr").split("-")[0];
const trValue = (entity, field, lng) =>
  entity?.translations?.[langKey(lng)]?.[field] ||
  entity?.translations?.fr?.[field] ||
  entity?.[field] ||
  null;
const trArray = (entity, field, lng) => {
  const translated = entity?.translations?.[langKey(lng)]?.[field] || entity?.translations?.fr?.[field];
  return Array.isArray(translated) ? translated : (Array.isArray(entity?.[field]) ? entity[field] : []);
};
const trProgramName = (p, lng) =>
  trValue(p, "name", lng) || trValue(p, "nomProgramme", lng) || trValue(p, "title", lng) || getProgrammeDisplayName(p);
const trProgramDesc = (p, lng, fallback) =>
  trValue(p, "cardDesc", lng) || trValue(p, "shortDesc", lng) || trValue(p, "recap", lng) || fallback;
const normalizeGoalLabel = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const getPremiumGoalIcon = (program) => {
  const goal = normalizeGoalLabel(
    program?.objectif ||
    program?.goal ||
    program?.translations?.fr?.objectif ||
    program?.translations?.fr?.goal
  );

  if (goal.includes("perte") || goal.includes("seche") || goal.includes("poids") || goal.includes("weight")) {
    return MdOutlineLocalFireDepartment;
  }
  if (goal.includes("mobil") || goal.includes("posture") || goal.includes("souplesse")) {
    return MdOutlineSelfImprovement;
  }
  if (goal.includes("cardio") || goal.includes("endurance") || goal.includes("conditioning")) {
    return MdOutlineDirectionsRun;
  }
  if (goal.includes("reprise") || goal.includes("forme") || goal.includes("bien-etre") || goal.includes("bien etre")) {
    return MdOutlineFavorite;
  }
  if (goal.includes("core") || goal.includes("gainage") || goal.includes("abdos")) {
    return MdOutlineAccessibilityNew;
  }
  if (goal.includes("hybride") || goal.includes("athlet") || goal.includes("performance")) {
    return MdOutlineFlashOn;
  }
  if (goal.includes("force") || goal.includes("renforcement")) {
    return MdOutlineTrendingUp;
  }
  return MdFitnessCenter;
};

function getAvgDurationRounded15FromSessions(sessions) {
  if (!sessions) return null;
  let totalSec = 0;
  let count = 0;
  if (Array.isArray(sessions)) {
    sessions.forEach((sess) => {
      const seconds = estimateSessionDurationSeconds(sess);
      if (seconds > 0) {
        totalSec += seconds;
        count += 1;
      }
    });
  } else if (typeof sessions === "object") {
    Object.values(sessions).forEach((sess) => {
      const seconds = estimateSessionDurationSeconds(sess);
      if (seconds > 0) {
        totalSec += seconds;
        count += 1;
      }
    });
  }
  if (totalSec <= 0 || count === 0) return null;
  const avgSec = totalSec / count;
  const avgMin = Math.ceil(avgSec / 60);
  return Math.ceil(avgMin / 15) * 15;
}

/* ---------- Modale Détails ---------- */
function PremiumDetailsModal({
  isOpen, onClose, program, loadingDetails, onBuy, onClaimFree, freeAvailable, requireLogin
}) {
  const { t, i18n } = useTranslation("common");
  const muted = useColorModeValue('gray.600', 'gray.300');
  const sectionBorder = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)");
  if (!program) return null;

  const goal = program.goal ?? program.objectif ?? null;
  const level = program.level ?? program.niveauSportif ?? null;
  const sessionsPerWeek = program.sessionsPerWeek ?? program.nbSeances ?? null;
  const durWeeks = program.activeWeeks ?? program.durationWeeks ?? null;
  const location = program.location ?? null;
  const durMin = program._avgDurationMin ?? program.durationPerSessionMin ?? null;

  const hasPromo = Boolean(program?.isPromo && program?.promoPriceEUR);
  const lng = i18n.resolvedLanguage || i18n.language || "fr";
  const title = trProgramName(program, lng);
  const desc  = trValue(program, "recap", lng) || trValue(program, "shortDesc", lng) || t("premium.subtitle");

  const normal = fmtPrice(program?.priceEUR);
  const promo  = fmtPrice(program?.promoPriceEUR);
  const sessions = Array.isArray(program.sessions) ? program.sessions : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="3xl" isCentered scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent overflow="hidden" rounded="2xl">
        <ModalHeader>{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <HStack spacing={2} mb={2} wrap="wrap">
            {goal && <Badge colorScheme="purple">{trValue(program, "objectif", lng) || trValue(program, "goal", lng) || goal}</Badge>}
            {level && <Badge>{trValue(program, "niveauSportif", lng) || trValue(program, "level", lng) || level}</Badge>}
            {location && <Badge variant="subtle">{trValue(program, "location", lng) || location}</Badge>}
            {sessionsPerWeek && <Badge variant="outline">{sessionsPerWeek} {t("premium.per_week_short")}</Badge>}
            {durMin && <Badge variant="outline">≈ {durMin} {t("premium.min")}</Badge>}
            {durWeeks && <Badge variant="outline">{durWeeks} {t("premium.weeks_short")}</Badge>}
          </HStack>

          <Box mb={3} lineHeight="1.05">
            {freeAvailable ? (
              <Text fontWeight="bold" fontSize="xl" color="green.400">{t("premium.free")}</Text>
            ) : hasPromo && promo ? (
              <>
                {normal && (
                  <Text as="div" color={muted} textDecoration="line-through" fontSize="sm" whiteSpace="nowrap">
                    {normal}
                  </Text>
                )}
                <Text as="div" fontWeight="bold" fontSize="xl" color="blue.400" whiteSpace="nowrap">
                  {promo}
                </Text>
              </>
            ) : (
              <Text fontWeight="bold" fontSize="xl" color="blue.400" whiteSpace="nowrap">
                {normal || t("premium.price_on_stripe")}
              </Text>
            )}
          </Box>

          {loadingDetails ? (
            <HStack mt={2}><Spinner size="sm" /><Text color={muted}>{t("common.loading_details")}</Text></HStack>
          ) : (
            <Text color={muted}>{desc}</Text>
          )}

          {!!sessions.length && (
            <Stack spacing={3} mt={5}>
              {sessions.map((session, index) => (
                <Box
                  key={`${session?.title || session?.name || index}-${index}`}
                  border="1px solid"
                  borderColor={sectionBorder}
                  borderRadius="lg"
                  px={4}
                  py={3}
                >
                  <Text fontWeight="900">
                    {index + 1}. {trValue(session, "title", lng) || trValue(session, "name", lng) || `Séance ${index + 1}`}
                  </Text>
                  {!!trArray(session, "focus", lng).length && (
                    <Text color={muted} fontSize="sm">{trArray(session, "focus", lng).join(" · ")}</Text>
                  )}
                  {(trValue(session, "preview", lng) || trValue(session, "description", lng)) && (
                    <Text color={muted} fontSize="sm" mt={1}>
                      {trValue(session, "preview", lng) || trValue(session, "description", lng)}
                    </Text>
                  )}
                </Box>
              ))}
              <Box border="1px solid" borderColor={sectionBorder} borderRadius="lg" p={4}>
                <Text fontWeight="900">{t("premium.previewLockedTitle", "Contenu détaillé inclus après achat")}</Text>
                <Text color={muted} fontSize="sm" mt={1}>
                  {t(
                    "premium.previewLockedText",
                    "L'échauffement, les exercices, les séries, les temps de repos et le retour au calme sont débloqués dans ton espace après l'achat."
                  )}
                </Text>
              </Box>
            </Stack>
          )}
        </ModalBody>

        <Divider />
        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose}>{t("actions.close")}</Button>
            {freeAvailable ? (
              <Button colorScheme="green" onClick={onClaimFree} isDisabled={requireLogin}>
                {t("premium.claim_free")}
              </Button>
            ) : (
              <Button colorScheme="blue" onClick={onBuy} isDisabled={requireLogin}>
                {t("actions.buy_now")}
              </Button>
            )}
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/* ================= Component ================= */
export default function PremiumPrograms(){
  const { t, i18n } = useTranslation("common");
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const theme = useAppTheme();
  const lng = i18n.resolvedLanguage || "fr";

  const [premium, setPremium] = useState([]);
  const [loading, setLoading] = useState(true);

  // Éligibilité “1er premium gratuit”
  const [elig, setElig] = useState(null);
  const [claimedLocal, setClaimedLocal] = useState(null);

  const [isPremOpen, setPremOpen] = useState(false);
  const [selectedPrem, setSelectedPrem] = useState(null);
  const [loadingPremDetails, setLoadingPremDetails] = useState(false);

  const headerPanelBg = useColorModeValue(
    "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(239,246,255,0.86))",
    "linear-gradient(135deg, rgba(13,19,32,0.96), rgba(12,28,48,0.78))"
  );
  const cardPanelBg = useColorModeValue(
    "rgba(255,255,255,0.86)",
    "rgba(255,255,255,0.045)"
  );
  const headerShadow = useColorModeValue("0 18px 50px rgba(15,23,42,0.07)", "0 18px 55px rgba(0,0,0,0.24)");
  const programCardShadow = useColorModeValue("0 16px 42px rgba(15,23,42,0.06)", "0 18px 54px rgba(0,0,0,0.22)");
  const oldPriceColor = useColorModeValue("gray.500","gray.400");
  const accents = [theme.accentBlue, theme.accentGreen, "#F59E0B", "#A78BFA"];

  const freeAvailable = useMemo(() => {
    if (elig && typeof elig.freeAvailable === "boolean") return elig.freeAvailable;
    if (claimedLocal == null) return true;
    return !claimedLocal;
  }, [elig, claimedLocal]);

  // Chargement (catalogue affiché même hors session)
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (user) {
          // éligibilité
          try {
            const qs = new URLSearchParams({ uid: user.uid, email: user.email || "" }).toString();
            const d = await apiFetch(`/payments/free-eligibility?${qs}`);
            if (d?.ok) setElig(d); else setElig(null);
          } catch {
            setElig(null);
          }

          // fallback “déjà réclamé” depuis Firestore
          try{
            const snap = await getDoc(doc(db,"users", user.uid));
            if (snap.exists()) {
              const ud = snap.data()||{};
              const claimed =
                ud?.premiumFirstClaimed === true ||
                ud?.firstPremiumClaimed === true ||
                !!ud?.premiumFirstClaimAt ||
                !!ud?.firstPremiumClaimAt;
              setClaimedLocal(!!claimed);
            } else {
              setClaimedLocal(null);
            }
          } catch { setClaimedLocal(null); }
        } else {
          setElig(null);
          setClaimedLocal(null);
        }

        // Catalogue: API backend d'abord pour éviter les différences de règles Firestore côté client.
        let catalog = [];
        try {
          const data = await apiFetch("/payments/premium-programs");
          catalog = Array.isArray(data?.programs) ? data.programs : [];
        } catch (apiError) {
          console.warn("[PremiumPrograms] backend premium fetch failed, fallback Firestore", apiError);
          const q1 = query(collection(db,"programmes"), where("origine","==","premium"));
          const q2 = query(collection(db,"programmes"), where("isPremiumOnly","==",true));
          const [s1,s2] = await Promise.all([
            getDocs(q1).catch((e)=>{ console.warn("[PremiumPrograms] origine query failed", e); return null; }),
            getDocs(q2).catch((e)=>{ console.warn("[PremiumPrograms] isPremiumOnly query failed", e); return null; }),
          ]);
          const map=new Map();
          for(const s of [s1,s2]){ if(!s) continue; s.docs.forEach(d=>map.set(d.id,{id:d.id, ...d.data()})); }
          catalog = Array.from(map.values());
        }

        const rows = catalog
          .filter(p => (p?.isActive ?? true))
          .map(p => ({
            ...p,
            _avgDurationMin: Math.max(
              getAvgDurationRounded15FromSessions(p.sessions) ?? 0,
              Number(p.durationPerSessionMin) || 0
            ) || null
          }))
          .sort((a,b)=>(a?.featuredRank ?? 999)-(b?.featuredRank ?? 999));
        setPremium(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  /* ---------- Actions ---------- */
  const requireLogin = !user;

  const handleBuy = async (prog) => {
    if (requireLogin) { navigate("/login"); return; }
    try {
      const data = await apiFetch('/payments/create-checkout-session', {
        method: "POST",
        body: JSON.stringify({
          mode: "payment",
          type: "premium",
          programId: prog.id,
          ...(prog?.stripePriceId ? { priceId: prog.stripePriceId } : {}),
          firebaseUid: user.uid,
          customer_email: user.email,
          frontendBaseUrl: window.location.origin, // ✅ pour que Stripe revienne sur le bon domaine
        }),
      });
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Unexpected Stripe response.");
      }
    } catch(e){
      toast({ status:"error", description: t("errors.payment_failed") + (e.message||e) });
    }
  };

  const handleClaimFree = async (prog) => {
    if (requireLogin) { navigate("/login"); return; }
    try {
      const data = await apiFetch('/payments/claim-first-free', {
        method: "POST",
        body: JSON.stringify({ firebaseUid: user.uid, programId: prog.id }),
      });

      if (data?.ok !== true) throw new Error(data?.error || "unknown-error");

      // succès → re-check
      try{
        const qs = new URLSearchParams({ uid:user.uid, email:user.email||"" }).toString();
        const chk = await apiFetch(`/payments/free-eligibility?${qs}`);
        if (chk?.ok) setElig(chk); else setElig({ freeAvailable:false, claimed:true, ownsPremium:true });
      }catch{
        setElig({ freeAvailable:false, claimed:true, ownsPremium:true });
      }

      toast({ status:"success", description: t("premium.added_to_yours") });
      navigate("/user-dashboard");
    } catch(err){
      if (String(err?.message||"").includes("already")) {
        setElig(prev => ({ ...(prev||{}), freeAvailable:false, claimed:true, ownsPremium:true }));
        toast({ status:"warning", description: t("premium.cannot_add_free") + "already used" });
        return;
      }
      toast({ status:"error", description: t("premium.cannot_add_free") + (err.message||err) });
    }
  };

  const openPremDetails = async (p) => {
    setSelectedPrem(p);
    setPremOpen(true);
    setLoadingPremDetails(true);
    try {
      const ref = doc(db, 'programmes', p.id);
      const full = await getDoc(ref);
      if (full.exists()) {
        const data = full.data();
        const avg = getAvgDurationRounded15FromSessions(data.sessions);
        const duration = Math.max(avg ?? 0, Number(data?.durationPerSessionMin) || 0) || null;
        setSelectedPrem(prev => ({
          ...prev,
          ...data,
          _avgDurationMin: (duration ?? prev?._avgDurationMin ?? null)
        }));
      }
    } finally {
      setLoadingPremDetails(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <Box bg={theme.pageBg} minH="100vh" px={{ base: 4, md: 8 }} py={{ base: 6, md: 10 }}>
      <Box maxW="1180px" mx="auto">
        <HStack mb={4}>
          <PageBackButton fallbackTo="/user-dashboard" label={t("programView.back", "Retour")} />
          <Text color={theme.mutedText} fontWeight="800" fontSize="sm">
            {t("programView.back", "Retour")}
          </Text>
        </HStack>
        <Box
          bg={headerPanelBg}
          border="1px solid"
          borderColor={theme.borderColor}
          borderRadius={{ base: "18px", md: "22px" }}
          px={{ base: 5, md: 7 }}
          py={{ base: 5, md: 6 }}
          mb={6}
          boxShadow={headerShadow}
        >
          <HStack justify="space-between" align={{ base: "flex-start", md: "center" }} spacing={4} flexWrap="wrap">
            <Box>
              <HStack spacing={3} mb={3}>
                <Box
                  w="38px"
                  h="38px"
                  borderRadius="12px"
                  display="grid"
                  placeItems="center"
                  bg="rgba(59,130,246,0.14)"
                  color={theme.accentBlue}
                >
                  <Icon as={MdOutlineWorkspacePremium} boxSize={5} />
                </Box>
                <Badge bg="rgba(59,130,246,0.14)" color={theme.accentBlue} borderRadius="full" px={3} py={1}>
                  {t("premium.title")}
                </Badge>
              </HStack>
              <Heading size={{ base: "lg", md: "xl" }} mb={2} color={theme.textColor} letterSpacing="0">
                {t("premium.title")}
              </Heading>
              <Text color={theme.mutedText} maxW="660px" fontSize={{ base: "sm", md: "md" }}>
                {t("premium.subtitle")}
              </Text>
            </Box>
            <Box
              minW={{ base: "100%", sm: "170px" }}
              px={4}
              py={3}
              borderRadius="16px"
              bg={cardPanelBg}
              border="1px solid"
              borderColor={theme.borderColor}
            >
              <Text fontSize="xs" color={theme.subtleText} fontWeight="800" textTransform="uppercase">
                {t("premium.catalog", "Catalogue")}
              </Text>
              <Text color={theme.textColor} fontWeight="900" fontSize="2xl" lineHeight="1">
                {loading ? "..." : premium.length}
              </Text>
            </Box>
          </HStack>
        </Box>

      {loading ? (
        <HStack {...theme.tileProps} p={5}><Spinner /><Text color={theme.mutedText}>{t("common.loading")}</Text></HStack>
      ) : premium.length === 0 ? (
        <Box {...theme.tileProps} p={6}>
          <Text color={theme.textColor} fontWeight="800">
            {t("premium.emptyTitle", "Aucun programme disponible")}
          </Text>
          <Text color={theme.mutedText} mt={1}>
            {t("premium.emptyText", "Les programmes premium apparaîtront ici dès qu'ils seront actifs.")}
          </Text>
        </Box>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
          {premium.map((p, idx) => {
            const hasPromo = Boolean(p?.isPromo && p?.promoPriceEUR);
            const normal = fmtPrice(p?.priceEUR, lng);
            const promo  = fmtPrice(p?.promoPriceEUR, lng);
            const title  = trProgramName(p, lng);
            const desc   = trProgramDesc(p, lng, t("premium.subtitle"));
            const cover = p.coverUrl || p.imageUrl || p.thumbnailUrl || p.photoUrl || null;
            const accent = accents[idx % accents.length];
            const GoalIcon = getPremiumGoalIcon(p);
            const activeWeeksLabel = formatProgramActiveWeeks(p, t);

            return (
              <Box
                key={p.id || idx}
                bg={theme.surfaceBgStrong}
                border="1px solid"
                borderColor={theme.borderColor}
                borderRadius="18px"
                p={4}
                boxShadow={programCardShadow}
                _hover={{ transform: "translateY(-3px)", borderColor: accent }}
                transition="transform 160ms ease, border-color 160ms ease"
                display="flex"
                flexDirection="column"
                h="100%"
              >
                <Stack spacing={4} flex="1">
                  <HStack justify="space-between" align="flex-start" spacing={3}>
                    <Box
                      w="54px"
                      h="54px"
                      borderRadius="16px"
                      display="grid"
                      placeItems="center"
                      bg={cover ? `linear-gradient(rgba(7,11,20,0.18), rgba(7,11,20,0.42)), url(${cover}) center/cover` : `${accent}22`}
                      border="1px solid"
                      borderColor={`${accent}55`}
                      color={cover ? "white" : accent}
                      flexShrink={0}
                    >
                      <Icon as={GoalIcon} boxSize={6} />
                    </Box>
                    <Stack spacing={1} align="flex-end">
                      {freeAvailable && (
                        <Badge bg="rgba(16,185,129,0.16)" color={theme.accentGreen} borderRadius="full" px={3} py={1}>
                          {t("premium.free_badge")}
                        </Badge>
                      )}
                      <Icon as={MdOutlineWorkspacePremium} color={theme.subtleText} boxSize={6} />
                    </Stack>
                  </HStack>

                  <HStack spacing={2} wrap="wrap">
                    {p.objectif && <Badge bg={`${accent}22`} color={accent}>{trValue(p, "objectif", lng) || p.objectif}</Badge>}
                    {p.niveauSportif && <Badge bg="rgba(255,255,255,0.08)" color={theme.mutedText}>{trValue(p, "niveauSportif", lng) || p.niveauSportif}</Badge>}
                    {p.nbSeances && (
                      <Badge variant="outline" borderColor={theme.borderStrong} color={theme.mutedText}>
                        <HStack spacing={1}>
                          <Icon as={MdOutlineAccessTime} />
                          <Text as="span">{p.nbSeances} {t("premium.per_week_short")}</Text>
                        </HStack>
                      </Badge>
                    )}
                    {activeWeeksLabel && (
                      <Badge variant="outline" borderColor={theme.borderStrong} color={theme.mutedText}>
                        {activeWeeksLabel}
                      </Badge>
                    )}
                  </HStack>

                  <Box>
                    <Heading size="md" mb={2} color={theme.textColor} letterSpacing="0" lineHeight="1.2">{title}</Heading>
                    <Text color={theme.mutedText} noOfLines={3} minH="70px" lineHeight="1.55" fontSize="sm">
                      {desc}
                    </Text>
                  </Box>

                  <Box mt="auto" pt={2} borderTop="1px solid" borderColor={theme.borderColor}>
                    <HStack justify="space-between" align="center" mb={4} pt={4}>
                      <Box lineHeight="1.05">
                        {freeAvailable ? (
                          <Text as="div" fontWeight="900" fontSize="xl" color={theme.accentGreen}>{t("premium.free")}</Text>
                        ) : hasPromo && promo ? (
                          <>
                            {normal && (
                              <Text as="div" color={oldPriceColor}
                                    textDecoration="line-through" fontSize="sm" whiteSpace="nowrap">
                                {normal}
                              </Text>
                            )}
                            <Text as="div" fontWeight="900" fontSize="2xl" color={accent} whiteSpace="nowrap">
                              {promo}
                            </Text>
                          </>
                        ) : (
                          <Text as="div" fontWeight="900" fontSize="2xl" color={accent} whiteSpace="nowrap">
                            {normal || t("premium.price_on_stripe")}
                          </Text>
                        )}
                      </Box>
                    </HStack>

                    <Stack direction={{ base: "column", sm: "row" }} spacing={3}>
                      <Button variant="outline" borderColor={theme.borderStrong} color={theme.textColor} onClick={() => openPremDetails(p)} flex="1" borderRadius="12px">
                        {t("actions.view_details")}
                      </Button>
                      {freeAvailable ? (
                        <Button {...theme.primaryButtonProps} bg={theme.accentGreen} borderRadius="12px" _hover={{ bg: "#059669", transform: "translateY(-1px)" }} onClick={() => handleClaimFree(p)} flex="1">
                          {t("premium.claim_free")}
                        </Button>
                      ) : (
                        <Button {...theme.primaryButtonProps} borderRadius="12px" onClick={() => handleBuy(p)} flex="1">
                          {t("actions.buy_now")}
                        </Button>
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            );
          })}
        </SimpleGrid>
      )}
      </Box>

      {/* MODALE DÉTAILS */}
      <PremiumDetailsModal
        isOpen={isPremOpen}
        onClose={() => { setPremOpen(false); setSelectedPrem(null); setLoadingPremDetails(false); }}
        program={selectedPrem}
        loadingDetails={loadingPremDetails}
        onBuy={() => selectedPrem && (requireLogin ? navigate("/login") : handleBuy(selectedPrem))}
        onClaimFree={() => selectedPrem && (requireLogin ? navigate("/login") : handleClaimFree(selectedPrem))}
        freeAvailable={freeAvailable}
        requireLogin={!user}
      />
    </Box>
  );
}
