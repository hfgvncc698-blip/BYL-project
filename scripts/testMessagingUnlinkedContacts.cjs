const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/utils/messaging.js', 'utf8');
const cachedClient = { id: 'offline-client', coachId: 'coach', displayName: 'Marie' };
const context = {
  cachedDashboardClients: () => [cachedClient],
  clientProfessionalUids: client => [client.coachId],
  contactFromClient: (client, {coachUid}) => ({id: `${client.id}__${coachUid}`, title: client.displayName, clientUid: client.uid || ''}),
};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('export async function loadCoachMessagingContacts')).replace('export ', ''), context);
(async () => {
  const contacts = await context.loadCoachMessagingContacts({currentUid: 'coach'});
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].id, 'offline-client__coach');
  assert.equal(contacts[0].clientUid, '');
  console.log('Unlinked client remains selectable without inventing a recipient account.');
})().catch(error => { console.error(error); process.exitCode = 1; });
