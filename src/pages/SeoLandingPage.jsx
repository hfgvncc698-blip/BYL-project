import React from "react";
import {
  Badge,
  Box,
  Button,
  Container,
  Heading,
  HStack,
  Icon,
  SimpleGrid,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon, CheckCircleIcon } from "@chakra-ui/icons";
import { Link as RouterLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  MdOutlineAnalytics,
  MdOutlineAssignment,
  MdOutlineGroups,
  MdOutlineRestaurantMenu,
} from "react-icons/md";
import { useAppTheme } from "../styles/appTheme";
import { SEO_PUBLIC_LINKS, SEO_ROUTES, seoHrefForPath } from "../seo/seoConfig";

const PAGE_COPY = {
  "logiciel-coach-sportif": {
    icon: MdOutlineAssignment,
    accent: "#3B82F6",
    fr: {
      eyebrow: "Coachs sportifs",
      title: "Logiciel coach sportif pour créer et suivre vos programmes",
      intro:
        "BoostYourLife.coach centralise vos clients, programmes, séances, validations et exports dans un espace clair pour gagner du temps au quotidien.",
      bullets: [
        "Création de programmes sportifs personnalisés",
        "Suivi des séances, progression et retours clients",
        "Exports PDF et espace client pour chaque suivi",
        "Banque d'exercices structurée pour travailler plus vite",
      ],
      stat: "Programmes, clients et séances au même endroit",
      sections: [
        ["Un outil pensé pour le terrain", "Le coach garde une vue simple sur ses clients actifs, ses programmes, les séances prévues et les actions récentes."],
        ["Une expérience plus professionnelle", "Les documents, exports et retours client deviennent plus lisibles pour renforcer la valeur perçue de l'accompagnement."],
      ],
    },
    en: {
      eyebrow: "Sports coaches",
      title: "Sports coaching software to create and track programs",
      intro:
        "BoostYourLife.coach brings clients, programs, sessions, validations and exports into one clear workspace for daily coaching.",
      bullets: [
        "Personalized training program creation",
        "Session tracking, progress and client feedback",
        "PDF exports and client workspace",
        "Structured exercise bank to work faster",
      ],
      stat: "Programs, clients and sessions in one place",
      sections: [
        ["Built for daily coaching", "Coaches keep a simple view of active clients, programs and recent actions."],
        ["A more professional client experience", "Documents, exports and client feedback become clearer and easier to deliver."],
      ],
    },
  },
  "application-coach-sportif": {
    icon: MdOutlineAssignment,
    accent: "#2563EB",
    fr: {
      eyebrow: "Application coach sportif",
      title: "Application coach sportif pour suivre vos clients au quotidien",
      intro:
        "BoostYourLife.coach aide les coachs à créer des programmes, partager les séances, suivre la progression et garder un espace client simple.",
      bullets: [
        "Programmes consultables depuis l'espace client",
        "Séances structurées avec exercices, séries et repos",
        "Progression, validations et retours centralisés",
        "Interface claire pour coaching en ligne ou présentiel",
      ],
      stat: "Une application web pour coacher plus clairement",
      sections: [
        ["Un suivi plus fluide", "Le coach retrouve les programmes, les séances et les retours clients sans disperser ses informations."],
        ["Une expérience client lisible", "Le client sait quoi faire, dans quel ordre, et retrouve ses contenus depuis son espace personnel."],
      ],
    },
    en: {
      eyebrow: "Sports coaching app",
      title: "Sports coaching app to track clients every day",
      intro:
        "BoostYourLife.coach helps coaches create programs, share sessions, track progress and keep a clear client workspace.",
      bullets: [
        "Programs available from the client space",
        "Structured sessions with exercises, sets and rest",
        "Progress, validations and feedback centralized",
        "Clear interface for online or in-person coaching",
      ],
      stat: "A web app for clearer coaching",
      sections: [
        ["Smoother follow-up", "Coaches find programs, sessions and client feedback without spreading information across tools."],
        ["A clearer client experience", "Clients know what to do, in which order, and find their content from their personal space."],
      ],
    },
  },
  "logiciel-suivi-client-coach": {
    icon: MdOutlineAnalytics,
    accent: "#0EA5E9",
    fr: {
      eyebrow: "Suivi client coach",
      title: "Logiciel de suivi client coach pour centraliser progression et programmes",
      intro:
        "BoostYourLife.coach regroupe les données clients, programmes, séances, bilans, documents et historiques pour mieux piloter chaque accompagnement.",
      bullets: [
        "Vue globale sur les clients actifs",
        "Historique des programmes et validations",
        "Suivi sport et nutrition selon les services",
        "Documents et exports regroupés au même endroit",
      ],
      stat: "Un suivi client clair, utile et exploitable",
      sections: [
        ["Moins d'informations perdues", "Le professionnel retrouve rapidement ce qui a été fait, partagé et validé avec chaque client."],
        ["Des décisions plus faciles", "Les retours, la progression et les données de suivi aident à ajuster le prochain cycle."],
      ],
    },
    en: {
      eyebrow: "Client tracking",
      title: "Client tracking software for coaches",
      intro:
        "BoostYourLife.coach brings client data, programs, sessions, assessments, documents and history together to manage each follow-up.",
      bullets: [
        "Global view of active clients",
        "Program and validation history",
        "Sport and nutrition follow-up depending on services",
        "Documents and exports in one place",
      ],
      stat: "Clear and usable client follow-up",
      sections: [
        ["Less lost information", "Professionals quickly find what was done, shared and validated with each client."],
        ["Easier decisions", "Feedback, progress and tracking data help adjust the next training cycle."],
      ],
    },
  },
  "application-coaching-nutrition": {
    icon: MdOutlineRestaurantMenu,
    accent: "#10B981",
    fr: {
      eyebrow: "Nutrition",
      title: "Application de coaching nutrition pour bilans, menus et suivi patient",
      intro:
        "BoostYourLife.coach accompagne les pros nutrition avec des bilans, rations, menus, recettes, listes de courses et partages client.",
      bullets: [
        "Bilans nutrition et dossiers patients",
        "Rations, menus journaliers et recettes",
        "Partage contrôlé vers l'espace client",
        "Historique de suivi et objectifs nutrition",
      ],
      stat: "Bilans, menus et documents nutrition centralisés",
      sections: [
        ["Un suivi nutrition plus structuré", "Les données patient, objectifs et habitudes restent au même endroit pour ajuster le suivi."],
        ["Des supports plus simples à partager", "La plateforme aide à produire des documents lisibles, réutilisables et adaptés au contexte du patient."],
      ],
    },
    en: {
      eyebrow: "Nutrition",
      title: "Nutrition coaching app for assessments, menus and patient tracking",
      intro:
        "BoostYourLife.coach supports nutrition professionals with assessments, rations, menus, recipes, shopping lists and client sharing.",
      bullets: [
        "Nutrition assessments and patient files",
        "Rations, daily menus and recipes",
        "Controlled sharing to the client space",
        "Tracking history and nutrition goals",
      ],
      stat: "Assessments, menus and nutrition documents centralized",
      sections: [
        ["More structured nutrition tracking", "Patient data, goals and habits remain in one place to support better follow-up."],
        ["Easier documents to share", "The platform helps produce clear, reusable support adapted to each patient context."],
      ],
    },
  },
  "logiciel-nutritionniste": {
    icon: MdOutlineRestaurantMenu,
    accent: "#059669",
    fr: {
      eyebrow: "Nutritionnistes",
      title: "Logiciel nutritionniste pour bilans, rations et menus clients",
      intro:
        "BoostYourLife.coach permet de structurer les bilans nutrition, objectifs, rations, menus, recettes et listes de courses dans un espace partageable.",
      bullets: [
        "Bilans nutrition et dossiers patients",
        "Objectifs, habitudes et données de suivi",
        "Menus journaliers, recettes et listes de courses",
        "Partage contrôlé vers l'espace client",
      ],
      stat: "Une base claire pour le suivi nutrition",
      sections: [
        ["Des bilans plus exploitables", "Les informations importantes restent structurées pour faciliter les ajustements au fil du suivi."],
        ["Des supports pratiques pour le client", "Menus, recettes et listes de courses deviennent plus simples à consulter et à appliquer."],
      ],
    },
    en: {
      eyebrow: "Nutrition professionals",
      title: "Nutritionist software for assessments, rations and client menus",
      intro:
        "BoostYourLife.coach structures nutrition assessments, goals, rations, menus, recipes and shopping lists in a shareable workspace.",
      bullets: [
        "Nutrition assessments and patient files",
        "Goals, habits and tracking data",
        "Daily menus, recipes and shopping lists",
        "Controlled sharing to the client space",
      ],
      stat: "A clearer base for nutrition follow-up",
      sections: [
        ["More usable assessments", "Important information remains structured to make follow-up adjustments easier."],
        ["Practical support for clients", "Menus, recipes and shopping lists become easier to view and apply."],
      ],
    },
  },
  "logiciel-coach-sportif-nutrition": {
    icon: MdOutlineAnalytics,
    accent: "#8B5CF6",
    fr: {
      eyebrow: "Sport + nutrition",
      title: "Logiciel coach sportif et nutrition pour un suivi complet",
      intro:
        "BoostYourLife.coach regroupe coaching sportif, nutrition, suivi client, programmes et documents pour les profils hybrides.",
      bullets: [
        "Modules sport et nutrition dans un même espace",
        "Dashboard client selon les services activés",
        "Programmes, bilans et documents personnalisés",
        "Suivi adapté aux coachs hybrides et indépendants",
      ],
      stat: "Une vision unique du client accompagné",
      sections: [
        ["Sport et nutrition sans dispersion", "Le professionnel suit entraînement, habitudes nutrition et documents sans multiplier les outils."],
        ["Une offre plus claire", "Le client retrouve programmes, supports et informations dans une expérience cohérente."],
      ],
    },
    en: {
      eyebrow: "Sport + nutrition",
      title: "Sports and nutrition coaching software for complete follow-up",
      intro:
        "BoostYourLife.coach combines sports coaching, nutrition, client tracking, programs and documents for hybrid professionals.",
      bullets: [
        "Sport and nutrition modules in one workspace",
        "Client dashboard based on active services",
        "Personalized programs, assessments and documents",
        "Follow-up for hybrid and independent coaches",
      ],
      stat: "One clear view of each coached client",
      sections: [
        ["Sport and nutrition together", "Professionals track training, nutrition habits and documents without spreading work across tools."],
        ["A clearer service for clients", "Clients find programs, support and tracking information in one consistent experience."],
      ],
    },
  },
  "logiciel-club-sport": {
    icon: MdOutlineGroups,
    accent: "#F59E0B",
    fr: {
      eyebrow: "Clubs et salles",
      title: "Logiciel club de sport pour gérer coachs, clients et programmes",
      intro:
        "BoostYourLife.coach propose une licence Club pour studios, salles, structures et équipes avec plusieurs intervenants.",
      bullets: [
        "Comptes pros rattachés au club",
        "Vue responsable sur coachs, clients et activité",
        "Capacités adaptées aux studios, clubs et réseaux",
        "Logo et documents club selon le pack choisi",
      ],
      stat: "Une supervision lisible pour toute la structure",
      sections: [
        ["Une vue responsable", "Le club suit l'activité globale, les pros rattachés, les clients et les programmes créés."],
        ["Une base solide pour grandir", "Les packs Club aident à organiser une équipe et harmoniser les documents produits."],
      ],
    },
    en: {
      eyebrow: "Clubs and gyms",
      title: "Sports club software to manage coaches, clients and programs",
      intro:
        "BoostYourLife.coach offers a Club license for studios, gyms, structures and teams with multiple professionals.",
      bullets: [
        "Professional accounts attached to the club",
        "Manager view over coaches, clients and activity",
        "Capacity for studios, clubs and networks",
        "Club logo and documents depending on the package",
      ],
      stat: "Clear supervision for the whole structure",
      sections: [
        ["A manager view", "The club tracks global activity, attached professionals, clients and created programs."],
        ["A stronger base to grow", "Club packages help organize a team and harmonize produced documents."],
      ],
    },
  },
  "logiciel-salle-de-sport": {
    icon: MdOutlineGroups,
    accent: "#F97316",
    fr: {
      eyebrow: "Salles et studios",
      title: "Logiciel salle de sport pour organiser coachs, clients et programmes",
      intro:
        "BoostYourLife.coach aide les salles, studios et structures sportives à centraliser les coachs, clients, programmes et documents de suivi.",
      bullets: [
        "Comptes coachs rattachés à la structure",
        "Vue responsable sur l'activité globale",
        "Programmes et documents harmonisés",
        "Organisation adaptée aux studios et clubs",
      ],
      stat: "Une organisation plus lisible pour la salle",
      sections: [
        ["Un pilotage plus simple", "La structure garde une vision claire des coachs, clients, programmes et actions récentes."],
        ["Une expérience plus homogène", "Les documents et programmes produits par l'équipe restent cohérents avec l'identité de la salle."],
      ],
    },
    en: {
      eyebrow: "Gyms and studios",
      title: "Gym software to organize coaches, clients and programs",
      intro:
        "BoostYourLife.coach helps gyms, studios and sports structures centralize coaches, clients, programs and follow-up documents.",
      bullets: [
        "Coach accounts attached to the structure",
        "Manager view over global activity",
        "Harmonized programs and documents",
        "Organization for studios and clubs",
      ],
      stat: "Clearer organization for the gym",
      sections: [
        ["Simpler management", "The structure keeps a clear view of coaches, clients, programs and recent actions."],
        ["A more consistent experience", "Documents and programs produced by the team stay aligned with the gym identity."],
      ],
    },
  },
};

