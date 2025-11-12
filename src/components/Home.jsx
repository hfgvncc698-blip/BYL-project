import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { Box, SimpleGrid } from "@chakra-ui/react";
import ProgramCard from "./ProgramCard";

const Home = () => {
  const [programs, setPrograms] = useState([]);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "programmes"));
        const programList = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            exercices: Array.isArray(data.exercices) ? data.exercices : [], // Sécurisation de la donnée
          };
        });

        setPrograms(programList);
      } catch (error) {
        console.error("Erreur lors de la récupération des programmes :", error);
      }
    };

    fetchPrograms();
  }, []);

  return (
    <Box p={6}>
      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={6}>
        {programs.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </SimpleGrid>
    </Box>
  );
};

export default Home;

