import app from "./firebaseConfig";
import { getFirestore } from "firebase/firestore";

// Récupérer Firestore à partir de l'instance Firebase déjà existante
const db = getFirestore(app);

export { db };

