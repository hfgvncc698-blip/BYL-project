import { IconButton } from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { useNavigate, useLocation } from "react-router-dom";
import { useAppTheme } from "../../styles/appTheme";

export default function PageBackButton({ fallbackTo = "/user-dashboard", label = "Retour", onClick, ...props }) {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useAppTheme();
  const hasHistory = typeof window !== "undefined" && window.history.length > 1;
  const isOnFallback = location.pathname === fallbackTo;
  const disabled = !hasHistory && isOnFallback;

  const goBack = () => {
    if (disabled) return;
    if (onClick) {
      onClick();
      return;
    }
    if (hasHistory) {
      navigate(-1);
    } else {
      navigate(fallbackTo);
    }
  };

  return (
    <IconButton
      icon={<ArrowBackIcon />}
      aria-label={label}
      onClick={goBack}
      variant="outline"
      w="36px"
      minW="36px"
      h="36px"
      borderRadius="full"
      bg={theme.surfaceSoft}
      borderColor={theme.borderColor}
      color={theme.textColor}
      flexShrink={0}
      _hover={{ bg: theme.surfaceBgStrong, borderColor: theme.accentBlue, color: theme.accentBlue }}
      _active={{ bg: theme.surfaceBgStrong }}
      isDisabled={disabled}
      {...props}
    />
  );
}
