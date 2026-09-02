import { collection, getDoc, getDocs, limit, query, where, doc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { resolveClientSnapshotForUser } from "./clientResolver";

export const conversationIdForClient = (clientId = "", professionalUid = "") => {
  const client = String(clientId || "").trim();
  const professional = String(professionalUid || "").trim();
  return client && professional ? `${client}__${professional}` : client;
};

const cachedClientIdForUser = (user) => {
  if (typeof window === "undefined" || !user?.uid) return "";
  const key = `byl:client-resolve:${user.uid}:${String(user.email || "").trim().toLowerCase()}`;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed?.clientId ? String(parsed.clientId) : "";
  } catch {
    return "";
  }
};

const LEGACY_PROFESSIONAL_NAMES = Object.freeze({
  "tomarie@hotmail.fr": "Tom Marie",
  "tom.marie@ednh.fr": "Tom Marie",
});

const EMPTY_QUERY_SNAPSHOT = Object.freeze({ docs: [] });
const DASHBOARD_CACHE_POINTER = "byl:coach-dashboard:data:7:last";
const MESSAGING_DIRECTORY_CACHE = "byl:messaging:coach-directory:v1";
let messagingDirectoryMemory = [];

const releaseDashboardCacheStorage = () => {
  if (typeof window === "undefined") return;
  try {
    const removableKeys = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || "";
      if (key.startsWith("byl:coach-dashboard:data:7:")) removableKeys.push(key);
    }
    removableKeys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Le répertoire en mémoire reste utilisable si le stockage est indisponible.
  }
};

const getDocsWithoutBlockingUi = async (queryRef, timeoutMs = 20000) => {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(EMPTY_QUERY_SNAPSHOT), timeoutMs);
  });
  return Promise.race([
    getDocs(queryRef).catch(() => EMPTY_QUERY_SNAPSHOT),
    timeout,
  ]);
};

const cachedDashboardClients = () => {
  if (typeof window === "undefined") return [];
  try {
    if (messagingDirectoryMemory.length) {
      releaseDashboardCacheStorage();
      return messagingDirectoryMemory;
    }
    const savedDirectory = JSON.parse(window.localStorage.getItem(MESSAGING_DIRECTORY_CACHE) || "null");
    if (Array.isArray(savedDirectory) && savedDirectory.length) {
      messagingDirectoryMemory = savedDirectory;
      releaseDashboardCacheStorage();
      return savedDirectory;
    }
    const cacheKey = window.localStorage.getItem(DASHBOARD_CACHE_POINTER);
    const payload = cacheKey ? JSON.parse(window.localStorage.getItem(cacheKey) || "null") : null;
    const clients = Array.isArray(payload?.data?.clients) ? payload.data.clients : [];
    const directory = clients.map((client) => ({
      id: client?.id || "",
      uid: client?.uid || "",
      userId: client?.userId || "",
      linkedUserId: client?.linkedUserId || "",
      accountUid: client?.accountUid || "",
      authUid: client?.authUid || "",
      firstName: client?.firstName || client?.firstname || client?.prenom || "",
      lastName: client?.lastName || client?.lastname || client?.nom || "",
      displayName: client?.displayName || client?.fullName || client?.name || "",
      email: client?.email || "",
      coachId: client?.coachId || "",
      coachUid: client?.coachUid || "",
      createdBy: client?.createdBy || "",
      ownerUid: client?.ownerUid || "",
      assignedBy: client?.assignedBy || "",
      coachIds: Array.isArray(client?.coachIds) ? client.coachIds : [],
      professionalIds: Array.isArray(client?.professionalIds) ? client.professionalIds : [],
      nutritionCoachIds: Array.isArray(client?.nutritionCoachIds) ? client.nutritionCoachIds : [],
    })).filter((client) => client.id);
    if (cacheKey) window.localStorage.removeItem(cacheKey);
    window.localStorage.removeItem(DASHBOARD_CACHE_POINTER);
    if (directory.length) window.localStorage.setItem(MESSAGING_DIRECTORY_CACHE, JSON.stringify(directory));
    messagingDirectoryMemory = directory;
    return directory;
  } catch {
    return [];
  }
};

