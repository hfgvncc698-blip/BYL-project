// Permanent color assignment v1. Preserve palette order, length and hash: changing
// any of them would recolor existing coaches across all calendars.
const PALETTE = Object.freeze(['#1D4ED8', '#B45309', '#7E22CE', '#047857', '#BE185D', '#0E7490', '#C2410C', '#4338CA', '#4D7C0F', '#A21CAF', '#0369A1', '#9F1239', '#6D28D9', '#0F766E', '#854D0E', '#3730A3', '#166534', '#9D174D', '#075985', '#92400E']);
export const clubCoachKey = row => row.coachUid || row.coachId || (row.coachName ? `name:${row.coachName}` : '__unknown__');
// A coach keeps the same color across roles, clubs and filtered subsets.
export function coachCalendarColor(key) {
  if (!key || key === '__unknown__') return '#475569';
  const hash = [...String(key)].reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
  return PALETTE[hash % PALETTE.length];
}
export function clubCoachColors(keys) {
  return new Map([...new Set(keys)].map(key => [key, coachCalendarColor(key)]));
}
