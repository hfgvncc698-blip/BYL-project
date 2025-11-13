// utils/generateAutoProgram.js
const admin = require("firebase-admin");

/* ------------------------ HELPERS ------------------------ */
const niveaux = [
  { ui: "Débutant",      firestore: ["débutant", "tous niveaux"] },
  { ui: "Intermédiaire", firestore: ["intermédiaire", "tous niveaux"] },
  { ui: "Confirmé",      firestore: ["avancé", "confirmé", "tous niveaux"] },
];

const stripDiacritics = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalize = (str = "") =>
  stripDiacritics(String(str).toLowerCase()).trim().replace(/\s+/g, " ");
const toKey = (s = "") =>
  normalize(s).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const arrify = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const blacklistKey = (name = "") => (normalize(name).split(/\s*-\s*/)[0] || "");

/** Aliases objectifs UI -> clés stockées dans parametres_objectif */
const OBJECTIF_ALIASES = {
  perte_de_poids: "endurance",
  prise_de_masse: "hypertrophie",
  endurance: "endurance",
  force: "force",
  hypertrophie: "hypertrophie",
  remise_au_sport: "remise_au_sport",
  maintien_en_forme: "maintien_en_forme",
  renforcement: "renforcement",
  cardio: "cardio",
  postural: "postural",
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
  const grp = normalize(Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire[0] : ex.groupe_musculaire);
  const motsCles = ["developpe","squat","souleve","traction","presse","rowing","hip","fente","tirage","deadlift"];
  const nonPrioritaires = ["mollets","abdominaux","avant-bras","trapezes","trapeze","poignets"];
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
  if (/souleve|deadlift|roman|good ?morning|hip thrust|hinge|glute bridge|hip extension/.test(n)) return "legs_hip";
  if (/mollet|calf/.test(n)) return "calves";
  if (/extension lombaire|roman chair|back extension|superman/.test(n)) return "lower_back";
  if (/developpe|couch|pompes|dips|militaire|overhead|arnold/.test(n)) return "press";
  if (/tirage|rowing|row|traction|pull[- ]?over|face pull|tirage vertical|tirage horizontal/.test(n)) return "pull";
  if (/leg extension/.test(n)) return "quad_iso";
  if (/leg curl|curl f(é|e)moral|ischio/.test(n)) return "ham_iso";
  if (/ecarte|pec deck/.test(n)) return "pec_iso";
  if (/eleva|oiseaux|lateral/.test(n)) return "shoulder_iso";
  if (/curl( biceps)?/.test(n)) return "bi_iso";
  if (/(extension|pushdown|barre au front|overhead).*triceps/.test(n) || /kick ?back.*triceps/.test(n)) return "tri_iso";
  return "other";
}
function primaryGroup(ex) {
  return normalize(Array.isArray(ex.groupe_musculaire) ? ex.groupe_musculaire[0] : ex.groupe_musculaire);
}
const isAbs = (ex) => primaryGroup(ex) === "abdominaux";

/* ---------------- Diversité / Sémantique ------------------ */
function semanticFamily(ex) {
  const n = normalize(ex?.nom || "");
  const g = primaryGroup(ex);
  // Fessiers
  if (/kick ?back|donkey|hip( |_)?extension|glute kickback/.test(n)) return "glute_kickback";
  if (/fire hydrant|abduction|abducteur/.test(n)) return "glute_abduction";
  if (/hip thrust|glute bridge|pont fessier/.test(n)) return "glute_hipthrust";
  // Jambes iso
  if (/leg extension|extension quadriceps/.test(n)) return "quad_extension";
  if (/leg curl|ischio|curl f(é|e)moral/.test(n)) return "ham_curl";
  // Mollets
  if (/calf|mollet|extension mollets/.test(n)) return "calf_raise";
  // Epaules
  if (/eleva.*lat(é|e)r|oiseaux|lateral raise|elevations lat/.test(n)) return "shoulder_lateral";
  if (/developpe.*milit|overhead press|arnold/.test(n)) return "shoulder_press";
  // Pecs iso
  if (/ecarte|pec deck|fly/.test(n)) return "pec_fly";
  // Biceps / Triceps
  if (/curl( biceps)?/.test(n)) return "biceps_curl";
  if (/(extension|pushdown|barre au front|overhead).*triceps/.test(n) || /kick ?back.*triceps/.test(n)) return "triceps_ext";
  // Dos iso
  if (/face pull/.test(n)) return "rear_delt_facepull";
  return `${movementFamilyKey(ex)}__${g}`;
}

