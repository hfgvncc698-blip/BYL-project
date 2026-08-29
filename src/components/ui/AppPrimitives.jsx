import React from "react";
import {
  Box,
  Link as ChakraLink,
  Circle,
  Flex,
  Heading,
  Icon,
  IconButton,
  Text,
} from "@chakra-ui/react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import { Link } from "react-router-dom";
import { useAppTheme } from "../../styles/appTheme";

export function AppIconBadge({ icon, accent, variant = "section", ...props }) {
  const theme = useAppTheme();
  const isSection = variant === "section";

  return (
    <Circle
      size={isSection ? "40px" : "44px"}
      borderRadius={isSection ? "full" : "14px"}
      bg={theme.surfaceSoft}
      color={accent || theme.accentBlue}
      border="1px solid"
      borderColor={theme.borderColor}
      flexShrink={0}
      {...props}
    >
      <Icon as={icon} boxSize={isSection ? "20px" : "20px"} />
    </Circle>
  );
}

export function AppNavigationArrow({ to, onClick, label, ...placementProps }) {
  const theme = useAppTheme();
  const controlProps = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    w: "28px",
    minW: "28px",
    h: "28px",
    p: 0,
    borderRadius: "full",
    border: 0,
    bg: "transparent",
    color: theme.textColor,
    textDecoration: "none",
    transition: "color 0.15s ease",
    _hover: {
      bg: "transparent",
      color: theme.accentBlue,
      textDecoration: "none",
    },
    _active: {
      bg: "transparent",
      color: theme.accentBlue,
    },
    _focusVisible: {
      bg: "transparent",
      color: theme.accentBlue,
      outline: "2px solid",
      outlineColor: theme.accentBlue,
      outlineOffset: "2px",
    },
  };

  if (to) {
    return (
      <ChakraLink
        as={Link}
        to={to}
        aria-label={label}
        onClick={onClick}
        {...placementProps}
        {...controlProps}
      >
        <ChevronRightIcon boxSize="20px" />
      </ChakraLink>
    );
  }

  return (
    <IconButton
      aria-label={label}
      icon={<ChevronRightIcon boxSize="20px" />}
      variant="ghost"
      onClick={onClick}
      {...placementProps}
      {...controlProps}
    />
  );
}

export function AppSurface({ children, variant = "card", ...props }) {
  const theme = useAppTheme();
  const isTile = variant === "tile";

  return (
    <Box
      bg={isTile ? theme.surfaceSoft : theme.surfaceBgStrong}
      border="1px solid"
      borderColor={theme.borderColor}
      borderRadius={isTile ? "20px" : "22px"}
      boxShadow={isTile ? "none" : theme.cardProps.boxShadow}
      backdropFilter={isTile ? undefined : "blur(14px)"}
      position="relative"
      overflow="hidden"
      {...props}
    >
      {children}
    </Box>
  );
}

export function AppSectionHeader({
  icon,
  iconAccent,
  title,
  subtitle,
  titleRoute,
  action,
  headingAs = "h2",
  ...props
}) {
  const theme = useAppTheme();

  return (
    <Flex align="center" justify="space-between" gap={3} {...props}>
      <Flex align="center" gap={3} minW={0}>
        {icon ? <AppIconBadge icon={icon} accent={iconAccent} variant="section" /> : null}
        <Box minW={0}>
          <Heading
            as={titleRoute ? Link : headingAs}
            to={titleRoute}
            size="md"
            color={theme.textColor}
            fontWeight="900"
            lineHeight="1.15"
            letterSpacing="-0.02em"
            textDecoration="none"
            _hover={titleRoute ? { color: theme.textColor, textDecoration: "none" } : undefined}
          >
            {title}
          </Heading>
          {subtitle ? (
            <Text mt={1} color={theme.mutedText} fontSize="sm" lineHeight="1.35">
              {subtitle}
            </Text>
          ) : null}
        </Box>
      </Flex>
      <Flex align="center" gap={2} flexShrink={0}>
        {action}
        {titleRoute ? <AppNavigationArrow to={titleRoute} label={title} /> : null}
      </Flex>
    </Flex>
  );
}

export function AppMetricValue({ children, ...props }) {
  const theme = useAppTheme();
  return (
    <Text
      fontSize="32px"
      fontWeight="950"
      letterSpacing="-0.04em"
      lineHeight="1"
      color={theme.textColor}
      {...props}
    >
      {children}
    </Text>
  );
}

export function AppMetricTile({ icon, accent, title, subtitle, value, to, onOpen, ...props }) {
  const theme = useAppTheme();
  const hasNavigation = Boolean(to || onOpen);

  return (
    <AppSurface variant="tile" minH="156px" p={3.5} {...props}>
      {hasNavigation ? (
        <AppNavigationArrow
          to={to}
          onClick={onOpen}
          label={title}
          position="absolute"
          top={3.5}
          right={3.5}
        />
      ) : null}
      <Flex direction="column" h="100%">
        <Flex align="center" gap={3} pr={hasNavigation ? 8 : 0}>
          {icon ? <AppIconBadge icon={icon} accent={accent} variant="tile" /> : null}
          <Box minW={0}>
            <Text color={theme.textColor} fontWeight="900" fontSize="md" lineHeight="1.15" noOfLines={2}>
              {title}
            </Text>
            {subtitle ? <AppSupportingText mt={1} noOfLines={2}>{subtitle}</AppSupportingText> : null}
          </Box>
        </Flex>
        <AppMetricValue mt="auto" pt={4}>{value}</AppMetricValue>
      </Flex>
    </AppSurface>
  );
}

export function AppSupportingText({ children, ...props }) {
  const theme = useAppTheme();
  return (
    <Text fontSize="sm" color={theme.mutedText} lineHeight="1.35" {...props}>
      {children}
    </Text>
  );
}
