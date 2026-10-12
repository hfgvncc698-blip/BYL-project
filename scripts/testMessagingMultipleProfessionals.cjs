const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/utils/messaging.js', 'utf8');
const start = source.indexOf('const contactFromClient =');
const end = source.indexOf('const loadProfessionalProfile', start);
const context = {
  clientAccountUid: client => client.linkedUserId,
  clientCoachUid: client => client.coachId,
  personName: client => client.displayName,
  conversationIdForClient: (clientId, coachUid) => clientId + '__' + coachUid,
};
vm.createContext(context);
vm.runInContext(source.slice(start, end) + '; this.makeContact = contactFromClient;', context);
const client = { id: 'record', linkedUserId: 'client', coachId: 'club-coach', coachIds: ['club-coach', 'independent'], displayName: 'Client' };
const primary = context.makeContact(client, { coachUid: 'club-coach', currentUid: 'client' });
const secondary = context.makeContact(client, { coachUid: 'independent', currentUid: 'client' });
assert.equal(primary.id, 'record__club-coach');
assert.equal(secondary.id, 'record__independent');
assert.equal(secondary.coachUid, 'independent');
assert.deepEqual(Array.from(secondary.participantUids), ['independent', 'client']);
assert.equal(context.makeContact(client).coachUid, 'club-coach');
console.log('Multi-professional contacts: distinct conversations and participants passed.');
