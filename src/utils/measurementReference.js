// Indicative adult references, not diagnostic cutoffs or aesthetic targets.
// Fat: Gallagher et al. AJCN 2000;72:694–701, commonly used adult bands.
// https://pubmed.ncbi.nlm.nih.gov/10966886/
// Water: https://tanita.eu/understanding-your-measurements/body-water
export const FAT_RANGES = {
  male: [[20,39,8,20],[40,59,11,22],[60,79,13,25]],
  female: [[20,39,21,33],[40,59,23,34],[60,79,24,36]],
};

export function referenceProfile(profile = {}, measuredAt) {
  profile = profile || {};
  const sexValue = String(profile.sexe || profile.sex || profile.gender || '').toLowerCase().trim();
  const sex = ['homme','male','man','m'].includes(sexValue) ? 'male' : ['femme','female','woman','f'].includes(sexValue) ? 'female' : null;
  const birth = String(profile.dateNaissance || profile.birthDate || profile.dateOfBirth || '').slice(0,10);
  const date = String(measuredAt || '').slice(0,10);
  const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  let age = null;
  if (validDate(birth) && validDate(date) && date >= birth) {
    age = Number(date.slice(0,4)) - Number(birth.slice(0,4)) - (date.slice(5) < birth.slice(5) ? 1 : 0);
    if (age > 120) age = null;
  }
  const excluded = profile.pregnant === true || profile.isPregnant === true || profile.grossesse === true;
  return { sex, age, excluded };
}

export function measurementReference(metric, profile, date) {
  const context = referenceProfile(profile, date);
  const {sex,age,excluded} = context;
  if (excluded || age == null || age < 18) return { ...context, bands: null };
  let thresholds;
  if (metric === 'fat') {
    const row = FAT_RANGES[sex]?.find(([min,max])=>age>=min && age<=max);
    if (row) thresholds = row.slice(2);
  }
  if (metric === 'water' && sex) thresholds = sex === 'male' ? [50,65] : [45,60];
  if (metric === 'bmi') thresholds = [18.5,25,30];
  return { ...context, bands: thresholds || null };
}
