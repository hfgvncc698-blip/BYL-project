import { useState, useEffect } from "react";
import { auth, db } from "../firebaseConfig";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import i18n from "../i18n/index";
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
        title: i18n.t("auto.Auth.inscription_reussie", "Inscription réussie 🎉"),
        description: `Bienvenue ${email} !`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: i18n.t("auto.Auth.erreur_d_inscription", "Erreur d'inscription"),
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
        title: i18n.t("auto.Auth.connexion_reussie", "Connexion réussie ✅"),
        description: `Ravi de te revoir, ${email} !`,
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } catch (error) {
      toast({
        title: i18n.t("auto.Auth.erreur_de_connexion", "Erreur de connexion"),
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
      title: i18n.t("auto.Auth.deconnexion_reussie", "Déconnexion réussie"),
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
            <Text fontSize="xl" fontWeight="bold">{i18n.t("auto.Auth.bienvenue", "Bienvenue,")}{user.email} ! 🎉
            </Text>
            <Button colorScheme="red" onClick={handleSignOut} w="full">{i18n.t("nav.logout", "Se déconnecter")}</Button>
          </>
        ) : (
          <>
            <Text fontSize="xl" fontWeight="bold">{i18n.t("auto.Auth.connexion_inscription", "Connexion / Inscription")}</Text>
            <Input
              type="email"
              placeholder={i18n.t("clientCreation.email", "Email")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              type="password"
              placeholder={i18n.t("auth.password", "Mot de passe")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="particulier">{i18n.t("auth.register.role_individual", "Particulier")}</option>
              <option value="professionnel">{i18n.t("auto.Auth.professionnel", "Professionnel")}</option>
            </Select>
            <Button colorScheme="blue" onClick={handleSignUp} w="full">{i18n.t("auto.Auth.s_inscrire", "S'inscrire")}</Button>
            <Button colorScheme="green" onClick={handleSignIn} w="full">{i18n.t("auth.register.goToLogin", "Se connecter")}</Button>
          </>
        )}
      </VStack>
    </Box>
  );
}

export default Auth;

