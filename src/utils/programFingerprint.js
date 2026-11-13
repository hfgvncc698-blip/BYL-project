// Complete canonical contents, including legacy records without a revision field.
export function programFingerprint(value) {
  const normalize = item => {
    if (item?.toJSON) return normalize(item.toJSON());
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().map(key=>[key,normalize(item[key])]));
    return item;
  };
  return JSON.stringify(normalize(value));
}
