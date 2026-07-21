// src/components/Navbar.jsx
 
import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Flex,
  Box,
  Button,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useColorMode,
  useDisclosure,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  VStack,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  DrawerHeader,
  DrawerBody,
  useBreakpointValue,
  Divider,
  HStack,
  Switch,
  FormControl,
  FormLabel,
  useColorModeValue,
  Text,
  Icon,
  Avatar,
  Portal,
} from "@chakra-ui/react";
import { AddIcon, HamburgerIcon, ChevronDownIcon } from "@chakra-ui/icons";
import {
  MdChevronRight,
  MdOutlineDarkMode,
  MdOutlineFitnessCenter,
  MdOutlineLibraryBooks,
  MdOutlinePeopleAlt,
  MdOutlinePerson,
  MdOutlinePowerSettingsNew,
  MdOutlineSettings,
  MdOutlineSpaceDashboard,
  MdOutlineLightMode,
  MdOutlineInsights,
  MdOutlineRestaurant,
  MdOutlineNoteAdd,
  MdAutoAwesome,
  MdOutlineCalendarMonth,
} from "react-icons/md";
import { useAuth } from "../AuthContext";
import ClientCreation from "./ClientCreation";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import useAutoRevertColorMode from "../hooks/useAutoRevertColorMode";
import { canUseGuidedProgram, canUseNavbarBranding, hasPlanModule } from "../utils/proPlanAccess";

/* ========= ROUTES ========= */
const ROUTES = {
  home: "/",
  autoQuestionnaire: "/auto-program-questionnaire",
  clientQuestionnaire: "/questionnaire",
  coachBuilderNew: "/exercise-bank/program-builder/new",
  admin: "/admin",
  clubDashboard: "/club-dashboard",
  coachDashboard: "/coach-dashboard",
  coachProfile: "/coach/profile",
  coachSettings: "/settings-coach",
  coachPrograms: "/programmes",
  coachClients: "/clients",
  coachNutrition: "/nutrition-coach",
  coachStats: "/statistics-coach",
  exerciseBank: "/exercise-bank",
  clientDashboard: "/user-dashboard",
  clientProfile: "/profile",
  clientPrograms: "/mes-programmes",
  clientNutrition: "/nutrition",
  clientStats: "/statistiques",
  clientSettings: "/settings",
  login: "/login",
  register: "/register",
};
/* ========================= */

const NAV_ROUTE_PRELOADS = {
  [ROUTES.home]: () => import("./HomePage.jsx"),
  [ROUTES.login]: () => import("../pages/Login.jsx"),
  [ROUTES.register]: () => import("../pages/Register.jsx"),
  [ROUTES.autoQuestionnaire]: () => import("./AutoProgramQuestionnaire.jsx"),
  [ROUTES.clientQuestionnaire]: () => import("./AutoProgramQuestionnaire.jsx"),
  [ROUTES.coachBuilderNew]: () => import("./ProgramBuilderPage.jsx"),
  [ROUTES.admin]: () => import("./AdminDashboard.jsx"),
  [ROUTES.clubDashboard]: () => import("../pages/ClubDashboard.jsx"),
  [ROUTES.coachDashboard]: () => import("./CoachDashboard.jsx"),
  [ROUTES.coachProfile]: () => import("../pages/ProfilePageCoach.jsx"),
  [ROUTES.coachSettings]: () => import("../pages/SettingsPageCoach.jsx"),
  [ROUTES.coachPrograms]: () => import("./ProgramsPage.jsx"),
  [ROUTES.coachClients]: () => import("./Clients.jsx"),
  [ROUTES.coachNutrition]: () => import("../pages/CoachNutritionPage.jsx"),
  [ROUTES.coachStats]: () => import("../pages/StatisticsPageCoach.jsx"),
  [ROUTES.exerciseBank]: () => import("./ExerciseBank.jsx"),
  [ROUTES.clientDashboard]: () => import("./Clientdashboard.jsx"),
  [ROUTES.clientProfile]: () => import("../pages/ProfilePageClient.jsx"),
  [ROUTES.clientPrograms]: () => import("../pages/MyPrograms.jsx"),
  [ROUTES.clientNutrition]: () => import("../pages/ClientNutritionPage.jsx"),
  [ROUTES.clientStats]: () => import("../pages/StatisticsPageClient.jsx"),
  [ROUTES.clientSettings]: () => import("../pages/SettingsPageClient.jsx"),
};

const DEFAULT_BRAND_LABEL = "BoostYourLife.coach";

