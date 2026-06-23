export const LEGAL_CONTACT_EMAIL = "contact@boostyourlife.coach";
export const LEGAL_COMPANY_ADDRESS = "18 place des arcades, 06250 Mougins, France";
export const LEGAL_LAST_UPDATE = "22 mai 2026";

const common = {
  contactEmail: LEGAL_CONTACT_EMAIL,
  lastUpdate: LEGAL_LAST_UPDATE,
};

const fr = {
  ...common,
  lastUpdateLabel: "Dernière mise à jour",
  privacy: {
    eyebrow: "Confidentialité",
    title: "Politique de confidentialité",
    intro:
      "Cette page explique comment BoostYourLife.coach collecte, utilise et protège les données personnelles liées à l'utilisation de la plateforme.",
    sections: [
      {
        title: "1. Responsable de traitement",
        paragraphs: [
          "BoostYourLife est responsable du traitement des données utilisées pour fournir le service.",
          "Pour toute question relative à la confidentialité, contactez-nous à l'adresse indiquée ci-dessous.",
        ],
      },
      {
        title: "2. Données collectées",
        items: [
          "Données de compte : nom, prénom, adresse e-mail, rôle, langue, préférences et informations d'authentification Firebase.",
          "Données de profil client : âge ou date de naissance, sexe, objectifs, niveau sportif, habitudes, mensurations et informations utiles au suivi.",
          "Données sportives : programmes, séances, exercices, historique, progression, notes, difficultés, rendez-vous et événements de calendrier.",
          "Données nutrition : bilans, enquêtes alimentaires, rations, menus, recettes, listes de courses, préférences, allergies, exclusions et éventuelles informations de santé communiquées volontairement.",
          "Données professionnelles et club : identité du coach ou de la structure, logo, rattachements, clients, membres, objectifs d'équipe et paramètres de compte.",
          "Données de paiement : identifiants client Stripe, statut d'abonnement, factures, transactions et références de commande. Les numéros complets de carte bancaire ne transitent pas par nos serveurs.",
          "Données techniques : adresse IP, navigateur, appareil, pages consultées, logs de sécurité, consentement cookies et données de géolocalisation approximative si l'utilisateur l'autorise.",
        ],
      },
      {
        title: "3. Finalités et bases légales",
        items: [
          "Créer et gérer les comptes, espaces clients, espaces coachs et espaces club : exécution du contrat.",
          "Fournir les outils de suivi sportif, nutritionnel, documentaire et de communication : exécution du contrat.",
          "Traiter les paiements, abonnements, factures et incidents de paiement : exécution du contrat et obligations légales.",
          "Sécuriser la plateforme, prévenir les abus et diagnostiquer les erreurs : intérêt légitime.",
          "Mesurer l'audience et améliorer l'expérience utilisateur : consentement lorsque requis.",
          "Répondre aux demandes envoyées via le formulaire de contact ou le support : intérêt légitime ou mesures précontractuelles.",
          "Respecter les obligations comptables, fiscales et réglementaires : obligation légale.",
        ],
      },
      {
        title: "4. Données de santé et nutrition",
        paragraphs: [
          "Certaines informations saisies dans les modules sport et nutrition peuvent révéler des éléments sensibles, notamment pathologies, allergies, exclusions alimentaires, grossesse, objectifs de poids ou contraintes médicales.",
          "Ces données sont traitées uniquement pour permettre le suivi demandé par l'utilisateur ou son professionnel. La plateforme ne remplace pas un diagnostic médical, un avis médical ou une prise en charge d'urgence.",
        ],
      },
      {
        title: "5. Destinataires et sous-traitants",
        paragraphs: [
          "Les données peuvent être consultées par l'utilisateur, le coach ou le club auquel le client est rattaché, selon les droits d'accès prévus dans l'application.",
        ],
        items: [
          "Firebase / Google Cloud : authentification, base de données, stockage et fonctions serveur.",
          "Stripe : paiements, abonnements, factures et portail de facturation.",
          "Prestataires e-mail : envoi de messages transactionnels, notifications et réponses support.",
          "Outils techniques nécessaires à l'hébergement, au diagnostic, à la sécurité et à la maintenance.",
        ],
      },
      {
        title: "6. Durées de conservation",
        items: [
          "Compte utilisateur : pendant la durée d'utilisation du service, puis suppression ou anonymisation après demande lorsque la loi le permet.",
          "Données de suivi sportif et nutritionnel : pendant la relation de suivi, puis selon les besoins de preuve, de sécurité ou d'archivage raisonnable.",
          "Données de paiement et facturation : conservées selon les obligations comptables et fiscales applicables.",
          "Messages de contact et support : durée nécessaire au traitement de la demande, puis archivage raisonnable.",
          "Logs techniques et sécurité : durée limitée aux besoins de diagnostic, lutte contre la fraude et protection du service.",
        ],
      },
      {
        title: "7. Cookies, consentement et analytics",
        paragraphs: [
          "Les cookies et stockages locaux nécessaires au fonctionnement du site sont activés par défaut. Les mesures d'audience, la géolocalisation approximative et les usages marketing ne sont activés que selon les préférences exprimées dans le bandeau de consentement.",
          "Les préférences peuvent être réinitialisées depuis le bandeau ou les paramètres prévus dans l'application.",
        ],
      },
      {
        title: "8. Sécurité",
        paragraphs: [
          "BoostYourLife.coach utilise Firebase Authentication, des règles d'accès Firestore, des contrôles serveur, HTTPS, des restrictions d'accès administrateur et des journaux techniques afin de limiter les accès non autorisés.",
          "Aucun système n'est infaillible. En cas de suspicion d'incident, contactez immédiatement le support.",
        ],
      },
      {
        title: "9. Droits des personnes",
        paragraphs: [
          "Conformément au RGPD, vous pouvez demander l'accès, la rectification, l'effacement, la limitation, l'opposition, la portabilité de vos données et le retrait de votre consentement lorsque celui-ci constitue la base du traitement.",
          "Une preuve d'identité peut être demandée en cas de doute raisonnable. Vous pouvez également déposer une réclamation auprès de la CNIL.",
        ],
      },
      {
        title: "10. Utilisateurs mineurs",
        paragraphs: [
          "La création de compte est réservée aux personnes de 18 ans ou plus, sauf accord et encadrement légal appropriés. Les informations relatives à des mineurs ne doivent pas être saisies sans autorisation valable.",
        ],
      },
    ],
    footer:
      "Cette politique peut être modifiée pour refléter les évolutions du service, de la réglementation ou des prestataires utilisés.",
  },
  terms: {
    eyebrow: "Conditions d'utilisation",
    title: "Conditions générales d'utilisation",
    intro:
      "Les présentes conditions encadrent l'accès et l'utilisation de BoostYourLife.coach par les particuliers, coachs, professionnels de la nutrition et clubs.",
    sections: [
      {
        title: "1. Présentation du service",
        paragraphs: [
          "BoostYourLife.coach est une application web permettant de créer et consulter des programmes sportifs, suivre des séances, gérer des clients, préparer des bilans nutritionnels, partager des supports et administrer des abonnements ou licences.",
          "Les fonctionnalités disponibles dépendent du rôle de l'utilisateur, de son abonnement, de son essai, de son rattachement à un coach ou à un club, et des modules activés.",
        ],
      },
      {
        title: "2. Création de compte et accès",
        items: [
          "L'utilisateur doit fournir des informations exactes, à jour et utiliser une adresse e-mail valide.",
          "L'utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte.",
          "Les comptes professionnels, clubs et administrateurs disposent de droits étendus qui doivent être utilisés uniquement dans le cadre du suivi autorisé.",
          "BoostYourLife peut suspendre ou limiter un accès en cas d'usage abusif, frauduleux, illicite ou contraire aux présentes conditions.",
        ],
      },
      {
        title: "3. Rôles et responsabilités des utilisateurs",
        paragraphs: [
          "Le coach, professionnel de nutrition ou responsable club reste responsable des contenus qu'il crée, adapte, prescrit, partage ou interprète auprès de ses clients.",
          "Le client reste responsable des informations qu'il communique et doit signaler toute contrainte médicale, blessure, allergie, pathologie ou changement important à son professionnel.",
        ],
      },
      {
        title: "4. Santé, sport et nutrition",
        paragraphs: [
          "BoostYourLife fournit des outils d'aide à l'organisation, au suivi et à la production de supports. La plateforme ne remplace pas un médecin, un diagnostic, une prescription médicale, une consultation d'urgence ou une prise en charge thérapeutique.",
        ],
        items: [
          "Avant tout programme sportif intensif, l'utilisateur doit vérifier que sa condition physique le permet.",
          "Les contenus nutritionnels doivent être adaptés par un professionnel compétent lorsque le contexte médical l'exige.",
          "En cas de douleur, malaise, symptôme inhabituel, allergie ou doute médical, l'utilisateur doit arrêter l'activité concernée et consulter un professionnel de santé.",
        ],
      },
      {
        title: "5. Utilisation acceptable",
        items: [
          "Ne pas usurper l'identité d'un tiers ni accéder à des données sans autorisation.",
          "Ne pas extraire massivement les données, perturber le service, contourner les restrictions d'accès ou tester la sécurité sans accord écrit.",
          "Ne pas publier ou transmettre de contenu illicite, discriminatoire, dangereux, trompeur ou portant atteinte aux droits d'un tiers.",
          "Ne pas utiliser la plateforme pour fournir un conseil médical réservé à une profession réglementée si l'utilisateur n'y est pas habilité.",
        ],
      },
      {
        title: "6. Abonnements, essais et paiement",
        paragraphs: [
          "Certains services sont payants ou soumis à essai. Les paiements, abonnements, factures, annulations et moyens de paiement sont traités via Stripe ou via les outils de facturation indiqués dans l'application.",
          "Les conditions commerciales détaillées, notamment rétractation, renouvellement et support, figurent dans les conditions de vente.",
        ],
      },
      {
        title: "7. Propriété intellectuelle",
        paragraphs: [
          "L'interface, le nom BoostYourLife, les éléments graphiques, textes, structures, modèles, scripts et contenus fournis par la plateforme sont protégés. Toute reproduction, extraction ou redistribution non autorisée est interdite.",
          "Les contenus créés par les utilisateurs restent sous leur responsabilité. L'utilisateur accorde à BoostYourLife les droits techniques nécessaires pour héberger, traiter, afficher, sauvegarder et transmettre ces contenus dans le cadre du service.",
        ],
      },
      {
        title: "8. Disponibilité et évolution du service",
        paragraphs: [
          "BoostYourLife s'efforce de maintenir le service disponible et sécurisé. Des interruptions peuvent intervenir pour maintenance, mises à jour, incidents techniques, contraintes d'hébergement ou cas de force majeure.",
          "Les fonctionnalités peuvent évoluer afin d'améliorer le produit, renforcer la sécurité, respecter la réglementation ou adapter l'offre commerciale.",
        ],
      },
      {
        title: "9. Données personnelles",
        paragraphs: [
          "Le traitement des données personnelles est décrit dans la politique de confidentialité. L'utilisateur s'engage à ne saisir que des données qu'il est autorisé à traiter et partager.",
        ],
      },
      {
        title: "10. Responsabilité",
        paragraphs: [
          "BoostYourLife ne garantit pas un résultat sportif, nutritionnel, médical, commercial ou financier. Sa responsabilité ne peut être engagée pour une mauvaise utilisation du service, des informations inexactes saisies par l'utilisateur, une décision professionnelle prise sans vérification, ou un usage contraire aux présentes conditions.",
        ],
      },
      {
        title: "11. Modification des conditions",
        paragraphs: [
          "Les présentes conditions peuvent être mises à jour. La version applicable est celle publiée sur cette page à la date d'utilisation du service, sauf notification spécifique pour un changement majeur.",
        ],
      },
      {
        title: "12. Contact",
        paragraphs: ["Pour toute question relative aux présentes conditions, contactez le support."],
      },
    ],
  },
  sales: {
    eyebrow: "Conditions générales de vente",
    title: "Politique de vente",
    intro:
      "Ces conditions encadrent l'achat des abonnements, programmes et services numériques proposés par BoostYourLife. Elles complètent les conditions générales d'utilisation et la politique de confidentialité.",
    sections: [
      {
        title: "1. Vendeur et contact",
        paragraphs: [
          `Le service est édité sous la marque BoostYourLife depuis l'adresse suivante : ${LEGAL_COMPANY_ADDRESS}.`,
          "Pour toute question avant ou après achat, vous pouvez nous contacter à l'adresse indiquée ci-dessous.",
        ],
      },
      {
        title: "2. Offres et prix",
        items: [
          "Les prix et caractéristiques des offres sont affichés avant la validation du paiement.",
          "Les prix sont indiqués dans la devise présentée sur la page de paiement, taxes applicables incluses ou précisées lorsque nécessaire.",
          "BoostYourLife peut faire évoluer ses offres, ses tarifs ou ses fonctionnalités, sans modifier rétroactivement une période déjà payée.",
        ],
      },
      {
        title: "3. Commande",
        paragraphs: [
          "La commande devient effective après sélection de l'offre, acceptation des conditions applicables et confirmation du paiement. Certaines fonctionnalités nécessitent un compte utilisateur et une adresse e-mail valide afin de livrer l'accès au service.",
        ],
      },
      {
        title: "4. Paiement sécurisé",
        paragraphs: [
          "Les paiements sont traités par Stripe. BoostYourLife ne stocke pas les numéros complets de carte bancaire sur ses serveurs. Les informations techniques nécessaires au paiement, à la facturation et au suivi d'abonnement sont gérées via les outils Stripe.",
        ],
      },
      {
        title: "5. Abonnements, essais et renouvellement",
        items: [
          "Les abonnements peuvent être mensuels, annuels ou associés à une période d'essai lorsque l'offre le prévoit.",
          "Sauf mention contraire, un abonnement se renouvelle automatiquement à la fin de chaque période payée.",
          "L'utilisateur peut demander l'arrêt du renouvellement depuis l'espace prévu à cet effet, le portail de paiement ou le support.",
          "Après résiliation, l'accès reste généralement disponible jusqu'à la fin de la période déjà réglée, sauf incident de paiement, abus ou disposition contraire indiquée dans l'offre.",
        ],
      },
      {
        title: "6. Livraison des services numériques",
        paragraphs: [
          "Les contenus, programmes, tableaux de bord et fonctionnalités numériques sont livrés par accès en ligne, généralement immédiatement après confirmation du paiement ou activation du compte.",
        ],
      },
      {
        title: "7. Droit de rétractation",
        paragraphs: [
          "Lorsque le droit de rétractation s'applique, l'utilisateur peut contacter le support. Pour les services ou contenus numériques accessibles immédiatement après achat, l'exécution du service peut commencer dès la confirmation du paiement lorsque l'utilisateur l'a demandé ou accepté dans le parcours d'achat.",
          "Les règles peuvent varier selon le statut du client, le pays applicable et la nature exacte de l'offre. En cas de doute, contactez-nous avant l'achat afin que nous clarifiions les conditions de l'offre concernée.",
        ],
      },
      {
        title: "8. Remboursements",
        paragraphs: [
          "Les demandes de remboursement sont étudiées au cas par cas, notamment en cas de double paiement, incident technique empêchant l'accès au service, erreur manifeste ou droit légal applicable.",
        ],
      },
      {
        title: "9. Factures",
        paragraphs: [
          "Les justificatifs de paiement et factures, lorsqu'ils sont disponibles, sont fournis via Stripe, l'espace client ou sur demande au support. L'utilisateur s'engage à fournir des informations de facturation exactes et à les maintenir à jour.",
        ],
      },
      {
        title: "10. Incidents de paiement et suspension",
        paragraphs: [
          "En cas de paiement refusé, expiré, contesté ou non régularisé, BoostYourLife peut suspendre l'accès aux fonctionnalités payantes jusqu'à résolution de l'incident.",
        ],
      },
      {
        title: "11. Support client",
        paragraphs: [
          "Le support répond en priorité aux sujets bloquants liés à l'accès, au paiement ou à la facturation.",
        ],
      },
      {
        title: "12. Droit applicable",
        paragraphs: [
          "Ces conditions sont rédigées en français et s'appliquent dans le respect des règles légales applicables. En cas de désaccord, l'utilisateur est invité à contacter le support afin de chercher une solution amiable avant toute autre démarche.",
        ],
      },
    ],
  },
};