const RESOURCE_TRANSLATIONS = {
  es: {
    "logiciel-coach-sportif": {
      eyebrow: "Entrenadores deportivos",
      title: "Software para entrenador deportivo para crear y seguir programas",
      intro: "BoostYourLife.coach centraliza clientes, programas, sesiones, validaciones y exportaciones en un espacio claro para trabajar mejor cada día.",
      bullets: ["Creación de programas deportivos personalizados", "Seguimiento de sesiones, progreso y comentarios de clientes", "Exportaciones PDF y espacio cliente", "Banco de ejercicios estructurado para trabajar más rápido"],
      stat: "Programas, clientes y sesiones en un solo lugar",
      sections: [["Una herramienta pensada para el terreno", "El entrenador mantiene una visión simple de clientes activos, programas, sesiones previstas y acciones recientes."], ["Una experiencia más profesional", "Documentos, exportaciones y comentarios del cliente son más claros y refuerzan el valor del acompañamiento."]],
    },
    "application-coach-sportif": {
      eyebrow: "Aplicación para entrenador deportivo",
      title: "Aplicación para entrenador deportivo para seguir clientes a diario",
      intro: "BoostYourLife.coach ayuda a crear programas, compartir sesiones, seguir el progreso y mantener un espacio cliente sencillo.",
      bullets: ["Programas disponibles desde el espacio cliente", "Sesiones estructuradas con ejercicios, series y descansos", "Progreso, validaciones y comentarios centralizados", "Interfaz clara para coaching online o presencial"],
      stat: "Una aplicación web para entrenar con más claridad",
      sections: [["Seguimiento más fluido", "El entrenador encuentra programas, sesiones y comentarios sin dispersar la información."], ["Experiencia cliente más clara", "El cliente sabe qué hacer, en qué orden y dónde encontrar su contenido."]],
    },
    "logiciel-suivi-client-coach": {
      eyebrow: "Seguimiento de clientes",
      title: "Software de seguimiento de clientes para entrenadores",
      intro: "BoostYourLife.coach reúne datos de clientes, programas, sesiones, evaluaciones, documentos e historial para gestionar cada acompañamiento.",
      bullets: ["Vista global de clientes activos", "Historial de programas y validaciones", "Seguimiento deportivo y nutricional según servicios", "Documentos y exportaciones en un solo lugar"],
      stat: "Seguimiento cliente claro y utilizable",
      sections: [["Menos información perdida", "El profesional encuentra rápido lo realizado, compartido y validado con cada cliente."], ["Decisiones más fáciles", "Comentarios, progreso y datos de seguimiento ayudan a ajustar el siguiente ciclo."]],
    },
    "application-coaching-nutrition": {
      eyebrow: "Nutrición",
      title: "Aplicación de coaching nutricional para evaluaciones, menús y seguimiento",
      intro: "BoostYourLife.coach acompaña a profesionales de nutrición con evaluaciones, raciones, menús, recetas, listas de compra y compartición con clientes.",
      bullets: ["Evaluaciones nutricionales y expedientes", "Raciones, menús diarios y recetas", "Compartición controlada hacia el espacio cliente", "Historial de seguimiento y objetivos nutricionales"],
      stat: "Evaluaciones, menús y documentos nutricionales centralizados",
      sections: [["Seguimiento nutricional más estructurado", "Datos, objetivos y hábitos permanecen en el mismo lugar para ajustar el acompañamiento."], ["Soportes más simples de compartir", "La plataforma ayuda a producir documentos claros y adaptados al contexto del cliente."]],
    },
    "logiciel-nutritionniste": {
      eyebrow: "Nutricionistas",
      title: "Software para nutricionistas para evaluaciones, raciones y menús",
      intro: "BoostYourLife.coach estructura evaluaciones nutricionales, objetivos, raciones, menús, recetas y listas de compra en un espacio compartible.",
      bullets: ["Evaluaciones nutricionales y expedientes", "Objetivos, hábitos y datos de seguimiento", "Menús diarios, recetas y listas de compra", "Compartición controlada hacia el espacio cliente"],
      stat: "Una base clara para el seguimiento nutricional",
      sections: [["Evaluaciones más explotables", "La información importante permanece estructurada para facilitar los ajustes."], ["Soportes prácticos para el cliente", "Menús, recetas y listas de compra son más fáciles de consultar y aplicar."]],
    },
    "logiciel-coach-sportif-nutrition": {
      eyebrow: "Deporte + nutrición",
      title: "Software de coaching deportivo y nutricional para seguimiento completo",
      intro: "BoostYourLife.coach reúne coaching deportivo, nutrición, seguimiento cliente, programas y documentos para perfiles híbridos.",
      bullets: ["Módulos de deporte y nutrición en un mismo espacio", "Panel cliente según servicios activados", "Programas, evaluaciones y documentos personalizados", "Seguimiento adaptado a coaches híbridos e independientes"],
      stat: "Una visión única de cada cliente acompañado",
      sections: [["Deporte y nutrición sin dispersión", "El profesional sigue entrenamiento, hábitos nutricionales y documentos sin multiplicar herramientas."], ["Una oferta más clara", "El cliente encuentra programas, soportes e información en una experiencia coherente."]],
    },
    "logiciel-club-sport": {
      eyebrow: "Clubes y gimnasios",
      title: "Software para clubes deportivos para gestionar coaches, clientes y programas",
      intro: "BoostYourLife.coach ofrece una licencia Club para estudios, gimnasios, estructuras y equipos con varios profesionales.",
      bullets: ["Cuentas profesionales vinculadas al club", "Vista de responsable sobre coaches, clientes y actividad", "Capacidad adaptada a estudios, clubes y redes", "Logo y documentos del club según el pack"],
      stat: "Supervisión clara para toda la estructura",
      sections: [["Vista de responsable", "El club sigue la actividad global, profesionales vinculados, clientes y programas creados."], ["Base sólida para crecer", "Los packs Club ayudan a organizar el equipo y armonizar los documentos producidos."]],
    },
    "logiciel-salle-de-sport": {
      eyebrow: "Gimnasios y estudios",
      title: "Software para gimnasio para organizar coaches, clientes y programas",
      intro: "BoostYourLife.coach ayuda a gimnasios, estudios y estructuras deportivas a centralizar coaches, clientes, programas y documentos de seguimiento.",
      bullets: ["Cuentas de coaches vinculadas a la estructura", "Vista de responsable sobre la actividad global", "Programas y documentos armonizados", "Organización adaptada a estudios y clubes"],
      stat: "Organización más clara para el gimnasio",
      sections: [["Gestión más simple", "La estructura mantiene una visión clara de coaches, clientes, programas y acciones recientes."], ["Experiencia más homogénea", "Los documentos y programas del equipo permanecen alineados con la identidad del gimnasio."]],
    },
  },
  de: {
    "logiciel-coach-sportif": { eyebrow: "Sportcoaches", title: "Software für Sportcoaches zum Erstellen und Verfolgen von Programmen", intro: "BoostYourLife.coach bündelt Kunden, Programme, Einheiten, Freigaben und Exporte in einem klaren Arbeitsbereich.", bullets: ["Personalisierte Trainingsprogramme erstellen", "Einheiten, Fortschritt und Kundenfeedback verfolgen", "PDF-Exporte und Kundenbereich", "Strukturierte Übungsdatenbank für schnelleres Arbeiten"], stat: "Programme, Kunden und Einheiten an einem Ort", sections: [["Für den Coaching-Alltag gebaut", "Coaches behalten aktive Kunden, Programme und aktuelle Aktionen einfach im Blick."], ["Professionellere Kundenerfahrung", "Dokumente, Exporte und Feedback werden klarer und leichter bereitzustellen."]] },
    "application-coach-sportif": { eyebrow: "Sportcoach-App", title: "Sportcoach-App für die tägliche Kundenbetreuung", intro: "BoostYourLife.coach hilft Coaches, Programme zu erstellen, Einheiten zu teilen, Fortschritt zu verfolgen und einen klaren Kundenbereich zu behalten.", bullets: ["Programme im Kundenbereich verfügbar", "Strukturierte Einheiten mit Übungen, Sätzen und Pausen", "Fortschritt, Freigaben und Feedback zentralisiert", "Klare Oberfläche für Online- oder Vor-Ort-Coaching"], stat: "Eine Web-App für klareres Coaching", sections: [["Reibungslosere Betreuung", "Coaches finden Programme, Einheiten und Feedback ohne verteilte Informationen."], ["Klarere Kundenerfahrung", "Kunden wissen, was zu tun ist, in welcher Reihenfolge und wo Inhalte liegen."]] },
    "logiciel-suivi-client-coach": { eyebrow: "Kundenbetreuung", title: "Software zur Kundenbetreuung für Coaches", intro: "BoostYourLife.coach führt Kundendaten, Programme, Einheiten, Bilanzen, Dokumente und Verlauf zusammen.", bullets: ["Gesamtansicht aktiver Kunden", "Verlauf von Programmen und Freigaben", "Sport- und Ernährungsbetreuung je nach Service", "Dokumente und Exporte an einem Ort"], stat: "Klare und nutzbare Kundenbetreuung", sections: [["Weniger verlorene Informationen", "Profis finden schnell, was mit jedem Kunden erledigt, geteilt und bestätigt wurde."], ["Einfachere Entscheidungen", "Feedback, Fortschritt und Daten helfen, den nächsten Zyklus anzupassen."]] },
    "application-coaching-nutrition": { eyebrow: "Ernährung", title: "Ernährungscoaching-App für Bilanzen, Menüs und Patientenbetreuung", intro: "BoostYourLife.coach unterstützt Ernährungsprofis mit Bilanzen, Rationen, Menüs, Rezepten, Einkaufslisten und Kundenteilung.", bullets: ["Ernährungsbilanzen und Patientendossiers", "Rationen, Tagesmenüs und Rezepte", "Kontrollierte Freigabe zum Kundenbereich", "Verlauf und Ernährungsziele"], stat: "Bilanzen, Menüs und Ernährungsdokumente zentralisiert", sections: [["Strukturiertere Ernährungsbetreuung", "Patientendaten, Ziele und Gewohnheiten bleiben an einem Ort."], ["Einfacher teilbare Unterlagen", "Die Plattform hilft, klare und wiederverwendbare Dokumente zu erstellen."]] },
    "logiciel-nutritionniste": { eyebrow: "Ernährungsfachleute", title: "Software für Ernährungsberater für Bilanzen, Rationen und Menüs", intro: "BoostYourLife.coach strukturiert Ernährungsbilanzen, Ziele, Rationen, Menüs, Rezepte und Einkaufslisten in einem teilbaren Bereich.", bullets: ["Ernährungsbilanzen und Patientendossiers", "Ziele, Gewohnheiten und Trackingdaten", "Tagesmenüs, Rezepte und Einkaufslisten", "Kontrollierte Freigabe zum Kundenbereich"], stat: "Eine klare Basis für Ernährungsbetreuung", sections: [["Besser nutzbare Bilanzen", "Wichtige Informationen bleiben strukturiert und erleichtern Anpassungen."], ["Praktische Unterstützung für Kunden", "Menüs, Rezepte und Einkaufslisten sind einfacher zu nutzen."]] },
    "logiciel-coach-sportif-nutrition": { eyebrow: "Sport + Ernährung", title: "Software für Sport- und Ernährungscoaching für komplette Betreuung", intro: "BoostYourLife.coach kombiniert Sportcoaching, Ernährung, Kundenbetreuung, Programme und Dokumente für hybride Profis.", bullets: ["Sport- und Ernährungsmodule in einem Arbeitsbereich", "Kunden-Dashboard je nach aktiven Services", "Personalisierte Programme, Bilanzen und Dokumente", "Betreuung für hybride und unabhängige Coaches"], stat: "Eine klare Sicht auf jeden betreuten Kunden", sections: [["Sport und Ernährung zusammen", "Profis verfolgen Training, Ernährungsgewohnheiten und Dokumente ohne Tool-Wechsel."], ["Klareres Angebot für Kunden", "Kunden finden Programme, Unterlagen und Betreuung in einer konsistenten Erfahrung."]] },
    "logiciel-club-sport": { eyebrow: "Clubs und Studios", title: "Software für Sportclubs zur Verwaltung von Coaches, Kunden und Programmen", intro: "BoostYourLife.coach bietet eine Club-Lizenz für Studios, Fitnessstudios, Strukturen und Teams mit mehreren Profis.", bullets: ["Profi-Konten dem Club zugeordnet", "Manageransicht über Coaches, Kunden und Aktivität", "Kapazität für Studios, Clubs und Netzwerke", "Clublogo und Dokumente je nach Paket"], stat: "Klare Aufsicht über die gesamte Struktur", sections: [["Manageransicht", "Der Club verfolgt globale Aktivität, Profis, Kunden und erstellte Programme."], ["Stärkere Basis zum Wachsen", "Club-Pakete helfen, Teams zu organisieren und Dokumente zu harmonisieren."]] },
    "logiciel-salle-de-sport": { eyebrow: "Fitnessstudios und Studios", title: "Software für Fitnessstudios zur Organisation von Coaches, Kunden und Programmen", intro: "BoostYourLife.coach hilft Fitnessstudios und Sportstrukturen, Coaches, Kunden, Programme und Dokumente zu zentralisieren.", bullets: ["Coach-Konten der Struktur zugeordnet", "Manageransicht über globale Aktivität", "Harmonisierte Programme und Dokumente", "Organisation für Studios und Clubs"], stat: "Klarere Organisation für das Studio", sections: [["Einfachere Steuerung", "Die Struktur behält Coaches, Kunden, Programme und Aktionen im Blick."], ["Einheitlichere Erfahrung", "Dokumente und Programme des Teams bleiben zur Identität des Studios passend."]] },
  },
  it: {
    "logiciel-coach-sportif": { eyebrow: "Coach sportivi", title: "Software per coach sportivi per creare e seguire programmi", intro: "BoostYourLife.coach centralizza clienti, programmi, sessioni, validazioni ed esportazioni in uno spazio chiaro.", bullets: ["Creazione di programmi personalizzati", "Monitoraggio di sessioni, progressi e feedback", "Esportazioni PDF e spazio cliente", "Banca esercizi strutturata per lavorare più velocemente"], stat: "Programmi, clienti e sessioni nello stesso posto", sections: [["Pensato per il lavoro quotidiano", "Il coach mantiene una vista semplice su clienti attivi, programmi e azioni recenti."], ["Esperienza più professionale", "Documenti, esportazioni e feedback diventano più chiari e valorizzano l'accompagnamento."]] },
    "application-coach-sportif": { eyebrow: "App per coach sportivo", title: "App per coach sportivo per seguire i clienti ogni giorno", intro: "BoostYourLife.coach aiuta a creare programmi, condividere sessioni, seguire i progressi e mantenere uno spazio cliente semplice.", bullets: ["Programmi consultabili dallo spazio cliente", "Sessioni strutturate con esercizi, serie e recuperi", "Progressi, validazioni e feedback centralizzati", "Interfaccia chiara per coaching online o in presenza"], stat: "Una web app per allenare con più chiarezza", sections: [["Monitoraggio più fluido", "Il coach ritrova programmi, sessioni e feedback senza disperdere informazioni."], ["Esperienza cliente più leggibile", "Il cliente sa cosa fare, in quale ordine e dove trovare i contenuti."]] },
    "logiciel-suivi-client-coach": { eyebrow: "Monitoraggio clienti", title: "Software di monitoraggio clienti per coach", intro: "BoostYourLife.coach riunisce dati clienti, programmi, sessioni, valutazioni, documenti e storico.", bullets: ["Vista globale sui clienti attivi", "Storico di programmi e validazioni", "Monitoraggio sport e nutrizione secondo i servizi", "Documenti ed esportazioni in un unico posto"], stat: "Monitoraggio cliente chiaro e utilizzabile", sections: [["Meno informazioni perse", "Il professionista trova rapidamente ciò che è stato fatto, condiviso e validato."], ["Decisioni più semplici", "Feedback, progressi e dati aiutano ad adattare il ciclo successivo."]] },
    "application-coaching-nutrition": { eyebrow: "Nutrizione", title: "App di coaching nutrizionale per valutazioni, menu e monitoraggio", intro: "BoostYourLife.coach supporta i professionisti della nutrizione con valutazioni, razioni, menu, ricette, liste della spesa e condivisione cliente.", bullets: ["Valutazioni nutrizionali e dossier pazienti", "Razioni, menu giornalieri e ricette", "Condivisione controllata verso lo spazio cliente", "Storico e obiettivi nutrizionali"], stat: "Valutazioni, menu e documenti nutrizionali centralizzati", sections: [["Monitoraggio nutrizionale più strutturato", "Dati, obiettivi e abitudini restano nello stesso posto."], ["Supporti più semplici da condividere", "La piattaforma aiuta a produrre documenti chiari e adatti al contesto."]] },
    "logiciel-nutritionniste": { eyebrow: "Nutrizionisti", title: "Software per nutrizionisti per valutazioni, razioni e menu", intro: "BoostYourLife.coach struttura valutazioni nutrizionali, obiettivi, razioni, menu, ricette e liste della spesa in uno spazio condivisibile.", bullets: ["Valutazioni nutrizionali e dossier pazienti", "Obiettivi, abitudini e dati di monitoraggio", "Menu giornalieri, ricette e liste della spesa", "Condivisione controllata verso lo spazio cliente"], stat: "Una base chiara per il monitoraggio nutrizionale", sections: [["Valutazioni più utilizzabili", "Le informazioni importanti restano strutturate per facilitare gli adattamenti."], ["Supporti pratici per il cliente", "Menu, ricette e liste della spesa diventano più facili da consultare."]] },
    "logiciel-coach-sportif-nutrition": { eyebrow: "Sport + nutrizione", title: "Software per coaching sportivo e nutrizionale completo", intro: "BoostYourLife.coach riunisce coaching sportivo, nutrizione, monitoraggio clienti, programmi e documenti per profili ibridi.", bullets: ["Moduli sport e nutrizione nello stesso spazio", "Dashboard cliente secondo i servizi attivi", "Programmi, valutazioni e documenti personalizzati", "Monitoraggio per coach ibridi e indipendenti"], stat: "Una visione unica del cliente seguito", sections: [["Sport e nutrizione senza dispersione", "Il professionista segue allenamento, abitudini nutrizionali e documenti senza moltiplicare gli strumenti."], ["Offerta più chiara", "Il cliente trova programmi, supporti e informazioni in un'esperienza coerente."]] },
    "logiciel-club-sport": { eyebrow: "Club e palestre", title: "Software per club sportivi per gestire coach, clienti e programmi", intro: "BoostYourLife.coach offre una licenza Club per studi, palestre, strutture e team con più professionisti.", bullets: ["Account professionali collegati al club", "Vista responsabile su coach, clienti e attività", "Capacità adatte a studi, club e reti", "Logo e documenti club secondo il pacchetto"], stat: "Supervisione chiara per tutta la struttura", sections: [["Vista responsabile", "Il club segue attività globale, professionisti collegati, clienti e programmi creati."], ["Base solida per crescere", "I pacchetti Club aiutano a organizzare il team e armonizzare i documenti."]] },
    "logiciel-salle-de-sport": { eyebrow: "Palestre e studi", title: "Software per palestra per organizzare coach, clienti e programmi", intro: "BoostYourLife.coach aiuta palestre, studi e strutture sportive a centralizzare coach, clienti, programmi e documenti.", bullets: ["Account coach collegati alla struttura", "Vista responsabile sull'attività globale", "Programmi e documenti armonizzati", "Organizzazione adatta a studi e club"], stat: "Organizzazione più chiara per la palestra", sections: [["Gestione più semplice", "La struttura mantiene una vista chiara su coach, clienti, programmi e azioni recenti."], ["Esperienza più omogenea", "Documenti e programmi prodotti dal team restano coerenti con l'identità della palestra."]] },
  },
  ru: {
    "logiciel-coach-sportif": { eyebrow: "Спортивные тренеры", title: "ПО для спортивного тренера: программы и контроль прогресса", intro: "BoostYourLife.coach объединяет клиентов, программы, тренировки, подтверждения и экспорты в одном понятном рабочем пространстве.", bullets: ["Создание персональных тренировочных программ", "Отслеживание тренировок, прогресса и отзывов клиентов", "PDF-экспорты и личный кабинет клиента", "Структурированная база упражнений для быстрой работы"], stat: "Программы, клиенты и тренировки в одном месте", sections: [["Инструмент для ежедневной практики", "Тренер видит активных клиентов, программы, запланированные тренировки и последние действия."], ["Более профессиональный клиентский опыт", "Документы, экспорты и обратная связь становятся понятнее и усиливают ценность сопровождения."]] },
    "application-coach-sportif": { eyebrow: "Приложение для тренера", title: "Приложение для спортивного тренера для ежедневного сопровождения клиентов", intro: "BoostYourLife.coach помогает создавать программы, делиться тренировками, отслеживать прогресс и сохранять простой клиентский кабинет.", bullets: ["Программы доступны из кабинета клиента", "Тренировки с упражнениями, подходами и отдыхом", "Прогресс, подтверждения и отзывы в одном месте", "Понятный интерфейс для онлайн- и очного коучинга"], stat: "Веб-приложение для более ясного коучинга", sections: [["Более плавное сопровождение", "Тренер быстро находит программы, тренировки и отзывы без разрозненных данных."], ["Понятный опыт для клиента", "Клиент знает, что делать, в каком порядке и где найти свои материалы."]] },
    "logiciel-suivi-client-coach": { eyebrow: "Сопровождение клиентов", title: "ПО для отслеживания клиентов тренером", intro: "BoostYourLife.coach собирает данные клиентов, программы, тренировки, оценки, документы и историю, чтобы управлять каждым сопровождением.", bullets: ["Общий обзор активных клиентов", "История программ и подтверждений", "Спортивное и нутриционное сопровождение по подключенным услугам", "Документы и экспорты в одном месте"], stat: "Понятное и полезное сопровождение клиента", sections: [["Меньше потерянной информации", "Специалист быстро видит, что было сделано, отправлено и подтверждено с каждым клиентом."], ["Проще принимать решения", "Отзывы, прогресс и данные помогают корректировать следующий цикл."]] },
    "application-coaching-nutrition": { eyebrow: "Питание", title: "Приложение для нутриционного коучинга: оценки, меню и сопровождение", intro: "BoostYourLife.coach помогает специалистам по питанию вести оценки, рационы, меню, рецепты, списки покупок и обмен с клиентом.", bullets: ["Нутриционные оценки и карточки клиентов", "Рационы, дневные меню и рецепты", "Контролируемая передача в кабинет клиента", "История сопровождения и цели питания"], stat: "Оценки, меню и документы по питанию централизованы", sections: [["Более структурированное сопровождение питания", "Данные, цели и привычки клиента остаются в одном месте для точной корректировки."], ["Материалы проще передавать", "Платформа помогает создавать понятные документы, адаптированные к контексту клиента."]] },
    "logiciel-nutritionniste": { eyebrow: "Нутрициологи", title: "ПО для нутрициолога: оценки, рационы и меню клиентов", intro: "BoostYourLife.coach структурирует оценки питания, цели, рационы, меню, рецепты и списки покупок в пространстве, которым можно делиться.", bullets: ["Нутриционные оценки и карточки клиентов", "Цели, привычки и данные сопровождения", "Дневные меню, рецепты и списки покупок", "Контролируемый доступ для клиента"], stat: "Понятная база для сопровождения питания", sections: [["Оценки легче использовать", "Важная информация остается структурированной и помогает делать корректировки."], ["Практичные материалы для клиента", "Меню, рецепты и списки покупок легче просматривать и применять."]] },
    "logiciel-coach-sportif-nutrition": { eyebrow: "Спорт + питание", title: "ПО для спортивного и нутриционного коучинга полного цикла", intro: "BoostYourLife.coach объединяет спортивный коучинг, питание, сопровождение клиентов, программы и документы для гибридных специалистов.", bullets: ["Модули спорта и питания в одном пространстве", "Клиентская панель по активным услугам", "Персональные программы, оценки и документы", "Сопровождение для гибридных и независимых тренеров"], stat: "Единое представление о каждом клиенте", sections: [["Спорт и питание без разрозненных инструментов", "Специалист ведет тренировки, пищевые привычки и документы в одном месте."], ["Более понятное предложение", "Клиент находит программы, материалы и информацию в едином опыте."]] },
    "logiciel-club-sport": { eyebrow: "Клубы и студии", title: "ПО для спортивного клуба: тренеры, клиенты и программы", intro: "BoostYourLife.coach предлагает лицензию Club для студий, залов, структур и команд с несколькими специалистами.", bullets: ["Профессиональные аккаунты привязаны к клубу", "Руководитель видит тренеров, клиентов и активность", "Возможности для студий, клубов и сетей", "Логотип и документы клуба по выбранному пакету"], stat: "Понятный контроль для всей структуры", sections: [["Обзор для руководителя", "Клуб отслеживает общую активность, специалистов, клиентов и созданные программы."], ["Прочная база для роста", "Пакеты Club помогают организовать команду и унифицировать документы."]] },
    "logiciel-salle-de-sport": { eyebrow: "Залы и студии", title: "ПО для фитнес-зала: организация тренеров, клиентов и программ", intro: "BoostYourLife.coach помогает залам, студиям и спортивным структурам централизовать тренеров, клиентов, программы и документы сопровождения.", bullets: ["Аккаунты тренеров привязаны к структуре", "Обзор общей активности для руководителя", "Унифицированные программы и документы", "Организация для студий и клубов"], stat: "Более понятная организация для зала", sections: [["Проще управлять", "Структура сохраняет ясный обзор тренеров, клиентов, программ и последних действий."], ["Более единый опыт", "Документы и программы команды остаются согласованными с идентичностью зала."]] },
  },
  ar: {
    "logiciel-coach-sportif": { eyebrow: "مدربون رياضيون", title: "برنامج للمدرب الرياضي لإنشاء البرامج ومتابعتها", intro: "يجمع BoostYourLife.coach العملاء والبرامج والحصص والموافقات والتصديرات في مساحة عمل واضحة للاستخدام اليومي.", bullets: ["إنشاء برامج تدريب مخصصة", "متابعة الحصص والتقدم وملاحظات العملاء", "تصدير PDF ومساحة خاصة للعميل", "مكتبة تمارين منظمة للعمل بسرعة أكبر"], stat: "البرامج والعملاء والحصص في مكان واحد", sections: [["أداة مصممة للعمل الميداني", "يحافظ المدرب على رؤية واضحة للعملاء النشطين والبرامج والحصص والإجراءات الأخيرة."], ["تجربة أكثر احترافية للعميل", "تصبح المستندات والتصديرات والملاحظات أوضح وتزيد قيمة المتابعة."]] },
    "application-coach-sportif": { eyebrow: "تطبيق للمدرب الرياضي", title: "تطبيق للمدرب الرياضي لمتابعة العملاء يوميا", intro: "يساعد BoostYourLife.coach المدربين على إنشاء البرامج ومشاركة الحصص وتتبع التقدم والحفاظ على مساحة عميل بسيطة.", bullets: ["البرامج متاحة من مساحة العميل", "حصص منظمة مع تمارين ومجموعات وفترات راحة", "التقدم والموافقات والملاحظات في مكان واحد", "واجهة واضحة للتدريب عن بعد أو حضوريا"], stat: "تطبيق ويب لتدريب أوضح", sections: [["متابعة أكثر سلاسة", "يجد المدرب البرامج والحصص وملاحظات العملاء دون تشتيت المعلومات."], ["تجربة عميل أوضح", "يعرف العميل ما يجب فعله وبأي ترتيب وأين يجد محتواه."]] },
    "logiciel-suivi-client-coach": { eyebrow: "متابعة العملاء", title: "برنامج متابعة العملاء للمدربين", intro: "يجمع BoostYourLife.coach بيانات العملاء والبرامج والحصص والتقييمات والمستندات والسجل لإدارة كل متابعة.", bullets: ["رؤية عامة للعملاء النشطين", "سجل البرامج والموافقات", "متابعة رياضية وتغذوية حسب الخدمات", "المستندات والتصديرات في مكان واحد"], stat: "متابعة عميل واضحة وقابلة للاستخدام", sections: [["معلومات أقل ضياعا", "يجد المختص بسرعة ما تم إنجازه ومشاركته وتأكيده مع كل عميل."], ["قرارات أسهل", "تساعد الملاحظات والتقدم وبيانات المتابعة على ضبط الدورة التالية."]] },
    "application-coaching-nutrition": { eyebrow: "التغذية", title: "تطبيق تدريب تغذوي للتقييمات والقوائم والمتابعة", intro: "يدعم BoostYourLife.coach مختصي التغذية بالتقييمات والحصص الغذائية والقوائم والوصفات وقوائم التسوق ومشاركة العميل.", bullets: ["تقييمات تغذوية وملفات عملاء", "حصص غذائية وقوائم يومية ووصفات", "مشاركة مضبوطة نحو مساحة العميل", "سجل متابعة وأهداف تغذوية"], stat: "التقييمات والقوائم ومستندات التغذية في مكان واحد", sections: [["متابعة تغذوية أكثر تنظيما", "تبقى بيانات العميل وأهدافه وعاداته في مكان واحد لتسهيل التعديل."], ["مستندات أسهل في المشاركة", "تساعد المنصة على إنتاج مستندات واضحة ومناسبة لسياق العميل."]] },
    "logiciel-nutritionniste": { eyebrow: "مختصو التغذية", title: "برنامج لمختصي التغذية للتقييمات والحصص والقوائم", intro: "ينظم BoostYourLife.coach تقييمات التغذية والأهداف والحصص والقوائم والوصفات وقوائم التسوق في مساحة قابلة للمشاركة.", bullets: ["تقييمات تغذوية وملفات عملاء", "أهداف وعادات وبيانات متابعة", "قوائم يومية ووصفات وقوائم تسوق", "مشاركة مضبوطة نحو مساحة العميل"], stat: "قاعدة واضحة لمتابعة التغذية", sections: [["تقييمات أكثر قابلية للاستخدام", "تبقى المعلومات المهمة منظمة لتسهيل التعديلات."], ["دعم عملي للعميل", "تصبح القوائم والوصفات وقوائم التسوق أسهل في القراءة والتطبيق."]] },
    "logiciel-coach-sportif-nutrition": { eyebrow: "رياضة + تغذية", title: "برنامج للتدريب الرياضي والتغذوي لمتابعة كاملة", intro: "يجمع BoostYourLife.coach التدريب الرياضي والتغذية ومتابعة العملاء والبرامج والمستندات للمهنيين ذوي الخدمات المختلطة.", bullets: ["وحدات رياضة وتغذية في مساحة واحدة", "لوحة عميل حسب الخدمات المفعلة", "برامج وتقييمات ومستندات مخصصة", "متابعة مناسبة للمدربين المستقلين ومتعددي الاختصاص"], stat: "رؤية موحدة لكل عميل تتم متابعته", sections: [["رياضة وتغذية دون تشتيت", "يتابع المختص التدريب والعادات الغذائية والمستندات دون تعدد الأدوات."], ["عرض أوضح للعميل", "يجد العميل البرامج والدعم والمعلومات في تجربة متناسقة."]] },
    "logiciel-club-sport": { eyebrow: "أندية وقاعات", title: "برنامج للأندية الرياضية لإدارة المدربين والعملاء والبرامج", intro: "يوفر BoostYourLife.coach رخصة Club للاستوديوهات والقاعات والهياكل والفرق التي تضم عدة مختصين.", bullets: ["حسابات مهنية مرتبطة بالنادي", "رؤية مسؤول للمدربين والعملاء والنشاط", "قدرات مناسبة للاستوديوهات والأندية والشبكات", "شعار النادي ومستنداته حسب الباقة"], stat: "إشراف واضح على كامل الهيكل", sections: [["رؤية للمسؤول", "يتابع النادي النشاط العام والمختصين المرتبطين والعملاء والبرامج المنشأة."], ["قاعدة قوية للنمو", "تساعد باقات Club على تنظيم الفريق وتوحيد المستندات المنتجة."]] },
    "logiciel-salle-de-sport": { eyebrow: "قاعات واستوديوهات", title: "برنامج لصالة الرياضة لتنظيم المدربين والعملاء والبرامج", intro: "يساعد BoostYourLife.coach الصالات والاستوديوهات والهياكل الرياضية على مركزية المدربين والعملاء والبرامج ومستندات المتابعة.", bullets: ["حسابات المدربين مرتبطة بالهيكل", "رؤية مسؤول للنشاط العام", "برامج ومستندات موحدة", "تنظيم مناسب للاستوديوهات والأندية"], stat: "تنظيم أوضح للصالة", sections: [["إدارة أبسط", "يحافظ الهيكل على رؤية واضحة للمدربين والعملاء والبرامج والإجراءات الأخيرة."], ["تجربة أكثر اتساقا", "تبقى مستندات وبرامج الفريق منسجمة مع هوية الصالة."]] },
  },
};

