// src/components/Navbar.jsx
import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Flex, Box, Button, IconButton, Menu, MenuButton, MenuList,
  MenuItem, useColorMode, useDisclosure, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalCloseButton, ModalBody, VStack,
  Drawer, DrawerOverlay, DrawerContent, DrawerCloseButton, DrawerHeader,
  DrawerBody, useBreakpointValue, Divider, HStack, Switch,
  FormControl, FormLabel, useToast, useColorModeValue
} from "@chakra-ui/react";
import {
  SunIcon, MoonIcon, ChevronDownIcon, AddIcon, HamburgerIcon,
} from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import ClientCreation from "./ClientCreation";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";

/* ========= ROUTES ========= */
const ROUTES = {
  home: "/",
  autoQuestionnaire: "/questionnaire",
  coachBuilderNew: "/exercise-bank/program-builder/new",
  admin: "/admin",
  coachDashboard: "/coach-dashboard",
  // Coach
  coachProfile: "/coach/profile",
  coachSettings: "/settings-coach",
  coachPrograms: "/programmes",
  coachClients: "/clients",
  coachStats: "/statistics-coach",
  exerciseBank: "/exercise-bank",
  // Client
  clientProfile: "/profile",
  clientPrograms: "/mes-programmes",
  clientStats: "/statistiques",
  clientSettings: "/settings",
  // Auth
  login: "/login",
  register: "/register",
};
/* ========================= */

function getIsNight(date = new Date()) {
  const h = date.getHours();
  return h < 7 || h >= 19; // Nuit: 19:00 → 06:59
}

