import assert from 'node:assert/strict';
import { varyCycleExercises as varyWithHistory } from '../src/utils/cycleVariation.js';
const ex = (id, nom) => ({ id, nom, materiel: ['Haltères'], groupe_musculaire: 'Pectoraux', niveau: 'Tous niveaux', 'Répétitions': 10, 'Séries': 3, 'Charge (kg)': 30 });
const history = ['2026-10-01', '2026-10-03'].map((date, i) => ({id: String(i), status:'completed', completedAt:date, exerciseSnapshots:['a','b','c'].map(exerciseId => ({exerciseId, sets:Array.from({length:3},()=>({reps:10,chargeKg:30}))}))}));
const varyCycleExercises = (sessions, bank, type) => varyWithHistory(sessions, bank, type, history);
const source = [{ exercises: [ex('a','Repère'), ex('b','Développé'), ex('c','Autre')] }];
const bank = [{ ...ex('b','Développé'), variantes: ['Variante'] }, { ...ex('v','Variante'), image_homme: 'new-image' }];
const result = varyCycleExercises(source, bank, 'hypertrophy');
assert.equal(result[0].exercises[0].id, 'a');
assert.equal(result[0].exercises[1].id, 'v');
assert.equal(result[0].exercises[1]['Charge (kg)'], 0);
assert.equal(result[0].exercises[1].image_homme, 'new-image');
assert.equal(result[0].exercises[2].id, 'c');
assert.equal(source[0].exercises[1].id, 'b');
assert.equal(varyCycleExercises(source, bank, 'recovery')[0].exercises[1].id, 'b');
assert.equal(varyCycleExercises(source, bank, 'recovery')[0].exercises[0].id, 'a');
assert.deepEqual(varyCycleExercises(source, bank.map(e => ({ ...e, materiel: ['Barre'] })), 'strength'), source);
assert.deepEqual(varyCycleExercises(source, [], 'hypertrophy'), source);
assert.deepEqual(varyCycleExercises(source, bank.map(e => ({ ...e, niveau: 'Avancé' })), 'strength'), source);
console.log('Cycle variations: reference preserved, compatible accessory rotation, compatible equipment, fresh identity, no transferred loads, recovery adapted OK');

const extras = [{ exercises: [ex('a', 'Repère'), ex('b', 'Développé'), ex('c', 'Autre')] }];
const variants = [...bank, { ...ex('c', 'Autre'), variantes: ['Autre variante'] }, ex('v2', 'Autre variante')];
assert.deepEqual(varyCycleExercises(extras, variants, 'hypertrophy')[0].exercises.map(e => e.id), ['a', 'v', 'v2']);
const sections = [{ useSections: true, corps: [ex('a', 'Repère')], bonus: [ex('b', 'Développé')] }];
assert.equal(varyCycleExercises(sections, bank, 'hypertrophy')[0].bonus[0].id, 'v');

// Variety can follow one successful completion; load/repetition progression still
// has its own two-completion gate. Rotate all compatible accessories, not a quota.
const accessories = ['b', 'c', 'd', 'e'].map(id => ex(id, `Secondaire ${id}`));
const expandedBank = accessories.flatMap(item => [item, {
  ...ex(`new-${item.id}`, `Variante ${item.id}`), variantes: [item.nom],
}]);
const oneSuccess = [{ id: 'one-success', status: 'completed', completedAt: '2026-10-03',
  exerciseSnapshots: accessories.map(item => ({ exerciseId: item.id,
    sets: Array.from({ length: 3 }, () => ({ reps: 10, chargeKg: 30 })),
  })),
}];
const repeatedSessions = [1, 2].map(() => ({ exercises: [ex('a', 'Repère'), ...accessories] }));
const expanded = varyWithHistory(repeatedSessions, expandedBank, 'hypertrophy', oneSuccess);
for (const session of expanded) {
  assert.equal(session.exercises[0].id, 'a');
  assert.equal(session.exercises.filter(item => item.cycleVariation?.proposed).length, 4);
  assert.equal(new Set(session.exercises.map(item => item.id)).size, 5);
  assert.ok(session.exercises.slice(1).every(item => item['Charge (kg)'] === 0));
}
assert.deepEqual(varyWithHistory(repeatedSessions, expandedBank, 'hypertrophy', []), repeatedSessions);
const failed = structuredClone(oneSuccess);
failed[0].exerciseSnapshots.forEach(item => { item.sets[0].reps = 8; });
assert.deepEqual(varyWithHistory(repeatedSessions, expandedBank, 'hypertrophy', failed), repeatedSessions);
assert.deepEqual(varyWithHistory(repeatedSessions, expandedBank, 'recovery', oneSuccess), repeatedSessions);
console.log('Expanded rotation: four accessories, reciprocal variants, reuse across sessions, success required OK');

// The first/primary compound can now change to a compatible horizontal press.
const chest = { ...ex('chest', 'Chest Press convergente (prise pronation)'),
  materiel: ['Machine'], role: 'primary', isCompound: true };
const pressBank = [chest,
  { ...ex('fly', 'Écartés'), materiel: ['Aucun'] },
  { ...ex('bench', 'Développé couché haltères prise neutre'), materiel: ['Haltères', 'Banc'] },
  { ...ex('push', 'Pompes Classiques'), materiel: ['Poids du corps'] },
];
const chestHistory = [{ ...oneSuccess[0], exerciseSnapshots: [{ exerciseId: 'chest',
  sets: Array.from({ length: 3 }, () => ({ reps: 10, chargeKg: 30 })),
}] }];
const chestSessions = [{ exercises: [chest] }];
const rotatedChest = varyWithHistory(chestSessions, pressBank, 'strength', chestHistory)[0].exercises[0];
assert.equal(rotatedChest.id, 'push', 'same muscle alone is insufficient; missing bench equipment excludes bench press');
assert.equal(rotatedChest.cycleVariation.reason, 'main_rotation');
assert.equal(rotatedChest['Charge (kg)'], 0);
const { adaptCycleSessions } = await import('../src/utils/cyclePrescription.js');
for (const [type, expected] of Object.entries({ general: [2, 15, 90], endurance: [3, 20, 60], hypertrophy: [3, 10, 90], strength: [3, 6, 180] })) {
  const adapted = adaptCycleSessions([{ exercises: [rotatedChest] }], type, chestHistory).sessions[0].exercises[0];
  assert.deepEqual([adapted['Séries'], adapted['Répétitions'], adapted['Repos (min:sec)']], expected);
  assert.equal(adapted.cyclePrescription.suggestedKg, 0, 'source chest press load is never applied to push-ups');
  assert.equal(adapted.cyclePrescription.repeatedSuccess, false, 'source performance is not performance on the new movement');
}
assert.equal(varyWithHistory(chestSessions, pressBank, 'recovery', chestHistory)[0].exercises[0].id, 'chest');
assert.equal(varyWithHistory(chestSessions, pressBank, 'custom', chestHistory)[0].exercises[0].id, 'chest');
const withBench = [{ exercises: [chest, { ...ex('other', 'Autre'), materiel: ['Haltères', 'Banc'] }] }];
assert.equal(varyWithHistory(withBench, pressBank, 'hypertrophy', chestHistory)[0].exercises[0].id, 'bench');
console.log('Main exercise rotation and all cycle sets/reps/rest presets passed');
