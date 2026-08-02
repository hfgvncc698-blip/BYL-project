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
import { useAuth } from "../AuthContext";
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
    successText: "Votre adresse est confirmée. Si vous avez choisi une offre professionnelle, votre essai démarre maintenant.",
  },
  en: {
    ...COPY.en,
    loading: "Confirming your email address…",
    invalidTitle: "This confirmation link is no longer valid",
    invalidText: "The link may have expired or already been used. Start the change again from your profile.",
    successTitle: "Email address confirmed",
    successText: "Your address is confirmed. If you selected a professional plan, your trial starts now.",
  },
  es: {
    ...COPY.es,
    loading: "Confirmando tu dirección de correo…",
    invalidTitle: "Este enlace de confirmación ya no es válido",
    invalidText: "Es posible que haya caducado o ya se haya utilizado. Vuelve a iniciar el cambio desde tu perfil.",
    successTitle: "Dirección de correo confirmada",
    successText: "Tu dirección está confirmada. Si elegiste un plan profesional, tu prueba empieza ahora.",
  },
  de: {
    ...COPY.de,
    loading: "E-Mail-Adresse wird bestätigt…",
    invalidTitle: "Dieser Bestätigungslink ist nicht mehr gültig",
    invalidText: "Der Link ist möglicherweise abgelaufen oder wurde bereits verwendet. Starten Sie die Änderung erneut in Ihrem Profil.",
    successTitle: "E-Mail-Adresse bestätigt",
    successText: "Ihre Adresse ist bestätigt. Wenn Sie einen Profi-Tarif gewählt haben, beginnt Ihr Testzeitraum jetzt.",
  },
  it: {
    ...COPY.it,
    loading: "Conferma dell’indirizzo e-mail…",
    invalidTitle: "Questo link di conferma non è più valido",
    invalidText: "Il link potrebbe essere scaduto o già utilizzato. Avvia nuovamente la modifica dal profilo.",
    successTitle: "Indirizzo e-mail confermato",
    successText: "Il tuo indirizzo è confermato. Se hai scelto un piano professionale, la prova inizia ora.",
  },
  ru: {
    ...COPY.ru,
    loading: "Подтверждаем адрес электронной почты…",
    invalidTitle: "Эта ссылка для подтверждения больше не действительна",
    invalidText: "Срок действия ссылки мог истечь или она уже была использована. Запустите изменение снова в профиле.",
    successTitle: "Адрес электронной почты подтверждён",
    successText: "Адрес подтверждён. Если вы выбрали профессиональный тариф, пробный период начинается сейчас.",
  },
  ar: {
    ...COPY.ar,
    loading: "جارٍ تأكيد عنوان بريدك الإلكتروني…",
    invalidTitle: "رابط التأكيد هذا لم يعد صالحاً",
    invalidText: "ربما انتهت صلاحية الرابط أو تم استخدامه. أعد بدء التغيير من ملفك الشخصي.",
    successTitle: "تم تأكيد عنوان البريد الإلكتروني",
    successText: "تم تأكيد عنوانك. إذا اخترت خطة احترافية، فستبدأ الفترة التجريبية الآن.",
  },
};