const localizedCopy = (page, language = "fr", slug = "") => {
  const base = String(language || "fr").split("-")[0].toLowerCase();
  return page[base] || RESOURCE_TRANSLATIONS[base]?.[slug] || page.en || page.fr;
};

export default function SeoLandingPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation("common");
  const page = PAGE_COPY[slug];
  const theme = useAppTheme();

  if (!page) return <Navigate to="/" replace />;

  const copy = localizedCopy(page, i18n.resolvedLanguage || i18n.language, slug);
  const IconComponent = page.icon;
  const currentPath = `/${slug}`;
  const seoRoute = SEO_ROUTES[currentPath];
  const relatedLinks = SEO_PUBLIC_LINKS.filter((link) =>
    link.href !== currentPath &&
    [
      "/plans/professionnel",
      "/logiciel-coach-sportif",
      "/application-coach-sportif",
      "/logiciel-suivi-client-coach",
      "/application-coaching-nutrition",
      "/logiciel-nutritionniste",
      "/logiciel-coach-sportif-nutrition",
      "/logiciel-club-sport",
      "/logiciel-salle-de-sport",
    ].includes(link.href)
  ).slice(0, 5);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  return (
    <Box bg={theme.pageBg} minH="100vh">
      <Box
        position="relative"
        overflow="hidden"
        minH={{ base: "620px", md: "680px" }}
        display="flex"
        alignItems="center"
        _before={{
          content: '""',
          position: "absolute",
          inset: 0,
          backgroundImage: 'url("/hero-bg.png")',
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "saturate(0.9)",
        }}
        _after={{
          content: '""',
          position: "absolute",
          inset: 0,
          background: "linear-gradient(110deg, rgba(2,6,23,0.92), rgba(15,23,42,0.78) 48%, rgba(15,23,42,0.36))",
        }}
      >
        <Button
          position="absolute"
          top={{ base: 5, md: 8 }}
          left={{ base: 4, md: 8 }}
          zIndex={2}
          leftIcon={<ArrowBackIcon />}
          onClick={goBack}
          variant="ghost"
          color="white"
          bg="whiteAlpha.100"
          border="1px solid"
          borderColor="whiteAlpha.300"
          borderRadius="full"
          _hover={{ bg: "whiteAlpha.200" }}
        >
          {t("programView.back", "Retour")}
        </Button>
        <Container maxW="6xl" position="relative" zIndex={1} py={{ base: 16, md: 20 }}>
          <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={{ base: 10, lg: 14 }} alignItems="center">
            <VStack align="start" spacing={6}>
              <Badge bg="whiteAlpha.200" color="white" borderRadius="full" px={3} py={1}>
                {copy.eyebrow}
              </Badge>
              <Heading as="h1" color="white" lineHeight="1.02" fontSize={{ base: "2.7rem", md: "4.6rem" }} maxW="820px">
                {copy.title}
              </Heading>
              <Text color="whiteAlpha.900" fontSize={{ base: "lg", md: "xl" }} lineHeight="1.75" maxW="700px">
                {copy.intro}
              </Text>
              <HStack spacing={3} flexWrap="wrap">
                <Button as={RouterLink} to={seoHrefForPath("/plans/professionnel")} {...theme.primaryButtonProps}>
                  {t("seoLanding.ctaPlans", "Voir les offres pro")}
                </Button>
                <Button as={RouterLink} to={seoHrefForPath("/contact")} variant="outline" color="white" borderColor="whiteAlpha.500" _hover={{ bg: "whiteAlpha.200" }}>
                  {t("seoLanding.ctaDemo", "Demander une demo")}
                </Button>
              </HStack>
            </VStack>

            <Box
              border="1px solid rgba(255,255,255,0.18)"
              borderRadius="28px"
              bg="rgba(15,23,42,0.68)"
              backdropFilter="blur(18px)"
              p={{ base: 5, md: 7 }}
              boxShadow="0 30px 90px rgba(0,0,0,0.35)"
            >
              <VStack align="stretch" spacing={5}>
                <HStack spacing={4}>
                  <Box display="grid" placeItems="center" boxSize="54px" borderRadius="18px" bg={page.accent} color="white">
                    <Icon as={IconComponent} boxSize={7} />
                  </Box>
                  <Box>
                    <Text color="white" fontWeight="900" fontSize="lg">
                      BoostYourLife.coach
                    </Text>
                    <Text color="whiteAlpha.700" fontSize="sm">
                      {copy.stat}
                    </Text>
                  </Box>
                </HStack>
                <Box
                  as="img"
                  src="/Mockup.jpg"
                  alt=""
                  borderRadius="18px"
                  border="1px solid rgba(255,255,255,0.14)"
                  loading="lazy"
                  decoding="async"
                />
              </VStack>
            </Box>
          </SimpleGrid>
        </Container>
      </Box>

      <Box py={{ base: 10, md: 14 }} px={{ base: 4, md: 6 }}>
        <Container maxW="6xl">
          <SimpleGrid columns={{ base: 1, md: 4 }} spacing={4} mb={{ base: 10, md: 14 }}>
            {copy.bullets.map((item) => (
              <HStack key={item} align="start" spacing={3} p={4} borderTop="3px solid" borderColor={page.accent}>
                <Icon as={CheckCircleIcon} color={page.accent} mt={1} />
                <Text fontWeight="700">{item}</Text>
              </HStack>
            ))}
          </SimpleGrid>

          <Stack direction={{ base: "column", md: "row" }} spacing={{ base: 8, md: 12 }} align="start">
            {copy.sections.map(([title, text]) => (
              <Box key={title} flex="1">
                <Heading as="h2" size="lg" mb={4}>
                  {title}
                </Heading>
                <Text color={theme.mutedText} fontSize="lg" lineHeight="1.8">
                  {text}
                </Text>
              </Box>
            ))}
          </Stack>

          {seoRoute?.faqs?.length ? (
            <Box mt={{ base: 12, md: 16 }}>
              <Heading as="h2" size="lg" mb={6}>
                {t("seoLanding.faqTitle", "Questions fréquentes")}
              </Heading>
              <SimpleGrid columns={{ base: 1, md: 2 }} spacing={5}>
                {seoRoute.faqs.map((item) => (
                  <Box key={item.question} borderTop="1px solid" borderColor={theme.borderColor} pt={5}>
                    <Heading as="h3" size="md" mb={3}>
                      {item.question}
                    </Heading>
                    <Text color={theme.mutedText} lineHeight="1.8">
                      {item.answer}
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
            </Box>
          ) : null}

          <Box mt={{ base: 12, md: 16 }}>
            <Heading as="h2" size="md" mb={4}>
              {t("seoLanding.relatedTitle", "Explorer aussi")}
            </Heading>
            <HStack spacing={3} flexWrap="wrap">
              {relatedLinks.map((link) => (
                <Button key={link.href} as={RouterLink} to={seoHrefForPath(link.href)} variant="outline" size="sm">
                  {link.label}
                </Button>
              ))}
            </HStack>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
