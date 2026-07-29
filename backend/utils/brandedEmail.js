const nodemailer = require("nodemailer");

const SUPPORTED_LANGUAGES = new Set(["fr", "en", "es", "de", "it", "ru", "ar"]);

function emailLanguage(value) {
  const raw = String(value || "").trim().toLowerCase().split("-")[0];
  return SUPPORTED_LANGUAGES.has(raw) ? raw : "fr";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function paragraphsHtml(value) {
  return String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="font-size:16px;line-height:1.65;margin:0 0 18px;color:#374151;white-space:pre-line;">${escapeHtml(paragraph)}</p>`
    )
    .join("");
}

function brandedEmailHtml({
  lang = "fr",
  title,
  intro = "",
  bodyHtml = "",
  detail = "",
  ctaLabel = "",
  ctaUrl = "",
  footer = "",
  trackingPixel = "",
}) {
  const locale = emailLanguage(lang);
  const dir = locale === "ar" ? "rtl" : "ltr";
  const safeUrl = escapeHtml(ctaUrl);
  return `<!doctype html>
<html lang="${locale}" dir="${dir}">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:620px;margin:0 auto;padding:32px 18px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;padding:32px;box-shadow:0 12px 32px rgba(15,23,42,.08);">
        <div style="font-size:22px;font-weight:800;color:#234f84;margin-bottom:24px;">BoostYourLife.coach</div>
        <h1 style="font-size:26px;line-height:1.25;margin:0 0 20px;color:#111827;">${escapeHtml(title)}</h1>
        ${intro ? paragraphsHtml(intro) : ""}
        ${bodyHtml || ""}
        ${
          detail
            ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:20px 0;color:#111827;font-size:15px;font-weight:700;">${escapeHtml(detail)}</div>`
            : ""
        }
        ${
          ctaUrl && ctaLabel
            ? `<p style="margin:28px 0 20px;">
                <a href="${safeUrl}" style="display:inline-block;background:#17213a;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">${escapeHtml(ctaLabel)}</a>
              </p>`
            : ""
        }
        ${footer ? `<p style="font-size:13px;line-height:1.55;color:#64748b;white-space:pre-line;margin:24px 0 0;">${escapeHtml(footer)}</p>` : ""}
        ${
          ctaUrl
            ? `<div style="margin-top:22px;padding-top:18px;border-top:1px solid #e5e7eb;color:#94a3b8;font-size:12px;line-height:1.5;word-break:break-all;">${safeUrl}</div>`
            : ""
        }
      </div>
    </div>
    ${trackingPixel || ""}
  </body>
</html>`;
}

const PASSWORD_RESET_COPY = {
  fr: {
    subject: "Réinitialisez votre mot de passe BoostYourLife",
    title: "Réinitialisez votre mot de passe",
    intro: "Une demande de récupération de mot de passe a été effectuée pour votre compte BoostYourLife.",
    action: "Choisissez un nouveau mot de passe pour retrouver l’accès à votre espace.",
    cta: "Réinitialiser mon mot de passe",
    safety: "Si vous n’êtes pas à l’origine de cette demande, vous pouvez ignorer cet e-mail. Votre mot de passe actuel restera inchangé.",
  },
  en: {
    subject: "Reset your BoostYourLife password",
    title: "Reset your password",
    intro: "A password recovery request was made for your BoostYourLife account.",
    action: "Choose a new password to regain access to your space.",
    cta: "Reset my password",
    safety: "If you did not request this change, you can ignore this email. Your current password will remain unchanged.",
  },
  es: {
    subject: "Restablece tu contraseña de BoostYourLife",
    title: "Restablece tu contraseña",
    intro: "Se ha solicitado recuperar la contraseña de tu cuenta BoostYourLife.",
    action: "Elige una nueva contraseña para volver a acceder a tu espacio.",
    cta: "Restablecer mi contraseña",
    safety: "Si no has realizado esta solicitud, puedes ignorar este correo. Tu contraseña actual no cambiará.",
  },
  de: {
    subject: "Setzen Sie Ihr BoostYourLife-Passwort zurück",
    title: "Passwort zurücksetzen",
    intro: "Für Ihr BoostYourLife-Konto wurde eine Passwortwiederherstellung angefordert.",
    action: "Wählen Sie ein neues Passwort, um wieder auf Ihren Bereich zuzugreifen.",
    cta: "Mein Passwort zurücksetzen",
    safety: "Wenn Sie diese Änderung nicht angefordert haben, können Sie diese E-Mail ignorieren. Ihr aktuelles Passwort bleibt unverändert.",
  },
  it: {
    subject: "Reimposta la password BoostYourLife",
    title: "Reimposta la password",
    intro: "È stato richiesto il recupero della password per il tuo account BoostYourLife.",
    action: "Scegli una nuova password per accedere nuovamente al tuo spazio.",
    cta: "Reimposta la mia password",
    safety: "Se non hai richiesto questa modifica, puoi ignorare questa e-mail. La password attuale rimarrà invariata.",
  },
  ru: {
    subject: "Сбросьте пароль BoostYourLife",
    title: "Сброс пароля",
    intro: "Для вашего аккаунта BoostYourLife был запрошен сброс пароля.",
    action: "Создайте новый пароль, чтобы восстановить доступ к своему пространству.",
    cta: "Сбросить пароль",
    safety: "Если вы не отправляли этот запрос, просто проигнорируйте письмо. Ваш текущий пароль не изменится.",
  },
  ar: {
    subject: "إعادة تعيين كلمة مرور BoostYourLife",
    title: "إعادة تعيين كلمة المرور",
    intro: "تم طلب استعادة كلمة المرور لحسابك على BoostYourLife.",
    action: "اختر كلمة مرور جديدة لاستعادة الوصول إلى مساحتك.",
    cta: "إعادة تعيين كلمة المرور",
    safety: "إذا لم تطلب هذا التغيير، يمكنك تجاهل هذه الرسالة. ستبقى كلمة المرور الحالية كما هي.",
  },
};

const EMAIL_CHANGE_COPY = {
  fr: {
    subject: "Confirmez votre nouvelle adresse e-mail",
    title: "Confirmez votre adresse e-mail",
    intro: "Vous avez demandé à utiliser cette adresse pour votre compte BoostYourLife.",
    action: "Confirmez-la pour terminer la modification de votre profil.",
    cta: "Confirmer mon adresse",
    safety: "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre adresse actuelle restera inchangée.",
  },
  en: {
    subject: "Confirm your new email address",
    title: "Confirm your email address",
    intro: "You asked to use this address for your BoostYourLife account.",
    action: "Confirm it to complete the change to your profile.",
    cta: "Confirm my address",
    safety: "If you did not request this change, ignore this email. Your current address will remain unchanged.",
  },
  es: {
    subject: "Confirma tu nueva dirección de correo",
    title: "Confirma tu dirección de correo",
    intro: "Has solicitado utilizar esta dirección para tu cuenta BoostYourLife.",
    action: "Confírmala para completar el cambio en tu perfil.",
    cta: "Confirmar mi dirección",
    safety: "Si no has solicitado este cambio, ignora este correo. Tu dirección actual no cambiará.",
  },
  de: {
    subject: "Bestätigen Sie Ihre neue E-Mail-Adresse",
    title: "E-Mail-Adresse bestätigen",
    intro: "Sie möchten diese Adresse für Ihr BoostYourLife-Konto verwenden.",
    action: "Bestätigen Sie sie, um die Änderung Ihres Profils abzuschließen.",
    cta: "Adresse bestätigen",
    safety: "Wenn Sie diese Änderung nicht angefordert haben, ignorieren Sie diese E-Mail. Ihre aktuelle Adresse bleibt unverändert.",
  },
  it: {
    subject: "Conferma il nuovo indirizzo e-mail",
    title: "Conferma il tuo indirizzo e-mail",
    intro: "Hai richiesto di utilizzare questo indirizzo per il tuo account BoostYourLife.",
    action: "Confermalo per completare la modifica del profilo.",
    cta: "Conferma il mio indirizzo",
    safety: "Se non hai richiesto questa modifica, ignora questa e-mail. L’indirizzo attuale rimarrà invariato.",
  },
  ru: {
    subject: "Подтвердите новый адрес электронной почты",
    title: "Подтвердите адрес электронной почты",
    intro: "Вы запросили использование этого адреса для аккаунта BoostYourLife.",
    action: "Подтвердите его, чтобы завершить изменение профиля.",
    cta: "Подтвердить адрес",
    safety: "Если вы не запрашивали это изменение, проигнорируйте письмо. Текущий адрес останется прежним.",
  },
  ar: {
    subject: "تأكيد عنوان بريدك الإلكتروني الجديد",
    title: "تأكيد عنوان البريد الإلكتروني",
    intro: "طلبت استخدام هذا العنوان لحسابك على BoostYourLife.",
    action: "قم بتأكيده لإكمال تعديل ملفك الشخصي.",
    cta: "تأكيد عنواني",
    safety: "إذا لم تطلب هذا التغيير، فتجاهل هذه الرسالة. سيبقى عنوانك الحالي دون تغيير.",
  },
};

let cachedTransporter = null;

function getSmtpTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === "true"
    : port === 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error("smtp-not-configured");
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return cachedTransporter;
}

function customActionUrl(firebaseLink, { baseUrl, path, lang, mode = "resetPassword" }) {
  const parsed = new URL(firebaseLink);
  const oobCode = parsed.searchParams.get("oobCode");
  if (!oobCode) return firebaseLink;
  const query = new URLSearchParams({
    mode,
    oobCode,
    lang: emailLanguage(lang),
  });
  return `${String(baseUrl || "https://boostyourlife.coach").replace(/\/+$/, "")}${path}?${query.toString()}`;
}

async function sendBrandedPasswordReset({
  admin,
  email,
  lang = "fr",
  baseUrl = "https://boostyourlife.coach",
}) {
  const locale = emailLanguage(lang);
  const firebaseLink = await admin.auth().generatePasswordResetLink(email, {
    url: `${String(baseUrl).replace(/\/+$/, "")}/login?reset=1`,
    handleCodeInApp: false,
  });
  const actionUrl = customActionUrl(firebaseLink, {
    baseUrl,
    path: "/reset-password",
    lang: locale,
  });
  const copy = PASSWORD_RESET_COPY[locale] || PASSWORD_RESET_COPY.fr;
  const html = brandedEmailHtml({
    lang: locale,
    title: copy.title,
    intro: `${copy.intro}\n\n${copy.action}`,
    ctaLabel: copy.cta,
    ctaUrl: actionUrl,
    footer: copy.safety,
  });
  const text = `${copy.title}\n\n${copy.intro}\n\n${copy.action}\n\n${copy.cta}: ${actionUrl}\n\n${copy.safety}`;
  const fromEmail = process.env.SMTP_USER;
  const fromName = process.env.CONTACT_FROM_NAME || "BoostYourLife";
  const info = await getSmtpTransporter().sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: email,
    subject: copy.subject,
    text,
    html,
    replyTo: fromEmail,
  });
  return {
    info,
    actionUrl,
    subject: copy.subject,
    language: locale,
  };
}

async function sendBrandedEmailChangeVerification({
  admin,
  currentEmail,
  newEmail,
  lang = "fr",
  baseUrl = "https://boostyourlife.coach",
}) {
  const locale = emailLanguage(lang);
  const firebaseLink = await admin.auth().generateVerifyAndChangeEmailLink(
    currentEmail,
    newEmail,
    {
      url: `${String(baseUrl).replace(/\/+$/, "")}/profile?from=email-change`,
      handleCodeInApp: false,
    }
  );
  const actionUrl = customActionUrl(firebaseLink, {
    baseUrl,
    path: "/verify-email",
    lang: locale,
    mode: "verifyAndChangeEmail",
  });
  const copy = EMAIL_CHANGE_COPY[locale] || EMAIL_CHANGE_COPY.fr;
  const html = brandedEmailHtml({
    lang: locale,
    title: copy.title,
    intro: `${copy.intro}\n\n${copy.action}`,
    ctaLabel: copy.cta,
    ctaUrl: actionUrl,
    footer: copy.safety,
  });
  const text = `${copy.title}\n\n${copy.intro}\n\n${copy.action}\n\n${copy.cta}: ${actionUrl}\n\n${copy.safety}`;
  const fromEmail = process.env.SMTP_USER;
  const fromName = process.env.CONTACT_FROM_NAME || "BoostYourLife";
  const info = await getSmtpTransporter().sendMail({
    from: `${fromName} <${fromEmail}>`,
    to: newEmail,
    subject: copy.subject,
    text,
    html,
    replyTo: fromEmail,
  });
  return {
    info,
    actionUrl,
    subject: copy.subject,
    language: locale,
  };
}

module.exports = {
  EMAIL_CHANGE_COPY,
  PASSWORD_RESET_COPY,
  brandedEmailHtml,
  emailLanguage,
  escapeHtml,
  getSmtpTransporter,
  sendBrandedEmailChangeVerification,
  sendBrandedPasswordReset,
};
