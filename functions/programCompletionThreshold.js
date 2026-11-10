// The validation trigger needs a yes/no decision. Read one consistent snapshot
// and stop as soon as enough distinct execution documents qualify.
async function reachedCompletionThreshold(programRef, total, completedIndex) {
  if (!total) return false;
  const projected = programRef.collection('sessionsEffectuees').select(
    'status', 'isPartial', 'pourcentageTermine', 'progress', 'completionPercent',
    'validatedAt', 'completedAt', 'dateEffectuee', 'finishedAt',
    'sessionIndex', 'index', 'sessionIdx', 'sessionNumber'
  );
  return programRef.firestore.runTransaction(async transaction => {
    let count = 0;
    let cursor;
    do {
      const size = cursor ? 200 : Math.min(total, 200);
      const page = await transaction.get((cursor ? projected.startAfter(cursor) : projected).limit(size));
      for (const execution of page.docs) {
        if (completedIndex(execution.data(), total) !== null && ++count >= total) return true;
      }
      if (page.size < size) return false;
      cursor = page.docs[page.size - 1];
    } while (cursor);
    return false;
  }, {readOnly:true});
}
module.exports = {reachedCompletionThreshold};
