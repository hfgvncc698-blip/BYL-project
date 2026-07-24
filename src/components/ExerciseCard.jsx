// src/components/ExerciseCard.jsx
import React, {
  useRef,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  Box,
  Button,
  IconButton,
  Image,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  List,
  ListItem,
  ListIcon,
  useColorModeValue,
  HStack,
  Tag,
  TagLabel,
  Icon,
  Divider,
  SimpleGrid,
  AspectRatio,
  VStack,
  Badge,
  ButtonGroup,
} from "@chakra-ui/react";
import { InfoOutlineIcon, AddIcon } from "@chakra-ui/icons";
import {
  MdFitnessCenter,
  MdOutlineHealing,
  MdOutlineMenuBook,
  MdCheckCircle,
  MdSwapHoriz,
  MdWarning,
  MdOutlineLink,
  MdDirectionsRun,
  MdSelfImprovement,
  MdOutlineImage,
  MdOutlineVideocam,
} from "react-icons/md";
import { FaDumbbell } from "react-icons/fa";
import {
  GiLeg,
  GiAbdominalArmor,
  GiShoulderArmor,
  GiChestArmor,
  GiSpineArrow,
} from "react-icons/gi";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { getStorage, ref as storageRef, getDownloadURL } from "firebase/storage";
import { localizeExercise } from "../utils/exerciseI18n";

/* ================= constants ================= */
const EXPLICIT_STORAGE_BUCKET = "gs://boost-your-life-f6b3e.firebasestorage.app";

/* ================= helpers ================= */
const safeArr = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const firstString = (...values) => {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
};

const isDirectUrl = (value) => {
  const s = String(value || "").trim();
  return (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  );
};

const normalizeFirebaseDownloadUrl = (value = "") => {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.includes("firebasestorage.googleapis.com") && url.includes("/o/") && !url.includes("?")) {
    return `${url}?alt=media`;
  }
  return url;
};

const mediaValueToPath = (value) => {
  if (!value) return "";
  if (typeof value === "string") return normalizeFirebaseDownloadUrl(value);
  if (typeof value === "object") {
    return normalizeFirebaseDownloadUrl(firstString(value.url, value.path, value.src, value.downloadURL));
  }
  return "";
};

const findMediaByKey = (entries, wantedKey) => {
  if (!Array.isArray(entries)) return "";
  const found = entries.find((item) => norm(item?.key) === norm(wantedKey));
  return mediaValueToPath(found);
};

const tryResolveFromStorage = async (bucketOrNull, rawPath) => {
  try {
    const storage = bucketOrNull
      ? getStorage(undefined, bucketOrNull)
      : getStorage();
    const fileRef = storageRef(storage, rawPath);
    const url = await getDownloadURL(fileRef);
    return url || "";
  } catch {
    return "";
  }
};

const resolveStorageUrl = async (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (isDirectUrl(raw)) return normalizeFirebaseDownloadUrl(raw);

  const fromDefaultBucket = await tryResolveFromStorage(null, raw);
  if (fromDefaultBucket) return fromDefaultBucket;

  const fromExplicitBucket = await tryResolveFromStorage(
    EXPLICIT_STORAGE_BUCKET,
    raw
  );
  if (fromExplicitBucket) return fromExplicitBucket;

  return "";
};

const resolveOneCandidate = async (candidates) => {
  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value) continue;

    const resolved = await resolveStorageUrl(value);
    if (resolved) return resolved;
  }
  return "";
};

const toFlatString = (value, fallback = "") => {
  if (Array.isArray(value)) return value.length ? value.join(", ") : fallback;
  if (typeof value === "string") return value.trim() || fallback;
  return fallback;
};

const normalizeGender = (value) => {
  const v = norm(value);
  if (!v) return "";
  if (
    ["f", "femme", "female", "woman", "girl", "feminin", "féminin"].includes(v)
  ) {
    return "femme";
  }
  if (["h", "homme", "male", "man", "boy", "masculin"].includes(v)) {
    return "homme";
  }
  return "";
};

const readNested = (obj, paths = []) => {
  for (const path of paths) {
    const parts = path.split(".");
    let cur = obj;
    let ok = true;

    for (const p of parts) {
      if (cur && typeof cur === "object" && p in cur) {
        cur = cur[p];
      } else {
        ok = false;
        break;
      }
    }

    if (ok) {
      const gender = normalizeGender(cur);
      if (gender) return gender;
    }
  }
  return "";
};

