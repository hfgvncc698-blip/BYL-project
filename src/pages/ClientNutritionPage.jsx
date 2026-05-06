// src/pages/ClientNutritionPage.jsx
import { useEffect, useState } from "react";
import { Box, Heading, Text } from "@chakra-ui/react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useAuth } from "../AuthContext.jsx";
import { useNutritionTheme } from "../styles/nutritionTheme";
import AppLoading from "../components/ui/AppLoading.jsx";
import PageBackButton from "../components/ui/PageBackButton";
import ClientNutritionSharedSection from "../components/ClientNutritionSharedSection.jsx";

export default function ClientNutritionPage() {
  const { user } = useAuth();
  const theme = useNutritionTheme();
  const [clientId, setClientId] = useState(null);
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      const email = String(user.email || "").trim();
      const emailLower = email.toLowerCase();
      const attempts = [
        emailLower ? query(collection(db, "clients"), where("emailLower", "==", emailLower)) : null,
        email ? query(collection(db, "clients"), where("email", "==", email)) : null,
        query(collection(db, "clients"), where("uid", "==", user.uid)),
        query(collection(db, "clients"), where("linkedUserId", "==", user.uid)),
      ].filter(Boolean);

      for (const q of attempts) {
        try {
          const snap = await getDocs(q);
          if (!snap.empty) {
            if (alive) {
              setClientId(snap.docs[0].id);
              setClientData(snap.docs[0].data());
            }
            break;
          }
        } catch {
          // On teste plusieurs identifiants possibles, donc une requête ratée ne bloque pas.
        }
      }

      if (alive) setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  if (loading) return <AppLoading label="Chargement de ton suivi nutrition..." />;

  return (
    <Box minH="100vh" bg={theme.pageBg} color={theme.textColor} p={{ base: 3, md: 6 }} position="relative">
      <Box position="absolute" top={{ base: 3, md: 6 }} left={{ base: 3, md: 6 }} zIndex={20}>
        <PageBackButton />
      </Box>
      <Box maxW="7xl" mx="auto">
        <Box {...theme.cardProps} p={{ base: 4, md: 5 }} mb={{ base: 3, md: 5 }} pt={{ base: 12, md: 5 }}>
          <Text fontSize="xs" fontWeight="900" letterSpacing="0.12em" color={theme.subtleText}>
            ESPACE CLIENT
          </Text>
          <Heading size={{ base: "md", md: "lg" }} mt={1}>
            Nutrition
          </Heading>
          <Text color={theme.mutedText} mt={2} fontSize={{ base: "sm", md: "md" }}>
            Tout ce que ton professionnel a partagé : menu, recettes, courses et conseils.
          </Text>
        </Box>

        {clientId ? (
          <ClientNutritionSharedSection
            clientId={clientId}
            variant="full"
            clientName={[clientData?.firstName || clientData?.prenom, clientData?.lastName || clientData?.nom].filter(Boolean).join(" ")}
          />
        ) : (
          <Box {...theme.cardProps} p={5}>
            <Heading size="sm">Aucun dossier client relié</Heading>
            <Text color={theme.mutedText} mt={2}>
              Ton compte n’est pas encore relié à une fiche client nutrition.
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