/* ---------------- Détection ERGO + display ---------------- */
function isErgoStrict(ex) {
  const coll = normalize(ex?.collection);
  const cat  = normalize(ex?.categorie);
  const typ  = normalize(ex?.type);
  const cu   = arrify(ex?.categorie_utilisation).map(normalize);
  return (
    coll === "ergometre" ||
    cat  === "ergometre" ||
    typ  === "ergometre" ||
    cu.includes("ergometre")
  );
}
function isErgoForDisplay(ex, sectionKey) {
  if (isErgoStrict(ex)) return true;
  if (sectionKey === "corps") return false;
  const txt = [
    ex?.nom,
    ...(arrify(ex?.materiel || ex?.équipement || ex?.equipement)),
    ex?.modele,
    ex?.sous_type,
  ].filter(Boolean).map(String).join(" ").toLowerCase();
  return /(tapis|treadmill|course|marche|vélo|velo|bike|airdyne|assault|elliptique|stepper|stair|escalier|rameur|rower|concept\s*2|skierg|ski)/i.test(txt);
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
  const pick = (k) => (params[k] ?? params[toKey(k)] ?? ex[k]);
  const res = {};
  res.vitesse     = pick("vitesse") ?? pick("vitesse_kmh") ?? pick("speed") ?? pick("kmh");
  res.distance    = pick("distance") ?? pick("km") ?? pick("meters") ?? pick("m");
  res.watts       = pick("watts") ?? pick("puissance");
  res.calories    = pick("calories") ?? pick("kcal");
  res.intensite   = pick("intensite") ?? pick("intensité") ?? pick("intensity");
  res.inclinaison = pick("inclinaison") ?? pick("incline") ?? pick("inclinaison_%");
  res.rpm         = pick("rpm") ?? pick("cadence");
  const niveau    = pick("niveau");
  const resi      = pick("resistance") ?? pick("résistance");
  if (typeof resi === "number") res.resistance = resi;
  else if (typeof niveau === "number") res.resistance = niveau;
  res.allure      = pick("allure") ?? pick("pace") ?? pick("min_km");
  res.fc          = pick("fc") ?? pick("frequence_cardiaque") ?? pick("fréquence_cardiaque") ?? pick("hr") ?? pick("bpm");
  Object.keys(res).forEach((k) => res[k] === undefined && delete res[k]);
  return res;
}

/* ---------------- Abdos/holds & Stretching ---------------- */
function isTimeCore(ex) {
  const n = normalize(ex?.nom || "");
  return /vacuum|gainage|plank|planche|side\s*plank|gainage\s*lat(é|e)ral|hollow(\s*hold)?|superman(\s*hold)?|dead\s*bug(\s*hold)?|chaise|wall\s*sit/.test(n);
}
function isStaticHold(ex) {
  const n = normalize(ex?.nom || "");
  return isTimeCore(ex) || /(isom(é|e)tr|statique|hold|maintien)/.test(n);
}
function isStretchingName(ex) {
  const n = normalize(ex?.nom || "");
  return /(stretch|étirement|etirement|mobilit(é|e)|pass-?through|pigeon|chat|cat|door|torsion|ouverture)/.test(n);
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
  }
  else if (sectionKey === "corps") {
    flags.series = true;
    flags.repetitions = !isStaticHold(ex);
    flags.temps = isStaticHold(ex);
    flags.repos = true;
    flags.charge = !isStaticHold(ex);
  }
  else {
    // WU / BONUS
    flags.series = true;
    flags.repetitions = false;
    flags.temps = true;
    flags.repos = true;

    if (isErgoForDisplay(ex, sectionKey)) {
      const kind = ergoKind(ex);
      flags.calories  = true;
      flags.intensite = true;

      if (kind === "treadmill") {
        flags.vitesse = true; flags.distance = true; flags.inclinaison = true; flags.allure = true; flags.fc = true;
      } else if (kind === "bike") {
        flags.vitesse = true; flags.distance = true; flags.watts = true; flags.rpm = true; flags.resistance = true; flags.fc = true;
      } else if (kind === "rower") {
        flags.distance = true; flags.watts = true; flags.allure = true; flags.fc = true;
      } else if (kind === "elliptical") {
        flags.vitesse = true; flags.distance = true; flags.rpm = true; flags.resistance = true; flags.fc = true;
      } else if (kind === "skierg" || kind === "stepper") {
        flags.distance = true; flags.watts = true; flags.allure = true; flags.fc = true;
      } else {
        flags.vitesse = true; flags.distance = true; flags.watts = true;
      }
    }
  }

  const order = [];
  if (flags.series)      order.push("Séries");
  if (flags.repetitions) order.push("Répétitions");
  if (flags.temps)       order.push("Durée (min:sec)");
  if (flags.charge)      order.push("Charge (kg)");
  if (flags.repos)       order.push("Repos (min:sec)");
  if (flags.intensite)   order.push("Intensité");
  if (flags.vitesse)     order.push("Vitesse");
  if (flags.distance)    order.push("Distance");
  if (flags.watts)       order.push("Watts");
  if (flags.rpm)         order.push("Cadence (rpm)");
  if (flags.resistance)  order.push("Résistance / Niveau");
  if (flags.inclinaison) order.push("Inclinaison (%)");
  if (flags.allure)      order.push("Allure");
  if (flags.fc)          order.push("Fréquence cardiaque");
  if (flags.calories)    order.push("Objectif Calories");

  return { optionsEnabled: flags, optionsOrder: order };
}

