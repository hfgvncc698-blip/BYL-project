# Lot 8A — causes et corrections

Branche `codex/firebase-performance-audit`. Travail local sur émulateurs et comptes synthétiques ; aucun déploiement.

## Causes démontrées et corrections intégrées

### Page Clients : enrichissement de toutes les lignes

La liste affichait déjà 25 clients, mais `fetchData` parcourait tous les dossiers par lots séquentiels de 25 pour demander leurs indicateurs. À 500 clients, l’avant montre 20 appels de résumés et 500 écritures initiales de vues serveur, alors que seule la première page était visible. Le contenu nominatif arrivait avant les statistiques : il ne fallait pas assimiler les deux timings.

`selectClientMetricRows` limite désormais l’enrichissement à la page visible dans la vue générale. Changement de page et recherche recalculent les seuls identifiants consultés via la source autorisée existante, sa déduplication et son cache. Un résumé incomplet est marqué `partial` pour ne pas être réutilisé comme un aperçu global complet. Les filtres dépendant de l’activité, des programmes ou de la nutrition conservent leur parcours exhaustif : aucun résultat filtré approximatif.

La première admission peut présenter plusieurs états successifs du répertoire : les mesures peuvent donc enrichir 31 dossiers, plutôt que strictement 25 sur tout le démarrage. Chaque sélection reste bornée à la page.

Les racines du répertoire sont encore chargées complètement pour préserver recherche et autorisation historique. Cette modification est une pagination de l’enrichissement, **pas** une pagination serveur complète du répertoire. Les contrôles serveur, lectures de versions et permissions ne changent pas.

### Messagerie : montage de toutes les conversations

MessagingContactList montait une ligne React complète, avatar, gestes et actions pour chaque contact. La référence à 100 conversations monte plusieurs milliers de composants ; le stress à 1 000 a bloqué le renderer au-delà du délai du banc. L’API d’inbox et le rendu ne doivent pas être confondus.

La page Messages demande désormais un premier rendu de 50 lignes, puis « Afficher davantage » par incréments de 50. La recherche s’applique toujours à la source complète, avant cette limitation. Le contact d’un lien direct reste rendu : une sélection très éloignée peut donc encore demander un grand rendu. Les autres consommateurs du composant conservent par défaut la liste complète. Les accusés, autorisations, réception, annuaire explicite et pagination des messages ne changent pas. Cette correction réduit le travail React, pas les lectures de l’inbox.

### Notifications initiales en rafale

La cause dominante du blocage à 1 000 conversations est aussi dans DashboardMessagingBubble : son callback crée un toast pour chaque conversation non lue, même sur la page Messages où la bulle est invisible. Le test exécute le callback réellement extrait des sources : 1 000 toasts avant, 1 après. Au-delà de trois conversations nouvelles dans le même lot, une notification donne le nombre et ouvre la messagerie. Les lots de une à trois gardent leurs notifications individuelles. Toutes les versions sont toujours marquées dans la mémoire de déduplication, sans modifier les accusés de lecture, badges ou permissions. Aucun toast ne lit Firestore.

Le rendu progressif de la liste seul ne suffisait pas : ce résultat intermédiaire en échec est conservé, et n’est pas présenté comme une correction réussie des grandes inbox.

### Navigation mobile cachée sur desktop

Les trois navigations mobiles étaient montées puis masquées par CSS à partir du breakpoint `md`. Le shell évite maintenant leur montage sur desktop, avec une media query réactive alignée sur leur CSS. Elles réapparaissent après redimensionnement vers mobile. Les droits et la sélection des routes restent identiques ; aucun appel Firebase ajouté.

## Causes restantes identifiées

- Dashboard Coach : programmes de tous les clients et requêtes de nutrition même quand les collections sont vides. Les indicateurs globaux et le radar en dépendent ; les supprimer sans projection fiable changerait les résultats métier.
- Dashboard Client : écoute des historiques canoniques ; volume transféré et calculs augmentent avec le nombre de validations. Aucun résumé approximatif ne remplace le calcul exact dans ce lot. Le stress exploratoire 20 × 1 000 est distinct de la matrice principale dont l’historique total est réparti entre programmes.
- Club : les synthèses et leurs contrôles peuvent encore parcourir de nombreux dossiers. La présente optimisation ne requalifie pas leur autorisation.
- Grandes inbox : vérification et chargement de la source restent coûteux même si le rendu est borné. Les risques documentés des Lots 2 restent applicables.
- Auth : la confirmation du profil est nécessaire avant affichage privé. Le banc conserve AuthProvider, le SDK mémoire et le contrôle serveur réels. Aucun gain obtenu en supprimant cette admission.
- Lot 7 : la détection de stockage est en métadonnées, sans requête automatique de découverte/import. Les brouillons concernent ProgramBuilder, pas l’ensemble des Dashboards. Les contrôles de droits ne sont pas remplacés par un cache.

## Fichiers applicatifs

`src/components/Clients.jsx`, `src/utils/clientVisibleMetrics.js`, `src/App.jsx`, `src/pages/MessagingPage.jsx`, `src/components/messaging/MessagingContactList.jsx`, `src/components/messaging/DashboardMessagingBubble.jsx`.

Les modifications déjà présentes des Lots 7 sont conservées. Les runners intégrés incluent le nouveau fichier utilitaire dans leurs copies temporaires. Le test de livraison de programme payé a été réparé pour injecter son véritable validateur `assertProgramSize` dans son contexte VM ; aucun code de paiement modifié.

Les sept catalogues `src/i18n/locales/{fr,en,es,de,it,ru,ar}/common.json` ajoutent les libellés de notification groupée et d’affichage supplémentaire. Les modifications applicatives antérieures visibles dans le diff Git ne sont pas attribuées au Lot 8A.