const parseLocalStorageJson = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const inferPreferredGender = ({
  preferredGender,
  exercise,
  pathname,
  locationState,
}) => {
  const propGender = normalizeGender(preferredGender);
  if (propGender) return propGender;

  const clientGender =
    readNested(locationState, [
      "client.sexe",
      "client.sex",
      "client.gender",
      "client.genre",
      "selectedClient.sexe",
      "selectedClient.sex",
      "selectedClient.gender",
      "selectedClient.genre",
      "program.client.sexe",
      "program.client.gender",
    ]) ||
    readNested(exercise, [
      "client.sexe",
      "client.sex",
      "client.gender",
      "client.genre",
      "clientSexe",
      "client_sexe",
      "clientGender",
      "client_gender",
      "sexeClient",
      "genderClient",
    ]);

  if (clientGender) return clientGender;

  const viewerGender =
    readNested(locationState, [
      "viewer.sexe",
      "viewer.sex",
      "viewer.gender",
      "user.sexe",
      "user.sex",
      "user.gender",
      "currentUser.sexe",
      "currentUser.gender",
    ]) ||
    readNested(exercise, [
      "viewer.sexe",
      "viewer.sex",
      "viewer.gender",
      "user.sexe",
      "user.sex",
      "user.gender",
      "sexe",
      "sex",
      "gender",
      "genre",
    ]);

  if (viewerGender) return viewerGender;

  if (typeof window !== "undefined") {
    const localCandidates = [
      parseLocalStorageJson("selectedClient"),
      parseLocalStorageJson("currentClient"),
      parseLocalStorageJson("clientProfile"),
      parseLocalStorageJson("userProfile"),
      parseLocalStorageJson("authUser"),
      parseLocalStorageJson("currentUser"),
    ];

    for (const candidate of localCandidates) {
      const g = readNested(candidate, [
        "sexe",
        "sex",
        "gender",
        "genre",
        "client.sexe",
        "client.gender",
        "user.sexe",
        "user.gender",
      ]);
      if (g) return g;
    }
  }

  if (pathname?.includes("/coach") || pathname?.includes("/program-builder")) {
    const maybeClientGender = readNested(locationState, [
      "client.sexe",
      "selectedClient.sexe",
      "client.gender",
      "selectedClient.gender",
    ]);
    if (maybeClientGender) return maybeClientGender;
  }

  return "homme";
};

const buildGenderOrderedMedia = (exercise, preferredGender = "homme") => {
  const hommeImages = safeArr(exercise?.media?.homme?.images);
  const femmeImages = safeArr(exercise?.media?.femme?.images);

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

/* ================= visual subcomponents ================= */
function LoopingVideo({
  src,
  showControls = false,
  borderRadius = "lg",
  poster = "",
  objectFit = "contain",
  onPlayable,
  onError,
}) {
  const videoRef = useRef(null);
  const playableMarkedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let cancelled = false;
    playableMarkedRef.current = false;

    const markPlayable = () => {
      if (!cancelled && !playableMarkedRef.current) {
        playableMarkedRef.current = true;
        onPlayable?.();
      }
    };

    const markError = () => {
      if (!cancelled) onError?.();
    };

    const tryPlay = async () => {
      try {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;
        video.loop = true;
        const playPromise = video.play();
        if (playPromise && typeof playPromise.then === "function") {
          await playPromise;
        }
        markPlayable();
      } catch {
        markError();
      }
    };

    const onLoadedMetadata = () => tryPlay();
    const onCanPlay = () => {
      markPlayable();
      tryPlay();
    };
    const onVideoError = () => markError();

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("error", onVideoError);

    if (video.readyState >= 2) {
      tryPlay();
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("error", onVideoError);
      try {
        video.pause();
      } catch {
        // ignore
      }
    };
  }, [src, onPlayable, onError]);

  if (!src) return null;

  return (
    <Box
      position="relative"
      w="100%"
      h="100%"
      overflow="hidden"
      borderRadius={borderRadius}
    >
      <Box
        as="video"
        key={src}
        ref={videoRef}
        src={src}
        poster={poster || undefined}
        w="100%"
        h="100%"
        style={{ objectFit }}
        muted
        autoPlay
        loop
        playsInline
        controls={showControls}
        preload="auto"
        borderRadius={borderRadius}
        bg="black"
      />
    </Box>
  );
}

