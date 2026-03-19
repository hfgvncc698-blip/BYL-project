// utils/generateAutoProgram.js
const admin = require("firebase-admin");

/* ------------------------ HELPERS ------------------------ */
const niveaux = [
  { ui: "Débutant", firestore: ["débutant", "tous niveaux"] },
  { ui: "Intermédiaire", firestore: ["intermédiaire", "tous niveaux"] },
  { ui: "Confirmé", firestore: ["avancé", "confirmé", "tous niveaux"] },
];

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (str = "") =>
  stripDiacritics(String(str).toLowerCase()).trim().replace(/\s+/g, " ");
const toKey = (s = "") =>
  normalize(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const arrify = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const blacklistKey = (name = "") => (normalize(name).split(/\s*-\s*/)[0] || "");

/** ✅ Affichage propre : "prise_de_masse" -> "Prise de masse" */
function formatLabel(s = "") {
  const raw = String(s || "").trim();
  if (!raw) return "";
  const spaced = raw.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** ✅ Nettoie un titre reçu depuis le front (ex: "perte_de_poids — 1x/Sem") */
function sanitizeProgramName(title = "") {
  const raw = String(title || "").trim();
  if (!raw) return "";

  // Split sur le tiret long "—" (comme tu utilises)
  const parts = raw.split("—").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return raw;

  // Partie gauche = objectif (souvent "perte_de_poids")
  const left = parts[0];
  const right = parts.slice(1).join(" — "); // au cas où

  const cleanLeft = formatLabel(toKey(left)); // "Perte de poids"
  if (!right) return cleanLeft;
  return `${cleanLeft} — ${right}`;
}

/**
 * ✅ Objectif “métier” (stockage + affichage)
 * IMPORTANT : on ne mappe PAS perte_de_poids => endurance ici.
 */
function objectifKeyForStorage(objectifUI = "", nomProgramme = "") {
  const k = toKey(objectifUI);

  const title = String(nomProgramme || "").trim();
  const titleBeforeDash = title.split("—")[0]?.trim() || "";
  const titleKey = toKey(titleBeforeDash);

  const inferredFromTitle = (() => {
    if (titleKey === "perte_de_poids") return "perte_de_poids";
    if (titleKey === "prise_de_masse") return "prise_de_masse";
    if (titleKey === "remise_au_sport") return "remise_au_sport";
    if (titleKey === "maintien_en_forme") return "maintien_en_forme";
    if (titleKey === "postural") return "postural";
    if (titleKey === "force") return "force";
    if (titleKey === "endurance") return "endurance";
    if (titleKey.includes("weight_loss") || titleKey.includes("loss")) return "perte_de_poids";
    if (titleKey.includes("hypertrophie") || titleKey.includes("mass")) return "prise_de_masse";
    return "";
  })();

  if (inferredFromTitle) return inferredFromTitle;

  const aliases = {
    perte_de_poids: ["perte_de_poids", "weight_loss", "loss", "fat_loss", "slim", "cut"],
    prise_de_masse: ["prise_de_masse", "hypertrophie", "mass", "bulking"],
    remise_au_sport: ["remise_au_sport", "adaptation_anatomique", "reprise", "return_to_sport"],
    maintien_en_forme: ["maintien_en_forme", "fitness", "general_fitness"],
    renforcement: ["renforcement", "strengthening"],
    cardio: ["cardio", "cardiovascular"],
    endurance: ["endurance"],
    force: ["force"],
    postural: ["postural"],
  };

  for (const [key, list] of Object.entries(aliases)) {
    if (list.map(toKey).includes(k)) return key;
  }

  return k;
}

/**
 * ✅ Objectif “params Firestore”
 * - perte_de_poids => on lit les params “endurance”
 */
function objectifKeyForParams(objectifUI) {
  const k = toKey(objectifUI);
  if (k === "perte_de_poids") return "endurance";
  return k;
}

/** Alias (au cas où Firestore a des clés différentes) */
const OBJECTIF_ALIASES = {
  endurance: ["endurance"],
  force: ["force"],
  postural: ["postural"],
  prise_de_masse: ["prise_de_masse", "hypertrophie", "mass", "bulking"],
  remise_au_sport: ["remise_au_sport", "adaptation_anatomique", "reprise", "return_to_sport"],
  maintien_en_forme: ["maintien_en_forme", "fitness", "general_fitness"],
  renforcement: ["renforcement", "strengthening"],
  cardio: ["cardio", "cardiovascular"],
  perte_de_poids: ["perte_de_poids", "weight_loss", "loss", "endurance"],
};

/* --------------- Sélecteurs groupes / matching --------------- */
function groupesEquivalents(g) {
  const nom = normalize(g);
  if (nom === "dos") return ["dos"];
  return [nom];
}
function getGroupeExo(ex) {
  const gm = ex.groupe_musculaire;
  if (Array.isArray(gm)) return gm.map(normalize);
  return [normalize(gm)];
}
function matchGroupeMusculaire(ex, groupe) {
  const cible = groupesEquivalents(groupe).map(normalize);
  const exGroups = getGroupeExo(ex);
  return exGroups.some((g) => cible.includes(g));
}

/* ------------------- Principal “lourd” ------------------- */
const estPrincipal = (ex) => {
  const nom = normalize(ex.nom);
  const grp = normalize(
    Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire[0] : ex.groupe_musculaire
  );
  const motsCles = [
    "developpe",
    "squat",
    "souleve",
    "traction",
    "presse",
    "rowing",
    "hip",
    "fente",
    "tirage",
    "deadlift",
  ];
  const nonPrioritaires = ["mollets", "abdominaux", "avant-bras", "trapezes", "trapeze", "poignets"];
  if (nonPrioritaires.includes(grp)) return false;
  return motsCles.some((m) => nom.includes(m));
};

const exoMatchMateriel = (_ex, _lieu) => true;

const exoMatchNiveau = (ex, niveauUI) => {
  let nv = ex.niveau;
  if (!nv) return true;
  const vals = arrify(nv).map(normalize);
  const nUi = niveaux.find((n) => n.ui === niveauUI);
  if (!nUi) return true;
  return nUi.firestore.some((niv) => vals.some((v) => v.includes(normalize(niv))));
};

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* -------------------- Familles de mouvement -------------------- */
function movementFamilyKey(ex) {
  const n = normalize(ex?.nom || "");
  if (/squat|presse|hack|sissy|fente|step-?up/.test(n)) return "legs_knee";
  if (/souleve|deadlift|roman|good ?morning|hip thrust|hinge|glute bridge|hip extension/.test(n))
    return "legs_hip";
  if (/mollet|calf/.test(n)) return "calves";
  if (/extension lombaire|roman chair|back extension|superman/.test(n)) return "lower_back";
  if (/developpe|couch|pompes|dips|militaire|overhead|arnold/.test(n)) return "press";
  if (/tirage|rowing|row|traction|pull[- ]?over|face pull|tirage vertical|tirage horizontal/.test(n))
    return "pull";
  if (/leg extension/.test(n)) return "quad_iso";
  if (/leg curl|curl f(é|e)moral|ischio/.test(n)) return "ham_iso";
  if (/ecarte|pec deck/.test(n)) return "pec_iso";
  if (/eleva|oiseaux|lateral/.test(n)) return "shoulder_iso";
  if (/curl( biceps)?/.test(n)) return "bi_iso";
  if (
    (/(extension|pushdown|barre au front|overhead).*triceps/.test(n) ||
      /kick ?back.*triceps/.test(n))
  )
    return "tri_iso";
  return "other";
}

function primaryGroup(ex) {
  return normalize(
    Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire[0] : ex.groupe_musculaire
  );
}
const isAbs = (ex) => primaryGroup(ex) === "abdominaux";

/* ---------------- Diversité / Sémantique ------------------ */
function semanticFamily(ex) {
  const n = normalize(ex?.nom || "");
  const g = primaryGroup(ex);

  if (/kick ?back|donkey|hip( |_)?extension|glute kickback/.test(n)) return "glute_kickback";
  if (/fire hydrant|abduction|abducteur/.test(n)) return "glute_abduction";
  if (/hip thrust|glute bridge|pont fessier/.test(n)) return "glute_hipthrust";

  if (/leg extension|extension quadriceps/.test(n)) return "quad_extension";
  if (/leg curl|ischio|curl f(é|e)moral/.test(n)) return "ham_curl";

  if (/calf|mollet|extension mollets/.test(n)) return "calf_raise";

  if (/eleva.*lat(é|e)r|oiseaux|lateral raise|elevations lat/.test(n)) return "shoulder_lateral";
  if (/developpe.*milit|overhead press|arnold/.test(n)) return "shoulder_press";

  if (/ecarte|pec deck|fly/.test(n)) return "pec_fly";

  if (/curl( biceps)?/.test(n)) return "biceps_curl";
  if (
    (/(extension|pushdown|barre au front|overhead).*triceps/.test(n) ||
      /kick ?back.*triceps/.test(n))
  )
    return "triceps_ext";

  if (/face pull/.test(n)) return "rear_delt_facepull";

  return `${movementFamilyKey(ex)}__${g}`;
}

/* ---------------- Détection ERGO + display ---------------- */
function isErgoStrict(ex) {
  const coll = normalize(ex?.collection);
  const cat = normalize(ex?.categorie);
  const typ = normalize(ex?.type);
  const cu = arrify(ex?.categorie_utilisation).map(normalize);
  return coll === "ergometre" || cat === "ergometre" || typ === "ergometre" || cu.includes("ergometre");
}

function isErgoForDisplay(ex, sectionKey) {
  if (isErgoStrict(ex)) return true;
  if (sectionKey === "corps") return false;

  const txt = [
    ex?.nom,
    ...arrify(ex?.materiel || ex?.équipement || ex?.equipement),
    ex?.modele,
    ex?.sous_type,
  ]
    .filter(Boolean)
    .map(String)
    .join(" ")
    .toLowerCase();

  return /(tapis|treadmill|course|marche|vélo|velo|bike|airdyne|assault|elliptique|stepper|stair|escalier|rameur|rower|concept\s*2|skierg|ski)/i.test(
    txt
  );
}

function ergoKind(ex) {
  const base = `${normalize(ex?.sous_type || "")} ${normalize(ex?.modele || "")} ${normalize(ex?.nom || "")}`;
  if (/tapis|treadmill|course|marche/.test(base)) return "treadmill";
  if (/velo|vélo|bike|airdyne|assault/.test(base)) return "bike";
  if (/rameur|rower|concept/.test(base)) return "rower";
  if (/elliptique|elliptic/.test(base)) return "elliptical";
  if (/ski|skierg|ski-erg/.test(base)) return "skierg";
  if (/stair|stepper|escalier/.test(base)) return "stepper";
  return "generic";
}

function extractErgoMetrics(ex, params = {}) {
  const pick = (k) => params[k] ?? params[toKey(k)] ?? ex[k];
  const res = {};
  res.vitesse = pick("vitesse") ?? pick("vitesse_kmh") ?? pick("speed") ?? pick("kmh");
  res.distance = pick("distance") ?? pick("km") ?? pick("meters") ?? pick("m");
  res.watts = pick("watts") ?? pick("puissance");
  res.calories = pick("calories") ?? pick("kcal");
  res.intensite = pick("intensite") ?? pick("intensité") ?? pick("intensity");
  res.inclinaison = pick("inclinaison") ?? pick("incline") ?? pick("inclinaison_%");
  res.rpm = pick("rpm") ?? pick("cadence");
  const niveau = pick("niveau");
  const resi = pick("resistance") ?? pick("résistance");
  if (typeof resi === "number") res.resistance = resi;
  else if (typeof niveau === "number") res.resistance = niveau;
  res.allure = pick("allure") ?? pick("pace") ?? pick("min_km");
  res.fc =
    pick("fc") ??
    pick("frequence_cardiaque") ??
    pick("fréquence_cardiaque") ??
    pick("hr") ??
    pick("bpm");

  Object.keys(res).forEach((k) => res[k] === undefined && delete res[k]);
  return res;
}

/* ---------------- Abdos/holds & Stretching ---------------- */
function isTimeCore(ex) {
  const n = normalize(ex?.nom || "");
  return /vacuum|gainage|plank|planche|side\s*plank|gainage\s*lat(é|e)ral|hollow(\s*hold)?|superman(\s*hold)?|dead\s*bug(\s*hold)?|chaise|wall\s*sit/.test(
    n
  );
}
function isStaticHold(ex) {
  const n = normalize(ex?.nom || "");
  return isTimeCore(ex) || /(isom(é|e)tr|statique|hold|maintien)/.test(n);
}
function isStretchingName(ex) {
  const n = normalize(ex?.nom || "");
  return /(stretch|étirement|etirement|mobilit(é|e)|pass-?through|pigeon|chat|cat|door|torsion|ouverture)/.test(
    n
  );
}

/* ---------------------- Numériques ---------------------- */
function getRandomInRange(val, arrondi = 1) {
  if (Array.isArray(val) && val.length === 2) {
    const min = Math.ceil(Number(val[0]));
    const max = Math.floor(Number(val[1]));
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    if (min === max) return min;
    const value = Math.floor(Math.random() * (max - min + 1)) + min;
    return arrondi > 1 ? Math.round(value / arrondi) * arrondi : value;
  }
  if (typeof val === "number") return val;
  if (typeof val === "string" && !isNaN(val)) return Number(val);
  return undefined;
}

/* ---------------- Options d’affichage auto ---------------- */
function buildDisplayedOptions(ex, sectionKey) {
  const flags = {
    series: true,
    repetitions: true,
    repos: true,
    temps: false,
    charge: false,
    watts: false,
    vitesse: false,
    distance: false,
    calories: false,
    intensite: false,
    inclinaison: false,
    rpm: false,
    resistance: false,
    allure: false,
    fc: false,
  };

  if (sectionKey === "retourCalme" || isStretchingName(ex)) {
    flags.repetitions = false;
    flags.temps = true;
    flags.charge = false;
  } else if (sectionKey === "corps") {
    flags.series = true;
    flags.repetitions = !isStaticHold(ex);
    flags.temps = isStaticHold(ex);
    flags.repos = true;
    flags.charge = !isStaticHold(ex);
  } else {
    flags.series = true;
    flags.repetitions = false;
    flags.temps = true;
    flags.repos = true;

    if (isErgoForDisplay(ex, sectionKey)) {
      const kind = ergoKind(ex);
      flags.calories = true;
      flags.intensite = true;

      if (kind === "treadmill") {
        flags.vitesse = true;
        flags.distance = true;
        flags.inclinaison = true;
        flags.allure = true;
        flags.fc = true;
      } else if (kind === "bike") {
        flags.vitesse = true;
        flags.distance = true;
        flags.watts = true;
        flags.rpm = true;
        flags.resistance = true;
        flags.fc = true;
      } else if (kind === "rower") {
        flags.distance = true;
        flags.watts = true;
        flags.allure = true;
        flags.fc = true;
      } else if (kind === "elliptical") {
        flags.vitesse = true;
        flags.distance = true;
        flags.rpm = true;
        flags.resistance = true;
        flags.fc = true;
      } else if (kind === "skierg" || kind === "stepper") {
        flags.distance = true;
        flags.watts = true;
        flags.allure = true;
        flags.fc = true;
      } else {
        flags.vitesse = true;
        flags.distance = true;
        flags.watts = true;
      }
    }
  }

  const order = [];
  if (flags.series) order.push("Séries");
  if (flags.repetitions) order.push("Répétitions");
  if (flags.temps) order.push("Durée (min:sec)");
  if (flags.charge) order.push("Charge (kg)");
  if (flags.repos) order.push("Repos (min:sec)");
  if (flags.intensite) order.push("Intensité");
  if (flags.vitesse) order.push("Vitesse");
  if (flags.distance) order.push("Distance");
  if (flags.watts) order.push("Watts");
  if (flags.rpm) order.push("Cadence (rpm)");
  if (flags.resistance) order.push("Résistance / Niveau");
  if (flags.inclinaison) order.push("Inclinaison (%)");
  if (flags.allure) order.push("Allure");
  if (flags.fc) order.push("Fréquence cardiaque");
  if (flags.calories) order.push("Objectif Calories");

  return { optionsEnabled: flags, optionsOrder: order };
}

/* ----------------- Fixation des paramètres d’exo ----------------- */
const SEC_PER_REP = 2;

function getParametresObjectif(ex) {
  return (
    ex?.parametres_objectif ||
    ex?.parametresObjectif ||
    ex?.parametres_objectifs ||
    {}
  );
}

/**
 * ✅ FIX ANTI-3x10 :
 * - match direct + normalisé + fallback intelligent
 */
function resolveParamsForObjectif(ex, objectifKey) {
  const po = getParametresObjectif(ex);
  const poKeys = Object.keys(po || {});
  const poKeysKeyed = poKeys.map((k) => ({ raw: k, key: toKey(k) }));

  const askedKey = toKey(objectifKey);
  const keyUI = toKey(objectifKey);

  const aliasList = OBJECTIF_ALIASES[keyUI] || [keyUI];
  const candidateKeys = [keyUI, ...aliasList].filter(Boolean);

  // 1) match direct
  for (const ck of candidateKeys) {
    if (po && po[ck]) {
      console.log(`[AUTO][PARAMS] ✅ match direct`, {
        exo: ex?.nom,
        asked: objectifKey,
        usedKey: ck,
        available: poKeys,
      });
      return { ...po[ck] };
    }
  }

  // 2) match normalisé
  for (const ck of candidateKeys) {
    const ckKey = toKey(ck);
    const found = poKeysKeyed.find((x) => x.key === ckKey);
    if (found && po[found.raw]) {
      console.log(`[AUTO][PARAMS] ✅ match normalisé`, {
        exo: ex?.nom,
        asked: objectifKey,
        usedKey: found.raw,
        available: poKeys,
      });
      return { ...po[found.raw] };
    }
  }

  // 3) fallback intelligent
  if (askedKey === "perte_de_poids") {
    const foundEndu = poKeysKeyed.find((x) => x.key.includes("endurance"));
    if (foundEndu && po[foundEndu.raw]) {
      console.log(`[AUTO][PARAMS] ✅ fallback perte_de_poids => endurance (contains)`, {
        exo: ex?.nom,
        asked: objectifKey,
        usedKey: foundEndu.raw,
        available: poKeys,
      });
      return { ...po[foundEndu.raw] };
    }
  }

  if (poKeys.length === 1) {
    const only = poKeys[0];
    console.log(`[AUTO][PARAMS] ✅ fallback clé unique`, {
      exo: ex?.nom,
      asked: objectifKey,
      usedKey: only,
      available: poKeys,
    });
    return { ...po[only] };
  }

  const contains = poKeysKeyed.find((x) => x.key.includes(askedKey));
  if (contains && po[contains.raw]) {
    console.log(`[AUTO][PARAMS] ✅ fallback contains(target)`, {
      exo: ex?.nom,
      asked: objectifKey,
      usedKey: contains.raw,
      available: poKeys,
    });
    return { ...po[contains.raw] };
  }

  console.log(`[AUTO][PARAMS] ❌ aucun match -> paramsObj vide (=> risque 3x10)`, {
    exo: ex?.nom,
    asked: objectifKey,
    tried: candidateKeys,
    available: poKeys,
  });

  return {};
}

/**
 * ✅ NEW: pour ergos warmup/cooldown => bloc racine "echauffement"/"warmup" ou "cooldown"/"retourCalme"
 */
function resolveParamsForErgoSection(ex, sectionKey) {
  const po = getParametresObjectif(ex);
  const keys = Object.keys(po || {});
  const keyed = keys.map((k) => ({ raw: k, key: toKey(k) }));

  const want =
    sectionKey === "echauffement"
      ? ["echauffement", "warmup"]
      : sectionKey === "retourCalme"
      ? ["cooldown", "retour_calme", "retourcalme"]
      : [];

  for (const w of want) {
    const wKey = toKey(w);
    const found = keyed.find((x) => x.key === wKey);
    if (found && po[found.raw]) {
      console.log(`[AUTO][ERGO-SECTION] ✅ match`, {
        exo: ex?.nom,
        sectionKey,
        usedKey: found.raw,
        available: keys,
      });
      return { ...po[found.raw] };
    }
  }

  console.log(`[AUTO][ERGO-SECTION] ❌ aucun bloc section trouvé`, {
    exo: ex?.nom,
    sectionKey,
    tried: want,
    available: keys,
  });

  return {};
}

function dropErgoKeys(obj) {
  [
    "vitesse",
    "distance",
    "watts",
    "calories",
    "intensite",
    "inclinaison",
    "rpm",
    "resistance",
    "allure",
    "fc",
  ].forEach((k) => delete obj[k]);
}
function dropIfZeroish(obj, keys) {
  keys.forEach((k) => {
    if (obj[k] === 0 || obj[k] === "0" || obj[k] === "0.0") delete obj[k];
  });
}

/**
 * ✅ IMPORTANT :
 * Ici `objectifKey` doit être la clé PARAMS (ex: endurance).
 * L’objectif UI (ex: perte_de_poids) ne doit pas arriver ici.
 */
function fixerParametresExercice(ex, objectifKey = "endurance", forceReps = false, sectionKey = "corps") {
  const paramsObj = resolveParamsForObjectif(ex, objectifKey);

  if (!paramsObj || Object.keys(paramsObj).length === 0) {
    const po = getParametresObjectif(ex);
    console.log(`[AUTO][FALLBACK] paramsObj vide => fallback séries/reps`, {
      exo: ex?.nom,
      objectifKey,
      poKeys: Object.keys(po || {}),
      hasPO: !!po && Object.keys(po || {}).length > 0,
    });
  }

  const arrondiSec = 15;

  let series = getRandomInRange(paramsObj.series ?? ex.series ?? 3);
  let repetitions = getRandomInRange(paramsObj.repetitions ?? ex.repetitions ?? 10);
  let repos = getRandomInRange(
    paramsObj.repos ?? paramsObj.duree_repos ?? ex.repos ?? ex.duree_repos,
    arrondiSec
  );

  const isWU = sectionKey === "echauffement";
  const isCD = sectionKey === "retourCalme";
  const ergo = isErgoForDisplay(ex, sectionKey);

  let temps_effort;
  let sectionParams = {};

  if (ergo) {
    if (isWU) sectionParams = resolveParamsForErgoSection(ex, "echauffement");
    else if (isCD) sectionParams = resolveParamsForErgoSection(ex, "retourCalme");
    else sectionParams = paramsObj || {};

    series = getRandomInRange(sectionParams.series ?? paramsObj.series ?? ex.series ?? 1);

    const effSec = getRandomInRange(sectionParams.temps_effort ?? sectionParams.duree_effort, arrondiSec);
    const effMin = getRandomInRange(sectionParams.duree ?? paramsObj.duree ?? ex.duree);

    temps_effort =
      (typeof effSec === "number" && effSec > 0)
        ? effSec
        : (typeof effMin === "number" && effMin > 0)
        ? effMin * 60
        : getRandomInRange(
            paramsObj.temps_effort ?? paramsObj.duree_effort ?? ex.temps_effort ?? ex.duree_effort,
            arrondiSec
          ) || (isWU || isCD ? 180 : 60);

    let r = getRandomInRange(
      sectionParams.repos ??
        sectionParams.duree_repos ??
        paramsObj.repos ??
        paramsObj.duree_repos ??
        ex.repos ??
        ex.duree_repos,
      arrondiSec
    );
    repos = typeof r === "number" ? r : isWU || isCD ? 30 : 60;

    repetitions = undefined;
  } else {
    temps_effort = getRandomInRange(
      paramsObj.temps_effort ?? paramsObj.duree_effort ?? ex.temps_effort ?? ex.duree_effort,
      arrondiSec
    );
  }

  const result = { ...ex };

  if (sectionKey === "corps" && !ergo) {
    if (isStaticHold(ex) || isStretchingName(ex)) {
      result.series = series || 3;
      result.repetitions = undefined;
      result.temps_effort = typeof temps_effort === "number" && temps_effort > 0 ? temps_effort : 30;
      result.repos = typeof repos === "number" ? repos : 30;
      dropErgoKeys(result);
    } else {
      result.series = series || 3;

      let repsFinales = repetitions;
      if (!(typeof repsFinales === "number" && repsFinales > 0)) {
        if (typeof temps_effort === "number" && temps_effort > 0) {
          repsFinales = Math.max(5, Math.round(temps_effort / SEC_PER_REP));
        }
      }
      result.repetitions = typeof repsFinales === "number" && repsFinales > 0 ? repsFinales : 10;

      delete result.temps_effort;
      result.repos = typeof repos === "number" ? repos : 60;
    }
  } else {
    result.series = series || 1;

    const isIsoAbs = sectionKey === "bonus" && isAbs(ex) && isTimeCore(ex);
    const wantReps = (sectionKey === "bonus" && isAbs(ex) && !isIsoAbs && !ergo) || (forceReps && !ergo);

    if (wantReps) {
      let repsFinales = repetitions;
      if (!(typeof repsFinales === "number" && repsFinales > 0)) {
        if (typeof temps_effort === "number" && temps_effort > 0) repsFinales = Math.max(10, Math.round(temps_effort / SEC_PER_REP));
        else repsFinales = 15;
      }
      result.repetitions = repsFinales;
      delete result.temps_effort;
      dropErgoKeys(result);
    } else {
      result.repetitions = undefined;
      result.temps_effort = typeof temps_effort === "number" && temps_effort > 0 ? temps_effort : isWU || isCD ? 30 : 60;
      if (!ergo) dropErgoKeys(result);
    }

    result.repos = typeof repos === "number" ? repos : isWU || isCD ? 30 : 60;
  }

  if (ergo) {
    const metricsSource = sectionParams && Object.keys(sectionParams).length ? sectionParams : paramsObj;
    const metrics = extractErgoMetrics(ex, metricsSource);
    Object.assign(result, metrics);

    const inten =
      (sectionParams && Object.keys(sectionParams).length ? sectionParams.intensite ?? sectionParams.intensité : undefined) ??
      paramsObj.intensite ??
      paramsObj.intensité ??
      ex.intensite ??
      ex.intensité;

    if (inten !== undefined) result.intensite = inten;

    dropIfZeroish(result, ["vitesse", "distance", "watts", "calories", "inclinaison", "rpm", "resistance", "allure", "fc"]);
  } else {
    dropErgoKeys(result);
  }

  if (sectionKey === "retourCalme" || isStretchingName(ex)) {
    delete result.repetitions;
    delete result.charge;
    dropErgoKeys(result);
  }

  // Nettoyage
  delete result.parametres_objectif;
  delete result.parametresObjectif;
  delete result.parametres_objectifs;

  delete result.seriesArr;
  delete result.repetitionsArr;
  delete result.pauseArr;
  delete result.temps_effortArr;
  delete result.duree;
  delete result.duree_repos;

  Object.keys(result).forEach((k) => result[k] === undefined && delete result[k]);

  return result;
}

/* ----------- Secondaire COMPLÉMENTAIRE (inchangé) ----------- */
function pickSecondaryComplementaire({
  trainings,
  principal,
  blacklist,
  baseBlacklist,
  sessionGroups,
  alreadyPicked = [],
}) {
  if (!principal) return null;

  const gmP = primaryGroup(principal);
  const famP = movementFamilyKey(principal);
  const nameP = normalize(principal.nom);
  const groupsToday = arrify(sessionGroups).map(normalize);

  const history = Array.isArray(alreadyPicked) ? alreadyPicked : [];
  const histFamilies = new Set(history.map((e) => semanticFamily(e)));
  const familyCount = history.reduce((acc, e) => {
    const f = semanticFamily(e);
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});

  const compRule = (() => {
    if (famP === "legs_knee")
      return { group: "quadriceps", keywords: ["leg extension", "extension quadriceps", "extension"], famPref: ["quad_iso"], retourner: ["leg extension", "extension quadriceps", "sissy", "presse"] };
    if (famP === "legs_hip")
      return { group: "ischio-jambiers", keywords: ["leg curl", "curl", "flexion"], famPref: ["ham_iso"], retourner: ["leg curl", "curl f(é|e)moral", "good ?morning", "hip extension"] };
    if (famP === "press" || gmP === "pectoraux")
      return { group: "triceps", keywords: ["extension", "pushdown", "barre au front", "overhead"], famPref: ["tri_iso"], retourner: ["extension.*triceps", "pushdown", "barre au front", "overhead"] };
    if (famP === "pull" || gmP === "dos")
      return { group: "biceps", keywords: ["curl"], famPref: ["bi_iso"], retourner: ["curl( biceps)?", "incliné", "hammer"] };
    if (gmP === "epaules")
      return { group: "epaules", keywords: ["oiseaux", "lateral", "latérales"], famPref: ["shoulder_iso"], retourner: ["élévation lat", "oiseaux", "lateral raise"] };
    if (gmP === "fessiers")
      return { group: "fessiers", keywords: ["abduction", "kickback", "fire hydrant", "glute bridge", "hip thrust"], famPref: ["glute_abduction", "glute_kickback", "glute_hipthrust"], retourner: ["kick ?back", "fire hydrant", "abduction", "hip thrust|bridge"] };
    if (gmP === "ischio-jambiers")
      return { group: "ischio-jambiers", keywords: ["curl", "flexion"], famPref: ["ham_iso"], retourner: ["leg curl", "curl f(é|e)moral"] };
    if (gmP === "quadriceps")
      return { group: "quadriceps", keywords: ["extension"], famPref: ["quad_iso"], retourner: ["leg extension", "extension quadriceps"] };
    if (gmP === "mollets")
      return { group: "mollets", keywords: ["mollet", "calf", "extension mollets"], famPref: ["calves"], retourner: ["mollet|calf"] };
    if (gmP === "lombaires")
      return { group: "lombaires", keywords: ["extension lombaire", "roman chair", "good morning", "superman"], famPref: ["lower_back"], retourner: ["extension lombaire", "roman chair", "good morning", "superman"] };
    return { group: gmP, keywords: [], famPref: [movementFamilyKey(principal)], retourner: [] };
  })();

  const nameMatches = (exoName, pattern) => new RegExp(pattern, "i").test(exoName);
  const isBannedByRetourner = (candidate) => {
    const n = candidate?.nom ? String(candidate.nom) : "";
    return compRule.retourner.some((pat) => {
      const exists = history.some((h) => nameMatches(h.nom || "", pat));
      return exists && nameMatches(n, pat);
    });
  };

  const isAllowedBase = (e) => {
    const k = blacklistKey(e.nom);
    if (normalize(e.nom) === nameP) return false;
    if (blacklist.has(k) || baseBlacklist.has(k)) return false;
    if (primaryGroup(e) === "abdominaux") return false;
    return true;
  };

  const pool = shuffle(trainings).filter(isAllowedBase);

  const famQuotaOk = (e) => {
    const fam = semanticFamily(e);
    return (familyCount[fam] || 0) < 1;
  };

  const scoreCandidate = (e) => {
    let score = 0;
    const g = primaryGroup(e);
    const mf = movementFamilyKey(e);
    const sf = semanticFamily(e);

    if (g === compRule.group) score -= 4;
    if (compRule.keywords.some((w) => normalize(e.nom).includes(normalize(w)))) score -= 3;
    if (compRule.famPref.includes(mf)) score -= 2;
    if (!histFamilies.has(sf)) score -= 1;
    if (!groupsToday.includes(g)) score += 1;
    return score;
  };

  const filtered = pool.filter((e) => !isBannedByRetourner(e)).filter(famQuotaOk);

  const inGroup = filtered
    .filter((e) => primaryGroup(e) === compRule.group)
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (inGroup.length) return inGroup[0];

  const famPrefPool = filtered
    .filter((e) => compRule.famPref.includes(movementFamilyKey(e)))
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (famPrefPool.length) return famPrefPool[0];

  const sameGroup = filtered
    .filter((e) => primaryGroup(e) === gmP)
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (sameGroup.length) return sameGroup[0];

  const any = filtered.sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  return any[0] || null;
}

/* -------------------- SPLITS (A & B) -------------------- */
const getSplitHommeA = (nb) => {
  switch (nb) {
    case 1:
      return [["jambes", "pectoraux", "dos", "epaules"]];
    case 2:
      return [
        ["jambes", "pectoraux", "dos", "epaules"],
        ["jambes", "pectoraux", "dos", "epaules"],
      ];
    case 3:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
      ];
    case 4:
      return [
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
      ];
    case 5:
      return [
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "dos", "epaules"],
      ];
    case 6:
      return [
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
        ["dos", "epaules", "pectoraux"],
      ];
    case 7:
      return [
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "fessiers", "mollets"],
        ["jambes", "ischio-jambiers", "fessiers", "lombaires"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "quadriceps", "ischio-jambiers", "fessiers"],
        ["dos", "epaules", "pectoraux"],
        ["jambes", "fessiers", "dos", "epaules"],
      ];
    default:
      return getSplitHommeA(3);
  }
};