const PENDING_EMAIL_COPY = {
  fr: {
    pendingTitle: "Confirmez votre adresse e-mail",
    pendingText: "Nous vous avons envoyé un lien de confirmation. Votre essai démarrera seulement après cette validation.",
    check: "J’ai confirmé mon adresse",
    checking: "Vérification…",
    resend: "Renvoyer l’e-mail",
    sent: "Un nouveau lien de confirmation vient d’être envoyé.",
    notYet: "L’adresse n’est pas encore confirmée. Ouvrez le lien reçu puis réessayez.",
    resendError: "L’envoi a échoué. Patientez quelques instants avant de réessayer.",
    continue: "Continuer vers mon espace",
  },
  en: {
    pendingTitle: "Confirm your email address",
    pendingText: "We sent you a confirmation link. Your trial will start only after verification.",
    check: "I confirmed my address",
    checking: "Checking…",
    resend: "Resend email",
    sent: "A new confirmation link has been sent.",
    notYet: "The address is not confirmed yet. Open the link you received and try again.",
    resendError: "We could not send the email. Wait a moment before trying again.",
    continue: "Continue to my account",
  },
  es: {
    pendingTitle: "Confirma tu correo electrónico",
    pendingText: "Te hemos enviado un enlace. Tu prueba empezará únicamente después de la confirmación.",
    check: "He confirmado mi dirección",
    checking: "Comprobando…",
    resend: "Reenviar el correo",
    sent: "Se ha enviado un nuevo enlace de confirmación.",
    notYet: "La dirección aún no está confirmada. Abre el enlace recibido e inténtalo de nuevo.",
    resendError: "No se pudo enviar el correo. Espera un momento antes de volver a intentarlo.",
    continue: "Continuar a mi espacio",
  },
  de: {
    pendingTitle: "Bestätigen Sie Ihre E-Mail-Adresse",
    pendingText: "Wir haben Ihnen einen Bestätigungslink gesendet. Ihr Testzeitraum beginnt erst nach der Bestätigung.",
    check: "Ich habe meine Adresse bestätigt",
    checking: "Prüfung…",
    resend: "E-Mail erneut senden",
    sent: "Ein neuer Bestätigungslink wurde gesendet.",
    notYet: "Die Adresse ist noch nicht bestätigt. Öffnen Sie den Link und versuchen Sie es erneut.",
    resendError: "Die E-Mail konnte nicht gesendet werden. Versuchen Sie es später erneut.",
    continue: "Zu meinem Bereich",
  },
  it: {
    pendingTitle: "Conferma il tuo indirizzo e-mail",
    pendingText: "Ti abbiamo inviato un link. La prova inizierà solo dopo la conferma.",
    check: "Ho confermato il mio indirizzo",
    checking: "Verifica…",
    resend: "Invia di nuovo l’e-mail",
    sent: "È stato inviato un nuovo link di conferma.",
    notYet: "L’indirizzo non è ancora confermato. Apri il link ricevuto e riprova.",
    resendError: "Invio non riuscito. Attendi qualche istante prima di riprovare.",
    continue: "Continua nel mio spazio",
  },
  ru: {
    pendingTitle: "Подтвердите адрес электронной почты",
    pendingText: "Мы отправили ссылку для подтверждения. Пробный период начнётся только после проверки.",
    check: "Я подтвердил адрес",
    checking: "Проверяем…",
    resend: "Отправить письмо повторно",
    sent: "Новая ссылка для подтверждения отправлена.",
    notYet: "Адрес ещё не подтверждён. Откройте полученную ссылку и повторите попытку.",
    resendError: "Не удалось отправить письмо. Повторите попытку немного позже.",
    continue: "Перейти в личный кабинет",
  },
  ar: {
    pendingTitle: "أكّد عنوان بريدك الإلكتروني",
    pendingText: "أرسلنا إليك رابط تأكيد. لن تبدأ الفترة التجريبية إلا بعد التحقق.",
    check: "لقد أكدت عنواني",
    checking: "جارٍ التحقق…",
    resend: "إعادة إرسال البريد",
    sent: "تم إرسال رابط تأكيد جديد.",
    notYet: "لم يتم تأكيد العنوان بعد. افتح الرابط ثم حاول مرة أخرى.",
    resendError: "تعذر إرسال البريد. انتظر قليلاً قبل المحاولة مجدداً.",
    continue: "المتابعة إلى حسابي",
  },
};

function languageFromSearch(search) {
  const raw = new URLSearchParams(search).get("lang")?.toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.has(raw) ? raw : "fr";
}

