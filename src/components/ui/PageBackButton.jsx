import { IconButton } from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { useNavigate, useLocation } from "react-router-dom";

export default function PageBackButton({ fallbackTo = "/user-dashboard", label = "Retour" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = typeof window !== "undefined" && window.history.length > 1;
  const isOnFallback = location.pathname === fallbackTo;
  const disabled = !hasHistory && isOnFallback;

  const goBack = () => {
    if (disabled) return;
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
      variant="ghost"
      size="sm"
      borderRadius="full"
      isDisabled={disabled}
    />
  );
}
