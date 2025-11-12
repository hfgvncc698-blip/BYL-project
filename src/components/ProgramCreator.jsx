import React, { useState, useEffect } from "react";
import {
  Button,
  Input,
  Select,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  FormControl,
  FormLabel,
} from "@chakra-ui/react";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { v4 as uuidv4 } from "uuid";
import { useNavigate } from "react-router-dom";

const ProgramCreator = () => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [programName, setProgramName] = useState("");
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchClients = async () => {
      const querySnapshot = await getDocs(collection(db, "clients"));
      setClients(querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    };
    fetchClients();
  }, []);

  const creerProgramme = async () => {
    if (!programName) {
      alert("Merci de donner un nom au programme");
      return;
    }

    const newProgramId = uuidv4();
    await setDoc(doc(db, "programmes", newProgramId), {
      nomProgramme: programName,
      clientAssigné: selectedClient || null,
      createdAt: new Date(),
      séances: [],
    });

    navigate(`/exercise-bank/program-builder/${newProgramId}`);
  };

  return (
    <>
      <Button colorScheme="blue" onClick={onOpen}>Nouveau programme</Button>

      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Créer un nouveau programme</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl mb={4}>
              <FormLabel>Nom du programme</FormLabel>
              <Input
                placeholder="Nom du programme"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Assigner à un client</FormLabel>
              <Select
                placeholder="Assigner à un client"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
              >
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.nom.toUpperCase()}
                  </option>
                ))}
              </Select>
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={creerProgramme}>
              Créer
            </Button>
            <Button onClick={onClose}>Annuler</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ProgramCreator;
