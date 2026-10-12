const assert = require('node:assert/strict');
const { createClubMemberships, removeReservations, withoutClub } = require('../backend/utils/clubMemberships');
const { createClubClassBooking } = require('../backend/utils/clubClassBooking');
const { createClubMessaging } = require('../backend/utils/clubMessaging');
const now = Date.now();
const data = new Map([
 ['users/u', { firstName: 'Camille', clubId: 'old', role: 'particulier' }],
 ['users/owner', { clubId: 'old', role: 'coach', accountType: 'club_owner' }],
 ['clubs/old', { name: 'Ancien club', clientLimit: 20 }], ['clubs/new', { name: 'Nouveau club', clientLimit: 20 }],
 ['clients/dossier', { uid: 'u', clubId: 'old', clubIds: ['old'], prenom: 'Camille', nom: 'Test', notes: 'PRIVATE OLD', coachIds: ['independent'], createdBy: 'independent' }],
 ['clients/other', { uid: 'other', clubId: 'new', notes: 'OTHER CLIENT' }],
 ['clubs/old/appointments/future', { type: 'group', startsAt: now + 86400000, capacity: 2, participantIds: ['dossier', 'p2'], waitlistIds: ['w1', 'w2'] }],
 ['clubs/old/appointments/past', { type: 'group', startsAt: now - 86400000, capacity: 2, participantIds: ['dossier'], waitlistIds: [] }],
 ['clubs/old/appointments/individual', { type: 'sport', startsAt: now + 86400000, clientId: 'dossier' }],
]);
function snap(path) { return { id: path.split('/').pop(), ref: ref(path), exists: data.has(path), data: () => structuredClone(data.get(path)) }; }
function ref(path) { return { path, id: path.split('/').pop(), get: async () => snap(path), collection: name => coll(`${path}/${name}`) }; }
function coll(path, filters = []) {
 return { doc: id => ref(`${path}/${id}`), limit: () => coll(path, filters), where: (key, op, value) => coll(path, [...filters, [key, op, value]]), get: async () => {
   const docs = [...data.keys()].filter(k => k.startsWith(path + '/') && k.split('/').length === path.split('/').length + 1 && filters.every(([key, op, value]) => op === 'array-contains' ? data.get(k)[key]?.includes(value) : data.get(k)[key] === value)).map(snap);
   return { docs, size: docs.length, empty: !docs.length };
 }};
}
let queue = Promise.resolve();
const db = { collection: coll, runTransaction: fn => {
 const run = queue.then(async () => {
   const writes = [];
   const result = await fn({ get: r => { assert.equal(writes.length, 0, 'All reads precede writes'); return r.get(); }, update: (r, p) => writes.push([r.path, p, true]), set: (r, p, options) => writes.push([r.path, p, options?.merge]) });
   writes.forEach(([path, patch, merge]) => data.set(path, { ...(merge ? data.get(path) : {}), ...patch }));
   return result;
 }); queue = run.catch(() => {}); return run;
}};
(async () => {
 const service = createClubMemberships(db), booking = createClubClassBooking(db), messaging = createClubMessaging(db);
 assert.deepEqual((await service.list('intruder')).memberships, []);
 await assert.rejects(service.leave('intruder', 'old'), e => e.status === 403);
 const linkedId = await service.link('u', 'new', 'newOwner', { prenom: 'Camille', nom: 'Test' });
 assert.equal(data.get(`clients/${linkedId}`).notes, undefined, 'No old notes imported');
 assert.equal(data.get(`clients/${linkedId}`).clubId, 'new');
 assert.equal(await service.link('u', 'new', 'newOwner', {}), linkedId, 'Link is idempotent');
 assert.equal((await service.list('u')).needsChoice, true);
 assert.deepEqual(data.get('clubs/old/appointments/future').participantIds, ['dossier', 'p2'], 'No answer changes nothing');
 await service.acknowledge('u'); assert.equal((await service.list('u')).needsChoice, false);
 assert.equal((await messaging.contacts('u')).contacts.length, 2);
 await service.leave('u', 'old');
 assert.deepEqual(data.get('clubs/old/appointments/future').participantIds, ['p2', 'w1']);
 assert.deepEqual(data.get('clubs/old/appointments/future').waitlistIds, ['w2']);
 assert.deepEqual(data.get('clubs/old/appointments/past').participantIds, ['dossier']);
 assert.equal(data.get('clubs/old/appointments/individual').clientId, 'dossier');
 assert.deepEqual(data.get('clients/dossier').coachIds, ['independent']);
 assert.equal(data.has('users/u'), true, 'Authentication profile retained');
 assert.deepEqual((await service.list('u')).memberships.map(c => c.id), ['new']);
 assert.deepEqual((await booking.list('u')).filter(e => e.clubId === 'old'), []);
 await assert.rejects(messaging.authorize('u', 'old', 'client', 'dossier'));
 await assert.rejects(booking.reserve('u', 'old', 'future', 'join'));
 const archived = (await service.former('old'))[0];
 assert.equal(archived.records[0].profile.notes, 'PRIVATE OLD');
 assert.equal(JSON.stringify(archived).includes('Nouveau'), false);
 const leftAt = archived.leftAt;
 await service.leave('u', 'old'); assert.equal((await service.former('old'))[0].leftAt, leftAt);
 await assert.rejects(service.link('u', 'old', 'owner', {}), /ancien membre/);
 data.set('clubs/old', { name: 'Ancien club', clientLimit: 0 });
 await assert.rejects(service.reactivate('old', 'u'), /capacité/);
 assert.equal((await service.former('old')).length, 1, 'Failed reactivation atomic');
 data.set('clubs/old', { name: 'Ancien club', clientLimit: 20 });
 await service.reactivate('old', 'u'); await service.reactivate('old', 'u');
 assert.equal((await service.former('old')).length, 0);
 assert.equal((await service.list('u')).memberships.length, 2);
 assert.deepEqual(data.get('clubs/old/appointments/future').participantIds, ['p2', 'w1'], 'No restored reservations');
 assert.equal((await messaging.authorize('u', 'old', 'client', 'dossier')).contact.peerUid, 'u');
 assert.deepEqual(withoutClub({ clubId: 'old', clubIds: ['old', 'new'], club: { id: 'old' } }, 'old'), { clubId: 'new', clubIds: ['new'], clubName: null, club: null });
 assert.equal(removeReservations({ type: 'sport', startsAt: now + 1, participantIds: ['dossier'] }, ['dossier'], now), null);
 // The confidential administration service checks role AND club scope on every operation.
 const { createClubClientAdministration, accessAt, validate } = require('../backend/utils/clubClientAdministration');
 const administration = createClubClientAdministration(db);
 data.set('users/admin', { role: 'admin', clubId: 'old' });
 data.set('users/coach', { role: 'coach', clubId: 'old' });
 data.set('users/owner-new', { role: 'coach', clubId: 'new', accountType: 'club_owner' });
 const values = { version: 0, entryDate: '2026-01-01', exitDate: '2026-12-31', accessStatus: 'active', privateNotes: 'CLUB SECRET', administrativeContact: 'BILLING PRIVATE', payments: [{ id: 'p1', label: 'Adhésion', dueCents: 10000, paidCents: 2500, dueDate: '2026-10-01', paidDate: '2026-10-02', method: 'cash', reference: 'R1' }] };
 for (const uid of ['u', 'coach', 'admin', 'intruder', 'owner-new']) {
   await assert.rejects(administration.get(uid, 'dossier'), e => e.status === 403);
   await assert.rejects(administration.save(uid, 'dossier', values), e => e.status === 403);
   await assert.rejects(administration.report(uid, 'dossier', 'past', { response: 'accepted', attendance: 'present', version: 0 }), e => e.status === 403);
 }
 await assert.rejects(administration.get('owner', 'dossier', 'new'), e => e.status === 403);
 await administration.save('owner', 'dossier', values);
 let adminData = await administration.get('owner', 'dossier');
 assert.equal(adminData.privateNotes, 'CLUB SECRET'); assert.equal(adminData.version, 1);
 assert.equal(data.get('clients/dossier').privateNotes, undefined, 'Never stored on shared client');
 assert.equal(data.get('clubs/old').payments, undefined, 'Never stored on shared club');
 await assert.rejects(administration.save('owner', 'dossier', values), e => e.status === 409);
 assert.throws(() => validate({ ...values, exitDate: '2025-01-01' }));
 assert.throws(() => validate({ ...values, entryDate: '2026-02-30' }));
 assert.throws(() => validate({ ...values, payments: [{ ...values.payments[0], paidCents: 20000 }] }));
 assert.throws(() => validate({ ...values, payments: [{ ...values.payments[0], dueCents: 1.5 }] }));
 assert.equal(accessAt({ entryDate: '2026-10-08', exitDate: '2026-10-08' }, Date.parse('2026-10-08T21:59:00Z')), 'active');
 assert.equal(accessAt({ exitDate: '2026-10-08' }, Date.parse('2026-10-08T22:00:00Z')), 'expired');
 assert.equal(accessAt({ entryDate: '2026-10-08' }, Date.parse('2026-10-07T20:00:00Z')), 'scheduled');
 assert.equal(accessAt({ accessStatus: 'suspended' }), 'suspended');
 await administration.report('owner', 'dossier', 'past', { response: 'accepted', attendance: 'present', note: 'PRIVATE ATTENDANCE', version: 0 });
 adminData = await administration.get('owner', 'dossier');
 assert.equal(adminData.events.find(e => e.id === 'past').report.attendance, 'present');
 assert.equal(data.get('clubs/old/appointments/past').attendance, undefined);
 await assert.rejects(administration.report('owner', 'dossier', 'past', { response: 'accepted', attendance: 'present', version: 0 }), e => e.status === 409);
 await assert.rejects(administration.report('owner', 'dossier', 'individual', { response: 'accepted', attendance: 'present', version: 0 }), /début/);
 await assert.rejects(administration.report('owner', 'dossier', 'unknown-event', { response: 'accepted', attendance: 'unknown', version: 0 }), e => e.status === 403);
 await administration.save('owner', 'dossier', { ...values, version: 1, accessStatus: 'suspended' });
 await assert.rejects(booking.reserve('u', 'old', 'future', 'join'), /accès/);
 const publicClasses = await booking.list('u');
 assert.equal(publicClasses.find(e => e.id === 'future').canJoin, false);
 assert.equal(JSON.stringify(publicClasses).includes('CLUB SECRET'), false);
 assert.equal(JSON.stringify(publicClasses).includes('PRIVATE ATTENDANCE'), false);
 await administration.save('owner', 'dossier', { ...values, version: 2, membershipStatus: 'inactive', membershipReason: 'unpaid' });
 assert.equal((await administration.get('owner', 'dossier')).access, 'inactive');
 await assert.rejects(booking.reserve('u', 'old', 'future', 'join'), /accès/);
 assert.equal((await booking.list('u')).find(e => e.id === 'future').canJoin, false);
 await administration.save('owner', 'dossier', { ...values, version: 3, membershipStatus: 'active', membershipReason: '' });
 assert.equal((await administration.get('owner', 'dossier')).access, 'active');
 assert.equal((await administration.get('owner', 'dossier')).membershipReason, '');
 assert.equal(accessAt({membershipStatus:'active', exitDate:'2026-10-08'}, Date.parse('2026-10-08T22:00:00Z')), 'expired');
 assert.throws(() => validate({...values, membershipStatus:'invalid'}));
 const contactBefore = (await administration.get('owner', 'dossier')).contact;
 await administration.save('owner', 'dossier', {...values, version:4, contact:{...contactBefore, firstName:'Nouveau prénom', phone:'0102030405', city:'Paris'}, previousContact:contactBefore});
 assert.equal(data.get('clients/dossier').prenom, 'Nouveau prénom');
 assert.equal(data.get('clients/dossier').telephone, '0102030405');
 assert.equal((await administration.get('owner', 'dossier')).contact.city, 'Paris');
 assert.equal(data.get('clients/dossier').privateNotes, undefined);
 const contactCurrent = (await administration.get('owner', 'dossier')).contact;
 data.set('clients/dossier', {...data.get('clients/dossier'), telephone:'0999999999'});
 await assert.rejects(administration.save('owner', 'dossier', {...values, version:5, contact:{...contactCurrent, phone:'0111111111'}, previousContact:contactCurrent}), e=>e.status===409);
 console.log('Private administration passed: owner-only CRUD, cross-club isolation, optimistic updates, Paris access dates, payment validation, attendance and booking enforcement.');
 // Expiration is inclusive in Paris, removes only this club and preserves history.
 const privatePath = 'clubs/old/privateClients/dossier';
 const todayParis = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 data.set(privatePath, {...data.get(privatePath), exitDate:todayParis});
 await service.expireClient('u');
 assert.equal(data.get('clients/dossier').clubId,'old');
 data.set(privatePath, {...data.get(privatePath), exitDate:'2020-01-01'});
 await service.expireClient('u');
 assert.equal(data.get('clients/dossier').clubId,null);
 assert.equal(data.get('clubs/old/formerClients/u').reason,'contract_end');
 assert.equal((await booking.list('u')).some(e=>e.clubId==='old'),false);
 assert.equal(data.get(privatePath).privateNotes,'CLUB SECRET');
 assert.equal((await service.list('u')).memberships.some(c=>c.id==='new'),true);
 const expiredLeftAt = data.get('clubs/old/formerClients/u').leftAt;
 await service.expireAll();
 assert.equal(data.get('clubs/old/formerClients/u').leftAt,expiredLeftAt);
 await service.reactivate('old','u');
 assert.equal(data.get(privatePath).exitDate,'');
 await service.expireClient('u');
 assert.equal(data.get('clients/dossier').clubId,'old');
 console.log('Automatic expiry passed: inclusive date, club isolation, hidden classes, archival, idempotence and reactivation.');
 // Oversized departure fails before any write, leaving membership and reservations intact.
 for (let i = 0; i < 490; i++) data.set(`clubs/old/appointments/bulk${i}`, { type: 'group', startsAt: now + 86400000, capacity: 1, participantIds: ['dossier'] });
 await assert.rejects(service.leave('u', 'old'), /Trop de réservations/);
 assert.equal(data.get('clients/dossier').clubId, 'old');
 console.log('Membership lifecycle passed: privacy, scoped joining, acknowledgement, departure, FIFO, history, booking/chat revocation, idempotence, capacity and reactivation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
