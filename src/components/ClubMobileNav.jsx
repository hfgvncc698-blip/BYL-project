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
import { AddIcon } from "@chakra-ui/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MdOutlineGroups,
  MdOutlineHome,
  MdOutlineRestaurantMenu,
  MdOutlineCalendarMonth,
  MdOutlineFitnessCenter,
  MdOutlinePeopleAlt,
} from "react-icons/md";

export const CLUB_MOBILE_NAV_PREFIXES = ["/club-dashboard"];

function preserveClubQuery(path, search) {
  const current = new URLSearchParams(search || "");
  const clubId = current.get("clubId");
  const adminClubId = current.get("adminClubId");
  if (!clubId && !adminClubId) return path;

  const [pathAndQuery, hash = ""] = String(path).split("#");
  const [pathname, query = ""] = pathAndQuery.split("?");
  const next = new URLSearchParams(query);
  if (clubId) next.set("clubId", clubId);
  if (adminClubId) next.set("adminClubId", adminClubId);

  const queryString = next.toString();
  return `${pathname}${queryString ? `?${queryString}` : ""}${hash ? `#${hash}` : ""}`;
}

export default function ClubMobileNav() {
  const { t } = useTranslation("common");
  const location = useLocation();
  const navigate = useNavigate();
  const actionModal = useDisclosure();

  const activeBlue = useColorModeValue("#2563EB", "#7CB7FF");
  const activeBlueDark = useColorModeValue("#1D4ED8", "#9BC7FF");
  const textColor = useColorModeValue("#0F172A", "white");
  const borderColor = useColorModeValue("rgba(37,99,235,0.20)", "rgba(124,183,255,0.22)");
  const bg = useColorModeValue("rgba(255,255,255,0.94)", "rgba(8,13,26,0.94)");
  const ghostHover = useColorModeValue("rgba(37,99,235,0.08)", "rgba(124,183,255,0.12)");
  const shadow = useColorModeValue(
    "0 18px 44px rgba(15,23,42,0.16)",
    "0 18px 44px rgba(0,0,0,0.44)"
  );
  const modalBg = useColorModeValue("white", "rgba(11,16,27,0.98)");
  const modalBorder = useColorModeValue("rgba(15,23,42,0.10)", "rgba(255,255,255,0.12)");
  const fabBorder = useColorModeValue("rgba(255,255,255,0.95)", "rgba(147,197,253,0.36)");
  const fabShadow = useColorModeValue(
    "0 16px 32px rgba(37,99,235,0.34)",
    "0 18px 34px rgba(0,0,0,0.48)"
  );

  const goTo = (path) => {
    const target = preserveClubQuery(path, location.search);
    if (typeof window !== "undefined") {
      const targetUrl = new URL(target, window.location.origin);
      const currentUrl = new URL(`${location.pathname}${location.search}${location.hash}`, window.location.origin);
      if (
        targetUrl.pathname === currentUrl.pathname &&
        targetUrl.search === currentUrl.search &&
        targetUrl.hash === currentUrl.hash
      ) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        document.scrollingElement?.scrollTo?.({ top: 0, behavior: "smooth" });
        document.getElementById("root")?.scrollTo?.({ top: 0, behavior: "smooth" });
        return;
      }
    }
    navigate(target);
  };

  const goAction = (path) => {
    actionModal.onClose();
    goTo(path);
  };

  const items = [
    { label: t("auto.CoachMobileNav.accueil", "Accueil"), icon: MdOutlineHome, path: "/club-dashboard" },
    { label: t("auto.ClubDashboard.equipe", "Équipe"), icon: MdOutlineGroups, path: "/club-dashboard/team" },
    { label: t("nav.new", "Nouveau"), icon: AddIcon, action: actionModal.onOpen },
    { label: t("nutrition.title", "Nutrition"), icon: MdOutlineRestaurantMenu, path: "/club-dashboard/nutrition" },
    { label: t("clubDashboard.actions.calendar", "Calendrier"), icon: MdOutlineCalendarMonth, path: "/club-dashboard/calendrier" },
  ];

  const actions = [
    {
      label: t("auto.ClubDashboard.inviter_un_pro", "Inviter un pro"),
      icon: MdOutlineGroups,
      path: "/club-dashboard/create",
    },
    {
      label: t("auto.ClubDashboard.planifier_un_rdv", "Planifier un RDV"),
      icon: MdOutlineCalendarMonth,
      path: "/club-dashboard/calendrier?action=new-appointment",
    },
    {
      label: t("auto.ClubDashboard.clients_du_club", "Clients du club"),
      icon: MdOutlinePeopleAlt,
      path: "/club-dashboard/clients",
    },
    {
      label: t("clientsList.table.programs", "Programmes"),
      icon: MdOutlineFitnessCenter,
      path: "/club-dashboard/programmes",
    },
  ];

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
        data-testid="club-mobile-nav"
      >
        <SimpleGrid columns={5} spacing={1}>
          {items.map((item) => {
            const itemPath = item.path?.split("?")[0].split("#")[0];
            const isAction = typeof item.action === "function";
            const isActive = !isAction && location.pathname === itemPath;
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
                bg={isActive || isAction ? activeBlue : "transparent"}
                color={isActive || isAction ? "white" : textColor}
                boxShadow={isAction ? fabShadow : "none"}
                border={isAction ? "1px solid" : "0"}
                borderColor={isAction ? fabBorder : "transparent"}
                _hover={{ bg: isActive || isAction ? activeBlueDark : ghostHover }}
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

      <Modal isOpen={actionModal.isOpen} onClose={actionModal.onClose} isCentered size="xs">
        <ModalOverlay />
        <ModalContent borderRadius="24px" bg={modalBg} border="1px solid" borderColor={modalBorder}>
          <ModalHeader>{t("nav.new", "Nouveau")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={5}>
            <SimpleGrid columns={1} spacing={3}>
              {actions.map((action) => (
                <Button
                  key={action.path}
                  variant="outline"
                  minH="54px"
                  justifyContent="flex-start"
                  leftIcon={<Icon as={action.icon} boxSize="20px" />}
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