const professionalNameFromValue = (value) => {
  const text = String(value || "").trim();
  if (!text.includes("@")) return text;
  const lower = text.toLowerCase();
  if (LEGACY_PROFESSIONAL_NAMES[lower]) return LEGACY_PROFESSIONAL_NAMES[lower];
  const localPart = lower.split("@")[0];
  if (!/[._-]/.test(localPart)) return "";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

export const toMessageMillis = (value) => {
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  if (typeof value === "number") return value > 1e12 ? value : value * 1000;
  if (typeof value === "string") return Date.parse(value) || 0;
  return 0;
};

export const personName = (person = {}, fallback = "") => {
  const fullName = [
    person?.firstName || person?.firstname || person?.prenom,
    person?.lastName || person?.lastname || person?.nom,
  ].filter(Boolean).join(" ").trim();
  return fullName
    || person?.displayName
    || person?.display_name
    || person?.fullName
    || person?.full_name
    || person?.nomComplet
    || person?.name
    || person?.coachName
    || person?.createdByDisplayName
    || person?.createdByName
    || person?.ownerName
    || fallback;
};

export const clientAccountUid = (client = {}, fallback = "") =>
  client?.authUid
  || client?.accountUid
  || client?.linkedUserId
  || client?.userId
  || client?.uid
  || fallback
  || "";

export const clientCoachUid = (client = {}, fallback = "") =>
  client?.coachId
  || client?.coachUid
  || client?.createdBy
  || client?.ownerUid
  || client?.assignedBy
  || client?.coachIds?.[0]
  || fallback
  || "";

export const clientProfessionalUids = (client = {}) => [...new Set([
  ...(Array.isArray(client?.coachIds) ? client.coachIds : []),
  ...(Array.isArray(client?.professionalIds) ? client.professionalIds : []),
  ...(Array.isArray(client?.nutritionCoachIds) ? client.nutritionCoachIds : []),
  client?.coachId,
  client?.coachUid,
  client?.createdBy,
  client?.ownerUid,
  client?.assignedBy,
].filter(Boolean).map(String))];

export const conversationUnreadFor = (conversation, uid) => {
  if (!conversation?.lastMessageAt || !uid || conversation?.lastSenderUid === uid) return false;
  return toMessageMillis(conversation.lastMessageAt) > toMessageMillis(conversation?.readAtBy?.[uid]);
};

const contactFromClient = (client, { currentUid = "", coachUid = "", clientUid = "", title = "", contactEmail, relationshipLabel = "" } = {}) => {
  const resolvedClientUid = clientAccountUid(client, clientUid);
  const resolvedCoachUid = clientCoachUid(client, coachUid);
  const clientName = personName(client, client?.email || "");
  return {
    id: conversationIdForClient(client.id, resolvedCoachUid),
    clientId: client.id,
    clientUid: resolvedClientUid,
    coachUid: resolvedCoachUid,
    title: title || clientName,
    clientName,
    professionalName: title || "",
    email: contactEmail === undefined ? (client?.email || "") : contactEmail,
    relationshipLabel,
    participantUids: [...new Set([resolvedCoachUid, resolvedClientUid, currentUid].filter(Boolean))],
  };
};

const loadProfessionalProfile = async (professionalUid) => {
  const [userSnapshot, coachSnapshot] = await Promise.all([
    getDoc(doc(db, "users", professionalUid)).catch(() => null),
    getDoc(doc(db, "coachs", professionalUid)).catch(() => null),
  ]);
  return userSnapshot?.exists?.()
    ? userSnapshot.data()
    : coachSnapshot?.exists?.()
      ? coachSnapshot.data()
      : null;
};

export async function loadClientMessagingContacts(user, professionalFallback) {
  const directIds = [...new Set([
    user?.linkedClientId,
    cachedClientIdForUser(user),
    user?.uid,
  ].filter(Boolean))];
  const directSnapshots = await Promise.all(directIds.map((clientId) =>
    getDoc(doc(db, "clients", clientId)).catch(() => null)
  ));
  const snapshot = directSnapshots.find((item) => item?.exists?.())
    || await resolveClientSnapshotForUser(user, { logPrefix: "Messaging" });
  if (!snapshot?.exists?.()) return [];
  const client = { id: snapshot.id, ...snapshot.data() };
  const [programmesSnapshot, nutritionSnapshot] = await Promise.all([
    getDocsWithoutBlockingUi(query(collection(db, "clients", client.id, "programmes"), limit(100))),
    getDocsWithoutBlockingUi(query(
      collection(db, "clients", client.id, "nutrition_assessments"),
      where("clientShare.enabled", "==", true),
      limit(100)
    )),
  ]);
  const relatedRecords = [...programmesSnapshot.docs, ...nutritionSnapshot.docs].map((item) => item.data());
  const professionalUids = [...new Set([
    ...clientProfessionalUids(client),
    ...relatedRecords.flatMap((record) => [
      record?.clientShare?.sharedBy,
      record?.createdBy,
      record?.createdByUid,
      record?.coachId,
      record?.coachUid,
    ]),
  ].filter(Boolean).map(String))];
  const profiles = await Promise.all(professionalUids.map(loadProfessionalProfile));
  const contacts = professionalUids.map((coachUid, index) => {
    const related = relatedRecords.find((record) => [
      record?.clientShare?.sharedBy,
      record?.createdBy,
      record?.createdByUid,
      record?.coachId,
      record?.coachUid,
    ].filter(Boolean).map(String).includes(coachUid));
    const embeddedName = personName(related?.coach)
      || related?.clientShare?.coachName
      || personName({
        firstName: related?.coachFirstName || related?.createdByFirstName,
        lastName: related?.coachLastName || related?.createdByLastName,
        displayName: related?.createdByDisplayName,
        coachName: related?.coachName,
        createdByName: related?.createdByName,
        ownerName: related?.ownerName,
      })
      || client?.coachName
      || client?.createdByName;
    const profileName = professionalNameFromValue(personName(profiles[index]));
    const resolvedName = profileName || professionalNameFromValue(embeddedName);
    return contactFromClient(client, {
      currentUid: user?.uid,
      clientUid: user?.uid,
      coachUid,
      title: resolvedName || professionalFallback,
      relationshipLabel: professionalFallback,
      contactEmail: profiles[index]?.email || related?.createdByEmail || related?.coachEmail || "",
    });
  });
  const namedContacts = contacts.filter((contact) => contact.title && contact.title !== professionalFallback);
  return [...new Map(namedContacts.map((contact) => [contact.coachUid || contact.id, contact])).values()];
}

export async function loadCoachMessagingContacts({ currentUid, effectiveCoachUid, isAdmin = false }) {
  const targetCoachUid = effectiveCoachUid || currentUid;
  const cachedClients = cachedDashboardClients()
    .filter((client) => clientProfessionalUids(client).includes(String(targetCoachUid)));
  if (cachedClients.length) {
    return cachedClients
      .filter((client) => client?.id)
      .map((client) => contactFromClient(client, { currentUid, coachUid: targetCoachUid }))
      .filter((contact) => contact.title && contact.clientUid)
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  const snapshots = isAdmin && !effectiveCoachUid
    ? [await getDocsWithoutBlockingUi(query(collection(db, "clients"), limit(200)))]
    : await Promise.all([
        getDocsWithoutBlockingUi(query(collection(db, "clients"), where("createdBy", "==", targetCoachUid), limit(200))),
        getDocsWithoutBlockingUi(query(collection(db, "clients"), where("coachId", "==", targetCoachUid), limit(200))),
        getDocsWithoutBlockingUi(query(collection(db, "clients"), where("coachIds", "array-contains", targetCoachUid), limit(200))),
      ]);
  const byId = new Map();
  snapshots.forEach((snapshot) => snapshot.docs.forEach((item) => {
    byId.set(item.id, contactFromClient({ id: item.id, ...item.data() }, {
      currentUid,
      coachUid: targetCoachUid,
    }));
  }));
  return [...byId.values()]
    .filter((contact) => contact.title && contact.clientUid)
    .sort((a, b) => a.title.localeCompare(b.title));
}