/* ----------------- Fixation des paramètres d’exo ----------------- */
const SEC_PER_REP = 2;
function dropErgoKeys(obj) {
  ["vitesse","distance","watts","calories","intensite","inclinaison","rpm","resistance","allure","fc"]
    .forEach((k) => delete obj[k]);
}
function dropIfZeroish(obj, keys) {
  keys.forEach((k) => {
    if (obj[k] === 0 || obj[k] === "0" || obj[k] === "0.0") delete obj[k];
  });
}

function resolveParamsForObjectif(ex, objectifUI) {
  const keyUI = toKey(objectifUI);
  const alias = OBJECTIF_ALIASES[keyUI] || keyUI;
  const po = ex?.parametres_objectif || {};
  return (po && (po[alias] || po[keyUI])) ? { ...(po[alias] || po[keyUI]) } : {};
}

function fixerParametresExercice(ex, objectifUI = "endurance", forceReps = false, sectionKey = "corps") {
  const paramsObj = resolveParamsForObjectif(ex, objectifUI);
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
    sectionParams =
      isWU ? (paramsObj.echauffement || paramsObj.warmup || {}) :
      isCD ? (paramsObj.cooldown || paramsObj.retourCalme || {}) :
             (paramsObj || {});

    series = getRandomInRange(
      sectionParams.series ?? paramsObj.series ?? ex.series ?? 1
    );

    const effSec = getRandomInRange(
      sectionParams.temps_effort ?? sectionParams.duree_effort,
      arrondiSec
    );
    const effMin = getRandomInRange(
      sectionParams.duree ?? paramsObj.duree ?? ex.duree
    );

    temps_effort =
      (typeof effSec === "number" && effSec > 0) ? effSec :
      (typeof effMin === "number" && effMin > 0) ? effMin * 60 :
      getRandomInRange(
        paramsObj.temps_effort ?? paramsObj.duree_effort ?? ex.temps_effort ?? ex.duree_effort,
        arrondiSec
      ) || (isWU || isCD ? 180 : 60);

    let r = getRandomInRange(
      sectionParams.repos ?? sectionParams.duree_repos ??
      paramsObj.repos ?? paramsObj.duree_repos ??
      ex.repos ?? ex.duree_repos,
      arrondiSec
    );
    repos = (typeof r === "number") ? r : (isWU || isCD ? 30 : 60);

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
      result.temps_effort = (typeof temps_effort === "number" && temps_effort > 0) ? temps_effort : 30;
      result.repos = (typeof repos === "number" ? repos : 30);
      dropErgoKeys(result);
    } else {
      result.series = series || 3;
      let repsFinales = repetitions;
      if (!(typeof repsFinales === "number" && repsFinales > 0)) {
        if (typeof temps_effort === "number" && temps_effort > 0) {
          repsFinales = Math.max(5, Math.round(temps_effort / SEC_PER_REP));
        }
      }
      result.repetitions = (typeof repsFinales === "number" && repsFinales > 0) ? repsFinales : 10;
      delete result.temps_effort;
      result.repos = (typeof repos === "number" ? repos : 60);
      // charge visible en "corps"
    }
  } else {
    result.series = series || 1;

    const isIsoAbs = (sectionKey === "bonus" && isAbs(ex) && isTimeCore(ex));
    const wantReps = (sectionKey === "bonus" && isAbs(ex) && !isIsoAbs && !ergo) || (forceReps && !ergo);

    if (wantReps) {
      let repsFinales = repetitions;
      if (!(typeof repsFinales === "number" && repsFinales > 0)) {
        if (typeof temps_effort === "number" && temps_effort > 0) {
          repsFinales = Math.max(10, Math.round(temps_effort / SEC_PER_REP));
        } else {
          repsFinales = 15;
        }
      }
      result.repetitions = repsFinales;
      delete result.temps_effort;
      dropErgoKeys(result);
    } else {
      result.repetitions = undefined;
      result.temps_effort = (typeof temps_effort === "number" && temps_effort > 0)
        ? temps_effort
        : (isWU || isCD ? 30 : 60);
      if (!ergo) dropErgoKeys(result);
    }

    result.repos = (typeof repos === "number" ? repos : (isWU || isCD ? 30 : 60));
  }

  if (ergo) {
    const metrics = extractErgoMetrics(ex, paramsObj);
    Object.assign(result, metrics);

    const inten =
      sectionParams.intensite ?? sectionParams.intensité ??
      paramsObj.intensite ?? paramsObj.intensité ??
      ex.intensite ?? ex.intensité;
    if (inten !== undefined) result.intensite = inten;

    dropIfZeroish(result, ["vitesse","distance","watts","calories","inclinaison","rpm","resistance","allure","fc"]);
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
  delete result.seriesArr;
  delete result.repetitionsArr;
  delete result.pauseArr;
  delete result.temps_effortArr;
  delete result.duree;
  delete result.duree_repos;
  Object.keys(result).forEach((k) => result[k] === undefined && delete result[k]);

  return result;
}