/* ================= icon helper ================= */
const muscleIconFromGroup = (groupRaw) => {
  const g = norm(groupRaw);

  if (
    [
      "jambes",
      "legs",
      "quadriceps",
      "quads",
      "ischio-jambiers",
      "ischio jambiers",
      "hamstrings",
      "adducteurs",
      "adductors",
      "fessiers",
      "glutes",
      "mollets",
      "calves",
    ].some((k) => g.includes(k))
  ) {
    return GiLeg;
  }

  if (
    ["abdominaux", "abs", "core", "transverse", "obliques"].some((k) =>
      g.includes(k)
    )
  ) {
    return GiAbdominalArmor;
  }

  if (["pectoraux", "chest", "pecs"].some((k) => g.includes(k))) {
    return GiChestArmor;
  }

  if (
    [
      "dos",
      "back",
      "dorsaux",
      "lats",
      "trap",
      "trapezes",
      "trapèzes",
      "lombaires",
      "lower back",
    ].some((k) => g.includes(k))
  ) {
    return GiSpineArrow;
  }

  if (
    ["epaules", "épaules", "shoulders", "deltoides", "deltoïdes", "delts"].some(
      (k) => g.includes(k)
    )
  ) {
    return GiShoulderArmor;
  }

  if (
    ["biceps", "triceps", "avant-bras", "avant bras", "forearms"].some((k) =>
      g.includes(k)
    )
  ) {
    return MdFitnessCenter;
  }

  if (
    ["cardio", "endurance", "hiit", "full body", "fullbody", "full-body"].some(
      (k) => g.includes(k)
    )
  ) {
    return MdDirectionsRun;
  }

  if (
    [
      "mobilite",
      "mobilité",
      "mobility",
      "stretching",
      "etirement",
      "etirements",
    ].some((k) => g.includes(k))
  ) {
    return MdSelfImprovement;
  }

  return FaDumbbell;
};

