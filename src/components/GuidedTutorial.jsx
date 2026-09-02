import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import {
  Box,
  Button,
  HStack,
  Icon,
  IconButton,
  Progress,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import {
  MdArrowBack,
  MdArrowForward,
  MdClose,
} from "react-icons/md";
import { useAuth } from "../AuthContext";
import { db } from "../firebaseConfig";
import i18n from "../i18n/index";
import { hasPlanModule } from "../utils/proPlanAccess";

const SEEN_PREFIX = "byl_spotlight_tour_seen";
const START_EVENT = "byl:start-tour";
const CLIENTS_DEMO_EVENT = "byl:clients-demo";
const BUILDER_DEMO_EVENT = "byl:builder-demo";
const PENDING_TOUR_KEY = "byl_pending_spotlight_tour";
const TUTORIAL_SEEN_VERSION = 1;

const TOURS = {
  coachDashboard: {
    role: "coach",
    route: "/coach-dashboard",
    label: "Tableau de bord coach",
    steps: [
      {
        selector: "[data-tour-page='coach-dashboard']",
        title: "Votre base de pilotage",
        text: "Cette page réunit l'activité coach : clients, programmes, rendez-vous, suivi de la semaine, nutrition et priorités. C'est votre point de départ quotidien.",
      },
      {
        selector: "[data-tour='coach-quick-access']",
        title: "Accès rapides",
        text: "Les cartes Clients, Nutrition et Programmes donnent le volume actuel et un bouton + pour créer immédiatement le bon élément. Le titre de chaque carte ouvre la rubrique complète.",
      },
      {
        selector: "[data-tour='coach-today']",
        title: "Ce qui se passe aujourd’hui",
        text: "Cette carte sépare les séances déjà validées de celles encore planifiées aujourd’hui. Touchez une séance pour ouvrir son détail et choisir l’action adaptée.",
      },
      {
        selector: "[data-tour='coach-upcoming-summary']",
        title: "La prochaine échéance",
        text: "Cette synthèse affiche les prochains rendez-vous ou séances. Elle ouvre directement le premier événement à traiter et renvoie au calendrier lorsqu’aucun créneau n’est prévu.",
      },
      {
        selector: "[data-tour='coach-copilot']",
        title: "Copilote Coach",
        text: "Le Copilote rassemble les décisions proposées à partir des suivis récents. Vous gardez toujours la main : consultez le contexte, adaptez la proposition, marquez-la comme traitée ou reportez-la.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='coach-radar']",
        title: "Radar des priorités",
        text: "Le Radar met en avant les douleurs, baisses de régularité et autres signaux utiles. Les alertes peuvent être ouvertes, masquées temporairement ou restaurées.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='coach-calendar']",
        title: "Calendrier coach",
        text: "Le calendrier centralise les séances sport et les rendez-vous. Vous pouvez ajouter une séance, déplacer un événement et ouvrir ses détails.",
      },
      {
        selector: "[data-tour='coach-calendar-sync']",
        title: "Synchroniser votre agenda",
        text: "Le bouton Connecter génère un lien d'abonnement calendrier à coller dans Apple Calendar, Google Agenda ou Outlook pour retrouver vos séances hors de BYL.",
      },
      {
        selector: "[data-tour='coach-nutrition-quick-card']",
        title: "Accès nutrition",
        text: "Si votre offre comprend la nutrition, cette carte ouvre les bilans, rations, menus et contenus partagés avec vos patients.",
        skipIfMissing: true,
      },
    ],
  },
  coachClients: {
    role: "coach",
    route: "/clients",
    label: "Clients",
    steps: [
      {
        selector: "[data-tour-page='coach-clients']",
        title: "Vos dossiers clients",
        text: "C'est ici que vous retrouvez les fiches clients, leurs informations utiles et les programmes associés.",
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-new-client']",
        title: "Ajouter une personne",
        text: "Nouveau client ouvre la création du dossier. Renseignez au minimum l’identité et le contact, puis complétez les objectifs et les données utiles depuis la fiche.",
      },
      {
        selector: "[data-tour='clients-filters']",
        title: "Actifs, inactifs et tous",
        text: "Ces filtres permettent de passer des clients actifs aux clients inactifs. Un client actif a eu une interaction récente sur la période suivie.",
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-demo-row']",
        title: "Exemple de fiche client",
        text: "Cette ligne de démonstration n'est pas enregistrée. Elle sert uniquement à montrer le nom, les programmes, la dernière séance, l'état actif et la progression.",
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-demo-edit']",
        title: "Modifier une fiche",
        text: "Modifier ouvre le profil client pour corriger les informations, les objectifs, le niveau, les mensurations ou les données de contact.",
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-demo-assign']",
        title: "Assigner un programme",
        text: "Assigner permet d'attribuer un programme existant au client. Il apparaîtra ensuite dans son espace et dans votre suivi.",
        demoClients: true,
      },
    ],
  },
  coachPrograms: {
    role: "coach",
    route: "/exercise-bank/program-builder/new",
    label: "Builder programme",
    steps: [
      {
        selector: "[data-tour-page='program-builder']",
        title: "Créer un programme",
        text: "Le builder sert à construire un programme complet avant de l'assigner à un client. Vous travaillez à gauche avec la banque, puis à droite sur les séances.",
        demoBuilder: true,
      },
      {
        selector: "[data-tour='builder-identity']",
        title: "Nom et objectif",
        text: "Commencez par nommer le programme et préciser l'objectif. Ces champs facilitent la recherche, l'assignation et la lecture côté client.",
        demoBuilder: true,
      },
      {
        selector: "[data-tour='builder-sessions']",
        title: "Organiser les séances",
        text: "Chaque onglet représente une séance. Vous pouvez ajouter, renommer, supprimer ou réordonner les séances selon le nombre de passages par semaine.",
        demoBuilder: true,
      },
      {
        selector: "[data-tour='builder-sections']",
        title: "Structurer la séance",
        text: "Les sections séparent échauffement, corps de séance, bonus et retour au calme. C'est plus lisible pour le client et plus simple à modifier.",
        demoBuilder: true,
      },
      {
        selector: "[data-tour='builder-exercises']",
        title: "Ajouter et régler les exercices",
        text: "Chaque exercice contient ses paramètres : séries, répétitions, charge, repos, tempo et notes. Le coach peut les modifier sans toucher à la fiche d'origine.",
        demoBuilder: true,
      },
      {
        selector: "[data-tour='builder-demo-exercise']",
        title: "Lire un exercice",
        text: "Cette ligne de démonstration montre comment lire un exercice : le nom, les valeurs de travail, les consignes et les actions de modification.",
        demoBuilder: true,
      },
      {
        selector: "[data-tour='builder-save']",
        title: "Sauvegarder",
        text: "Enregistrez le programme quand la structure est prête. Vous pourrez ensuite l'assigner depuis la page Clients ou le modifier plus tard.",
        demoBuilder: true,
      },
    ],
  },
  coachProgramList: {
    role: "coach",
    route: "/programmes",
    label: "Page programmes",
    steps: [
      {
        selector: "[data-tour-page='coach-programs']",
        title: "Tous vos programmes",
        text: "Cette page centralise tous les programmes enregistrés et indique combien sont déjà assignés. Elle sert à créer, retrouver et réutiliser vos modèles.",
      },
      {
        selector: "[data-tour='programs-create']",
        title: "Créer un nouveau programme",
        text: "Nouveau programme propose une création manuelle dans le builder ou une création guidée lorsque votre offre l’autorise. Les compteurs mobiles distinguent ensuite les modèles assignés et ceux encore à attribuer.",
      },
      {
        selector: "[data-tour='programs-search']",
        title: "Retrouver rapidement un programme",
        text: "La recherche filtre instantanément par nom ou objectif. Elle est utile lorsque votre bibliothèque contient de nombreux modèles.",
      },
      {
        selector: "[data-tour='programs-list']",
        title: "Ouvrir, assigner et réutiliser",
        text: "Chaque ligne ou carte affiche la durée, le nombre de séances et de clients assignés. Voir ouvre le contenu, Assigner choisit un client, Dupliquer crée une nouvelle base et Supprimer retire le modèle.",
      },
    ],
  },
  coachNutrition: {
    role: "coach",
    route: "/nutrition-coach",
    label: "Nutrition coach",
    steps: [
      {
        selector: "[data-tour-page='coach-nutrition']",
        title: "Espace nutrition",
        text: "Cette page regroupe les bilans nutrition et leurs statuts : brouillon, en cours, validé ou partagé côté client.",
      },
      {
        selector: "[data-tour='nutrition-new']",
        title: "Créer un bilan",
        text: "Créez un nouveau bilan pour lancer la collecte d'informations, préparer une ration, un menu et les éléments à partager.",
      },
      {
        selector: "[data-tour='nutrition-stats']",
        title: "Vue globale nutrition",
        text: "Ces compteurs indiquent combien de clients sont suivis, combien de bilans existent, et combien sont déjà partagés ou encore à traiter.",
      },
      {
        selector: "[data-tour='nutrition-bilans']",
        title: "Liste des bilans",
        text: "Chaque ligne correspond à un bilan nutrition. Le statut indique s'il est brouillon, en cours, validé ou partagé côté client.",
      },
      {
        selector: "[data-tour='nutrition-actions']",
        title: "Ouvrir le bon niveau",
        text: "Ouvrir la fiche permet de voir tout le dossier client. Ouvrir le bilan mène directement au questionnaire, à la ration, au menu et aux partages.",
        skipIfMissing: true,
      },
    ],
  },
  coachStats: {
    role: "coach",
    route: "/statistics-coach",
    label: "Statistiques coach",
    steps: [
      {
        selector: "[data-tour-page='coach-stats']",
        title: "Lire les statistiques",
        text: "Cette page transforme l’activité de vos suivis en indicateurs lisibles. Les chiffres sont adaptés aux modules sport et nutrition compris dans votre offre.",
      },
      {
        selector: "[data-tour='coach-stats-kpis']",
        title: "Indicateurs principaux",
        text: "Ces cartes résument clients, programmes, activité récente et bilans nutrition. Elles sont cliquables et ouvrent directement la liste correspondante.",
      },
      {
        selector: "[data-tour='coach-stats-activity']",
        title: "Activité et régularité",
        text: "Les listes et graphiques permettent d’identifier les clients actifs, la rétention et le volume de séances réalisé au fil des mois.",
        skipIfMissing: true,
      },
    ],
  },
  coachProfile: {
    role: "coach",
    route: "/coach/profile",
    label: "Profil coach",
    steps: [
      {
        selector: "[data-tour-page='coach-profile']",
        title: "Votre profil coach",
        text: "Cette page regroupe votre identité professionnelle, vos coordonnées, votre logo et l’adresse utilisée pour vous connecter.",
      },
      {
        selector: "[data-tour='coach-profile-summary']",
        title: "Vérifier le profil en un coup d’œil",
        text: "Le bandeau indique immédiatement si l’identité et le contact sont complets et si l’adresse de connexion est synchronisée.",
      },
      {
        selector: "[data-tour='coach-profile-form']",
        title: "Mettre vos informations à jour",
        text: "Modifiez les champs nécessaires puis enregistrez. Le logo et les informations professionnelles sont réutilisés dans les espaces et documents visibles par vos clients.",
      },
    ],
  },
  clubDashboard: {
    role: "club",
    route: "/club-dashboard",
    label: "Dashboard club",
    steps: [
      {
        selector: "[data-tour-page='club-dashboard']",
        title: "Votre espace responsable club",
        text: "Cette page sert à piloter une structure complète : pros rattachés, clients suivis, programmes créés, activité récente et limites de l’offre club.",
      },
      {
        selector: "[data-tour='club-hero']",
        title: "Vue d’ensemble",
        text: "Le bandeau rappelle le rôle de l’espace club. Depuis ici, vous pouvez passer en vue pro, gérer l’offre ou rejoindre directement les sections utiles de la page.",
      },
      {
        selector: "[data-tour='club-stats']",
        title: "Indicateurs de structure",
        text: "Ces cartes consolident l’activité de tout le club : nombre de pros actifs, volume de clients suivis, programmes créés et dernière activité détectée.",
      },
      {
        selector: "[data-tour='club-guide']",
        title: "Comprendre le parcours",
        text: "Cette zone explique le fonctionnement : le club crée un pro, le pro active son compte, travaille dans son propre espace, puis le club supervise l’activité globale.",
      },
      {
        selector: "[data-tour='club-create']",
        title: "Créer un compte pro",
        text: "Le responsable renseigne les informations du pro. Le compte est créé côté authentification, rattaché à l’abonnement du club, puis un lien d’activation est généré.",
      },
      {
        selector: "[data-tour='club-invite']",
        title: "Lien d’activation",
        text: "Après création, ce bloc affiche le lien à envoyer au pro. Le pro l’utilise pour définir son mot de passe et accéder à son espace personnel.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='club-team']",
        title: "Équipe du club",
        text: "La table liste les pros rattachés, leurs clients, leurs programmes et leur statut. Un clic sélectionne un pro pour afficher son activité récente.",
      },
      {
        selector: "[data-tour='club-activity']",
        title: "Accès aux informations",
        text: "Cette partie donne le détail du pro sélectionné, ses clients récents, ses programmes récents, ses bilans nutrition et les statistiques consolidées du club sans sortir du périmètre club.",
      },
    ],
  },
  clientDashboard: {
    role: "client",
    route: "/user-dashboard",
    label: "Tableau de bord client",
    steps: [
      {
        selector: "[data-tour-page='client-dashboard']",
        title: "Votre espace personnel",
        text: "Cette page indique immédiatement quoi faire ensuite : séance à reprendre, progression globale, rendez-vous à venir et accès aux programmes ou à la nutrition.",
      },
      {
        selector: "[data-tour='client-programs-card']",
        title: "Programmes actifs",
        text: "Cette zone affiche les programmes en cours, leur progression, la dernière séance et les boutons pour ouvrir le programme ou démarrer directement.",
      },
      {
        selector: "[data-tour='client-premium-card']",
        title: "Nouveaux programmes",
        text: "Le client peut acheter un programme premium à l'unité, récupérer une offre disponible, ou demander un programme sur mesure selon son abonnement.",
      },
      {
        selector: "[data-tour='client-upcoming-card']",
        title: "Planning client",
        text: "Les prochaines dates permettent de retrouver les séances programmées et d'ajouter un créneau au calendrier personnel.",
      },
      {
        selector: "[data-tour='client-calendar']",
        title: "Calendrier détaillé",
        text: "Sur grand écran, le calendrier permet de passer du mois à la semaine, au jour ou à l’agenda. Une séance peut être ouverte pour consulter son statut et ses informations.",
        skipIfMissing: true,
      },
    ],
  },
  clientPrograms: {
    role: "client",
    route: "/mes-programmes",
    label: "Mes programmes",
    steps: [
      {
        selector: "[data-tour-page='client-programs']",
        title: "Vos programmes",
        text: "Cette page rassemble tous vos programmes actifs et terminés avec leur progression réelle.",
      },
      {
        selector: "[data-tour='client-programs-empty']",
        title: "Aucun programme pour le moment",
        text: "Lorsqu’un programme vous sera attribué, il apparaîtra ici avec sa progression et le bouton permettant de commencer la prochaine séance.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='client-programs-summary']",
        title: "Lire votre situation",
        text: "Les compteurs distinguent les programmes en cours, ceux à relancer et ceux terminés. La semaine affichée correspond à la semaine réellement entamée.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='client-programs-list']",
        title: "Continuer au bon endroit",
        text: "Voir ouvre le détail du programme. Démarrer lance la prochaine séance, Reprendre revient au dernier exercice non terminé et Refaire recommence un cycle achevé.",
        skipIfMissing: true,
      },
    ],
  },
  clientProfile: {
    role: "client",
    route: "/profile",
    label: "Profil client",
    steps: [
      {
        selector: "[data-tour-page='client-profile'], [data-tour-page='client-dashboard']",
        title: "Vos informations",
        text: "Le profil rassemble les informations utilisées par votre coach pour personnaliser le suivi.",
      },
      {
        selector: "[data-tour='client-profile-summary']",
        title: "Repères personnels",
        text: "Le bandeau résume la complétude du profil, les mesures principales et vos préférences d’unités et de langue.",
      },
      {
        selector: "[data-tour='client-profile-form']",
        title: "Garder les données à jour",
        text: "Mettez à jour identité, contact, objectif, niveau et mensurations puis enregistrez. Ces changements alimentent les vues de suivi du coach.",
      },
    ],
  },
  clientNutrition: {
    role: "client",
    route: "/nutrition",
    label: "Nutrition client",
    steps: [
      {
        selector: "[data-tour-page='client-nutrition']",
        title: "Votre nutrition",
        text: "Cette page regroupe les éléments partagés par le coach : bilan, objectif, ration, menu, recettes, liste de courses et conseils.",
      },
      {
        selector: "[data-tour='client-nutrition-journal']",
        title: "Tenir le journal du jour",
        text: "Cochez les aliments réellement consommés, ajustez leur quantité et ajoutez un aliment imprévu avec la recherche CIQUAL. Le journal fonctionne avec un menu ou directement avec la ration partagée, puis transmet votre ressenti au coach.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='client-nutrition-summary']",
        title: "Résumé partagé",
        text: "Les cartes de résumé donnent les repères clés : calories, contexte, habitudes, ration et nombre de jours de menu proposés.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='client-nutrition-empty']",
        title: "En attente du premier partage",
        text: "Si aucun contenu n’est encore disponible, cette zone vous l’indique. Le menu, la ration et le journal apparaîtront ici dès que votre professionnel aura partagé le suivi.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='client-nutrition-tabs']",
        title: "Naviguer dans les contenus",
        text: "Les onglets permettent de passer d'une partie à l'autre : ration, menu, recettes, courses et conseils détaillés.",
        skipIfMissing: true,
      },
    ],
  },
  clientStats: {
    role: "client",
    route: "/statistiques",
    label: "Statistiques client",
    steps: [
      {
        selector: "[data-tour-page='client-stats']",
        title: "Votre progression",
        text: "Cette page réunit progression sportive, fréquence récente et évolution des mesures corporelles.",
      },
      {
        selector: "[data-tour='client-stats-kpis']",
        title: "Les chiffres essentiels",
        text: "Les trois indicateurs montrent le nombre de programmes, le pourcentage global terminé et les séances réalisées sur les sept derniers jours.",
      },
      {
        selector: "[data-tour='client-stats-comparison']",
        title: "Comparer deux occurrences",
        text: "Choisissez un programme et une séance répétée pour comparer charges, répétitions, difficulté et autres valeurs réellement enregistrées.",
        skipIfMissing: true,
      },
      {
        selector: "[data-tour='client-stats-measures']",
        title: "Suivre les mesures corporelles",
        text: "Ajoutez une mesure, choisissez les unités souhaitées et consultez les courbes dès qu’au moins deux relevés sont disponibles.",
      },
    ],
  },
  settings: {
    role: "both",
    route: "/settings",
    label: "Réglages et didacticiel",
    steps: [
      {
        selector: "[data-tour-page='settings']",
        title: "Vos réglages",
        text: "Cette page centralise la langue, les préférences du compte, l’abonnement, la sécurité et l’accès aux aides guidées.",
      },
      {
        selector: "[data-tour='settings-summary']",
        title: "État du compte",
        text: "Les indicateurs du haut résument la langue active, le type de compte et les accès disponibles.",
      },
      {
        selector: "[data-tour='tutorial-settings']",
        title: "Relancer une aide précise",
        text: "Depuis cette zone, vous pouvez revenir directement sur une partie précise du didacticiel sans refaire tout le parcours.",
      },
      {
        selector: "[data-tour='settings-security']",
        title: "Sécurité et accès",
        text: "La section Sécurité permet d’envoyer un lien de réinitialisation du mot de passe. Les changements sensibles restent confirmés par e-mail.",
        skipIfMissing: true,
      },
    ],
  },
};

function isNutritionOnlyUser(user) {
  const hasNutritionAccess = hasPlanModule(user, "nutrition");
  const hasSportAccess = hasPlanModule(user, "sport");
  return hasNutritionAccess && !hasSportAccess;
}

function buildContextualTour(tourId, tour, user) {
  const tr = (key, fallback) => i18n.t(key, fallback);
  if (tourId === "coachDashboard" && isNutritionOnlyUser(user)) {
    return {
      ...tour,
      label: tr("guidedTutorial.context.coachDashboard.nutrition.label", "Tableau de bord nutrition"),
      steps: [
        {
          selector: "[data-tour-page='coach-dashboard']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.overview.title", "Votre pilotage nutrition"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.overview.text", "Cette page réunit vos patients, les rendez-vous nutrition, les suivis à traiter, les bilans et les priorités du jour."),
        },
        {
          selector: "[data-tour='coach-nutrition-quick-card']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.shortcut.title", "Créer un suivi"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.shortcut.text", "Le raccourci principal ouvre la création d'un suivi nutrition. Vous gardez l'accès rapide aux patients et aux bilans sans passer par les modules sport."),
        },
        {
          selector: "[data-tour='coach-upcoming-summary']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.upcoming.title", "Prochains rendez-vous"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.upcoming.text", "Cette zone affiche les rendez-vous nutrition à venir. Un clic permet d'ouvrir le détail et de garder le planning à jour."),
        },
        {
          selector: "[data-tour='coach-today']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.activity.title", "Activité nutrition"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.activity.text", "Les indicateurs résument les patients suivis, les bilans créés, les partages envoyés et les suivis à finaliser."),
        },
        {
          selector: "[data-tour='coach-calendar']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.calendar.title", "Calendrier nutrition"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.calendar.text", "Le calendrier centralise vos rendez-vous patients et les suivis planifiés. Vous pouvez ajouter un rendez-vous, déplacer un événement et ouvrir ses détails."),
        },
        {
          selector: "[data-tour='coach-calendar-sync']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.sync.title", "Synchroniser votre agenda"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.sync.text", "Le bouton Connecter génère un lien d'abonnement calendrier à coller dans Apple Calendar, Google Agenda ou Outlook pour retrouver vos rendez-vous hors de BYL."),
          skipIfMissing: true,
        },
        {
          selector: "[data-tour='coach-nutrition-quick-card']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.space.title", "Espace nutrition"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.space.text", "Cette carte mène vers les bilans, rations, menus et documents partagés avec vos patients."),
          skipIfMissing: true,
        },
        {
          selector: "[data-tour='coach-radar']",
          title: tr("guidedTutorial.context.coachDashboard.nutrition.relaunch.title", "Suivis à prioriser"),
          text: tr("guidedTutorial.context.coachDashboard.nutrition.relaunch.text", "Le Radar met en avant les patients sans interaction récente et les suivis qui nécessitent une attention particulière."),
          skipIfMissing: true,
        },
      ],
    };
  }

  if (tourId !== "coachClients" || !isNutritionOnlyUser(user)) return tour;

  return {
    ...tour,
    label: tr("guidedTutorial.context.coachClients.nutrition.label", "Patients"),
    steps: [
      {
        selector: "[data-tour-page='coach-clients']",
        title: tr("guidedTutorial.context.coachClients.nutrition.records.title", "Vos dossiers patients"),
        text: tr("guidedTutorial.context.coachClients.nutrition.records.text", "C'est ici que vous retrouvez les patients, leurs coordonnées, leurs derniers suivis et les informations utiles pour continuer l'accompagnement nutrition."),
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-filters']",
        title: tr("guidedTutorial.context.coachClients.nutrition.filters.title", "Suivi récent ou à relancer"),
        text: tr("guidedTutorial.context.coachClients.nutrition.filters.text", "Ces filtres vous aident à distinguer les patients suivis récemment de ceux qui n'ont pas eu de nouvelle interaction depuis plusieurs jours."),
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-demo-row']",
        title: tr("guidedTutorial.context.coachClients.nutrition.demo.title", "Exemple de dossier patient"),
        text: tr("guidedTutorial.context.coachClients.nutrition.demo.text", "Cette fiche de démonstration montre les coordonnées, la date du dernier suivi nutrition et le statut de relance. Elle n'est pas enregistrée."),
        demoClients: true,
      },
      {
        selector: "[data-tour='clients-demo-edit']",
        title: tr("guidedTutorial.context.coachClients.nutrition.edit.title", "Mettre à jour un patient"),
        text: tr("guidedTutorial.context.coachClients.nutrition.edit.text", "Modifier ouvre les informations patient pour corriger les coordonnées, les repères de base ou les préférences nécessaires au suivi nutrition."),
        demoClients: true,
      },
    ],
  };
}

function buildLocalizedTour(tourId, user) {
  const source = TOURS[tourId];
  if (!source) return null;
  const localized = {
    ...source,
    label: i18n.t(`guidedTutorial.tours.${tourId}.label`, source.label),
    steps: (source.steps || []).map((step, index) => ({
      ...step,
      title: i18n.t(`guidedTutorial.tours.${tourId}.steps.${index}.title`, step.title),
      text: i18n.t(`guidedTutorial.tours.${tourId}.steps.${index}.text`, step.text),
    })),
  };
  return buildContextualTour(tourId, localized, user);
}

const ROUTE_TOURS = {
  "/coach-dashboard": "coachDashboard",
  "/clients": "coachClients",
  "/exercise-bank": "coachPrograms",
  "/exercise-bank/program-builder/new": "coachPrograms",
  "/programmes": "coachProgramList",
  "/nutrition-coach": "coachNutrition",
  "/statistics-coach": "coachStats",
  "/coach/profile": "coachProfile",
  "/club-dashboard": "clubDashboard",
  "/user-dashboard": "clientDashboard",
  "/mes-programmes": "clientPrograms",
  "/nutrition": "clientNutrition",
  "/statistiques": "clientStats",
  "/profile": "clientProfile",
  "/settings": "settings",
  "/settings-coach": "settings",
};

export function startGuidedTutorial(tourId) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_TOUR_KEY, tourId);
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: { tourId } }));
}

