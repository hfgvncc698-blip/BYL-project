import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import fs from "fs";

// 🔥 Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDMYjcJDpXyBA10_zCBYvi0Q8E29gTNA",
  authDomain: "boost-your-life-f6b3e.firebaseapp.com",
  projectId: "boost-your-life-f6b3e",
  storageBucket: "boost-your-life-f6b3e.appspot.com",
  messagingSenderId: "269731318383",
  appId: "1:269731318383:web:21c49655afbd6fcc0f3e8",
  measurementId: "G-2X9MZ62M8D"
};

// 🔧 Initialisation Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 📂 Chargement sécurisé des JSON
const safeLoad = (filename, key = null) => {
  try {
    const data = JSON.parse(fs.readFileSync(filename, "utf8"));
    if (key) return Array.isArray(data[key]) ? data[key] : [];
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error(`❌ Erreur lecture ${filename} :`, e.message);
    return [];
  }
};

const warmupExercises = safeLoad("warmup.json", "echauffement");
const trainingExercises = safeLoad("training.json", "exercices");
const cooldownExercises = safeLoad("cooldown.json", "cooldown");
const ergometreExercises = safeLoad("ergometre.json");

const importExercises = async () => {
  try {
    let total = 0;

    const importToCollection = async (list, collectionName) => {
      let count = 0;
      for (const ex of list) {
        if (!ex.nom) continue;
        const ref = doc(db, collectionName, ex.nom.replace(/\s+/g, "_"));
        await setDoc(ref, ex);
        console.log(`✅ Ajouté : ${ex.nom} dans ${collectionName}`);
        count++;
      }
      total += count;
      console.log(`📦 Total importés dans ${collectionName} : ${count}`);
    };

    await importToCollection(warmupExercises, "warmup");
    await importToCollection(trainingExercises, "training");
    await importToCollection(cooldownExercises, "cooldown");
    await importToCollection(ergometreExercises, "ergometre");

    console.log(`📊 Total global importé : ${total} exercices`);
    console.log("🔥 Importation terminée !");
  } catch (error) {
    console.error("❌ Erreur globale :", error);
  }
};

importExercises();

