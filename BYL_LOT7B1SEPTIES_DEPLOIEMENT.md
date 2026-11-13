# Lot 7B.1 SEPTIES — conditions avant déploiement

## État actuel

**Aucun déploiement autorisé ou effectué. P0-4 reste ouvert.** Le nettoyage est désactivé par défaut ; le mécanisme livré refuse en plus toute exécution hors développement loopback / projet demo / émulateurs. Aucune variable d’environnement de production n’a été ajoutée ou modifiée.

Les flags de qualification sont `VITE_CACHE_MIGRATION_CLEANUP=true` côté frontend et `BYL_CACHE_MIGRATION_CLEANUP=true` côté backend. Ils sont utilisés uniquement dans la copie de test. `VITE_BUILD_ID` identifie la version coopérante ; le protocole d’API est distinct de l’identité du build. Ni le flag ni le build ne sont une autorisation d’accès aux données.

## Ce qui peut être évalué dans la branche

Détection en métadonnées, bannière après admission, provenance et reçus protégés, droits partagés avec ProgramBuilder, import non publié, coordination, journal et nettoyage synthétique ciblé. Aucune route publique ne crée des preuves ou qualifie des plans.

En l’absence de provenance serveur, l’application doit annoncer que la récupération automatique est impossible. Les anciens brouillons ne deviennent pas récupérables parce que cette version du code existe. Le service ne doit pas déduire une disposition de suppression depuis un UID, un TTL ou la déclaration du navigateur.

## Décisions nécessaires

1. **Provenance** : définir l’autorité et les preuves effectivement disponibles pour chaque format réel ; ne pas fabriquer de manifeste rétroactif sans justification fiable.
2. **Données uniques** : qualifier séparément les mutations Firestore et les brouillons non attribuables. Prévoir récupération ou décision explicite d’abandon, sans lecture par le compte suivant.
3. **Plans et reçus** : définir procédure d’approbation, propriétaire du périmètre, origine, durée, rétention, pagination, audit et nouvelle qualification après édition/publication ou recontamination.
4. **Anciennes versions** : établir le protocole opérationnel de fermeture des anciens onglets, clients contrôlés par workers et sessions restaurées. Une application web seule ne peut pas prouver leur absence globale.
5. **Zones non prises en charge** : cataloguer Cache Storage, Service Workers et formats secondaires historiques. Ils bloquent actuellement la suppression plutôt que de subir une purge large.
6. **Hors ligne et démarrage** : qualifier l’échec observé lors d’une coupure très précoce du shell complet, ainsi que les navigateurs réellement utilisés. Le succès du parcours stabilisé ne suffit pas.
7. **Production** : revoir explicitement les restrictions techniques de qualification avant toute éventuelle activation réelle. Ne pas supprimer les garde-fous pour « faire fonctionner » un plan non qualifié.

Les risques P0-3 de révocation Auth externe et les conditions de sécurité/préproduction des lots antérieurs restent applicables. Les tests présents ne constituent pas une validation générale de publication.

## Retour arrière

Ne pas revenir à une version qui relit ou écrit les caches privés en clair. Avant suppression, les données héritées restent en quarantaine. Après suppression réelle, aucun rollback local n’est garanti ; seules les copies autorisées et confirmées côté serveur peuvent être reprises. Aucune sauvegarde de données personnelles n’est créée dans ce lot.

En cas de problème lors d’une future qualification, conserver les lecteurs privés en mémoire, désactiver les actions de récupération/nettoyage concernées et maintenir l’état incomplet. Une suppression IndexedDB déjà émise ne peut pas être considérée annulée sur la seule base d’un timeout.

## Arrêt

Livraison limitée au Lot SEPTIES. Attendre validation explicite avant toute suite, intégration additionnelle, modification des règles, migration réelle ou déploiement. Aucune purge de profil utilisateur n’est autorisée implicitement par les résultats des tests.
