// src/components/AssignProgram.jsx
import React, { useEffect, useState } from "react";
import { db } from "../firebaseConfig";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { Button, Modal, Select, message } from "antd";

/**
 * Props:
 * - clientId: string (obligatoire)
 * - open?: boolean  (AntD v5)
 * - visible?: boolean (compat v4)
 * - onClose: () => void
 * - onAssigned?: (newClientProgramId: string) => void
 * - coachId?: string  // si fourni, on filtre les programmes créés par ce coach
 */
const AssignProgram = ({
  clientId,
  open,
  visible,
  onClose,
  onAssigned,
  coachId,
}) => {
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [loading, setLoading] = useState(false);
  const isOpen = typeof open === "boolean" ? open : !!visible;

  // Charger la liste des programmes "de base"
  useEffect(() => {
    if (!isOpen) return;

    (async () => {
      try {
        // Optionnel: filtrer par coach si coachId est fourni
        let q = collection(db, "programmes");
        if (coachId) {
          q = query(
            collection(db, "programmes"),
            where("createdBy", "==", coachId),
            orderBy("createdAt", "desc")
          );
        }
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setPrograms(list);
      } catch (err) {
        console.error(err);
        message.error("Impossible de charger les programmes.");
      }
    })();
  }, [isOpen, coachId]);

  // Dupliquer le programme choisi dans la sous-collection du client
  const handleAssignProgram = async () => {
    if (!clientId) {
      message.error("Client manquant.");
      return;
    }
    if (!selectedProgramId) {
      message.error("Veuillez sélectionner un programme.");
      return;
    }

    setLoading(true);
    try {
      // 1) Récupérer le programme "base"
      const baseRef = doc(db, "programmes", selectedProgramId);
      const baseSnap = await getDoc(baseRef);
      if (!baseSnap.exists()) throw new Error("Programme introuvable.");

      const base = baseSnap.data();
      const { nomProgramme, name, titre, title, ...rest } = base;

      // 2) Créer une copie dans clients/{clientId}/programmes
      const clientProgRef = await addDoc(
        collection(db, "clients", clientId, "programmes"),
        {
          ...rest,
          // champs lisibles côté client
          displayName:
            nomProgramme || name || titre || title || "Programme sans titre",
          programId: selectedProgramId, // référence vers le programme "base"
          statut: "en cours",
          assignedAt: serverTimestamp(),
        }
      );

      // 3) Conserver une trace dans le doc client (facultatif mais pratique)
      const clientRef = doc(db, "clients", clientId);
      await updateDoc(clientRef, {
        programmes: arrayUnion(clientProgRef.id),
        lastAssignedAt: serverTimestamp(),
      });

      message.success("Programme assigné avec succès.");
      onAssigned?.(clientProgRef.id);
      onClose?.();
      setSelectedProgramId(null);
    } catch (err) {
      console.error(err);
      message.error("Erreur lors de l'assignation du programme.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Assigner un programme"
      open={isOpen}          // AntD v5
      visible={isOpen}       // compat AntD v4 (sans effet en v5)
      onCancel={() => {
        setSelectedProgramId(null);
        onClose?.();
      }}
      footer={null}
      destroyOnClose
    >
      <Select
        style={{ width: "100%" }}
        placeholder="Sélectionnez un programme"
        onChange={setSelectedProgramId}
        value={selectedProgramId}
        showSearch
        optionFilterProp="label"
      >
        {programs.map((p) => {
          const label =
            p.nomProgramme || p.name || p.titre || p.title || "Sans titre";
        return (
            <Select.Option key={p.id} value={p.id} label={label}>
              {label}
            </Select.Option>
          );
        })}
      </Select>

      <Button
        type="primary"
        onClick={handleAssignProgram}
        loading={loading}
        block
        style={{ marginTop: 16 }}
        disabled={!programs.length}
      >
        Assigner
      </Button>
    </Modal>
  );
};

export default AssignProgram;

