import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  FormControl,
  FormLabel,
  Heading,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
  applyActionCode,
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { auth } from "../firebaseConfig";
import i18n from "../i18n";
import { apiFetch } from "../utils/api";

const SUPPORTED_LANGUAGES = new Set(["fr", "en", "es", "de", "it", "ru", "ar"]);

const COPY = {
  fr: {
    loading: "Vérification de votre invitation…",
    title: "Activez votre compte",
    subtitle: "Créez votre mot de passe pour accéder à votre espace BoostYourLife.",
    email: "Adresse e-mail",
    password: "Nouveau mot de passe",
    confirmation: "Confirmer le mot de passe",
    hint: "Utilisez au moins 8 caractères.",
    action: "Activer mon compte",
    saving: "Activation en cours…",
    mismatch: "Les deux mots de passe ne correspondent pas.",
    tooShort: "Le mot de passe doit contenir au moins 8 caractères.",
    invalidTitle: "Cette invitation n’est plus valide",
    invalidText: "Le lien a peut-être expiré ou a déjà été utilisé. Demandez à votre coach de renvoyer l’invitation.",
    genericError: "L’activation n’a pas pu être terminée. Réessayez dans quelques instants.",
    login: "Retour à la connexion",
  },
  en: {
    loading: "Checking your invitation…",
    title: "Activate your account",
    subtitle: "Create your password to access your BoostYourLife space.",
    email: "Email address",
    password: "New password",
    confirmation: "Confirm password",
    hint: "Use at least 8 characters.",
    action: "Activate my account",
    saving: "Activating…",
    mismatch: "The passwords do not match.",
    tooShort: "Your password must contain at least 8 characters.",
    invalidTitle: "This invitation is no longer valid",
    invalidText: "The link may have expired or already been used. Ask your coach to resend the invitation.",
    genericError: "We could not complete the activation. Please try again in a moment.",
    login: "Back to login",
  },
  es: {
    loading: "Comprobando tu invitación…",
    title: "Activa tu cuenta",
    subtitle: "Crea tu contraseña para acceder a tu espacio BoostYourLife.",
    email: "Correo electrónico",
    password: "Nueva contraseña",
    confirmation: "Confirmar la contraseña",
    hint: "Utiliza al menos 8 caracteres.",
    action: "Activar mi cuenta",
    saving: "Activando…",
    mismatch: "Las contraseñas no coinciden.",
    tooShort: "La contraseña debe contener al menos 8 caracteres.",
    invalidTitle: "Esta invitación ya no es válida",
    invalidText: "Es posible que el enlace haya caducado o ya se haya utilizado. Pide a tu coach que reenvíe la invitación.",
    genericError: "No se pudo completar la activación. Inténtalo de nuevo en unos instantes.",
    login: "Volver al inicio de sesión",
  },
  de: {
    loading: "Ihre Einladung wird geprüft…",
    title: "Konto aktivieren",
    subtitle: "Erstellen Sie Ihr Passwort, um auf Ihren BoostYourLife-Bereich zuzugreifen.",
    email: "E-Mail-Adresse",
    password: "Neues Passwort",
    confirmation: "Passwort bestätigen",
    hint: "Verwenden Sie mindestens 8 Zeichen.",
    action: "Mein Konto aktivieren",
    saving: "Aktivierung läuft…",
    mismatch: "Die Passwörter stimmen nicht überein.",
    tooShort: "Das Passwort muss mindestens 8 Zeichen enthalten.",
    invalidTitle: "Diese Einladung ist nicht mehr gültig",
    invalidText: "Der Link ist möglicherweise abgelaufen oder wurde bereits verwendet. Bitten Sie Ihre Betreuungsperson, die Einladung erneut zu senden.",
    genericError: "Die Aktivierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es gleich noch einmal.",
    login: "Zurück zur Anmeldung",
  },
  it: {
    loading: "Verifica dell’invito…",
    title: "Attiva il tuo account",
    subtitle: "Crea la tua password per accedere al tuo spazio BoostYourLife.",
    email: "Indirizzo e-mail",
    password: "Nuova password",
    confirmation: "Conferma la password",
    hint: "Utilizza almeno 8 caratteri.",
    action: "Attiva il mio account",
    saving: "Attivazione in corso…",
    mismatch: "Le password non corrispondono.",
    tooShort: "La password deve contenere almeno 8 caratteri.",
    invalidTitle: "Questo invito non è più valido",
    invalidText: "Il link potrebbe essere scaduto o già utilizzato. Chiedi al tuo coach di inviare nuovamente l’invito.",
    genericError: "Non è stato possibile completare l’attivazione. Riprova tra qualche istante.",
    login: "Torna all’accesso",
  },
  ru: {
    loading: "Проверяем приглашение…",
    title: "Активируйте аккаунт",
    subtitle: "Создайте пароль для доступа к своему пространству BoostYourLife.",
    email: "Адрес электронной почты",
    password: "Новый пароль",
    confirmation: "Подтвердите пароль",
    hint: "Используйте не менее 8 символов.",
    action: "Активировать аккаунт",
    saving: "Активация…",
    mismatch: "Пароли не совпадают.",
    tooShort: "Пароль должен содержать не менее 8 символов.",
    invalidTitle: "Это приглашение больше не действительно",
    invalidText: "Срок действия ссылки мог истечь или она уже была использована. Попросите тренера отправить приглашение повторно.",
    genericError: "Не удалось завершить активацию. Повторите попытку через несколько минут.",
    login: "Вернуться ко входу",
  },
  ar: {
    loading: "جارٍ التحقق من الدعوة…",
    title: "فعّل حسابك",
    subtitle: "أنشئ كلمة المرور للوصول إلى مساحتك على BoostYourLife.",
    email: "البريد الإلكتروني",
    password: "كلمة المرور الجديدة",
    confirmation: "تأكيد كلمة المرور",
    hint: "استخدم 8 أحرف على الأقل.",
    action: "تفعيل حسابي",
    saving: "جارٍ التفعيل…",
    mismatch: "كلمتا المرور غير متطابقتين.",
    tooShort: "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
    invalidTitle: "هذه الدعوة لم تعد صالحة",
    invalidText: "ربما انتهت صلاحية الرابط أو تم استخدامه. اطلب من المدرب إعادة إرسال الدعوة.",
    genericError: "تعذر إكمال التفعيل. حاول مرة أخرى بعد قليل.",
    login: "العودة إلى تسجيل الدخول",
  },
};

