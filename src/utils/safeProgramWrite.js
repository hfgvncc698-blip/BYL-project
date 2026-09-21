import {runTransaction, setDoc, deleteField} from 'firebase/firestore';
import limits from './programDocumentSize.js';
import i18next from 'i18next';
import {programSizeMessage} from '../i18n/programSize.js';

export function assertProgramSize(data, path) {
  try { return limits.assertProgramSize(data, path); }
  catch (error) {
    if (error.code === 'program-too-large') error.message = programSizeMessage(i18next.resolvedLanguage || i18next.language);
    throw error;
  }
}

export function setProgramDoc(ref, data) {
  data = {...data};
  if (Array.isArray(data.sessions)) delete data.seances;
  assertProgramSize(data, ref.path);
  return setDoc(ref, data);
}

export function updateProgramDoc(ref, patch, extraWrite) {
  if (Array.isArray(patch.sessions)) patch = {...patch, seances: deleteField()};
  // Read the complete latest document: a small patch can still overflow a large
  // programme. The transaction retries if another editor changes it meanwhile.
  return runTransaction(ref.firestore, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('Programme introuvable.');
    const candidate = {...snapshot.data()};
    for (const [key, value] of Object.entries(patch)) {
      if (key.includes('.')) throw new Error('Nested program updates must use a complete field.');
      if (value?._methodName === 'deleteField') delete candidate[key];
      else if (value?._methodName === 'serverTimestamp') candidate[key] = new Date();
      else if (value?._methodName) throw new Error('Unsupported program field transform');
      else candidate[key] = value;
    }
    assertProgramSize(candidate, ref.path);
    transaction.update(ref, patch);
    if(extraWrite) transaction.set(extraWrite.ref,extraWrite.data);
  });
}