export default function ActivateAccount() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    resendEmailVerification,
    refreshEmailVerification,
  } = useAuth();
  const lang = useMemo(() => languageFromSearch(location.search), [location.search]);
  const isRecovery = location.pathname === "/reset-password";
  const isEmailVerification = location.pathname === "/verify-email";
  const copySet = isEmailVerification ? EMAIL_VERIFICATION_COPY : isRecovery ? RECOVERY_COPY : COPY;
  const copy = {
    ...(copySet[lang] || copySet.fr),
    ...(isEmailVerification ? PENDING_EMAIL_COPY[lang] || PENDING_EMAIL_COPY.fr : {}),
  };
  const isRtl = lang === "ar";
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const oobCode = params.get("oobCode") || "";
  const previewMode = import.meta.env.DEV ? params.get("preview") || "" : "";
  const isLocalPreview = previewMode === "1" || previewMode === "success";
  const isPendingPreview = previewMode === "pending";
  const [status, setStatus] = useState("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [noticeStatus, setNoticeStatus] = useState("info");
  const [pendingAction, setPendingAction] = useState("");
  const cardBg = useColorModeValue("white", "gray.800");
  const pageBg = useColorModeValue("gray.50", "gray.900");

  useEffect(() => {
    void i18n.changeLanguage(lang);
  }, [lang]);

  useEffect(() => {
    let cancelled = false;
    if (isPendingPreview && isEmailVerification) {
      setStatus("pending");
      return undefined;
    }
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
      if (!oobCode) {
        setStatus("pending");
        return undefined;
      }
      if (!["verifyEmail", "verifyAndChangeEmail"].includes(params.get("mode"))) {
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
  }, [isEmailVerification, isLocalPreview, isPendingPreview, oobCode, params]);

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

  const verifiedDestination = (profile = user) => {
    const requested = params.get("next") || "";
    if (requested.startsWith("/") && !requested.startsWith("//")) return requested;
    if (profile?.accountType === "club_owner" || profile?.clubRole === "owner") {
      return "/club-dashboard";
    }
    return profile?.role === "coach" ? "/coach-dashboard" : "/user-dashboard";
  };

  const handleVerificationCheck = async () => {
    setMessage("");
    setPendingAction("check");
    if (isPendingPreview) {
      setStatus("success");
      setPendingAction("");
      return;
    }
    try {
      const result = await refreshEmailVerification();
      if (!result?.verified) {
        setNoticeStatus("warning");
        setMessage(copy.notYet);
        return;
      }
      setStatus("success");
      setNoticeStatus("success");
    } catch (error) {
      console.error("[email-verification] refresh failed:", error);
      setNoticeStatus("error");
      setMessage(copy.genericError);
    } finally {
      setPendingAction("");
    }
  };

  const handleVerificationResend = async () => {
    setMessage("");
    setPendingAction("resend");
    if (isPendingPreview) {
      setNoticeStatus("success");
      setMessage(copy.sent);
      setPendingAction("");
      return;
    }
    try {
      await resendEmailVerification(lang);
      setNoticeStatus("success");
      setMessage(copy.sent);
    } catch (error) {
      console.error("[email-verification] resend failed:", error);
      setNoticeStatus("error");
      setMessage(copy.resendError);
    } finally {
      setPendingAction("");
    }
  };

  const handleVerifiedContinue = async () => {
    if (!auth.currentUser) {
      navigate("/login", { replace: true });
      return;
    }
    setPendingAction("continue");
    try {
      const result = await refreshEmailVerification();
      if (!result?.verified) {
        navigate("/login", { replace: true });
        return;
      }
      navigate(verifiedDestination(result.user), { replace: true });
    } finally {
      setPendingAction("");
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

          {status === "pending" && (
            <VStack align="stretch" spacing={5}>
              <Heading size="lg">{copy.pendingTitle}</Heading>
              <Text color="gray.500">{copy.pendingText}</Text>
              {(isPendingPreview || user?.email || auth.currentUser?.email) && (
                <Box borderWidth="1px" borderRadius="xl" px={4} py={3}>
                  <Text fontSize="sm" color="gray.500">{copy.email}</Text>
                  <Text fontWeight="700">
                    {isPendingPreview ? "coach@exemple.fr" : user?.email || auth.currentUser?.email}
                  </Text>
                </Box>
              )}
              {message && (
                <Alert status={noticeStatus} borderRadius="xl">
                  <AlertIcon />
                  {message}
                </Alert>
              )}
              {auth.currentUser || isPendingPreview ? (
                <VStack align="stretch" spacing={3}>
                  <Button
                    colorScheme="blue"
                    size="lg"
                    onClick={handleVerificationCheck}
                    isLoading={pendingAction === "check"}
                    loadingText={copy.checking}
                  >
                    {copy.check}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleVerificationResend}
                    isLoading={pendingAction === "resend"}
                  >
                    {copy.resend}
                  </Button>
                </VStack>
              ) : (
                <Button onClick={() => navigate("/login")} colorScheme="blue">
                  {copy.login}
                </Button>
              )}
            </VStack>
          )}

          {status === "success" && (
            <VStack align="stretch" spacing={5}>
              <Heading size="lg">{copy.successTitle}</Heading>
              <Alert status="success" borderRadius="xl">
                <AlertIcon />
                {copy.successText}
              </Alert>
              <Button
                onClick={handleVerifiedContinue}
                colorScheme="blue"
                isLoading={pendingAction === "continue"}
              >
                {auth.currentUser || isLocalPreview ? copy.continue : copy.login}
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
