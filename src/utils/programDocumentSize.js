// Shared by the browser and the server. Leave headroom below Firestore's 1 MiB.
const MAX_PROGRAM_BYTES = 900 * 1024;
const bytes = value => new TextEncoder().encode(String(value)).length + 1;

function estimateDocumentBytes(value, path = '') {
  const seen = new Set();
  function size(item) {
    if (item == null) return 1;
    if (typeof item === 'string') return bytes(item);
    if (typeof item === 'number' || item instanceof Date) return 8;
    if (typeof item === 'boolean') return 1;
    if (typeof item !== 'object') throw new Error('Unsupported document value');
    // SDK scalar values: timestamps, references, binary and write transforms.
    if (typeof item.toMillis === 'function') return 8;
    if (typeof item.path === 'string' && (item.firestore || item._firestore)) return bytes(item.path) + 64;
    if (typeof item.toUint8Array === 'function') return item.toUint8Array().byteLength;
    if (ArrayBuffer.isView(item)) return item.byteLength;
    if (item instanceof ArrayBuffer) return item.byteLength;
    if (seen.has(item)) throw new Error('Circular document value');
    seen.add(item);
    const total = Array.isArray(item)
      ? item.reduce((sum, entry) => sum + size(entry), 0)
      : 32 + Object.entries(item).reduce((sum, [key, entry]) => entry === undefined ? sum : sum + bytes(key) + size(entry), 0);
    seen.delete(item);
    return total;
  }
  return size(value) + bytes(path) + 128;
}

function assertProgramSize(value, path = '') {
  const estimatedBytes = estimateDocumentBytes(value, path);
  if (estimatedBytes > MAX_PROGRAM_BYTES) {
    const error = new Error('Programme trop volumineux. Répartissez les séances dans plusieurs programmes avant d’enregistrer.');
    error.code = 'program-too-large';
    error.estimatedBytes = estimatedBytes;
    error.maxBytes = MAX_PROGRAM_BYTES;
    throw error;
  }
  return estimatedBytes;
}

// Firestore set(..., {merge:true}) retains nested fields absent from the patch.
function mergedProgramData(previous, patch) {
  const result = {...previous};
  const plain = item => item && Object.getPrototypeOf(item)?.constructor?.name === 'Object';
  for (const [key, value] of Object.entries(patch)) {
    result[key] = plain(value) && Object.keys(value).length && plain(result[key])
      ? mergedProgramData(result[key], value) : value;
  }
  return result;
}

export default {MAX_PROGRAM_BYTES, estimateDocumentBytes, assertProgramSize, mergedProgramData};
