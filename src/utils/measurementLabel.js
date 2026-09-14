// Values are stored in metric units; only height and body weight have display selectors.
export function measurementLabel(text, key, heightUnit = 'cm', weightUnit = 'kg') {
  if (key === 'height') return text.replace(/\(cm\)/u, `(${heightUnit})`);
  if (key === 'weight') return text.replace(/\(kg\)/u, `(${weightUnit})`);
  return text;
}
