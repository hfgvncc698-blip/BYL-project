const currencyDigits = require('./clubCurrencyDigits.json');
const currencies = require('./clubCurrencies.json');
const { clubAppointmentStatus } = require('./clubAppointmentStatus');
const error = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const belongs = (data, clubId) => data?.clubId === clubId || data?.clubIds?.includes(clubId) || data?.club?.id === clubId;
const millis = value => value?.toMillis ? value.toMillis() : typeof value === 'string' ? new Date(value).getTime() : Number(value || 0);
const dayAt = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
function accessAt(data = {}, time = Date.now()) {
  const day = dayAt(time);
  if (data.membershipStatus === 'inactive') return 'inactive';
  if (data.accessStatus === 'suspended') return 'suspended';
  if (data.entryDate && day < data.entryDate) return 'scheduled';
  if (data.exitDate && day > data.exitDate) return 'expired';
  return 'active';
}
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
function date(value) {
  if (!value) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) error('Date invalide.');
  return value;
}
function validate(input, previousPayments = []) {
  if (!input || typeof input !== 'object') error('Fiche invalide.');
  const entryDate = date(input.entryDate), exitDate = date(input.exitDate);
  if (entryDate && exitDate && exitDate < entryDate) error('La sortie doit être postérieure à l’entrée.');
  if (!['active', 'suspended'].includes(input.accessStatus)) error('État d’accès invalide.');
  if (!Array.isArray(input.payments) || input.payments.length > 100) error('100 lignes de règlement maximum.');
  if (input.membershipStatus !== undefined && !['active', 'inactive'].includes(input.membershipStatus)) error('État d’abonnement invalide.');
  if (input.membershipReason !== undefined && !['', 'unpaid', 'contract_end', 'other'].includes(input.membershipReason)) error('Motif invalide.');
  const ids = new Set();
  const payments = input.payments.map(p => {
    if (!p || typeof p !== 'object') error('Règlement invalide.');
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) || ids.has(p.id)) error('Identifiant de règlement invalide.');
    ids.add(p.id);
    const currency = p.currency === undefined ? 'EUR' : p.currency;
    const unitScale = p.unitScale ?? 100;
    if (p.unitScale !== undefined && unitScale !== 10 ** currencyDigits[currency]) error('Devise invalide.');
    const previous = previousPayments.find(row => row.id === p.id);
    const unchangedLegacy = previous?.currency === currency && previous.dueCents === p.dueCents && previous.paidCents === p.paidCents && (previous.unitScale ?? 100) === unitScale;
    if (!currencies.includes(currency) && !unchangedLegacy) error('Devise invalide.');
    if (![p.dueCents, p.paidCents].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000) || p.paidCents > p.dueCents) error('Montants invalides : le règlement doit être compris entre 0 et le montant dû.');
    if (!text(p.label, 120)) error('Un libellé est requis pour chaque règlement.');
    if (!['', 'card', 'cash', 'transfer', 'cheque', 'other'].includes(p.method)) error('Mode de règlement invalide.');
    if(p.kind!==undefined&&!['regular','termination','late_fee'].includes(p.kind))error('Règlement invalide.');
    const dueDate = date(p.dueDate), paidDate = date(p.paidDate);
    if (p.paidCents > 0 && !paidDate) error('Indiquez la date du règlement reçu.');
    return { id: p.id, kind:p.kind||'regular', currency, ...(p.unitScale !== undefined ? {unitScale} : {}), label: text(p.label, 120), dueCents: p.dueCents, paidCents: p.paidCents, dueDate, paidDate, method: p.method, reference: text(p.reference, 120) };
  });
  return { entryDate, exitDate, ...(input.membershipStatus !== undefined ? { membershipStatus: input.membershipStatus, membershipReason: input.membershipStatus === 'active' ? '' : input.membershipReason || '' } : {}), accessStatus: input.accessStatus, privateNotes: text(input.privateNotes, 8000), administrativeContact: text(input.administrativeContact, 2000), payments };
}
function eventFor(event, clientId) {
  return event.clientId === clientId || event.participantIds?.includes(clientId) || event.waitlistIds?.includes(clientId);
}
function collectiveAttendance(event, clientId, report = {}, now = Date.now()) {
  if (event.type !== 'group') return report.attendance || 'unknown';
  const start = millis(event.startsAt);
  const status = clubAppointmentStatus(event, now);
  if (!start || start > now || ['annulée', 'annulee', 'manquée', 'manquee'].includes(status)) return 'unknown';
  if (event.participantIds?.includes(clientId)) {
    if (['present','absent','excused'].includes(report.attendanceOverride)) return report.attendanceOverride;
    return status === 'validée' ? 'present' : 'unknown';
  }
  if (event.waitlistIds?.includes(clientId)) return 'unknown';
  const removedAt = millis(report.reservationUpdatedAt);
  const removedAttendance = ['removed_by_club', 'withdrawn_by_client'].includes(report.reservation)
    && report.wasParticipant !== false && removedAt >= (report.cancellationDeadline ?? start) ? 'absent' : 'unknown';
  return removedAttendance === 'absent' && ['present','absent','excused'].includes(report.attendanceOverride) ? report.attendanceOverride : removedAttendance;
}
function createClubClientAdministration(db) {
  async function scope(uid, clientId, requestedClubId, reader) {
    const get = ref => reader ? reader.get(ref) : ref.get();
    const owner = await get(db.collection('users').doc(uid));
    const u = owner.data();
    // No coach or global-admin preview bypass for confidential club records.
    if (!u?.clubId || u.role !== 'coach' || !(u.accountType === 'club_owner' || u.clubRole === 'owner') || (requestedClubId && requestedClubId !== u.clubId)) error('Ces informations sont réservées au responsable du club.', 403);
    const clubId = u.clubId, client = await get(db.collection('clients').doc(clientId));
    if (!client.exists) error('Client introuvable.', 404);
    let former = false;
    let identity = client.data();
    if (!belongs(client.data(), clubId)) {
      const account = client.data().authUid || client.data().accountUid || client.data().linkedUserId || client.data().userId || client.data().uid || client.id;
      const archive = await get(db.collection('clubs').doc(clubId).collection('formerClients').doc(account));
      if (!archive.exists || !archive.data().records?.some(r => r.id === clientId)) error('Client extérieur au club.', 403);
      former = archive.data().status === 'left';
      identity = archive.data().records.find(r => r.id === clientId).profile || {};
    }
    return { clubId, client, former, contact: {
      firstName: text(identity.prenom || identity.firstName, 120),
      lastName: text(identity.nom || identity.lastName, 120),
      birthDate: text(identity.dateNaissance || identity.birthDate, 10),
      email: text(identity.email, 320), phone: text(identity.telephone || identity.phone || identity.phoneNumber, 80),
      address: text(identity.adresse || identity.address, 500),
      postalCode: text(identity.codePostal || identity.postalCode, 30),
      city: text(identity.ville || identity.city, 120), country: text(identity.pays || identity.country, 120),
    }, clientName: [identity.prenom || identity.firstName, identity.nom || identity.lastName].filter(Boolean).join(' ') || identity.email || 'Client', ref: db.collection('clubs').doc(clubId).collection('privateClients').doc(clientId) };
  }
  return {
    scope,
    async get(uid, clientId, requestedClubId) {
      const s = await scope(uid, clientId, requestedClubId);
      const [privateDoc, events, reports] = await Promise.all([s.ref.get(), db.collection('clubs').doc(s.clubId).collection('appointments').get(), s.ref.collection('eventReports').get()]);
      const saved = privateDoc.data() || {};
      const reportMap = new Map(reports.docs.map(r => [r.id, r.data()]));
      const history = events.docs.filter(e => eventFor(e.data(), clientId) || reportMap.has(e.id)).map(e => {
        const d = e.data();
        return { id: e.id, title: d.title || 'Rendez-vous', startsAt: millis(d.startsAt), type: d.type, coachName: d.coachName || '', status: clubAppointmentStatus(d), waiting: d.waitlistIds?.includes(clientId) || false, report: { response: 'unknown', note: '', version: 0, ...reportMap.get(e.id), attendance: collectiveAttendance(d, clientId, reportMap.get(e.id)) } };
      }).sort((a, b) => b.startsAt - a.startsAt);
      for (const [id, report] of reportMap) {
        if (!history.some(e => e.id === id) && report.eventSnapshot) history.push({ id, ...report.eventSnapshot, status: 'Supprimé du calendrier', report: { response: 'unknown', attendance: 'unknown', note: '', version: 0, ...report } });
      }
      history.sort((a, b) => b.startsAt - a.startsAt);
      const createdAt = millis(s.client.data().clubJoinedAt || s.client.data().createdAt);
      const { entryDate = (createdAt > 0 ? dayAt(createdAt) : ''), exitDate = '', membershipStatus = 'active', membershipReason = '', accessStatus = 'active', privateNotes = '', administrativeContact = '', payments = [], version = 0, audit = [] } = saved;
      return { welcomeEmailStatus: saved.welcomeEmailStatus === 'pending' && Date.now() - (saved.welcomeEmailAttemptedAt || 0) >= 30 * 60000 ? 'failed' : saved.welcomeEmailStatus || '', clientId, clientName: s.clientName, contact: s.contact, former: s.former, access: s.former ? 'left' : accessAt(saved), entryDate, exitDate, membershipStatus, membershipReason, accessStatus, privateNotes, administrativeContact, payments, version, audit, events: history };
    },
    async save(uid, clientId, input, requestedClubId) {
      await db.runTransaction(async tx => {
        const s = await scope(uid, clientId, requestedClubId, tx), old = await tx.get(s.ref);
        const values = validate(input, old.data()?.payments || []);
        const version = old.data()?.version || 0;
        if (input.version !== version) error('La fiche a été modifiée ailleurs. Rechargez-la avant d’enregistrer.', 409);
        if (input.contact) {
          if (s.former) error('Les coordonnées d’un ancien membre ne peuvent pas être modifiées.', 403);
          const fields = { firstName: ['prenom', 120], lastName: ['nom', 120], email: ['email', 320], phone: ['telephone', 80], birthDate: ['dateNaissance', 10], address: ['adresse', 500], postalCode: ['codePostal', 30], city: ['ville', 120], country: ['pays', 120] };
          const patch = {};
          for (const [key, [field, limit]] of Object.entries(fields)) {
            if (!Object.hasOwn(input.contact, key)) continue;
            if (typeof input.contact[key] !== 'string' || input.contact[key].length > limit) error('Coordonnées invalides.');
            const value = input.contact[key].trim();
            if (value === s.contact[key]) continue;
            if (input.previousContact?.[key] !== s.contact[key]) error('Les coordonnées ont changé ailleurs. Rechargez la fiche.', 409);
            if (key === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error('Adresse e-mail invalide.');
            if (key === 'birthDate' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value || value>new Date().toISOString().slice(0,10))) error('Date de naissance invalide.');
            patch[field] = value;
            const alias = { firstName:'firstName', lastName:'lastName', email:'emailLower', phone:'phone', birthDate:'birthDate', address:'address', postalCode:'postalCode', city:'city', country:'country' }[key];
            patch[alias] = key === 'email' ? value.toLowerCase() : value;
          }
          if (Object.keys(patch).length) {
            patch.displayName = [patch.prenom ?? s.contact.firstName, patch.nom ?? s.contact.lastName].filter(Boolean).join(' ');
            tx.set(s.client.ref, patch, { merge: true });
          }
        }
        const audit = [...(old.data()?.audit || []), { at: Date.now(), by: uid, action: 'administration_updated' }].slice(-100);
        tx.set(s.ref, { ...values, version: version + 1, updatedAt: Date.now(), updatedBy: uid, audit }, { merge: true });
      });
    },
    async report(uid, clientId, eventId, input, requestedClubId) {
      if (!['unknown', 'accepted', 'declined'].includes(input.response) || !['unknown', 'present', 'absent', 'excused'].includes(input.attendance)) error('Réponse ou présence invalide.');
      await db.runTransaction(async tx => {
        const s = await scope(uid, clientId, requestedClubId, tx);
        const ref = s.ref.collection('eventReports').doc(eventId);
        const [event, previous] = await Promise.all([tx.get(db.collection('clubs').doc(s.clubId).collection('appointments').doc(eventId)), tx.get(ref)]);
        if (!event.exists || (!eventFor(event.data(), clientId) && !previous.exists)) error('Rendez-vous extérieur à ce dossier.', 403);
        if(previous.data()?.cancellationRequestId&&(input.attendance!==previous.data().attendance||input.excuseDecision!==previous.data().excuseDecision))error('Examinez cette annulation depuis le tableau de bord.');
        if (input.version !== (previous.data()?.version || 0)) error('Ce suivi a été modifié ailleurs. Rechargez la fiche.', 409);
        if (input.attendance !== 'unknown' && millis(event.data().startsAt) > Date.now()) error('La présence ne peut être renseignée qu’à partir du début du rendez-vous.');
        const clubSettings=(await tx.get(db.collection('clubs').doc(s.clubId))).data()?.groupRegistration||{};
        const deadline=millis(event.data().startsAt)-(Number(clubSettings.cancelMinutes)||0)*60000;
        if(input.attendance==='excused'&&Date.now()>=deadline&&previous.data()?.attendance!=='excused')error('Après la limite d’annulation, la séance reste décomptée.');
        const attendanceOverride = event.data().type === 'group' ? input.attendance : null;
        const attendance = event.data().type === 'group' ? collectiveAttendance(event.data(), clientId, {...previous.data(),attendanceOverride}) : input.attendance;
        const excuseDecision = previous.data()?.excuse ? (attendance === 'excused' ? 'accepted' : input.excuseDecision === 'rejected' && attendance === 'absent' ? 'rejected' : previous.data().excuseDecision || 'pending') : '';
        tx.set(ref, { ...previous.data(), excuseDecision, ...(attendanceOverride !== null ? {attendanceOverride} : {}), response: input.response, attendance, note: text(input.note, 1000), version: (previous.data()?.version || 0) + 1, updatedAt: Date.now(), updatedBy: uid, source: 'club', eventSnapshot: { title: event.data().title || 'Rendez-vous', startsAt: millis(event.data().startsAt), type: event.data().type || '', coachName: event.data().coachName || '' }, audit: [...(previous.data()?.audit || []), { at: Date.now(), by: uid, response: input.response, attendance: input.attendance }].slice(-100) });
      });
    },
  };
}
module.exports = { createClubClientAdministration, accessAt, validate, eventFor, collectiveAttendance };
