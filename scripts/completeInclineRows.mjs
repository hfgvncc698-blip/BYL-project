import fs from 'node:fs';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { resolveCatalogVariants } from '../src/utils/exerciseVariantLabels.js';

// Targeted, opt-in catalog migration. Existing identity and creator are preserved.
// Technique reference: https://www.puregym.com/exercises/back/rows/incline-row/
// Programming ranges are editable coaching defaults, not a client prescription.
const text = JSON.parse(fs.readFileSync(new URL('./data/incline-row-translations.json', import.meta.url)));
const langs = ['fr', 'en', 'es', 'it', 'de', 'ru', 'ar'];
const originalId = 'tirage_scapulaire_a_plat_sur_bac_incline_halteres';
const ids = [originalId, 'rowing_halteres_banc_incline_pronation', 'rowing_halteres_banc_incline_supination'];
const replacementIds = ['T356', 'T357'];
const snapshotPath = process.env.INCLINE_ROW_SNAPSHOT || '/tmp/byl-training-before-incline-rows.json';
const snapshot = JSON.parse(fs.readFileSync(snapshotPath));
const original = snapshot.find(e => e.docId === originalId);
assert(original && original.data.status === 'pending', 'Expected original pending proposal');
const alternatives = replacementIds.map(id => {
  const matches = snapshot.filter(e => e.data.id === id);
  assert.equal(matches.length, 1, `Unique alternative ${id}`);
  return matches[0];
});
const reference = e => ({ id: e.data.id, docId: e.docId, collection: 'training', nom: e.data.nom });
function localized(t, index) {
  return {
    nom: t.names[index], groupe_musculaire: t.group, objectifs: t.objectives,
    muscles_secondaires: t.muscles, articulations_sollicitees: t.joints, articulations_solicitees: t.joints,
    tendons_sollicites: t.tendons, tendons_solicites: t.tendons,
    type: t.type, niveau: t.level, materiel: t.equipment, position: t.position, contraintes: t.constraints,
    consignes: { Positionnement: `${t.setup} ${t.grips[index]}`, Mouvement: t.moves[index], Retour: t.return, Respiration: t.breathing, Posture: t.posture },
  };
}
const range = (series, repetitions, repos, tempo = 3) => ({ series, repetitions, repos, temps_par_repetition: tempo, temps_effort: repetitions.map(n => n * tempo) });
const parameters = {
  force: range([3, 5], [5, 8], [120, 180]),
  hypertrophie: range([3, 4], [8, 12], [60, 120]),
  prise_de_masse: range([3, 4], [8, 12], [60, 120]),
  endurance: range([2, 3], [15, 20], [30, 60]),
  postural: range([2, 3], [12, 15], [45, 60]),
  remise_au_sport: range([2, 3], [10, 15], [60, 90]),
  maintien_en_forme: range([2, 3], [10, 15], [60, 90]),
};
const tags = {
  ...alternatives.find(e => e.data.id === 'T356').data.programmingTags,
  bodyRegions: ['upper_body'], secondaryMuscleTags: ['shoulders', 'biceps'],
  jointTags: ['shoulder', 'elbow', 'wrist'], resistanceProfile: ['free_weight', 'dumbbell'],
  equipmentTags: ['dumbbells', 'bench'], equipmentTier: 'free_weights',
  stabilityProfile: 'free_stable', loadPlacement: ['local_load'], contexts: ['home', 'gym'],
};
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const rows = ids.map((id, index) => ({ docId: id, data: {
  ...localized(text.fr, index), id, categorie: 'training', categorie_utilisation: ['training'],
  nom_normalized: normalize(text.fr.names[index]), family_key: 'rowing halteres banc incline',
  aliases: index === 0 ? [original.data.nom, 'Tirage scapulaire à plat sur banc incliné avec haltères'] : [],
  parametres_objectif: parameters, programmingTags: tags,
  translations: Object.fromEntries(langs.map(lang => [lang, localized(text[lang], index)])),
  mode_pro: true, status: 'validated',
} }));
for (const row of rows) {
  const targets = [...rows.filter(e => e !== row), ...alternatives];
  row.data.variantes = targets.map(reference);
  for (const lang of langs) {
    row.data.translations[lang].variantes = targets.map(e => {
      const label = lang === 'fr' ? e.data.nom : e.data.translations?.[lang]?.nom;
      assert(label, `Missing ${lang} alternative ${e.docId}`);
      return label;
    });
  }
}
for (const row of rows) {
  for (const lang of langs) {
    const tr = row.data.translations[lang];
    for (const key of ['nom', 'groupe_musculaire', 'objectifs', 'muscles_secondaires', 'articulations_sollicitees', 'tendons_sollicites', 'type', 'niveau', 'materiel', 'position', 'contraintes', 'variantes']) assert(tr[key]?.length, `${lang}/${key}`);
    assert.equal(Object.keys(tr.consignes).length, 5);
    assert(Object.values(tr.consignes).every(v => typeof v === 'string' && v.length > 10));
    if (lang !== 'fr') assert.notEqual(tr.consignes.Mouvement, row.data.consignes.Mouvement);
  }
  assert.equal(row.data.variantes.length, 4);
  assert.equal(new Set(row.data.variantes.map(v => v.docId)).size, 4);
  for (const p of Object.values(row.data.parametres_objectif)) for (const key of ['series', 'repetitions', 'repos', 'temps_effort']) assert(p[key].length === 2 && p[key][0] > 0 && p[key][0] <= p[key][1]);
}
const catalog = [...rows, ...alternatives].map(e => ({ ...e.data, docId: e.docId, __collection: 'training' }));
const resolved = resolveCatalogVariants(catalog);
for (const id of ids) assert.equal(resolved.find(e => e.docId === id).variantes.length, 4);
console.log('Validated: 3 row variations, 7 languages, 4 resolved alternatives each, 7 programming objectives.');