const en = {
  ...fr,
  lastUpdateLabel: "Last updated",
  privacy: {
    ...fr.privacy,
    eyebrow: "Privacy",
    title: "Privacy Policy",
    intro:
      "This page explains how BoostYourLife.coach collects, uses and protects personal data related to the use of the platform.",
    sections: [
      {
        title: "1. Data controller",
        paragraphs: [
          "BoostYourLife is responsible for processing the data used to provide the service.",
          "For any privacy question, contact us at the address below.",
        ],
      },
      {
        title: "2. Data collected",
        items: [
          "Account data: name, first name, email address, role, language, preferences and Firebase authentication information.",
          "Client profile data: age or date of birth, sex, goals, training level, habits, measurements and information useful for coaching.",
          "Training data: programs, sessions, exercises, history, progress, notes, difficulties, appointments and calendar events.",
          "Nutrition data: assessments, food surveys, meal plans, menus, recipes, shopping lists, preferences, allergies, exclusions and health information voluntarily provided.",
          "Professional and club data: identity of the coach or organization, logo, assignments, clients, members, team goals and account settings.",
          "Payment data: Stripe customer identifiers, subscription status, invoices, transactions and order references. Full card numbers do not pass through our servers.",
          "Technical data: IP address, browser, device, visited pages, security logs, cookie consent and approximate geolocation data if the user allows it.",
        ],
      },
      { ...fr.privacy.sections[2], title: "3. Purposes and legal bases" },
      {
        title: "4. Health and nutrition data",
        paragraphs: [
          "Some information entered in the sport and nutrition modules may reveal sensitive elements, including conditions, allergies, food exclusions, pregnancy, weight goals or medical constraints.",
          "This data is processed only to enable the follow-up requested by the user or their professional. The platform does not replace a medical diagnosis, medical advice or emergency care.",
        ],
      },
      { ...fr.privacy.sections[4], title: "5. Recipients and processors" },
      { ...fr.privacy.sections[5], title: "6. Retention periods" },
      { ...fr.privacy.sections[6], title: "7. Cookies, consent and analytics" },
      { ...fr.privacy.sections[7], title: "8. Security" },
      {
        title: "9. Individual rights",
        paragraphs: [
          "Under the GDPR, you can request access, rectification, erasure, restriction, objection, portability of your data and withdrawal of your consent when consent is the legal basis.",
          "Proof of identity may be requested in case of reasonable doubt. You may also file a complaint with the CNIL.",
        ],
      },
      { ...fr.privacy.sections[9], title: "10. Minors" },
    ],
    footer: "This policy may be updated to reflect changes to the service, regulations or providers used.",
  },
  terms: {
    ...fr.terms,
    eyebrow: "Terms of use",
    title: "Terms of Service",
    intro:
      "These terms govern access to and use of BoostYourLife.coach by individuals, coaches, nutrition professionals and clubs.",
  },
  sales: {
    ...fr.sales,
    eyebrow: "Terms of sale",
    title: "Sales Policy",
    intro:
      "These terms govern the purchase of subscriptions, programs and digital services offered by BoostYourLife. They supplement the terms of service and privacy policy.",
  },
};

const es = {
  ...en,
  lastUpdateLabel: "Última actualización",
  privacy: {
    ...en.privacy,
    eyebrow: "Privacidad",
    title: "Política de privacidad",
    intro:
      "Esta página explica cómo BoostYourLife.coach recopila, utiliza y protege los datos personales relacionados con el uso de la plataforma.",
  },
  terms: {
    ...en.terms,
    eyebrow: "Condiciones de uso",
    title: "Condiciones generales de uso",
    intro:
      "Estas condiciones regulan el acceso y uso de BoostYourLife.coach por particulares, entrenadores, profesionales de la nutrición y clubes.",
  },
  sales: {
    ...en.sales,
    eyebrow: "Condiciones de venta",
    title: "Política de venta",
    intro:
      "Estas condiciones regulan la compra de suscripciones, programas y servicios digitales ofrecidos por BoostYourLife.",
  },
};

const de = {
  ...en,
  lastUpdateLabel: "Letzte Aktualisierung",
  privacy: {
    ...en.privacy,
    eyebrow: "Datenschutz",
    title: "Datenschutzerklärung",
    intro:
      "Diese Seite erklärt, wie BoostYourLife.coach personenbezogene Daten im Zusammenhang mit der Nutzung der Plattform erhebt, verwendet und schützt.",
  },
  terms: {
    ...en.terms,
    eyebrow: "Nutzungsbedingungen",
    title: "Allgemeine Nutzungsbedingungen",
    intro:
      "Diese Bedingungen regeln den Zugriff auf BoostYourLife.coach und die Nutzung durch Privatpersonen, Coaches, Ernährungsfachleute und Clubs.",
  },
  sales: {
    ...en.sales,
    eyebrow: "Verkaufsbedingungen",
    title: "Verkaufsrichtlinie",
    intro:
      "Diese Bedingungen regeln den Kauf von Abonnements, Programmen und digitalen Diensten von BoostYourLife.",
  },
};

