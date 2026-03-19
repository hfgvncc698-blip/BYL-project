// src/components/ClientNutritionSection.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  HStack,
  Heading,
  Text,
  Spinner,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  IconButton,
  useToast,
} from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { useNavigate } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { createNutritionAssessmentDraft } from "../utils/nutritionPrefill";
import { useAuth } from "../AuthContext.jsx";

function formatDate(ts) {
  try {
    if (!ts) return "";
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
  } catch {
    return "";
  }
}

export default function ClientNutritionSection({ clientId, isAdminOnly = true }) {
  const toast = useToast();
  const navigate = useNavigate();

  // ✅ AuthContext expose "user" (profil Firestore normalisé). Pas de userData.
  const { user } = useAuth();

  // ✅ admin check basé sur le rôle Firestore normalisé
  const isAdmin = useMemo(() => {
    const role = (user?.role || "").toLowerCase();
    return role === "admin";
  }, [user]);

  const [loading, setLoading] = useState(true);
  const [assessments, setAssessments] = useState([]);

  useEffect(() => {
    if (!clientId) return;
    const colRef = collection(db, "clients", clientId, "nutrition_assessments");
    const q = query(colRef, orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setAssessments(rows);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [clientId]);

  const canUse = !isAdminOnly || isAdmin;

  const onCreate = async () => {
    if (!canUse) {
      toast({
        title: "Accès réservé",
        description:
          "Cette fonctionnalité est disponible uniquement pour l’admin (pour le moment).",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }
    try {
      const { assessmentId } = await createNutritionAssessmentDraft({
        clientId,
        createdByUid: user?.uid,
      });
      toast({
        title: "Bilan créé",
        description: "Draft nutrition pré-rempli avec les données disponibles.",
        status: "success",
        duration: 2500,
        isClosable: true,
      });
      navigate(`/clients/${clientId}/nutrition/${assessmentId}`);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e?.message || "Impossible de créer le bilan.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };

  const onOpen = (assessmentId) => {
    navigate(`/clients/${clientId}/nutrition/${assessmentId}`);
  };

  const onDelete = async (assessmentId) => {
    if (!canUse) return;
    try {
      await deleteDoc(
        doc(db, "clients", clientId, "nutrition_assessments", assessmentId)
      );
      toast({
        title: "Supprimé",
        status: "success",
        duration: 2000,
        isClosable: true,
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e?.message || "Suppression impossible.",
        status: "error",
        duration: 4000,
        isClosable: true,
      });
    }
  };

  return (
    <Box mt={8} p={5} borderWidth="1px" borderRadius="lg">
      <HStack justify="space-between" mb={4}>
        <Heading size="md">Nutrition</Heading>
        <Button
          leftIcon={<AddIcon />}
          colorScheme="blue"
          onClick={onCreate}
          isDisabled={!canUse}
        >
          Créer un bilan nutrition
        </Button>
      </HStack>

      {!canUse && (
        <Text fontSize="sm" opacity={0.7} mb={3}>
          (Admin uniquement pour le moment — ouverture aux pros après validation.)
        </Text>
      )}

      {loading ? (
        <HStack py={6} justify="center">
          <Spinner />
          <Text>Chargement…</Text>
        </HStack>
      ) : assessments.length === 0 ? (
        <Text opacity={0.7}>Aucun bilan nutrition pour ce client.</Text>
      ) : (
        <Table size="sm">
          <Thead>
            <Tr>
              <Th>Date</Th>
              <Th>Statut</Th>
              <Th>IMC</Th>
              <Th isNumeric>Actions</Th>
            </Tr>
          </Thead>
          <Tbody>
            {assessments.map((a) => (
              <Tr key={a.id}>
                <Td>{formatDate(a.updatedAt || a.createdAt)}</Td>
                <Td>
                  <Badge colorScheme={a.status === "final" ? "green" : "yellow"}>
                    {a.status === "final" ? "Final" : "Draft"}
                  </Badge>
                </Td>
                <Td>{a?.computed?.imc ?? ""}</Td>
                <Td isNumeric>
                  <HStack justify="flex-end">
                    <Button size="sm" onClick={() => onOpen(a.id)}>
                      Ouvrir
                    </Button>
                    <IconButton
                      size="sm"
                      aria-label="Supprimer"
                      colorScheme="red"
                      icon={<span style={{ fontWeight: 700 }}>×</span>}
                      onClick={() => onDelete(a.id)}
                      isDisabled={!canUse}
                    />
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </Box>
  );
}

