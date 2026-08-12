export const PROGRAM_DISPLAY_FIELD_MAP = {
  series: ["Séries", "series", "séries"],
  repetitions: ["Répétitions", "repetitions", "répétitions", "reps"],
  repos: ["Repos (min:sec)", "Repos", "repos", "pause", "rest", "duree_repos"],
  temps: ["Durée (min:sec)", "temps", "temps_effort", "duree", "durée", "duree_effort", "time"],
  charge: ["Charge (kg)", "Charge (lbs)", "charge", "poids", "weight"],
  intensite: ["Intensité", "intensite"],
  watts: ["Watts", "watts"],
  resistance: ["Résistance", "resistance"],
  inclinaison: ["Inclinaison (%)", "inclinaison", "incline"],
  calories: ["Objectif Calories", "calories"],
  tempo: ["Tempo", "tempo"],
  vitesse: ["Vitesse", "Vitesse (km/h)", "Vitesse (mph)", "vitesse", "speed"],
  distance: ["Distance", "Distance (m)", "Distance (miles)", "distance"],
};

const METRIC_POOLS = ["details", "data", "meta", "exercice", "exercise", "exo", "fields"];

export function readProgramDisplayMetric(exercise = {}, metricKey) {
  const keys = PROGRAM_DISPLAY_FIELD_MAP[metricKey] || [];
  const pools = [exercise, ...METRIC_POOLS.map((key) => exercise?.[key]).filter(Boolean)];

  // The builder/player writes canonical labels such as `Répétitions` and
  // `Charge (kg)`. They must win over legacy aliases left on older documents.
  for (const key of keys) {
    for (const pool of pools) {
      const value = pool?.[key];
      if (value !== undefined && value !== null) return value;
    }
  }

  return undefined;
}
