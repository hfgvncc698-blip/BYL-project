import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cancellationPreview} from '../src/utils/cancellationPreview.mjs';
const key=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return 't'+(h>>>0).toString(36);};
for(const lang of ['fr','en','de','es','it','ru','ar']){
 const raw=JSON.parse(fs.readFileSync(`src/i18n/locales/${lang}/${lang==='fr'?'clubRecent':'common'}.json`));const d=lang==='fr'?raw:raw.clubRecent;
 const t=s=>{assert.ok(d[key(s)],`${lang}: ${s}`);return d[key(s)];};
 for(const label of ['Accepter la justification','Refuser la justification','En attente de validation'])t(label);
 const conversation={lastMessageAtIso:'date',lastMessage:'French fallback',lastMessageMeta:{kind:'cancellation',at:'date',title:'Client title'}};
 assert.equal(cancellationPreview(conversation,t),`${t('Annulations')} · Client title`);
 for(const decision of ['accepted','rejected'])assert.equal(cancellationPreview({...conversation,lastMessageMeta:{kind:'cancellation-decision',at:'date',decision}},t),t(decision==='accepted'?'Justification acceptée':'Justification refusée'));
 assert.equal(cancellationPreview({...conversation,lastMessageAtIso:'later',lastMessage:'Client original text'},t),'Client original text');
}
console.log('Cancellation messages: controls, statuses and previews in all seven languages; user text preserved.');
