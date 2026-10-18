// Bounded parallel reads retain the legacy ten-value queries and result order.
async function batchedFieldReads(db, collectionName, field, values) {
  const unique = [...new Set(values.filter(Boolean))];
  const groups = [];
  for (let i = 0; i < unique.length; i += 10) groups.push(unique.slice(i, i + 10));
  const results = new Array(groups.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, groups.length) }, async () => {
    while (next < groups.length) {
      const index = next++;
      const snap = await db.collection(collectionName).where(field, 'in', groups[index]).limit(500).get();
      results[index] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  }));
  return results.flat();
}
module.exports = { batchedFieldReads };