const getSplitHommeB = (nb) => getSplitHommeA(nb);
const getSplitFemmeA = (nb) => getSplitHommeA(nb);
const getSplitFemmeB = (nb) => getSplitFemmeA(nb);

/* ------------------- GENERATION AUTO PRINCIPALE ------------------- */
/**
 * ⚠️ IMPORTANT : `objectif` ici DOIT être la clé PARAMS (ex: endurance)
 */
async function generateAutoProgram({ sexe, niveau, nbSeances, objectif }) {
  const db = admin.firestore();

  const [ts, ws, cs, es] = await Promise.all([
    db.collection("training").get(),
    db.collection("warmup").get(),
    db.collection("cooldown").get(),
    db.collection("ergometre").get(),
  ]);

  const trainings = ts.docs.map((d) => d.data());
  const warmups = ws.docs.map((d) => d.data());
  const cooldowns = cs.docs.map((d) => d.data());
  const ergometres = es.docs.map((d) => d.data());

  const variant = Math.random() < 0.5 ? "A" : "B";
  const split =
    sexe === "Femme"
      ? variant === "A"
        ? getSplitFemmeA(nbSeances)
        : getSplitFemmeB(nbSeances)
      : variant === "A"
      ? getSplitHommeA(nbSeances)
      : getSplitHommeB(nbSeances);

  console.log(`[AUTO] Split choisi ${sexe === "Femme" ? "F" : "H"} ${variant}`, split);
  console.log(`[AUTO] Objectif PARAMS utilisé`, { objectif });

  const programmeComplet = [];
  const cleanArr = (arr) => (Array.isArray(arr) ? arr.filter(Boolean) : []);

  split.forEach((groups, idx) => {
    const trainingsShuffled = shuffle(trainings);
    const blacklist = new Set();
    const baseBlacklist = new Set();

    const corps = [];

    groups.forEach((g) => {
      let principal = trainingsShuffled.find(
        (e) =>
          matchGroupeMusculaire(e, g) &&
          estPrincipal(e) &&
          exoMatchMateriel(e, "Salle de sport") &&
          exoMatchNiveau(e, niveau) &&
          !blacklist.has(blacklistKey(e.nom)) &&
          !baseBlacklist.has(blacklistKey(e.nom)) &&
          normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !==
            "abdominaux"
      );

      if (!principal) {
        principal = trainingsShuffled.find(
          (e) =>
            matchGroupeMusculaire(e, g) &&
            exoMatchMateriel(e, "Salle de sport") &&
            exoMatchNiveau(e, niveau) &&
            !blacklist.has(blacklistKey(e.nom)) &&
            !baseBlacklist.has(blacklistKey(e.nom)) &&
            normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !==
              "abdominaux"
        );
      }

      if (principal) {
        const pMain = fixerParametresExercice(principal, objectif, true, "corps");
        const optMain = buildDisplayedOptions(pMain, "corps");
        corps.push({ ...pMain, ...optMain });

        blacklist.add(blacklistKey(principal.nom));
        baseBlacklist.add(blacklistKey(principal.nom));

        const secondaire = pickSecondaryComplementaire({
          trainings: trainingsShuffled,
          principal,
          blacklist,
          baseBlacklist,
          sessionGroups: groups,
          alreadyPicked: corps,
        });

        if (secondaire) {
          const pSec = fixerParametresExercice(secondaire, objectif, true, "corps");
          const optSec = buildDisplayedOptions(pSec, "corps");
          corps.push({ ...pSec, ...optSec });

          blacklist.add(blacklistKey(secondaire.nom));
          baseBlacklist.add(blacklistKey(secondaire.nom));
        }
      }
    });

    // Échauffement
    let echauffement = [];
    if (Math.random() < 0.5 && warmups.length > 0) {
      groups.forEach((g) => {
        const w = warmups.filter(
          (x) =>
            matchGroupeMusculaire(x, g) &&
            exoMatchMateriel(x, "Salle de sport") &&
            exoMatchNiveau(x, niveau)
        );
        if (w.length) {
          const exo = w[Math.floor(Math.random() * w.length)];
          const key = blacklistKey(exo.nom);
          if (!blacklist.has(key)) {
            const p = fixerParametresExercice(exo, objectif, false, "echauffement");
            const opt = buildDisplayedOptions(p, "echauffement");
            echauffement.push({ ...p, ...opt });
            blacklist.add(key);
          }
        }
      });
    } else if (ergometres.length > 0) {
      const ergosFiltres = ergometres.filter(
        (e) =>
          arrify(e.categorie_utilisation).map(normalize).includes("warmup") &&
          !blacklist.has(blacklistKey(e.nom))
      );
      if (ergosFiltres.length) {
        const ergo = ergosFiltres[Math.floor(Math.random() * ergosFiltres.length)];
        const p = fixerParametresExercice(ergo, objectif, false, "echauffement");
        const opt = buildDisplayedOptions(p, "echauffement");
        echauffement.push({ ...p, ...opt });
        blacklist.add(blacklistKey(ergo.nom));
      }
    }

    // Bonus
    let bonus = [];
    if (idx % 2 === 1) {
      const abdos = trainingsShuffled.filter(
        (e) =>
          normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) ===
            "abdominaux" &&
          exoMatchMateriel(e, "Salle de sport") &&
          exoMatchNiveau(e, niveau) &&
          !blacklist.has(blacklistKey(e.nom))
      );

      bonus = abdos.slice(0, 2).map((e) => {
        const p = fixerParametresExercice(e, objectif, !isTimeCore(e), "bonus");
        const opt = buildDisplayedOptions(p, "bonus");
        return { ...p, ...opt };
      });

      bonus.forEach((e) => blacklist.add(blacklistKey(e.nom)));
    } else if (ergometres.length > 0) {
      const ergosFiltres = ergometres.filter(
        (e) =>
          arrify(e.categorie_utilisation).map(normalize).includes("cardio") &&
          !blacklist.has(blacklistKey(e.nom))
      );
      if (ergosFiltres.length) {
        const ergo = ergosFiltres[Math.floor(Math.random() * ergosFiltres.length)];
        const p = fixerParametresExercice(ergo, objectif, false, "bonus");
        const opt = buildDisplayedOptions(p, "bonus");
        bonus.push({ ...p, ...opt });
        blacklist.add(blacklistKey(ergo.nom));
      }
    }

    // Retour au calme
    const retourCalme = (() => {
      const vus = new Set();
      const r = [];
      for (const g of groups.map(normalize)) {
        const cF = cooldowns.filter(
          (x) =>
            groupesEquivalents(g).includes(
              normalize(Array.isArray(x.groupe_musculaire) ? x.groupe_musculaire[0] : x.groupe_musculaire)
            ) &&
            exoMatchMateriel(x, "Salle de sport") &&
            exoMatchNiveau(x, niveau)
        );
        const fbC = cooldowns.filter(
          (x) =>
            normalize(Array.isArray(x.groupe_musculaire) ? x.groupe_musculaire[0] : x.groupe_musculaire) ===
              "fullbody" &&
            exoMatchMateriel(x, "Salle de sport") &&
            exoMatchNiveau(x, niveau)
        );

        if (cF.length || fbC.length) {
          const cand = cF.length ? cF : fbC;
          const exo = cand[Math.floor(Math.random() * cand.length)];
          if (!vus.has(exo.nom)) {
            const p = fixerParametresExercice(exo, objectif, false, "retourCalme");
            const opt = buildDisplayedOptions(p, "retourCalme");
            r.push({ ...p, ...opt });
            vus.add(exo.nom);
          }
        }
      }
      return r;
    })();

    programmeComplet.push({
      sessionIndex: idx + 1,
      sessionName: `Séance ${idx + 1}`,
      echauffement: cleanArr(echauffement),
      corps: cleanArr(corps),
      bonus: cleanArr(bonus),
      retourCalme: cleanArr(retourCalme),
    });
  });

  return { sessions: programmeComplet };
}

