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
  useToast,
  useColorModeValue,
  Text,
} from "@chakra-ui/react";
import { SunIcon, MoonIcon, AddIcon, HamburgerIcon } from "@chakra-ui/icons";
import { useAuth } from "../AuthContext";
import ClientCreation from "./ClientCreation";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import useAutoRevertColorMode from "../hooks/useAutoRevertColorMode";

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

export default function Navbar() {
  const toast = useToast();
  const { t, i18n } = useTranslation();
  const nav = (k, fb) => t(k, fb);

  const { user, logout, isAdmin, effectiveRole, setViewAs } = useAuth();

  const { colorMode, setColorMode } = useColorMode();
  const { markManualChoice } = useAutoRevertColorMode();

  const choiceModal = useDisclosure();
  const clientModal = useDisclosure();
  const mobileNav = useDisclosure();

  const navigate = useNavigate();
  const location = useLocation();

  const isAuthPage = [ROUTES.login, ROUTES.register].includes(location.pathname);
  const isDesktop = useBreakpointValue({ base: false, md: true });
  const isHome = location.pathname === ROUTES.home;

  const roleEffective = effectiveRole;
  const showCoachUI = roleEffective === "coach";
  const isClient = user?.role === "particulier";

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

  const linksToShow = showCoachUI ? coachLinks : clientLinks;
  const settingsTo = showCoachUI ? ROUTES.coachSettings : ROUTES.clientSettings;

  const headerBg = useColorModeValue("blue.600", "blue.900");
  const headerFg = useColorModeValue("white", "white");
  const outlineBorder = useColorModeValue("whiteAlpha.800", "whiteAlpha.700");

  const menuFg = useColorModeValue("gray.800", "white");
  const menuBd = useColorModeValue("blackAlpha.200", "whiteAlpha.200");
  const menuItemHover = useColorModeValue("blackAlpha.50", "whiteAlpha.100");

  // ✅ fond OPAQUE en light, premium en dark
  const menuPanelBg = useColorModeValue("white", "gray.900");

  const adminSwitchChecked = isAdmin && roleEffective === "admin";

  const compactBtn = isAdmin;
  const actionBtnProps = compactBtn
    ? {
        size: "sm",
        px: 4,
        fontSize: "sm",
        minW: "210px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }
    : { minW: 0, whiteSpace: "nowrap" };

  const themeLabel =
    colorMode === "light"
      ? nav("nav.dark_mode", "Mode nuit")
      : nav("nav.light_mode", "Mode jour");

  const handleThemeToggle = () => {
    const next = colorMode === "light" ? "dark" : "light";
    setColorMode(next);
    // ✅ marque le choix manuel, retour auto après 6h via le hook
    markManualChoice(next);
  };

  // ✅ FIX UNIQUEMENT : rendre les boutons de langue visibles en mode jour
  const langFixSx = useColorModeValue(
    {
      "& .chakra-button": {
        bg: "blackAlpha.50",
        color: "gray.800",
        border: "1px solid",
        borderColor: "blackAlpha.200",
      },
      "& .chakra-button:hover": {
        bg: "blackAlpha.100",
      },
      "& .chakra-button[aria-pressed='true'], & .chakra-button[aria-current='true'], & .chakra-button[data-active='true']":
        {
          bg: "blue.600",
          color: "white",
          borderColor: "blue.600",
        },
    },
    {}
  );

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
            {/* Admin reste dans la navbar */}
            {isAdmin && (
              <FormControl display="flex" alignItems="center">
                <FormLabel htmlFor="toggle-admin" mb="0" color="yellow.200">
                  {nav("nav.admin_view", "Admin")}
                </FormLabel>
                <Switch
                  id="toggle-admin"
                  isChecked={adminSwitchChecked}
                  onChange={() => {
                    const goAdmin = !adminSwitchChecked;
                    setViewAs(goAdmin ? "admin" : "coach");
                    navigate(goAdmin ? ROUTES.admin : ROUTES.coachDashboard);
                  }}
                  colorScheme="yellow"
                />
              </FormControl>
            )}

            {/* CTA client */}
            {isClient && (
              <Button
                leftIcon={<AddIcon />}
                variant="outline"
                borderColor={outlineBorder}
                color={headerFg}
                onClick={choiceModal.onOpen}
                {...actionBtnProps}
              >
                {nav("nav.custom_program", "Programme sur mesure")}
              </Button>
            )}

            {/* Actions coach (reste dans la navbar) */}
            {showCoachUI && (
              <>
                <Button
                  leftIcon={<AddIcon />}
                  variant="outline"
                  borderColor={outlineBorder}
                  color={headerFg}
                  onClick={choiceModal.onOpen}
                  {...actionBtnProps}
                >
                  {nav("nav.new_program", "Nouveau programme")}
                </Button>
                <Button
                  leftIcon={<AddIcon />}
                  variant="outline"
                  borderColor={outlineBorder}
                  color={headerFg}
                  onClick={clientModal.onOpen}
                  {...actionBtnProps}
                >
                  {nav("nav.new_client", "Nouveau client")}
                </Button>
              </>
            )}

            {/* Burger desktop */}
            <Menu placement="bottom-end" isLazy>
              <MenuButton
                as={IconButton}
                aria-label={nav("nav.open_menu", "Ouvrir le menu")}
                icon={<HamburgerIcon />}
                variant="outline"
                borderColor={outlineBorder}
                color={headerFg}
                flexShrink={0}
              />

              <MenuList
                bg={menuPanelBg}
                color={menuFg}
                borderColor={menuBd}
                p={5}
                w="320px"
                maxW="90vw"
                borderRadius="2xl"
                boxShadow="2xl"
              >
                <VStack align="stretch" spacing={3}>
                  {linksToShow.map((link) => (
                    <MenuItem
                      as={Link}
                      to={link.to}
                      key={link.to}
                      bg="transparent"
                      justifyContent="center"
                      py={3}
                      borderRadius="lg"
                      fontWeight="semibold"
                      _hover={{ bg: menuItemHover }}
                      _focus={{ bg: menuItemHover }}
                    >
                      {link.label}
                    </MenuItem>
                  ))}

                  <Divider borderColor={menuBd} />

                  <MenuItem
                    as={Link}
                    to={settingsTo}
                    bg="transparent"
                    justifyContent="center"
                    py={3}
                    borderRadius="lg"
                    fontWeight="semibold"
                    _hover={{ bg: menuItemHover }}
                    _focus={{ bg: menuItemHover }}
                  >
                    {nav("nav.settings", "Paramètres")}
                  </MenuItem>

                  <MenuItem
                    onClick={handleThemeToggle}
                    bg="transparent"
                    justifyContent="center"
                    py={3}
                    borderRadius="lg"
                    fontWeight="semibold"
                    _hover={{ bg: menuItemHover }}
                    _focus={{ bg: menuItemHover }}
                  >
                    <HStack spacing={2}>
                      {colorMode === "light" ? <MoonIcon /> : <SunIcon />}
                      <Text>{themeLabel}</Text>
                    </HStack>
                  </MenuItem>

                  {/* langues */}
                  <Box pt={1} display="flex" justifyContent="center" sx={langFixSx}>
                    <LanguageSwitcher />
                  </Box>

                  <Divider borderColor={menuBd} />

                  <MenuItem
                    onClick={handleLogout}
                    bg="transparent"
                    justifyContent="center"
                    py={3}
                    borderRadius="lg"
                    fontWeight="semibold"
                    _hover={{ bg: menuItemHover }}
                    _focus={{ bg: menuItemHover }}
                  >
                    {nav("nav.logout", "Déconnexion")}
                  </MenuItem>
                </VStack>
              </MenuList>
            </Menu>
          </Flex>
        )}

        {/* ======= Desktop non connecté (Home) ======= */}
        {isDesktop && isHome && !user && !isAuthPage && (
          <HStack spacing={2} flexShrink={0}>
            <Button as={Link} to={ROUTES.login} variant="outline" borderColor={outlineBorder} color={headerFg} size="sm">
              {nav("nav.login", "Connexion")}
            </Button>
            <Button
              as={Link}
              to={ROUTES.register}
              variant="outline"
              borderColor={outlineBorder}
              color={headerFg}
              size="sm"
            >
              {nav("nav.register", "Inscription")}
            </Button>
          </HStack>
        )}

        {/* ======= Mobile ======= */}
        {!isDesktop && !isAuthPage && (
          <HStack spacing={2} flexShrink={0}>
            {user ? (
              <IconButton
                aria-label={nav("nav.open_menu", "Ouvrir le menu")}
                icon={<HamburgerIcon />}
                variant="outline"
                borderColor={outlineBorder}
                color={headerFg}
                onClick={mobileNav.onOpen}
              />
            ) : (
              <>
                <Button as={Link} to={ROUTES.login} variant="outline" borderColor={outlineBorder} color={headerFg} size="sm">
                  {nav("nav.login", "Connexion")}
                </Button>
                <Button
                  as={Link}
                  to={ROUTES.register}
                  variant="outline"
                  borderColor={outlineBorder}
                  color={headerFg}
                  size="sm"
                >
                  {nav("nav.register", "Inscription")}
                </Button>
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
                <Button as={Link} to={link.to} variant="ghost" w="full" key={link.to} onClick={mobileNav.onClose}>
                  {link.label}
                </Button>
              ))}

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
                onClick={() => {
                  handleLogout();
                  mobileNav.onClose();
                }}
              >
                {nav("nav.logout", "Déconnexion")}
              </Button>

              {isClient && (
                <Button
                  leftIcon={<AddIcon />}
                  variant="ghost"
                  w="full"
                  onClick={() => {
                    choiceModal.onOpen();
                    mobileNav.onClose();
                  }}
                >
                  {nav("nav.custom_program", "Programme sur mesure")}
                </Button>
              )}

              {showCoachUI && (
                <>
                  <Button
                    leftIcon={<AddIcon />}
                    variant="ghost"
                    w="full"
                    onClick={() => {
                      choiceModal.onOpen();
                      mobileNav.onClose();
                    }}
                  >
                    {nav("nav.new_program", "Nouveau programme")}
                  </Button>
                  <Button
                    leftIcon={<AddIcon />}
                    variant="ghost"
                    w="full"
                    onClick={() => {
                      clientModal.onOpen();
                      mobileNav.onClose();
                    }}
                  >
                    {nav("nav.new_client", "Nouveau client")}
                  </Button>
                </>
              )}

              <Button
                leftIcon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
                onClick={handleThemeToggle}
                variant="ghost"
                w="full"
              >
                {themeLabel}
              </Button>

              <Box w="full" display="flex" justifyContent="flex-start" sx={langFixSx}>
                <LanguageSwitcher />
              </Box>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>

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
                    onClick={() => {
                      choiceModal.onClose();
                      navigate(ROUTES.coachBuilderNew);
                    }}
                  >
                    {nav("nav.create_manual", "Créer manuel")}
                  </Button>
                  <Button
                    variant="outline"
                    colorScheme="blue"
                    w="full"
                    onClick={() => {
                      choiceModal.onClose();
                      navigate(ROUTES.autoQuestionnaire);
                    }}
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
                  onClick={() => {
                    choiceModal.onClose();
                    navigate(ROUTES.autoQuestionnaire);
                  }}
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

