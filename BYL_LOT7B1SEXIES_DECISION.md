# Lot 7B.1 SEXIES — décision

## Résultat technique

Le pilote de récupération et nettoyage est construit et exécuté sur données synthétiques. Il dépasse le modèle QUINQUIES par une authentification Firebase émulée, des contrôles et reçus Firestore transactionnels, une proposition avec confirmation explicite et une coordination effective des onglets actuels.

**P0-4 n’est pas déclaré corrigé pour BYL ou le parc utilisateur. La production reste bloquée.** Le pilote démontre l’absence API-visible des stockages ciblés après fermeture/redémarrage d’un profil dont il maîtrise entièrement le cycle de vie. Il ne démontre pas une migration sans perte sur les navigateurs réels.

## Conditions non négociables

- Ne récupérer que des données à provenance démontrable, sous identité et droits actuels. Les anciens formats sans preuve restent refusés.
- Ne jamais publier automatiquement un programme ou convertir une mutation métier en validation automatique.
- Préserver les originaux jusqu’au reçu vérifié ; traiter toute donnée unique inconnue comme bloquante avant purge réelle.
- Un ACK d’onglet, un TTL ou une valeur locale « terminé » n’autorise pas la conclusion globale.
- Sans preuve externe de fermeture des anciens contextes et de non-recontamination, conserver le statut provisoire et bloquer la fin.
- Ne pas utiliser les fixtures, leurs endpoints de connexion ou leurs booléens de disposition comme code de migration de production.

## Suite proposée, non engagée

Une validation de ce résultat technique peut autoriser une **conception d’intégration distincte**, mais ne doit pas valoir autorisation de purge. Cette conception doit préciser : provenance réellement disponible, ensemble des droits BYL concernés, reçu durable et rétention, catalogue des versions historiques, disposition de chaque copie unique, traitement des onglets restaurés et mécanisme opérationnel de fermeture contrôlée.

Toute future migration réelle nécessite ensuite une validation explicite de son périmètre et de ses pertes potentielles. Si l’origine d’un brouillon ne peut pas être prouvée, le pilote ne permet pas de le récupérer ; s’il s’agit de la seule copie, la perte ne peut pas être masquée par un message de succès.

Les limites de révocation Auth externe P0-3, les autres qualifications de production et les risques antérieurs restent applicables. Aucun traitement P1/P2/P3, aucune modification des règles, aucun déploiement. Arrêt à la livraison des six rapports ; attendre validation avant toute intégration ou migration réelle.