export function getGuidedTutorialRoute(tourId, role = "coach") {
  const tour = TOURS[tourId];
  if (!tour) return null;
  return tourId === "settings" && role === "coach" ? "/settings-coach" : tour.route;
}

export const COACH_TUTORIAL_SHORTCUTS = [
  { id: "coachDashboard", labelKey: "guidedTutorial.shortcuts.dashboard", fallback: "Tableau de bord" },
  { id: "coachClients", labelKey: "guidedTutorial.shortcuts.clients", fallback: "Clients" },
  { id: "coachProgramList", labelKey: "guidedTutorial.shortcuts.programs", fallback: "Programmes" },
  { id: "coachPrograms", labelKey: "guidedTutorial.shortcuts.builder", fallback: "Builder" },
  { id: "coachNutrition", labelKey: "guidedTutorial.shortcuts.nutrition", fallback: "Nutrition" },
  { id: "coachStats", labelKey: "guidedTutorial.shortcuts.stats", fallback: "Statistiques" },
  { id: "coachProfile", labelKey: "guidedTutorial.shortcuts.profile", fallback: "Profil" },
  { id: "settings", labelKey: "guidedTutorial.shortcuts.settings", fallback: "Réglages" },
];

export const CLIENT_TUTORIAL_SHORTCUTS = [
  { id: "clientDashboard", labelKey: "guidedTutorial.shortcuts.dashboard", fallback: "Tableau de bord" },
  { id: "clientPrograms", labelKey: "guidedTutorial.shortcuts.myPrograms", fallback: "Mes programmes" },
  { id: "clientNutrition", labelKey: "guidedTutorial.shortcuts.nutrition", fallback: "Nutrition" },
  { id: "clientStats", labelKey: "guidedTutorial.shortcuts.stats", fallback: "Statistiques" },
  { id: "clientProfile", labelKey: "guidedTutorial.shortcuts.profile", fallback: "Profil" },
  { id: "settings", labelKey: "guidedTutorial.shortcuts.settings", fallback: "Réglages" },
];

