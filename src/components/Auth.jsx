import { useState, useEffect } from "react";
import { auth, db } from "../firebaseConfig";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { 
  Box, Button, Input, Select, Text, VStack, useToast 
} from "@chakra-ui/react";

function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("particulier");
  const [user, setUser] = useState(null);
  const toast = useToast();

  // Écoute les changements d'authentification
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Fonction pour enregistrer un programme d'entraînement par défaut
  const enregistrerProgrammeUtilisateur = async (userId) => {
    try {
      await setDoc(doc(db, "programmes", userId), {
        nomProgramme: "Programme de démarrage",
        exercices: [
          { nom: "Pompes", series: 3, repetitions: 12 },
          { nom: "Squats", series: 3, repetitions: 15 },
          { nom: "Gainage", duree: "30s" }
        ]
      });
      console.log("Programme enregistré !");
    } catch (error) {
      console.error("Erreur lors de l'enregistrement du programme :", error);
    }
  };

  // Inscription d'un nouvel utilisateur
  const handleSignUp = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      // Enregistrer l'utilisateur dans Firestore
      await setDoc(doc(db, "users", userId), { email, role });

      // Créer un programme par défaut pour le nouvel utilisateur
      await enregistrerProgrammeUtilisateur(userId);

      toast({
        title: "Inscription réussie 🎉",
        description: `Bienvenue ${email} !`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Erreur d'inscription",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Connexion d'un utilisateur existant
  const handleSignIn = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({
        title: "Connexion réussie ✅",
        description: `Ravi de te revoir, ${email} !`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: "Erreur de connexion",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  // Déconnexion de l'utilisateur
  const handleSignOut = async () => {
    await signOut(auth);
    toast({
      title: "Déconnexion réussie",
      status: "info",
      duration: 3000,
      isClosable: true,
    });
  };

  return (
    <Box p={6} maxW="400px" mx="auto" borderWidth="1px" borderRadius="lg" boxShadow="md">
      <VStack spacing={4}>
        {user ? (
          <>
            <Text fontSize="xl" fontWeight="bold">
              Bienvenue, {user.email} ! 🎉
            </Text>
            <Button colorScheme="red" onClick={handleSignOut} w="full">
              Se déconnecter
            </Button>
          </>
        ) : (
          <>
            <Text fontSize="xl" fontWeight="bold">Connexion / Inscription</Text>
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Mot de passe"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="particulier">Particulier</option>
              <option value="professionnel">Professionnel</option>
            </Select>
            <Button colorScheme="blue" onClick={handleSignUp} w="full">S'inscrire</Button>
            <Button colorScheme="green" onClick={handleSignIn} w="full">Se connecter</Button>
          </>
        )}
      </VStack>
    </Box>
  );
}

export default Auth;

