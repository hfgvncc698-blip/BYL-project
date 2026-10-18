import { Box, Button, Icon, SimpleGrid, Text, useColorModeValue } from "@chakra-ui/react";
import { AddIcon } from "@chakra-ui/icons";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MdOutlineHome, MdOutlineCalendarMonth, MdOutlineNoteAdd, MdOutlinePeopleAlt } from "react-icons/md";
export { CLUB_MOBILE_NAV_PREFIXES } from "./mobileNavPaths.js";

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
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const bg = useColorModeValue("rgba(255,255,255,0.94)", "rgba(8,13,26,0.94)");
  const text = useColorModeValue("#0F172A", "white");
  const border = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.12)");
  const active = useColorModeValue("#0F172A", "rgba(255,255,255,0.14)");
  const activeHover = useColorModeValue("#1E293B", "rgba(255,255,255,0.20)");
  const ghostHover = useColorModeValue("rgba(15,23,42,0.06)", "rgba(255,255,255,0.08)");
  const shadow = useColorModeValue("0 18px 44px rgba(15,23,42,0.16)", "0 18px 44px rgba(0,0,0,0.44)");
  const fabBorder = useColorModeValue("rgba(255,255,255,0.95)", "rgba(147,197,253,0.36)");
  const fabShadow = useColorModeValue("0 16px 32px rgba(37,99,235,0.34)", "0 18px 34px rgba(0,0,0,0.48)");
  const actionGradient = "linear-gradient(90deg, #1F5EFF 0%, #257CFF 52%, #00B8FF 100%)";
  const items = [
    {label:t("auto.Clientdashboard.accueil", "Accueil"), icon:MdOutlineHome, path:"/club-dashboard"},
    {label:t("clubDashboard.actions.calendar", "Calendrier"), icon:MdOutlineCalendarMonth, path:"/club-dashboard/calendrier"},
    {label:t("nav.new", "Nouveau"), icon:AddIcon},
    {label:t("clubDashboard.tools.management", "Gestion"), icon:MdOutlineNoteAdd, path:"/club-dashboard/actions-groupees"},
    {label:t("auto.CoachMobileNav.clients", "Clients"), icon:MdOutlinePeopleAlt, path:"/club-dashboard/clients"},
  ];
  return <Box data-tour="club-mobile-nav" as="nav" aria-label={t("nav.menu", "Menu")} display={{base:"block", md:"none"}} position="fixed" left={3} right={3} bottom={3} zIndex={1200} bg={bg} border="1px solid" borderColor={border} borderRadius="24px" boxShadow={shadow} backdropFilter="blur(18px)" p={2} data-testid="club-mobile-nav">
    <SimpleGrid columns={5} spacing={1}>{items.map(item => {
      const selected = item.path === location.pathname || (item.path === '/club-dashboard/actions-groupees' && ['offres','journal','audit','alertes','exports','objectifs'].some(path => location.pathname === `/club-dashboard/${path}`));
      return <Button key={item.label} aria-label={item.label} aria-current={selected ? 'page' : undefined} variant={selected ? "solid" : "ghost"} size="sm" h={item.path ? "54px" : "60px"} minW={0} px={1} borderRadius={item.path ? "18px" : "20px"} flexDirection="column" gap={1} bg={!item.path ? actionGradient : selected ? active : 'transparent'} boxShadow={!item.path ? fabShadow : 'none'} border={!item.path ? '1px solid' : '0'} borderColor={!item.path ? fabBorder : 'transparent'} color={selected || !item.path ? 'white' : text} _hover={{bg: !item.path ? actionGradient : selected ? activeHover : ghostHover, filter: !item.path ? 'brightness(1.08)' : 'none'}} onClick={() => {
        if (!item.path) { window.dispatchEvent(new Event('club-open-new')); return; }
        const target = preserveClubQuery(item.path, location.search);
        if (`${location.pathname}${location.search}` === target) window.scrollTo({top:0, behavior:'smooth'});
        else navigate(target);
      }}><Icon as={item.icon} boxSize={item.path ? '18px' : '24px'} /><Text as="span" fontSize={item.path ? "9px" : "10px"} fontWeight="850" lineHeight="1" noOfLines={1}>{item.label}</Text></Button>;
    })}</SimpleGrid>
  </Box>;
}