const it = {
  ...en,
  lastUpdateLabel: "Ultimo aggiornamento",
  privacy: {
    ...en.privacy,
    eyebrow: "Privacy",
    title: "Informativa sulla privacy",
    intro:
      "Questa pagina spiega come BoostYourLife.coach raccoglie, utilizza e protegge i dati personali relativi all'uso della piattaforma.",
  },
  terms: {
    ...en.terms,
    eyebrow: "Condizioni d'uso",
    title: "Termini di servizio",
    intro:
      "Queste condizioni regolano l'accesso e l'uso di BoostYourLife.coach da parte di privati, coach, professionisti della nutrizione e club.",
  },
  sales: {
    ...en.sales,
    eyebrow: "Condizioni di vendita",
    title: "Politica di vendita",
    intro:
      "Queste condizioni regolano l'acquisto di abbonamenti, programmi e servizi digitali offerti da BoostYourLife.",
  },
};

const ru = {
  ...en,
  lastUpdateLabel: "Последнее обновление",
  privacy: {
    ...en.privacy,
    eyebrow: "Конфиденциальность",
    title: "Политика конфиденциальности",
    intro:
      "На этой странице объясняется, как BoostYourLife.coach собирает, использует и защищает персональные данные, связанные с использованием платформы.",
  },
  terms: {
    ...en.terms,
    eyebrow: "Условия использования",
    title: "Пользовательское соглашение",
    intro:
      "Эти условия регулируют доступ к BoostYourLife.coach и использование платформы частными пользователями, тренерами, специалистами по питанию и клубами.",
  },
  sales: {
    ...en.sales,
    eyebrow: "Условия продажи",
    title: "Политика продаж",
    intro:
      "Эти условия регулируют покупку подписок, программ и цифровых услуг, предлагаемых BoostYourLife.",
  },
};

const ar = {
  ...en,
  lastUpdateLabel: "آخر تحديث",
  privacy: {
    ...en.privacy,
    eyebrow: "الخصوصية",
    title: "سياسة الخصوصية",
    intro:
      "تشرح هذه الصفحة كيف تجمع BoostYourLife.coach البيانات الشخصية المرتبطة باستخدام المنصة وتستخدمها وتحميها.",
  },
  terms: {
    ...en.terms,
    eyebrow: "شروط الاستخدام",
    title: "الشروط العامة للاستخدام",
    intro:
      "تنظم هذه الشروط الوصول إلى BoostYourLife.coach واستخدامه من قبل الأفراد والمدربين ومتخصصي التغذية والأندية.",
  },
  sales: {
    ...en.sales,
    eyebrow: "شروط البيع",
    title: "سياسة البيع",
    intro:
      "تنظم هذه الشروط شراء الاشتراكات والبرامج والخدمات الرقمية التي تقدمها BoostYourLife.",
  },
};

const COPY_BY_LANGUAGE = { fr, en, es, de, it, ru, ar };

const localizedLegalOverrides = {
  en: {
    privacy: {
      sections: [
        en.privacy.sections[0],
        en.privacy.sections[1],
        {
          title: "3. Purposes and legal bases",
          items: [
            "Create and manage accounts, client spaces, coach spaces and club spaces: performance of the contract.",
            "Provide sport, nutrition, document and communication tracking tools: performance of the contract.",
            "Process payments, subscriptions, invoices and payment incidents: performance of the contract and legal obligations.",
            "Secure the platform, prevent abuse and diagnose errors: legitimate interest.",
            "Measure audience and improve the user experience: consent where required.",
            "Respond to requests sent through the contact form or support: legitimate interest or pre-contractual steps.",
            "Comply with accounting, tax and regulatory obligations: legal obligation.",
          ],
        },
        en.privacy.sections[3],
        {
          title: "5. Recipients and processors",
          paragraphs: [
            "Data may be accessed by the user, the coach or the club to which the client is attached, according to the access rights provided in the application.",
          ],
          items: [
            "Firebase / Google Cloud: authentication, database, storage and server functions.",
            "Stripe: payments, subscriptions, invoices and billing portal.",
            "Email providers: sending transactional messages, notifications and support replies.",
            "Technical tools required for hosting, diagnostics, security and maintenance.",
          ],
        },
        {
          title: "6. Retention periods",
          items: [
            "User account: for the duration of service use, then deletion or anonymization upon request where permitted by law.",
            "Sport and nutrition tracking data: during the coaching relationship, then according to evidence, security or reasonable archiving needs.",
            "Payment and billing data: retained according to applicable accounting and tax obligations.",
            "Contact and support messages: for the time needed to process the request, then reasonable archiving.",
            "Technical and security logs: limited to diagnostics, fraud prevention and service protection needs.",
          ],
        },
        {
          title: "7. Cookies, consent and analytics",
          paragraphs: [
            "Cookies and local storage required for the website to work are enabled by default. Audience measurement, approximate geolocation and marketing uses are enabled only according to the preferences expressed in the consent banner.",
            "Preferences can be reset from the banner or the settings provided in the application.",
          ],
        },
        {
          title: "8. Security",
          paragraphs: [
            "BoostYourLife.coach uses Firebase Authentication, Firestore access rules, server controls, HTTPS, administrator access restrictions and technical logs to limit unauthorized access.",
            "No system is infallible. If you suspect an incident, contact support immediately.",
          ],
        },
        en.privacy.sections[8],
        {
          title: "10. Minors",
          paragraphs: [
            "Account creation is reserved for people aged 18 or over, unless appropriate legal consent and supervision apply. Information relating to minors must not be entered without valid authorization.",
          ],
        },
      ],
    },
    terms: {
      sections: [
        {
          title: "1. Service overview",
          paragraphs: [
            "BoostYourLife.coach is a web application used to create and view training programs, track sessions, manage clients, prepare nutrition assessments, share documents and administer subscriptions or licenses.",
            "Available features depend on the user's role, subscription, trial, attachment to a coach or club, and enabled modules.",
          ],
        },
        {
          title: "2. Account creation and access",
          items: [
            "The user must provide accurate, up-to-date information and use a valid email address.",
            "The user is responsible for keeping login credentials confidential and for all activity performed from the account.",
            "Professional, club and administrator accounts have extended rights that must be used only for authorized follow-up.",
            "BoostYourLife may suspend or limit access in case of abusive, fraudulent, unlawful use or use contrary to these terms.",
          ],
        },
        {
          title: "3. User roles and responsibilities",
          paragraphs: [
            "The coach, nutrition professional or club manager remains responsible for the content they create, adapt, prescribe, share or interpret for their clients.",
            "The client remains responsible for the information they provide and must report any medical constraint, injury, allergy, condition or important change to their professional.",
          ],
        },
        {
          title: "4. Health, sport and nutrition",
          paragraphs: [
            "BoostYourLife provides tools to help organize, track and produce materials. The platform does not replace a doctor, diagnosis, medical prescription, emergency consultation or therapeutic care.",
          ],
          items: [
            "Before any intensive training program, the user must make sure their physical condition allows it.",
            "Nutrition content must be adapted by a competent professional when the medical context requires it.",
            "In case of pain, discomfort, unusual symptoms, allergy or medical doubt, the user must stop the relevant activity and consult a healthcare professional.",
          ],
        },
        {
          title: "5. Acceptable use",
          items: [
            "Do not impersonate a third party or access data without authorization.",
            "Do not massively extract data, disrupt the service, bypass access restrictions or test security without written permission.",
            "Do not publish or transmit unlawful, discriminatory, dangerous, misleading content or content infringing third-party rights.",
            "Do not use the platform to provide medical advice reserved for a regulated profession if you are not authorized to do so.",
          ],
        },
        {
          title: "6. Subscriptions, trials and payment",
          paragraphs: [
            "Some services are paid or subject to a trial. Payments, subscriptions, invoices, cancellations and payment methods are handled through Stripe or the billing tools shown in the application.",
            "Detailed commercial terms, including withdrawal, renewal and support, are described in the sales policy.",
          ],
        },
        {
          title: "7. Intellectual property",
          paragraphs: [
            "The interface, BoostYourLife name, graphic elements, texts, structures, models, scripts and content provided by the platform are protected. Unauthorized reproduction, extraction or redistribution is prohibited.",
            "Content created by users remains their responsibility. The user grants BoostYourLife the technical rights required to host, process, display, back up and transmit this content as part of the service.",
          ],
        },
        {
          title: "8. Availability and service changes",
          paragraphs: [
            "BoostYourLife strives to keep the service available and secure. Interruptions may occur for maintenance, updates, technical incidents, hosting constraints or force majeure.",
            "Features may evolve to improve the product, strengthen security, comply with regulations or adapt the commercial offer.",
          ],
        },
        {
          title: "9. Personal data",
          paragraphs: [
            "The processing of personal data is described in the privacy policy. The user agrees to enter only data they are authorized to process and share.",
          ],
        },
        {
          title: "10. Liability",
          paragraphs: [
            "BoostYourLife does not guarantee any sport, nutrition, medical, commercial or financial result. BoostYourLife cannot be held liable for misuse of the service, inaccurate information entered by the user, a professional decision made without verification, or use contrary to these terms.",
          ],
        },
        {
          title: "11. Changes to the terms",
          paragraphs: [
            "These terms may be updated. The applicable version is the one published on this page on the date of use of the service, unless specific notice is given for a major change.",
          ],
        },
        {
          title: "12. Contact",
          paragraphs: ["For any question about these terms, contact support."],
        },
      ],
    },
    sales: {
      sections: [
        {
          title: "1. Seller and contact",
          paragraphs: [
            `The service is operated under the BoostYourLife brand from the following address: ${LEGAL_COMPANY_ADDRESS}.`,
            "For any question before or after purchase, you can contact us at the address below.",
          ],
        },
        {
          title: "2. Offers and prices",
          items: [
            "Prices and offer characteristics are displayed before payment validation.",
            "Prices are shown in the currency displayed on the payment page, including applicable taxes or with taxes specified where necessary.",
            "BoostYourLife may change its offers, prices or features without retroactively modifying a period already paid for.",
          ],
        },
        {
          title: "3. Order",
          paragraphs: [
            "The order becomes effective after selecting the offer, accepting the applicable terms and confirming payment. Some features require a user account and a valid email address to deliver service access.",
          ],
        },
        {
          title: "4. Secure payment",
          paragraphs: [
            "Payments are processed by Stripe. BoostYourLife does not store full card numbers on its servers. Technical information required for payment, billing and subscription tracking is managed through Stripe tools.",
          ],
        },
        {
          title: "5. Subscriptions, trials and renewal",
          items: [
            "Subscriptions may be monthly, yearly or include a trial period when provided by the offer.",
            "Unless stated otherwise, a subscription renews automatically at the end of each paid period.",
            "The user may request cancellation of renewal from the dedicated space, the payment portal or support.",
            "After cancellation, access generally remains available until the end of the paid period, except in case of payment incident, abuse or contrary provision in the offer.",
          ],
        },
        {
          title: "6. Delivery of digital services",
          paragraphs: [
            "Content, programs, dashboards and digital features are delivered through online access, generally immediately after payment confirmation or account activation.",
          ],
        },
        {
          title: "7. Right of withdrawal",
          paragraphs: [
            "Where the right of withdrawal applies, the user may contact support. For services or digital content accessible immediately after purchase, service execution may start as soon as payment is confirmed when the user has requested or accepted it during the purchase flow.",
            "Rules may vary depending on the customer's status, the applicable country and the exact nature of the offer. If in doubt, contact us before purchase so we can clarify the conditions of the relevant offer.",
          ],
        },
        {
          title: "8. Refunds",
          paragraphs: [
            "Refund requests are reviewed case by case, particularly in the event of duplicate payment, a technical incident preventing access to the service, an obvious error or an applicable legal right.",
          ],
        },
        {
          title: "9. Invoices",
          paragraphs: [
            "Payment receipts and invoices, when available, are provided through Stripe, the customer area or upon request to support. The user agrees to provide accurate billing information and keep it up to date.",
          ],
        },
        {
          title: "10. Payment incidents and suspension",
          paragraphs: [
            "In case of refused, expired, disputed or unresolved payment, BoostYourLife may suspend access to paid features until the incident is resolved.",
          ],
        },
        {
          title: "11. Customer support",
          paragraphs: [
            "Support gives priority to blocking issues related to access, payment or billing.",
          ],
        },
        {
          title: "12. Applicable law",
          paragraphs: [
            "These terms are drafted in French and apply in compliance with applicable legal rules. In case of disagreement, the user is invited to contact support to seek an amicable solution before any other step.",
          ],
        },
      ],
    },
  },
};

