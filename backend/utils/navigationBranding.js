// Kept backend-local so standalone API releases do not depend on frontend source files.
function hasProfessionalWorkspaceAccess(profile) {
  if (profile.role === 'admin') return true;
  if (profile.role !== 'coach' || (profile.emailVerificationRequired && !profile.emailVerified)) return false;
  if (profile.subscriptionStatus === 'trialing') {
    const date = profile.trialEndsAt || profile.trialEnd;
    const time = date?.toMillis ? date.toMillis() : date?.toDate ? date.toDate().getTime() : new Date(date || 0).getTime();
    return time > Date.now();
  }
  if (['canceled','cancelled','expired','unpaid','past_due','incomplete','incomplete_expired','paused','club_deleted'].includes(profile.subscriptionStatus)) return false;
  return profile.hasActiveSubscription === true || ['active','club_active'].includes(profile.subscriptionStatus);
}
function canUseNavbarBranding(access) {
  if (access.branding) return ['full', 'club_full'].includes(access.branding);
  return access.packageKey === 'club' ? access.packageTier === 'network' : access.packageTier === 'unlimited';
}
const list = value => Array.isArray(value) ? value : [];
const ids = values => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim()))];
const clubIds = profile => ids([profile.clubId, profile.club?.id, ...list(profile.clubIds)]);
const coachIds = profile => ids([profile.coachId, profile.createdBy, ...list(profile.coachIds)]);

// Resolve every linked record: picking only a primary profile would hide additional coaches/clubs.
async function resolveNavigationBrand(db, uid) {
  const [account, direct, ...queries] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('clients').doc(uid).get(),
    ...['uid', 'authUid', 'accountUid', 'linkedUserId', 'userId'].map(key => db.collection('clients').where(key, '==', uid).get()),
  ]);
  if (!account.exists) return null;
  const user = account.data();
  const rows = [...new Map([direct, ...queries.flatMap(snapshot => snapshot.docs)].filter(row => row.exists && !(row.id.startsWith("club-") && clubIds(row.data()).length === 0)).map(row => [row.id, row.data()])).values()];
  const profiles = [user, ...rows];
  const explicitClubs = ids(profiles.flatMap(clubIds));
  const coaches = ids(profiles.flatMap(coachIds)).filter(id => id !== uid);
  if (explicitClubs.length > 1 || coaches.length > 20) return null;
  const coachDocs = await Promise.all(coaches.map(id => db.collection('users').doc(id).get()));
  const isClubProfessional = profile => profile?.accountType === 'club_member' &&
    profile.role === 'coach' && profile.clubRole !== 'owner' &&
    !profile.disabledByClub && !profile.deletedFromClub;
  // A club and its declared professionals represent a single organization.
  // Also resolve the club when a client's record only references its club coach.
  const clubs = ids([...explicitClubs, ...coachDocs.flatMap(row =>
    row.exists && isClubProfessional(row.data()) ? clubIds(row.data()) : [])]);
  if (clubs.length > 1) return null;
  const clubDoc = clubs.length ? await db.collection('clubs').doc(clubs[0]).get() : null;
  const club = clubDoc?.exists ? clubDoc.data() : null;
  const independentCoaches = coachDocs.filter(row => {
    if (!club) return true;
    if (row.id === club.ownerUid) return false;
    return !row.exists || !isClubProfessional(row.data()) || !clubIds(row.data()).includes(clubs[0]);
  });
  if (clubs.length + independentCoaches.length !== 1) return null;
  if (clubs.length) {
    if (!club || !club.ownerUid || ['deleted', 'inactive', 'expired', 'canceled', 'club_deleted'].includes(club.status)) return null;
    const owner = coachDocs.find(row => row.id === club.ownerUid) || await db.collection('users').doc(club.ownerUid).get();
    if (!owner.exists || !hasProfessionalWorkspaceAccess(owner.data())) return null;
    return String(club.name || club.clubName || '').trim().slice(0, 80) || null;
  }
  const coach = independentCoaches[0];
  if (!coach?.exists) return null;
  const profile = coach.data();
  if (!hasProfessionalWorkspaceAccess(profile) || !canUseNavbarBranding(profile.proAccess || profile)) return null;
  return String(profile.settings?.navbarBrandName || '').trim().slice(0, 48) || null;
}
module.exports = { resolveNavigationBrand, canUseNavbarBranding, hasProfessionalWorkspaceAccess };