const RECOVERY_COPY = {
  fr: {
    ...COPY.fr,
    title: "Réinitialisez votre mot de passe",
    subtitle: "Choisissez un nouveau mot de passe pour retrouver l’accès à votre espace BoostYourLife.",
    action: "Réinitialiser mon mot de passe",
    saving: "Réinitialisation en cours…",
    invalidTitle: "Ce lien de récupération n’est plus valide",
    invalidText: "Le lien a peut-être expiré ou a déjà été utilisé. Effectuez une nouvelle demande depuis la page de connexion.",
    successTitle: "Mot de passe mis à jour",
    successText: "Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.",
  },
  en: {
    ...COPY.en,
    title: "Reset your password",
    subtitle: "Choose a new password to regain access to your BoostYourLife space.",
    action: "Reset my password",
    saving: "Resetting…",
    invalidTitle: "This recovery link is no longer valid",
    invalidText: "The link may have expired or already been used. Make a new request from the login page.",
    successTitle: "Password updated",
    successText: "You can now log in with your new password.",
  },
  es: {
    ...COPY.es,
    title: "Restablece tu contraseña",
    subtitle: "Elige una nueva contraseña para volver a acceder a tu espacio BoostYourLife.",
    action: "Restablecer mi contraseña",
    saving: "Restableciendo…",
    invalidTitle: "Este enlace de recuperación ya no es válido",
    invalidText: "Es posible que el enlace haya caducado o ya se haya utilizado. Solicita uno nuevo desde la página de inicio de sesión.",
    successTitle: "Contraseña actualizada",
    successText: "Ya puedes iniciar sesión con tu nueva contraseña.",
  },
  de: {
    ...COPY.de,
    title: "Passwort zurücksetzen",
    subtitle: "Wählen Sie ein neues Passwort, um wieder auf Ihren BoostYourLife-Bereich zuzugreifen.",
    action: "Mein Passwort zurücksetzen",
    saving: "Passwort wird zurückgesetzt…",
    invalidTitle: "Dieser Wiederherstellungslink ist nicht mehr gültig",
    invalidText: "Der Link ist möglicherweise abgelaufen oder wurde bereits verwendet. Fordern Sie auf der Anmeldeseite einen neuen Link an.",
    successTitle: "Passwort aktualisiert",
    successText: "Sie können sich jetzt mit Ihrem neuen Passwort anmelden.",
  },
  it: {
    ...COPY.it,
    title: "Reimposta la password",
    subtitle: "Scegli una nuova password per accedere nuovamente al tuo spazio BoostYourLife.",
    action: "Reimposta la mia password",
    saving: "Reimpostazione in corso…",
    invalidTitle: "Questo link di recupero non è più valido",
    invalidText: "Il link potrebbe essere scaduto o già utilizzato. Richiedine uno nuovo dalla pagina di accesso.",
    successTitle: "Password aggiornata",
    successText: "Ora puoi accedere con la nuova password.",
  },
  ru: {
    ...COPY.ru,
    title: "Сброс пароля",
    subtitle: "Создайте новый пароль, чтобы восстановить доступ к пространству BoostYourLife.",
    action: "Сбросить пароль",
    saving: "Сброс пароля…",
    invalidTitle: "Эта ссылка для восстановления больше не действительна",
    invalidText: "Срок действия ссылки мог истечь или она уже была использована. Запросите новую ссылку на странице входа.",
    successTitle: "Пароль обновлён",
    successText: "Теперь вы можете войти с новым паролем.",
  },
  ar: {
    ...COPY.ar,
    title: "إعادة تعيين كلمة المرور",
    subtitle: "اختر كلمة مرور جديدة لاستعادة الوصول إلى مساحتك على BoostYourLife.",
    action: "إعادة تعيين كلمة المرور",
    saving: "جارٍ إعادة التعيين…",
    invalidTitle: "رابط الاستعادة هذا لم يعد صالحاً",
    invalidText: "ربما انتهت صلاحية الرابط أو تم استخدامه. اطلب رابطاً جديداً من صفحة تسجيل الدخول.",
    successTitle: "تم تحديث كلمة المرور",
    successText: "يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.",
  },
};