export const CLUB_TUTORIAL_SHORTCUTS = [
  { id: "clubDashboard", labelKey: "guidedTutorial.shortcuts.clubDashboard", fallback: "Dashboard club" },
];

function getRouteTour(pathname) {
  if (pathname?.startsWith("/club-dashboard")) return "clubDashboard";
  return ROUTE_TOURS[pathname];
}

function resolveElement(selector) {
  if (!selector || typeof document === "undefined") return null;
  const elements = Array.from(document.querySelectorAll(selector));
  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) || elements[0] || null;
}

function getTourRole({ effectiveRole, user }) {
  if (user?.accountType === "club_owner" || user?.clubRole === "owner") return "club";
  if (user?.role === "admin" && typeof window !== "undefined" && window.location.pathname.startsWith("/club-dashboard")) return "club";
  if (effectiveRole === "coach" || user?.role === "admin") return "coach";
  if (user?.role === "particulier" || effectiveRole === "particulier") return "client";
  return null;
}

function canUseTour(tour, role) {
  return !!tour && (tour.role === "both" || tour.role === role);
}

function getSeenKey(role, tourId) {
  return `${role}_${tourId}`;
}

function getLocalSeenKeys(user, role, tourId) {
  const uid = user?.uid || "anonymous";
  return [
    `${SEEN_PREFIX}_${uid}_${role}_${tourId}`,
    `${SEEN_PREFIX}_${role}_${tourId}`,
  ];
}

