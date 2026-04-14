// src/components/AutoProgramPreview.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Heading,
  Text,
  SimpleGrid,
  Button,
  IconButton,
  HStack,
  Flex,
  Badge,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  useColorModeValue,
  useDisclosure,
  useToast,
  Tooltip,
  Divider,
  Select,
  Tag,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Grid,
  GridItem,
  Icon,
  Spacer,
  Spinner,
  VStack,
  Image as ChakraImage,
} from "@chakra-ui/react";
import { useNavigate, useParams, useLocation, useSearchParams } from "react-router-dom";
import { InfoOutlineIcon, RepeatIcon, DownloadIcon, EditIcon, ArrowBackIcon } from "@chakra-ui/icons";
import {
  MdOutlineMenuBook,
  MdOutlineAccessibilityNew,
  MdOutlineLocalFireDepartment,
  MdFitnessCenter,
  MdSelfImprovement,
  MdOutlineAccessTime,
  MdCheckCircle,
  MdDescription,
  MdAutoAwesome,
} from "react-icons/md";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import * as firebaseConfig from "../firebaseConfig";
import {
  getStorage,
  ref as storageRef,
  getDownloadURL,
  getBlob,
} from "firebase/storage";
import {
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  updateDoc,
  collection,
  query,
  where,
  limit,
} from "firebase/firestore";

const db = firebaseConfig.db;
const storage = firebaseConfig.storage || null;

/* ---------------- perf caches ---------------- */
const resolvedStorageUrlCache = new Map();
const storageDataUrlCache = new Map();
const genericImageDataUrlCache = new Map();
const firestoreExerciseCache = new Map();
const firestoreExercisePromiseCache = new Map();

/* ---------------- utils ---------------- */
const norm = (s = "") =>
  String(s)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const capitalizeFirst = (s = "") => {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const prettifyKey = (key = "") => {
  const s = String(key || "").trim();
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\s+/g, " ").trim();
};

const makeDefaultProgramName = (objectifUIKey, objectifFallback, nbSeances) => {
  const baseKey = objectifUIKey || objectifFallback || "";
  const label = capitalizeFirst(prettifyKey(baseKey));
  const n = Number(nbSeances) || 1;
  if (!label) return `Programme — ${n}x/Sem`;
  return `${label} — ${n}x/Sem`;
};

const normalizeNameForCompare = (s = "") =>
  String(s || "")
    .replace(/\u2014/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const isLegacyAutoName = (existingName, objectifUIKey, objectifFallback, nbSeances) => {
  const n = Number(nbSeances) || 1;
  const candidateNew = normalizeNameForCompare(makeDefaultProgramName(objectifUIKey, objectifFallback, n));

  const old1 = normalizeNameForCompare(`${objectifFallback || ""} — ${n}x/Sem`);
  const old2 = normalizeNameForCompare(`${objectifFallback || ""} — ${n}x/sem`);
  const old3 = normalizeNameForCompare(`${objectifFallback || ""} - ${n}x/Sem`);
  const old4 = normalizeNameForCompare(`${objectifFallback || ""} - ${n}x/sem`);

  const cur = normalizeNameForCompare(existingName);

  if (!cur) return true;
  if (cur === candidateNew) return true;
  if (cur === old1 || cur === old2 || cur === old3 || cur === old4) return true;
  if (objectifFallback && cur === normalizeNameForCompare(objectifFallback)) return true;

  return false;
};

const toSeconds = (val) => {
  if (val == null) return 0;
  if (typeof val === "number" && !isNaN(val)) {
    return val > 10000 ? Math.round(val / 1000) : val;
  }
  if (typeof val === "string") {
    const m = val.match(/(\d+)\s*min/i);
    const s = val.match(/(\d+)\s*sec/i);
    if (m || s) return (m ? +m[1] * 60 : 0) + (s ? +s[1] : 0);
    if (/^\d+:\d+$/.test(val)) {
      const [mm, ss] = val.split(":").map(Number);
      return (mm || 0) * 60 + (ss || 0);
    }
    const n = Number(String(val).replace(",", "."));
    return isNaN(n) ? 0 : n;
  }
  return 0;
};

const fmtSec = (sec) => {
  const s = Number(sec) || 0;
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return m ? `${m} min${ss ? ` ${ss} sec` : ""}` : `${ss} sec`;
};

const nbspUnits = (s = "") =>
  String(s).replace(/ min\b/g, "\u00A0min").replace(/ sec\b/g, "\u00A0sec");

const safeArray = (v) =>
  Array.isArray(v)
    ? v
    : v && typeof v === "object"
      ? Object.values(v)
      : typeof v === "string"
        ? [v]
        : [];

const getByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = String(path).split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
};

const pickFirst = (obj, keys) => {
  const pools = [
    obj,
    obj?.details,
    obj?.data,
    obj?.meta,
    obj?.exercice,
    obj?.exercise,
    obj?.exo,
    obj?.fields,
  ].filter(Boolean);

  for (const pool of pools) {
    for (const k of keys) {
      const direct = pool?.[k];
      if (direct !== undefined && direct !== null) return direct;

      if (String(k).includes(".")) {
        const nested = getByPath(pool, k);
        if (nested !== undefined && nested !== null) return nested;
      }
    }
  }
  return undefined;
};

const parseNum = (v, fallback = 0) => {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : fallback;
};

const detectUnitFromLabel = (label) => {
  const s = norm(label);
  if (!s) return null;
  if (s.includes("lbs") || s.includes("lb")) return "lbs";
  if (s.includes("kg")) return "kg";
  if (s.includes("mph")) return "mph";
  if (s.includes("km/h") || s.includes("kmh")) return "km/h";
  if (s.includes("miles") || s === "mile" || s === "mi") return "miles";
  if (s === "m" || s.includes("metre") || s.includes("meter")) return "m";
  return null;
};

const isAbsoluteUrl = (v = "") =>
  /^https?:\/\//i.test(String(v)) || /^data:/i.test(String(v)) || /^blob:/i.test(String(v));

const uniqStrings = (arr = []) =>
  Array.from(
    new Set(
      arr
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean)
    )
  );

const STORAGE_BUCKET_URL = "gs://boost-your-life-f6b3e.firebasestorage.app";

