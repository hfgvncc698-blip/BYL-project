// src/pages/PremiumPrograms.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box, Heading, Text, Button, HStack, Badge, Spinner,
  useColorModeValue, useToast, Modal, ModalOverlay, ModalContent,
  ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Divider, SimpleGrid
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, getDoc, doc, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext";
import { useTranslation } from "react-i18next";

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

function toSeconds(val) {
  if (val == null) return 0;
  if (typeof val === "number" && Number.isFinite(val)) {
    return val > 10000 ? Math.round(val / 1000) : Math.round(val);
  }
  const s = String(val).trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  const parts = s.split(":").map(p => parseInt(p, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
function getAvgDurationRounded15FromSessions(sessions) {
  if (!sessions) return null;
  let totalSec = 0; let count = 0;
  const visitBlockArray = (arr) => {
    if (!Array.isArray(arr)) return;
    for (const ex of arr) {
      if (!ex || typeof ex !== "object") continue;
      const series = Number(ex.series ?? ex["Séries"] ?? 0) || 0;
      const reps   = Number(ex.repetitions ?? ex["Répétitions"] ?? 0) || 0;
      const rest   = toSeconds(ex.repos ?? ex["Repos (min:sec)"] ?? ex.pause ?? 0);
      const perRep = toSeconds(ex.temps_par_repetition ?? ex.tempsParRep ?? 0);
      const fixed  = toSeconds(ex.duree ?? ex["Durée (min:sec)"] ?? ex.duree_effort ?? ex.temps_effort ?? 0);
      let effort = 0;
      if (perRep > 0 && reps > 0 && series > 0) effort = perRep * reps * series;
      else if (fixed > 0 && series > 0) effort = fixed * series;
      else if (fixed > 0) effort = fixed;
      else if (reps > 0 && series > 0) effort = 3 * reps * series;
      totalSec += effort + rest * (series || 1);
    }
  };
  const visitSession = (sess) => {
    if (!sess || typeof sess !== "object") return;
    visitBlockArray(sess.echauffement);
    visitBlockArray(sess.corps);
    visitBlockArray(sess.retourCalme);
    visitBlockArray(sess.bonus);
    if (Array.isArray(sess.exercises)) visitBlockArray(sess.exercises);
  };
  if (Array.isArray(sessions)) {
    sessions.forEach(sess => { visitSession(sess); count++; });
  } else if (typeof sessions === "object") {
    Object.values(sessions).forEach(sess => { visitSession(sess); count++; });
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
  const { t } = useTranslation("common");
  const muted = useColorModeValue('gray.600', 'gray.300');
  if (!program) return null;

  const goal = program.goal ?? program.objectif ?? null;
  const level = program.level ?? program.niveauSportif ?? null;
  const sessionsPerWeek = program.sessionsPerWeek ?? program.nbSeances ?? null;
  const durWeeks = program.durationWeeks ?? null;
  const location = program.location ?? null;
  const durMin = program._avgDurationMin ?? program.durationPerSessionMin ?? null;

  const hasPromo = Boolean(program?.isPromo && program?.promoPriceEUR);
  const title = getProgrammeDisplayName(program);
  const desc  = program.recap || program.shortDesc || t("premium.subtitle");

  const normal = fmtPrice(program?.priceEUR);
  const promo  = fmtPrice(program?.promoPriceEUR);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent overflow="hidden" rounded="2xl">
        <ModalHeader>{title}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <HStack spacing={2} mb={2} wrap="wrap">
            {goal && <Badge colorScheme="purple">{goal}</Badge>}
            {level && <Badge>{level}</Badge>}
            {location && <Badge variant="subtle">{location}</Badge>}
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
  const lng = i18n.resolvedLanguage || "fr";

  const [premium, setPremium] = useState([]);
  const [loading, setLoading] = useState(true);

  // Éligibilité “1er premium gratuit”
  const [elig, setElig] = useState(null);
  const [claimedLocal, setClaimedLocal] = useState(null);

  const [isPremOpen, setPremOpen] = useState(false);
  const [selectedPrem, setSelectedPrem] = useState(null);
  const [loadingPremDetails, setLoadingPremDetails] = useState(false);

  const pageBg     = useColorModeValue("gray.50","gray.900");
  const cardBg     = useColorModeValue("white","gray.800");
  const borderColor= useColorModeValue("#e2e8f0","#4a5568");
  const descColor  = useColorModeValue("gray.600","gray.400");

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

        // Catalogue
        const q1 = query(collection(db,"programmes"), where("origine","==","premium"));
        const q2 = query(collection(db,"programmes"), where("isPremiumOnly","==",true));
        const [s1,s2] = await Promise.all([getDocs(q1).catch(()=>null), getDocs(q2).catch(()=>null)]);
        const map=new Map();
        for(const s of [s1,s2]){ if(!s) continue; s.docs.forEach(d=>map.set(d.id,{id:d.id, ...d.data()})); }
        const rows = Array.from(map.values())
          .filter(p => (p?.isActive ?? true) && (p?.isPremiumOnly ?? true))
          .map(p => ({
            ...p,
            _avgDurationMin: getAvgDurationRounded15FromSessions(p.sessions) ?? p.durationPerSessionMin ?? null
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
        setSelectedPrem(prev => ({
          ...prev,
          ...data,
          _avgDurationMin: (avg ?? data?.durationPerSessionMin ?? prev?._avgDurationMin ?? null)
        }));
      }
    } finally {
      setLoadingPremDetails(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <Box bg={pageBg} minH="100vh" px={{ base: 4, md: 12 }} py={10}>
      <Heading size="2xl" mb={2}>{t("premium.title")}</Heading>
      <Text color={useColorModeValue('gray.600','gray.400')} mb={8}>
        {t("premium.subtitle")}
      </Text>

      {loading ? (
        <HStack><Spinner /><Text>{t("common.loading")}</Text></HStack>
      ) : (
        <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
          {premium.map((p, idx) => {
            const hasPromo = Boolean(p?.isPromo && p?.promoPriceEUR);
            const normal = fmtPrice(p?.priceEUR, lng);
            const promo  = fmtPrice(p?.promoPriceEUR, lng);
            const title  = getProgrammeDisplayName(p);
            const desc   = p.cardDesc || p.shortDesc || t("premium.subtitle");

            return (
              <Box
                key={p.id || idx}
                bg={cardBg}
                border="1px solid"
                borderColor={borderColor}
                borderRadius="2xl"
                p={5}
                shadow="sm"
                _hover={{ shadow: 'md', transform: 'translateY(-2px)' }}
                display="flex"
                flexDirection="column"
                h="100%"
              >
                <HStack spacing={2} mb={3} wrap="wrap">
                  {p.objectif && <Badge colorScheme="purple">{p.objectif}</Badge>}
                  {p.niveauSportif && <Badge variant="subtle">{p.niveauSportif}</Badge>}
                  {p.nbSeances && <Badge variant="outline">{p.nbSeances} {t("premium.per_week_short")}</Badge>}
                  {freeAvailable && <Badge colorScheme="green">{t("premium.free_badge")}</Badge>}
                </HStack>

                <Heading size="sm" mb={2}>{title}</Heading>
                <Text color={descColor} noOfLines={3}>
                  {desc}
                </Text>

                <Box mt="auto" pt={4}>
                  <HStack justify="space-between" align="flex-end" mb={3}>
                    <Box lineHeight="1.05">
                      {freeAvailable ? (
                        <Text as="div" fontWeight="bold" fontSize="lg" color="green.500">{t("premium.free")}</Text>
                      ) : hasPromo && promo ? (
                        <>
                          {normal && (
                            <Text as="div" color={useColorModeValue('gray.500','gray.400')}
                                  textDecoration="line-through" fontSize="sm" whiteSpace="nowrap">
                              {normal}
                            </Text>
                          )}
                          <Text as="div" fontWeight="bold" fontSize="lg" color="blue.500" whiteSpace="nowrap">
                            {promo}
                          </Text>
                        </>
                      ) : (
                        <Text as="div" fontWeight="bold" fontSize="lg" color="blue.500" whiteSpace="nowrap">
                          {normal || t("premium.price_on_stripe")}
                        </Text>
                      )}
                    </Box>
                  </HStack>

                  <HStack>
                    <Button variant="outline" onClick={() => openPremDetails(p)} flex="1">
                      {t("actions.view_details")}
                    </Button>
                    {freeAvailable ? (
                      <Button colorScheme="green" onClick={() => (requireLogin ? navigate("/login") : handleClaimFree(p))} flex="1">
                        {t("premium.claim_free")}
                      </Button>
                    ) : (
                      <Button colorScheme="blue" onClick={() => (requireLogin ? navigate("/login") : handleBuy(p))} flex="1">
                        {t("actions.buy_now")}
                      </Button>
                    )}
                  </HStack>
                </Box>
              </Box>
            );
          })}
        </SimpleGrid>
      )}

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