function isSeenInProfile(user, role, tourId) {
  const settings = user?.settings || {};
  const key = getSeenKey(role, tourId);
  return Boolean(
    settings.tutorialsSeen?.[role]?.[tourId] ||
      settings.tutorialsSeenKeys?.[key]
  );
}

function isSeenInLocalCache(user, role, tourId) {
  if (typeof window === "undefined") return false;
  return getLocalSeenKeys(user, role, tourId).some(
    (key) => window.localStorage.getItem(key) === "1"
  );
}

function cacheTourSeen(user, role, tourId) {
  if (typeof window === "undefined") return;
  getLocalSeenKeys(user, role, tourId).forEach((key) => {
    window.localStorage.setItem(key, "1");
  });
}

function isTourAlreadySeen(user, role, tourId) {
  return isSeenInProfile(user, role, tourId) || isSeenInLocalCache(user, role, tourId);
}

async function persistTourSeen(user, role, tourId) {
  cacheTourSeen(user, role, tourId);
  if (!user?.uid || !role || !tourId) return;

  const key = getSeenKey(role, tourId);
  await setDoc(
    doc(db, "users", user.uid),
    {
      settings: {
        tutorialsSeen: {
          [role]: {
            [tourId]: true,
          },
        },
        tutorialsSeenKeys: {
          [key]: true,
        },
        tutorialsSeenVersion: TUTORIAL_SEEN_VERSION,
        tutorialsSeenUpdatedAt: serverTimestamp(),
      },
    },
    { merge: true }
  );
}

