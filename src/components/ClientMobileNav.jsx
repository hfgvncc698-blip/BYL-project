import React from "react";
import { Box, Button, Icon, SimpleGrid, Text, useColorModeValue } from "@chakra-ui/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MdOutlineChecklist,
  MdOutlineFitnessCenter,
  MdOutlineInsights,
  MdOutlineRestaurantMenu,
} from "react-icons/md";
import { CLIENT_MOBILE_NAV_PATHS } from "./mobileNavPaths.js";

export { CLIENT_MOBILE_NAV_PATHS };

const ROUTE_PRELOADS = {
  "/user-dashboard": () => import("./Clientdashboard.jsx"),
  "/mes-programmes": () => import("../pages/MyPrograms.jsx"),
  "/nutrition": () => import("../pages/ClientNutritionPage.jsx"),
  "/statistiques": () => import("../pages/StatisticsPageClient.jsx"),
};

export default function ClientMobileNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
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

  const items = [
    { label: t("auto.Clientdashboard.accueil", "Accueil"), icon: MdOutlineChecklist, path: "/user-dashboard" },
    { label: t("auto.Clientdashboard.programmes", "Programmes"), icon: MdOutlineFitnessCenter, path: "/mes-programmes" },
    { label: t("nutrition.title", "Nutrition"), icon: MdOutlineRestaurantMenu, path: "/nutrition" },
    { label: t("auto.Clientdashboard.stats", "Stats"), icon: MdOutlineInsights, path: "/statistiques" },
  ];
  const preloadPath = React.useCallback((path = "") => {
    const pathname = String(path).split("?")[0].split("#")[0];
    ROUTE_PRELOADS[pathname]?.().catch(() => {});
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const warmVisibleRoutes = () => items.map((item) => item.path).filter(Boolean).forEach(preloadPath);
    const idleId = window.requestIdleCallback
      ? window.requestIdleCallback(warmVisibleRoutes, { timeout: 1200 })
      : window.setTimeout(warmVisibleRoutes, 450);
    return () => {
      if (window.cancelIdleCallback && typeof idleId === "number") {
        window.cancelIdleCallback(idleId);
      } else {
        window.clearTimeout(idleId);
      }
    };
  }, [items, preloadPath]);

  return (
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
      data-testid="client-mobile-nav"
    >
      <SimpleGrid columns={4} spacing={1}>
        {items.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Button
              key={item.path}
              variant={isActive ? "solid" : "ghost"}
              size="sm"
              h="54px"
              borderRadius="18px"
              px={1}
              flexDirection="column"
              gap={1}
              bg={isActive ? activeBlue : "transparent"}
              color={isActive ? "white" : textColor}
              _hover={{ bg: isActive ? activeBlueDark : ghostHover }}
              onMouseEnter={() => preloadPath(item.path)}
              onTouchStart={() => preloadPath(item.path)}
              onPointerDown={() => preloadPath(item.path)}
              onFocus={() => preloadPath(item.path)}
              onClick={() => navigate(item.path)}
            >
              <Icon as={item.icon} boxSize="18px" />
              <Text as="span" fontSize="10px" fontWeight="850" lineHeight="1" noOfLines={1}>
                {item.label}
              </Text>
            </Button>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}