function applyLegalOverride(baseCopy, override) {
  return {
    ...baseCopy,
    privacy: { ...baseCopy.privacy, ...(override.privacy || {}) },
    terms: { ...baseCopy.terms, ...(override.terms || {}) },
    sales: { ...baseCopy.sales, ...(override.sales || {}) },
  };
}

Object.assign(en, applyLegalOverride(en, localizedLegalOverrides.en));

const translatedPageText = {
  es: {
    privacy: {
      sections: [
        { title: "1. Responsable del tratamiento", paragraphs: ["BoostYourLife es responsable del tratamiento de los datos utilizados para prestar el servicio.", "Para cualquier pregunta sobre privacidad, contáctenos en la dirección indicada abajo."] },
        { title: "2. Datos recopilados", items: ["Datos de cuenta: nombre, apellido, correo electrónico, rol, idioma, preferencias e información de autenticación de Firebase.", "Datos de perfil del cliente: edad o fecha de nacimiento, sexo, objetivos, nivel deportivo, hábitos, medidas e información útil para el seguimiento.", "Datos deportivos: programas, sesiones, ejercicios, historial, progreso, notas, dificultades, citas y eventos de calendario.", "Datos de nutrición: evaluaciones, encuestas alimentarias, planes, menús, recetas, listas de compra, preferencias, alergias, exclusiones e información de salud comunicada voluntariamente.", "Datos profesionales y de club: identidad del coach o estructura, logotipo, vinculaciones, clientes, miembros, objetivos de equipo y parámetros de cuenta.", "Datos de pago: identificadores de cliente Stripe, estado de suscripción, facturas, transacciones y referencias de pedido. Los números completos de tarjeta no pasan por nuestros servidores.", "Datos técnicos: dirección IP, navegador, dispositivo, páginas consultadas, registros de seguridad, consentimiento de cookies y geolocalización aproximada si el usuario la autoriza."] },
        { title: "3. Finalidades y bases legales", items: ["Crear y gestionar cuentas y espacios de clientes, coaches y clubes: ejecución del contrato.", "Proporcionar herramientas de seguimiento deportivo, nutricional, documental y de comunicación: ejecución del contrato.", "Tratar pagos, suscripciones, facturas e incidencias de pago: ejecución del contrato y obligaciones legales.", "Proteger la plataforma, prevenir abusos y diagnosticar errores: interés legítimo.", "Medir la audiencia y mejorar la experiencia: consentimiento cuando sea requerido.", "Responder a solicitudes enviadas por contacto o soporte: interés legítimo o medidas precontractuales.", "Cumplir obligaciones contables, fiscales y regulatorias: obligación legal."] },
        { title: "4. Datos de salud y nutrición", paragraphs: ["Algunos datos introducidos en los módulos de deporte y nutrición pueden revelar información sensible, como patologías, alergias, exclusiones alimentarias, embarazo, objetivos de peso o limitaciones médicas.", "Estos datos se tratan únicamente para permitir el seguimiento solicitado por el usuario o su profesional. La plataforma no sustituye un diagnóstico médico, consejo médico ni atención de urgencia."] },
        { title: "5. Destinatarios y encargados", paragraphs: ["Los datos pueden ser consultados por el usuario, el coach o el club al que está vinculado el cliente, según los derechos de acceso previstos en la aplicación."], items: ["Firebase / Google Cloud: autenticación, base de datos, almacenamiento y funciones servidor.", "Stripe: pagos, suscripciones, facturas y portal de facturación.", "Proveedores de email: envío de mensajes transaccionales, notificaciones y respuestas de soporte.", "Herramientas técnicas necesarias para alojamiento, diagnóstico, seguridad y mantenimiento."] },
        { title: "6. Plazos de conservación", items: ["Cuenta de usuario: durante el uso del servicio, luego supresión o anonimización previa solicitud cuando la ley lo permita.", "Datos de seguimiento deportivo y nutricional: durante la relación de seguimiento, luego según necesidades de prueba, seguridad o archivo razonable.", "Datos de pago y facturación: conservados según obligaciones contables y fiscales aplicables.", "Mensajes de contacto y soporte: durante el tiempo necesario para tratar la solicitud, luego archivo razonable.", "Registros técnicos y de seguridad: duración limitada a diagnóstico, lucha contra el fraude y protección del servicio."] },
        { title: "7. Cookies, consentimiento y analítica", paragraphs: ["Las cookies y almacenamientos locales necesarios para el funcionamiento del sitio se activan por defecto. La medición de audiencia, la geolocalización aproximada y los usos de marketing se activan solo según las preferencias expresadas en el banner de consentimiento.", "Las preferencias pueden restablecerse desde el banner o los ajustes previstos en la aplicación."] },
        { title: "8. Seguridad", paragraphs: ["BoostYourLife.coach utiliza Firebase Authentication, reglas de acceso Firestore, controles servidor, HTTPS, restricciones de acceso administrador y registros técnicos para limitar accesos no autorizados.", "Ningún sistema es infalible. Si sospecha un incidente, contacte inmediatamente con soporte."] },
        { title: "9. Derechos de las personas", paragraphs: ["Conforme al RGPD, puede solicitar acceso, rectificación, supresión, limitación, oposición, portabilidad de sus datos y retirada del consentimiento cuando este sea la base del tratamiento.", "Puede solicitarse una prueba de identidad en caso de duda razonable. También puede presentar una reclamación ante la CNIL."] },
        { title: "10. Menores", paragraphs: ["La creación de cuenta está reservada a personas de 18 años o más, salvo consentimiento y supervisión legal adecuados. No debe introducirse información relativa a menores sin autorización válida."] },
      ],
    },
    terms: {
      sections: [
        { title: "1. Presentación del servicio", paragraphs: ["BoostYourLife.coach es una aplicación web que permite crear y consultar programas deportivos, seguir sesiones, gestionar clientes, preparar evaluaciones nutricionales, compartir documentos y administrar suscripciones o licencias.", "Las funciones disponibles dependen del rol del usuario, su suscripción, prueba, vinculación a un coach o club y módulos activados."] },
        { title: "2. Creación de cuenta y acceso", items: ["El usuario debe proporcionar información exacta y actualizada y usar una dirección de correo electrónico válida.", "El usuario es responsable de la confidencialidad de sus credenciales y de toda actividad realizada desde su cuenta.", "Las cuentas profesionales, de club y administrador tienen derechos ampliados que deben usarse solo en el marco del seguimiento autorizado.", "BoostYourLife puede suspender o limitar el acceso en caso de uso abusivo, fraudulento, ilícito o contrario a estas condiciones."] },
        { title: "3. Roles y responsabilidades", paragraphs: ["El coach, profesional de nutrición o responsable de club sigue siendo responsable de los contenidos que crea, adapta, prescribe, comparte o interpreta para sus clientes.", "El cliente sigue siendo responsable de la información que comunica y debe señalar cualquier limitación médica, lesión, alergia, patología o cambio importante a su profesional."] },
        { title: "4. Salud, deporte y nutrición", paragraphs: ["BoostYourLife proporciona herramientas de organización, seguimiento y producción de soportes. La plataforma no sustituye a un médico, diagnóstico, prescripción médica, consulta de urgencia ni tratamiento terapéutico."], items: ["Antes de cualquier programa deportivo intensivo, el usuario debe comprobar que su condición física lo permite.", "Los contenidos nutricionales deben ser adaptados por un profesional competente cuando el contexto médico lo requiera.", "En caso de dolor, malestar, síntoma inusual, alergia o duda médica, el usuario debe detener la actividad y consultar a un profesional sanitario."] },
        { title: "5. Uso aceptable", items: ["No suplantar a terceros ni acceder a datos sin autorización.", "No extraer datos masivamente, perturbar el servicio, eludir restricciones de acceso ni probar la seguridad sin acuerdo escrito.", "No publicar ni transmitir contenido ilícito, discriminatorio, peligroso, engañoso o que vulnere derechos de terceros.", "No usar la plataforma para prestar consejo médico reservado a una profesión regulada si no está habilitado."] },
        { title: "6. Suscripciones, pruebas y pago", paragraphs: ["Algunos servicios son de pago o sujetos a prueba. Pagos, suscripciones, facturas, cancelaciones y métodos de pago se gestionan mediante Stripe o las herramientas de facturación indicadas en la aplicación.", "Las condiciones comerciales detalladas, incluida la retractación, renovación y soporte, figuran en la política de venta."] },
        { title: "7. Propiedad intelectual", paragraphs: ["La interfaz, el nombre BoostYourLife, elementos gráficos, textos, estructuras, modelos, scripts y contenidos proporcionados por la plataforma están protegidos. Queda prohibida toda reproducción, extracción o redistribución no autorizada.", "Los contenidos creados por los usuarios siguen bajo su responsabilidad. El usuario concede a BoostYourLife los derechos técnicos necesarios para alojar, tratar, mostrar, guardar y transmitir dichos contenidos en el marco del servicio."] },
        { title: "8. Disponibilidad y evolución", paragraphs: ["BoostYourLife se esfuerza por mantener el servicio disponible y seguro. Pueden producirse interrupciones por mantenimiento, actualizaciones, incidentes técnicos, restricciones de alojamiento o fuerza mayor.", "Las funciones pueden evolucionar para mejorar el producto, reforzar la seguridad, cumplir la normativa o adaptar la oferta comercial."] },
        { title: "9. Datos personales", paragraphs: ["El tratamiento de datos personales se describe en la política de privacidad. El usuario se compromete a introducir solo datos que esté autorizado a tratar y compartir."] },
        { title: "10. Responsabilidad", paragraphs: ["BoostYourLife no garantiza ningún resultado deportivo, nutricional, médico, comercial o financiero. No podrá ser responsable por mal uso del servicio, información inexacta introducida por el usuario, decisiones profesionales tomadas sin verificación o uso contrario a estas condiciones."] },
        { title: "11. Modificación de las condiciones", paragraphs: ["Estas condiciones pueden actualizarse. La versión aplicable es la publicada en esta página en la fecha de uso del servicio, salvo notificación específica por cambio importante."] },
        { title: "12. Contacto", paragraphs: ["Para cualquier pregunta sobre estas condiciones, contacte con soporte."] },
      ],
    },
    sales: {
      sections: [
        { title: "1. Vendedor y contacto", paragraphs: [`El servicio se edita bajo la marca BoostYourLife desde la siguiente dirección: ${LEGAL_COMPANY_ADDRESS}.`, "Para cualquier pregunta antes o después de la compra, puede contactarnos en la dirección indicada abajo."] },
        { title: "2. Ofertas y precios", items: ["Los precios y características de las ofertas se muestran antes de validar el pago.", "Los precios se indican en la divisa presentada en la página de pago, con impuestos aplicables incluidos o precisados cuando sea necesario.", "BoostYourLife puede modificar sus ofertas, tarifas o funciones sin modificar retroactivamente un periodo ya pagado."] },
        { title: "3. Pedido", paragraphs: ["El pedido se hace efectivo tras seleccionar la oferta, aceptar las condiciones aplicables y confirmar el pago. Algunas funciones requieren una cuenta de usuario y un correo válido para entregar el acceso al servicio."] },
        { title: "4. Pago seguro", paragraphs: ["Los pagos son tratados por Stripe. BoostYourLife no almacena números completos de tarjeta en sus servidores. La información técnica necesaria para pago, facturación y seguimiento de suscripción se gestiona mediante Stripe."] },
        { title: "5. Suscripciones, pruebas y renovación", items: ["Las suscripciones pueden ser mensuales, anuales o asociadas a un periodo de prueba cuando la oferta lo prevea.", "Salvo mención contraria, una suscripción se renueva automáticamente al final de cada periodo pagado.", "El usuario puede solicitar detener la renovación desde el espacio previsto, el portal de pago o soporte.", "Tras la cancelación, el acceso generalmente permanece disponible hasta el final del periodo pagado, salvo incidencia de pago, abuso o disposición contraria de la oferta."] },
        { title: "6. Entrega de servicios digitales", paragraphs: ["Los contenidos, programas, paneles y funciones digitales se entregan mediante acceso en línea, generalmente de forma inmediata tras confirmar el pago o activar la cuenta."] },
        { title: "7. Derecho de retractación", paragraphs: ["Cuando se aplique el derecho de retractación, el usuario puede contactar con soporte. Para servicios o contenidos digitales accesibles inmediatamente tras la compra, la ejecución puede comenzar desde la confirmación del pago cuando el usuario lo haya solicitado o aceptado en el proceso de compra.", "Las reglas pueden variar según el estado del cliente, el país aplicable y la naturaleza exacta de la oferta. En caso de duda, contáctenos antes de comprar."] },
        { title: "8. Reembolsos", paragraphs: ["Las solicitudes de reembolso se estudian caso por caso, especialmente en caso de doble pago, incidente técnico que impida el acceso, error manifiesto o derecho legal aplicable."] },
        { title: "9. Facturas", paragraphs: ["Los justificantes de pago y facturas, cuando estén disponibles, se proporcionan mediante Stripe, el espacio cliente o previa solicitud a soporte."] },
        { title: "10. Incidencias de pago y suspensión", paragraphs: ["En caso de pago rechazado, caducado, disputado o no regularizado, BoostYourLife puede suspender el acceso a funciones de pago hasta resolver la incidencia."] },
        { title: "11. Soporte cliente", paragraphs: ["El soporte prioriza los asuntos bloqueantes relacionados con acceso, pago o facturación."] },
        { title: "12. Derecho aplicable", paragraphs: ["Estas condiciones están redactadas en francés y se aplican respetando las normas legales aplicables. En caso de desacuerdo, se invita al usuario a contactar con soporte para buscar una solución amistosa."] },
      ],
    },
  },
  de: {
    terms: {
      sections: [
        { title: "1. Überblick über den Dienst", paragraphs: ["BoostYourLife.coach ist eine Webanwendung zum Erstellen und Anzeigen von Trainingsprogrammen, Nachverfolgen von Einheiten, Verwalten von Kunden, Erstellen von Ernährungsbilanzen, Teilen von Unterlagen und Verwalten von Abonnements oder Lizenzen.", "Die verfügbaren Funktionen hängen von der Rolle des Nutzers, seinem Abonnement, Testzeitraum, der Zuordnung zu einem Coach oder Club und den aktivierten Modulen ab."] },
        { title: "2. Kontoerstellung und Zugang", items: ["Der Nutzer muss genaue und aktuelle Informationen angeben und eine gültige E-Mail-Adresse verwenden.", "Der Nutzer ist für die Vertraulichkeit seiner Zugangsdaten und alle Aktivitäten über sein Konto verantwortlich.", "Berufs-, Club- und Administratorkonten verfügen über erweiterte Rechte, die nur im Rahmen der autorisierten Betreuung genutzt werden dürfen.", "BoostYourLife kann den Zugang bei missbräuchlicher, betrügerischer, rechtswidriger oder diesen Bedingungen widersprechender Nutzung aussetzen oder einschränken."] },
        { title: "3. Rollen und Verantwortlichkeiten", paragraphs: ["Der Coach, Ernährungsfachmann oder Clubverantwortliche bleibt für Inhalte verantwortlich, die er erstellt, anpasst, empfiehlt, teilt oder gegenüber Kunden interpretiert.", "Der Kunde bleibt für die von ihm übermittelten Informationen verantwortlich und muss medizinische Einschränkungen, Verletzungen, Allergien, Erkrankungen oder wichtige Änderungen seinem Fachmann mitteilen."] },
        { title: "4. Gesundheit, Sport und Ernährung", paragraphs: ["BoostYourLife stellt Werkzeuge zur Organisation, Nachverfolgung und Erstellung von Unterlagen bereit. Die Plattform ersetzt weder Arzt, Diagnose, ärztliche Verordnung, Notfallberatung noch therapeutische Betreuung."], items: ["Vor einem intensiven Trainingsprogramm muss der Nutzer sicherstellen, dass sein körperlicher Zustand dies zulässt.", "Ernährungsinhalte müssen von einer qualifizierten Fachperson angepasst werden, wenn der medizinische Kontext dies erfordert.", "Bei Schmerzen, Unwohlsein, ungewöhnlichen Symptomen, Allergie oder medizinischem Zweifel muss der Nutzer die betreffende Aktivität beenden und eine medizinische Fachperson konsultieren."] },
        { title: "5. Zulässige Nutzung", items: ["Keine Identität Dritter vortäuschen und nicht ohne Erlaubnis auf Daten zugreifen.", "Keine massenhafte Datenextraktion, Störung des Dienstes, Umgehung von Zugriffsbeschränkungen oder Sicherheitstests ohne schriftliche Zustimmung.", "Keine rechtswidrigen, diskriminierenden, gefährlichen, irreführenden oder Rechte Dritter verletzenden Inhalte veröffentlichen oder übertragen.", "Die Plattform nicht für medizinische Beratung nutzen, die einem reglementierten Beruf vorbehalten ist, sofern keine entsprechende Befugnis besteht."] },
        { title: "6. Abonnements, Testzeiträume und Zahlung", paragraphs: ["Einige Dienste sind kostenpflichtig oder testgebunden. Zahlungen, Abonnements, Rechnungen, Kündigungen und Zahlungsmethoden werden über Stripe oder die in der Anwendung angegebenen Abrechnungstools abgewickelt.", "Die detaillierten Geschäftsbedingungen, einschließlich Widerruf, Verlängerung und Support, stehen in der Verkaufsrichtlinie."] },
        { title: "7. Geistiges Eigentum", paragraphs: ["Die Oberfläche, der Name BoostYourLife, grafische Elemente, Texte, Strukturen, Modelle, Skripte und von der Plattform bereitgestellte Inhalte sind geschützt. Jede nicht autorisierte Vervielfältigung, Extraktion oder Weiterverteilung ist verboten.", "Von Nutzern erstellte Inhalte bleiben in deren Verantwortung. Der Nutzer gewährt BoostYourLife die technischen Rechte, die zur Speicherung, Verarbeitung, Anzeige, Sicherung und Übertragung dieser Inhalte im Rahmen des Dienstes erforderlich sind."] },
        { title: "8. Verfügbarkeit und Weiterentwicklung", paragraphs: ["BoostYourLife bemüht sich, den Dienst verfügbar und sicher zu halten. Unterbrechungen können aufgrund von Wartung, Aktualisierungen, technischen Vorfällen, Hosting-Einschränkungen oder höherer Gewalt auftreten.", "Funktionen können weiterentwickelt werden, um das Produkt zu verbessern, die Sicherheit zu stärken, Vorschriften einzuhalten oder das kommerzielle Angebot anzupassen."] },
        { title: "9. Personenbezogene Daten", paragraphs: ["Die Verarbeitung personenbezogener Daten wird in der Datenschutzerklärung beschrieben. Der Nutzer verpflichtet sich, nur Daten einzugeben, die er verarbeiten und teilen darf."] },
        { title: "10. Haftung", paragraphs: ["BoostYourLife garantiert kein sportliches, ernährungsbezogenes, medizinisches, kommerzielles oder finanzielles Ergebnis. BoostYourLife haftet nicht für Missbrauch des Dienstes, unzutreffende Nutzereingaben, professionelle Entscheidungen ohne Prüfung oder eine Nutzung entgegen diesen Bedingungen."] },
        { title: "11. Änderung der Bedingungen", paragraphs: ["Diese Bedingungen können aktualisiert werden. Maßgeblich ist die auf dieser Seite zum Zeitpunkt der Nutzung veröffentlichte Version, sofern bei wesentlichen Änderungen keine besondere Mitteilung erfolgt."] },
        { title: "12. Kontakt", paragraphs: ["Bei Fragen zu diesen Bedingungen wenden Sie sich bitte an den Support."] },
      ],
    },
  },
  it: {
    terms: {
      sections: [
        { title: "1. Presentazione del servizio", paragraphs: ["BoostYourLife.coach è un'applicazione web che consente di creare e consultare programmi sportivi, seguire sessioni, gestire clienti, preparare valutazioni nutrizionali, condividere documenti e amministrare abbonamenti o licenze.", "Le funzionalità disponibili dipendono dal ruolo dell'utente, dal suo abbonamento, dal periodo di prova, dal collegamento a un coach o a un club e dai moduli attivati."] },
        { title: "2. Creazione dell'account e accesso", items: ["L'utente deve fornire informazioni esatte e aggiornate e utilizzare un indirizzo e-mail valido.", "L'utente è responsabile della riservatezza delle proprie credenziali e di ogni attività svolta dal suo account.", "Gli account professionali, club e amministratore dispongono di diritti estesi da usare solo nel quadro del monitoraggio autorizzato.", "BoostYourLife può sospendere o limitare l'accesso in caso di uso abusivo, fraudolento, illecito o contrario alle presenti condizioni."] },
        { title: "3. Ruoli e responsabilità", paragraphs: ["Il coach, professionista della nutrizione o responsabile club resta responsabile dei contenuti che crea, adatta, prescrive, condivide o interpreta per i propri clienti.", "Il cliente resta responsabile delle informazioni comunicate e deve segnalare al proprio professionista qualsiasi vincolo medico, infortunio, allergia, patologia o cambiamento importante."] },
        { title: "4. Salute, sport e nutrizione", paragraphs: ["BoostYourLife fornisce strumenti di organizzazione, monitoraggio e produzione di supporti. La piattaforma non sostituisce un medico, una diagnosi, una prescrizione medica, una consulenza d'urgenza o un trattamento terapeutico."], items: ["Prima di qualsiasi programma sportivo intensivo, l'utente deve verificare che la propria condizione fisica lo consenta.", "I contenuti nutrizionali devono essere adattati da un professionista competente quando il contesto medico lo richiede.", "In caso di dolore, malessere, sintomo insolito, allergia o dubbio medico, l'utente deve interrompere l'attività e consultare un professionista sanitario."] },
        { title: "5. Uso accettabile", items: ["Non impersonare terzi né accedere a dati senza autorizzazione.", "Non estrarre massivamente dati, disturbare il servizio, aggirare restrizioni di accesso o testare la sicurezza senza accordo scritto.", "Non pubblicare o trasmettere contenuti illeciti, discriminatori, pericolosi, ingannevoli o lesivi di diritti di terzi.", "Non usare la piattaforma per fornire consulenza medica riservata a una professione regolamentata se non si è abilitati."] },
        { title: "6. Abbonamenti, prove e pagamento", paragraphs: ["Alcuni servizi sono a pagamento o soggetti a prova. Pagamenti, abbonamenti, fatture, annullamenti e metodi di pagamento sono gestiti tramite Stripe o gli strumenti di fatturazione indicati nell'applicazione.", "Le condizioni commerciali dettagliate, incluse recesso, rinnovo e supporto, sono indicate nella politica di vendita."] },
        { title: "7. Proprietà intellettuale", paragraphs: ["L'interfaccia, il nome BoostYourLife, gli elementi grafici, i testi, le strutture, i modelli, gli script e i contenuti forniti dalla piattaforma sono protetti. È vietata ogni riproduzione, estrazione o ridistribuzione non autorizzata.", "I contenuti creati dagli utenti restano sotto la loro responsabilità. L'utente concede a BoostYourLife i diritti tecnici necessari per ospitare, trattare, visualizzare, salvare e trasmettere tali contenuti nell'ambito del servizio."] },
        { title: "8. Disponibilità ed evoluzione", paragraphs: ["BoostYourLife si impegna a mantenere il servizio disponibile e sicuro. Possono verificarsi interruzioni per manutenzione, aggiornamenti, incidenti tecnici, vincoli di hosting o forza maggiore.", "Le funzionalità possono evolvere per migliorare il prodotto, rafforzare la sicurezza, rispettare la normativa o adattare l'offerta commerciale."] },
        { title: "9. Dati personali", paragraphs: ["Il trattamento dei dati personali è descritto nell'informativa sulla privacy. L'utente si impegna a inserire solo dati che è autorizzato a trattare e condividere."] },
        { title: "10. Responsabilità", paragraphs: ["BoostYourLife non garantisce alcun risultato sportivo, nutrizionale, medico, commerciale o finanziario. Non può essere ritenuta responsabile per uso improprio del servizio, informazioni inesatte inserite dall'utente, decisioni professionali non verificate o uso contrario alle presenti condizioni."] },
        { title: "11. Modifica delle condizioni", paragraphs: ["Le presenti condizioni possono essere aggiornate. La versione applicabile è quella pubblicata su questa pagina alla data di utilizzo del servizio, salvo notifica specifica per modifiche importanti."] },
        { title: "12. Contatto", paragraphs: ["Per qualsiasi domanda su queste condizioni, contatta il supporto."] },
      ],
    },
  },
  ru: {
    terms: {
      sections: [
        { title: "1. Описание сервиса", paragraphs: ["BoostYourLife.coach — это веб-приложение для создания и просмотра спортивных программ, отслеживания тренировок, управления клиентами, подготовки нутриционных оценок, обмена материалами и администрирования подписок или лицензий.", "Доступные функции зависят от роли пользователя, подписки, пробного периода, привязки к тренеру или клубу и активированных модулей."] },
        { title: "2. Создание аккаунта и доступ", items: ["Пользователь должен предоставлять точную и актуальную информацию и использовать действующий адрес электронной почты.", "Пользователь отвечает за конфиденциальность своих учетных данных и за все действия, выполненные из его аккаунта.", "Профессиональные, клубные и административные аккаунты имеют расширенные права, которые должны использоваться только в рамках разрешенного сопровождения.", "BoostYourLife может приостановить или ограничить доступ при злоупотреблении, мошенничестве, незаконном использовании или нарушении настоящих условий."] },
        { title: "3. Роли и ответственность", paragraphs: ["Тренер, специалист по питанию или руководитель клуба остается ответственным за материалы, которые он создает, адаптирует, назначает, передает или интерпретирует для клиентов.", "Клиент остается ответственным за сообщаемую информацию и должен сообщать специалисту о любых медицинских ограничениях, травмах, аллергиях, заболеваниях или важных изменениях."] },
        { title: "4. Здоровье, спорт и питание", paragraphs: ["BoostYourLife предоставляет инструменты для организации, отслеживания и подготовки материалов. Платформа не заменяет врача, диагноз, медицинское назначение, срочную консультацию или терапевтическое лечение."], items: ["Перед любой интенсивной спортивной программой пользователь должен убедиться, что его физическое состояние это позволяет.", "Нутриционные материалы должны адаптироваться компетентным специалистом, когда этого требует медицинский контекст.", "При боли, недомогании, необычных симптомах, аллергии или медицинских сомнениях пользователь должен прекратить соответствующую активность и обратиться к медицинскому специалисту."] },
        { title: "5. Допустимое использование", items: ["Не выдавать себя за третьих лиц и не получать доступ к данным без разрешения.", "Не извлекать данные массово, не нарушать работу сервиса, не обходить ограничения доступа и не тестировать безопасность без письменного согласия.", "Не публиковать и не передавать незаконный, дискриминационный, опасный, вводящий в заблуждение контент или контент, нарушающий права третьих лиц.", "Не использовать платформу для медицинских советов, зарезервированных за регулируемой профессией, если пользователь не имеет соответствующих полномочий."] },
        { title: "6. Подписки, пробные периоды и оплата", paragraphs: ["Некоторые услуги являются платными или предоставляются на пробный период. Платежи, подписки, счета, отмены и способы оплаты обрабатываются через Stripe или инструменты выставления счетов, указанные в приложении.", "Подробные коммерческие условия, включая отказ, продление и поддержку, указаны в политике продаж."] },
        { title: "7. Интеллектуальная собственность", paragraphs: ["Интерфейс, название BoostYourLife, графические элементы, тексты, структуры, модели, скрипты и контент платформы защищены. Несанкционированное воспроизведение, извлечение или распространение запрещены.", "Контент, созданный пользователями, остается под их ответственностью. Пользователь предоставляет BoostYourLife технические права, необходимые для размещения, обработки, отображения, резервного копирования и передачи этого контента в рамках сервиса."] },
        { title: "8. Доступность и развитие сервиса", paragraphs: ["BoostYourLife стремится поддерживать сервис доступным и безопасным. Возможны перерывы из-за обслуживания, обновлений, технических инцидентов, ограничений хостинга или форс-мажора.", "Функции могут развиваться для улучшения продукта, усиления безопасности, соблюдения законодательства или адаптации коммерческого предложения."] },
        { title: "9. Персональные данные", paragraphs: ["Обработка персональных данных описана в политике конфиденциальности. Пользователь обязуется вводить только те данные, которые он имеет право обрабатывать и передавать."] },
        { title: "10. Ответственность", paragraphs: ["BoostYourLife не гарантирует спортивный, нутриционный, медицинский, коммерческий или финансовый результат. BoostYourLife не несет ответственности за неправильное использование сервиса, неточные данные пользователя, профессиональные решения без проверки или использование вопреки настоящим условиям."] },
        { title: "11. Изменение условий", paragraphs: ["Настоящие условия могут обновляться. Применимой является версия, опубликованная на этой странице на дату использования сервиса, если для существенного изменения не направлено отдельное уведомление."] },
        { title: "12. Контакт", paragraphs: ["По любым вопросам об этих условиях обратитесь в поддержку."] },
      ],
    },
  },
  ar: {
    terms: {
      sections: [
        { title: "1. عرض الخدمة", paragraphs: ["BoostYourLife.coach هو تطبيق ويب يتيح إنشاء البرامج الرياضية ومراجعتها، متابعة الجلسات، إدارة العملاء، إعداد التقييمات الغذائية، مشاركة المستندات وإدارة الاشتراكات أو التراخيص.", "تعتمد الميزات المتاحة على دور المستخدم واشتراكه وفترة التجربة وارتباطه بمدرب أو ناد والوحدات المفعلة."] },
        { title: "2. إنشاء الحساب والوصول", items: ["يجب على المستخدم تقديم معلومات دقيقة ومحدثة واستخدام بريد إلكتروني صالح.", "يتحمل المستخدم مسؤولية سرية بيانات الدخول وكل نشاط يتم من حسابه.", "تملك حسابات المهنيين والأندية والمديرين صلاحيات موسعة يجب استخدامها فقط في إطار المتابعة المصرح بها.", "يجوز لـ BoostYourLife تعليق أو تقييد الوصول في حال الاستخدام المسيء أو الاحتيالي أو غير القانوني أو المخالف لهذه الشروط."] },
        { title: "3. أدوار ومسؤوليات المستخدمين", paragraphs: ["يبقى المدرب أو أخصائي التغذية أو مسؤول النادي مسؤولا عن المحتوى الذي ينشئه أو يكيفه أو يوصي به أو يشاركه أو يفسره لعملائه.", "يبقى العميل مسؤولا عن المعلومات التي يقدمها ويجب أن يبلغ المختص بأي قيد طبي أو إصابة أو حساسية أو مرض أو تغيير مهم."] },
        { title: "4. الصحة والرياضة والتغذية", paragraphs: ["توفر BoostYourLife أدوات للمساعدة في التنظيم والمتابعة وإنتاج المواد. لا تحل المنصة محل الطبيب أو التشخيص أو الوصفة الطبية أو الاستشارة الطارئة أو الرعاية العلاجية."], items: ["قبل أي برنامج رياضي مكثف، يجب على المستخدم التأكد من أن حالته البدنية تسمح بذلك.", "يجب تكييف المحتوى الغذائي بواسطة مختص مؤهل عندما يتطلب السياق الطبي ذلك.", "في حال الألم أو التوعك أو أعراض غير معتادة أو حساسية أو شك طبي، يجب على المستخدم إيقاف النشاط المعني واستشارة مختص صحي."] },
        { title: "5. الاستخدام المقبول", items: ["عدم انتحال هوية طرف ثالث أو الوصول إلى بيانات دون إذن.", "عدم استخراج البيانات بشكل جماعي أو تعطيل الخدمة أو تجاوز قيود الوصول أو اختبار الأمان دون موافقة مكتوبة.", "عدم نشر أو نقل محتوى غير قانوني أو تمييزي أو خطير أو مضلل أو منتهك لحقوق الغير.", "عدم استخدام المنصة لتقديم نصيحة طبية مخصصة لمهنة منظمة إذا لم يكن المستخدم مخولا لذلك."] },
        { title: "6. الاشتراكات والتجارب والدفع", paragraphs: ["بعض الخدمات مدفوعة أو خاضعة لفترة تجربة. تتم معالجة المدفوعات والاشتراكات والفواتير والإلغاءات ووسائل الدفع عبر Stripe أو أدوات الفوترة المشار إليها في التطبيق.", "ترد الشروط التجارية المفصلة، بما في ذلك حق العدول والتجديد والدعم، في سياسة البيع."] },
        { title: "7. الملكية الفكرية", paragraphs: ["الواجهة واسم BoostYourLife والعناصر الرسومية والنصوص والهياكل والنماذج والبرامج النصية والمحتويات المقدمة من المنصة محمية. يحظر أي نسخ أو استخراج أو إعادة توزيع غير مصرح به.", "تبقى المحتويات التي ينشئها المستخدمون تحت مسؤوليتهم. يمنح المستخدم BoostYourLife الحقوق التقنية اللازمة لاستضافة هذه المحتويات ومعالجتها وعرضها وحفظها ونقلها ضمن الخدمة."] },
        { title: "8. توفر الخدمة وتطورها", paragraphs: ["تسعى BoostYourLife إلى إبقاء الخدمة متاحة وآمنة. قد تحدث انقطاعات بسبب الصيانة أو التحديثات أو الحوادث التقنية أو قيود الاستضافة أو القوة القاهرة.", "قد تتطور الميزات لتحسين المنتج وتعزيز الأمان والامتثال للتنظيمات أو تكييف العرض التجاري."] },
        { title: "9. البيانات الشخصية", paragraphs: ["توضح سياسة الخصوصية كيفية معالجة البيانات الشخصية. يلتزم المستخدم بإدخال البيانات التي يحق له معالجتها ومشاركتها فقط."] },
        { title: "10. المسؤولية", paragraphs: ["لا تضمن BoostYourLife أي نتيجة رياضية أو غذائية أو طبية أو تجارية أو مالية. ولا تتحمل المسؤولية عن سوء استخدام الخدمة أو المعلومات غير الدقيقة التي يدخلها المستخدم أو قرار مهني دون تحقق أو استخدام مخالف لهذه الشروط."] },
        { title: "11. تعديل الشروط", paragraphs: ["يمكن تحديث هذه الشروط. النسخة المطبقة هي المنشورة على هذه الصفحة في تاريخ استخدام الخدمة، ما لم يتم إرسال إشعار خاص بشأن تغيير جوهري."] },
        { title: "12. التواصل", paragraphs: ["لأي سؤال حول هذه الشروط، يرجى التواصل مع الدعم."] },
      ],
    },
  },
};

