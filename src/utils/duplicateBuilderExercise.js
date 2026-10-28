// Copy the complete prescription without sharing mutable data or UI identities.
export function duplicateBuilderExercise(list, index, createId) {
  if (!list[index]) return list;
  const copy = structuredClone(list[index]);
  copy.id = createId();
  if (copy._id) copy._id = copy.id;
  if (Array.isArray(copy.sets)) {
    copy.sets.forEach(set => { if (set && typeof set === 'object') set._id = createId(); });
  }
  return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
}