const EMAIL_VERIFICATION_COPY = {
  fr: {
    ...COPY.fr,
    loading: "Confirmation de votre adresse e-mail…",
    invalidTitle: "Ce lien de confirmation n’est plus valide",
    invalidText: "Le lien a peut-être expiré ou a déjà été utilisé. Relancez la modification depuis votre profil.",
    successTitle: "Adresse e-mail confirmée",
    successText: "Votre nouvelle adresse est maintenant associée à votre compte. Vous pouvez vous reconnecter.",
  },
  en: {
    ...COPY.en,
    loading: "Confirming your email address…",
    invalidTitle: "This confirmation link is no longer valid",
    invalidText: "The link may have expired or already been used. Start the change again from your profile.",
    successTitle: "Email address confirmed",
    successText: "Your new address is now linked to your account. You can log in again.",
  },
  es: {
    ...COPY.es,
    loading: "Confirmando tu dirección de correo…",
    invalidTitle: "Este enlace de confirmación ya no es válido",
    invalidText: "Es posible que haya caducado o ya se haya utilizado. Vuelve a iniciar el cambio desde tu perfil.",
    successTitle: "Dirección de correo confirmada",
    successText: "Tu nueva dirección ya está asociada a tu cuenta. Puedes volver a iniciar sesión.",
  },
  de: {
    ...COPY.de,
    loading: "E-Mail-Adresse wird bestätigt…",
    invalidTitle: "Dieser Bestätigungslink ist nicht mehr gültig",
    invalidText: "Der Link ist möglicherweise abgelaufen oder wurde bereits verwendet. Starten Sie die Änderung erneut in Ihrem Profil.",
    successTitle: "E-Mail-Adresse bestätigt",
    successText: "Ihre neue Adresse ist jetzt mit Ihrem Konto verknüpft. Sie können sich erneut anmelden.",
  },
  it: {
    ...COPY.it,
    loading: "Conferma dell’indirizzo e-mail…",
    invalidTitle: "Questo link di conferma non è più valido",
    invalidText: "Il link potrebbe essere scaduto o già utilizzato. Avvia nuovamente la modifica dal profilo.",
    successTitle: "Indirizzo e-mail confermato",
    successText: "Il nuovo indirizzo è ora associato al tuo account. Puoi accedere di nuovo.",
  },
  ru: {
    ...COPY.ru,
    loading: "Подтверждаем адрес электронной почты…",
    invalidTitle: "Эта ссылка для подтверждения больше не действительна",
    invalidText: "Срок действия ссылки мог истечь или она уже была использована. Запустите изменение снова в профиле.",
    successTitle: "Адрес электронной почты подтверждён",
    successText: "Новый адрес привязан к вашему аккаунту. Теперь вы можете снова войти.",
  },
  ar: {
    ...COPY.ar,
    loading: "جارٍ تأكيد عنوان بريدك الإلكتروني…",
    invalidTitle: "رابط التأكيد هذا لم يعد صالحاً",
    invalidText: "ربما انتهت صلاحية الرابط أو تم استخدامه. أعد بدء التغيير من ملفك الشخصي.",
    successTitle: "تم تأكيد عنوان البريد الإلكتروني",
    successText: "تم ربط عنوانك الجديد بحسابك. يمكنك تسجيل الدخول من جديد.",
  },
};