const translatedSalesText = {
  de: {
    sales: {
      sections: [
        { title: "1. Verkäufer und Kontakt", paragraphs: [`Der Dienst wird unter der Marke BoostYourLife von folgender Adresse aus betrieben: ${LEGAL_COMPANY_ADDRESS}.`, "Bei Fragen vor oder nach dem Kauf können Sie uns über die unten angegebene Kontaktadresse erreichen."] },
        { title: "2. Angebote und Preise", items: ["Preise und Merkmale der Angebote werden vor der Zahlungsbestätigung angezeigt.", "Die Preise werden in der auf der Zahlungsseite angegebenen Währung angezeigt, einschließlich anwendbarer Steuern oder mit gesondertem Hinweis, sofern erforderlich.", "BoostYourLife kann Angebote, Preise oder Funktionen ändern, ohne bereits bezahlte Zeiträume rückwirkend zu verändern."] },
        { title: "3. Bestellung", paragraphs: ["Die Bestellung wird nach Auswahl des Angebots, Annahme der geltenden Bedingungen und Bestätigung der Zahlung wirksam. Einige Funktionen erfordern ein Nutzerkonto und eine gültige E-Mail-Adresse, um den Zugang bereitzustellen."] },
        { title: "4. Sichere Zahlung", paragraphs: ["Zahlungen werden über Stripe verarbeitet. BoostYourLife speichert keine vollständigen Kartennummern auf seinen Servern. Technische Informationen für Zahlung, Rechnungsstellung und Abonnementverwaltung werden über Stripe verwaltet."] },
        { title: "5. Abonnements, Testzeiträume und Verlängerung", items: ["Abonnements können monatlich, jährlich oder mit einem Testzeitraum angeboten werden, sofern das Angebot dies vorsieht.", "Sofern nicht anders angegeben, verlängert sich ein Abonnement automatisch am Ende jedes bezahlten Zeitraums.", "Der Nutzer kann die Beendigung der Verlängerung im vorgesehenen Bereich, im Zahlungsportal oder über den Support beantragen.", "Nach Kündigung bleibt der Zugang in der Regel bis zum Ende des bezahlten Zeitraums verfügbar, außer bei Zahlungsproblemen, Missbrauch oder anderslautender Angebotsbedingung."] },
        { title: "6. Bereitstellung digitaler Dienste", paragraphs: ["Inhalte, Programme, Dashboards und digitale Funktionen werden online bereitgestellt, in der Regel unmittelbar nach Zahlungsbestätigung oder Kontoaktivierung."] },
        { title: "7. Widerrufsrecht", paragraphs: ["Sofern ein Widerrufsrecht gilt, kann der Nutzer den Support kontaktieren. Bei digitalen Diensten oder Inhalten mit sofortigem Zugriff nach dem Kauf kann die Leistung beginnen, sobald die Zahlung bestätigt wurde, wenn der Nutzer dies im Kaufprozess angefordert oder akzeptiert hat.", "Die Regeln können je nach Kundenstatus, anwendbarem Land und genauer Art des Angebots variieren. Bei Zweifeln kontaktieren Sie uns bitte vor dem Kauf."] },
        { title: "8. Erstattungen", paragraphs: ["Erstattungsanfragen werden im Einzelfall geprüft, insbesondere bei Doppelzahlung, technischem Problem, das den Zugang verhindert, offensichtlichem Fehler oder anwendbarem gesetzlichen Recht."] },
        { title: "9. Rechnungen", paragraphs: ["Zahlungsbelege und Rechnungen werden, sofern verfügbar, über Stripe, den Kundenbereich oder auf Anfrage beim Support bereitgestellt."] },
        { title: "10. Zahlungsprobleme und Sperrung", paragraphs: ["Bei abgelehnter, abgelaufener, angefochtener oder nicht regulierter Zahlung kann BoostYourLife den Zugang zu kostenpflichtigen Funktionen bis zur Klärung aussetzen."] },
        { title: "11. Kundensupport", paragraphs: ["Der Support priorisiert blockierende Probleme im Zusammenhang mit Zugang, Zahlung oder Rechnungsstellung."] },
        { title: "12. Anwendbares Recht", paragraphs: ["Diese Bedingungen sind auf Französisch verfasst und gelten unter Einhaltung der anwendbaren gesetzlichen Vorschriften. Bei Meinungsverschiedenheiten wird der Nutzer gebeten, den Support zu kontaktieren, um eine einvernehmliche Lösung zu suchen."] },
      ],
    },
  },
  it: {
    sales: {
      sections: [
        { title: "1. Venditore e contatto", paragraphs: [`Il servizio è gestito con il marchio BoostYourLife dal seguente indirizzo: ${LEGAL_COMPANY_ADDRESS}.`, "Per qualsiasi domanda prima o dopo l'acquisto, puoi contattarci all'indirizzo indicato sotto."] },
        { title: "2. Offerte e prezzi", items: ["Prezzi e caratteristiche delle offerte sono mostrati prima della conferma del pagamento.", "I prezzi sono indicati nella valuta mostrata nella pagina di pagamento, tasse applicabili incluse o precisate quando necessario.", "BoostYourLife può modificare offerte, tariffe o funzionalità senza modificare retroattivamente un periodo già pagato."] },
        { title: "3. Ordine", paragraphs: ["L'ordine diventa effettivo dopo la selezione dell'offerta, l'accettazione delle condizioni applicabili e la conferma del pagamento. Alcune funzionalità richiedono un account utente e un indirizzo e-mail valido."] },
        { title: "4. Pagamento sicuro", paragraphs: ["I pagamenti sono elaborati da Stripe. BoostYourLife non conserva i numeri completi delle carte sui propri server. Le informazioni tecniche necessarie per pagamento, fatturazione e gestione dell'abbonamento sono gestite tramite Stripe."] },
        { title: "5. Abbonamenti, prove e rinnovo", items: ["Gli abbonamenti possono essere mensili, annuali o associati a un periodo di prova quando previsto dall'offerta.", "Salvo diversa indicazione, un abbonamento si rinnova automaticamente alla fine di ogni periodo pagato.", "L'utente può richiedere l'interruzione del rinnovo dallo spazio dedicato, dal portale di pagamento o tramite supporto.", "Dopo la cancellazione, l'accesso resta generalmente disponibile fino alla fine del periodo pagato, salvo problemi di pagamento, abuso o diversa disposizione dell'offerta."] },
        { title: "6. Fornitura dei servizi digitali", paragraphs: ["Contenuti, programmi, dashboard e funzionalità digitali sono forniti tramite accesso online, generalmente subito dopo la conferma del pagamento o l'attivazione dell'account."] },
        { title: "7. Diritto di recesso", paragraphs: ["Quando si applica il diritto di recesso, l'utente può contattare il supporto. Per servizi o contenuti digitali accessibili subito dopo l'acquisto, l'esecuzione può iniziare dalla conferma del pagamento se l'utente lo ha richiesto o accettato nel percorso di acquisto.", "Le regole possono variare in base allo status del cliente, al paese applicabile e alla natura esatta dell'offerta. In caso di dubbio, contattaci prima dell'acquisto."] },
        { title: "8. Rimborsi", paragraphs: ["Le richieste di rimborso sono esaminate caso per caso, in particolare in caso di doppio pagamento, incidente tecnico che impedisce l'accesso, errore manifesto o diritto legale applicabile."] },
        { title: "9. Fatture", paragraphs: ["Ricevute e fatture, quando disponibili, sono fornite tramite Stripe, area cliente o su richiesta al supporto."] },
        { title: "10. Problemi di pagamento e sospensione", paragraphs: ["In caso di pagamento rifiutato, scaduto, contestato o non regolarizzato, BoostYourLife può sospendere l'accesso alle funzionalità a pagamento fino alla risoluzione."] },
        { title: "11. Supporto clienti", paragraphs: ["Il supporto dà priorità ai problemi bloccanti legati ad accesso, pagamento o fatturazione."] },
        { title: "12. Legge applicabile", paragraphs: ["Queste condizioni sono redatte in francese e si applicano nel rispetto delle norme legali applicabili. In caso di disaccordo, l'utente è invitato a contattare il supporto per cercare una soluzione amichevole."] },
      ],
    },
  },
  ru: {
    sales: {
      sections: [
        { title: "1. Продавец и контакт", paragraphs: [`Сервис работает под брендом BoostYourLife по следующему адресу: ${LEGAL_COMPANY_ADDRESS}.`, "По любым вопросам до или после покупки вы можете связаться с нами по адресу, указанному ниже."] },
        { title: "2. Предложения и цены", items: ["Цены и характеристики предложений отображаются до подтверждения оплаты.", "Цены указаны в валюте, показанной на странице оплаты, с учетом применимых налогов или с отдельным указанием, когда это необходимо.", "BoostYourLife может изменять предложения, цены или функции без обратного изменения уже оплаченного периода."] },
        { title: "3. Заказ", paragraphs: ["Заказ вступает в силу после выбора предложения, принятия применимых условий и подтверждения оплаты. Для некоторых функций требуется учетная запись пользователя и действующий адрес электронной почты."] },
        { title: "4. Безопасная оплата", paragraphs: ["Платежи обрабатываются Stripe. BoostYourLife не хранит полные номера карт на своих серверах. Техническая информация для оплаты, выставления счетов и управления подпиской обрабатывается через Stripe."] },
        { title: "5. Подписки, пробные периоды и продление", items: ["Подписки могут быть ежемесячными, ежегодными или включать пробный период, если это предусмотрено предложением.", "Если не указано иное, подписка автоматически продлевается в конце каждого оплаченного периода.", "Пользователь может запросить остановку продления через соответствующий раздел, платежный портал или поддержку.", "После отмены доступ обычно сохраняется до конца оплаченного периода, кроме случаев платежных проблем, злоупотреблений или иных условий предложения."] },
        { title: "6. Предоставление цифровых услуг", paragraphs: ["Контент, программы, панели управления и цифровые функции предоставляются через онлайн-доступ, обычно сразу после подтверждения оплаты или активации аккаунта."] },
        { title: "7. Право на отказ", paragraphs: ["Если применяется право на отказ, пользователь может связаться с поддержкой. Для цифровых услуг или контента с немедленным доступом после покупки выполнение услуги может начаться после подтверждения оплаты, если пользователь запросил или принял это в процессе покупки.", "Правила могут различаться в зависимости от статуса клиента, применимой страны и точной природы предложения. При сомнениях свяжитесь с нами до покупки."] },
        { title: "8. Возвраты", paragraphs: ["Запросы на возврат рассматриваются индивидуально, особенно при двойной оплате, техническом инциденте, препятствующем доступу, явной ошибке или применимом законном праве."] },
        { title: "9. Счета", paragraphs: ["Платежные подтверждения и счета, если доступны, предоставляются через Stripe, клиентский кабинет или по запросу в поддержку."] },
        { title: "10. Платежные проблемы и приостановка", paragraphs: ["При отклоненном, просроченном, оспоренном или неурегулированном платеже BoostYourLife может приостановить доступ к платным функциям до решения проблемы."] },
        { title: "11. Клиентская поддержка", paragraphs: ["Поддержка в первую очередь обрабатывает блокирующие вопросы, связанные с доступом, оплатой или выставлением счетов."] },
        { title: "12. Применимое право", paragraphs: ["Эти условия составлены на французском языке и применяются в соответствии с действующими правовыми нормами. В случае разногласий пользователю предлагается связаться с поддержкой для поиска мирного решения."] },
      ],
    },
  },
  ar: {
    sales: {
      sections: [
        { title: "1. البائع والتواصل", paragraphs: [`تدار الخدمة تحت علامة BoostYourLife من العنوان التالي: ${LEGAL_COMPANY_ADDRESS}.`, "لأي سؤال قبل الشراء أو بعده، يمكنكم التواصل معنا عبر العنوان الموضح أدناه."] },
        { title: "2. العروض والأسعار", items: ["تظهر الأسعار وخصائص العروض قبل تأكيد الدفع.", "تعرض الأسعار بالعملة الظاهرة في صفحة الدفع، مع الضرائب المطبقة أو مع توضيحها عند الحاجة.", "يجوز لـ BoostYourLife تغيير العروض أو الأسعار أو الميزات دون تعديل فترة مدفوعة مسبقا بأثر رجعي."] },
        { title: "3. الطلب", paragraphs: ["يصبح الطلب فعليا بعد اختيار العرض وقبول الشروط المطبقة وتأكيد الدفع. تتطلب بعض الميزات حساب مستخدم وبريدا إلكترونيا صالحا لتوفير الوصول إلى الخدمة."] },
        { title: "4. الدفع الآمن", paragraphs: ["تتم معالجة المدفوعات بواسطة Stripe. لا تخزن BoostYourLife أرقام البطاقات الكاملة على خوادمها. تتم إدارة المعلومات التقنية اللازمة للدفع والفوترة وتتبع الاشتراك عبر أدوات Stripe."] },
        { title: "5. الاشتراكات والتجارب والتجديد", items: ["يمكن أن تكون الاشتراكات شهرية أو سنوية أو مرتبطة بفترة تجربة عندما ينص العرض على ذلك.", "ما لم يذكر خلاف ذلك، يتجدد الاشتراك تلقائيا في نهاية كل فترة مدفوعة.", "يمكن للمستخدم طلب إيقاف التجديد من المساحة المخصصة أو بوابة الدفع أو الدعم.", "بعد الإلغاء، يبقى الوصول متاحا عادة حتى نهاية الفترة المدفوعة، إلا في حال مشكلة دفع أو إساءة استخدام أو شرط مخالف في العرض."] },
        { title: "6. تسليم الخدمات الرقمية", paragraphs: ["يتم تسليم المحتوى والبرامج ولوحات التحكم والميزات الرقمية عبر الوصول عبر الإنترنت، عادة فور تأكيد الدفع أو تفعيل الحساب."] },
        { title: "7. حق العدول", paragraphs: ["عندما ينطبق حق العدول، يمكن للمستخدم التواصل مع الدعم. بالنسبة للخدمات أو المحتويات الرقمية المتاحة فور الشراء، قد يبدأ تنفيذ الخدمة بمجرد تأكيد الدفع إذا طلب المستخدم ذلك أو وافق عليه أثناء الشراء.", "قد تختلف القواعد حسب صفة العميل والبلد المطبق والطبيعة الدقيقة للعرض. عند الشك، يرجى التواصل معنا قبل الشراء."] },
        { title: "8. المبالغ المستردة", paragraphs: ["تدرس طلبات الاسترداد كل حالة على حدة، خاصة عند الدفع المزدوج أو حادث تقني يمنع الوصول أو خطأ واضح أو حق قانوني مطبق."] },
        { title: "9. الفواتير", paragraphs: ["تقدم إيصالات الدفع والفواتير، عند توفرها، عبر Stripe أو مساحة العميل أو عند الطلب من الدعم."] },
        { title: "10. مشاكل الدفع والتعليق", paragraphs: ["في حال رفض الدفع أو انتهاء صلاحيته أو الاعتراض عليه أو عدم تسويته، يجوز لـ BoostYourLife تعليق الوصول إلى الميزات المدفوعة حتى حل المشكلة."] },
        { title: "11. دعم العملاء", paragraphs: ["يعطي الدعم الأولوية للمشكلات المعطلة المرتبطة بالوصول أو الدفع أو الفوترة."] },
        { title: "12. القانون المطبق", paragraphs: ["تكتب هذه الشروط باللغة الفرنسية وتطبق مع احترام القواعد القانونية المعمول بها. في حال الخلاف، يدعى المستخدم إلى التواصل مع الدعم للبحث عن حل ودي."] },
      ],
    },
  },
};

for (const [lng, override] of Object.entries(translatedPageText)) {
  Object.assign(COPY_BY_LANGUAGE[lng], applyLegalOverride(COPY_BY_LANGUAGE[lng], override));
}

for (const [lng, override] of Object.entries(translatedSalesText)) {
  Object.assign(COPY_BY_LANGUAGE[lng], applyLegalOverride(COPY_BY_LANGUAGE[lng], override));
}

export function getLegalPageCopy(language, page) {
  const base = String(language || "fr").split("-")[0];
  const copy = COPY_BY_LANGUAGE[base] || COPY_BY_LANGUAGE.fr;
  return {
    ...copy[page],
    contactEmail: copy.contactEmail,
    lastUpdate: copy.lastUpdate,
    lastUpdateLabel: copy.lastUpdateLabel,
  };
}
