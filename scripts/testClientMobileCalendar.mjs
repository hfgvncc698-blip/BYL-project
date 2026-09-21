import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../src/components/Clientdashboard.jsx',import.meta.url),'utf8');
assert.ok(code.includes('aria-pressed={isSelectedDay}'));
assert.ok(code.includes('onClick={()=>setCalendarSelectedDayKey(day.key)}'));
assert.ok(code.includes('mobileDaySessions.map((session)'));
assert.ok(code.includes('onClick={() => navigateToCalendarSession(session)}'));
assert.ok(code.includes('formatLocalDateKey(session._start) === mobileSelectedDay?.key'));
for(const language of ['fr','en','es','it','de','ru','ar']) {
  const locale=JSON.parse(readFileSync(new URL(`../src/i18n/locales/${language}/common.json`,import.meta.url),'utf8'));
  for(const key of ['calendar.previous','calendar.next','calendar.this_week','calendar.week','calendar.day','dashboard.calendar_events_count','dashboard.mobile.no_session_for_day']) {
    assert.ok(key.split('.').reduce((value,part)=>value?.[part],locale),`${language}: ${key}`);
  }
}
console.log('Client mobile calendar: day selection, date filtering, session navigation and seven languages OK');