export default function GuidedTutorial() {
  const { user, effectiveRole } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTourId, setActiveTourId] = React.useState(null);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState(null);
  const [missingSelectors, setMissingSelectors] = React.useState(() => new Set());
  const migratedSeenRef = React.useRef(new Set());

  const role = getTourRole({ effectiveRole, user });
  const baseTour = React.useMemo(
    () => (activeTourId ? buildLocalizedTour(activeTourId, user) : null),
    [activeTourId, user]
  );
  const activeSteps = React.useMemo(() => {
    if (!baseTour) return [];
    return (baseTour.steps || []).filter((step) => !missingSelectors.has(step.selector));
  }, [baseTour, missingSelectors]);
  const activeTour = baseTour ? { ...baseTour, steps: activeSteps } : null;
  const activeStep = activeSteps[stepIndex] || null;
  const isActive = !!activeTour && !!activeStep;

  const cardBg = useColorModeValue("white", "#0F172A");
  const cardBorder = useColorModeValue("rgba(15,23,42,0.12)", "rgba(255,255,255,0.16)");
  const muted = useColorModeValue("gray.600", "rgba(255,255,255,0.68)");
  const startTour = React.useCallback(
    (tourId, { force = false } = {}) => {
      const tour = buildLocalizedTour(tourId, user);
      if (!user || !canUseTour(tour, role)) return false;

      if (!force && isTourAlreadySeen(user, role, tourId)) {
        cacheTourSeen(user, role, tourId);
        return true;
      }

      const open = () => {
        setActiveTourId(tourId);
        setStepIndex(0);
        setMissingSelectors(new Set());
        if (!force) {
          persistTourSeen(user, role, tourId).catch((error) => {
            console.warn("GuidedTutorial seen persistence failed:", error);
          });
        }
      };

      const targetRoute = tourId === "settings" && role === "coach" ? "/settings-coach" : tour.route;

      if (targetRoute && location.pathname !== targetRoute) {
        navigate(targetRoute);
        window.setTimeout(open, 350);
      } else {
        open();
      }

      return true;
    },
    [location.pathname, navigate, role, user]
  );

  React.useEffect(() => {
    if (!user || !role) return;
    if (typeof window === "undefined") return;

    Object.keys(TOURS).forEach((tourId) => {
      const tour = buildLocalizedTour(tourId, user);
      if (!canUseTour(tour, role)) return;

      const migrationKey = `${user.uid || "anonymous"}:${role}:${tourId}`;
      if (migratedSeenRef.current.has(migrationKey)) return;

      if (!isTourAlreadySeen(user, role, tourId)) return;

      cacheTourSeen(user, role, tourId);
      migratedSeenRef.current.add(migrationKey);

      if (!isSeenInProfile(user, role, tourId)) {
        persistTourSeen(user, role, tourId).catch((error) => {
          console.warn("GuidedTutorial migration failed:", error);
        });
      }
    });
  }, [role, user]);

  React.useEffect(() => {
    if (!user || !role) return;
    const tourId = getRouteTour(location.pathname);
    if (!tourId) return;
    const timer = window.setTimeout(() => startTour(tourId), 650);
    return () => window.clearTimeout(timer);
  }, [location.pathname, role, startTour, user]);

  React.useEffect(() => {
    const onStart = (event) => {
      const tourId = event.detail?.tourId;
      if (tourId) {
        const didStart = startTour(tourId, { force: true });
        if (didStart) window.sessionStorage.removeItem(PENDING_TOUR_KEY);
      }
    };
    window.addEventListener(START_EVENT, onStart);
    return () => window.removeEventListener(START_EVENT, onStart);
  }, [startTour]);

  React.useEffect(() => {
    if (!user || !role || typeof window === "undefined") return;
    const pendingTourId = window.sessionStorage.getItem(PENDING_TOUR_KEY);
    if (!pendingTourId) return;
    const didStart = startTour(pendingTourId, { force: true });
    if (didStart) window.sessionStorage.removeItem(PENDING_TOUR_KEY);
  }, [location.pathname, role, startTour, user]);

  React.useEffect(() => {
    if (!activeStep) return undefined;

    let raf = 0;
    let retryTimer = 0;
    let attempts = 0;
    const updateRect = () => {
      const el = resolveElement(activeStep.selector);
      if (!el) {
        setTargetRect(null);
        if (attempts < 12) {
          attempts += 1;
          retryTimer = window.setTimeout(updateRect, 140);
        } else if (activeStep.skipIfMissing) {
          setMissingSelectors((current) => {
            if (current.has(activeStep.selector)) return current;
            const next = new Set(current);
            next.add(activeStep.selector);
            return next;
          });
        }
        return;
      }
      attempts = 0;
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      window.setTimeout(() => {
        const rect = el.getBoundingClientRect();
        const top = Math.max(12, rect.top);
        const left = Math.max(12, rect.left);
        const right = Math.min(window.innerWidth - 12, rect.right);
        const bottom = Math.min(window.innerHeight - 12, rect.bottom);
        setTargetRect({
          top,
          left,
          width: Math.max(40, right - left),
          height: Math.max(40, bottom - top),
        });
      }, 180);
    };

    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(updateRect);
    };

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(retryTimer);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [activeStep]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const shouldShowDemo = activeTourId === "coachClients" && !!activeStep?.demoClients;
    window.dispatchEvent(new CustomEvent(CLIENTS_DEMO_EVENT, { detail: { active: shouldShowDemo } }));
    return () => {
      window.dispatchEvent(new CustomEvent(CLIENTS_DEMO_EVENT, { detail: { active: false } }));
    };
  }, [activeStep?.demoClients, activeTourId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const shouldShowDemo = activeTourId === "coachPrograms" && !!activeStep?.demoBuilder;
    window.dispatchEvent(new CustomEvent(BUILDER_DEMO_EVENT, { detail: { active: shouldShowDemo } }));
    return () => {
      window.dispatchEvent(new CustomEvent(BUILDER_DEMO_EVENT, { detail: { active: false } }));
    };
  }, [activeStep?.demoBuilder, activeTourId]);

  React.useEffect(() => {
    if (activeTour && stepIndex >= activeTour.steps.length) {
      setStepIndex(Math.max(0, activeTour.steps.length - 1));
    }
  }, [activeTour, stepIndex]);

  if (!user || !role) return null;

  const close = () => {
    setActiveTourId(null);
    setStepIndex(0);
    setTargetRect(null);
    setMissingSelectors(new Set());
  };

  const skip = () => {
    if (activeTourId && role) {
      persistTourSeen(user, role, activeTourId).catch((error) => {
        console.warn("GuidedTutorial skip persistence failed:", error);
      });
    }
    close();
  };

  const next = () => {
    if (!activeTour) return;
    if (stepIndex >= activeTour.steps.length - 1) {
      if (activeTourId && role) {
        persistTourSeen(user, role, activeTourId).catch((error) => {
          console.warn("GuidedTutorial completion persistence failed:", error);
        });
      }
      close();
      return;
    }
    setStepIndex((value) => value + 1);
  };

  const previous = () => setStepIndex((value) => Math.max(0, value - 1));
  const progress = activeTour ? ((stepIndex + 1) / activeTour.steps.length) * 100 : 0;

  const spotlight = targetRect
    ? {
        top: Math.max(8, targetRect.top - 8),
        left: Math.max(8, targetRect.left - 8),
        width: Math.min(window.innerWidth - 16, targetRect.width + 16),
        height: Math.min(window.innerHeight - 16, targetRect.height + 16),
      }
    : null;

  const tutorialCardWidth = Math.min(360, window.innerWidth - 32);

  const cardPosition = spotlight
    ? {
        top:
          spotlight.top + spotlight.height + 18 < window.innerHeight - 220
            ? spotlight.top + spotlight.height + 18
            : Math.max(18, spotlight.top - 238),
        left: Math.min(
          Math.max(16, spotlight.left),
          Math.max(16, window.innerWidth - tutorialCardWidth - 16)
        ),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <>
      {isActive && (
        <Box position="fixed" inset={0} zIndex={3000} pointerEvents="none">
          {spotlight ? (
            <>
              <Box position="absolute" top={0} left={0} right={0} h={`${spotlight.top}px`} bg="rgba(15,23,42,0.56)" />
              <Box position="absolute" top={`${spotlight.top + spotlight.height}px`} left={0} right={0} bottom={0} bg="rgba(15,23,42,0.56)" />
              <Box position="absolute" top={`${spotlight.top}px`} left={0} w={`${spotlight.left}px`} h={`${spotlight.height}px`} bg="rgba(15,23,42,0.56)" />
              <Box position="absolute" top={`${spotlight.top}px`} left={`${spotlight.left + spotlight.width}px`} right={0} h={`${spotlight.height}px`} bg="rgba(15,23,42,0.56)" />
              <Box
                position="absolute"
                top={`${spotlight.top}px`}
                left={`${spotlight.left}px`}
                w={`${spotlight.width}px`}
                h={`${spotlight.height}px`}
                borderRadius="18px"
                border="3px solid"
                borderColor="white"
                boxShadow="0 0 0 7px rgba(59,130,246,0.48), 0 18px 54px rgba(0,0,0,0.24)"
                bg="transparent"
              />
            </>
          ) : (
            <Box position="absolute" inset={0} bg="rgba(15,23,42,0.56)" />
          )}

          <Box
            position="absolute"
            pointerEvents="auto"
            w={{ base: "calc(100vw - 32px)", md: "360px" }}
            maxW="calc(100vw - 32px)"
            {...cardPosition}
            bg={cardBg}
            border="1px solid"
            borderColor={cardBorder}
            borderRadius="20px"
            boxShadow="0 24px 70px rgba(0,0,0,0.32)"
            p={4}
            maxH="calc(100dvh - 24px)"
            overflowY="auto"
          >
            <HStack justify="space-between" align="start" spacing={3}>
              <Box minW={0}>
                <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" fontWeight="900" color={muted}>
                  {activeTour.label} · {stepIndex + 1}/{activeTour.steps.length}
                </Text>
                <Text mt={2} fontSize="lg" fontWeight="900" lineHeight="1.2">
                  {activeStep.title}
                </Text>
              </Box>
              <IconButton
                aria-label={i18n.t("auto.GuidedTutorial.fermer_le_didacticiel", "Fermer le didacticiel")}
                icon={<Icon as={MdClose} />}
                size="sm"
                variant="ghost"
                borderRadius="12px"
                onClick={close}
              />
            </HStack>

            <Progress value={progress} size="xs" borderRadius="full" mt={3} />

            <VStack align="stretch" spacing={3} mt={4}>
              <Text color={muted} lineHeight="1.6">
                {activeStep.text}
              </Text>
              <HStack justify="space-between" pt={1}>
                <HStack spacing={2}>
                  <Button variant="ghost" borderRadius="14px" onClick={skip}>{i18n.t("auto.GuidedTutorial.passer", "Passer")}</Button>
                  <Button
                    leftIcon={<Icon as={MdArrowBack} />}
                    variant="ghost"
                    borderRadius="14px"
                    onClick={previous}
                    isDisabled={stepIndex === 0}
                  >{i18n.t("programView.back", "Retour")}</Button>
                </HStack>
                <Button
                  rightIcon={<Icon as={MdArrowForward} />}
                  bg="#111827"
                  color="white"
                  _hover={{ bg: "#1F2937" }}
                  borderRadius="14px"
                  onClick={next}
                >
                  {stepIndex >= activeTour.steps.length - 1
                    ? i18n.t("guidedTutorial.actions.finish", "Terminer")
                    : i18n.t("guidedTutorial.actions.next", "Suivant")}
                </Button>
              </HStack>
            </VStack>
          </Box>
        </Box>
      )}
    </>
  );
}
