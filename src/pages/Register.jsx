import { useState, useMemo, useEffect } from "react";
import { useAuth } from "../AuthContext";
import { useNavigate, useLocation, Link as RouterLink } from "react-router-dom";
import {
  Box, Heading, Input, Button, Text, VStack, InputGroup,
  InputLeftElement, InputRightElement, IconButton, Alert, AlertIcon,
  Select, useColorModeValue, Checkbox, HStack, Link, Divider
} from "@chakra-ui/react";
import { LockIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { FcGoogle } from "react-icons/fc";
import { useTranslation, Trans } from "react-i18next";

function calcAge(birthDateStr) {
  if (!birthDateStr) return 0;
  const today = new Date();
  const bd = new Date(birthDateStr);
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

const Register = () => {
  const { t } = useTranslation("common");
  const { registerWithEmail, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const redirect = params.get("redirect") || params.get("next");
  const forcedRole = params.get("role");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [email, setEmail]         = useState("");
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword]   = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole]           = useState("particulier");

  useEffect(() => {
    if (forcedRole === "coach") setRole("coach");
  }, [forcedRole]);

  const [isAdultChecked, setIsAdultChecked] = useState(false);
  const [acceptTermsChecked, setAcceptTermsChecked] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const bgColor = useColorModeValue("white", "gray.800");
  const textColor = useColorModeValue("black", "white");
  const inputBg = useColorModeValue("gray.100", "gray.700");
  const inputPlaceholderColor = useColorModeValue("gray.500", "gray.400");
  const borderColor = useColorModeValue("gray.300", "gray.600");

  const age = useMemo(() => calcAge(birthDate), [birthDate]);
  const isAdult = age >= 18;

  const clearError = () => errorMessage && setErrorMessage("");

  const handleRegister = async (e) => {
    if (e) e.preventDefault();

    if (email !== confirmEmail) return setErrorMessage(t("auth.register.errors.emailsMismatch"));
    if (password !== confirmPassword) return setErrorMessage(t("auth.register.errors.passwordsMismatch"));
    if (!firstName || !lastName || !birthDate || !email || !password) return setErrorMessage(t("auth.register.errors.missingFields"));
    if (!isAdult) return setErrorMessage(t("auth.register.errors.mustBeAdult"));
    if (!isAdultChecked || !acceptTermsChecked) return setErrorMessage(t("auth.register.errors.mustConfirmAndAccept"));

    try {
      await registerWithEmail(
        email,
        password,
        firstName,
        lastName,
        role,
        birthDate,
        {
          ageVerified: true,
          cguAccepted: true,
          cgvAccepted: true,
          acceptedAt: new Date().toISOString(),
          cguVersion: "v1.0",
          cgvVersion: "v1.0",
        }
      );
      if (redirect) navigate(redirect, { replace: true });
      else navigate(role === "coach" ? "/coach-dashboard" : "/user-dashboard", { replace: true });
    } catch (err) {
      console.error(err);
      setErrorMessage(t("auth.register.errors.failed"));
    }
  };

  const handleGoToLogin = () => {
    if (redirect) navigate(`/login?next=${encodeURIComponent(redirect)}`);
    else navigate("/login");
  };

  const canSubmit =
    firstName && lastName && birthDate && email && confirmEmail && password && confirmPassword &&
    isAdult && isAdultChecked && acceptTermsChecked;

  return (
    <Box maxW="420px" mx="auto" mt={10} p={6} bg={bgColor} color={textColor}
      boxShadow="lg" borderRadius="lg" borderWidth="1px" borderColor={borderColor}>
      <Heading textAlign="center" mb={6}>{t("auth.register.title")}</Heading>

      {errorMessage && (
        <Alert status="error" mb={4} borderRadius="md">
          <AlertIcon />
          {errorMessage}
        </Alert>
      )}

      <form onSubmit={handleRegister}>
        <VStack spacing={4} align="stretch">
          <Input placeholder={t("auth.register.firstName")} type="text" value={firstName}
            onChange={e => { setFirstName(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />
          <Input placeholder={t("auth.register.lastName")} type="text" value={lastName}
            onChange={e => { setLastName(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />
          <Input placeholder={t("auth.register.birthDate")} type="date" value={birthDate}
            onChange={e => { setBirthDate(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />
          {!isAdult && birthDate && (
            <Text fontSize="sm" color="red.400">
              {t("auth.register.ageWarning", { age })}
            </Text>
          )}

          <Input placeholder={t("auth.register.email")} type="email" value={email}
            onChange={e => { setEmail(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />
          <Input placeholder={t("auth.register.confirmEmail")} type="email" value={confirmEmail}
            onChange={e => { setConfirmEmail(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />

          <Select value={role} onChange={e => { setRole(e.target.value); clearError(); }}
            bg={inputBg} color={textColor} borderColor={borderColor}>
            <option value="particulier">{t("roles.individual")}</option>
            <option value="coach">{t("roles.coach")}</option>
          </Select>

          <InputGroup>
            <InputLeftElement pointerEvents="none"><LockIcon color="gray.500" /></InputLeftElement>
            <Input placeholder={t("auth.register.password")} type={showPassword ? "text" : "password"} value={password}
              onChange={e => { setPassword(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />
            <InputRightElement>
              <IconButton aria-label={t("auth.register.togglePassword")} icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                onClick={() => setShowPassword(!showPassword)} size="sm" variant="ghost" />
            </InputRightElement>
          </InputGroup>

          <InputGroup>
            <InputLeftElement pointerEvents="none"><LockIcon color="gray.500" /></InputLeftElement>
            <Input placeholder={t("auth.register.confirmPassword")} type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); clearError(); }} bg={inputBg} color={textColor} _placeholder={{ color: inputPlaceholderColor }} />
            <InputRightElement>
              <IconButton aria-label={t("auth.register.togglePassword")} icon={showConfirmPassword ? <ViewOffIcon /> : <ViewIcon />}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)} size="sm" variant="ghost" />
            </InputRightElement>
          </InputGroup>

          {/* Liens légaux */}
          <VStack align="start" spacing={2}>
            <Checkbox isChecked={isAdultChecked} onChange={(e)=>{ setIsAdultChecked(e.target.checked); clearError(); }}>
              <Trans i18nKey="auth.register.adultConfirm">
                J’atteste avoir <b>18 ans ou plus</b>.
              </Trans>
            </Checkbox>

            <Checkbox isChecked={acceptTermsChecked} onChange={(e)=>{ setAcceptTermsChecked(e.target.checked); clearError(); }}>
              <Trans
                i18nKey="auth.register.acceptTerms"
                components={{
                  cgu: <Link as={RouterLink} to="/terms" color="blue.400" />,
                  cgv: <Link as={RouterLink} to="/sales-policy" color="blue.400" />
                }}
              />
            </Checkbox>

            <Text fontSize="xs" color="gray.500">
              <Trans
                i18nKey="auth.register.privacyHint"
                components={{ privacy: <Link as={RouterLink} to="/privacy" color="blue.400" /> }}
              />
            </Text>
          </VStack>

          <Button w="full" bg={canSubmit ? "gray.500" : "gray.400"} color="white"
            _hover={{ bg: canSubmit ? "gray.600" : "gray.400" }} type="submit" isDisabled={!canSubmit}>
            {t("auth.register.signUp")}
          </Button>

          <Divider />

          <Button w="full" leftIcon={<FcGoogle />} bg="white" color="black" _hover={{ bg: "gray.200" }}
            onClick={() => loginWithGoogle()} borderWidth="1px" borderColor="gray.300">
            {t("auth.register.signUpWithGoogle")}
          </Button>

          <Text textAlign="center">
            {t("auth.register.haveAccount")}{" "}
            <Text as="span" color="blue.400" cursor="pointer" onClick={handleGoToLogin}>
              {t("auth.register.goToLogin")}
            </Text>
          </Text>
        </VStack>
      </form>
    </Box>
  );
};

export default Register;

