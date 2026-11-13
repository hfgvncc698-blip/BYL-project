# Lot 7B.1 OCTIES — performances

Mesures locales, un passage final de chaque banc, Chrome headless/Vite de développement, émulateurs Auth/Firestore. Ce ne sont ni des percentiles, ni des mesures de production, ni une preuve de gain statistique. OCTIES ajoute sept contrôles au banc SEPTIES : les totaux de parcours ne sont pas directement comparables comme coût par utilisateur.

## Scénarios communs (millisecondes)

| Scénario | SEPTIES | OCTIES |
|---|---:|---:|
| Admission et Builder (après chargement initial du banc) | 219.4 | 149.2 |
| Détection métadonnées | 13.5 | 2.0 |
| Import confirmé + reçu | 158.0 | 161.3 |
| Autosauvegarde (inclut debounce 900 ms) | 1083.0 | 967.1 |
| Synchronisation au retour réseau | 127.9 | 127.0 |
| Proposition du brouillon après réouverture | 103.9 | 105.3 |
| Reprise/vérification du plan après redémarrage | 156.1 | 173.6 |

La durée « admission et Builder » commence après le chargement du contexte de test et ne mesure pas le premier octet de connexion ni le cold start complet du navigateur. Le retour au Builder sous réseau ralenti dure 2638,3 ms ; coupure de restauration et reprise explicite 265,7 ms. Aucun SLA de connexion ou premier affichage n’est déduit de ces valeurs. Pas de benchmark autonome du retour chaud de tous les Dashboards.

## Coûts migration uniquement

| Mesure | SEPTIES | OCTIES |
|---|---:|---:|
| Appels HTTP | 31 | 33 |
| Opérations SDK documentaires | 247 | 269 |
| Documents retournés | 166 | 182 |
| Lectures documentaires estimées | 247 | 269 |
| Écritures de migration confirmées | 11 | 12 |

Le scénario Service Worker ajoute une autorisation et un checkpoint par rapport à SEPTIES. L’import crée toujours un brouillon et un reçu ; le retry n’en crée pas de second. Les autres écritures sont les checkpoints. Les écritures de fixtures et les sauvegardes normales de programmes ne font pas partie de ce total migration.

Le nouveau composant de chargement ne lit/écrit aucun document Firestore. no-store n’ajoute pas de requête applicative ; il peut supprimer une réutilisation du cache HTTP disque. Les caches mémoire et le coordinateur de requêtes restent actifs. Les appels Firestore navigateur de toute l’application ne sont pas comptabilisés exhaustivement par ces lignes backend ; aucune valeur n’est présentée comme mesure réelle de facturation.

## Ressources du parcours

- SEPTIES : heap utilisé 61444184 octets ; heap total 72564736 ; réseau CDP cumulé 58320337 octets.
- OCTIES : heap utilisé 61543284 octets ; heap total 73089024 ; réseau CDP cumulé 58528984 octets.

Ces relevés incluent le code Vite, les navigations, erreurs injectées et onglets du banc. Ce ne sont pas une mémoire maximale ni le trafic d’une visite de production. L’écart de parcours exclut une comparaison causale de ces totaux.

Build final et tous les budgets respectés (CoachDashboard ~70,0 KiB, Clientdashboard ~34,8 KiB, SessionPlayer ~37,3 KiB). Smoke global : 53 contrôles. Pas de modification des stratégies de cache des Lots 1 à 6 ni de mesure permettant de leur attribuer un gain supplémentaire. La navigation réelle vers About ne déclenche aucun polling HTTP de migration.

Avant publication : mesures répétées sur build distribué, appareils cibles, démarrage complet, trafic privé HTTP/médias et coût total SDK navigateur. Les essais actuels préservent les invariants mais ne remplacent pas cette qualification.