function languageFromSearch(search) {
  const raw = new URLSearchParams(search).get("lang")?.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.has(raw) ? raw : "fr";
}

export default function ActivateAccount() {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = useMemo(() => languageFromSearch(location.search), [location.search]);
  const isRecovery = location.pathname === "/reset-password";
  const isEmailVerification = location.pathname === "/verify-email";
  const copySet = isEmailVerification ? EMAIL_VERIFICATION_COPY : isRecovery ? RECOVERY_COPY : COPY;
  const copy = copySet[lang] || copySet.fr;
  const isRtl = lang === "ar";
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const oobCode = params.get("oobCode") || "";
  const isLocalPreview = import.meta.env.DEV && params.get("preview") === "1";
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const cardBg = useColorModeValue("white", "gray.800");
  const pageBg = useColorModeValue("gray.50", "gray.900");

  useEffect(() => {
    void i18n.changeLanguage(lang);
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    if (isLocalPreview) {
      if (isEmailVerification) {
        setStatus("success");
        return undefined;
      }
      setEmail("client@exemple.fr");
      setStatus("ready");
      return undefined;
    }
    if (isEmailVerification) {
      if (!oobCode || params.get("mode") !== "verifyAndChangeEmail") {
        setStatus("invalid");
        return undefined;
      }
      applyActionCode(auth, oobCode)
        .then(() => {
          if (!cancelled) setStatus("success");
        })
        .catch(() => {
          if (!cancelled) setStatus("invalid");
        });
      return () => {
        cancelled = true;
      };
    }
    if (!oobCode || params.get("mode") !== "resetPassword") {
      setStatus("invalid");
      return undefined;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then((verifiedEmail) => {
        if (cancelled) return;
        setEmail(verifiedEmail);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [isEmailVerification, isLocalPreview, oobCode, params]);

  const finishActivation = async (event) => {
    event.preventDefault();
    setMessage("");
    if (password.length < 8) {
      setMessage(copy.tooShort);
      return;
    }
    if (password !== confirmation) {
      setMessage(copy.mismatch);
      return;
    }

    setStatus("saving");
    try {
      await confirmPasswordReset(auth, oobCode, password);
      if (isRecovery) {
        setStatus("success");
        return;
      }
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const activation = await apiFetch("/client-profile/activation-complete", {
        method: "POST",
        body: JSON.stringify({}),
      });

      try {
        const sendWelcomeEmail = httpsCallable(
          getFunctions(undefined, "europe-west1"),
          "sendWelcomeEmail"
        );
        await sendWelcomeEmail({
          email: credential.user.email,
          firstName: activation.firstName || "",
          role: activation.role || "particulier",
          lang: activation.preferredLang || lang,
        });
      } catch (mailError) {
        console.warn("[activation] welcome email will be retried after login:", mailError?.message || mailError);
      }

      const destination =
        activation.accountType === "club_owner" || activation.clubRole === "owner"
          ? "/club-dashboard"
          : activation.role === "coach"
            ? "/coach-dashboard"
            : "/user-dashboard";
      navigate(destination, { replace: true });
    } catch (error) {
      console.error("[activation] failed:", error);
      setMessage(copy.genericError);
      setStatus("ready");
    }
  };

  return (
    <Box minH="calc(100vh - 72px)" bg={pageBg} py={{ base: 8, md: 16 }} dir={isRtl ? "rtl" : "ltr"}>
      <Container maxW="lg">
        <Box bg={cardBg} borderWidth="1px" borderRadius="2xl" boxShadow="xl" p={{ base: 6, md: 10 }}>
          <Text color="blue.600" fontWeight="800" fontSize="xl" mb={7}>
            BoostYourLife.coach
          </Text>

          {status === "checking" && (
            <VStack spacing={5} py={10}>
              <Spinner size="xl" color="blue.500" />
              <Text>{copy.loading}</Text>
            </VStack>
          )}

          {status === "invalid" && (
            <VStack align="stretch" spacing={5}>
              <Heading size="lg">{copy.invalidTitle}</Heading>
              <Alert status="warning" borderRadius="xl">
                <AlertIcon />
                {copy.invalidText}
              </Alert>
              <Button onClick={() => navigate("/login")} colorScheme="blue">
                {copy.login}
              </Button>
            </VStack>
          )}

          {status === "success" && (
            <VStack align="stretch" spacing={5}>
              <Heading size="lg">{copy.successTitle}</Heading>
              <Alert status="success" borderRadius="xl">
                <AlertIcon />
                {copy.successText}
              </Alert>
              <Button onClick={() => navigate("/login")} colorScheme="blue">
                {copy.login}
              </Button>
            </VStack>
          )}

          {!isEmailVerification && (status === "ready" || status === "saving") && (
            <Box as="form" onSubmit={finishActivation}>
              <Heading size="lg" mb={3}>{copy.title}</Heading>
              <Text color="gray.500" mb={7}>{copy.subtitle}</Text>
              <VStack spacing={5} align="stretch">
                <FormControl>
                  <FormLabel>{copy.email}</FormLabel>
                  <Input value={email} isReadOnly />
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{copy.password}</FormLabel>
                  <InputGroup>
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="new-password"
                    />
                    <InputRightElement>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <ViewOffIcon /> : <ViewIcon />}
                      </Button>
                    </InputRightElement>
                  </InputGroup>
                  <Text mt={2} fontSize="sm" color="gray.500">{copy.hint}</Text>
                </FormControl>
                <FormControl isRequired>
                  <FormLabel>{copy.confirmation}</FormLabel>
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="new-password"
                  />
                </FormControl>
                {message && (
                  <Alert status="error" borderRadius="xl">
                    <AlertIcon />
                    {message}
                  </Alert>
                )}
                <Button type="submit" colorScheme="blue" size="lg" isLoading={status === "saving"}>
                  {status === "saving" ? copy.saving : copy.action}
                </Button>
              </VStack>
            </Box>
          )}
        </Box>
      </Container>
    </Box>
  );
}