/* ------------------- GENERATION + SAUVEGARDE ------------------- */
async function generateAndSaveAutoProgram({
  clientId,
  sexe,
  niveau,
  nbSeances,
  objectif,
  objectifOriginal,
  objectifUI,
  objectifUi,
  objectifParamsKey,
  createdBy = "auto-cron",
  nomProgramme,
}) {
  const db = admin.firestore();

  // 1) Objectif UI (stockage)
  const objectifUIRaw = objectifOriginal || objectifUI || objectifUi || objectif || "";
  const objectifStored = objectifKeyForStorage(objectifUIRaw, nomProgramme);

  // 2) Objectif PARAMS (moteur)
  // - priorité à objectifParamsKey venant du front
  // - sinon: perte_de_poids => endurance
  const objectifParamsFinal = objectifParamsKey
    ? toKey(objectifParamsKey)
    : objectifKeyForParams(objectifStored);

  // 3) Nom programme propre
  const autoNameBase = nomProgramme && String(nomProgramme).trim() ? sanitizeProgramName(nomProgramme) : "";
  const autoName = autoNameBase || `${formatLabel(objectifStored)} — ${nbSeances}x/Sem`;

  console.log(`[AUTO][SAVE] objectifs`, {
    received_objectif: objectif,
    received_objectifOriginal: objectifOriginal,
    received_objectifUI: objectifUI,
    received_objectifParamsKey: objectifParamsKey,
    stored_objectif: objectifStored,
    params_key_final: objectifParamsFinal,
    nomProgramme_received: nomProgramme,
    nomProgramme_saved: autoName,
  });

  // 4) Génération (moteur avec PARAMS)
  const { sessions } = await generateAutoProgram({
    sexe,
    niveau,
    nbSeances,
    objectif: objectifParamsFinal || "endurance",
  });

  const data = {
    sessions,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy,
    nbSeances,

    // ✅ nom propre
    nomProgramme: autoName,

    niveauSportif: niveau,

    // ✅ stockage / affichage
    objectif: objectifStored,

    // ✅ infos debug / moteur
    objectifParamsKey: objectifParamsFinal,
    objectifUI: objectifUIRaw || null,

    clientId: clientId || null,
    origine: "auto",
  };

  let docRef;
  if (clientId) {
    docRef = await db.collection("clients").doc(clientId).collection("programmes").add(data);
  } else {
    docRef = await db.collection("programmes").add(data);
  }

  return { id: docRef.id, ...data };
}

module.exports = {
  generateAutoProgram,
  generateAndSaveAutoProgram,
};