function sanitizeStoragePath(input = "") {
  let s = String(input || "").trim();
  if (!s) return "";

  if (s.startsWith("gs://")) {
    const withoutProtocol = s.replace(/^gs:\/\//i, "");
    const firstSlash = withoutProtocol.indexOf("/");
    if (firstSlash >= 0) {
      return withoutProtocol.slice(firstSlash + 1).trim();
    }
    return "";
  }

  s = s.replace(/^https?:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[^/]+\/o\//i, "");
  s = s.replace(/^https?:\/\/storage\.googleapis\.com\/[^/]+\//i, "");
  s = s.replace(/^\/+/, "");

  try {
    s = decodeURIComponent(s);
  } catch {
    // ignore
  }

  return s.trim();
}

function isProbablyStoragePath(v = "") {
  const s = String(v || "").trim();
  if (!s) return false;
  if (isAbsoluteUrl(s)) return false;
  if (s.startsWith("gs://")) return true;
  return s.includes("/") && !s.startsWith("data:") && !s.startsWith("blob:") && !s.startsWith("#");
}

async function resolveStorageUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (isAbsoluteUrl(value)) return value;

  const cleanedPath = sanitizeStoragePath(value);
  if (!cleanedPath) return "";

  if (resolvedStorageUrlCache.has(cleanedPath)) {
    return resolvedStorageUrlCache.get(cleanedPath);
  }

  const pending = (async () => {
    const storagesToTry = [];

    try {
      if (storage) storagesToTry.push(storage);
    } catch {}

    try {
      storagesToTry.push(getStorage());
    } catch {}

    try {
      storagesToTry.push(getStorage(undefined, STORAGE_BUCKET_URL));
    } catch {}

    for (const st of storagesToTry) {
      try {
        const url = await getDownloadURL(storageRef(st, cleanedPath));
        if (url) return url;
      } catch {}
    }

    return "";
  })();

  resolvedStorageUrlCache.set(cleanedPath, pending);
  const finalUrl = await pending;
  resolvedStorageUrlCache.set(cleanedPath, finalUrl || "");
  return finalUrl || "";
}

async function resolveImageCandidatesToUrls(candidates = []) {
  const unique = uniqStrings(candidates);
  const results = await Promise.all(
    unique.map(async (candidate) => {
      if (!candidate) return [];

      if (isAbsoluteUrl(candidate)) {
        const out = [candidate];
        const pathFromUrl = storagePathFromFirebaseUrl(candidate);
        if (pathFromUrl) {
          const url = await resolveStorageUrl(pathFromUrl);
          if (url) out.push(url);
        }
        return out;
      }

      if (isProbablyStoragePath(candidate)) {
        const url = await resolveStorageUrl(candidate);
        return url ? [url] : [];
      }

      return [];
    })
  );

  return uniqStrings(results.flat());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForImagesInNode(root) {
  if (!root) return;

  const imgs = Array.from(root.querySelectorAll("img"));
  if (!imgs.length) return;

  await Promise.all(
    imgs.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  );
}

async function blobToDataUrl(blob) {
  if (!blob) return null;

  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function storagePathFromFirebaseUrl(url = "") {
  const s = String(url || "").trim();
  if (!s) return "";

  try {
    const u = new URL(s);

    if (u.hostname.includes("firebasestorage.googleapis.com")) {
      const match = u.pathname.match(/\/o\/(.+)$/);
      if (match?.[1]) {
        return decodeURIComponent(match[1]);
      }
    }

    if (u.hostname.includes("storage.googleapis.com")) {
      const parts = u.pathname.replace(/^\/+/, "").split("/");
      if (parts.length >= 2) {
        return decodeURIComponent(parts.slice(1).join("/"));
      }
    }
  } catch {}

  return "";
}

async function storagePathToDataUrl(path) {
  const cleanedPath = sanitizeStoragePath(path);
  if (!cleanedPath) return null;

  if (storageDataUrlCache.has(cleanedPath)) {
    return storageDataUrlCache.get(cleanedPath);
  }

  const pending = (async () => {
    const storagesToTry = [];

    try {
      if (storage) storagesToTry.push(storage);
    } catch {}

    try {
      storagesToTry.push(getStorage());
    } catch {}

    try {
      storagesToTry.push(getStorage(undefined, STORAGE_BUCKET_URL));
    } catch {}

    for (const st of storagesToTry) {
      try {
        const blob = await getBlob(storageRef(st, cleanedPath));
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl?.startsWith("data:image/")) return dataUrl;
      } catch {}
    }

    return null;
  })();

  storageDataUrlCache.set(cleanedPath, pending);
  const result = await pending;
  storageDataUrlCache.set(cleanedPath, result);
  return result;
}

async function anyImageSourceToDataUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;

  if (genericImageDataUrlCache.has(value)) {
    return genericImageDataUrlCache.get(value);
  }

  const pending = (async () => {
    if (isProbablyStoragePath(value) || value.startsWith("gs://")) {
      const out = await storagePathToDataUrl(value);
      if (out) return out;
    }

    const absoluteUrl = isAbsoluteUrl(value);
    if (absoluteUrl) {
      const pathFromUrl = storagePathFromFirebaseUrl(value);
      if (pathFromUrl) {
        const out = await storagePathToDataUrl(pathFromUrl);
        if (out) return out;
      }
    }

    const urlToFetch = absoluteUrl
      ? value
      : (() => {
          try {
            return new URL(value, window.location.href).href;
          } catch {
            return null;
          }
        })();

    if (urlToFetch) {
      try {
        const res = await fetch(urlToFetch, {
          method: "GET",
          mode: "cors",
          cache: "force-cache",
        });
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await blobToDataUrl(blob);
        return dataUrl?.startsWith("data:image/") ? dataUrl : null;
      } catch {
        return null;
      }
    }

    return null;
  })();

  genericImageDataUrlCache.set(value, pending);
  const result = await pending;
  genericImageDataUrlCache.set(value, result);
  return result;
}

function preloadImage(url) {
  const src = String(url || "").trim();
  if (!src) return;
  const img = new window.Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = src;
}

function preloadVideo(url) {
  const src = String(url || "").trim();
  if (!src || typeof document === "undefined") return;
  const video = document.createElement("video");
  video.preload = "metadata";
  video.src = src;
}

/* ---------------- media helpers ---------------- */

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown"];

function normalizeUrl(v) {
  return typeof v === "string" && v.trim() ? v.trim() : "";
}

function isSignedStorageUrl(url = "") {
  const s = String(url || "").toLowerCase();
  return s.includes("storage.googleapis.com") || s.includes("firebasestorage.googleapis.com");
}

function rankMediaKey(key = "") {
  const k = String(key || "").toLowerCase();
  if (k === "depart") return 0;
  if (k === "milieu") return 1;
  const mid = k.match(/^milieu-(\d+)$/);
  if (mid) return 1 + Number(mid[1]);
  if (k === "arrivee") return 100;
  return 999;
}

function mediaValueToPath(value) {
  if (!value) return "";
  if (typeof value === "string") return String(value).trim();
  if (typeof value === "object") {
    return (
      normalizeUrl(value?.url) ||
      normalizeUrl(value?.path) ||
      normalizeUrl(value?.src) ||
      normalizeUrl(value?.downloadURL) ||
      ""
    );
  }
  return "";
}

function findMediaByKey(entries, wantedKey) {
  if (!Array.isArray(entries) || !wantedKey) return "";
  const normalizedKey = String(wantedKey || "").toLowerCase();
  const found = entries.find((item) => String(item?.key || "").toLowerCase() === normalizedKey);
  return mediaValueToPath(found);
}

const buildGenderOrderedMedia = (exercise, preferredGender = "homme") => {
  const hommeImages = Array.isArray(exercise?.media?.homme?.images) ? exercise.media.homme.images : [];
  const femmeImages = Array.isArray(exercise?.media?.femme?.images) ? exercise.media.femme.images : [];

  const female = {
    depart: [
      exercise?.image_femme_depart,
      findMediaByKey(femmeImages, "depart"),
      exercise?.image_femme,
      exercise?.image,
      exercise?.image_homme_depart,
      findMediaByKey(hommeImages, "depart"),
      exercise?.image_homme,
    ],
    arrivee: [
      exercise?.image_femme_arrivee,
      findMediaByKey(femmeImages, "arrivee"),
      exercise?.image_femme,
      exercise?.image,
      exercise?.image_homme_arrivee,
      findMediaByKey(hommeImages, "arrivee"),
      exercise?.image_homme,
    ],
    video: [
      mediaValueToPath(exercise?.media?.femme?.video),
      exercise?.video_femme,
      exercise?.video,
      mediaValueToPath(exercise?.media?.homme?.video),
      exercise?.video_homme,
    ],
  };

  const male = {
    depart: [
      exercise?.image_homme_depart,
      findMediaByKey(hommeImages, "depart"),
      exercise?.image_homme,
      exercise?.image,
      exercise?.image_femme_depart,
      findMediaByKey(femmeImages, "depart"),
      exercise?.image_femme,
    ],
    arrivee: [
      exercise?.image_homme_arrivee,
      findMediaByKey(hommeImages, "arrivee"),
      exercise?.image_homme,
      exercise?.image,
      exercise?.image_femme_arrivee,
      findMediaByKey(femmeImages, "arrivee"),
      exercise?.image_femme,
    ],
    video: [
      mediaValueToPath(exercise?.media?.homme?.video),
      exercise?.video_homme,
      exercise?.video,
      mediaValueToPath(exercise?.media?.femme?.video),
      exercise?.video_femme,
    ],
  };

  return preferredGender === "femme" ? female : male;
};

function inferSexPreference(user, programData, clientData, locationState) {
  const direct =
    clientData?.sex ||
    clientData?.sexe ||
    clientData?.gender ||
    locationState?.client?.sex ||
    locationState?.client?.sexe ||
    locationState?.client?.gender ||
    locationState?.selectedClient?.sex ||
    locationState?.selectedClient?.sexe ||
    locationState?.selectedClient?.gender ||
    user?.sex ||
    user?.sexe ||
    user?.gender ||
    user?.profile?.sex ||
    user?.profile?.sexe ||
    user?.profile?.gender ||
    programData?.sexe ||
    programData?.sex ||
    programData?.genre ||
    "";

  const s = String(direct || "").toLowerCase();
  if (s.includes("fem")) return "femme";
  if (s.includes("hom") || s.includes("male") || s.includes("man")) return "homme";
  return "homme";
}

function getSexMediaBucket(exercise, preferredSex = "") {
  const media = exercise?.media || {};
  const femme = media?.femme || {};
  const homme = media?.homme || {};

  const femmeCount =
    (Array.isArray(femme.images) ? femme.images.length : 0) + (normalizeUrl(femme?.video?.url) ? 1 : 0);

  const hommeCount =
    (Array.isArray(homme.images) ? homme.images.length : 0) + (normalizeUrl(homme?.video?.url) ? 1 : 0);

  if (preferredSex === "femme") return femmeCount ? femme : hommeCount ? homme : {};
  if (preferredSex === "homme") return hommeCount ? homme : femmeCount ? femme : {};

  return hommeCount ? homme : femmeCount ? femme : {};
}

function extractExerciseMedia(exercise, preferredSex = "") {
  const selected = getSexMediaBucket(exercise, preferredSex);
  const rawImages = Array.isArray(selected?.images) ? selected.images : [];

  const images = rawImages
    .map((img) => (typeof img === "string" ? { url: img, key: "" } : img))
    .filter((img) => normalizeUrl(img?.url))
    .sort((a, b) => rankMediaKey(a?.key) - rankMediaKey(b?.key))
    .map((img, idx) => ({
      id: `img-${idx}-${img?.key || "x"}`,
      type: "image",
      key: img?.key || "",
      url: normalizeUrl(img?.url),
      path: normalizeUrl(img?.path),
    }));

  const videoUrl = normalizeUrl(selected?.video?.url);
  const video = videoUrl
    ? [
        {
          id: "video-0",
          type: "video",
          key: "video",
          url: videoUrl,
          path: normalizeUrl(selected?.video?.path),
        },
      ]
    : [];

  const out = [...video, ...images].filter((m) => normalizeUrl(m?.url));
  return out.filter((m) => isSignedStorageUrl(m.url) || m.url.startsWith("http"));
}

function getExerciseCacheKey(exercise, fallback = "") {
  return (
    String(exercise?.id || "").trim() ||
    String(exercise?.exerciseId || "").trim() ||
    String(exercise?.exercise_id || "").trim() ||
    String(exercise?.nom || "").trim() ||
    String(exercise?.name || "").trim() ||
    fallback
  );
}

async function findExerciseDocFromFirestore(exercise) {
  const exId =
    String(exercise?.id || "").trim() ||
    String(exercise?.exerciseId || "").trim() ||
    String(exercise?.exercise_id || "").trim();

  const exName =
    String(exercise?.nom || "").trim() ||
    String(exercise?.name || "").trim() ||
    String(exercise?.title || "").trim();

  const cacheKey = `${exId || ""}__${exName || ""}__${String(exercise?.__collection || "")}`;
  if (firestoreExerciseCache.has(cacheKey)) {
    return firestoreExerciseCache.get(cacheKey);
  }
  if (firestoreExercisePromiseCache.has(cacheKey)) {
    return firestoreExercisePromiseCache.get(cacheKey);
  }

  const pending = (async () => {
    const preferredCollections = [];
    const colHint = String(exercise?.__collection || "").toLowerCase();
    const usage = Array.isArray(exercise?.categorie_utilisation)
      ? exercise.categorie_utilisation.map((v) => String(v).toLowerCase())
      : typeof exercise?.categorie_utilisation === "string"
        ? [String(exercise.categorie_utilisation).toLowerCase()]
        : [];

    if (colHint && EXERCISE_COLLECTIONS.includes(colHint)) preferredCollections.push(colHint);
    if (usage.includes("training")) preferredCollections.push("training");
    if (usage.includes("warmup")) preferredCollections.push("warmup");
    if (usage.includes("cooldown")) preferredCollections.push("cooldown");

    EXERCISE_COLLECTIONS.forEach((c) => {
      if (!preferredCollections.includes(c)) preferredCollections.push(c);
    });

    for (const col of preferredCollections) {
      if (exId) {
        const directRef = doc(db, col, exId);
        const directSnap = await getDoc(directRef);
        if (directSnap.exists()) return { ...directSnap.data(), __collection: col, __docId: directSnap.id };

        const byFieldId = await getDocs(query(collection(db, col), where("id", "==", exId), limit(1)));
        if (!byFieldId.empty) {
          const d = byFieldId.docs[0];
          return { ...d.data(), __collection: col, __docId: d.id };
        }
      }

      if (exName) {
        const byNom = await getDocs(query(collection(db, col), where("nom", "==", exName), limit(1)));
        if (!byNom.empty) {
          const d = byNom.docs[0];
          return { ...d.data(), __collection: col, __docId: d.id };
        }

        const byName = await getDocs(query(collection(db, col), where("name", "==", exName), limit(1)));
        if (!byName.empty) {
          const d = byName.docs[0];
          return { ...d.data(), __collection: col, __docId: d.id };
        }
      }
    }

    return null;
  })();

  firestoreExercisePromiseCache.set(cacheKey, pending);
  const result = await pending;
  firestoreExercisePromiseCache.delete(cacheKey);
  firestoreExerciseCache.set(cacheKey, result);
  return result;
}

async function findExerciseVariantDoc(variantLabel, originalExercise = null) {
  const wanted = String(variantLabel || "").trim();
  if (!wanted) return null;

  const normalizedWanted = norm(wanted);

  const preferredCollections = [];
  const colHint = String(originalExercise?.__collection || "").toLowerCase();
  const usage = Array.isArray(originalExercise?.categorie_utilisation)
    ? originalExercise.categorie_utilisation.map((v) => String(v).toLowerCase())
    : typeof originalExercise?.categorie_utilisation === "string"
      ? [String(originalExercise.categorie_utilisation).toLowerCase()]
      : [];

  if (colHint && EXERCISE_COLLECTIONS.includes(colHint)) preferredCollections.push(colHint);
  if (usage.includes("training")) preferredCollections.push("training");
  if (usage.includes("warmup")) preferredCollections.push("warmup");
  if (usage.includes("cooldown")) preferredCollections.push("cooldown");

  EXERCISE_COLLECTIONS.forEach((c) => {
    if (!preferredCollections.includes(c)) preferredCollections.push(c);
  });

  for (const col of preferredCollections) {
    try {
      const exactByNom = await getDocs(query(collection(db, col), where("nom", "==", wanted), limit(1)));
      if (!exactByNom.empty) {
        const d = exactByNom.docs[0];
        return { ...d.data(), __collection: col, __docId: d.id };
      }

      const exactByName = await getDocs(query(collection(db, col), where("name", "==", wanted), limit(1)));
      if (!exactByName.empty) {
        const d = exactByName.docs[0];
        return { ...d.data(), __collection: col, __docId: d.id };
      }
    } catch {
      // ignore exact query failure
    }

    try {
      const snap = await getDocs(collection(db, col));
      const matched = snap.docs.find((d) => {
        const data = d.data() || {};
        const candidates = [
          data?.nom,
          data?.name,
          data?.title,
          data?.label,
          data?.id,
        ]
          .filter(Boolean)
          .map((v) => norm(v));

        return candidates.includes(normalizedWanted);
      });

      if (matched) {
        return { ...matched.data(), __collection: col, __docId: matched.id };
      }
    } catch {
      // ignore fallback scan failure
    }
  }

  return null;
}

function buildReplacementExercise(oldExercise, newExercise) {
  const keepKeys = [
    "series",
    "Séries",
    "séries",
    "repetitions",
    "Répétitions",
    "répétitions",
    "reps",
    "repos",
    "pause",
    "Repos (min:sec)",
    "Repos",
    "rest",
    "duree_repos",
    "temps",
    "temps_effort",
    "duree",
    "durée",
    "duree_effort",
    "Durée (min:sec)",
    "time",
    "charge",
    "poids",
    "weight",
    "Charge (kg)",
    "Charge (lbs)",
    "Intensité",
    "intensite",
    "Watts",
    "watts",
    "Inclinaison (%)",
    "inclinaison",
    "incline",
    "Objectif Calories",
    "calories",
    "Tempo",
    "tempo",
    "Vitesse",
    "vitesse",
    "speed",
    "Vitesse (km/h)",
    "Vitesse (mph)",
    "Distance",
    "distance",
    "Distance (m)",
    "Distance (miles)",
    "optionsOrder",
    "optionsEnabled",
    "options",
    "notes",
    "notesEnabled",
    "seriesDiff",
    "useAdvancedSets",
    "advancedSets",
    "seriesDetails",
    "sets",
    "series_sets",
    "series_differentes",
    "seriesDifferentes",
    "seriesDifferent",
    "perSet",
    "linkNext",
    "chainNext",
    "linkedNext",
    "linkWithNext",
    "link",
    "suivantLie",
    "chain",
    "chainRestMode",
  ];

  const preserved = {};
  keepKeys.forEach((key) => {
    if (oldExercise?.[key] !== undefined) preserved[key] = oldExercise[key];
  });

  const merged = {
    ...newExercise,
    ...preserved,
  };

  if (!merged.nom && merged.name) merged.nom = merged.name;
  if (!merged.name && merged.nom) merged.name = merged.nom;

  return merged;
}

function getExerciseImageUrls(exercise, preferredSex = "") {
  const mediaItems = extractExerciseMedia(exercise, preferredSex);
  return uniqStrings(mediaItems.filter((m) => m.type === "image").map((m) => m.url));
}

/* ---------------- Units ---------------- */
const KG_TO_LBS = 2.2046226218;
const KMH_TO_MPH = 0.6213711922;
const M_TO_MILES = 0.0006213711922;

const normalizeWeightUnit = (u) => {
  const s = norm(u);
  if (s === "lbs" || s === "lb" || s === "pounds" || s === "livres") return "lbs";
  return "kg";
};

const normalizeSpeedUnit = (u) => {
  const s = norm(u);
  if (s === "mph") return "mph";
  return "km/h";
};

const normalizeDistanceUnit = (u) => {
  const s = norm(u);
  if (s === "mile" || s === "miles" || s === "mi") return "miles";
  return "m";
};

const getSessionStorageUnitPrefs = () => {
  try {
    const candidates = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (
        key.includes("BYL_AUTO_PREFS") ||
        key.includes("BYL") ||
        key.toLowerCase().includes("unit") ||
        key.toLowerCase().includes("prefs")
      ) {
        candidates.push(key);
      }
    }

    for (const key of candidates) {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const obj = JSON.parse(raw);

        const weight =
          obj?.weightUnit ??
          obj?.poidsUnit ??
          obj?.units?.weight ??
          obj?.displayUnits?.weight ??
          obj?.prefs?.weightUnit ??
          obj?.prefs?.poidsUnit;

        const speed =
          obj?.speedUnit ??
          obj?.vitesseUnit ??
          obj?.units?.speed ??
          obj?.displayUnits?.speed ??
          obj?.prefs?.speedUnit ??
          obj?.prefs?.vitesseUnit;

        const distance =
          obj?.distanceUnit ??
          obj?.units?.distance ??
          obj?.displayUnits?.distance ??
          obj?.prefs?.distanceUnit;

        if (weight || speed || distance) {
          return {
            weight: weight ? normalizeWeightUnit(weight) : null,
            speed: speed ? normalizeSpeedUnit(speed) : null,
            distance: distance ? normalizeDistanceUnit(distance) : null,
          };
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return { weight: null, speed: null, distance: null };
};

const readDisplayUnits = (prog) => {
  const storageUnits = getSessionStorageUnitPrefs();

  const weightCandidates = [
    pickFirst(prog, [
      "weightUnit",
      "poidsUnit",
      "poids_unit",
      "unitWeight",
      "units.weight",
      "displayUnits.weight",
      "builderOptions.weightUnit",
      "builderOptions.poidsUnit",
      "options.weightUnit",
      "options.poidsUnit",
      "options.units.weight",
      "meta.weightUnit",
      "meta.poidsUnit",
      "pendingPrefs.weightUnit",
      "pendingPrefs.poidsUnit",
      "prefs.weightUnit",
      "prefs.poidsUnit",
      "questionnaire.weightUnit",
      "questionnaire.poidsUnit",
    ]),
    storageUnits.weight,
  ].filter(Boolean);

  const speedCandidates = [
    pickFirst(prog, [
      "speedUnit",
      "vitesseUnit",
      "vitesse_unit",
      "unitSpeed",
      "units.speed",
      "displayUnits.speed",
      "builderOptions.speedUnit",
      "builderOptions.vitesseUnit",
      "options.speedUnit",
      "options.vitesseUnit",
      "options.units.speed",
      "meta.speedUnit",
      "meta.vitesseUnit",
      "pendingPrefs.speedUnit",
      "pendingPrefs.vitesseUnit",
      "prefs.speedUnit",
      "prefs.vitesseUnit",
      "questionnaire.speedUnit",
      "questionnaire.vitesseUnit",
    ]),
    storageUnits.speed,
  ].filter(Boolean);

  const distanceCandidates = [
    pickFirst(prog, [
      "distanceUnit",
      "distance_unit",
      "unitDistance",
      "units.distance",
      "displayUnits.distance",
      "builderOptions.distanceUnit",
      "options.distanceUnit",
      "options.units.distance",
      "meta.distanceUnit",
      "pendingPrefs.distanceUnit",
      "prefs.distanceUnit",
      "questionnaire.distanceUnit",
    ]),
    storageUnits.distance,
  ].filter(Boolean);

  return {
    weight: weightCandidates.length ? normalizeWeightUnit(weightCandidates[0]) : "kg",
    speed: speedCandidates.length ? normalizeSpeedUnit(speedCandidates[0]) : "km/h",
    distance: distanceCandidates.length ? normalizeDistanceUnit(distanceCandidates[0]) : "m",
  };
};

const convertWeight = (value, unit, sourceUnit = "kg") => {
  const n = parseNum(value, 0);
  if (sourceUnit === unit) return n;
  if (sourceUnit === "lbs" && unit === "kg") return n / KG_TO_LBS;
  if (sourceUnit === "kg" && unit === "lbs") return n * KG_TO_LBS;
  return n;
};

const convertSpeed = (value, unit, sourceUnit = "km/h") => {
  const n = parseNum(value, 0);
  if (sourceUnit === unit) return n;
  if (sourceUnit === "mph" && unit === "km/h") return n / KMH_TO_MPH;
  if (sourceUnit === "km/h" && unit === "mph") return n * KMH_TO_MPH;
  return n;
};

const convertDistance = (value, unit, sourceUnit = "m") => {
  const n = parseNum(value, 0);
  if (sourceUnit === unit) return n;
  if (sourceUnit === "miles" && unit === "m") return n / M_TO_MILES;
  if (sourceUnit === "m" && unit === "miles") return n * M_TO_MILES;
  return n;
};

const getLocaleFromLang = (lang = "fr") => {
  const s = String(lang || "fr").toLowerCase();
  if (s.startsWith("fr")) return "fr-FR";
  if (s.startsWith("en")) return "en-GB";
  if (s.startsWith("de")) return "de-DE";
  if (s.startsWith("it")) return "it-IT";
  if (s.startsWith("es")) return "es-ES";
  if (s.startsWith("ru")) return "ru-RU";
  if (s.startsWith("ar")) return "ar-EG";
  return "fr-FR";
};

const formatDisplayNumber = (value, locale = "fr-FR", maxFractionDigits = 2) => {
  const n = parseNum(value, 0);
  const roundedInt = Math.round(n);
  const useInt = Math.abs(n - roundedInt) < 0.000001;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: useInt ? 0 : maxFractionDigits,
  }).format(n);
};

const getDisplayFieldLabel = (key, units, L) => {
  switch (key) {
    case "series":
      return L?.labels?.sets || "Séries";
    case "repetitions":
      return L?.labels?.reps || "Répétitions";
    case "temps":
      return L?.labels?.duration || "Durée";
    case "repos":
      return L?.labels?.rest || "Repos";
    case "charge":
      return units?.weight === "lbs"
        ? L?.labels?.loadLbs || "Charge (lbs)"
        : L?.labels?.loadKg || "Charge (kg)";
    case "intensite":
      return L?.labels?.intensity || "Intensité";
    case "watts":
      return L?.labels?.watts || "Watts";
    case "inclinaison":
      return L?.labels?.incline || "Inclinaison (%)";
    case "calories":
      return L?.labels?.calories || "Objectif Calories";
    case "tempo":
      return L?.labels?.tempo || "Tempo";
    case "vitesse":
      return units?.speed === "mph"
        ? L?.labels?.speedMph || "Vitesse (mph)"
        : L?.labels?.speedKmh || "Vitesse (km/h)";
    case "distance":
      return units?.distance === "miles"
        ? L?.labels?.distanceMiles || "Distance (miles)"
        : L?.labels?.distanceMeters || "Distance (m)";
    default:
      return key;
  }
};

const getDisplayValueForField = (key, rawValue, units, locale = "fr-FR", sourceUnit = null) => {
  if (key === "temps" || key === "repos") return fmtSec(toSeconds(rawValue));

  if (key === "charge") {
    return formatDisplayNumber(convertWeight(rawValue, units?.weight, sourceUnit || "kg"), locale);
  }

  if (key === "vitesse") {
    return formatDisplayNumber(convertSpeed(rawValue, units?.speed, sourceUnit || "km/h"), locale);
  }

  if (key === "distance") {
    return formatDisplayNumber(convertDistance(rawValue, units?.distance, sourceUnit || "m"), locale);
  }

  if (typeof rawValue === "number") return formatDisplayNumber(rawValue, locale);
  const parsed = parseNum(rawValue, NaN);
  if (!Number.isNaN(parsed)) return formatDisplayNumber(parsed, locale);
  return String(rawValue ?? 0);
};

/* =========================
   Pretty names / Coach label resolver
   ========================= */
const getPrettyUserName = (u) => {
  if (!u) return "";
  const first = (u.firstName || u.firstname || u.prenom || "").toString().trim();
  const last = (u.lastName || u.lastname || u.nom || "").toString().trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;

  const dn = (u.displayName || "").toString().trim();
  if (dn && !/@/.test(dn)) return dn;

  return "";
};

async function resolveCoachNameFromCreatedBy(createdBy) {
  try {
    if (!createdBy) return "";
    const raw =
      typeof createdBy === "string"
        ? createdBy.trim()
        : typeof createdBy === "object"
          ? (createdBy.uid || createdBy.id || createdBy.userId || "").toString().trim()
          : "";

    if (!raw) return "";
    if (/auto/i.test(raw)) return "";

    const snap = await getDoc(doc(db, "users", raw));
    if (snap.exists()) {
      const d = snap.data() || {};
      const full = [String(d.prenom || "").trim(), String(d.nom || "").trim()]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (full) return full;

      const dn = String(d.displayName || "").trim();
      if (dn && !/@/.test(dn)) return dn;

      const em = String(d.email || "").trim();
      if (em && !/@/.test(em)) return em;
    }

    return "";
  } catch {
    return "";
  }
}

/* =========================
   Nom séance
   ========================= */
function getSessionDisplayName(session, idx, L) {
  const candidates = [
    session?.name,
    session?.nomSeance,
    session?.nom_seance,
    session?.titre,
    session?.title,
    session?.nom,
    session?.label,
    session?.sessionName,
    session?.session_title,
    session?.splitLabel,
    session?.split,
    session?.typeSeance,
    session?.type,
    session?.focus,
  ]
    .filter((v) => typeof v === "string" && v.trim())
    .map((v) => v.trim());

  if (candidates.length) return candidates[0];
  return `${L.session} ${idx + 1}`;
}

/* ---- champs normalisés ---- */
const FIELD_MAP = {
  series: ["series", "Séries", "séries"],
  repetitions: ["repetitions", "Répétitions", "répétitions", "reps"],
  repos: ["repos", "pause", "Repos (min:sec)", "Repos", "rest", "duree_repos"],
  temps: ["temps", "temps_effort", "duree", "durée", "duree_effort", "Durée (min:sec)", "time"],
  charge: ["charge", "poids", "weight", "Charge (kg)", "Charge (lbs)"],
  intensite: ["Intensité", "intensite"],
  watts: ["Watts", "watts"],
  inclinaison: ["Inclinaison (%)", "inclinaison", "incline"],
  calories: ["Objectif Calories", "calories"],
  tempo: ["Tempo", "tempo"],
  vitesse: ["Vitesse", "vitesse", "speed", "Vitesse (km/h)", "Vitesse (mph)"],
  distance: ["Distance", "distance", "Distance (m)", "Distance (miles)"],
};

const getFieldValue = (obj, keys) => pickFirst(obj, keys);

const OPTION_FLAG = {
  series: "Séries",
  repetitions: "Répétitions",
  repos: "Repos (min:sec)",
  temps: "Durée (min:sec)",
  charge: "Charge (kg)",
  calories: "Objectif Calories",
  tempo: "Tempo",
  vitesse: "Vitesse",
  distance: "Distance",
  intensite: "Intensité",
  watts: "Watts",
  inclinaison: "Inclinaison (%)",
};

const isOptionEnabled = (ex, key) => {
  const label = OPTION_FLAG[key];
  if (!label) return false;
  const byOrder = Array.isArray(ex?.optionsOrder) && ex.optionsOrder.includes(label);
  const oe = ex?.optionsEnabled || ex?.options || ex?.details?.optionsEnabled || ex?.details?.options || {};
  const byBool = oe[key] === true || oe[label] === true || oe[key?.toLowerCase?.()] === true;
  const byChecked = ex?.[`${key}Checked`] === true || ex?.[`${key}_checked`] === true;
  return !!(byOrder || byBool || byChecked);
};

const detectSourceUnitForField = (ex, key) => {
  const possibleLabels = {
    charge: ["Charge (kg)", "Charge (lbs)", "weight", "poids", "charge"],
    vitesse: ["Vitesse (km/h)", "Vitesse (mph)", "speed", "vitesse"],
    distance: ["Distance (m)", "Distance (miles)", "distance"],
  };

  if (!possibleLabels[key]) return null;

  for (const candidate of possibleLabels[key]) {
    const found = pickFirst(ex, [candidate]);
    if (found !== undefined && found !== null) {
      const byLabel = detectUnitFromLabel(candidate);
      if (byLabel) return byLabel;
    }
  }

  const optionsOrder = Array.isArray(ex?.optionsOrder) ? ex.optionsOrder : [];
  for (const item of optionsOrder) {
    const unit = detectUnitFromLabel(item);
    if (!unit) continue;
    if (key === "charge" && (unit === "kg" || unit === "lbs")) return unit;
    if (key === "vitesse" && (unit === "km/h" || unit === "mph")) return unit;
    if (key === "distance" && (unit === "m" || unit === "miles")) return unit;
  }

  return null;
};

const buildInfosFromExercise = (ex, units, locale = "fr-FR", L = null) => {
  const values = {
    series: getFieldValue(ex, FIELD_MAP.series),
    repetitions: getFieldValue(ex, FIELD_MAP.repetitions),
    repos: getFieldValue(ex, FIELD_MAP.repos),
    temps: getFieldValue(ex, FIELD_MAP.temps),
    charge: getFieldValue(ex, FIELD_MAP.charge),
    intensite: getFieldValue(ex, FIELD_MAP.intensite),
    watts: getFieldValue(ex, FIELD_MAP.watts),
    inclinaison: getFieldValue(ex, FIELD_MAP.inclinaison),
    calories: getFieldValue(ex, FIELD_MAP.calories),
    tempo: getFieldValue(ex, FIELD_MAP.tempo),
    vitesse: getFieldValue(ex, FIELD_MAP.vitesse),
    distance: getFieldValue(ex, FIELD_MAP.distance),
  };

  const push = (key) => {
    const enabled = isOptionEnabled(ex, key);
    const present = values[key] !== undefined;
    if (enabled || present) {
      const raw = values[key] ?? 0;
      const sourceUnit = detectSourceUnitForField(ex, key);
      return {
        key,
        rawValue: raw,
        sourceUnit,
        label: getDisplayFieldLabel(key, units, L),
        value: getDisplayValueForField(key, raw, units, locale, sourceUnit),
      };
    }
    return null;
  };

  return [
    push("series"),
    push("repetitions"),
    push("temps"),
    push("charge"),
    push("repos"),
    push("intensite"),
    push("watts"),
    push("inclinaison"),
    push("calories"),
    push("tempo"),
    push("vitesse"),
    push("distance"),
  ].filter(Boolean);
};

/* ---- Séries différentes ---- */
function getAdvancedSets(ex) {
  const enabled =
    pickFirst(ex, ["seriesDiff", "useAdvancedSets", "advancedSets"]) === true ||
    ex?.details?.seriesDiff === true ||
    ex?.details?.useAdvancedSets === true ||
    ex?.details?.advancedSets === true;

  const raw = Array.isArray(pickFirst(ex, ["seriesDetails"])) ? pickFirst(ex, ["seriesDetails"]) : null;
  const fallback = Array.isArray(pickFirst(ex, ["sets"])) ? pickFirst(ex, ["sets"]) : null;
  const arr = raw || fallback || [];

  if (!enabled || arr.length === 0) return { enabled: false, sets: [] };

  const sets = arr.map((s) => {
    const rawCharge =
      s.chargeKg ??
      s.charge ??
      s["Charge (kg)"] ??
      s["Charge (lbs)"] ??
      0;

    const sourceUnit =
      s["Charge (lbs)"] !== undefined
        ? "lbs"
        : s["Charge (kg)"] !== undefined
          ? "kg"
          : detectUnitFromLabel(
              Object.keys(s || {}).find((k) => norm(k).includes("charge")) || ""
            ) || "kg";

    return {
      reps: s.reps ?? s.repetitions ?? s["Répétitions"] ?? s.reps ?? 0,
      chargeValue: rawCharge,
      chargeUnit: sourceUnit,
      restSec: toSeconds(s.restSec ?? s.rest ?? s["Repos (min:sec)"] ?? s.repos ?? 0),
      durationSec: toSeconds(s.durationSec ?? s.duration ?? s["Durée (min:sec)"] ?? s.temps ?? 0),
    };
  });

  return { enabled: true, sets };
}

/* ---- Sections helper ---- */
const asSections = (session) => {
  if (session?.echauffement || session?.corps || session?.retourCalme || session?.bonus) {
    return {
      echauffement: Array.isArray(session.echauffement) ? session.echauffement : [],
      corps: Array.isArray(session.corps) ? session.corps : [],
      bonus: Array.isArray(session.bonus) ? session.bonus : [],
      retourCalme: Array.isArray(session.retourCalme) ? session.retourCalme : [],
    };
  }
  const arr = Array.isArray(session?.exercises) ? session.exercises : [];
  return { echauffement: [], corps: arr, bonus: [], retourCalme: [] };
};

/* ---- Temps total ---- */
function totalTime(session) {
  if (!session) return "-";
  const S = asSections(session);
  let total = 0;

  const addEx = (ex) => {
    const adv = getAdvancedSets(ex);
    const restDefault = toSeconds(getFieldValue(ex, FIELD_MAP.repos) ?? 0);
    const series = Number(getFieldValue(ex, FIELD_MAP.series) ?? 0) || 1;
    const reps = Number(getFieldValue(ex, FIELD_MAP.repetitions) ?? 0);
    const dur = toSeconds(getFieldValue(ex, FIELD_MAP.temps) ?? 0);

    if (adv.enabled && adv.sets.length) {
      adv.sets.forEach((st) => {
        total += st.durationSec || (reps ? reps * 3 : 30);
        total += st.restSec || restDefault || 0;
      });
      return;
    }

    if (dur > 0) {
      total += series * dur + Math.max(0, series - 1) * restDefault;
      return;
    }
    if (reps > 0) {
      total += series * reps * 3 + Math.max(0, series - 1) * restDefault;
      return;
    }
    total += series * 30 + Math.max(0, series - 1) * restDefault;
  };

  S.echauffement.forEach(addEx);
  S.corps.forEach(addEx);
  S.bonus.forEach(addEx);
  S.retourCalme.forEach(addEx);

  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} min ${s} sec` : `${m} min`;
}

/* ---------------- PDF i18n ---------------- */
const PDF_I18N = {
  fr: {
    langName: "FR",
    sections: {
      warmup: "Échauffement",
      main: "Corps de séance",
      bonus: "Bonus",
      cooldown: "Retour au calme",
    },
    labels: {
      sets: "Séries",
      reps: "Répétitions",
      rest: "Repos",
      duration: "Durée",
      loadKg: "Charge (kg)",
      loadLbs: "Charge (lbs)",
      intensity: "Intensité",
      watts: "Watts",
      incline: "Inclinaison (%)",
      calories: "Objectif Calories",
      tempo: "Tempo",
      speedKmh: "Vitesse (km/h)",
      speedMph: "Vitesse (mph)",
      distanceMeters: "Distance (m)",
      distanceMiles: "Distance (miles)",
      effort: "Effort",
      pause: "Pause",
    },
    advSets: "Séries différentes",
    notes: "Notes",
    session: "Séance",
    setN: (n) => `Set ${n}`,
    generatedWith: (host) => `Généré avec Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("fr-FR"),
    fileProgram: "programme",
    fileClient: "client",
    totalTime: "Temps total estimé",
    perWeek: "x/Sem",
    continued: " (suite)",
  },
  en: {
    langName: "EN",
    sections: { warmup: "Warm-up", main: "Main session", bonus: "Bonus", cooldown: "Cool-down" },
    labels: {
      sets: "Sets",
      reps: "Reps",
      rest: "Rest",
      duration: "Duration",
      loadKg: "Load (kg)",
      loadLbs: "Load (lbs)",
      intensity: "Intensity",
      watts: "Watts",
      incline: "Incline (%)",
      calories: "Calories goal",
      tempo: "Tempo",
      speedKmh: "Speed (km/h)",
      speedMph: "Speed (mph)",
      distanceMeters: "Distance (m)",
      distanceMiles: "Distance (miles)",
      effort: "Effort",
      pause: "Rest",
    },
    advSets: "Advanced sets",
    notes: "Notes",
    session: "Session",
    setN: (n) => `Set ${n}`,
    generatedWith: (host) => `Generated with Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("en-GB"),
    fileProgram: "program",
    fileClient: "client",
    totalTime: "Estimated total time",
    perWeek: "x/week",
    continued: " (cont.)",
  },
  de: {
    langName: "DE",
    sections: { warmup: "Aufwärmen", main: "Hauptteil", bonus: "Bonus", cooldown: "Cooldown" },
    labels: {
      sets: "Sätze",
      reps: "Wdh.",
      rest: "Pause",
      duration: "Dauer",
      loadKg: "Last (kg)",
      loadLbs: "Last (lbs)",
      intensity: "Intensität",
      watts: "Watt",
      incline: "Steigung (%)",
      calories: "Kalorienziel",
      tempo: "Tempo",
      speedKmh: "Geschwindigkeit (km/h)",
      speedMph: "Geschwindigkeit (mph)",
      distanceMeters: "Distanz (m)",
      distanceMiles: "Distanz (Meilen)",
      effort: "Belastung",
      pause: "Pause",
    },
    advSets: "Variable Sätze",
    notes: "Notizen",
    session: "Einheit",
    setN: (n) => `Satz ${n}`,
    generatedWith: (host) => `Erstellt mit Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("de-DE"),
    fileProgram: "programm",
    fileClient: "kunde",
    totalTime: "Geschätzte Gesamtzeit",
    perWeek: "x/Woche",
    continued: " (Fortsetzung)",
  },
  it: {
    langName: "IT",
    sections: { warmup: "Riscaldamento", main: "Allenamento", bonus: "Bonus", cooldown: "Defaticamento" },
    labels: {
      sets: "Serie",
      reps: "Ripetizioni",
      rest: "Recupero",
      duration: "Durata",
      loadKg: "Carico (kg)",
      loadLbs: "Carico (lbs)",
      intensity: "Intensità",
      watts: "Watt",
      incline: "Inclinazione (%)",
      calories: "Obiettivo Calorie",
      tempo: "Tempo",
      speedKmh: "Velocità (km/h)",
      speedMph: "Velocità (mph)",
      distanceMeters: "Distanza (m)",
      distanceMiles: "Distanza (miglia)",
      effort: "Sforzo",
      pause: "Recupero",
    },
    advSets: "Serie variabili",
    notes: "Note",
    session: "Seduta",
    setN: (n) => `Serie ${n}`,
    generatedWith: (host) => `Generato con Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("it-IT"),
    fileProgram: "programma",
    fileClient: "cliente",
    totalTime: "Tempo totale stimato",
    perWeek: "x/settimana",
    continued: " (segue)",
  },
  es: {
    langName: "ES",
    sections: {
      warmup: "Calentamiento",
      main: "Entrenamiento",
      bonus: "Bonus",
      cooldown: "Vuelta a la calma",
    },
    labels: {
      sets: "Series",
      reps: "Repeticiones",
      rest: "Descanso",
      duration: "Duración",
      loadKg: "Carga (kg)",
      loadLbs: "Carga (lbs)",
      intensity: "Intensidad",
      watts: "Vatios",
      incline: "Inclinación (%)",
      calories: "Objetivo Calorías",
      tempo: "Tempo",
      speedKmh: "Velocidad (km/h)",
      speedMph: "Velocidad (mph)",
      distanceMeters: "Distancia (m)",
      distanceMiles: "Distancia (millas)",
      effort: "Esfuerzo",
      pause: "Descanso",
    },
    advSets: "Series variables",
    notes: "Notas",
    session: "Sesión",
    setN: (n) => `Serie ${n}`,
    generatedWith: (host) => `Generado con Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("es-ES"),
    fileProgram: "programa",
    fileClient: "cliente",
    totalTime: "Tiempo total estimado",
    perWeek: "x/semana",
    continued: " (continuación)",
  },
  ru: {
    langName: "RU",
    sections: { warmup: "Разминка", main: "Основная часть", bonus: "Бонус", cooldown: "Заминка" },
    labels: {
      sets: "Подходы",
      reps: "Повторы",
      rest: "Отдых",
      duration: "Длительность",
      loadKg: "Вес (кг)",
      loadLbs: "Вес (lbs)",
      intensity: "Интенсивность",
      watts: "Вт",
      incline: "Наклон (%)",
      calories: "Цель калорий",
      tempo: "Темп",
      speedKmh: "Скорость (км/ч)",
      speedMph: "Скорость (mph)",
      distanceMeters: "Дистанция (м)",
      distanceMiles: "Дистанция (мили)",
      effort: "Работа",
      pause: "Отдых",
    },
    advSets: "Разные подходы",
    notes: "Заметки",
    session: "Тренировка",
    setN: (n) => `Подход ${n}`,
    generatedWith: (host) => `Создано в Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("ru-RU"),
    fileProgram: "программа",
    fileClient: "клиент",
    totalTime: "Оценка общего времени",
    perWeek: "x/нед",
    continued: " (прод.)",
  },
  ar: {
    langName: "AR",
    sections: { warmup: "إحماء", main: "التمرين الرئيسي", bonus: "إضافة", cooldown: "تهدئة" },
    labels: {
      sets: "المجموعات",
      reps: "التكرارات",
      rest: "الراحة",
      duration: "المدة",
      loadKg: "الوزن (كغ)",
      loadLbs: "الوزن (lbs)",
      intensity: "الشدة",
      watts: "واط",
      incline: "الميل (%)",
      calories: "هدف السعرات",
      tempo: "الإيقاع",
      speedKmh: "السرعة (كم/س)",
      speedMph: "السرعة (mph)",
      distanceMeters: "المسافة (م)",
      distanceMiles: "المسافة (miles)",
      effort: "الجهد",
      pause: "الراحة",
    },
    advSets: "مجموعات متغيرة",
    notes: "ملاحظات",
    session: "حصة",
    setN: (n) => `مجموعة ${n}`,
    generatedWith: (host) => `تم الإنشاء عبر Boost Your Life • ${host}`,
    date: (d) => d.toLocaleDateString("ar-EG"),
    fileProgram: "برنامج",
    fileClient: "عميل",
    totalTime: "الوقت الإجمالي التقديري",
    perWeek: "×/أسبوع",
    continued: " (متابعة)",
  },
};

/* ---------------- Firestore read ---------------- */
async function readProgramme(programId) {
  if (!programId) return null;
  const p = doc(db, "programmes", programId);
  const snap = await getDoc(p);
  if (snap.exists()) return { id: programId, data: snap.data(), ref: p };
  return null;
}

/* ---------------- Logos ---------------- */
const LEGACY_BYL_LOCAL = "/logo-byl.png";

/* ---------------- Programme name ---------------- */
const GOAL_LABEL_BY_KEY = {
  prise_de_masse: "autoQ.goals.massGain",
  perte_de_poids: "autoQ.goals.weightLoss",
  force: "autoQ.goals.strength",
  endurance: "autoQ.goals.endurance",
  remise_au_sport: "autoQ.goals.returnToSport",
  postural: "autoQ.goals.posture",
};
const KNOWN_GOAL_KEYS = new Set(Object.keys(GOAL_LABEL_BY_KEY));

const humanizeKey = (s = "") =>
  String(s)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();

const extractBeforeDash = (nomProgramme = "") => {
  const s = String(nomProgramme || "");
  if (!s) return "";
  return (s.split("—")[0] || "").trim();
};

const extractObjectifKeyFromNomProgrammeSmart = (nomProgramme = "", t) => {
  const before = extractBeforeDash(nomProgramme);
  if (!before) return "";

  const maybeKey = before.trim();
  if (KNOWN_GOAL_KEYS.has(maybeKey)) return maybeKey;

  const beforeN = norm(before);

  for (const key of KNOWN_GOAL_KEYS) {
    const i18nKey = GOAL_LABEL_BY_KEY[key];
    const translated = i18nKey ? t(i18nKey) : "";
    const candidates = [translated, humanizeKey(key), key].filter(Boolean);
    if (candidates.some((c) => norm(c) === beforeN)) return key;
  }

  return "";
};

const extractNbSeancesFromNomProgramme = (nomProgramme = "") => {
  const s = String(nomProgramme || "");
  if (!s) return null;
  const m = s.match(/(?:—\s*)?(\d+)\s*x\s*\/?\s*(?:sem|semaine|week)/i);
  if (m && m[1]) return Number(m[1]);
  return null;
};

const normalizeForFilename = (s = "") =>
  norm(String(s || ""))
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const getObjectifUIFromProg = (prog) => {
  const candidates = [
    prog?.objectifUI,
    prog?.options?.objectifUI,
    prog?.options?.objectif_ui,
    prog?.questionnaire?.objectifUI,
    prog?.questionnaire?.objectif_ui,
    prog?.prefs?.objectifUI,
    prog?.prefs?.objectif_ui,
    prog?.pendingPrefs?.objectifUI,
    prog?.pendingPrefs?.objectif_ui,
    prog?.meta?.objectifUI,
    prog?.meta?.objectif_ui,
  ];
  const v = candidates.find((x) => typeof x === "string" && x.trim());
  return v ? String(v).trim() : "";
};

const getNbSeancesUIFromProg = (prog) => {
  const candidates = [
    prog?.nbSeancesUI,
    prog?.options?.nbSeances,
    prog?.questionnaire?.nbSeances,
    prog?.prefs?.nbSeances,
    prog?.pendingPrefs?.nbSeances,
    prog?.meta?.nbSeances,
  ];
  const v = candidates.find((x) => x !== undefined && x !== null && x !== "");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* =========================
   Suivi auto
   ========================= */
const readAutoFollowFlag = (prog) => {
  const cands = [
    prog?.auto_suivi,
    prog?.autoSuivi,
    prog?.auto_progression,
    prog?.autoProgression,
    prog?.suivi_auto,
    prog?.suiviAuto,
    prog?.progression_auto,
    prog?.progressionAuto,
    prog?.options?.auto_suivi,
    prog?.options?.autoSuivi,
    prog?.options?.auto_progression,
    prog?.options?.autoProgression,
    prog?.options?.suivi_auto,
    prog?.options?.suiviAuto,
    prog?.questionnaire?.auto_suivi,
    prog?.meta?.auto_suivi,
  ];
  const v = cands.find((x) => x === true || x === false);
  return v === true;
};

/* =========================
   Media block
   ========================= */
function MediaThumb({ media, active, onClick }) {
  const border = useColorModeValue("gray.200", "gray.700");
  const activeBorder = useColorModeValue("blue.400", "blue.300");
  const thumbBg = useColorModeValue("white", "gray.900");

  return (
    <Box
      onClick={onClick}
      cursor="pointer"
      borderRadius="lg"
      overflow="hidden"
      border="2px solid"
      borderColor={active ? activeBorder : border}
      w={{ base: "74px", md: "84px" }}
      h={{ base: "74px", md: "84px" }}
      flexShrink={0}
      bg={media.type === "video" ? "black" : thumbBg}
      position="relative"
      transition="all .2s ease"
      _hover={{ transform: "translateY(-1px)" }}
    >
      {media.type === "video" ? (
        <>
          <Box
            as="video"
            src={media.url}
            muted
            playsInline
            preload="metadata"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
          <Flex
            position="absolute"
            inset="0"
            align="center"
            justify="center"
            bg="blackAlpha.300"
            pointerEvents="none"
          >
            <Box
              w="28px"
              h="28px"
              borderRadius="full"
              bg="whiteAlpha.900"
              display="flex"
              alignItems="center"
              justifyContent="center"
              color="black"
              fontSize="10px"
              fontWeight="700"
            >
              ▶
            </Box>
          </Flex>
        </>
      ) : (
        <ChakraImage
          src={media.url}
          alt={media.key || "thumb"}
          w="100%"
          h="100%"
          objectFit="contain"
          bg={thumbBg}
          loading="eager"
          decoding="async"
        />
      )}
    </Box>
  );
}

function GifLikeLoopVideo({ src }) {
  const ref = useRef(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;

    const handleTimeUpdate = () => {
      if (video.currentTime >= 10) {
        video.currentTime = 0;
        const p = video.play();
        if (p?.catch) p.catch(() => {});
      }
    };

    const handleEnded = () => {
      video.currentTime = 0;
      const p = video.play();
      if (p?.catch) p.catch(() => {});
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("ended", handleEnded);

    video.currentTime = 0;
    const p = video.play();
    if (p?.catch) p.catch(() => {});

    return () => {
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("ended", handleEnded);
    };
  }, [src]);

  return (
    <Box
      as="video"
      ref={ref}
      src={src}
      muted
      playsInline
      autoPlay
      preload="auto"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

function ExerciseMediaPanel({ exercise, preferredSex, mini = false }) {
  const mediaItems = useMemo(() => extractExerciseMedia(exercise, preferredSex), [exercise, preferredSex]);
  const displayItems = mediaItems;

  const border = useColorModeValue("gray.200", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  const mediaBg = useColorModeValue("gray.50", "gray.900");

  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [exercise?.id, exercise?.nom, exercise?.name, preferredSex]);

  useEffect(() => {
    if (!displayItems.length) return;

    const selected = displayItems[selectedIndex] || displayItems[0];
    if (selected?.type === "image" && selected?.url) preloadImage(selected.url);
    if (selected?.type === "video" && selected?.url) preloadVideo(selected.url);

    displayItems.slice(0, Math.min(displayItems.length, 3)).forEach((item) => {
      if (item?.type === "image" && item?.url) preloadImage(item.url);
      if (item?.type === "video" && item?.url) preloadVideo(item.url);
    });
  }, [displayItems, selectedIndex]);

  if (!exercise || !displayItems.length) return null;

  const selected = displayItems[selectedIndex] || displayItems[0];
  const selectedType = selected?.type || "image";

  const panelHeight = mini
    ? { base: "160px", md: "180px" }
    : selectedType === "video"
      ? { base: "280px", sm: "340px", md: "420px", lg: "500px" }
      : { base: "320px", sm: "400px", md: "500px", lg: "620px" };

  if (mini) {
    return (
      <Box
        w="100%"
        h={panelHeight}
        borderRadius="lg"
        overflow="hidden"
        border="2px solid"
        borderColor={border}
        bg={selectedType === "video" ? "black" : mediaBg}
        display="flex"
        alignItems="center"
        justifyContent="center"
        mb={3}
        position="relative"
        _hover={{
          borderColor: "blue.300",
          transform: "scale(1.02)",
          transition: "all 0.2s ease-in-out"
        }}
        transition="all 0.2s ease-in-out"
      >
        {selected?.type === "video" ? (
          <GifLikeLoopVideo src={selected.url} />
        ) : selected?.url ? (
          <ChakraImage
            src={selected.url}
            alt={exercise?.nom || exercise?.name || "exercise media"}
            w="100%"
            h="100%"
            objectFit="contain"
            bg={mediaBg}
            borderRadius="md"
            loading="eager"
            decoding="async"
            fetchpriority="high"
          />
        ) : null}
      </Box>
    );
  }

  return (
    <Box
      bg={cardBg}
      border="1px solid"
      borderColor={border}
      borderRadius="2xl"
      p={{ base: 3, md: 4 }}
      boxShadow="xl"
      mb={5}
      w="full"
      minW={0}
    >
      <VStack align="stretch" spacing={3}>
        <Heading size="sm">Démonstration</Heading>

        <Box
          w="full"
          h={panelHeight}
          borderRadius="xl"
          overflow="hidden"
          border="1px solid"
          borderColor={border}
          bg={selectedType === "video" ? "black" : mediaBg}
          display="flex"
          alignItems="center"
          justifyContent="center"
        >
          {selected?.type === "video" ? (
            <GifLikeLoopVideo src={selected.url} />
          ) : selected?.url ? (
            <ChakraImage
              src={selected.url}
              alt={exercise?.nom || exercise?.name || "exercise media"}
              w="100%"
              h="100%"
              objectFit="contain"
              bg={mediaBg}
              borderRadius="lg"
              loading="eager"
              decoding="async"
              fetchpriority="high"
            />
          ) : null}
        </Box>

        {displayItems.length > 1 && (
          <Box overflowX="auto" pb={1}>
            <HStack spacing={2}>
              {displayItems.map((media, idx) => (
                <MediaThumb
                  key={media.id || `${media.type}-${idx}`}
                  media={media}
                  active={idx === selectedIndex}
                  onClick={() => setSelectedIndex(idx)}
                />
              ))}
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
}

function ExerciseDetailsContent({ selExo, preferredSex, t }) {
  if (!selExo) {
    return <Text>Chargement...</Text>;
  }

  return (
    <Box>
      <ExerciseMediaPanel exercise={selExo} preferredSex={preferredSex} />

      <Grid templateColumns={{ base: "24px 1fr", md: "30px 1fr" }} gap={2} mb={3}>
        {[
          {
            keys: ["groupe_musculaire", "groupeMusculaire", "muscle_group"],
            label: "Groupe musculaire",
            icon: MdFitnessCenter,
          },
          {
            keys: ["muscles_secondaires", "musclesSecondaires", "secondary_muscles"],
            label: "Muscles secondaires",
            icon: MdFitnessCenter,
          },
          {
            keys: ["articulations_sollicitees", "articulations_solicitees", "articulationsSolicitees", "joints"],
            label: "Articulations sollicitées",
            icon: MdOutlineAccessibilityNew,
          },
          {
            keys: [
              "tendons_sollicites",
              "tendons_solicites",
              "tendons_sollicitees",
              "tendons_solicitees",
              "ligaments_sollicites",
              "ligaments_solicites",
              "ligaments_sollicitees",
              "ligaments_solicitees",
              "tendons",
              "ligaments",
            ],
            label: "Ligaments sollicités",
            icon: MdOutlineAccessibilityNew,
          },
        ].map(({ keys, label, icon }, i) => {
          const raw = pickFirst(selExo, keys);
          const arr = safeArray(raw).filter(Boolean).map((x) => String(x).trim()).filter(Boolean);
          return (
            <React.Fragment key={i}>
              <GridItem>
                <Icon as={icon} boxSize={5} />
              </GridItem>
              <GridItem>
                <Text as="span" fontWeight="bold">
                  {label} :
                </Text>{" "}
                {arr.length ? arr.join(", ") : "—"}
              </GridItem>
            </React.Fragment>
          );
        })}
      </Grid>

      <Divider my={2} />

      <Box mt={3}>
        <HStack>
          <MdOutlineMenuBook />
          <Text as="span" fontWeight="bold">
            {t("exercise.instructions", "Consignes d'exécution :")}
          </Text>
        </HStack>

        <Box mt={2}>
          {selExo?.consignes && typeof selExo.consignes === "object" && !Array.isArray(selExo.consignes) ? (
            Object.entries(selExo.consignes).map(([key, value], i) => (
              <HStack key={i} align="start" mb={1}>
                <MdCheckCircle color="green" />
                <Text>
                  <b>{key}</b>
                  {": "}
                  {Array.isArray(value) ? value.join(" / ") : String(value)}
                </Text>
              </HStack>
            ))
          ) : Array.isArray(selExo?.consignes) ? (
            selExo.consignes.map((c, i) => (
              <HStack key={i} align="start" mb={1}>
                <MdCheckCircle color="green" />
                <Text>{String(c)}</Text>
              </HStack>
            ))
          ) : selExo?.consignes ? (
            <HStack align="start" mb={1}>
              <MdCheckCircle color="green" />
              <Text>{String(selExo.consignes)}</Text>
            </HStack>
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

export default function AutoProgramPreview() {
  const params = useParams();
  const programId = params.programId || params.id || params.programmeId;

  const { user } = useAuth();
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const toast = useToast();

  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [prog, setProg] = useState(null);
  const [progRef, setProgRef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);

  const [selExo, setSelExo] = useState(null);
  const [originalName, setOriginalName] = useState("");
  const [replaceMode, setReplaceMode] = useState(false);
  const [selVariant, setSelVariant] = useState("");
  const detailsDlg = useDisclosure();

  const [coachPdfName, setCoachPdfName] = useState("");

  const supportedPdfLangs = useMemo(() => Object.keys(PDF_I18N), []);
  const [pdfLang, setPdfLang] = useState(() => {
    const raw = String(i18n.language || "fr").toLowerCase();
    const short = raw.split("-")[0];
    return supportedPdfLangs.includes(short) ? short : "fr";
  });

  const pdfRef = useRef();
  const exerciseMediaCacheRef = useRef(new Map());

  const [resolvedExerciseMap, setResolvedExerciseMap] = useState({});
  const [pdfExerciseImageMap, setPdfExerciseImageMap] = useState({});

  const [headerLogo, setHeaderLogo] = useState(null);
  const [footerLogo, setFooterLogo] = useState(null);

  const Llbl = PDF_I18N;
  const L = Llbl[pdfLang] || Llbl.fr;

  const locale = useMemo(() => getLocaleFromLang(i18n.language || pdfLang || "fr"), [i18n.language, pdfLang]);
  const pdfLocale = useMemo(() => getLocaleFromLang(pdfLang), [pdfLang]);

  const canEdit = user?.role === "coach" || user?.role === "admin";
  const viewerIsCoach = user?.role === "coach" || user?.role === "admin";

  const [autoFollow, setAutoFollow] = useState(false);
  const [savingAutoFollow, setSavingAutoFollow] = useState(false);

  const bg = useColorModeValue("gray.50", "gray.800");
  const surface = useColorModeValue("white", "gray.700");
  const cardBg = surface;
  const cardBorder = useColorModeValue("1px solid #e3e7ef", "1.5px solid #233055");
  const subText = useColorModeValue("gray.600", "gray.300");
  const sectionIconColor = useColorModeValue("blue.700", "blue.200");

  useEffect(() => {
    let unsub;
    (async () => {
      setLoading(true);
      const hit = await readProgramme(programId);
      if (!hit) {
        setProg(null);
        setProgRef(null);
        setLoading(false);
        return;
      }
      setProgRef(hit.ref);
      unsub = onSnapshot(
        hit.ref,
        (snap) => {
          setProg(snap.exists() ? { id: hit.id, ...snap.data() } : null);
          setLoading(false);
        },
        () => setLoading(false)
      );
    })();
    return () => unsub && unsub();
  }, [programId]);

  const sessions = useMemo(() => (Array.isArray(prog?.sessions) ? prog.sessions : []), [prog]);
  const displayUnits = useMemo(() => readDisplayUnits(prog || {}), [prog]);

  const preferredSex = useMemo(
    () => inferSexPreference(user, prog, null, location.state),
    [user, prog, location.state]
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const allExercises = (sessions || []).flatMap((sess) =>
        Object.values(asSections(sess)).flatMap((arr) => arr || [])
      );

      if (!allExercises.length) {
        setResolvedExerciseMap({});
        return;
      }

      const tasks = allExercises.map(async (exercise, idx) => {
        const cacheKey = getExerciseCacheKey(exercise, `fallback-${idx}`);
        if (!cacheKey) return null;

        const currentMedia = extractExerciseMedia(exercise, preferredSex);
        if (currentMedia.length > 0) {
          return [cacheKey, exercise];
        }

        if (exerciseMediaCacheRef.current.has(cacheKey)) {
          const cached = exerciseMediaCacheRef.current.get(cacheKey);
          return [
            cacheKey,
            {
              ...exercise,
              ...cached,
              media: cached?.media || exercise?.media,
            },
          ];
        }

        try {
          const source = await findExerciseDocFromFirestore(exercise);
          if (source) {
            exerciseMediaCacheRef.current.set(cacheKey, source);
            return [
              cacheKey,
              {
                ...exercise,
                ...source,
                media: source?.media || exercise?.media,
              },
            ];
          }
          return [cacheKey, exercise];
        } catch {
          return [cacheKey, exercise];
        }
      });

      const entries = await Promise.all(tasks);
      if (cancelled) return;

      const nextMap = {};
      entries.filter(Boolean).forEach(([key, value]) => {
        nextMap[key] = value;
      });

      setResolvedExerciseMap(nextMap);
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [sessions, preferredSex]);

  useEffect(() => {
    const currentSession = sessions?.[tabIndex];
    if (!currentSession) return;

    const exercises = Object.values(asSections(currentSession)).flatMap((arr) => arr || []);
    exercises.slice(0, 8).forEach((exercise, idx) => {
      const resolved = resolvedExerciseMap[getExerciseCacheKey(exercise, `visible-${idx}`)] || exercise;
      const media = extractExerciseMedia(resolved, preferredSex);
      media.slice(0, 3).forEach((m) => {
        if (m?.type === "image" && m?.url) preloadImage(m.url);
        if (m?.type === "video" && m?.url) preloadVideo(m.url);
      });
    });
  }, [sessions, tabIndex, resolvedExerciseMap, preferredSex]);

  const customProgramName = useMemo(() => {
    const raw =
      (prog?.nomProgramme ??
        prog?.nom_programme ??
        prog?.programmeName ??
        prog?.programName ??
        prog?.title ??
        prog?.name ??
        "") + "";
    return String(raw || "").trim();
  }, [prog]);

  const programmeNameRaw =
    customProgramName || prog?.nom || prog?.name || prog?.title || t("autoPreview.generated", "Programme");

  const objectifKeyFromName = useMemo(() => {
    return extractObjectifKeyFromNomProgrammeSmart(programmeNameRaw, t) || "";
  }, [programmeNameRaw, t]);

  const isAutoProgram = (() => {
    const s = (v) => String(v || "").toLowerCase();
    return s(prog?.origine) === "auto" || s(prog?.createdBy) === "auto-cron" || s(prog?.generatedBy) === "auto";
  })();

  const objectifUIFromNav = useMemo(() => {
    const fromState = location?.state?.objectifUI || location?.state?.objectif;
    const fromQuery = searchParams.get("objectifUI") || searchParams.get("objectif");
    return (fromState || fromQuery || "").toString().trim();
  }, [location?.state, searchParams]);

  const nbSeancesFromNav = useMemo(() => {
    const fromState = location?.state?.nbSeances;
    const fromQuery = searchParams.get("nbSeances") || searchParams.get("frequence");
    const v = fromState ?? fromQuery;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [location?.state, searchParams]);

  const objectifKeyDisplay = useMemo(() => {
    const directNav = (objectifUIFromNav || "").trim();
    if (directNav) return directNav;

    const ui = getObjectifUIFromProg(prog);
    if (ui) return ui;

    if (objectifKeyFromName) return objectifKeyFromName;

    const fromField = (prog?.objectif && String(prog.objectif).trim()) || "";
    return fromField || "";
  }, [objectifUIFromNav, prog, objectifKeyFromName]);

  const objectifLabelDisplay = useMemo(() => {
    if (!objectifKeyDisplay) return "";
    const i18nKey = GOAL_LABEL_BY_KEY[objectifKeyDisplay];
    const translated = i18nKey ? t(i18nKey) : null;
    if (translated && translated !== i18nKey) return translated;
    return humanizeKey(objectifKeyDisplay);
  }, [objectifKeyDisplay, t]);

  const nbSeances = useMemo(() => {
    if (Array.isArray(sessions) && sessions.length > 0) return sessions.length;
    if (nbSeancesFromNav) return nbSeancesFromNav;

    const ui = getNbSeancesUIFromProg(prog);
    if (ui) return ui;

    const direct =
      prog?.nbSeances ??
      prog?.frequence ??
      prog?.frequency ??
      prog?.nb_sessions ??
      prog?.sessionsPerWeek;

    const asNum = Number(direct);
    if (Number.isFinite(asNum) && asNum > 0) return asNum;

    const parsed = extractNbSeancesFromNomProgramme(programmeNameRaw);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;

    return null;
  }, [prog, programmeNameRaw, sessions, nbSeancesFromNav]);

  const programmeTitleDisplay = useMemo(() => {
    const custom = (customProgramName || "").trim();
    if (custom) return custom;

    const perWeek = (Llbl[pdfLang] || Llbl.fr).perWeek || "x/Sem";
    const base = objectifLabelDisplay || t("autoPreview.generated", "Programme");
    return nbSeances ? `${base} — ${nbSeances}${perWeek}` : base;
  }, [customProgramName, objectifLabelDisplay, nbSeances, pdfLang, Llbl, t]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (viewerIsCoach) {
        const me =
          getPrettyUserName(user) ||
          (user?.displayName && !/@/.test(user.displayName) ? user.displayName : "");
        if (alive) setCoachPdfName(me || "");
        return;
      }

      const direct =
        (prog?.createdByName || "").toString().trim() ||
        (prog?.coachName || "").toString().trim() ||
        (prog?.ownerName || "").toString().trim();

      if (direct) {
        if (alive) setCoachPdfName(direct);
        return;
      }

      const createdBy =
        prog?.createdBy ||
        prog?.createdByUid ||
        prog?.coachUid ||
        prog?.ownerUid ||
        prog?.authorUid ||
        prog?.uidCoach;

      const resolved = await resolveCoachNameFromCreatedBy(createdBy);
      if (alive) setCoachPdfName(resolved || "");
    })();

    return () => {
      alive = false;
    };
  }, [prog, user, viewerIsCoach]);

  useEffect(() => {
    if (!prog) return;
    setAutoFollow(readAutoFollowFlag(prog));
  }, [prog]);

  const persistAutoFollow = async (nextVal) => {
    if (!progRef) return;
    setSavingAutoFollow(true);
    try {
      await updateDoc(progRef, {
        auto_suivi: !!nextVal,
        options: { ...(prog?.options || {}), auto_suivi: !!nextVal },
      });
      toast({
        title: nextVal
          ? t("autoPreview.autoFollowOn", "Suivi automatique activé")
          : t("autoPreview.autoFollowOff", "Suivi automatique désactivé"),
        status: "success",
        duration: 1800,
      });
    } catch (e) {
      console.error(e);
      toast({ title: t("settings.toasts.update_error", "Erreur de mise à jour."), status: "error" });
      setAutoFollow(readAutoFollowFlag(prog));
    } finally {
      setSavingAutoFollow(false);
    }
  };

  useEffect(() => {
    (async () => {
      const byl = await anyImageSourceToDataUrl(LEGACY_BYL_LOCAL);
      const logo = byl || LEGACY_BYL_LOCAL;
      setFooterLogo(logo);
      setHeaderLogo(logo);
    })();
  }, []);

  const resolveExerciseForDisplay = (exercise, fallback = "") => {
    const cacheKey = getExerciseCacheKey(exercise, fallback);
    if (!cacheKey) return exercise;
    return resolvedExerciseMap[cacheKey] || exercise;
  };

  const preloadPdfImagesForAllSessions = async () => {
    const allExercises = (sessions || []).flatMap((sess) =>
      Object.values(asSections(sess)).flatMap((arr) => arr || [])
    );

    const entries = await Promise.all(
      allExercises.map(async (ex, idx) => {
        const resolved = resolveExerciseForDisplay(ex, `pdf-${idx}`);
        const cacheKey = getExerciseCacheKey(resolved, `pdf-${idx}`);

        if (!cacheKey) return null;

        const rawCandidates = getExerciseImageUrls(resolved, preferredSex);
        const resolvedCandidates = await resolveImageCandidatesToUrls(rawCandidates);
        const allCandidates = uniqStrings([...rawCandidates, ...resolvedCandidates]);

        const candidateResults = await Promise.all(
          allCandidates.map(async (candidate) => {
            const dataUrl = await anyImageSourceToDataUrl(candidate);
            return {
              dataUrl: dataUrl || null,
              finalUrl: candidate,
            };
          })
        );

        const images = [];
        const seen = new Set();

        candidateResults.forEach((item) => {
          const dedupeKey = item.dataUrl || item.finalUrl;
          if (!dedupeKey || seen.has(dedupeKey)) return;
          seen.add(dedupeKey);
          images.push(item);
        });

        return [
          cacheKey,
          {
            images,
            hasImages: images.length > 0,
          },
        ];
      })
    );

    const nextImageMap = {};
    entries.filter(Boolean).forEach(([key, value]) => {
      nextImageMap[key] = value;
    });

    setPdfExerciseImageMap(nextImageMap);
    return nextImageMap;
  };

  const openDetails = async (ex, replace = false) => {
    setReplaceMode(replace);
    setSelVariant("");
    setOriginalName(ex?.nom || ex?.name || "");
    setSelExo(resolveExerciseForDisplay(ex, "modal"));
    detailsDlg.onOpen();
  };

  const stripUndefined = (v) => {
    if (Array.isArray(v)) return v.map(stripUndefined);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) {
        if (val !== undefined) out[k] = stripUndefined(val);
      }
      return out;
    }
    return v;
  };

  const doReplacePersist = async (newName) => {
    if (!newName || !progRef || !prog) return;

    try {
      const replacementSource = await findExerciseVariantDoc(newName, selExo);
      if (!replacementSource) {
        toast({
          title: t("autoPreview.variantNotFound", "Variante introuvable"),
          status: "warning",
          duration: 2200,
        });
        return;
      }

      const keys = ["echauffement", "corps", "bonus", "retourCalme", "exercises"];

      const nextSessions = (sessions ?? []).map((s) => {
        const block = { ...s };

        for (const k of keys) {
          if (!Array.isArray(block[k])) continue;

          block[k] = block[k].map((ex) => {
            const exName = ex?.nom || ex?.name || "";
            const isTarget = exName === originalName;

            if (!isTarget) return ex;

            return buildReplacementExercise(ex, replacementSource);
          });
        }

        return block;
      });

      const cleaned = stripUndefined(nextSessions);
      await updateDoc(progRef, { sessions: cleaned });

      const nextResolved = { ...resolvedExerciseMap };
      const oldCacheKey = getExerciseCacheKey(selExo, "modal-old");
      const newResolvedEx = buildReplacementExercise(selExo || {}, replacementSource);
      const newCacheKey = getExerciseCacheKey(newResolvedEx, `replaced-${Date.now()}`);

      if (oldCacheKey) nextResolved[oldCacheKey] = newResolvedEx;
      if (newCacheKey) nextResolved[newCacheKey] = newResolvedEx;
      setResolvedExerciseMap(nextResolved);

      exerciseMediaCacheRef.current.set(
        getExerciseCacheKey(newResolvedEx, newName),
        replacementSource
      );

      setSelExo(newResolvedEx);
      setOriginalName(newResolvedEx?.nom || newResolvedEx?.name || newName);
      setSelVariant("");
      detailsDlg.onClose();

      toast({
        title: `${t("autoPreview.replace", "Remplacer")} OK`,
        status: "success",
        duration: 2200,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: t("settings.toasts.update_error", "Erreur de mise à jour."),
        status: "error",
      });
    }
  };

  const getPdfImagesForExercise = (exercise, fallback = "") => {
    const cacheKey = getExerciseCacheKey(exercise, fallback);
    if (!cacheKey) return { images: [], hasImages: false };
    return pdfExerciseImageMap[cacheKey] || { images: [], hasImages: false };
  };

  const renderPdfPages = () => {
    const palette = {
      primary: "#193b8a",
      ink: "#172033",
      sub: "#5a6b87",
      line: "#dfe7ff",
      cardBorder: "#e9edfa",
      mediaBg: "#f8fafc",
    };

    const Header = ({ sessionIdx, showSessionTitle }) => {
      const leftLabel = viewerIsCoach
        ? getPrettyUserName(user) ||
          (user?.displayName && !/@/.test(user.displayName) ? user.displayName : "") ||
          "BYL"
        : (coachPdfName || "").trim() || "BYL";

      const sessionTitle = getSessionDisplayName(sessions?.[sessionIdx] || {}, sessionIdx, L);

      return (
        <Flex
          align="center"
          justify="space-between"
          px={30}
          py={8}
          minH="74px"
          style={{ borderBottom: `2px solid ${palette.primary}`, background: "#fff" }}
        >
          <HStack spacing={12} style={{ width: 260 }}>
            {headerLogo ? (
              <img
                src={headerLogo}
                crossOrigin="anonymous"
                alt="logo"
                style={{ height: 36, width: 36, objectFit: "contain", borderRadius: 8 }}
              />
            ) : (
              <Box w="36px" h="36px" borderRadius="8px" bg="#e6ecff" />
            )}
            <Text style={{ fontSize: 14.5, fontWeight: 800, color: palette.primary, whiteSpace: "nowrap" }}>
              {leftLabel}
            </Text>
          </HStack>

          <Box style={{ textAlign: "center", flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: 900, color: palette.ink, letterSpacing: ".3px" }}>
              {programmeTitleDisplay}
            </Text>
            {showSessionTitle && (
              <Text style={{ fontSize: 12.5, color: palette.sub, marginTop: 2 }}>{sessionTitle}</Text>
            )}
          </Box>

          <HStack spacing={12} style={{ width: 240, justifyContent: "flex-end" }}>
            <Text style={{ fontSize: 12.2, color: "#999", whiteSpace: "nowrap" }}>{L.date(new Date())}</Text>
          </HStack>
        </Flex>
      );
    };

    const DurationLine = ({ sessionIdx }) => (
      <Box style={{ position: "absolute", top: 82, right: 30, fontSize: 12.5, color: "#4b5b77" }}>
        <Box as="span" mr={2} style={{ display: "inline-block", transform: "translateY(1px)" }}>
          <MdOutlineAccessTime />
        </Box>
        {totalTime(sessions[sessionIdx])}
      </Box>
    );

    const Footer = () => (
      <Flex
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        align="center"
        justify="center"
        fontSize="12.5px"
        color="#8a8a8a"
        borderTop={`1px solid ${palette.line}`}
        py={6}
      >
        {footerLogo && (
          <img
            src={footerLogo}
            crossOrigin="anonymous"
            alt="BYL"
            style={{ height: 22, width: 22, objectFit: "contain", borderRadius: 6, marginRight: 10 }}
          />
        )}
        {L.generatedWith(window.location.hostname)}
      </Flex>
    );

    const AdvSetsMiniTable = ({ sets }) => (
      <Box mt={10}>
        <Tag size="sm" colorScheme="purple" mb={6}>
          {L.advSets}
        </Tag>
        <Table size="sm" variant="simple" width="100%">
          <Thead>
            <Tr>
              <Th>#</Th>
              <Th>{L.labels.reps}</Th>
              <Th>{displayUnits.weight === "lbs" ? L.labels.loadLbs : L.labels.loadKg}</Th>
              <Th>{L.labels.rest}</Th>
              <Th>{L.labels.duration}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {sets.map((s, i) => (
              <Tr key={i}>
                <Td>{L.setN(i + 1)}</Td>
                <Td>{formatDisplayNumber(s.reps ?? 0, pdfLocale)}</Td>
                <Td>
                  {formatDisplayNumber(
                    convertWeight(s.chargeValue ?? 0, displayUnits.weight, s.chargeUnit || "kg"),
                    pdfLocale
                  )}
                </Td>
                <Td>{fmtSec(s.restSec ?? 0)}</Td>
                <Td>{fmtSec(s.durationSec ?? 0)}</Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>
    );

    const PdfImageGrid = ({ images = [] }) => {
      if (!images.length) return null;

      return (
        <Box mb="12px">
          <Box
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              justifyItems: "center",
              gap: "10px",
            }}
          >
            {images.map((img, idx) => (
              <Box
                key={`pdf-img-${idx}`}
                style={{
                  width: "100%",
                  height: 180,
                  borderRadius: 12,
                  overflow: "hidden",
                  border: `1px solid ${palette.cardBorder}`,
                  background: palette.mediaBg,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px",
                }}
              >
                <img
                  src={img.dataUrl || img.finalUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </Box>
            ))}
          </Box>
        </Box>
      );
    };

    const PdfCard = ({ ex, index, pdfImages }) => {
      const images = Array.isArray(pdfImages?.images) ? pdfImages.images : [];

      const infos = buildInfosFromExercise(ex, displayUnits, pdfLocale, L);
      const adv = getAdvancedSets(ex);
      const showNotes =
        pickFirst(ex, ["notesEnabled"]) === true &&
        String(pickFirst(ex, ["notes"]) || "").trim() !== "";

      const exName = pickFirst(ex, ["nom", "name"]) || "";

      return (
        <Box
          border={`1px solid ${palette.cardBorder}`}
          bg="#fff"
          borderRadius="14px"
          p="14px"
          w="100%"
          style={{ breakInside: "avoid", pageBreakInside: "avoid" }}
        >
          <PdfImageGrid images={images} />

          <Text style={{ fontWeight: 800, color: palette.primary, fontSize: 15.2, marginBottom: 6 }}>
            {`${index}. ${exName}`}
          </Text>

          <Box style={{ height: 1, background: palette.line, margin: "4px 0 8px 0" }} />

          <Box style={{ fontSize: 12.8, color: palette.ink, lineHeight: 1.6 }}>
            {infos.length > 0 ? (
              infos.map((it, i) => (
                <div key={i}>
                  <b>{it.label} :</b>{" "}
                  {it.key === "temps" || it.key === "repos" ? nbspUnits(String(it.value)) : String(it.value)}
                </div>
              ))
            ) : (
              <div>-</div>
            )}
          </Box>

          {adv.enabled && adv.sets.length > 0 && <AdvSetsMiniTable sets={adv.sets} />}

          {showNotes && (
            <Box
              mt={8}
              style={{
                border: `1px solid ${palette.cardBorder}`,
                background: "#f7f9ff",
                borderRadius: 10,
                padding: "10px 12px",
                color: "#2c3550",
              }}
            >
              <HStack spacing={8} align="center" style={{ marginBottom: 6 }}>
                <Box as={MdDescription} />
                <Text as="span" style={{ fontWeight: 700, fontSize: 12.5, color: "#1c2748" }}>
                  {L.notes}
                </Text>
              </HStack>
              <Text style={{ whiteSpace: "pre-wrap", fontSize: 12.2 }}>{pickFirst(ex, ["notes"])}</Text>
            </Box>
          )}
        </Box>
      );
    };

    const SectionTitle = ({ label, continued }) => (
      <HStack spacing={10} align="center" style={{ margin: "16px 0 10px 0" }}>
        <Box style={{ width: 8, height: 8, borderRadius: 3, background: "#193b8a" }} />
        <Text style={{ fontWeight: 900, color: "#193b8a", fontSize: 15.6 }}>
          {label}
          {continued ? L.continued : ""}
        </Text>
        <Box style={{ flex: 1, height: 1, background: "#dfe7ff" }} />
      </HStack>
    );

    const PageShell = ({ sessionIdx, firstPageForSession, blocks }) => (
      <Box
        className="a4page"
        width="794px"
        minH="1123px"
        bg="#fff"
        color="#181b22"
        fontFamily="'Inter','Montserrat', Arial, sans-serif"
        position="relative"
        style={{ breakAfter: "page", pageBreakAfter: "always" }}
      >
        <Header sessionIdx={sessionIdx} showSessionTitle={firstPageForSession} />
        <DurationLine sessionIdx={sessionIdx} />
        <Box style={{ padding: "0 30px", marginTop: firstPageForSession ? 30 : 14, paddingBottom: 36 }}>
          {blocks}
        </Box>
        <Footer />
      </Box>
    );

    const estimatePdfCardHeight = (ex, pdfImages) => {
      const images = Array.isArray(pdfImages?.images) ? pdfImages.images : [];
      let h = 120;

      if (images.length > 0) {
        const rows = Math.ceil(images.length / 2);
        const rowHeight = 180;
        h += rows * rowHeight;
        h += (rows - 1) * 10;
        h += 12;
      }

      const infos = buildInfosFromExercise(ex, displayUnits, pdfLocale, L);
      h += (infos.length > 0 ? infos.length : 3) * 18;

      const adv = getAdvancedSets(ex);
      if (adv.enabled && adv.sets.length) {
        const rows = adv.sets.length;
        h += 28 + (24 + rows * 22) + 8;
      }

      const notesEnabled = pickFirst(ex, ["notesEnabled"]) === true;
      const notes = String(pickFirst(ex, ["notes"]) || "");
      if (notesEnabled && notes.trim() !== "") {
        const lines = Math.ceil(notes.length / 48);
        h += 18 + lines * 16;
      }

      return h;
    };

    const pages = [];
    (sessions || []).forEach((sess, sIdx) => {
      const S = asSections(sess);
      let used = 0;
      let blocks = [];
      let onFirst = true;
      let runningIndex = 1;

      const flush = () => {
        pages.push(
          <PageShell
            key={`p-${sIdx}-${pages.length}`}
            sessionIdx={sIdx}
            firstPageForSession={onFirst}
            blocks={blocks}
          />
        );
        blocks = [];
        used = 0;
        onFirst = false;
      };

      const addList = (label, list) => {
        if (!list.length) return;

        let sectionTitleAdded = false;
        let i = 0;

        while (i < list.length) {
          const left = resolveExerciseForDisplay(list[i], `pdf-left-${sIdx}-${i}`);
          const right = list[i + 1] ? resolveExerciseForDisplay(list[i + 1], `pdf-right-${sIdx}-${i}`) : null;

          const leftImages = getPdfImagesForExercise(left, `pdf-left-${sIdx}-${i}`);
          const rightImages = right ? getPdfImagesForExercise(right, `pdf-right-${sIdx}-${i}`) : null;

          const leftH = estimatePdfCardHeight(left, leftImages);
          const rightH = right ? estimatePdfCardHeight(right, rightImages) : 0;
          const rowH = Math.max(leftH, rightH, 116) + 18;
          const titleH = 36;

          if (!sectionTitleAdded) {
            if (used + titleH + rowH > 1123 - 74 - 36 - 10 - 10 && used > 0) {
              flush();
              continue;
            }

            blocks.push(
              <SectionTitle key={`st-${label}-${sIdx}-${i}`} label={label} continued={!onFirst && i > 0} />
            );
            used += titleH;
            sectionTitleAdded = true;
          }

          if (used + rowH > 1123 - 74 - 36 - 10 - 10 && used > 0) {
            flush();
            sectionTitleAdded = false;
            continue;
          }

          blocks.push(
            <HStack key={`sec-${label}-${i}`} spacing={24} align="stretch" mb={4}>
              <Box flex="1">
                <PdfCard ex={left} index={runningIndex++} pdfImages={leftImages} />
              </Box>
              <Box flex="1">
                {right ? <PdfCard ex={right} index={runningIndex++} pdfImages={rightImages} /> : null}
              </Box>
            </HStack>
          );

          used += rowH;
          i += 2;
        }
      };

      addList(L.sections.warmup, S.echauffement || []);
      addList(L.sections.main, S.corps || []);
      addList(L.sections.bonus, S.bonus || []);
      addList(L.sections.cooldown, S.retourCalme || []);

      flush();
    });

    return (
      <Box
        id="auto-preview-pages"
        ref={pdfRef}
        position="absolute"
        left="-20000px"
        top="0"
        zIndex={-1}
        pointerEvents="none"
      >
        {pages}
      </Box>
    );
  };

  const handleDownloadPDF = async () => {
    try {
      await preloadPdfImagesForAllSessions();

      await nextFrame();
      await wait(60);

      const root = pdfRef.current;
      if (!root) return;

      await waitForImagesInNode(root);

      const nodes = root.querySelectorAll(".a4page");
      if (!nodes || nodes.length === 0) return;

      const pdf = new jsPDF({ unit: "pt", format: "a4" });

      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        await waitForImagesInNode(node);
        await wait(20);

        const canvas = await html2canvas(node, {
          scale: 1.45,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: false,
          imageTimeout: 12000,
          logging: false,
          removeContainer: true,
          foreignObjectRendering: false,
          windowWidth: node.scrollWidth,
          windowHeight: node.scrollHeight,
        });

        const img = canvas.toDataURL("image/jpeg", 0.9);
        if (i > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, 0, 595.28, 841.89, undefined, "FAST");
      }

      const base = normalizeForFilename(programmeTitleDisplay || L.fileProgram);
      pdf.save(`${base}-BYL-${pdfLang}.pdf`);
    } catch (e) {
      console.error(e);
      toast({
        title: t("autoPreview.pdfError", "Erreur lors de la génération du PDF"),
        status: "error",
        duration: 3000,
      });
    }
  };

  const goEdit = () => {
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    navigate(`/exercise-bank/program-builder/${realProgramId}`);
  };

  const goPlay = () => {
    if (!sessions?.length) return;
    const sIdx = Math.max(0, Math.min(tabIndex, sessions.length - 1));
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    navigate(`/programmes/${realProgramId}/session/${sIdx}/play`);
  };

  if (loading) {
    return (
      <Box textAlign="center" py={10} bg={bg} minH="100vh">
        <Spinner size="xl" />
      </Box>
    );
  }

  if (!prog) {
    return (
      <Box minH="100vh" bg={bg} p={6}>
        <Box bg={surface} p={6} rounded="xl" shadow="lg" maxW="5xl" mx="auto">
          <HStack mb={4}>
            <IconButton icon={<ArrowBackIcon />} aria-label="back" onClick={() => navigate(-1)} />
            <Heading size="md">{t("autoPreview.notFound", "Programme introuvable")}</Heading>
          </HStack>
          <Text opacity={0.8}>{t("autoPreview.notFoundHint", "Vérifie l’URL ou les droits d’accès.")}</Text>
        </Box>
      </Box>
    );
  }

  const Pill = ({ active, children, onClick }) => (
    <Button
      onClick={onClick}
      borderRadius="9999px"
      size="sm"
      px={4}
      h="34px"
      fontWeight={600}
      bg={active ? "#193b8a" : useColorModeValue("gray.100", "#233055")}
      color={active ? "white" : useColorModeValue("gray.800", "gray.100")}
      border={active ? "2px solid #193b8a" : "1px solid transparent"}
      _hover={{ bg: active ? "#193b8a" : useColorModeValue("gray.200", "#32406b") }}
      transition="all .15s"
    >
      {children}
    </Button>
  );

  const currentSession = sessions[tabIndex] || null;
  const currentSessionTitle = getSessionDisplayName(currentSession || {}, tabIndex, L);
  const showAutoFollowToggle = true;

  return (
    <Box minH="100vh" bg={bg} p={{ base: 3, md: 6 }}>
      <Box bg={surface} p={{ base: 4, md: 6 }} rounded="xl" shadow="lg" maxW="7xl" mx="auto">
        <TopBar
          programmeName={programmeTitleDisplay}
          onBack={() => navigate(-1)}
          onEdit={goEdit}
          onPlay={goPlay}
          onPdf={handleDownloadPDF}
          canEdit={canEdit}
          pdfLang={pdfLang}
          setPdfLang={setPdfLang}
          showAutoFollowToggle={showAutoFollowToggle}
          autoFollow={autoFollow}
          savingAutoFollow={savingAutoFollow}
          onToggleAutoFollow={(v) => {
            setAutoFollow(v);
            persistAutoFollow(v);
          }}
        />

        <HStack spacing={2} mb={4} wrap="wrap">
          {sessions.map((sess, i) => (
            <Pill key={i} active={i === tabIndex} onClick={() => setTabIndex(i)}>
              {getSessionDisplayName(sess || {}, i, L)}
            </Pill>
          ))}
        </HStack>

        {currentSession && (
          <HStack mb={3} color={useColorModeValue("gray.600", "gray.300")} wrap="wrap">
            <Box as={MdOutlineAccessTime} boxSize={5} />
            <Text fontSize="sm">
              {L.totalTime} :{" "}
              <Badge ml={2} colorScheme="blue">
                {totalTime(currentSession)}
              </Badge>
              <Badge ml={2} variant="subtle">
                {currentSessionTitle}
              </Badge>
            </Text>
          </HStack>
        )}

        {[
          { key: "echauffement", label: L.sections.warmup, icon: MdOutlineLocalFireDepartment },
          { key: "corps", label: L.sections.main, icon: MdFitnessCenter },
          { key: "bonus", label: L.sections.bonus, icon: MdFitnessCenter },
          { key: "retourCalme", label: L.sections.cooldown, icon: MdSelfImprovement },
        ].map(({ key, label, icon: IconComp }) => {
          const current = sessions[tabIndex] || {};
          const list = (current ? asSections(current)[key] : []) || [];
          if (!list.length) return null;

          return (
            <Box key={key} mt={6}>
              <HStack mb={3} spacing={3}>
                <Box as={IconComp} boxSize={6} color={sectionIconColor} />
                <Heading size="md">{label}</Heading>
              </HStack>

              <SimpleGrid columns={{ base: 1, md: 2, lg: 3, xl: 4 }} spacing={4}>
                {list.map((ex, idx) => {
                  const displayExercise = resolveExerciseForDisplay(ex, `${key}-${idx}`);
                  const nom = (pickFirst(displayExercise || ex, ["nom", "name"]) || "").toString();
                  const infos = buildInfosFromExercise(ex, displayUnits, locale, L);
                  const adv = getAdvancedSets(ex);

                  return (
                    <Box
                      key={`${nom}-${idx}`}
                      bg={cardBg}
                      border={cardBorder}
                      borderRadius="xl"
                      p={4}
                      boxShadow={useColorModeValue("sm", "md")}
                      transition="all .15s"
                      _hover={{ boxShadow: "lg", transform: "translateY(-2px)" }}
                      minH="280px"
                      display="flex"
                      flexDirection="column"
                    >
                      {displayExercise && (
                        <ExerciseMediaPanel exercise={displayExercise} preferredSex={preferredSex} mini={true} />
                      )}

                      <VStack align="stretch" spacing={2} flex="1">
                        <Text fontWeight="bold" fontSize="md" lineHeight="1.3">{`${idx + 1}. ${nom}`}</Text>

                        {infos.length ? (
                          <Box as="ul" pl={4} color={subText} flex="1">
                            {infos.map((it, i) => (
                              <li key={i}>
                                <Text as="span" fontSize="sm" lineHeight="1.4">
                                  <b>{it.label}</b>
                                  {` : `}
                                  {it.key === "temps" || it.key === "repos"
                                    ? nbspUnits(String(it.value))
                                    : String(it.value)}
                                </Text>
                              </li>
                            ))}
                          </Box>
                        ) : (
                          <Text color={subText} fontSize="sm" flex="1">
                            {t("autoPreview.noData", "Aucune donnée.")}
                          </Text>
                        )}

                        {adv.enabled && adv.sets.length > 0 && (
                          <Box>
                            <HStack mb={2} spacing={2}>
                              <Tag size="sm" colorScheme="purple">
                                {t("autoPreview.advancedSets", "Séries différentes")}
                              </Tag>
                            </HStack>
                            <Box overflowX="auto">
                              <Table size="sm" variant="simple" minW="520px">
                                <Thead>
                                  <Tr>
                                    <Th>#</Th>
                                    <Th>{L.labels.reps}</Th>
                                    <Th>{displayUnits.weight === "lbs" ? L.labels.loadLbs : L.labels.loadKg}</Th>
                                    <Th>{L.labels.rest}</Th>
                                    <Th>{L.labels.duration}</Th>
                                  </Tr>
                                </Thead>
                                <Tbody>
                                  {adv.sets.map((s, i) => (
                                    <Tr key={i}>
                                      <Td>{L.setN(i + 1)}</Td>
                                      <Td>{formatDisplayNumber(s.reps ?? 0, locale)}</Td>
                                      <Td>
                                        {formatDisplayNumber(
                                          convertWeight(s.chargeValue ?? 0, displayUnits.weight, s.chargeUnit || "kg"),
                                          locale
                                        )}
                                      </Td>
                                      <Td>{fmtSec(s.restSec ?? 0)}</Td>
                                      <Td>{fmtSec(s.durationSec ?? 0)}</Td>
                                    </Tr>
                                  ))}
                                </Tbody>
                              </Table>
                            </Box>
                          </Box>
                        )}
                      </VStack>

                      <HStack spacing={2} wrap="wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<InfoOutlineIcon />}
                          onClick={() => openDetails(ex, false)}
                        >
                          {t("autoPreview.details", "Détails")}
                        </Button>
                        {safeArray(pickFirst(ex, ["variantes"])).length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            leftIcon={<RepeatIcon />}
                            onClick={() => openDetails(ex, true)}
                          >
                            {t("autoPreview.replace", "Remplacer")}
                          </Button>
                        )}
                      </HStack>
                    </Box>
                  );
                })}
              </SimpleGrid>
            </Box>
          );
        })}

        {selExo && (
          <Modal isOpen={detailsDlg.isOpen} onClose={detailsDlg.onClose} size={{ base: "full", md: "4xl" }}>
            <ModalOverlay />
            <ModalContent borderRadius={{ base: 0, md: "xl" }} bg={surface}>
              <ModalHeader>
                {replaceMode
                  ? t("autoPreview.replaceExercise", "Remplacer l’exercice")
                  : t("autoPreview.exerciseDetails", "Détails de l’exercice")}
              </ModalHeader>
              <ModalCloseButton />
              <ModalBody pb={6}>
                {!replaceMode ? (
                  <ExerciseDetailsContent selExo={selExo} preferredSex={preferredSex} t={t} />
                ) : (
                  <>
                    <Text mb={2}>
                      <b>{t("autoPreview.availableVariants", "Variantes disponibles :")}</b>
                    </Text>
                    <Select
                      placeholder={t("autoPreview.chooseVariant", "Choisissez une variante")}
                      value={selVariant}
                      onChange={(e) => setSelVariant(e.target.value)}
                      mb={4}
                    >
                      {safeArray(pickFirst(selExo, ["variantes"])).map((v, i) => {
                        const label = typeof v === "string" ? v : v.nom || v.name || JSON.stringify(v);
                        return (
                          <option key={i} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </Select>
                    <HStack align="center" spacing={2} wrap="wrap">
                      <Button colorScheme="blue" onClick={() => doReplacePersist(selVariant)} isDisabled={!selVariant}>
                        {t("autoPreview.replace", "Remplacer")}
                      </Button>
                      <Spacer />
                      <Button variant="ghost" onClick={detailsDlg.onClose}>
                        {t("autoPreview.close", "Fermer")}
                      </Button>
                    </HStack>
                  </>
                )}
              </ModalBody>
            </ModalContent>
          </Modal>
        )}

        {renderPdfPages()}
      </Box>
    </Box>
  );
}

/* ----------- Topbar ----------- */
function TopBar({
  programmeName,
  onBack,
  onEdit,
  onPlay,
  onPdf,
  canEdit,
  pdfLang,
  setPdfLang,
  showAutoFollowToggle,
  autoFollow,
  savingAutoFollow,
  onToggleAutoFollow,
}) {
  const { t } = useTranslation("common");
  const isDarkBtnBg = useColorModeValue(undefined, "gray.600");

  const options = Object.keys(PDF_I18N).map((k) => ({
    value: k,
    label: `PDF : ${PDF_I18N[k]?.langName || k.toUpperCase()}`,
  }));

  return (
    <Flex
      direction={{ base: "column", md: "row" }}
      gap={3}
      align={{ base: "stretch", md: "center" }}
      justify="space-between"
      mb={6}
    >
      <HStack spacing={3} align="center">
        <Tooltip label={t("autoPreview.back", "Retour")}>
          <IconButton icon={<ArrowBackIcon />} aria-label={t("autoPreview.back", "Retour")} onClick={onBack} />
        </Tooltip>
        <Heading fontSize={{ base: "xl", md: "2xl" }} noOfLines={2} wordBreak="break-word">
          {programmeName}
        </Heading>
      </HStack>

      <HStack spacing={3} justify={{ base: "flex-start", md: "flex-end" }} wrap="wrap">
        {showAutoFollowToggle && (
          <Tooltip
            hasArrow
            placement="bottom"
            label={
              autoFollow
                ? t(
                    "autoPreview.autoFollowHintOn",
                    "IA activée : BYL ajuste automatiquement la progression (si disponible) selon tes séances validées."
                  )
                : t(
                    "autoPreview.autoFollowHintOff",
                    "IA désactivée : aucune progression automatique n’est appliquée."
                  )
            }
          >
            <Button
              size="sm"
              borderRadius="9999px"
              px={4}
              fontWeight={700}
              onClick={() => onToggleAutoFollow?.(!autoFollow)}
              isLoading={!!savingAutoFollow}
              loadingText={t("autoPreview.saving", "Sauvegarde")}
              leftIcon={<Icon as={MdAutoAwesome} />}
              colorScheme={autoFollow ? "purple" : "gray"}
              variant={autoFollow ? "solid" : "outline"}
              bg={autoFollow ? useColorModeValue("purple.600", "purple.400") : "transparent"}
              color={autoFollow ? "white" : useColorModeValue("gray.800", "gray.100")}
              border={
                autoFollow ? "1px solid transparent" : useColorModeValue("1px solid #e3e7ef", "1px solid #2b3b64")
              }
              _hover={{
                transform: "translateY(-1px)",
                boxShadow: "md",
                bg: autoFollow ? useColorModeValue("purple.700", "purple.500") : useColorModeValue("gray.100", "#233055"),
              }}
              _active={{ transform: "translateY(0px)" }}
              transition="all .15s ease"
            >
              <HStack spacing={2}>
                <Text lineHeight="1" noOfLines={1}>
                  {t("autoPreview.autoFollowShort", "Suivi")}
                </Text>

                <Tag
                  size="sm"
                  borderRadius="full"
                  variant={autoFollow ? "solid" : "subtle"}
                  colorScheme={autoFollow ? "purple" : "gray"}
                  fontWeight={800}
                  letterSpacing="0.6px"
                >
                  IA
                </Tag>

                <Badge
                  borderRadius="full"
                  px={2}
                  py="2px"
                  fontSize="0.72rem"
                  variant={autoFollow ? "solid" : "subtle"}
                  colorScheme={autoFollow ? "green" : "gray"}
                >
                  {autoFollow ? t("autoPreview.enabled", "Activé") : t("autoPreview.disabled", "Désactivé")}
                </Badge>
              </HStack>
            </Button>
          </Tooltip>
        )}

        <Select
          size="sm"
          w={{ base: "180px", md: "200px" }}
          value={pdfLang}
          onChange={(e) => setPdfLang(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>

        {canEdit && (
          <Button leftIcon={<EditIcon />} variant="outline" size="sm" onClick={onEdit}>
            {t("autoPreview.edit", "Modifier")}
          </Button>
        )}

        <Button colorScheme="blue" size="sm" onClick={onPlay}>
          {t("autoPreview.start", "Démarrer séance")}
        </Button>

        <Tooltip label={t("autoPreview.downloadPdf", "Télécharger le PDF")}>
          <IconButton
            icon={<DownloadIcon />}
            aria-label={t("autoPreview.downloadPdf", "Télécharger le PDF")}
            onClick={onPdf}
            size="sm"
            bg={isDarkBtnBg}
          />
        </Tooltip>
      </HStack>
    </Flex>
  );
}