export default function Navbar() {
  const { t } = useTranslation();
  const nav = (k, fb) => t(k, fb);
  const { user, logout, isAdmin, effectiveRole, setViewAs } = useAuth();

  const displayFirstName =
    user?.firstName ||
    user?.prenom ||
    user?.displayName?.split?.(" ")?.[0] ||
    "";

  const displayLastName = user?.lastName || user?.nom || "";

  const displayFullName =
    `${displayFirstName} ${displayLastName}`.trim() ||
    user?.displayName ||
    "User";

  const { colorMode, setColorMode } = useColorMode();
  const { markManualChoice } = useAutoRevertColorMode();

  const choiceModal = useDisclosure();
  const clientModal = useDisclosure();
  const mobileNav = useDisclosure();

  const navigate = useNavigate();
  const location = useLocation();

  const isAuthPage = [ROUTES.login, ROUTES.register].includes(location.pathname);
  const isDesktop = useBreakpointValue({ base: false, lg: true });
  const isHome = location.pathname === ROUTES.home;

  const roleEffective = effectiveRole;
  const showCoachUI = roleEffective === "coach";
  const isClient = user?.role === "particulier";
  const isClubOwner =
    user?.role === "coach" &&
    (user?.accountType === "club_owner" || user?.clubRole === "owner");
  const isClubContext =
    (user?.role === "coach" || user?.role === "admin") &&
    (isClubOwner || location.pathname.startsWith(ROUTES.clubDashboard));
  const clubBrandAllowed =
    isClubOwner &&
    user?.clubName &&
    (user?.packageTier === "network" || Number(user?.proLimit || 0) >= 20);
  const navbarBrandAllowed = canUseNavbarBranding(
    user?.proAccess || {
      packageKey: user?.packageKey,
      packageTier: user?.packageTier,
      branding: user?.branding,
    }
  );
  const guidedProgramAllowed = canUseGuidedProgram(
    user?.proAccess || {
      packageKey: user?.packageKey,
      packageTier: user?.packageTier,
      branding: user?.branding,
    }
  );
  const hasNutritionAccess = hasPlanModule(user, "nutrition");
  const hasSportAccess = hasPlanModule(user, "sport");
  const isNutritionOnlyCoach = showCoachUI && hasNutritionAccess && !hasSportAccess;
  const isMixedCoach = showCoachUI && hasNutritionAccess && hasSportAccess;
  const customNavbarName = (
    user?.settings?.navbarBrandName ||
    user?.companyName ||
    user?.businessName ||
    user?.cabinetName ||
    displayFullName
  )?.trim?.();
  const brandLabel =
    clubBrandAllowed && user?.clubName
      ? user.clubName
      : navbarBrandAllowed && customNavbarName
        ? customNavbarName
        : DEFAULT_BRAND_LABEL;
  const adminCoachId = new URLSearchParams(location.search).get("adminCoachId") || "";
  const clientCustomProgramLabel = nav("nav.create_my_program", "Créer mon programme");
  const withAdminCoach = (path) => {
    if (isClubContext || !isAdmin || !showCoachUI || !adminCoachId) return path;
    return `${path}${path.includes("?") ? "&" : "?"}adminCoachId=${encodeURIComponent(adminCoachId)}`;
  };
  const preloadPath = React.useCallback((path = "") => {
    const normalizedPath = String(path).split("?")[0].split("#")[0] || ROUTES.home;
    const exactLoader = NAV_ROUTE_PRELOADS[normalizedPath];
    const prefix = Object.keys(NAV_ROUTE_PRELOADS)
      .filter((route) => route !== ROUTES.home)
      .find((route) => normalizedPath.startsWith(`${route}/`));
    const loader = exactLoader || NAV_ROUTE_PRELOADS[prefix];
    loader?.().catch(() => {});
  }, []);
  const preloadInteractionProps = React.useCallback(
    (path) => ({
      onMouseEnter: () => preloadPath(path),
      onTouchStart: () => preloadPath(path),
      onPointerDown: () => preloadPath(path),
      onFocus: () => preloadPath(path),
    }),
    [preloadPath]
  );

  const handleLogout = () => {
    logout();
    setTimeout(() => navigate(ROUTES.home), 100);
  };

  const goToClientQuestionnaire = () => {
    choiceModal.onClose();
    mobileNav.onClose();
    navigate(ROUTES.clientQuestionnaire);
  };

  const coachLinks = [
    { label: nav("nav.dashboard", "Tableau de bord"), to: ROUTES.coachDashboard, icon: MdOutlineSpaceDashboard },
    { label: isNutritionOnlyCoach ? nav("nav.my_patients", "Mes patients") : nav("nav.my_clients", "Mes clients"), to: ROUTES.coachClients, icon: MdOutlinePeopleAlt },
    { label: nav("nav.my_patients", "Mes patients"), to: `${ROUTES.coachClients}?view=nutrition`, icon: MdOutlineRestaurant, mixedOnly: true },
    { label: nav("nav.nutrition", "Nutrition"), to: ROUTES.coachNutrition, icon: MdOutlineRestaurant },
    { label: nav("nav.all_programs", "Tous les programmes"), to: ROUTES.coachPrograms, icon: MdOutlineFitnessCenter },
    { label: nav("nav.exercise_bank", "Banque d'exercices"), to: ROUTES.exerciseBank, icon: MdOutlineLibraryBooks },
    { label: nav("nav.statistics", "Statistiques"), to: ROUTES.coachStats, icon: MdOutlineInsights },
    { label: nav("nav.profile", "Profil"), to: ROUTES.coachProfile, icon: MdOutlinePerson },
  ];

  const clientLinks = [
    { label: nav("nav.dashboard", "Tableau de bord"), to: ROUTES.clientDashboard, icon: MdOutlineSpaceDashboard },
    { label: nav("nav.profile", "Profil"), to: ROUTES.clientProfile, icon: MdOutlinePerson },
    { label: nav("nav.my_programs", "Mes programmes"), to: ROUTES.clientPrograms, icon: MdOutlineFitnessCenter },
    { label: nav("nav.nutrition", "Nutrition"), to: ROUTES.clientNutrition, icon: MdOutlineRestaurant },
    { label: nav("nav.statistics", "Statistiques"), to: ROUTES.clientStats, icon: MdOutlineInsights },
  ];

  const clubLinks = [
    { label: nav("nav.club_dashboard", "Dashboard club"), to: ROUTES.clubDashboard, icon: MdOutlineSpaceDashboard },
    { label: nav("nav.create_pro", "Créer un pro"), to: `${ROUTES.clubDashboard}/create`, icon: MdOutlinePerson },
    { label: nav("nav.club_pros", "Pros du club"), to: `${ROUTES.clubDashboard}/team`, icon: MdOutlinePeopleAlt },
    { label: nav("nav.club_calendar", "Calendrier club"), to: `${ROUTES.clubDashboard}/calendrier`, icon: MdOutlineCalendarMonth },
    { label: nav("nav.club_clients", "Clients du club"), to: `${ROUTES.clubDashboard}/clients`, icon: MdOutlinePeopleAlt },
    { label: nav("nav.club_programs", "Programmes du club"), to: `${ROUTES.clubDashboard}/programmes`, icon: MdOutlineLibraryBooks },
    { label: nav("nav.club_nutrition", "Nutrition du club"), to: `${ROUTES.clubDashboard}/nutrition`, icon: MdOutlineRestaurant },
    { label: nav("nav.club_statistics", "Statistiques club"), to: `${ROUTES.clubDashboard}/statistiques`, icon: MdOutlineInsights },
    { label: nav("nav.club_settings", "Réglages club"), to: `${ROUTES.clubDashboard}/settings`, icon: MdOutlineSettings },
  ];

  const linksToShow = (isClubContext ? clubLinks : showCoachUI ? coachLinks : clientLinks).filter((link) => {
    if (link.mixedOnly) return isMixedCoach;
    if (link.to === ROUTES.coachNutrition) return hasNutritionAccess;
    if (link.to === `${ROUTES.clubDashboard}/nutrition`) return isAdmin || isClubOwner || hasNutritionAccess;
    if (link.to === ROUTES.coachPrograms || link.to === ROUTES.exerciseBank) return isClubContext || isAdmin || hasSportAccess;
    return true;
  });
  const settingsTo = isClubContext ? `${ROUTES.clubDashboard}/settings` : showCoachUI ? ROUTES.coachSettings : ROUTES.clientSettings;

  const headerBg = useColorModeValue("rgba(255,255,255,0.86)", "rgba(10,14,24,0.82)");
  const headerBorder = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.08)");
  const headerText = useColorModeValue("gray.900", "white");
  const actionBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const actionBorder = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.10)");
  const logoText = useColorModeValue("blue.700", "white");
  const primaryActionBg = useColorModeValue("#111827", "rgba(255,255,255,0.16)");
  const primaryActionHoverBg = useColorModeValue("#1F2937", "rgba(255,255,255,0.22)");
  const primaryActionActiveBg = useColorModeValue("#374151", "rgba(255,255,255,0.28)");
  const adminLabelColor = useColorModeValue("orange.500", "yellow.200");
  const accountHoverBg = useColorModeValue("rgba(15,23,42,0.07)", "rgba(255,255,255,0.10)");
  const avatarBg = useColorModeValue("gray.100", "whiteAlpha.160");
  const avatarColor = useColorModeValue("gray.700", "white");
  const logoutBorderColor = useColorModeValue("rgba(239,68,68,0.14)", "rgba(252,165,165,0.20)");
  const logoutBg = useColorModeValue("rgba(239,68,68,0.04)", "rgba(239,68,68,0.08)");
  const logoutColor = useColorModeValue("red.500", "red.300");
  const logoutHoverBg = useColorModeValue("rgba(239,68,68,0.10)", "rgba(239,68,68,0.14)");
  const logoutIconBg = useColorModeValue("rgba(239,68,68,0.08)", "rgba(239,68,68,0.14)");
  const logoutIconBorder = useColorModeValue("rgba(239,68,68,0.18)", "rgba(252,165,165,0.22)");
  const logoutChevronColor = useColorModeValue("red.300", "red.200");

  const menuPanelBg = useColorModeValue("white", "#0F172A");
  const menuFg = useColorModeValue("gray.900", "white");
  const menuMuted = useColorModeValue("gray.500", "rgba(255,255,255,0.56)");
  const menuBd = useColorModeValue("blackAlpha.100", "whiteAlpha.120");
  const menuItemHover = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.10)");
  const menuItemActiveBg = useColorModeValue(
    "rgba(15,23,42,0.06)",
    "rgba(255,255,255,0.10)"
  );
  const menuItemBorder = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.06)");
  const menuItemActiveBorder = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.16)");
  const menuItemTextHover = useColorModeValue("gray.900", "white");
  const menuItemIconBg = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)");
  const menuItemIconBorder = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.12)");
  const menuPanelAccent = useColorModeValue(
    "radial-gradient(circle at top right, rgba(59,130,246,0.14), transparent 34%), radial-gradient(circle at bottom left, rgba(16,185,129,0.12), transparent 28%)",
    "radial-gradient(circle at top right, rgba(59,130,246,0.18), transparent 38%), radial-gradient(circle at bottom left, rgba(16,185,129,0.14), transparent 32%)"
  );

  const mobileDrawerBg = useColorModeValue("rgba(255,255,255,0.98)", "rgba(10,14,24,0.98)");
  const mobileSectionBg = useColorModeValue("rgba(255,255,255,0.72)", "rgba(15,23,42,0.78)");
  const mobileItemHover = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.10)");
  const mobileItemActiveBg = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.12)");
  const mobileItemTextHover = useColorModeValue("gray.900", "white");
  const mobileSectionBorder = useColorModeValue("rgba(15,23,42,0.08)", "rgba(148,163,184,0.22)");
  const mobileSectionShadow = useColorModeValue(
    "0 20px 50px rgba(15,23,42,0.08)",
    "0 20px 60px rgba(0,0,0,0.35)"
  );
  const mobileItemBg = useColorModeValue("rgba(255,255,255,0.02)", "rgba(255,255,255,0.02)");
  const mobileItemBorder = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.06)");
  const mobileItemActiveBorder = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.16)");
  const mobileItemActiveText = useColorModeValue("gray.900", "white");
  const mobileItemActiveGradient = useColorModeValue(
    "rgba(15,23,42,0.08)",
    "rgba(255,255,255,0.12)"
  );
  const mobileIconBg = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)");
  const mobileIconBorder = useColorModeValue("rgba(15,23,42,0.08)", "rgba(255,255,255,0.12)");
  const mobileDrawerAccent = useColorModeValue(
    "radial-gradient(circle at top right, rgba(59,130,246,0.18), transparent 38%), radial-gradient(circle at bottom left, rgba(16,185,129,0.16), transparent 32%)",
    "radial-gradient(circle at top right, rgba(59,130,246,0.22), transparent 42%), radial-gradient(circle at bottom left, rgba(16,185,129,0.18), transparent 36%)"
  );
  const modalActionBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.14)");
  const modalActionBg = useColorModeValue("white", "rgba(255,255,255,0.03)");
  const modalActionHoverBg = useColorModeValue("rgba(15,23,42,0.04)", "rgba(255,255,255,0.06)");
  const modalActionHoverBorder = useColorModeValue("rgba(15,23,42,0.18)", "rgba(255,255,255,0.26)");
  const modalActionHoverShadow = useColorModeValue(
    "0 10px 24px rgba(15,23,42,0.08)",
    "0 12px 26px rgba(0,0,0,0.24)"
  );

  const shadow = useColorModeValue(
    "0 12px 30px rgba(15,23,42,0.08)",
    "0 12px 30px rgba(0,0,0,0.30)"
  );

  const adminSwitchChecked = isAdmin && roleEffective === "admin";

  const themeLabel =
    colorMode === "light"
      ? nav("nav.dark_mode", "Mode nuit")
      : nav("nav.light_mode", "Mode jour");

  const handleThemeToggle = () => {
    const next = colorMode === "light" ? "dark" : "light";
    setColorMode(next);
    markManualChoice(next);
  };

  const isCurrentRoute = (to) => {
    const [targetPath, targetSearch = ""] = to.split("?");
    if (location.pathname !== targetPath) return false;
    if (!targetSearch) {
      if (targetPath === ROUTES.coachClients && new URLSearchParams(location.search).get("view") === "nutrition") {
        return false;
      }
      return true;
    }
    const currentParams = new URLSearchParams(location.search);
    const targetParams = new URLSearchParams(targetSearch);
    return [...targetParams.entries()].every(([key, value]) => currentParams.get(key) === value);
  };

  const langFixSx = useColorModeValue(
    {
      "& .chakra-button": {
        bg: "blackAlpha.50",
        color: "gray.800",
        border: "1px solid",
        borderColor: "blackAlpha.200",
        borderRadius: "10px",
        fontWeight: "700",
      },
      "& .chakra-button:hover": {
        bg: "blackAlpha.100",
      },
      "& .chakra-button[aria-pressed='true'], & .chakra-button[aria-current='true'], & .chakra-button[data-active='true']":
        {
          bg: "#111827",
          color: "white",
          borderColor: "#111827",
        },
    },
    {
      "& .chakra-button": {
        bg: "whiteAlpha.100",
        color: "white",
        border: "1px solid",
        borderColor: "whiteAlpha.200",
        borderRadius: "10px",
        fontWeight: "700",
      },
      "& .chakra-button:hover": {
        bg: "whiteAlpha.160",
      },
      "& .chakra-button[aria-pressed='true'], & .chakra-button[aria-current='true'], & .chakra-button[data-active='true']":
        {
          bg: "rgba(255,255,255,0.16)",
          color: "white",
          borderColor: "rgba(255,255,255,0.16)",
        },
    }
  );

  const QuickCoachActions = ({ compact = false, onAfterClick }) => (
    <HStack spacing={2} flexWrap="wrap">
      <Button
        data-tour="coach-new"
        leftIcon={<AddIcon />}
        size={compact ? "sm" : "md"}
        h={compact ? "40px" : "44px"}
        px={compact ? 4 : 5}
        borderRadius="16px"
        bg={primaryActionBg}
        color="white"
        fontWeight="800"
        letterSpacing="-0.01em"
        _hover={{ bg: primaryActionHoverBg }}
        _active={{ bg: primaryActionActiveBg }}
        onClick={() => {
          choiceModal.onOpen();
          onAfterClick?.();
        }}
      >
        {nav("nav.new", "Nouveau")}
      </Button>
    </HStack>
  );

  return (
    <>
      <Flex
        as="nav"
        position="sticky"
        top={0}
        zIndex={30}
        px={{ base: 3, md: 5 }}
        py={3}
        bg={headerBg}
        backdropFilter="blur(14px)"
        borderBottom="1px solid"
        borderColor={headerBorder}
        color={headerText}
        align="center"
        justify="space-between"
        w="100%"
        boxShadow={shadow}
      >
        <HStack spacing={4} minW={0} flexShrink={1}>
          <Box
            as={Link}
            to={ROUTES.home}
            fontSize={{ base: "lg", md: "2xl" }}
            fontWeight="900"
            color={logoText}
            _hover={{ textDecoration: "none", opacity: 0.92 }}
            letterSpacing="-0.02em"
            minW={0}
          >
            {brandLabel}
          </Box>
        </HStack>

        {isDesktop && !isAuthPage && user ? (
          <HStack spacing={3} flexShrink={0} ml="auto">
            {isAdmin && (
              <FormControl display="flex" alignItems="center" w="auto">
                <FormLabel
                  htmlFor="toggle-admin"
                  mb="0"
                  color={adminLabelColor}
                  fontWeight="700"
                >
                  {nav("nav.admin_view", "Admin")}
                </FormLabel>
                <Switch
                  id="toggle-admin"
                  isChecked={adminSwitchChecked}
                  onChange={() => {
                    const goAdmin = !adminSwitchChecked;
                    setViewAs(goAdmin ? "admin" : "coach");
                    navigate(goAdmin ? ROUTES.admin : withAdminCoach(ROUTES.coachDashboard));
                  }}
                  colorScheme="yellow"
                />
              </FormControl>
            )}

            {showCoachUI && !isClubContext && <QuickCoachActions compact />}

            {isClient && (
              <Button
                data-tour="client-custom-program"
                leftIcon={<AddIcon />}
                size="sm"
                h="40px"
                px={4}
                borderRadius="16px"
                bg={primaryActionBg}
                color="white"
                fontWeight="800"
                _hover={{ bg: primaryActionHoverBg }}
                _active={{ bg: primaryActionActiveBg }}
                {...preloadInteractionProps(ROUTES.clientQuestionnaire)}
                onClick={goToClientQuestionnaire}
              >
                {clientCustomProgramLabel}
              </Button>
            )}

            <Menu placement="bottom-end" isLazy strategy="fixed" gutter={10}>
              <MenuButton
                as={Button}
                rightIcon={<ChevronDownIcon />}
                variant="outline"
                borderRadius="18px"
                bg={actionBg}
                borderColor={actionBorder}
                color={headerText}
                _hover={{
                  bg: accountHoverBg,
                }}
                px={3}
                h="44px"
              >
                <HStack spacing={2}>
                  <Avatar
                    size="sm"
                    name={displayFullName}
                    bg={avatarBg}
                    color={avatarColor}
                  />
                  <Text display={{ base: "none", xl: "block" }} maxW="120px" noOfLines={1} fontWeight="800">
                    {displayFirstName || nav("greeting.coach", "Compte")}
                  </Text>
                </HStack>
              </MenuButton>

              <Portal>
                <MenuList
                  zIndex={2000}
                  bg={menuPanelBg}
                  backgroundImage={menuPanelAccent}
                  color={menuFg}
                  borderColor={menuBd}
                  p={3}
                  minW="300px"
                  w="320px"
                  maxW="calc(100vw - 24px)"
                  maxH="calc(100vh - 96px)"
                  overflowY="auto"
                  overflowX="hidden"
                  borderRadius="24px"
                  boxShadow="2xl"
                  backdropFilter="blur(16px)"
                >
                  <VStack align="stretch" spacing={2}>
                    <Box px={2} pt={1} pb={1}>
                      <Text
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="0.08em"
                        color={menuMuted}
                        fontWeight="800"
                      >
                        {isClubContext ? "Espace Club" : "Navigation"}
                      </Text>
                    </Box>

                    {linksToShow.map((link) => (
                      <MenuItem
                        as={Link}
                        to={withAdminCoach(link.to)}
                        key={link.to}
                        {...preloadInteractionProps(link.to)}
                        bg={isCurrentRoute(link.to) ? menuItemActiveBg : "transparent"}
                        py={3}
                        px={3}
                        borderRadius="18px"
                        border="1px solid"
                        borderColor={isCurrentRoute(link.to) ? menuItemActiveBorder : menuItemBorder}
                        fontWeight="800"
                        fontSize="md"
                        whiteSpace="normal"
                        transition="all 0.2s ease"
                        _hover={{
                          bg: menuItemHover,
                          color: menuItemTextHover,
                          transform: "translateX(2px)",
                          boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                        }}
                        _focus={{
                          bg: menuItemHover,
                          color: menuItemTextHover,
                          boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                        }}
                      >
                        <HStack w="full" justify="space-between" spacing={3}>
                          <HStack spacing={3} minW={0}>
                            <Flex
                              w="38px"
                              h="38px"
                              borderRadius="14px"
                              align="center"
                              justify="center"
                              bg={menuItemIconBg}
                              border="1px solid"
                              borderColor={menuItemIconBorder}
                              color={isCurrentRoute(link.to) ? mobileItemActiveText : menuItemTextHover}
                              flexShrink={0}
                            >
                              <Icon as={link.icon} boxSize="18px" />
                            </Flex>
                            <Text fontWeight="800" noOfLines={2}>
                              {link.label}
                            </Text>
                          </HStack>
                          <Icon as={MdChevronRight} boxSize="18px" color={menuMuted} flexShrink={0} />
                        </HStack>
                      </MenuItem>
                    ))}

                    <Divider borderColor={menuBd} my={2} />

                    <Box px={2} pb={1}>
                      <Text
                        fontSize="xs"
                        textTransform="uppercase"
                        letterSpacing="0.08em"
                        color={menuMuted}
                        fontWeight="800"
                      >{t("settings.sections.preferences", "Préférences")}</Text>
                    </Box>

                    <MenuItem
                      as={Link}
                      to={settingsTo}
                      {...preloadInteractionProps(settingsTo)}
                      py={3}
                      px={3}
                      borderRadius="18px"
                      border="1px solid"
                      borderColor={isCurrentRoute(settingsTo) ? menuItemActiveBorder : menuItemBorder}
                      bg={isCurrentRoute(settingsTo) ? menuItemActiveBg : "transparent"}
                      fontWeight="800"
                      fontSize="md"
                      transition="all 0.2s ease"
                      _hover={{
                        bg: menuItemHover,
                        color: menuItemTextHover,
                        transform: "translateX(2px)",
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                      }}
                      _focus={{
                        bg: menuItemHover,
                        color: menuItemTextHover,
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                      }}
                    >
                      <HStack w="full" justify="space-between" spacing={3}>
                        <HStack spacing={3}>
                          <Flex
                            w="38px"
                            h="38px"
                            borderRadius="14px"
                            align="center"
                            justify="center"
                            bg={menuItemIconBg}
                            border="1px solid"
                            borderColor={menuItemIconBorder}
                            color={isCurrentRoute(settingsTo) ? mobileItemActiveText : menuItemTextHover}
                            flexShrink={0}
                          >
                            <Icon as={MdOutlineSettings} boxSize="18px" />
                          </Flex>
                          <Text fontWeight="800">{nav("nav.settings", "Paramètres")}</Text>
                        </HStack>
                        <Icon as={MdChevronRight} boxSize="18px" color={menuMuted} flexShrink={0} />
                      </HStack>
                    </MenuItem>

                    <MenuItem
                      onClick={handleThemeToggle}
                      py={3}
                      px={3}
                      borderRadius="18px"
                      border="1px solid"
                      borderColor={menuItemBorder}
                      fontWeight="800"
                      fontSize="md"
                      transition="all 0.2s ease"
                      _hover={{
                        bg: menuItemHover,
                        color: menuItemTextHover,
                        transform: "translateX(2px)",
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                      }}
                      _focus={{
                        bg: menuItemHover,
                        color: menuItemTextHover,
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                      }}
                    >
                      <HStack w="full" justify="space-between" spacing={3}>
                        <HStack spacing={3}>
                          <Flex
                            w="38px"
                            h="38px"
                            borderRadius="14px"
                            align="center"
                            justify="center"
                            bg={menuItemIconBg}
                            border="1px solid"
                            borderColor={menuItemIconBorder}
                            color={menuItemTextHover}
                            flexShrink={0}
                          >
                            <Icon as={colorMode === "light" ? MdOutlineDarkMode : MdOutlineLightMode} boxSize="18px" />
                          </Flex>
                          <Text fontWeight="800">{themeLabel}</Text>
                        </HStack>
                        <Icon as={MdChevronRight} boxSize="18px" color={menuMuted} flexShrink={0} />
                      </HStack>
                    </MenuItem>

                    <Box pt={1} px={2} display="flex" justifyContent="flex-start" sx={langFixSx}>
                      <LanguageSwitcher />
                    </Box>

                    <Divider borderColor={menuBd} my={2} />

                    <MenuItem
                      onClick={handleLogout}
                      py={3}
                      px={3}
                      borderRadius="18px"
                      border="1px solid"
                      borderColor={logoutBorderColor}
                      bg={logoutBg}
                      fontWeight="800"
                      fontSize="md"
                      color={logoutColor}
                      transition="all 0.2s ease"
                      _hover={{
                        bg: logoutHoverBg,
                        transform: "translateX(2px)",
                      }}
                      _focus={{ bg: logoutHoverBg }}
                    >
                      <HStack w="full" justify="space-between" spacing={3}>
                        <HStack spacing={3}>
                          <Flex
                            w="38px"
                            h="38px"
                            borderRadius="14px"
                            align="center"
                            justify="center"
                            bg={logoutIconBg}
                            border="1px solid"
                            borderColor={logoutIconBorder}
                            flexShrink={0}
                          >
                            <Icon as={MdOutlinePowerSettingsNew} boxSize="18px" />
                          </Flex>
                          <Text fontWeight="800">{nav("nav.logout", "Se déconnecter")}</Text>
                        </HStack>
                        <Icon as={MdChevronRight} boxSize="18px" color={logoutChevronColor} flexShrink={0} />
                      </HStack>
                    </MenuItem>
                  </VStack>
                </MenuList>
              </Portal>
            </Menu>
          </HStack>
        ) : null}

        {isDesktop && isHome && !user && !isAuthPage && (
          <HStack spacing={2}>
            <Button
              as={Link}
              to={ROUTES.login}
              {...preloadInteractionProps(ROUTES.login)}
              variant="outline"
              borderRadius="16px"
              borderColor={actionBorder}
              bg={actionBg}
              color={headerText}
              size="sm"
            >
              {nav("nav.login", "Connexion")}
            </Button>
            <Button
              as={Link}
              to={ROUTES.register}
              {...preloadInteractionProps(ROUTES.register)}
              variant="outline"
              borderRadius="16px"
              borderColor={actionBorder}
              bg={actionBg}
              color={headerText}
              size="sm"
            >
              {nav("nav.register", "Inscription")}
            </Button>
          </HStack>
        )}

        {!isDesktop && !isAuthPage && (
          <HStack spacing={2}>
            {user ? (
              <IconButton
                aria-label={nav("nav.open_menu", "Ouvrir le menu")}
                icon={<HamburgerIcon />}
                borderRadius="16px"
                variant="outline"
                borderColor={actionBorder}
                bg={actionBg}
                color={headerText}
                onClick={mobileNav.onOpen}
              />
            ) : (
              <>
                <Button
                  as={Link}
                  to={ROUTES.login}
                  {...preloadInteractionProps(ROUTES.login)}
                  variant="outline"
                  borderRadius="16px"
                  borderColor={actionBorder}
                  bg={actionBg}
                  color={headerText}
                  size="sm"
                >
                  {nav("nav.login", "Connexion")}
                </Button>
                <Button
                  as={Link}
                  to={ROUTES.register}
                  {...preloadInteractionProps(ROUTES.register)}
                  variant="outline"
                  borderRadius="16px"
                  borderColor={actionBorder}
                  bg={actionBg}
                  color={headerText}
                  size="sm"
                >
                  {nav("nav.register", "Inscription")}
                </Button>
              </>
            )}
          </HStack>
        )}
      </Flex>

      <Drawer isOpen={mobileNav.isOpen} onClose={mobileNav.onClose} placement="right" size="xs">
        <DrawerOverlay bg={useColorModeValue("blackAlpha.400", "blackAlpha.700")} backdropFilter="blur(6px)" />
        <DrawerContent
          bg={mobileDrawerBg}
          backgroundImage={mobileDrawerAccent}
          color={menuFg}
          borderLeft="1px solid"
          borderColor={menuBd}
          boxShadow="2xl"
          backdropFilter="blur(18px)"
        >
          <DrawerCloseButton top={4} right={4} />
          <DrawerHeader
            pt={5}
            pb={4}
            borderBottom="1px solid"
            borderColor={menuBd}
          >
            <VStack align="start" spacing={1} pr={10}>
              <Text fontSize="lg" fontWeight="900" letterSpacing="-0.02em">
                {isClubContext ? "Menu Club" : nav("nav.menu", "Menu")}
              </Text>
              <Text fontSize="sm" color={menuMuted}>
                {isClubContext
                  ? "Pilotage de la structure"
                  : isNutritionOnlyCoach
                    ? "Espace nutrition"
                    : displayFirstName || displayFullName}
              </Text>
            </VStack>
          </DrawerHeader>

          <DrawerBody px={4} py={4}>
            <VStack align="stretch" spacing={4} mt={1} w="full">
              {showCoachUI && !isClubContext && (
                <Box
                  p={3}
                  borderRadius="22px"
                  bg={mobileSectionBg}
                  border="1px solid"
                  borderColor={mobileSectionBorder}
                  boxShadow={mobileSectionShadow}
                  backdropFilter="blur(14px)"
                >
                  <VStack align="stretch" spacing={3}>
                    <Text
                      fontSize="xs"
                      textTransform="uppercase"
                      letterSpacing="0.08em"
                      color={menuMuted}
                      fontWeight="800"
                    >
                      {t("dashboard.cards.eyebrow_actions", "Actions")}
                    </Text>
                    <QuickCoachActions compact onAfterClick={mobileNav.onClose} />
                  </VStack>
                </Box>
              )}

              {isClient && (
                <Button
                  leftIcon={<AddIcon />}
                  borderRadius="16px"
                  bg={primaryActionBg}
                  color="white"
                  _hover={{ bg: primaryActionHoverBg }}
                  _active={{ bg: primaryActionActiveBg }}
                  {...preloadInteractionProps(ROUTES.clientQuestionnaire)}
                  onClick={goToClientQuestionnaire}
              >
                  {clientCustomProgramLabel}
                </Button>
              )}

              <Box
                p={3}
                borderRadius="22px"
                bg={mobileSectionBg}
                border="1px solid"
                borderColor={mobileSectionBorder}
                boxShadow={mobileSectionShadow}
                backdropFilter="blur(14px)"
              >
                <VStack align="stretch" spacing={2}>
                  <Text
                    px={1}
                    fontSize="xs"
                    textTransform="uppercase"
                    letterSpacing="0.08em"
                    color={menuMuted}
                    fontWeight="800"
                  >
                    {isClubContext ? "Espace Club" : "Navigation"}
                  </Text>

                  {linksToShow.map((link) => (
                    <Button
                      as={Link}
                      to={withAdminCoach(link.to)}
                      {...preloadInteractionProps(link.to)}
                      variant="ghost"
                      justifyContent="space-between"
                      w="full"
                      key={link.to}
                      onClick={mobileNav.onClose}
                      h="auto"
                      minH="58px"
                      px={3}
                      py={3}
                      borderRadius="18px"
                      border="1px solid"
                      borderColor={isCurrentRoute(link.to) ? mobileItemActiveBorder : mobileItemBorder}
                      bg={isCurrentRoute(link.to) ? mobileItemActiveGradient : mobileItemBg}
                      color={isCurrentRoute(link.to) ? mobileItemActiveText : menuFg}
                      fontWeight="800"
                      transition="all 0.2s ease"
                      _hover={{
                        bg: mobileItemHover,
                        color: mobileItemTextHover,
                        transform: "translateX(2px)",
                        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                      }}
                      _active={{ bg: mobileItemActiveBg }}
                    >
                      <HStack spacing={3} align="center">
                        <Flex
                          w="38px"
                          h="38px"
                          borderRadius="14px"
                          align="center"
                          justify="center"
                          bg={mobileIconBg}
                          border="1px solid"
                          borderColor={mobileIconBorder}
                          color={isCurrentRoute(link.to) ? mobileItemActiveText : mobileItemTextHover}
                          flexShrink={0}
                        >
                          <Icon as={link.icon} boxSize="18px" />
                        </Flex>
                        <Text fontWeight="800" textAlign="left" whiteSpace="normal" lineHeight="1.2">
                          {link.label}
                        </Text>
                      </HStack>
                      <Icon as={MdChevronRight} boxSize="18px" color={menuMuted} />
                    </Button>
                  ))}
                </VStack>
              </Box>

              <Box
                p={3}
                borderRadius="22px"
                bg={mobileSectionBg}
                border="1px solid"
                borderColor={mobileSectionBorder}
                boxShadow={mobileSectionShadow}
                backdropFilter="blur(14px)"
              >
                <VStack align="stretch" spacing={2}>
                  <Text
                    px={1}
                    fontSize="xs"
                    textTransform="uppercase"
                    letterSpacing="0.08em"
                    color={menuMuted}
                    fontWeight="800"
                  >{t("settings.sections.preferences", "Préférences")}</Text>

                  {isAdmin && (
                    <FormControl display="flex" alignItems="center" px={2} py={2}>
                      <FormLabel htmlFor="toggle-admin-mobile" mb="0" flex="1" fontWeight="700">
                        {nav("nav.admin_view_mobile", "Vue Admin")}
                      </FormLabel>
                      <Switch
                        id="toggle-admin-mobile"
                        isChecked={adminSwitchChecked}
                        onChange={() => {
                          const goAdmin = !adminSwitchChecked;
                          setViewAs(goAdmin ? "admin" : "coach");
                          mobileNav.onClose();
                          navigate(goAdmin ? ROUTES.admin : withAdminCoach(ROUTES.coachDashboard));
                        }}
                        colorScheme="yellow"
                      />
                    </FormControl>
                  )}

                  <Button
                    as={Link}
                    to={settingsTo}
                    {...preloadInteractionProps(settingsTo)}
                    variant="ghost"
                    justifyContent="space-between"
                    w="full"
                    h="auto"
                    minH="54px"
                    px={3}
                    py={3}
                    borderRadius="18px"
                    border="1px solid"
                    borderColor={isCurrentRoute(settingsTo) ? mobileItemActiveBorder : mobileItemBorder}
                    bg={isCurrentRoute(settingsTo) ? mobileItemActiveGradient : mobileItemBg}
                    fontWeight="800"
                    onClick={mobileNav.onClose}
                    transition="all 0.2s ease"
                    _hover={{
                      bg: mobileItemHover,
                      color: mobileItemTextHover,
                      transform: "translateX(2px)",
                      boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                    }}
                    _active={{ bg: mobileItemActiveBg }}
                  >
                    <HStack spacing={3} align="center">
                      <Flex
                        w="38px"
                        h="38px"
                        borderRadius="14px"
                        align="center"
                        justify="center"
                        bg={mobileIconBg}
                        border="1px solid"
                        borderColor={mobileIconBorder}
                        color={isCurrentRoute(settingsTo) ? mobileItemActiveText : mobileItemTextHover}
                        flexShrink={0}
                      >
                        <Icon as={MdOutlineSettings} boxSize="18px" />
                      </Flex>
                      <Text fontWeight="800">{nav("nav.settings", "Paramètres")}</Text>
                    </HStack>
                    <Icon as={MdChevronRight} boxSize="18px" color={menuMuted} />
                  </Button>

                  <Button
                    onClick={handleThemeToggle}
                    variant="ghost"
                    justifyContent="space-between"
                    w="full"
                    h="auto"
                    minH="54px"
                    px={3}
                    py={3}
                    borderRadius="18px"
                    border="1px solid"
                    borderColor={mobileItemBorder}
                    bg={mobileItemBg}
                    fontWeight="800"
                    transition="all 0.2s ease"
                    _hover={{
                      bg: mobileItemHover,
                      color: mobileItemTextHover,
                      transform: "translateX(2px)",
                      boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.10)",
                    }}
                    _active={{ bg: mobileItemActiveBg }}
                  >
                    <HStack spacing={3} align="center">
                      <Flex
                        w="38px"
                        h="38px"
                        borderRadius="14px"
                        align="center"
                        justify="center"
                        bg={mobileIconBg}
                        border="1px solid"
                        borderColor={mobileIconBorder}
                        color={mobileItemTextHover}
                        flexShrink={0}
                      >
                        <Icon as={colorMode === "light" ? MdOutlineDarkMode : MdOutlineLightMode} boxSize="18px" />
                      </Flex>
                      <Text fontWeight="800">{themeLabel}</Text>
                    </HStack>
                    <Icon as={MdChevronRight} boxSize="18px" color={menuMuted} />
                  </Button>

                  <Box w="full" display="flex" justifyContent="flex-start" px={1} pt={1} sx={langFixSx}>
                    <LanguageSwitcher />
                  </Box>
                </VStack>
              </Box>

              <Button
                variant="ghost"
                justifyContent="space-between"
                w="full"
                h="auto"
                minH="56px"
                px={3}
                py={3}
                borderRadius="18px"
                border="1px solid"
                borderColor={useColorModeValue("rgba(239,68,68,0.14)", "rgba(252,165,165,0.20)")}
                bg={useColorModeValue("rgba(239,68,68,0.04)", "rgba(239,68,68,0.08)")}
                fontWeight="800"
                color={useColorModeValue("red.500", "red.300")}
                onClick={() => {
                  handleLogout();
                  mobileNav.onClose();
                }}
                transition="all 0.2s ease"
                _hover={{
                  bg: useColorModeValue("rgba(239,68,68,0.10)", "rgba(239,68,68,0.14)"),
                  transform: "translateX(2px)",
                }}
                _active={{ bg: useColorModeValue("rgba(239,68,68,0.12)", "rgba(239,68,68,0.18)") }}
              >
                <HStack spacing={3} align="center">
                  <Flex
                    w="38px"
                    h="38px"
                    borderRadius="14px"
                    align="center"
                    justify="center"
                    bg={useColorModeValue("rgba(239,68,68,0.08)", "rgba(239,68,68,0.14)")}
                    border="1px solid"
                    borderColor={useColorModeValue("rgba(239,68,68,0.18)", "rgba(252,165,165,0.22)")}
                    flexShrink={0}
                  >
                    <Icon as={MdOutlinePowerSettingsNew} boxSize="18px" />
                  </Flex>
                  <Text fontWeight="800">{nav("nav.logout", "Déconnexion")}</Text>
                </HStack>
                <Icon as={MdChevronRight} boxSize="18px" color={useColorModeValue("red.300", "red.200")} />
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {showCoachUI && (
        <Modal isOpen={clientModal.isOpen} onClose={clientModal.onClose} isCentered>
          <ModalOverlay />
          <ModalContent borderRadius="24px">
            <ModalHeader>{nav("nav.new_client", "Nouveau client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ClientCreation onClose={clientModal.onClose} ownerUid={adminCoachId} />
            </ModalBody>
          </ModalContent>
        </Modal>
      )}

      <Modal isOpen={choiceModal.isOpen} onClose={choiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent
          bg={menuPanelBg}
          color={menuFg}
          borderRadius="24px"
          border="1px solid"
          borderColor={menuBd}
        >
          <ModalHeader>
            {isClient
              ? clientCustomProgramLabel
              : nav("nav.new", "Nouveau")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} py={4}>
              {showCoachUI && (
                <>
                  {hasSportAccess && (
                  <Button
                    w="full"
                    borderRadius="16px"
                    variant="outline"
                    leftIcon={<Icon as={MdOutlineFitnessCenter} />}
                    borderColor={modalActionBorder}
                    bg={modalActionBg}
                    transition="all 0.18s ease"
                    _hover={{
                      bg: modalActionHoverBg,
                      borderColor: modalActionHoverBorder,
                      transform: "translateY(-1px)",
                      boxShadow: modalActionHoverShadow,
                    }}
                    {...preloadInteractionProps(ROUTES.coachBuilderNew)}
                    onClick={() => {
                      choiceModal.onClose();
                      navigate(withAdminCoach(ROUTES.coachBuilderNew));
                    }}
                  >
                    {nav("nav.new_program_manual", "Nouveau programme manuel")}
                  </Button>
                  )}

                  {hasSportAccess && guidedProgramAllowed && (
                    <Button
                      variant="outline"
                      w="full"
                      borderRadius="16px"
                      leftIcon={<Icon as={MdAutoAwesome} />}
                      borderColor={modalActionBorder}
                      bg={modalActionBg}
                      transition="all 0.18s ease"
                      _hover={{
                        bg: modalActionHoverBg,
                        borderColor: modalActionHoverBorder,
                        transform: "translateY(-1px)",
                        boxShadow: modalActionHoverShadow,
                      }}
                      {...preloadInteractionProps(ROUTES.autoQuestionnaire)}
                      onClick={() => {
                        choiceModal.onClose();
                        mobileNav.onClose();
                        navigate(withAdminCoach(ROUTES.autoQuestionnaire));
                      }}
                    >
                      {nav("nav.new_program_guided", "Nouveau programme guidé")}
                    </Button>
                  )}

                  {hasSportAccess && (
                  <Button
                    variant="outline"
                    w="full"
                    borderRadius="16px"
                    leftIcon={<Icon as={MdOutlinePeopleAlt} />}
                    borderColor={modalActionBorder}
                    bg={modalActionBg}
                    transition="all 0.18s ease"
                    _hover={{
                      bg: modalActionHoverBg,
                      borderColor: modalActionHoverBorder,
                      transform: "translateY(-1px)",
                      boxShadow: modalActionHoverShadow,
                    }}
                    onClick={() => {
                      choiceModal.onClose();
                      clientModal.onOpen();
                    }}
                  >
                    {nav("nav.new_client", "Nouveau client")}
                  </Button>
                  )}

                  {(isAdmin || hasNutritionAccess) && (
                    <Button
                      variant="outline"
                      w="full"
                      borderRadius="16px"
                      leftIcon={<Icon as={MdOutlineNoteAdd} />}
                      borderColor={modalActionBorder}
                      bg={modalActionBg}
                      transition="all 0.18s ease"
                      _hover={{
                        bg: modalActionHoverBg,
                        borderColor: modalActionHoverBorder,
                        transform: "translateY(-1px)",
                        boxShadow: modalActionHoverShadow,
                      }}
                      {...preloadInteractionProps(`${ROUTES.coachNutrition}?new=1`)}
                      onClick={() => {
                        choiceModal.onClose();
                        navigate(withAdminCoach(`${ROUTES.coachNutrition}?new=1`));
                      }}
                    >
                      {nav("nav.new_nutrition_followup", "Nouveau suivi diététique")}
                    </Button>
                  )}
                </>
              )}

              {isClient && (
                <Button
                  variant="solid"
                  w="full"
                  borderRadius="16px"
                  {...preloadInteractionProps(ROUTES.clientQuestionnaire)}
                  onClick={goToClientQuestionnaire}
                >
                  {nav("nav.build_my_program", "Construire mon programme")}
                </Button>
              )}
            </VStack>
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
