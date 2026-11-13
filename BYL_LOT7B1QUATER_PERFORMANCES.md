# Lot 7B.1 QUATER — performances et coûts

## Méthode

Mesures du 10 novembre 2026, Chrome local, serveur Vite de développement, émulateurs Firebase, fixture synthétique de programmes. Résultats individuels et lectures mesurées dans `audits/lot7b1quater/results.json`. Le baseline `5bdcd1b` reproduit la confidentialité et les comportements de cache ; **pas de benchmark temporel avant/après complet des Dashboards Lots 1–6**. Aucun chiffre de facturation réelle.

Les durées ci-dessous sont celles des scénarios de test, incluant leurs attentes de contrôle, et ne constituent pas des percentiles ni des garanties de production. L’ouverture commence avec le framework de fixture chargé ; ce n’est pas un cold start réseau de BYL.

| Scénario après correction | Durée observée |
|---|---:|
| Admission AuthProvider et ouverture nouveau Builder | 291 ms |
| Autosave nouveau programme, temporisation 900 ms comprise | 1 089 ms |
| Réseau rétabli → brouillon synchronisé | 132 ms |
| Ouverture formulaire existant | 257 ms |
| Autosave formulaire existant | 1 038 ms |
| Scénario publication explicite + vérification de fin | 2 137 ms |
| Réouverture en ligne → brouillon autorisé proposé | 105 ms |
| Changement de Club → retrait/rechargement du contexte | 178 ms |
| Changement de rôle → interface retirée et API refusée | 279 ms |
| Désactivation profil → Builder retiré | 34 ms |

## Comparaison fonctionnelle et coût

| Poste | Avant | Après / conséquence |
|---|---|---|
| Réouverture / démarrage hors ligne | Documents persistants relisibles, y compris par autre compte | Mémoire vide, admission serveur nécessaire ; performance à froid peut baisser |
| Retour à chaud dans la session | RAM + cache persistant | Cache RAM conservé ; pas de benchmark comparatif exhaustif |
| Autosave Builder existant | Écriture canonique automatique et effets associés | Brouillon serveur distinct ; publication explicite conserve les écritures métier |
| Retour après fermeture | Reprise locale potentielle et non confidentielle | Reprise du brouillon serveur autorisé ; aucune reprise RAM non synchronisée |
| Cache snapshot nutrition | Lecture/écriture IndexedDB | Zéro lecture/écriture par ce module, RAM conservée |
| Sauvegarde nouveau brouillon | Pas de cette nouvelle API | Généralement 4 lectures SDK / estimation 4 dans cette fixture |
| Brouillon de programme existant | Pas de cette nouvelle API | Généralement 5 lectures SDK / estimation 5 ; dossier/Club peuvent ajouter des contrôles ciblés |

Pour un nouveau brouillon : middleware marqueur (1) puis transaction marqueur, profil, brouillon (3). Un programme existant ajoute le canonique. Un document absent peut être facturable sans être retourné : premier read/save observé à 1 document retourné pour 4 opérations SDK, puis 2 après existence du brouillon. Les retries de transaction peuvent augmenter ces nombres. Les contrôles d’accès ne sont pas supprimés pour réduire ces lectures.

Une sauvegarde distincte réussie ajoute une écriture de brouillon ; retry identique n’ajoute pas de nouvelle version. La publication explicite supprime ensuite le nouveau brouillon. Les lectures sont instrumentées ; ces nombres d’écritures découlent du chemin transactionnel et des contrôles d’idempotence, **pas d’un export de facturation**. Pas d’écouteur permanent supplémentaire de brouillons, pas de polling de brouillons. Pas de worker de nettoyage créé. La conservation serveur est donc un coût résiduel à définir.

## Mesures globales et limites

- 32 appels des endpoints de brouillons dans le scénario intégré final, y compris les sondes de contrôle du test ; ne pas les assimiler aux seuls appels d’un utilisateur normal.
- Trafic CDP global : 28 710 310 octets, incluant modules Vite, baseline, rechargements et instrumentation. Ce chiffre ne décrit pas le trafic d’un build de production.
- Heap JS final : 65 702 968 octets utilisés, 86 654 976 alloués ; mémoire embedder 13 547 152, backing storage 32 260 329. Mesure ponctuelle, pas un pic ni un delta causal avant/après.
- Build : budgets respectés, dont Coach 69,9/70 KiB, Client 34,8/35 KiB, SessionPlayer 37,3/38 KiB. Un budget de bundle n’établit pas la latence de données.
- `actualBilledReads: null`. Ni coût Firestore production ni charge multiutilisateur mesurés.

La mémoire évite la persistance privée et conserve les retours chauds dans le même contexte. Elle fait perdre les avantages du cache disque entre redémarrages. Les gains des Lots 1–6 ne sont pas attribués à ce lot ; leur préservation complète exige une matrice froide/chaude/navigation à volumes comparables, non exécutée ici. La route de brouillons est bornée à 700 Ko de valeur et un document par cible/utilisateur ; plusieurs grandes cibles et l’absence de rétention doivent être qualifiées avant publication. Le conflit bloque la publication, sans interface de fusion automatique dans ce lot.
