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
  MdAutoAwesome,
} from "react-icons/md";
import { pdf } from "@react-pdf/renderer";
import { useTranslation } from "react-i18next";
import { useAuth } from "../AuthContext";
import AppLoading from "./ui/AppLoading";
import { notify } from "../utils/notify";
import { localizeExercise } from "../utils/exerciseI18n";
import { useAppTheme } from "../styles/appTheme";
import { estimateSessionDurationSeconds, formatDuration } from "../utils/trainingEngine";
import { SportProgramPdfDocument } from "../utils/sportProgramPdf";
import { canUseCustomBranding } from "../utils/proPlanAccess";
import { apiFetch } from "../utils/api";
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

const EXERCISE_COLLECTIONS = ["training", "warmup", "cooldown", "ergometre"];

function normalizeUrl(v) {
  const url = typeof v === "string" && v.trim() ? v.trim() : "";
  if (!url) return "";
  if (url.includes("firebasestorage.googleapis.com") && url.includes("/o/") && !url.includes("?")) {
    return `${url}?alt=media`;
  }
  return url;
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
    depart: [findMediaByKey(femmeImages, "depart"), findMediaByKey(hommeImages, "depart")],
    arrivee: [findMediaByKey(femmeImages, "arrivee"), findMediaByKey(hommeImages, "arrivee")],
    video: [
      mediaValueToPath(exercise?.media?.femme?.video),
      mediaValueToPath(exercise?.media?.homme?.video),
    ],
  };

  const male = {
    depart: [findMediaByKey(hommeImages, "depart"), findMediaByKey(femmeImages, "depart")],
    arrivee: [findMediaByKey(hommeImages, "arrivee"), findMediaByKey(femmeImages, "arrivee")],
    video: [
      mediaValueToPath(exercise?.media?.homme?.video),
      mediaValueToPath(exercise?.media?.femme?.video),
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

function dedupeMediaItems(items) {
  const seen = new Set();
  return items.filter((item) => {
    const url = normalizeUrl(item?.url);
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function extractExerciseMedia(exercise, preferredSex = "") {
  const ordered = buildGenderOrderedMedia(exercise, preferredSex || "homme");
  const selected = getSexMediaBucket(exercise, preferredSex);
  const bucketImages = Array.isArray(selected?.images) ? selected.images : [];
  const rawImages = bucketImages.filter((img) => ["depart", "arrivee"].includes(String(img?.key || "").toLowerCase()));

  const images = dedupeMediaItems(rawImages.map((img) => (typeof img === "string" ? { url: img, key: "" } : img)))
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

  const videoUrl = normalizeUrl(ordered.video.find(Boolean) || selected?.video?.url);
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

        for (const lng of ["en", "it", "es", "de", "ru", "ar"]) {
          const byTranslatedName = await getDocs(
            query(collection(db, col), where(`translations.${lng}.nom`, "==", exName), limit(1))
          );
          if (!byTranslatedName.empty) {
            const d = byTranslatedName.docs[0];
            return { ...d.data(), __collection: col, __docId: d.id };
          }
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
  const wantedTokens = normalizedWanted.split(/\s+/).filter((token) => token.length > 2);
  const originalTokens = norm(originalExercise?.nom || originalExercise?.name || "")
    .split(/\s+/)
    .filter((token) => token.length > 2);

  const scoreCandidate = (data = {}) => {
    const label = norm(data?.nom || data?.name || data?.title || data?.label || data?.id || "");
    if (!label || label === norm(originalExercise?.nom || originalExercise?.name || "")) return -1;
    if (label === normalizedWanted) return 1000;

    const labelTokens = label.split(/\s+/).filter((token) => token.length > 2);
    const wantedMatches = wantedTokens.filter((token) => labelTokens.includes(token)).length;
    const originalMatches = originalTokens.filter((token) => labelTokens.includes(token)).length;
    let score = wantedMatches * 12 + originalMatches * 3;

    if (wantedTokens.length && wantedTokens.every((token) => labelTokens.includes(token))) score += 70;
    if (label.includes(normalizedWanted) || normalizedWanted.includes(label)) score += 35;
    return score;
  };

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

      const scored = snap.docs
        .map((d) => ({ doc: d, score: scoreCandidate(d.data() || {}) }))
        .filter((item) => item.score >= 75)
        .sort((a, b) => b.score - a.score)[0];

      if (scored) {
        return { ...scored.doc.data(), __collection: col, __docId: scored.doc.id };
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
    const hasBuilderOrder = Array.isArray(ex?.optionsOrder);
    if (enabled || (!hasBuilderOrder && present)) {
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
  const activeOptions = Array.isArray(ex?.optionsOrder) ? new Set(ex.optionsOrder) : null;

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
      inclinePct: s.inclinePct ?? s["Inclinaison (%)"] ?? s.inclinaison ?? s.incline ?? s.slope ?? 0,
    };
  });

  const hasAny = (keys) => arr.some((s) => keys.some((key) => s?.[key] !== undefined && s?.[key] !== null));
  const visible = {
    reps: activeOptions ? activeOptions.has("Répétitions") : hasAny(["reps", "repetitions", "Répétitions"]),
    charge: activeOptions ? activeOptions.has("Charge (kg)") : hasAny(["chargeKg", "charge", "Charge (kg)", "Charge (lbs)"]),
    rest: activeOptions ? activeOptions.has("Repos (min:sec)") : hasAny(["restSec", "rest", "Repos (min:sec)", "repos"]),
    duration: activeOptions ? activeOptions.has("Durée (min:sec)") : hasAny(["durationSec", "duration", "Durée (min:sec)", "temps"]),
    incline: activeOptions ? activeOptions.has("Inclinaison (%)") : hasAny(["inclinePct", "Inclinaison (%)", "inclinaison", "incline", "slope"]),
  };

  return { enabled: true, sets, visible };
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
  const total = estimateSessionDurationSeconds(session);
  return total ? formatDuration(total) : "-";
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
async function readProgramme(clientId, programId) {
  if (clientId && programId) {
    const assignedRef = doc(db, "clients", clientId, "programmes", programId);
    const assignedSnap = await getDoc(assignedRef);
    if (assignedSnap.exists()) return { id: programId, data: assignedSnap.data(), ref: assignedRef };
  }

  const id = programId || clientId;
  if (id) {
    const baseRef = doc(db, "programmes", id);
    const baseSnap = await getDoc(baseRef);
    if (baseSnap.exists()) return { id, data: baseSnap.data(), ref: baseRef };
  }
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
  const activeBorder = useColorModeValue("gray.500", "gray.300");
  const thumbBg = "white";

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
  const { t } = useTranslation("common");
  const mediaItems = useMemo(() => extractExerciseMedia(exercise, preferredSex), [exercise, preferredSex]);
  const displayItems = mediaItems;

  const border = useColorModeValue("gray.200", "gray.700");
  const cardBg = useColorModeValue("white", "gray.800");
  
  const miniHoverBorder = useColorModeValue("gray.400", "gray.500");
  const imageBg = "white";

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
        bg={selectedType === "video" ? "black" : imageBg}
        display="flex"
        alignItems="center"
        justifyContent="center"
        mb={3}
        position="relative"
        _hover={{
          borderColor: miniHoverBorder,
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
            bg={imageBg}
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
        <Heading size="sm">{t("exerciseCard.media.title", "Démonstration")}</Heading>

        <Box
          w="full"
          h={panelHeight}
          borderRadius="xl"
          overflow="hidden"
          border="1px solid"
        borderColor={border}
        bg={selectedType === "video" ? "black" : imageBg}
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
              bg={imageBg}
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
    return <Text>{t("common.loading", "Chargement...")}</Text>;
  }

  return (
    <Box>
      <ExerciseMediaPanel exercise={selExo} preferredSex={preferredSex} />

      <Grid templateColumns={{ base: "24px 1fr", md: "30px 1fr" }} gap={2} mb={3}>
        {[
          {
            keys: ["groupe_musculaire", "groupeMusculaire", "muscle_group"],
            label: t("exerciseCard.fields.mainGroup", "Groupe musculaire"),
            icon: MdFitnessCenter,
          },
          {
            keys: ["muscles_secondaires", "musclesSecondaires", "secondary_muscles"],
            label: t("exerciseCard.fields.secondary", "Muscles secondaires"),
            icon: MdFitnessCenter,
          },
          {
            keys: ["articulations_sollicitees", "articulations_solicitees", "articulationsSolicitees", "joints"],
            label: t("exerciseCard.fields.joints", "Articulations sollicitées"),
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
            label: t("exerciseCard.fields.ligaments", "Ligaments sollicités"),
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
  const clientId = params.clientId || "";
  const programId = params.programId || params.id || params.programmeId;

  const { user, effectiveRole, showAdminView } = useAuth();
  const { t, i18n } = useTranslation("common");
  const navigate = useNavigate();
  const toast = useToast();

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const adminCoachId = searchParams.get("adminCoachId") || "";
  const withAdminCoach = (path) => {
    if (!adminCoachId) return path;
    return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
  };

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
  const exerciseMediaCacheRef = useRef(new Map());

  const [resolvedExerciseMap, setResolvedExerciseMap] = useState({});
  const [, setPdfExerciseImageMap] = useState({});
  const [pdfGenerating, setPdfGenerating] = useState(false);

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

  const theme = useAppTheme();
  const bg = theme.pageBg;
  const surface = theme.surfaceBg;
  const cardBg = theme.surfaceSoft;
  const cardBorder = `1px solid ${theme.borderColor}`;
  const subText = theme.mutedText;
  const sectionIconColor = theme.textColor;

  useEffect(() => {
    let unsub;
    (async () => {
      setLoading(true);
      const hit = await readProgramme(clientId, programId);
      if (!hit && !clientId && programId) {
        try {
          const resolved = await apiFetch(`/clubs/resolve-program-link?programId=${encodeURIComponent(programId)}`);
          if (resolved?.path) {
            navigate(withAdminCoach(resolved.path), { replace: true });
            return;
          }
        } catch (_) {
          // Keep the not-found state when no assigned programme can be resolved.
        }
      }
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
  }, [clientId, programId]);

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

        if (exerciseMediaCacheRef.current.has(cacheKey)) {
          const cached = exerciseMediaCacheRef.current.get(cacheKey);
          return [
            cacheKey,
            {
              ...cached,
              ...exercise,
              nom: cached?.nom || exercise?.nom,
              name: cached?.name || exercise?.name,
              translations: cached?.translations || exercise?.translations,
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
                ...source,
                ...exercise,
                nom: source?.nom || exercise?.nom,
                name: source?.name || exercise?.name,
                translations: source?.translations || exercise?.translations,
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

  const initialSessionIndex = useMemo(() => {
    const fromState = location?.state?.sessionIndex;
    const fromQuery = searchParams.get("sessionIndex");
    const v = fromState ?? fromQuery;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [location?.state, searchParams]);

  useEffect(() => {
    if (!Array.isArray(sessions) || sessions.length === 0) return;
    if (initialSessionIndex == null) return;
    setTabIndex(Math.max(0, Math.min(initialSessionIndex, sessions.length - 1)));
  }, [initialSessionIndex, sessions]);

  const objectifKeyDisplay = useMemo(() => {
    const directNav = (objectifUIFromNav || "").trim();
    if (directNav) return directNav;

    const ui = getObjectifUIFromProg(prog);
    if (ui) return ui;

    const fromField = (prog?.objectif && String(prog.objectif).trim()) || "";
    if (fromField) return fromField;

    if (objectifKeyFromName) return objectifKeyFromName;

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
    const shouldUseComputedAutoName =
      isAutoProgram &&
      custom &&
      objectifKeyDisplay &&
      objectifKeyFromName &&
      objectifKeyFromName !== objectifKeyDisplay;
    if (custom && !shouldUseComputedAutoName) return custom;

    const perWeek = (Llbl[pdfLang] || Llbl.fr).perWeek || "x/Sem";
    const base = objectifLabelDisplay || t("autoPreview.generated", "Programme");
    return nbSeances ? `${base} — ${nbSeances}${perWeek}` : base;
  }, [customProgramName, isAutoProgram, objectifKeyDisplay, objectifKeyFromName, objectifLabelDisplay, nbSeances, pdfLang, Llbl, t]);

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
      notify(toast, "saveSuccess", {
        title: nextVal
          ? t("autoPreview.autoFollowOn", "Suivi automatique activé")
          : t("autoPreview.autoFollowOff", "Suivi automatique désactivé"),
        description: nextVal
          ? "Les prochaines validations mettront la progression à jour automatiquement."
          : "Le programme restera inchangé sans suivi automatique.",
      });
    } catch (e) {
      console.error(e);
      notify(toast, "saveError", {
        title: t("settings.toasts.update_error", "Erreur de mise à jour."),
      });
      setAutoFollow(readAutoFollowFlag(prog));
    } finally {
      setSavingAutoFollow(false);
    }
  };

  useEffect(() => {
    (async () => {
      const byl = await anyImageSourceToDataUrl(LEGACY_BYL_LOCAL);
      const brandingAllowed = canUseCustomBranding(
        user?.proAccess || {
          packageKey: user?.packageKey,
          packageTier: user?.packageTier,
          branding: user?.branding,
        }
      );
      const coachLogo = brandingAllowed
        ? await anyImageSourceToDataUrl(user?.logoUrl || user?.photoURL || "")
        : "";
      const logo = byl || LEGACY_BYL_LOCAL;
      setFooterLogo(logo);
      setHeaderLogo(coachLogo || logo);
    })();
  }, [user?.branding, user?.logoUrl, user?.packageKey, user?.packageTier, user?.photoURL, user?.proAccess]);

  const resolveExerciseForDisplay = (exercise, fallback = "", lng = i18n.language || "fr") => {
    const cacheKey = getExerciseCacheKey(exercise, fallback);
    const resolved = cacheKey ? resolvedExerciseMap[cacheKey] || exercise : exercise;
    return localizeExercise(resolved, lng);
  };

  const preloadPdfImagesForAllSessions = async () => {
    const allExercises = (sessions || []).flatMap((sess) =>
      Object.values(asSections(sess)).flatMap((arr) => arr || [])
    );

    const entries = await Promise.all(
      allExercises.map(async (ex, idx) => {
        const resolved = resolveExerciseForDisplay(ex, `pdf-${idx}`, pdfLang);
        const cacheKey = getExerciseCacheKey(resolved, `pdf-${idx}`);

        if (!cacheKey) return null;

        const rawCandidates = getExerciseImageUrls(resolved, preferredSex);
        const resolvedCandidates = await resolveImageCandidatesToUrls(rawCandidates);
        const allCandidates = uniqStrings([...rawCandidates, ...resolvedCandidates]).slice(0, 4);

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
    setSelExo(resolveExerciseForDisplay(ex, "modal", i18n.language || "fr"));
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
        notify(toast, "programMissing", {
          title: t("autoPreview.variantNotFound", "Variante introuvable"),
          description: "Choisissez une autre variante disponible dans la banque.",
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

      notify(toast, "saveSuccess", {
        title: t("autoPreview.replace", "Remplacer"),
        description: "L'exercice a bien été remplacé dans le programme.",
      });
    } catch (e) {
      console.error(e);
      notify(toast, "saveError", {
        title: t("settings.toasts.update_error", "Erreur de mise à jour."),
      });
    }
  };

  

  const getPdfImagesForExerciseFromMap = (imageMap, exercise, fallback = "") => {
    const cacheKey = getExerciseCacheKey(exercise, fallback);
    if (!cacheKey) return { images: [], hasImages: false };
    return imageMap?.[cacheKey] || { images: [], hasImages: false };
  };

  const buildSportPdfSessions = (imageMap) =>
    (sessions || []).map((sess, sIdx) => {
      const S = asSections(sess);
      const makeExercise = (exercise, indexPrefix) => {
        const resolved = resolveExerciseForDisplay(exercise, indexPrefix, pdfLang);
        const pdfImages = getPdfImagesForExerciseFromMap(imageMap, resolved, indexPrefix);
        return {
          name: pickFirst(resolved, ["nom", "name"]) || "",
          infos: buildInfosFromExercise(resolved, displayUnits, pdfLocale, L),
          images: (pdfImages.images || [])
            .map((item) => item?.dataUrl || item?.finalUrl)
            .filter(Boolean),
        };
      };

      const makeSection = (label, list, key) => ({
        label,
        exercises: (list || []).map((exercise, index) =>
          makeExercise(exercise, `sport-pdf-${sIdx}-${key}-${index}`)
        ),
      });

      return {
        title: getSessionDisplayName(sess, sIdx, L),
        duration: `${L.totalTime} : ${totalTime(sess)}`,
        sections: [
          makeSection(L.sections.warmup, S.echauffement, "warmup"),
          makeSection(L.sections.main, S.corps, "main"),
          makeSection(L.sections.bonus, S.bonus, "bonus"),
          makeSection(L.sections.cooldown, S.retourCalme, "cooldown"),
        ].filter((section) => section.exercises.length),
      };
    });

  const handleDownloadPDF = async () => {
    if (pdfGenerating) return;
    setPdfGenerating(true);
    try {
      notify(toast, "pdfPreparing", {
        title: t("autoPreview.pdfPreparing", "Préparation du PDF..."),
        status: "info",
        duration: 1400,
      });
      const imageMap = await preloadPdfImagesForAllSessions();
      const rawCoachName =
        getPrettyUserName(user) ||
        (user?.displayName && !/@/.test(user.displayName) ? user.displayName : "") ||
        coachPdfName ||
        "";
      const createdByForPdf = String(prog?.createdBy || prog?.createdByUid || prog?.generatedBy || "").toLowerCase();
      const createdNameForPdf = String(prog?.createdByName || prog?.coachName || prog?.ownerName || "").toLowerCase();
      const isBylGeneratedPdf =
        createdByForPdf.includes("auto-cron") ||
        createdByForPdf.includes("auto_cron") ||
        createdByForPdf === "byl" ||
        createdByForPdf === "system" ||
        createdNameForPdf === "byl" ||
        createdNameForPdf.includes("boostyourlife");
      const isAdminWorkspacePdf =
        user?.role === "admin" &&
        (showAdminView || effectiveRole === "admin") &&
        !searchParams.get("adminCoachId");
      const pdfHeaderName =
        isBylGeneratedPdf || isAdminWorkspacePdf ? "BoostYourLife.coach" : rawCoachName;
      const pdfHeaderLogo =
        isBylGeneratedPdf || isAdminWorkspacePdf ? footerLogo || headerLogo : headerLogo || footerLogo;

      const blob = await pdf(
        <SportProgramPdfDocument
          title={programmeTitleDisplay}
          clientName=""
          coachName={pdfHeaderName}
          logoDataUrl={pdfHeaderLogo}
          footerLogoDataUrl={footerLogo || headerLogo}
          dateLabel={L.date(new Date())}
          footerText={L.generatedWith(window.location.hostname)}
          sessions={buildSportPdfSessions(imageMap)}
        />
      ).toBlob();

      const base = normalizeForFilename(programmeTitleDisplay || L.fileProgram);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${base}-BYL-${pdfLang}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      notify(toast, "pdfError", {
        title: t("autoPreview.pdfError", "Erreur lors de la génération du PDF"),
      });
    } finally {
      setPdfGenerating(false);
    }
  };

  const goBack = () => {
    const from = location.state?.from || location.state?.source || "";
    const fromCreation =
      location.state?.fromCreation ||
      from === "program-creation" ||
      from === "checkout";
    if (fromCreation) {
      navigate(viewerIsCoach ? withAdminCoach("/coach-dashboard") : "/user-dashboard", { replace: true });
      return;
    }
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    if (adminCoachId) {
      navigate(`/admin/coach/${adminCoachId}`);
      return;
    }
    navigate(-1);
  };

  const goEdit = () => {
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    navigate(withAdminCoach(`/exercise-bank/program-builder/${realProgramId}`), {
      state: { returnTo: location.pathname + location.search },
    });
  };

  const goPlay = () => {
    if (!sessions?.length) return;
    const sIdx = Math.max(0, Math.min(tabIndex, sessions.length - 1));
    const realProgramId = programId || prog?.id;
    if (!realProgramId) return;
    if (clientId) {
      navigate(withAdminCoach(`/clients/${clientId}/programmes/${realProgramId}/session/${sIdx}/play`));
      return;
    }
    navigate(withAdminCoach(`/programmes/${realProgramId}/session/${sIdx}/play`));
  };
  const pillActiveBg = useColorModeValue("gray.900", "#2b3448");
  const pillInactiveBg = useColorModeValue("gray.100", "#233055");
  const pillInactiveColor = useColorModeValue("gray.800", "gray.100");
  const pillActiveHoverBg = useColorModeValue("gray.800", "#374151");
  const pillInactiveHoverBg = useColorModeValue("gray.200", "#32406b");
  const sessionMetaColor = useColorModeValue("gray.600", "gray.300");
  const badgeBg = useColorModeValue("gray.100", "#233055");
  const badgeColor = useColorModeValue("gray.700", "gray.100");
  const badgeBorder = useColorModeValue("1px solid #e3e7ef", "1px solid #2b3b64");
  const subtleBadgeColor = useColorModeValue("gray.600", "gray.200");
  const replaceButtonBg = useColorModeValue("gray.900", "whiteAlpha.200");
  const replaceButtonHoverBg = useColorModeValue("gray.800", "whiteAlpha.300");
  const replaceButtonActiveBg = useColorModeValue("gray.700", "whiteAlpha.400");

  if (loading) {
    return <AppLoading label={t("common.loading", "Chargement...")} />;
  }

  if (!prog) {
    return (
      <Box bg={bg} p={6}>
        <Box {...theme.cardProps} p={6} maxW="5xl" mx="auto">
          <HStack mb={4}>
            <IconButton icon={<ArrowBackIcon />} aria-label={t("auto.AutoProgramPreview.back", "back")} onClick={() => navigate(-1)} />
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
      bg={active ? pillActiveBg : pillInactiveBg}
      color={active ? "white" : pillInactiveColor}
      border="1px solid transparent"
      _hover={{
        bg: active ? pillActiveHoverBg : pillInactiveHoverBg
      }}
      transition="all .15s"
    >
      {children}
    </Button>
  );

  const currentSession = sessions[tabIndex] || null;
  const currentSessionTitle = getSessionDisplayName(currentSession || {}, tabIndex, L);
  const showAutoFollowToggle = true;

  return (
    <Box bg={bg} minH="100vh" p={{ base: 3, md: 6 }}>
      <Box {...theme.cardProps} p={{ base: 4, md: 6 }} maxW="7xl" mx="auto">
        <TopBar
          programmeName={programmeTitleDisplay}
          onBack={goBack}
          onEdit={goEdit}
          onPlay={goPlay}
          onPdf={handleDownloadPDF}
          pdfGenerating={pdfGenerating}
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
          <HStack mb={3} color={sessionMetaColor} wrap="wrap">
            <Box as={MdOutlineAccessTime} boxSize={5} />
            <Text fontSize="sm">
              {L.totalTime} :{" "}
              <Badge
                ml={2}
                borderRadius="full"
                px={2.5}
                py="2px"
                bg={badgeBg}
                color={badgeColor}
                border={badgeBorder}
              >
                {totalTime(currentSession)}
              </Badge>
              <Badge
                ml={2}
                borderRadius="full"
                px={2.5}
                py="2px"
                bg="transparent"
                color={subtleBadgeColor}
                border={badgeBorder}
              >
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
                  const displayExercise = resolveExerciseForDisplay(ex, `${key}-${idx}`, i18n.language || "fr");
                  const nom = (pickFirst(displayExercise || ex, ["nom", "name"]) || "").toString();
                  const infos = buildInfosFromExercise(ex, displayUnits, locale, L);
                  const adv = getAdvancedSets(ex);

                  return (
                    <Box
                      key={`${nom}-${idx}`}
                      bg={cardBg}
                      border={cardBorder}
                      borderRadius="22px"
                      p={4}
                      boxShadow="none"
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
	                                    {adv.visible?.reps && <Th>{L.labels.reps}</Th>}
	                                    {adv.visible?.charge && (
	                                      <Th>{displayUnits.weight === "lbs" ? L.labels.loadLbs : L.labels.loadKg}</Th>
	                                    )}
	                                    {adv.visible?.rest && <Th>{L.labels.rest}</Th>}
	                                    {adv.visible?.duration && <Th>{L.labels.duration}</Th>}
	                                    {adv.visible?.incline && <Th>{L.labels.incline}</Th>}
	                                  </Tr>
	                                </Thead>
	                                <Tbody>
	                                  {adv.sets.map((s, i) => (
	                                    <Tr key={i}>
	                                      <Td>{L.setN(i + 1)}</Td>
	                                      {adv.visible?.reps && <Td>{formatDisplayNumber(s.reps ?? 0, locale)}</Td>}
	                                      {adv.visible?.charge && (
	                                        <Td>
	                                          {formatDisplayNumber(
	                                            convertWeight(s.chargeValue ?? 0, displayUnits.weight, s.chargeUnit || "kg"),
	                                            locale
	                                          )}
	                                        </Td>
	                                      )}
	                                      {adv.visible?.rest && <Td>{fmtSec(s.restSec ?? 0)}</Td>}
	                                      {adv.visible?.duration && <Td>{fmtSec(s.durationSec ?? 0)}</Td>}
	                                      {adv.visible?.incline && <Td>{formatDisplayNumber(s.inclinePct ?? 0, locale)}</Td>}
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
                      <Button
                        onClick={() => doReplacePersist(selVariant)}
                        isDisabled={!selVariant}
                        borderRadius="full"
                        bg={replaceButtonBg}
                        color="white"
                        _hover={{ bg: replaceButtonHoverBg }}
                        _active={{ bg: replaceButtonActiveBg }}
                      >
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
  pdfGenerating = false,
  canEdit,
  pdfLang,
  setPdfLang,
  showAutoFollowToggle,
  autoFollow,
  savingAutoFollow,
  onToggleAutoFollow,
}) {
  const { t } = useTranslation("common");
  const iconButtonBg = useColorModeValue("white", "#1f2937");
  const iconButtonBorder = useColorModeValue("#e2e8f0", "#334155");
  const iconButtonHoverBg = useColorModeValue("gray.100", "#273449");
  const primaryButtonBg = useColorModeValue("gray.900", "whiteAlpha.200");
  const primaryButtonHoverBg = useColorModeValue("gray.800", "whiteAlpha.300");
  const primaryButtonActiveBg = useColorModeValue("gray.700", "whiteAlpha.400");
  const iconButtonColor = useColorModeValue("gray.700", "white");
  const autoFollowBg = useColorModeValue("purple.600", "purple.400");
  const autoFollowText = useColorModeValue("gray.800", "gray.100");
  const autoFollowBorder = useColorModeValue("1px solid #e3e7ef", "1px solid #2b3b64");
  const autoFollowHoverBg = useColorModeValue("purple.700", "purple.500");
  const autoFollowInactiveHoverBg = useColorModeValue("gray.100", "#233055");

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
          <IconButton
            icon={<ArrowBackIcon />}
            aria-label={t("autoPreview.back", "Retour")}
            onClick={onBack}
            borderRadius="full"
            bg={iconButtonBg}
            color={iconButtonColor}
            border="1px solid"
            borderColor={iconButtonBorder}
            _hover={{ bg: iconButtonHoverBg }}
          />
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
              bg={autoFollow ? autoFollowBg : "transparent"}
              color={autoFollow ? "white" : autoFollowText}
              border={
                autoFollow ? "1px solid transparent" : autoFollowBorder
              }
              _hover={{
                transform: "translateY(-1px)",
                boxShadow: "md",
                bg: autoFollow ? autoFollowHoverBg : autoFollowInactiveHoverBg,
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

        <Button
          size="sm"
          onClick={onPlay}
          borderRadius="full"
          bg={primaryButtonBg}
          color="white"
          _hover={{ bg: primaryButtonHoverBg }}
          _active={{ bg: primaryButtonActiveBg }}
        >
          {t("autoPreview.start", "Démarrer séance")}
        </Button>

        <Tooltip label={t("autoPreview.downloadPdf", "Télécharger le PDF")}>
          <IconButton
            icon={<DownloadIcon />}
            aria-label={t("autoPreview.downloadPdf", "Télécharger le PDF")}
            onClick={onPdf}
            isLoading={pdfGenerating}
            isDisabled={pdfGenerating}
            size="sm"
            borderRadius="full"
            bg={iconButtonBg}
            color={useColorModeValue("gray.700", "white")}
            border="1px solid"
            borderColor={iconButtonBorder}
            _hover={{ bg: iconButtonHoverBg }}
          />
        </Tooltip>
      </HStack>
    </Flex>
  );
}