/* ----------- Secondaire COMPLÉMENTAIRE (avec “retourner”) ----------- */
function pickSecondaryComplementaire({
  trainings,
  principal,
  blacklist,
  baseBlacklist,
  sessionGroups,
  alreadyPicked = [],
}) {
  if (!principal) return null;

  const gmP  = primaryGroup(principal);
  const famP = movementFamilyKey(principal);
  const nameP = normalize(principal.nom);
  const groupsToday = arrify(sessionGroups).map(normalize);

  // Historique / diversité
  const history = Array.isArray(alreadyPicked) ? alreadyPicked : [];
  const histFamilies = new Set(history.map((e) => semanticFamily(e)));
  const familyCount = history.reduce((acc, e) => {
    const f = semanticFamily(e);
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});

  // Règles
  const compRule = (() => {
    if (famP === "legs_knee")  return { group: "quadriceps", keywords: ["leg extension","extension quadriceps","extension"], famPref: ["quad_iso"], retourner: ["leg extension","extension quadriceps","sissy","presse"] };
    if (famP === "legs_hip")   return { group: "ischio-jambiers", keywords: ["leg curl","curl","flexion"],           famPref: ["ham_iso"], retourner: ["leg curl","curl f(é|e)moral","good ?morning","hip extension"] };
    if (famP === "press" || gmP === "pectoraux")
                                return { group: "triceps", keywords: ["extension","pushdown","barre au front","overhead"], famPref: ["tri_iso"],   retourner: ["extension.*triceps","pushdown","barre au front","overhead"] };
    if (famP === "pull"  || gmP === "dos")
                                return { group: "biceps",  keywords: ["curl"], famPref: ["bi_iso"],                     retourner: ["curl( biceps)?","incliné","hammer"] };
    if (gmP === "epaules")      return { group: "epaules",  keywords: ["eleva","oiseaux","lateral","latérales"],       famPref: ["shoulder_iso"], retourner: ["élévation lat","oiseaux","lateral raise"] };
    if (gmP === "fessiers")     return { group: "fessiers", keywords: ["abduction","kickback","fire hydrant","glute bridge","hip thrust"], famPref: ["glute_abduction","glute_kickback","glute_hipthrust"], retourner: ["kick ?back","fire hydrant","abduction","hip thrust|bridge"] };
    if (gmP === "ischio-jambiers")
                                return { group: "ischio-jambiers", keywords: ["curl","flexion"], famPref: ["ham_iso"],  retourner: ["leg curl","curl f(é|e)moral"] };
    if (gmP === "quadriceps")   return { group: "quadriceps",      keywords: ["extension"],       famPref: ["quad_iso"], retourner: ["leg extension","extension quadriceps"] };
    if (gmP === "mollets")      return { group: "mollets",         keywords: ["mollet","calf","extension mollets"], famPref: ["calves"], retourner: ["mollet|calf"] };
    if (gmP === "lombaires")    return { group: "lombaires",       keywords: ["extension lombaire","roman chair","good morning","superman"], famPref: ["lower_back"], retourner: ["extension lombaire","roman chair","good morning","superman"] };
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

  // quota: 1 par famille sémantique max en plus de l'existant
  const famQuotaOk = (e) => {
    const fam = semanticFamily(e);
    return (familyCount[fam] || 0) < 1;
  };

  const scoreCandidate = (e) => {
    let score = 0;
    const g  = primaryGroup(e);
    const mf = movementFamilyKey(e);
    const sf = semanticFamily(e);

    if (g === compRule.group) score -= 4;
    if (compRule.keywords.some((w) => normalize(e.nom).includes(normalize(w)))) score -= 3;
    if (compRule.famPref.includes(mf)) score -= 2;
    if (!histFamilies.has(sf)) score -= 1;          // diversité
    if (!groupsToday.includes(g)) score += 1;       // léger malus hors groupes du jour
    return score;
  };

  const filtered = pool
    .filter((e) => !isBannedByRetourner(e))
    .filter(famQuotaOk);

  // 1) Groupe préféré + keywords
  const inGroup = filtered
    .filter((e) => primaryGroup(e) === compRule.group)
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (inGroup.length) return inGroup[0];

  // 2) Familles préférées
  const famPrefPool = filtered
    .filter((e) => compRule.famPref.includes(movementFamilyKey(e)))
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (famPrefPool.length) return famPrefPool[0];

  // 3) Même groupe que principal (fallback)
  const sameGroup = filtered
    .filter((e) => primaryGroup(e) === gmP)
    .sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  if (sameGroup.length) return sameGroup[0];

  // 4) Dernier recours
  const any = filtered.sort((a, b) => scoreCandidate(a) - scoreCandidate(b));
  return any[0] || null;
}

/* -------------------- SPLITS (A & B) -------------------- */
// … (inchangé : toutes les fonctions getSplit* ici, mêmes que précédemment)
const getSplitHommeA = (nb) => {
  switch (nb) {
    case 1: return [["jambes","pectoraux","dos","epaules"]];
    case 2: return [
      ["jambes","pectoraux","dos","epaules"],
      ["jambes","pectoraux","dos","epaules"],
    ];
    case 3: return [
      ["jambes","jambes","fessiers","mollets","lombaires"],
      ["pectoraux","pectoraux","epaules","triceps","dos","dos","biceps"],
      ["jambes","pectoraux","dos","epaules","fessiers"],
    ];
    case 4: return [
      ["pectoraux","epaules","triceps","dos"],
      ["jambes","fessiers","mollets","lombaires"],
      ["pectoraux","epaules","biceps","dos"],
      ["jambes","fessiers","mollets","lombaires"],
    ];
    case 5: return [
      ["pectoraux","triceps","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","dos","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
    ];
    case 6: return [
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
    ];
    case 7: return [
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","dos","epaules"],
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
    ];
    default: return [];
  }
};
const getSplitHommeB = (nb) => {
  switch (nb) {
    case 3: return [
      ["pectoraux","dos","epaules"],
      ["jambes","fessiers","lombaires"],
      ["pectoraux","dos","epaules"],
    ];
    case 4: return [
      ["pectoraux","dos","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","dos","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
    ];
    case 5: return [
      ["pectoraux","dos","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","dos","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
      ["jambes","pectoraux","dos","epaules"],
    ];
    case 6: return [
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
    ];
    case 7: return [
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","quadriceps","mollets","lombaires"],
      ["pectoraux","triceps","epaules"],
      ["dos","biceps","epaules"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
      ["jambes","pectoraux","dos","epaules"],
    ];
    default: return getSplitHommeA(nb);
  }
};

const getSplitFemmeA = (nb) => {
  switch (nb) {
    case 1: return [["jambes","jambes","fessiers","fessiers","epaules","dos","pectoraux"]];
    case 2: return [
      ["jambes","jambes","fessiers","fessiers","epaules","dos"],
      ["jambes","jambes","fessiers","fessiers","epaules","pectoraux"],
    ];
    case 3: return [
      ["jambes","jambes","fessiers","fessiers","mollets","epaules"],
      ["dos","dos","epaules","epaules","pectoraux"],
      ["jambes","jambes","fessiers","fessiers","epaules","pectoraux"],
    ];
    case 4: return [
      ["jambes","jambes","fessiers","fessiers","epaules"],
      ["dos","dos","epaules","epaules","pectoraux"],
      ["jambes","jambes","fessiers","fessiers","epaules"],
      ["epaules","dos","pectoraux"],
    ];
    case 5: return [
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","epaules"],
      ["dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","mollets"],
    ];
    case 6: return [
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
    ];
    case 7: return [
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","mollets"],
      ["epaules","dos","epaules","pectoraux"],
      ["jambes","fessiers","jambes","fessiers","mollets"],
    ];
    default: return [];
  }
};
const getSplitFemmeB = (nb) => {
  switch (nb) {
    case 3: return [
      ["jambes","quadriceps","fessiers"],
      ["dos","epaules","pectoraux"],
      ["jambes","ischio-jambiers","fessiers"],
    ];
    case 4: return [
      ["jambes","quadriceps","fessiers","mollets"],
      ["dos","epaules","pectoraux"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
      ["dos","epaules","pectoraux"],
    ];
    case 5: return [
      ["jambes","quadriceps","fessiers","mollets"],
      ["dos","epaules","pectoraux"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
      ["dos","epaules","pectoraux"],
      ["jambes","fessiers","dos","epaules"],
    ];
    case 6: return [
      ["jambes","quadriceps","fessiers","mollets"],
      ["dos","epaules","pectoraux"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
      ["dos","epaules","pectoraux"],
      ["jambes","quadriceps","ischio-jambiers","fessiers"],
      ["dos","epaules","pectoraux"],
    ];
    case 7: return [
      ["jambes","quadriceps","fessiers","mollets"],
      ["dos","epaules","pectoraux"],
      ["jambes","ischio-jambiers","fessiers","lombaires"],
      ["dos","epaules","pectoraux"],
      ["jambes","quadriceps","ischio-jambiers","fessiers"],
      ["dos","epaules","pectoraux"],
      ["jambes","fessiers","dos","epaules"],
    ];
    default: return getSplitFemmeA(nb);
  }
};

/* ------------------- GENERATION AUTO PRINCIPALE ------------------- */
async function generateAutoProgram({ sexe, niveau, nbSeances, objectif }) {
  const db = admin.firestore();

  const [ts, ws, cs, es] = await Promise.all([
    db.collection("training").get(),
    db.collection("warmup").get(),
    db.collection("cooldown").get(),
    db.collection("ergometre").get(),
  ]);
  const trainings  = ts.docs.map((d) => d.data());
  const warmups    = ws.docs.map((d) => d.data());
  const cooldowns  = cs.docs.map((d) => d.data());
  const ergometres = es.docs.map((d) => d.data());

  const variant = Math.random() < 0.5 ? "A" : "B";
  const split =
    sexe === "Femme"
      ? (variant === "A" ? getSplitFemmeA(nbSeances) : getSplitFemmeB(nbSeances))
      : (variant === "A" ? getSplitHommeA(nbSeances) : getSplitHommeB(nbSeances));
  console.log(`[AUTO] Split choisi ${sexe === "Femme" ? "F" : "H"} ${variant}`, split);

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
          normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !== "abdominaux"
      );

      if (!principal) {
        principal = trainingsShuffled.find(
          (e) =>
            matchGroupeMusculaire(e, g) &&
            exoMatchMateriel(e, "Salle de sport") &&
            exoMatchNiveau(e, niveau) &&
            !blacklist.has(blacklistKey(e.nom)) &&
            !baseBlacklist.has(blacklistKey(e.nom)) &&
            normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) !== "abdominaux"
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
        (e) => arrify(e.categorie_utilisation).map(normalize).includes("warmup") &&
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
          normalize(Array.isArray(e.groupe_musculaire) ? e.groupe_musculaire[0] : e.groupe_musculaire) === "abdominaux" &&
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
        (e) => arrify(e.categorie_utilisation).map(normalize).includes("cardio") &&
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
    const { retourCalme } = (() => {
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
            normalize(Array.isArray(x.groupe_musculaire) ? x.groupe_musculaire[0] : x.groupe_musculaire) === "fullbody" &&
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
      return { retourCalme: r };
    })();

    programmeComplet.push({
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
  clientId, sexe, niveau, nbSeances, objectif, createdBy = "auto-cron", nomProgramme
}) {
  const db = admin.firestore();
  const { sessions } = await generateAutoProgram({ sexe, niveau, nbSeances, objectif });

  const autoName = nomProgramme || `${objectif} — ${nbSeances}x/Sem`;
  const data = {
    sessions,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy,
    nbSeances,
    nomProgramme: autoName,
    niveauSportif: niveau,
    objectif,
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

