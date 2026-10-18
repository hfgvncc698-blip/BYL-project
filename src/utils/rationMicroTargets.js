const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/_/g, ' ').toLowerCase();

export function microTargetKeyFromNutrient(key) {
  const text = normalize(key);
  const vitamin = text.match(/\bvitamine?\s+(b12|b9|b6|b5|b3|b2|b1|a|c|d|e|k)\b/);
  if (vitamin) return `vit${vitamin[1].toUpperCase()}`;
  if (text.includes('activite vitaminique a')) return 'vitA';
  if (/\bsel\b/.test(text)) return 'salt';
  const names = ['calcium', 'potassium', 'magnesium', 'fer', 'iode', 'manganese', 'phosphore', 'cuivre', 'selenium', 'zinc', 'sodium', 'lactose', 'cholesterol'];
  for (const name of names) if (new RegExp(`\\b${name}\\b`).test(text)) return name;
  if (/fibres?|fiber/.test(text)) return 'fibres';
  if (/folate/.test(text)) return 'vitB9';
  if (/ascorb/.test(text)) return 'vitC';
  return '';
}

// The CIQUAL JSON exporter strips the micro sign from these column names.
export function prettyMicroNutrient(key) {
  let text = String(key || '').replace(/_100g$/i, '');
  if (/^(iode|selenium|retinol|beta_carotene|activite_vitaminique_a|vitamine_(b9|b12|d|d2|d3|k))(_|$)/.test(text)) {
    text = text.replace(/_g$/, '_µg');
  }
  return text.replace(/_/g, ' ');
}

export function targetForMicroNutrient(key, targets, macroTargets = {}) {
  const macroKey = /^proteines_/.test(key) ? 'protG' : /^glucides_/.test(key) ? 'gluG' : /^lipides_/.test(key) ? 'lipG' : '';
  if (macroKey && Number.isFinite(macroTargets[macroKey])) return { value: macroTargets[macroKey], unit: 'g' };

  const targetKey = microTargetKeyFromNutrient(key);
  if (targetKey === 'salt' && targets.sodium) {
    return { ...targets.sodium, value: targets.sodium.value * 2.5 / 1000, unit: 'g' };
  }
  return targets[targetKey];
}
