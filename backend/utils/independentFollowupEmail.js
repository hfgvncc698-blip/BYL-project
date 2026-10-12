const { normalizeLanguage } = require('./clubEmailCopy');
const translations = {
  fr: ['Votre nouveau suivi avec {{coach}}', 'Bonjour {{client}},\n\n{{coach}} a ouvert un nouveau suivi pour vous sur BoostYourLife.\n\nRetrouvez cet accompagnement dans « Mes accompagnements » avec votre adresse e-mail et votre mot de passe habituels. Aucune validation ni création de mot de passe n’est nécessaire.\n\nVos autres suivis restent inchangés. Leurs dossiers ne sont pas partagés avec ce professionnel.', 'Voir mes accompagnements'],
  en: ['Your new follow-up with {{coach}}', 'Hello {{client}},\n\n{{coach}} has started a new follow-up for you on BoostYourLife.\n\nFind it in “My follow-ups” using your usual email address and password. No approval or new password is needed.\n\nYour other follow-ups remain unchanged. Their records are not shared with this professional.', 'View my follow-ups'],
  es: ['Tu nuevo seguimiento con {{coach}}', 'Hola {{client}},\n\n{{coach}} ha iniciado un nuevo seguimiento para ti en BoostYourLife.\n\nLo encontrarás en «Mis seguimientos» con tu correo electrónico y contraseña habituales. No necesitas aceptarlo ni crear una contraseña.\n\nTus otros seguimientos no cambian. Sus expedientes no se comparten con este profesional.', 'Ver mis seguimientos'],
  de: ['Deine neue Betreuung mit {{coach}}', 'Hallo {{client}},\n\n{{coach}} hat eine neue Betreuung für dich auf BoostYourLife begonnen.\n\nDu findest sie unter „Meine Betreuungen“ mit deiner gewohnten E-Mail-Adresse und deinem Passwort. Eine Bestätigung oder ein neues Passwort ist nicht erforderlich.\n\nDeine anderen Betreuungen bleiben unverändert. Ihre Unterlagen werden nicht mit dieser Fachkraft geteilt.', 'Meine Betreuungen ansehen'],
  it: ['Il tuo nuovo percorso con {{coach}}', 'Ciao {{client}},\n\n{{coach}} ha avviato un nuovo percorso per te su BoostYourLife.\n\nLo trovi in «I miei percorsi» accedendo con la tua e-mail e password abituali. Non occorre accettare né creare una nuova password.\n\nGli altri percorsi restano invariati. Le relative schede non vengono condivise con questo professionista.', 'Vedi i miei percorsi'],
  ru: ['Ваше новое сопровождение с {{coach}}', 'Здравствуйте, {{client}}!\n\n{{coach}} начал новое сопровождение для вас в BoostYourLife.\n\nОно доступно в разделе «Мои сопровождения». Войдите с привычным адресом электронной почты и паролем. Подтверждение и создание нового пароля не требуются.\n\nДругие сопровождения остаются без изменений. Их данные не передаются этому специалисту.', 'Мои сопровождения'],
  ar: ['متابعتك الجديدة مع {{coach}}', 'مرحباً {{client}}،\n\nبدأ {{coach}} متابعة جديدة لك على BoostYourLife.\n\nتجدها في «متابعاتي» باستخدام بريدك الإلكتروني وكلمة مرورك المعتادين. لا يلزم قبول الطلب أو إنشاء كلمة مرور جديدة.\n\nتبقى متابعاتك الأخرى دون تغيير، ولا تتم مشاركة ملفاتها مع هذا المختص.', 'عرض متابعاتي'],
};
function independentFollowupEmail(language, { coachName, clientName }) {
  const locale = normalizeLanguage(language);
  const values = { coach: coachName, client: clientName };
  const fill = value => value.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] || '');
  const [subject, text, cta] = translations[locale].map(fill);
  return { locale, subject, text, cta };
}
module.exports = { independentFollowupEmail };
