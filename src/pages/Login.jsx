import { useState, useMemo } from "react";
import { useAuth } from "../AuthContext";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import {
  Box, Heading, Input, Button, Text, VStack, InputGroup,
  InputLeftElement, InputRightElement, Alert, AlertIcon,
  useColorModeValue, Link, Divider, HStack
} from "@chakra-ui/react";
import { EmailIcon, LockIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { FcGoogle } from "react-icons/fc";
import { useTranslation, Trans } from "react-i18next";

/* -------------- helpers -------------- */
const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val).toLowerCase());
function looksLikeProIntent(params) {
  const next = params.get("next") || params.get("redirect") || "";
  const role = params.get("role");
  const from = params.get("from");
  const action = params.get("action");
  const subscribe = params.get("subscribe");
  return (
    role === "coach" ||
    from === "pro" ||
    action === "account" ||
    subscribe === "pro" ||
    /\/plans\/professionnel/i.test(next || "")
  );
}

/* -------------- component -------------- */
export default function Login() {
  const { t } = useTranslation("common");
  const { loginWithEmail, loginWithGoogle, resetPassword, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const next = params.get("next");
  const redirect = params.get("redirect");
  const targetAfterLogin = next || redirect || null;
  const proIntent = looksLikeProIntent(params);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Reset password UI
  const [resetMessage, setResetMessage] = useState("");
  const [resetSeverity, setResetSeverity] = useState("info"); // info | success | error | warning
  const [resetLoading, setResetLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0); // seconds

  const bgColor = useColorModeValue("white", "gray.800");
  const textColor = useColorModeValue("black", "white");
  const inputBg = useColorModeValue("gray.100", "gray.700");
  const inputPlaceholderColor = useColorModeValue("gray.500", "gray.400");
  const borderColor = useColorModeValue("gray.300", "gray.600");

  // --- Login email/mdp
  const handleLogin = async (e) => {
    if (e) e.preventDefault();
    await loginWithEmail(email, password, (role, hasActiveSubscription) => {
      if (targetAfterLogin) {
        navigate(targetAfterLogin, { replace: true });
      } else if ((proIntent || role === "coach") && !hasActiveSubscription) {
        navigate("/plans/professionnel", { replace: true });
      } else {
        navigate(role === "coach" ? "/coach-dashboard" : "/user-dashboard", { replace: true });
      }
    });
  };

  // --- Login Google
  const handleGoogleLogin = async () => {
    await loginWithGoogle((role, hasActiveSubscription) => {
      if (targetAfterLogin) {
        navigate(targetAfterLogin, { replace: true });
      } else if ((proIntent || role === "coach") && !hasActiveSubscription) {
        navigate("/plans/professionnel", { replace: true });
      } else {
        navigate(role === "coach" ? "/coach-dashboard" : "/user-dashboard", { replace: true });
      }
    });
  };

  // --- Mot de passe oublié
  const handleResetPassword = async () => {
    setResetMessage("");
    setResetSeverity("info");

    if (!email) {
      setResetMessage(t("auth.login.reset.errors.missingEmail"));
      setResetSeverity("warning");
      return;
    }
    if (!isValidEmail(email)) {
      setResetMessage(t("auth.login.reset.errors.invalidEmail"));
      setResetSeverity("warning");
      return;
    }
    if (cooldown > 0 || resetLoading) return;

    try {
      setResetLoading(true);
      await resetPassword(email);
      setResetMessage(t("auth.login.reset.success"));
      setResetSeverity("success");
    } catch (err) {
      const code = err?.code || "";
      let msg = t("auth.login.reset.genericError");
      let sev = "error";

      if (code === "auth/user-not-found") {
        msg = t("auth.login.reset.errors.userNotFound");
        sev = "warning";
      } else if (code === "auth/invalid-email") {
        msg = t("auth.login.reset.errors.invalidEmail");
        sev = "warning";
      } else if (code === "auth/too-many-requests") {
        msg = t("auth.login.reset.errors.tooMany");
      } else if (code === "auth/network-request-failed") {
        msg = t("auth.login.reset.errors.network");
      } else if (err?.message) {
        msg = err.message;
      }
      setResetMessage(msg);
      setResetSeverity(sev);
    } finally {
      setResetLoading(false);
      setCooldown(60);
      const tmr = setInterval(() => {
        setCooldown((s) => {
          if (s <= 1) {
            clearInterval(tmr);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
  };

  const handleChangeEmail = (e) => {
    setEmail(e.target.value);
    setResetMessage("");
  };

  const handleGoToRegister = () => {
    let url = "/register";
    const search = new URLSearchParams();
    if (targetAfterLogin) search.set("next", targetAfterLogin);
    if (proIntent) {
      search.set("role", "coach");
      search.set("from", "pro");
    }
    const qs = search.toString();
    if (qs) url += `?${qs}`;
    navigate(url);
  };

  return (
    <Box
      maxW="400px"
      mx="auto"
      mt={10}
      p={6}
      bg={bgColor}
      color={textColor}
      boxShadow="lg"
      borderRadius="lg"
      borderWidth="1px"
      borderColor={borderColor}
    >
      <Heading textAlign="center" mb={6}>{t("auth.login.title")}</Heading>

      {error && (
        <Alert status="error" mb={4} borderRadius="md">
          <AlertIcon />
          {error}
        </Alert>
      )}

      {resetMessage && (
        <Alert status={resetSeverity} mb={4} borderRadius="md">
          <AlertIcon />
          {resetMessage}
        </Alert>
      )}

      <form onSubmit={handleLogin}>
        <VStack spacing={4} align="stretch">
          <InputGroup>
            <InputLeftElement pointerEvents="none"><EmailIcon color="gray.500" /></InputLeftElement>
            <Input
              placeholder={t("auth.login.emailPlaceholder")}
              type="email"
              value={email}
              onChange={handleChangeEmail}
              bg={inputBg}
              color={textColor}
              _placeholder={{ color: inputPlaceholderColor }}
              autoComplete="email"
            />
          </InputGroup>

          <InputGroup>
            <InputLeftElement pointerEvents="none"><LockIcon color="gray.500" /></InputLeftElement>
            <Input
              placeholder={t("auth.login.passwordPlaceholder")}
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              bg={inputBg}
              color={textColor}
              _placeholder={{ color: inputPlaceholderColor }}
              autoComplete="current-password"
            />
            <InputRightElement>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={t(showPassword ? "auth.login.hidePassword" : "auth.login.showPassword")}
              >
                {showPassword ? <ViewOffIcon /> : <ViewIcon />}
              </Button>
            </InputRightElement>
          </InputGroup>

          <Button
            variant="link"
            alignSelf="flex-end"
            color="blue.400"
            onClick={handleResetPassword}
            isDisabled={resetLoading || cooldown > 0}
          >
            {resetLoading
              ? t("auth.login.reset.sending")
              : cooldown > 0
              ? t("auth.login.reset.retryIn", { s: cooldown })
              : t("auth.login.forgot")}
          </Button>

          <Button w="full" bg="gray.500" color="white" _hover={{ bg: "gray.600" }} type="submit">
            {t("auth.login.signIn")}
          </Button>

          <Button
            w="full"
            leftIcon={<FcGoogle />}
            bg="white"
            color="black"
            _hover={{ bg: "gray.200" }}
            onClick={handleGoogleLogin}
            borderWidth="1px"
            borderColor="gray.300"
          >
            {t("auth.login.signInWithGoogle")}
          </Button>

          <Text textAlign="center">
            <Trans i18nKey="auth.login.noAccount">
              Pas encore de compte ?
            </Trans>{" "}
            <Text as="span" color="blue.400" cursor="pointer" onClick={handleGoToRegister}>
              {t("auth.login.createAccount")}
            </Text>
          </Text>

          <Divider />

          {/* Liens légaux */}
          <HStack justify="center" spacing={4} fontSize="sm" color="gray.500">
            <Link as={RouterLink} to="/terms">{t("legal.cgu")}</Link>
            <Text>•</Text>
            <Link as={RouterLink} to="/sales-policy">{t("legal.cgv")}</Link>
            <Text>•</Text>
            <Link as={RouterLink} to="/privacy">{t("legal.privacy")}</Link>
          </HStack>
        </VStack>
      </form>
    </Box>
  );
}

