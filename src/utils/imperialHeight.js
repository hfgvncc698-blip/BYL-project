export function splitInches(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return {feet:'',inches:''};
  const tenths = Math.round(Number(value)*10);
  const feet = Math.floor(tenths/120);
  return {feet,inches:(tenths-feet*120)/10};
}
export function formatFeetInches(value) {
  const {feet,inches}=splitInches(value);
  return feet===''?'—':`${feet}′ ${inches}″`;
}
