# Lot 7B.1 SEXIES — performances

## Méthode

Mesures locales sur émulateurs et profil Chrome jetable ; un passage final complet, 39 contrôles. Pas de facturation réelle, de charge production, de comparaison temporelle exhaustive avec QUATER/QUINQUIES ni de percentiles. Les durées sont celles des scénarios, comprenant leurs contrôles et attentes, pas des SLA. Le runtime et les résultats bruts sont dans `audits/lot7b1sexies/results.json`.

| Scénario | Durée observée |
|---|---:|
| Connexion Firebase Auth B (émulateur déjà démarré) | 10.4 ms |
| Proposition autorisée sans lecture privée | 26.5 ms |
| Retry avec reçu et contenu vérifiés | 54.6 ms |
| Deux imports simultanés, un seul résultat créé | 2898.5 ms |
| Coordination de deux onglets actuels | 1092.7 ms |
| Suppression bloquée par ancienne connexion | 992.2 ms |
| Fermeture tardive → succès différé | 207.7 ms |
| Reprise du nettoyage secondaire | 16.0 ms |
| Répétition idempotente | 7.9 ms |
| Fermeture/réouverture pendant interruption puis reprise | 906.7 ms |
| Effacement du cache SDK réel après arrêt | 3.3 ms |
| Redémarrage B, vérification brute et reçu final | 694.9 ms |

La coordination demande nominalement 250 ms mais un onglet en arrière-plan peut subir le throttling de Chrome. Le scénario bloqué attend un véritable événement IndexedDB. La récupération concurrente peut inclure le backoff d’une transaction réessayée. Ces temps ne doivent pas être comparés à un clic utilisateur normal comme s’ils mesuraient la même opération.

## Lectures et écritures

| Mesure instrumentée des endpoints du pilote | Valeur |
|---|---:|
| Appels HTTP hors login | 34 |
| Appels SDK de lecture documentaire, retries inclus | 111 |
| Documents existants retournés | 102 |
| Estimation documentaire, une lecture par get y compris absent | 111 |
| Tentatives de transaction | 31 |
| Écritures documentaires des commits réussis | 5 |
| Brouillons nouveaux | 2 |
| Reçus de récupération nouveaux | 2 |
| Reçu final de profil jetable | 1 |
| Lectures réellement facturées | Non mesurées (`null`) |

Deux tentatives concurrentes sur la même cible ne créent qu’un brouillon et un reçu. Les reprises et relectures n’ajoutent aucune écriture documentaire de brouillon. Le programme canonique n’est pas publié/modifié par les endpoints de récupération. La modification de version canonique est une injection du test pour exercer le conflit, distincte du pilote.

L’instrumentation compte les `tx.get` et la lecture du reçu final, avec compteurs propres à chaque requête afin de ne pas doubler les mesures concurrentes. La somme des échantillons correspond aux agrégats ci-dessus. Les écritures comptées sont les opérations de commits réussis, non des factures. Les vérifications Auth ne sont pas des lectures Firestore.

**Hors de ces totaux** : préparation de 5 documents de fixture (2 droits, 2 provenances, 1 canonique), création des comptes Auth, injections de révocation/version/Club, sondes d’assertion du runner, bundle Vite et suppression locale. La mutation SDK offline est une écriture locale en attente, jamais acquittée par un backend ; elle est détruite uniquement dans le sous-test synthétique. Les lectures locales du SDK ne sont pas comptées comme lectures serveur.

## Mémoire et échecs

- Heap JS Chrome final : 827,524 octets utilisés / 1,572,864 alloués.
- Mémoire embedder : 1,506,392 octets ; backing storage : 8,018.
- Processus Node final : RSS 157,614,080 octets ; heap utilisé 46,027,680. Inclut serveur de test et préparation du bundle, pas uniquement l’API.

Ces captures sont prises après plusieurs redémarrages ; ce ne sont ni des pics ni des deltas causaux avant/après.

Échecs attendus et vérifiés : refus d’admission, révocation, conflit, retour réseau absent, reçu perdu, blocage IndexedDB, `failed-precondition`, échec secondaire et recontamination. Tous conservent un état non terminé ou refusé. L’échec secondaire est repris après fermeture/réouverture. La terminaison locale ne permet pas le reçu global tant que le harness n’a pas vérifié le profil redémarré.

## Interprétation

Le pilote ajoute un coût borné par brouillon et opérations de contrôle, sans polling de contenu ni publication automatique. Les chiffres concernent de petites fixtures ; ils ne justifient pas encore une campagne sur plusieurs milliers de brouillons ou plusieurs années de caches. Aucun gain des Lots 1–6 n’est revendiqué. Une future intégration doit mesurer ses volumes, rétention des reçus, droits réels et temps de fermeture contrôlée avant tout déploiement.
