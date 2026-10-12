import digits from '../../backend/utils/clubCurrencyDigits.json';
export const currencyScale = currency => 10 ** (digits[currency || 'EUR'] ?? 2);
// Old records were always stored in hundredths. Never reinterpret them on read.
export const storedScale = row => row.unitScale ?? 100;
export const amountUnits = (value, currency) => {
  const units = Number(value) * currencyScale(currency);
  return Number.isFinite(units) && Math.abs(units - Math.round(units)) < 1e-7 ? Math.round(units) : null;
};
export const formatClubMoney = (value, currency, scale, locale) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: currency || 'EUR',
  minimumFractionDigits: digits[currency || 'EUR'] ?? 2,
  maximumFractionDigits: Math.max(digits[currency || 'EUR'] ?? 2, Math.log10(scale)),
}).format(value / scale);