if (process.argv.includes('--commit')) {
  const credentials = JSON.parse(fs.readFileSync(new URL('../backend/serviceAccountKey.json', import.meta.url)));
  const db = new Firestore({ projectId: credentials.project_id, credentials, preferRest: true });
  try {
    const refs = [...rows, ...alternatives].map(e => db.collection('training').doc(e.docId));
    await db.runTransaction(async tx => {
      const docs = await tx.getAll(...refs);
      // Refuse to overwrite edits made since the inspected snapshot.
      for (let i = 0; i < docs.length; i++) {
        if (i === 1 || i === 2) { assert(!docs[i].exists, `Already exists: ${docs[i].id}`); continue; }
        const expected = i === 0 ? original : alternatives[i - 3];
        assert.equal(docs[i].updateTime.toDate().toISOString(), expected.updateTime, `Concurrent change: ${docs[i].id}`);
        assert.equal(docs[i].data().id, expected.data.id);
      }
      fs.writeFileSync('/tmp/byl-incline-rows-write-backup.json', JSON.stringify(docs.map(d => ({ path: d.ref.path, exists: d.exists, data: d.exists ? d.data() : null })), null, 2), { mode: 0o600 });
      for (let i = 0; i < rows.length; i++) {
        const patch = { ...rows[i].data, updatedAt: FieldValue.serverTimestamp(), validatedAt: FieldValue.serverTimestamp(), completionSource: 'admin-request-incline-row-2026-11-20' };
        if (i === 0) tx.update(refs[i], patch);
        else tx.create(refs[i], { ...patch, createdAt: FieldValue.serverTimestamp(), createdBy: original.data.createdBy, createdByName: original.data.createdByName });
      }
      // Reciprocal links preserve every existing alternative and translation.
      for (let i = 0; i < alternatives.length; i++) {
        const current = docs[i + 3].data();
        const variants = [...(current.variantes || [])];
        for (const row of rows) if (!variants.some(v => v?.docId === row.docId || v?.id === row.data.id || v === row.data.nom)) variants.push(reference(row));
        const patch = { variantes: variants, updatedAt: FieldValue.serverTimestamp() };
        for (const lang of langs.filter(l => l !== 'fr')) patch[`translations.${lang}.variantes`] = [...new Set([...(current.translations?.[lang]?.variantes || []), ...rows.map(e => e.data.translations[lang].nom)])];
        tx.update(refs[i + 3], patch);
      }
    });
    const saved = await db.getAll(...refs);
    for (let i = 0; i < rows.length; i++) {
      for (const [key, value] of Object.entries(rows[i].data)) assert(isDeepStrictEqual(saved[i].data()[key], value), `Saved mismatch ${ids[i]}/${key}`);
      console.log('Verified saved:', saved[i].data().nom);
    }
    for (const d of saved.slice(3)) assert(rows.every(r => d.data().variantes.some(v => v?.docId === r.docId)));
    console.log('Verified: 2 reciprocal replacement lists; original identity and creation metadata preserved.');
  } finally { await db.terminate(); }
}
