import React from "react";
import {
  Box,
  Button,
  Icon,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  SimpleGrid,
  Text,
  useColorModeValue,
  useDisclosure,
} from "@chakra-ui/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MdOutlineCalendarMonth,
  MdOutlineFitnessCenter,
  MdOutlinePeopleAlt,
  MdOutlineRestaurantMenu,
  MdOutlineNoteAdd,
  MdAutoAwesome,
  MdOutlineSpaceDashboard,
} from "react-icons/md";
import { AddIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import { hasPlanModule } from "../utils/proPlanAccess";
import { COACH_MOBILE_NAV_PREFIXES } from "./mobileNavPaths.js";

export { COACH_MOBILE_NAV_PREFIXES };

function preserveAdminCoachQuery(path, search) {
  const current = new URLSearchParams(search || "");
  const adminCoachId = current.get("adminCoachId");
  if (!adminCoachId) return path;

  const [pathAndQuery, hash = ""] = String(path).split("#");
  const [pathname, query = ""] = pathAndQuery.split("?");
  const next = new URLSearchParams(query);
  next.set("adminCoachId", adminCoachId);
  ["clubId", "adminClubId"].forEach((key) => {
    const value = current.get(key);
    if (value) next.set(key, value);
  });

  const queryString = next.toString();
  return `${pathname}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}

const ROUTE_PRELOADS = {
  "/coach-dashboard": () => import("./CoachDashboard.jsx"),
  "/clients": () => import("./Clients.jsx"),
  "/programmes": () => import("./ProgramsPage.jsx"),
  "/nutrition-coach": () => import("../pages/CoachNutritionPage.jsx"),
  "/statistics-coach": () => import("../pages/StatisticsPageCoach.jsx"),
  "/exercise-bank/program-builder": () => import("./ProgramBuilderPage.jsx"),
  "/auto-program-questionnaire": () => import("./AutoProgramQuestionnaire.jsx"),
};

export default function CoachMobileNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const actionModal = useDisclosure();
  const hasSportAccess = hasPlanModule(user, "sport");
  const hasNutritionAccess = hasPlanModule(user, "nutrition");
  const nutritionOnly = hasNutritionAccess && !hasSportAccess;
  const sportOnly = hasSportAccess && !hasNutritionAccess;

  const activeBg = useColorModeValue("#0F172A", "rgba(255,255,255,0.14)");
  const activeHoverBg = useColorModeValue("#1E293B", "rgba(255,255,255,0.20)");
  const actionGradient = "linear-gradient(90deg, #1F5EFF 0%, #257CFF 52%, #00B8FF 100%)";
  const textColor = useColorModeValue("#0F172A", "white");
  const borderColor = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const bg = useColorModeValue("rgba(255,255,255,0.94)", "rgba(8,13,26,0.94)");
  const ghostHover = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)");
  const shadow = useColorModeValue(
    "0 18px 44px rgba(15,23,42,0.16)",
    "0 18px 44px rgba(0,0,0,0.44)"
  );
  const modalBg = useColorModeValue("white", "#0F172A");
  const modalColor = useColorModeValue("gray.900", "white");
  const modalBorder = useColorModeValue("blackAlpha.100", "whiteAlpha.120");
  const modalActionBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)");
  const modalActionBg = useColorModeValue("white", "rgba(255,255,255,0.03)");
  const modalActionHoverBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const modalActionHoverBorder = useColorModeValue("rgba(15,23,42,0.18)", "rgba(255,255,255,0.26)");
  const modalActionHoverShadow = useColorModeValue(
    "0 10px 24px rgba(15,23,42,0.08)",
    "0 12px 26px rgba(0,0,0,0.24)"
  );
  const fabBorder = useColorModeValue("rgba(255,255,255,0.95)", "rgba(147,197,253,0.36)");
  const fabShadow = useColorModeValue(
    "0 16px 32px rgba(37,99,235,0.34)",
    "0 18px 34px rgba(0,0,0,0.48)"
  );

  const items = [
    { label: t("auto.CoachMobileNav.accueil", "Accueil"), icon: MdOutlineSpaceDashboard, path: "/coach-dashboard" },
    {
      label: nutritionOnly
        ? t("auto.CoachMobileNav.patients", "Patients")
        : t("auto.CoachMobileNav.clients", "Clients"),
      icon: MdOutlinePeopleAlt,
      path: nutritionOnly ? "/clients?view=nutrition" : "/clients",
    },
    { label: t("nav.new", "Nouveau"), icon: AddIcon, action: actionModal.onOpen },
    sportOnly
      ? { label: t("auto.CoachMobileNav.planning", "Planning"), icon: MdOutlineCalendarMonth, path: "/coach-dashboard#planning" }
      : { label: t("nutrition.title", "Nutrition"), icon: MdOutlineRestaurantMenu, path: "/nutrition-coach" },
    nutritionOnly
      ? { label: t("auto.CoachMobileNav.planning", "Planning"), icon: MdOutlineCalendarMonth, path: "/coach-dashboard#planning" }
      : { label: t("auto.CoachMobileNav.programmes", "Programmes"), icon: MdOutlineFitnessCenter, path: "/programmes" },
  ];

  const preloadPath = React.useCallback((path = "") => {
    const key = Object.keys(ROUTE_PRELOADS).find(
      (prefix) =>
        path === prefix ||
        path.startsWith(`${prefix}/`) ||
        path.startsWith(`${prefix}?`) ||
        path.startsWith(`${prefix}#`)
    );
    ROUTE_PRELOADS[key]?.();
  }, []);

  const goTo = (path) => {
    preloadPath(path);
    const target = preserveAdminCoachQuery(path, location.search);
    if (typeof window !== "undefined") {
      const targetUrl = new URL(target, window.location.origin);
      const currentUrl = new URL(`${location.pathname}${location.search}${location.hash}`, window.location.origin);
      const isRetappingCurrentRoute =
        targetUrl.pathname === currentUrl.pathname &&
        targetUrl.search === currentUrl.search &&
        targetUrl.hash === currentUrl.hash;

      if (isRetappingCurrentRoute) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.scrollingElement?.scrollTo?.({ top: 0, behavior: "smooth" });
        document.getElementById("root")?.scrollTo?.({ top: 0, behavior: "smooth" });
        return;
      }
    }
    navigate(target);
    if (typeof window !== "undefined" && path.includes("#planning")) {
      window.setTimeout(() => {
        document.getElementById("coach-calendar-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    }
  };

  const goAction = (path) => {
    actionModal.onClose();
    preloadPath(path);
    navigate(preserveAdminCoachQuery(path, location.search));
  };

  const actions = [
    {
      label: t("nav.new_appointment", "Nouveau rendez-vous"),
      icon: MdOutlineCalendarMonth,
      path: "/coach-dashboard?quickAction=plan",
    },
    ...(hasSportAccess
      ? [
          {
            label: t("nav.new_program_manual", "Nouveau programme manuel"),
            icon: MdOutlineFitnessCenter,
            path: "/exercise-bank/program-builder/new",
          },
          {
            label: t("nav.new_program_guided", "Nouveau programme guidé"),
            icon: MdAutoAwesome,
            path: "/auto-program-questionnaire",
          },
        ]
      : []),
    {
      label: nutritionOnly
        ? t("auto.CoachMobileNav.new_patient", "Nouveau patient")
        : t("nav.new_client", "Nouveau client"),
      icon: MdOutlinePeopleAlt,
      path: "/coach-dashboard?quickAction=client",
    },
    ...(hasNutritionAccess
      ? [
          {
            label: t("nav.new_nutrition_followup", "Nouveau suivi diététique"),
            icon: MdOutlineNoteAdd,
            path: "/nutrition-coach?new=1",
          },
        ]
      : []),
  ];

  React.useEffect(() => {
    if (!actionModal.isOpen) return;
    [
      "/coach-dashboard?quickAction=plan",
      "/coach-dashboard?quickAction=client",
      hasSportAccess ? "/exercise-bank/program-builder/new" : null,
      hasSportAccess ? "/auto-program-questionnaire" : null,
      hasNutritionAccess ? "/nutrition-coach?new=1" : null,
    ]
      .filter(Boolean)
      .forEach(preloadPath);
  }, [actionModal.isOpen, hasNutritionAccess, hasSportAccess, preloadPath]);

  return (
    <>
      <Box
        display={{ base: "block", md: "none" }}
        position="fixed"
        left={3}
        right={3}
        bottom={3}
        zIndex={1200}
        bg={bg}
        border="1px solid"
        borderColor={borderColor}
        borderRadius="24px"
        boxShadow={shadow}
        backdropFilter="blur(18px)"
        px={2}
        py={2}
        data-testid="coach-mobile-nav"
      >
        <SimpleGrid columns={5} spacing={1}>
          {items.map((item) => {
            const itemPath = item.path?.split("#")[0].split("?")[0];
            const isPlanning = item.path?.includes("#planning");
            const isAction = typeof item.action === "function";
            const isActive = !isAction && (isPlanning
              ? location.pathname === "/coach-dashboard" && location.hash === "#planning"
              : location.pathname === itemPath);
            return (
            <Button
              key={item.path || item.label}
              variant={isActive ? "solid" : "ghost"}
              size="sm"
              h={isAction ? "60px" : "54px"}
              borderRadius={isAction ? "20px" : "18px"}
              px={1}
              flexDirection="column"
              gap={1}
              bg={isAction ? actionGradient : isActive ? activeBg : "transparent"}
              color={isActive || isAction ? "white" : textColor}
              boxShadow={isAction ? fabShadow : "none"}
              border={isAction ? "1px solid" : "0"}
              borderColor={isAction ? fabBorder : "transparent"}
              _hover={{
                bg: isAction ? actionGradient : isActive ? activeHoverBg : ghostHover,
                filter: isAction ? "brightness(1.08)" : "none",
              }}
              onMouseEnter={() => !isAction && preloadPath(item.path)}
              onTouchStart={() => !isAction && preloadPath(item.path)}
              onPointerDown={() => !isAction && preloadPath(item.path)}
              onFocus={() => !isAction && preloadPath(item.path)}
              onClick={isAction ? item.action : () => goTo(item.path)}
            >
              <Icon as={item.icon} boxSize={isAction ? "24px" : "18px"} />
              <Text as="span" fontSize={isAction ? "10px" : "9px"} fontWeight="850" lineHeight="1" noOfLines={1}>
                {item.label}
              </Text>
            </Button>
            );
          })}
        </SimpleGrid>
      </Box>

      <Modal isOpen={actionModal.isOpen} onClose={actionModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent
          borderRadius="24px"
          bg={modalBg}
          color={modalColor}
          border="1px solid"
          borderColor={modalBorder}
        >
          <ModalHeader>{t("nav.new", "Nouveau")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <SimpleGrid columns={1} spacing={4} py={4}>
              {actions.map((action) => (
                <Button
                  key={action.path}
                  w="full"
                  borderRadius="16px"
                  leftIcon={<Icon as={action.icon} />}
                  variant="outline"
                  borderColor={modalActionBorder}
                  bg={modalActionBg}
                  transition="all 0.18s ease"
                  _hover={{
                    bg: modalActionHoverBg,
                    borderColor: modalActionHoverBorder,
                    transform: "translateY(-1px)",
                    boxShadow: modalActionHoverShadow,
                  }}
                  onMouseEnter={() => preloadPath(action.path)}
                  onTouchStart={() => preloadPath(action.path)}
                  onPointerDown={() => preloadPath(action.path)}
                  onClick={() => goAction(action.path)}
                >
                  {action.label}
                </Button>
              ))}
            </SimpleGrid>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