function ExerciseCardComponent({
  exercise,
  onAdd,
  onReplace,
  replaceMode = false,
  isTarget = false,
  onCancelReplace,
  preferredGender,
  showSelectionAction = false,
  selectionActionLabel = "",
}) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { pathname, state: locationState } = location;
  const displayExercise = useMemo(
    () => localizeExercise(exercise, i18n.language || i18n.resolvedLanguage || "fr"),
    [exercise, i18n.language, i18n.resolvedLanguage]
  );

  const isProgramBuilder = useMemo(
    () => pathname.includes("/program-builder"),
    [pathname]
  );

  const resolvedPreferredGender = useMemo(
    () =>
      inferPreferredGender({
        preferredGender,
        exercise: displayExercise,
        pathname,
        locationState,
      }),
    [preferredGender, displayExercise, pathname, locationState]
  );

  const [isOpen, setIsOpen] = useState(false);

  const [resolvedDepartImage, setResolvedDepartImage] = useState("");
  const [resolvedArriveeImage, setResolvedArriveeImage] = useState("");
  const [resolvedVideo, setResolvedVideo] = useState("");

  const [mediaResolved, setMediaResolved] = useState(false);

  const [departLoaded, setDepartLoaded] = useState(false);
  const [arriveeLoaded, setArriveeLoaded] = useState(false);
  const [, setVideoLoaded] = useState(false);

  const [departFailed, setDepartFailed] = useState(false);
  const [arriveeFailed, setArriveeFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const [modalMediaView, setModalMediaView] = useState("video");

  const addingRef = useRef(false);

  const bg = useColorModeValue("rgba(255,255,255,0.9)", "rgba(15,23,42,0.9)");
  const border = useColorModeValue("rgba(148,163,184,0.22)", "rgba(148,163,184,0.22)");
  const strongBorder = useColorModeValue("rgba(100,116,139,0.35)", "rgba(148,163,184,0.34)");
  const text = useColorModeValue("gray.900", "gray.50");
  const muted = useColorModeValue("gray.600", "gray.300");
  const chipBg = useColorModeValue("rgba(248,250,252,0.95)", "rgba(255,255,255,0.06)");
  const imagePanelBg = useColorModeValue("rgba(248,250,252,0.95)", "rgba(255,255,255,0.04)");
  const mediaBg = useColorModeValue("rgba(241,245,249,0.95)", "rgba(15,23,42,0.86)");
  const sectionBg = useColorModeValue("rgba(248,250,252,0.86)", "rgba(255,255,255,0.04)");
  const modalOverlayBg = useColorModeValue("blackAlpha.300", "blackAlpha.700");
  const mediaSurfaceBg = useColorModeValue("white", "rgba(15,23,42,0.94)");
  const dangerText = useColorModeValue("red.600", "red.300");

  const primaryBtnBg = useColorModeValue("gray.900", "white");
  const primaryBtnHover = useColorModeValue("black", "gray.100");
  const primaryBtnColor = useColorModeValue("white", "gray.900");
  
  const ghostBtnHover = useColorModeValue("gray.100", "whiteAlpha.100");
  const detailsBtnBg = useColorModeValue("rgba(15,23,42,0.05)", "rgba(255,255,255,0.08)");
  const detailsBtnHover = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)");
  const detailsBtnColor = useColorModeValue("gray.900", "white");
  const detailsBtnBorder = useColorModeValue("rgba(15,23,42,0.14)", "rgba(255,255,255,0.14)");

  const missing = t("exerciseCard.missing", "Données manquantes");
  const name = displayExercise?.nom || t("exerciseCard.missingName", "Nom manquant");

  const gmArr = safeArr(displayExercise?.groupe_musculaire);
  const groupe = gmArr.length ? gmArr[0] : missing;

  const materielArr = safeArr(displayExercise?.materiel);
  const materiel =
    materielArr.length ? materielArr[0] : t("exerciseCard.none", "Aucun");

  const niveau =
    typeof displayExercise?.niveau === "string" && displayExercise.niveau.trim()
      ? displayExercise.niveau.trim()
      : t("exerciseCard.allLevels", "Tous niveaux");

  const articulationsList =
    displayExercise?.articulations_solicitees ?? displayExercise?.articulations_sollicitees;

  const articulations =
    Array.isArray(articulationsList) && articulationsList.length
      ? articulationsList.join(", ")
      : missing;

  const ligaments =
    Array.isArray(displayExercise?.tendons_solicites) && displayExercise.tendons_solicites.length
      ? displayExercise.tendons_solicites.join(", ")
      : missing;

  const musclesSecondaires =
    Array.isArray(displayExercise?.muscles_secondaires) &&
    displayExercise.muscles_secondaires.length
      ? displayExercise.muscles_secondaires.join(", ")
      : missing;

  const variantes =
    Array.isArray(displayExercise?.variantes) && displayExercise.variantes.length
      ? displayExercise.variantes.join(", ")
      : t("exerciseCard.noVariant", "Aucune variante disponible");

  const contraintes = Array.isArray(displayExercise?.contraintes)
    ? displayExercise.contraintes.length
      ? displayExercise.contraintes.join(", ")
      : t("exerciseCard.noConstraints", "Aucune contrainte spécifiée")
    : displayExercise?.contraintes ||
      t("exerciseCard.noConstraints", "Aucune contrainte spécifiée");

  const genderOrderedMedia = useMemo(
    () => buildGenderOrderedMedia(displayExercise, resolvedPreferredGender),
    [displayExercise, resolvedPreferredGender]
  );

  const MuscleIcon = useMemo(() => muscleIconFromGroup(groupe), [groupe]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setMediaResolved(false);

      setDepartLoaded(false);
      setArriveeLoaded(false);
      setVideoLoaded(false);

      setDepartFailed(false);
      setArriveeFailed(false);
      setVideoFailed(false);

      const [depart, arrivee, video] = await Promise.all([
        resolveOneCandidate(genderOrderedMedia.depart),
        resolveOneCandidate(genderOrderedMedia.arrivee),
        resolveOneCandidate(genderOrderedMedia.video),
      ]);

      if (!cancelled) {
        setResolvedDepartImage(depart || "");
        setResolvedArriveeImage(arrivee || "");
        setResolvedVideo(video || "");
        setMediaResolved(true);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [genderOrderedMedia]);

  const canShowDepart =
    Boolean(resolvedDepartImage) && departLoaded && !departFailed;
  const canShowArrivee =
    Boolean(resolvedArriveeImage) && arriveeLoaded && !arriveeFailed;
  const canShowImages = canShowDepart || canShowArrivee;

  const canShowVideo = Boolean(resolvedVideo) && !videoFailed;
  const canShowAnyMedia = canShowVideo || canShowImages;

  const cardPreviewType = canShowVideo
    ? "video"
    : canShowImages
    ? "images"
    : "empty";

  const cardPreviewImage = canShowDepart
    ? resolvedDepartImage
    : canShowArrivee
    ? resolvedArriveeImage
    : "";

  const mediaBlocks = useMemo(() => {
    const blocks = [];

    if (canShowDepart) {
      blocks.push({
        key: "depart",
        title: t("exerciseCard.images.start", "Position de départ"),
        src: resolvedDepartImage,
        alt: `${name} - départ`,
      });
    }

    if (canShowArrivee) {
      blocks.push({
        key: "arrivee",
        title: t("exerciseCard.images.end", "Position d’arrivée"),
        src: resolvedArriveeImage,
        alt: `${name} - arrivée`,
      });
    }

    return blocks;
  }, [
    canShowDepart,
    canShowArrivee,
    resolvedDepartImage,
    resolvedArriveeImage,
    t,
    name,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    if (canShowVideo) {
      setModalMediaView("video");
      return;
    }

    if (canShowImages) {
      setModalMediaView("images");
      return;
    }

    setModalMediaView("video");
  }, [isOpen, canShowVideo, canShowImages]);

  let label = t("exerciseCard.add", "Ajouter");
  let leftIcon = <AddIcon />;

  if (replaceMode) {
    leftIcon = <MdSwapHoriz />;
    label = isTarget
      ? t("exerciseCard.cancel", "Annuler")
      : t("exerciseCard.replace", "Remplacer");
  }
  if (showSelectionAction && selectionActionLabel) {
    label = selectionActionLabel;
  }

  const fireAction = useCallback(() => {
    if (addingRef.current) return;
    addingRef.current = true;

    try {
      if (replaceMode) {
        if (isTarget && onCancelReplace) onCancelReplace();
        else if (onReplace) onReplace(exercise);
      } else if (onAdd) {
        onAdd({ ...exercise });
      }
    } finally {
      setTimeout(() => {
        addingRef.current = false;
      }, 150);
    }
  }, [replaceMode, isTarget, onCancelReplace, onReplace, onAdd, exercise]);

  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    fireAction();
  };

  const openDetails = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(true);
  };

  const detailSections = useMemo(
    () => [
      {
        key: "main-group",
        icon: MdFitnessCenter,
        label: t("exerciseCard.fields.mainGroup", "Groupe musculaire"),
        value: gmArr.length ? gmArr.join(", ") : missing,
      },
      {
        key: "secondary",
        icon: MdFitnessCenter,
        label: t("exerciseCard.fields.secondary", "Muscles secondaires"),
        value: musclesSecondaires,
      },
      {
        key: "joints",
        icon: MdOutlineHealing,
        label: t("exerciseCard.fields.joints", "Articulations sollicitées"),
        value: articulations,
      },
      {
        key: "ligaments",
        icon: MdOutlineLink,
        label: t("exerciseCard.fields.ligaments", "Ligaments sollicités"),
        value: ligaments,
      },
      {
        key: "variants",
        icon: MdSwapHoriz,
        label: t("exerciseCard.fields.variants", "Variantes"),
        value: variantes,
      },
      {
        key: "constraints",
        icon: MdWarning,
        label: t("exerciseCard.fields.constraints", "Contraintes"),
        value: contraintes,
        tone: "danger",
      },
    ],
    [articulations, contraintes, gmArr, ligaments, missing, musclesSecondaires, t, variantes]
  );

  return (
    <>
      {resolvedDepartImage && (
        <Image
          src={resolvedDepartImage}
          alt=""
          position="absolute"
          w="1px"
          h="1px"
          opacity={0}
          pointerEvents="none"
          onLoad={() => {
            setDepartLoaded(true);
            setDepartFailed(false);
          }}
          onError={() => {
            setDepartFailed(true);
            setDepartLoaded(false);
          }}
        />
      )}

      {resolvedArriveeImage && (
        <Image
          src={resolvedArriveeImage}
          alt=""
          position="absolute"
          w="1px"
          h="1px"
          opacity={0}
          pointerEvents="none"
          onLoad={() => {
            setArriveeLoaded(true);
            setArriveeFailed(false);
          }}
          onError={() => {
            setArriveeFailed(true);
            setArriveeLoaded(false);
          }}
        />
      )}

      <Box
        bg={bg}
        border="1px solid"
        borderColor={border}
        borderRadius="28px"
        overflow="hidden"
        boxShadow="sm"
        backdropFilter="blur(14px)"
        transition="all .16s ease"
        _hover={{
          borderColor: strongBorder,
          transform: "translateY(-1px)",
          boxShadow: "md",
        }}
        color={text}
      >
        {mediaResolved && canShowAnyMedia && (
          <Box px={3} pt={3} pb={0}>
            <Box
              borderRadius="xl"
              overflow="hidden"
              bg={mediaBg}
              border="1px solid"
              borderColor={border}
            >
              <AspectRatio ratio={showSelectionAction ? 16 / 9 : 4 / 3}>
                <Box
                  position="relative"
                  w="100%"
                  h="100%"
                  minH={
                    showSelectionAction
                      ? { base: "150px", md: "170px" }
                      : { base: "220px", md: "260px" }
                  }
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  bg="white"
                  p={2}
                >
                  {cardPreviewType === "video" ? (
                    <LoopingVideo
                      src={resolvedVideo}
                      showControls={false}
                      borderRadius="0"
                      poster={cardPreviewImage}
                      objectFit="contain"
                      onPlayable={() => {
                        setVideoLoaded(true);
                        setVideoFailed(false);
                      }}
                      onError={() => {
                        setVideoFailed(true);
                        setVideoLoaded(false);
                      }}
                    />
                  ) : cardPreviewType === "images" ? (
                    <Image
                      src={cardPreviewImage}
                      alt={`${name} - preview`}
                      maxW="100%"
                      maxH="100%"
                      objectFit="contain"
                      bg="white"
                    />
                  ) : null}
                </Box>
              </AspectRatio>
            </Box>
          </Box>
        )}

        <Box px={4} py={showSelectionAction ? 3 : 4}>
          <VStack align="stretch" spacing={showSelectionAction ? 2 : 3}>
            <HStack spacing={3} align="center">
              <Box
                w="38px"
                h="38px"
                borderRadius="lg"
                bg={chipBg}
                border="1px solid"
                borderColor={border}
                overflow="hidden"
                display="flex"
                alignItems="center"
                justifyContent="center"
                flex="0 0 auto"
              >
                <Icon as={MuscleIcon} boxSize={5} opacity={0.9} />
              </Box>

              <Box flex="1" minW={0}>
                <Text
                  fontWeight="700"
                  fontSize="md"
                  whiteSpace="normal"
                  wordBreak="break-word"
                  lineHeight="1.3"
                >
                  {name}
                </Text>

                <Text fontSize="sm" color={muted} noOfLines={1}>
                  {groupe}
                </Text>
              </Box>

              <Tag
                size="sm"
                borderRadius="full"
                bg={chipBg}
                border="1px solid"
                borderColor={border}
                maxW="42%"
              >
                <TagLabel noOfLines={1}>{materiel}</TagLabel>
              </Tag>
            </HStack>

            {!showSelectionAction && (
              <>
                <HStack spacing={2} wrap="wrap">
                  <Badge borderRadius="full" px={2.5} py={1} colorScheme="gray">
                    {niveau}
                  </Badge>

                  {mediaResolved && canShowVideo && (
                    <Badge borderRadius="full" px={2.5} py={1} colorScheme="gray">
                      {t("exerciseCard.video.badge", "Vidéo")}
                    </Badge>
                  )}

                  {mediaResolved && !canShowVideo && canShowImages && (
                    <Badge borderRadius="full" px={2.5} py={1} colorScheme="gray">
                      {t("exerciseCard.images.badge", "Images")}
                    </Badge>
                  )}
                </HStack>

                <Text fontSize="xs" color={muted} noOfLines={2}>
                  {t(
                    "exerciseCard.meta.fast",
                    "Voir détails pour consignes, média et informations complètes"
                  )}
                </Text>
              </>
            )}

            <HStack spacing={2}>
              {(isProgramBuilder || showSelectionAction) && (
                <Button
                  leftIcon={leftIcon}
                  onClick={handleClick}
                  h="36px"
                  px={4}
                  borderRadius="full"
                  bg={primaryBtnBg}
                  color={primaryBtnColor}
                  fontWeight="700"
                  fontSize={showSelectionAction ? "xs" : "sm"}
                  _hover={{ bg: primaryBtnHover }}
                  _active={{ transform: "scale(0.99)" }}
                  type="button"
                  flex="1"
                >
                  {label}
                </Button>
              )}

              {showSelectionAction ? (
                <IconButton
                  aria-label={t("exerciseCard.details", "Détails")}
                  icon={<InfoOutlineIcon boxSize={4} />}
                  onClick={openDetails}
                  boxSize="38px"
                  minW="38px"
                  borderRadius="full"
                  bg={detailsBtnBg}
                  border="1px solid"
                  borderColor={detailsBtnBorder}
                  color={detailsBtnColor}
                  boxShadow="0 8px 20px rgba(15,23,42,0.06)"
                  _hover={{ bg: detailsBtnHover, transform: "translateY(-1px)" }}
                  _active={{ transform: "scale(0.99)" }}
                  type="button"
                />
              ) : (
                <Button
                  leftIcon={<InfoOutlineIcon boxSize={4} />}
                  onClick={openDetails}
                  h="38px"
                  px={4}
                  borderRadius="full"
                  bg={detailsBtnBg}
                  border="1px solid"
                  borderColor={detailsBtnBorder}
                  color={detailsBtnColor}
                  fontWeight="800"
                  fontSize="sm"
                  boxShadow="0 8px 20px rgba(15,23,42,0.06)"
                  _hover={{ bg: detailsBtnHover, transform: "translateY(-1px)" }}
                  _active={{ transform: "scale(0.99)" }}
                  type="button"
                  flex="1"
                >
                  {t("exerciseCard.details", "Détails")}
                </Button>
              )}
            </HStack>
          </VStack>
        </Box>
      </Box>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        isCentered={false}
        size={{ base: "full", md: "5xl" }}
        scrollBehavior="inside"
        motionPreset="slideInBottom"
      >
        <ModalOverlay bg={modalOverlayBg} backdropFilter="blur(6px)" />
        <ModalContent
          borderRadius={{ base: 0, md: "28px" }}
          bg={bg}
          color={text}
          my={{ base: 0, md: 6 }}
          h={{ base: "100dvh", md: "auto" }}
          maxH={{ base: "100dvh", md: "calc(100vh - 3rem)" }}
          display="flex"
          flexDirection="column"
          overflow="hidden"
          border="1px solid"
          borderColor={border}
          boxShadow="xl"
          backdropFilter="blur(18px)"
        >
          <ModalHeader
            fontWeight="800"
            fontSize={{ base: "xl", md: "2xl" }}
            pr="56px"
            flexShrink={0}
            borderBottom="1px solid"
            borderColor={border}
          >
            {name}
          </ModalHeader>

          <ModalCloseButton zIndex={2} />

          <ModalBody
            pb={6}
            flex="1 1 auto"
            minH={0}
            overflowY="auto"
            overflowX="hidden"
            sx={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
              touchAction: "pan-y",
            }}
          >
            {mediaResolved && canShowAnyMedia && (
              <Box mb={6}>
                <HStack
                  justify="space-between"
                  align="center"
                  mb={3}
                  wrap="wrap"
                  spacing={3}
                >
                  <HStack spacing={2}>
                    <Icon
                      as={
                        modalMediaView === "video"
                          ? MdOutlineVideocam
                          : MdOutlineImage
                      }
                    />
                    <Text fontWeight="900">
                      {t("exerciseCard.media.title", "Démonstration")}
                    </Text>
                  </HStack>

                  <ButtonGroup size="sm" isAttached variant="outline">
                    {canShowVideo && (
                      <Button
                        leftIcon={<Icon as={MdOutlineVideocam} />}
                        onClick={() => setModalMediaView("video")}
                        bg={
                          modalMediaView === "video"
                            ? ghostBtnHover
                            : "transparent"
                        }
                        fontWeight="700"
                        type="button"
                      >
                        {t("exerciseCard.video.button", "Vidéo")}
                      </Button>
                    )}

                    {canShowImages && (
                      <Button
                        leftIcon={<Icon as={MdOutlineImage} />}
                        onClick={() => setModalMediaView("images")}
                        bg={
                          modalMediaView === "images"
                            ? ghostBtnHover
                            : "transparent"
                        }
                        fontWeight="700"
                        type="button"
                      >
                        {t("exerciseCard.images.button", "Photos")}
                      </Button>
                    )}
                  </ButtonGroup>
                </HStack>

                <Box
                  bg={imagePanelBg}
                  border="1px solid"
                  borderColor={border}
                  borderRadius="2xl"
                  p={3}
                >
                  {modalMediaView === "video" && canShowVideo && (
                    <Box
                      w="100%"
                      h={{ base: "260px", md: "420px" }}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      bg={mediaSurfaceBg}
                      borderRadius="lg"
                      overflow="hidden"
                      border="1px solid"
                      borderColor={border}
                    >
                      <Box w="100%" h="100%">
                        <LoopingVideo
                          src={resolvedVideo}
                          showControls={false}
                          borderRadius="lg"
                          poster={cardPreviewImage}
                          objectFit="contain"
                          onPlayable={() => {
                            setVideoLoaded(true);
                            setVideoFailed(false);
                          }}
                          onError={() => {
                            setVideoFailed(true);
                            setVideoLoaded(false);
                            if (canShowImages) {
                              setModalMediaView("images");
                            }
                          }}
                        />
                      </Box>
                    </Box>
                  )}

                  {modalMediaView === "images" && canShowImages && (
                    <SimpleGrid
                      columns={{ base: 1, md: mediaBlocks.length > 1 ? 2 : 1 }}
                      spacing={4}
                    >
                      {mediaBlocks.map((media) => (
                        <Box key={media.key}>
                          <Text fontWeight="800" mb={3}>
                            {media.title}
                          </Text>

                          <Box
                            w="100%"
                            h={{ base: "260px", md: "320px" }}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            bg={mediaSurfaceBg}
                            borderRadius="lg"
                            overflow="hidden"
                            border="1px solid"
                            borderColor={border}
                            p={2}
                          >
                            <Image
                              src={media.src}
                              alt={media.alt}
                              maxW="100%"
                              maxH="100%"
                              objectFit="contain"
                              bg={mediaSurfaceBg}
                            />
                          </Box>
                        </Box>
                      ))}
                    </SimpleGrid>
                  )}
                </Box>

                <Divider mt={6} />
              </Box>
            )}

            <VStack align="stretch" spacing={5}>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
                {detailSections.map((section) => (
                  <Box
                    key={section.key}
                    bg={sectionBg}
                    border="1px solid"
                    borderColor={border}
                    borderRadius="xl"
                    p={4}
                  >
                    <HStack align="start" spacing={3}>
                      <Box pt={0.5}>
                        <Icon
                          as={section.icon}
                          boxSize={5}
                          color={section.tone === "danger" ? dangerText : muted}
                        />
                      </Box>
                      <Box>
                        <Text
                          fontWeight="700"
                          mb={1}
                          color={section.tone === "danger" ? dangerText : text}
                        >
                          {section.label}
                        </Text>
                        <Text color={muted}>{section.value}</Text>
                      </Box>
                    </HStack>
                  </Box>
                ))}
              </SimpleGrid>

              <Box
                bg={sectionBg}
                border="1px solid"
                borderColor={border}
                borderRadius="xl"
                p={{ base: 4, md: 5 }}
              >
                <HStack spacing={3} mb={3}>
                  <Icon as={MdOutlineMenuBook} boxSize={5} color={muted} />
                  <Text fontWeight="800">
                    {t("exerciseCard.fields.cues", "Consignes d'exécution")}
                  </Text>
                </HStack>

                {displayExercise?.consignes && Object.keys(displayExercise.consignes).length > 0 ? (
                  <List spacing={3}>
                    {Object.entries(displayExercise.consignes).map(([key, val], i) => (
                      <ListItem key={i} display="flex" alignItems="start">
                        <ListIcon as={MdCheckCircle} color="green.500" mt="2px" />
                        <Text>
                          <strong>{key} :</strong> {toFlatString(val, missing)}
                        </Text>
                      </ListItem>
                    ))}
                  </List>
                ) : (
                  <Text color={muted}>{missing}</Text>
                )}
              </Box>
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}

export default React.memo(
  ExerciseCardComponent,
  (prev, next) =>
    prev.exercise?.id === next.exercise?.id &&
    prev.replaceMode === next.replaceMode &&
    prev.showSelectionAction === next.showSelectionAction &&
    prev.isTarget === next.isTarget &&
    prev.preferredGender === next.preferredGender
);