function getMsUntilNextSwitch(now = new Date()) {
  const isNight = getIsNight(now);
  const next = new Date(now);

  if (isNight) {
    next.setHours(7, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
  } else {
    next.setHours(19, 0, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

export default function Navbar() {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const nav = (k, fb) => t(k, fb);

  // 🔐 Auth (nouveau contexte)
  const {
    user,
    logout,
    isAdmin,
    isCoach,              // rôle effectif === coach ?
    effectiveRole,        // "admin" | "coach" | "particulier"
    viewAs,               // "admin" | "coach" | null
    setViewAs,            // bascule sécurisée
  } = useAuth();

  const { colorMode, toggleColorMode } = useColorMode();

  const choiceModal = useDisclosure();
  const clientModal = useDisclosure();
  const mobileNav = useDisclosure();
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthPage = [ROUTES.login, ROUTES.register].includes(location.pathname);
  const isDesktop = useBreakpointValue({ base: false, md: true });
  const isHome = location.pathname === ROUTES.home;

  // Détections de vue
  const roleEffective = effectiveRole;                 // lisible
  const showCoachUI = roleEffective === "coach";       // coach (ou admin en vue coach)
  const isClient = user?.role === "particulier";       // client réel uniquement

  // Toast quand la langue change
  React.useEffect(() => {
    const onLang = () => {
      toast({
        description: t("settings.toasts.lang_updated", "Langue mise à jour."),
        status: "success",
        duration: 3000,
      });
    };
    i18n.on("languageChanged", onLang);
    return () => i18n.off("languageChanged", onLang);
  }, [i18n, toast, t]);

  // ===== Mode auto jour/nuit =====
  React.useEffect(() => {
    const night = getIsNight();
    if (night && colorMode === "light") toggleColorMode();
    if (!night && colorMode === "dark") toggleColorMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let timer = null;
    const schedule = () => {
      const ms = getMsUntilNextSwitch();
      timer = setTimeout(() => {
        const night = getIsNight();
        if (night && colorMode === "light") toggleColorMode();
        if (!night && colorMode === "dark") toggleColorMode();
        schedule();
      }, ms);
    };
    schedule();
    return () => { if (timer) clearTimeout(timer); };
  }, [colorMode, toggleColorMode]);

  const handleLogout = () => {
    logout();
    setTimeout(() => navigate(ROUTES.home), 100);
  };

  const coachLinks = [
    { label: nav("nav.profile", "Profil"), to: ROUTES.coachProfile },
    { label: nav("nav.all_programs", "Tous les programmes"), to: ROUTES.coachPrograms },
    { label: nav("nav.my_clients", "Mes clients"), to: ROUTES.coachClients },
    { label: nav("nav.statistics", "Statistiques"), to: ROUTES.coachStats },
    { label: nav("nav.exercise_bank", "Banque d'exercices"), to: ROUTES.exerciseBank },
  ];
  const clientLinks = [
    { label: nav("nav.profile", "Profil"), to: ROUTES.clientProfile },
    { label: nav("nav.my_programs", "Mes programmes"), to: ROUTES.clientPrograms },
    { label: nav("nav.statistics", "Statistiques"), to: ROUTES.clientStats },
  ];

  // Si la vue effective est "coach" → liens coach ; sinon → liens client
  const linksToShow = showCoachUI ? coachLinks : clientLinks;
  const settingsTo = showCoachUI ? ROUTES.coachSettings : ROUTES.clientSettings;

  // Couleurs réactives au mode
  const headerBg = useColorModeValue("blue.600", "blue.900");
  const headerFg = useColorModeValue("white", "white");
  const outlineBorder = useColorModeValue("whiteAlpha.800", "whiteAlpha.700");

  const menuBg = useColorModeValue("white", "gray.700");
  const menuFg = useColorModeValue("gray.800", "white");
  const menuBd = useColorModeValue("gray.200", "gray.600");

  // Libellé + état du switch Admin (uniquement si rôle réel admin)
  const adminSwitchChecked = isAdmin && (roleEffective === "admin");

  return (
    <>
      <Flex
        bg={headerBg}
        p={4}
        color={headerFg}
        align="center"
        justify="space-between"
        w="100%"
        overflowX="hidden"
        minW={0}
      >
        <Box
          as={Link}
          to={ROUTES.home}
          fontSize={{ base: "lg", md: "2xl" }}
          fontWeight="bold"
          _hover={{ textDecoration: "none", opacity: 0.9 }}
          flexShrink={0}
        >
          {nav("brand", "BoostYourLife.coach")}
        </Box>

        {/* ======= Desktop connecté ======= */}
        {isDesktop && !isAuthPage && user && (
          <Flex align="center" gap={4} minW={0} flexShrink={1}>
            {/* Toggle Admin (réservé au vrai admin) */}
            {isAdmin && (
              <FormControl display="flex" alignItems="center">
                <FormLabel htmlFor="toggle-admin" mb="0" color="yellow.200">
                  {nav("nav.admin_view", "Admin")}
                </FormLabel>
                <Switch
                  id="toggle-admin"
                  isChecked={adminSwitchChecked}
                  onChange={() => {
                    // si on est en vue admin → passer coach ; sinon → admin
                    const goAdmin = !adminSwitchChecked;
                    setViewAs(goAdmin ? "admin" : "coach");
                    navigate(goAdmin ? ROUTES.admin : ROUTES.coachDashboard);
                  }}
                  colorScheme="yellow"
                />
              </FormControl>
            )}

            {/* CTA client (réel) */}
            {isClient && (
              <Button
                leftIcon={<AddIcon />}
                variant="outline"
                borderColor={outlineBorder}
                color={headerFg}
                onClick={choiceModal.onOpen}
              >
                {nav("nav.custom_program", "Programme sur mesure")}
              </Button>
            )}

            {/* Actions coach (coach réel OU admin en vue coach) */}
            {showCoachUI && (
              <>
                <Button
                  leftIcon={<AddIcon />}
                  variant="outline"
                  borderColor={outlineBorder}
                  color={headerFg}
                  onClick={choiceModal.onOpen}
                >
                  {nav("nav.new_program", "Nouveau programme")}
                </Button>
                <Button
                  leftIcon={<AddIcon />}
                  variant="outline"
                  borderColor={outlineBorder}
                  color={headerFg}
                  onClick={clientModal.onOpen}
                >
                  {nav("nav.new_client", "Nouveau client")}
                </Button>
              </>
            )}

            {/* Menu principal */}
            <Menu>
              <MenuButton
                as={IconButton}
                aria-label={nav("nav.open_menu", "Ouvrir le menu")}
                icon={<ChevronDownIcon />}
                variant="outline"
                borderColor={outlineBorder}
                color={headerFg}
                flexShrink={0}
              />
              <MenuList bg={menuBg} color={menuFg} borderColor={menuBd}>
                {linksToShow.map((link) => (
                  <MenuItem as={Link} to={link.to} key={link.to}>
                    {link.label}
                  </MenuItem>
                ))}
                <MenuItem as={Link} to={settingsTo}>
                  {nav("nav.settings", "Paramètres")}
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  {nav("nav.logout", "Déconnexion")}
                </MenuItem>
              </MenuList>
            </Menu>

            {/* Langue */}
            <LanguageSwitcher />

            {/* Thème (manuel dispo, même si l'auto gère jour/nuit) */}
            <IconButton
              aria-label={nav("nav.toggle_color_mode", "Changer le thème")}
              icon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
              onClick={toggleColorMode}
              bg="transparent"
              color={headerFg}
              flexShrink={0}
            />
          </Flex>
        )}

        {/* ======= Desktop non connecté (Home) ======= */}
        {isDesktop && isHome && !user && !isAuthPage && (
          <HStack spacing={2} flexShrink={0}>
            <Button as={Link} to={ROUTES.login} variant="outline" borderColor={outlineBorder} color={headerFg} size="sm">
              {nav("nav.login", "Connexion")}
            </Button>
            <Button as={Link} to={ROUTES.register} variant="outline" borderColor={outlineBorder} color={headerFg} size="sm">
              {nav("nav.register", "Inscription")}
            </Button>
          </HStack>
        )}

        {/* ======= Mobile ======= */}
        {!isDesktop && !isAuthPage && (
          <HStack spacing={2} flexShrink={0}>
            {user ? (
              <>
                <IconButton
                  aria-label={nav("nav.open_menu", "Ouvrir le menu")}
                  icon={<HamburgerIcon />}
                  variant="outline"
                  borderColor={outlineBorder}
                  color={headerFg}
                  onClick={mobileNav.onOpen}
                />
                <LanguageSwitcher />
              </>
            ) : (
              <>
                <Button as={Link} to={ROUTES.login} variant="outline" borderColor={outlineBorder} color={headerFg} size="sm">
                  {nav("nav.login", "Connexion")}
                </Button>
                <Button as={Link} to={ROUTES.register} variant="outline" borderColor={outlineBorder} color={headerFg} size="sm">
                  {nav("nav.register", "Inscription")}
                </Button>
                {!isHome && <LanguageSwitcher />}
              </>
            )}
          </HStack>
        )}
      </Flex>

      {/* ======= Drawer mobile ======= */}
      <Drawer isOpen={mobileNav.isOpen} onClose={mobileNav.onClose} placement="right">
        <DrawerOverlay />
        <DrawerContent bg={useColorModeValue("white", "gray.800")} color={useColorModeValue("black", "white")}>
          <DrawerCloseButton />
          <DrawerHeader>{nav("nav.menu", "Menu")}</DrawerHeader>
          <DrawerBody>
            <VStack align="start" spacing={4} mt={4} w="full">
              {linksToShow.map((link) => (
                <Button
                  as={Link}
                  to={link.to}
                  variant="ghost"
                  w="full"
                  key={link.to}
                  onClick={mobileNav.onClose}
                >
                  {link.label}
                </Button>
              ))}

              {/* Admin toggle (mobile) */}
              {isAdmin && (
                <FormControl display="flex" alignItems="center" px={2}>
                  <FormLabel htmlFor="toggle-admin-mobile" mb="0">
                    {nav("nav.admin_view_mobile", "Vue Admin")}
                  </FormLabel>
                  <Switch
                    id="toggle-admin-mobile"
                    isChecked={adminSwitchChecked}
                    onChange={() => {
                      const goAdmin = !adminSwitchChecked;
                      setViewAs(goAdmin ? "admin" : "coach");
                      mobileNav.onClose();
                      navigate(goAdmin ? ROUTES.admin : ROUTES.coachDashboard);
                    }}
                    colorScheme="yellow"
                  />
                </FormControl>
              )}

              <Divider />

              <Button as={Link} to={settingsTo} variant="ghost" w="full" onClick={mobileNav.onClose}>
                {nav("nav.settings", "Paramètres")}
              </Button>

              <Button
                variant="ghost"
                w="full"
                onClick={() => { handleLogout(); mobileNav.onClose(); }}
              >
                {nav("nav.logout", "Déconnexion")}
              </Button>

              {/* CTA client */}
              {isClient && (
                <Button
                  leftIcon={<AddIcon />}
                  variant="ghost"
                  w="full"
                  onClick={() => { choiceModal.onOpen(); mobileNav.onClose(); }}
                >
                  {nav("nav.custom_program", "Programme sur mesure")}
                </Button>
              )}

              {/* Actions coach (coach ou admin en vue coach) */}
              {showCoachUI && (
                <>
                  <Button
                    leftIcon={<AddIcon />}
                    variant="ghost"
                    w="full"
                    onClick={() => { choiceModal.onOpen(); mobileNav.onClose(); }}
                  >
                    {nav("nav.new_program", "Nouveau programme")}
                  </Button>
                  <Button
                    leftIcon={<AddIcon />}
                    variant="ghost"
                    w="full"
                    onClick={() => { clientModal.onOpen(); mobileNav.onClose(); }}
                  >
                    {nav("nav.new_client", "Nouveau client")}
                  </Button>
                </>
              )}

              <IconButton
                aria-label={nav("nav.toggle_color_mode", "Changer le thème")}
                icon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
                onClick={toggleColorMode}
                variant="ghost"
                w="full"
              />

              <LanguageSwitcher />
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* ======= Modal nouveau client (coach ou admin en vue coach) ======= */}
      {showCoachUI && (
        <Modal isOpen={clientModal.isOpen} onClose={clientModal.onClose} isCentered>
          <ModalOverlay />
          <ModalContent>
            <ModalHeader>{nav("nav.new_client", "Nouveau client")}</ModalHeader>
            <ModalCloseButton />
            <ModalBody>
              <ClientCreation onClose={clientModal.onClose} />
            </ModalBody>
          </ModalContent>
        </Modal>
      )}

      {/* ======= Modal création / génération ======= */}
      <Modal isOpen={choiceModal.isOpen} onClose={choiceModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {isClient ? nav("nav.custom_program", "Programme sur mesure") : nav("nav.program_type", "Type de programme")}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4} py={4}>
              {showCoachUI && (
                <>
                  <Button
                    colorScheme="blue"
                    w="full"
                    onClick={() => { choiceModal.onClose(); navigate(ROUTES.coachBuilderNew); }}
                  >
                    {nav("nav.create_manual", "Créer manuel")}
                  </Button>
                  <Button
                    variant="outline"
                    colorScheme="blue"
                    w="full"
                    onClick={() => { choiceModal.onClose(); navigate(ROUTES.autoQuestionnaire); }}
                  >
                    {nav("nav.guided_creation", "Création guidée")}
                  </Button>
                </>
              )}

              {isClient && (
                <Button
                  variant="solid"
                  colorScheme="blue"
                  w="full"
                  onClick={() => { choiceModal.onClose(); navigate(ROUTES.autoQuestionnaire); }}
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

