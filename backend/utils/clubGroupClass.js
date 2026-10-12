function validateGroupClass(input) {
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) {
    throw Object.assign(new Error('La capacité doit être comprise entre 1 et 500 places.'), { status: 400 });
  }
  const validIds = ids => Array.isArray(ids) && ids.every(id => typeof id === 'string' && id && !id.includes('/') && id.length <= 160);
  if (!validIds(input.participantIds) || !validIds(input.waitlistIds ?? [])) {
    throw Object.assign(new Error('Liste de participants invalide.'), { status: 400 });
  }
  const reservations = [...new Set([...input.participantIds, ...(input.waitlistIds || [])])];
  if (reservations.length > capacity + 5) {
    throw Object.assign(new Error('Le cours et les 5 places en liste d’attente sont complets.'), { status: 400 });
  }
  const participantIds = reservations.slice(0, capacity);
  const waitlistIds = reservations.slice(capacity);
  if (!String(input.title || '').trim()) throw Object.assign(new Error('Le nom du cours est obligatoire.'), { status: 400 });
  return { capacity, participantIds, waitlistIds };
}
module.exports = { validateGroupClass };
