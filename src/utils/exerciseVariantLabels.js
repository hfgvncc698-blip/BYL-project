// Variant references may be legacy strings or structured catalog references.
// Never stringify an object or display an internal ID as an exercise name.
export function exerciseVariantLabels(value) {
  const entries = Array.isArray(value) ? value : value == null ? [] : [value];
  const labels = entries.map(entry => {
    const candidates = typeof entry === 'string' ? [entry] : entry && typeof entry === 'object'
      ? [entry.nom, entry.name, entry.title, entry.label, entry.exerciseName] : [];
    return candidates.find(label => typeof label === 'string' && label.trim() && !/\[object Object\]/i.test(label))?.trim() || '';
  }).filter(Boolean);
  return [...new Set(labels)];
}

const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Resolve against the loaded catalog, never invent alternatives from similar names.
export function resolveCatalogVariants(exercises) {
  const byId = new Map(), byName = new Map();
  for (const exercise of exercises) {
    for (const id of [exercise.id, exercise.docId]) {
      if (!id) continue;
      byId.set(`${exercise.__collection}/${id}`, exercise);
    }
    for (const name of [exercise.nom, exercise.name, ...(Array.isArray(exercise.aliases) ? exercise.aliases : []), ...Object.values(exercise.translations || {}).map(t => t.nom)]) {
      if (typeof name !== 'string') continue;
      const key = normalize(name);
      const matches = byName.get(key) || [];
      if (!matches.includes(exercise)) matches.push(exercise);
      byName.set(key, matches);
    }
  }
  return exercises.map(exercise => {
    const variants = Array.isArray(exercise.variantes) ? exercise.variantes : exercise.variantes ? [exercise.variantes] : [];
    const resolved = [];
    for (const variant of variants) {
      let target;
      if (variant && typeof variant === 'object') {
        for (const id of [variant.docId, variant.id, variant.exerciseId]) {
          target = byId.get(`${variant.collection || exercise.__collection}/${id}`);
          if (target) break;
        }
      }
      if (!target) {
        const matches = byName.get(normalize(exerciseVariantLabels(variant)[0])) || [];
        const sameCollection = matches.filter(e => e.__collection === exercise.__collection);
        target = sameCollection.length === 1 ? sameCollection[0] : matches.length === 1 ? matches[0] : undefined;
      }
      if (target && target !== exercise && !resolved.includes(target)) resolved.push(target);
    }
    const translations = Object.fromEntries(Object.entries(exercise.translations || {}).map(([lang, values]) => [lang, {
      ...values, variantes: resolved.map(target => target.translations?.[lang]?.nom || target.nom),
    }]));
    return {...exercise, variantes: resolved.map(target => ({id:target.id,docId:target.docId,collection:target.__collection,nom:target.nom})), translations};
  });
}
