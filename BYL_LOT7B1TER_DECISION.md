# Lot 7B.1 TER — décision proposée

## Recommandation

Retenir **A+D comme comportement de base** pour une future intégration. Connexion Firebase habituelle, programme autorisé en mémoire, brouillon enregistré automatiquement sur serveur quand le réseau est disponible, travail hors ligne dans la session ouverte. Aucun second mot de passe BYL.

Afficher explicitement la portée de la sauvegarde. « Enregistré localement » signifie dans l’onglet pour ce mode, pas une garantie après fermeture. Un brouillon non synchronisé peut être perdu à la fermeture, au crash ou au changement de compte. Une sauvegarde serveur réussie peut être récupérée après nouvelle authentification et contrôle des droits.

Conserver **B/C comme option conditionnelle** à qualifier sur appareils réels. Une vérification biométrique/appareil peut éviter un second mot de passe, mais ne doit pas être présentée comme un déverrouillage automatique ni comme une séparation entre comptes BYL lorsqu’ils partagent aussi les moyens de déverrouillage OS.

## États utilisateur

| État | Signification | Suite |
|---|---|---|
| Enregistré localement | Modification capturée dans la mémoire de la session | Débounce puis tentative de sauvegarde |
| En attente de synchronisation | Modification non confirmée par BYL, réseau absent ou envoi à déclencher | Conserver version et contenu, reprendre à la reconnexion |
| Synchronisé avec BYL | Accusé serveur reçu pour cette opération et cette version du brouillon | Programme canonique inchangé, brouillon récupérable |
| Conflit à résoudre | Programme ou brouillon distant modifié depuis la base locale | Conserver les deux versions, demander une résolution explicite |
| Échec de sauvegarde | Erreur serveur/transport pendant une tentative | Conserver copie locale et proposer/reprendre une tentative |

Le prototype présente ces états dans son DOM de diagnostic. L’interface de comparaison/fusion et la protection utilisateur contre la fermeture ne sont pas implémentées. Aucun bouton ne doit faire croire qu’une opération hors ligne a déjà été confirmée.

## Conditions avant intégration

- Valider le compromis A+D et les messages de perte potentielle, notamment pour les onglets qui changent d’identité.
- Concevoir l’intégration du registre de caches et le remplacement de l’instance Firestore à chaque transition. Ne pas connecter ce prototype à toutes les pages sans tests ciblés.
- Préparer séparément la migration des copies privées héritées et la récupération des brouillons, toujours sans suppression non validée.
- Durcir l’API de brouillons, erreurs, sérialisation, conflits simultanés, limites, règles d’accès et rétention de l’idempotence avant déploiement.
- Qualifier les navigateurs desktop/mobile et appareils. Activer PRF uniquement après un vrai cycle création, fermeture, déverrouillage et restauration hors ligne avec vérification de séparation des utilisateurs.
- Rejouer la matrice P0-4 dans BYL intégré, y compris nutrition, programmes, messages, Club et accès disque brut. Le prototype ne permet pas de lever le blocage production.

## Arrêt

Le Lot TER s’arrête au prototype et aux rapports. Aucune migration, activation de fonctionnalités BYL, modification des règles ou publication. Attendre validation avant la suite.
