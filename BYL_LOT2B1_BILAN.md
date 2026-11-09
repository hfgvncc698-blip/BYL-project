# Lot 2B.1 — Sécurité et validation de la messagerie

Branche `codex/firebase-performance-audit`. La référence du Lot 2B est `a14e066`. Essais sur comptes synthétiques, deux émulateurs et processus Node locaux. Aucun déploiement.

**Je recommande de suspendre le passage au lot suivant si la garantie doit couvrir une désactivation faite uniquement dans Firebase Auth.** Les révocations enregistrées dans les autorisations BYL bloquent les nouvelles opérations testées. Le test d’Auth seule reproduit une exception de sécurité sur le chemin SDK professionnel.

## Révocation et sécurité

Le point de départ de chaque mesure est la confirmation de l’écriture de révocation. Les nouvelles requêtes de lecture du fil, d’envoi et d’accusé sont lancées sur chacune des deux API après ce point. Le test exige six refus et vérifie que la version Firestore de la conversation reste identique. Le délai ci-dessous correspond à la réception du retrait dans une attente HTTP déjà ouverte, sans nouveau message.

| Modification confirmée | Refus API sur A et B | Retrait du résultat HTTP |
|---|---:|---:|
| Marqueur de membre retiré, dossier toujours lié | 6 sur 6 | 14 ms |
| Responsable rattaché à un autre club | 6 sur 6 | 7 ms |
| Responsable désactivé dans son profil | 6 sur 6 | 7 ms |
| Dossier rattaché à un autre compte | 6 sur 6 | 11 ms |
| Rôle du responsable rétrogradé, ancien marqueur propriétaire conservé | 6 sur 6 | 5 ms |
| Rôle du responsable supprimé, ancien marqueur propriétaire conservé | 6 sur 6 | 5 ms |

Le compte remplaçant ne récupère pas l’ancien historique du club. La route historique des contacts masque aussi l’aperçu. Sur le fil professionnel, la réattribution du dossier en conservant un ancien alias a invalidé l’attente en **8 ms**. L’ancien compte s’est vu refuser la consultation de l’accès, l’envoi et l’accusé sur les deux API.

Le test navigateur déconnecte l’utilisateur pendant une réponse en vol, connecte un autre compte, puis libère la réponse : le client la rejette. Un test séparé coupe la connexion HTTP au serveur, attend le détachement des écoutes et modifie la racine sans observer de nouveau callback sur l’instance abandonnée. Les transactions d’envoi et d’accusé revérifient les droits avant écriture. La lecture d’une page Club consulte désormais ses sources d’autorisation, le curseur et les messages dans la même transaction en lecture seule.

### Désactivation Firebase Auth seule

Le test conserve un jeton obtenu avant la désactivation du compte et tente une lecture et une écriture directement sur l’API Firestore utilisée par le SDK professionnel. La mutation est un message synthétique valide. Les statuts sont ceux observés sur les émulateurs.

| Opération après désactivation | Auth seule | Auth et marqueur de désactivation sur le profil BYL |
|---|---:|---:|
| API de messagerie avec l’ancien jeton | 401 | 401 |
| Lecture directe du message | **200** | **403** |
| Écriture directe du message | **200** | **403** |

La désactivation du compte et la révocation des jetons sont vérifiées par l’API de messagerie à l’admission et à la sortie d’une attente renouvelée. Cela ajoute des appels à Firebase Auth, distincts des lectures Firestore. Une règle Firestore peut consulter le profil BYL, mais a besoin d’une information de révocation enregistrée pour reconnaître la révocation d’un jeton encore valable. [Gestion des sessions Firebase](https://firebase.google.com/docs/auth/admin/manage-sessions)

Les routes Club de désactivation et de retrait enregistrent désormais le statut du membre et du profil dans un **même batch Firestore, avant la mise à jour Auth**. Le test a appelé les routes réelles de désactivation, réactivation et suppression. La route de gestion a aussi refusé à un responsable désactivé de modifier les droits d’un autre membre. Les marqueurs de sécurité ne peuvent plus être effacés par une mise à jour du profil personnel. Une personne habilitée qui agit directement dans la console Auth peut encore contourner cette séquence. La lecture et l’écriture directes reproduites ci-dessus motivent la réserve.

## Invalidation ciblée et coût

La bulle et la page utilisent la même attente d’inbox que le Lot 2B. Lorsqu’un fil est consulté, l’API vérifie son périmètre et ajoute à cette attente les documents susceptibles de lui retirer l’accès. Pour un fil Club, il s’agit du profil demandeur, du club, du destinataire, de son profil et du marqueur de membre, avec déduplication des chemins. Pour un professionnel, le dossier et le profil demandeur suffisent à signaler le changement. Le signal réveille l’attente et provoque une nouvelle autorisation. La réponse peut retirer le fil et la copie locale de l’annuaire. La surveillance existante du profil par le navigateur prend aussi en compte les marqueurs de désactivation.

Les principales corrections portent sur `backend/routes/clubMessaging.js`, `backend/routes/messaging.js`, les services `clubMessaging` et `clubInboxWatch`, le middleware Firebase, les deux routes de gestion Club et `firestore.rules`. Côté navigateur, le magasin `messagingFeed`, les hooks de contacts et de fil et le contexte d’authentification transmettent le périmètre consulté et retirent les données révoquées.

Les écouteurs sont partagés dans un processus, détachés 1,5 seconde après le dernier consommateur. Un badge seul n’ouvre aucune écoute de documents d’accès. La comparaison des champs porte sur les autorisations ; Firestore peut néanmoins compter un changement de document même lorsqu’il laisse ces champs identiques. Une liste sans fil ciblé et les dépendances qui ne sont pas surveillées restent soumises à la vérification périodique de 24 secondes, augmentée du traitement et du transport. Une réponse ou une copie déjà remise à un client ne peut pas être rappelée rétroactivement.

## Deux instances réellement indépendantes

Les API A et B sont des processus Node distincts, avec des connexions Firestore et des caches séparés. La fixture de redémarrage compte dix racines Club. Le responsable ouvre les deux inbox. Le membre envoie simultanément la même requête idempotente aux deux instances.

| Parcours | Écoutes initiales A / B | Documents retournés A / B | Estimation documentaire A / B |
|---|---:|---:|---:|
| Ouverture, double envoi concurrent et réception | 1 / 1 | 69 / 70 | 77 / 77 |
| Fil ciblé, deux attentes sur A et une sur B, puis un envoi | 6 / 6 | 90 / 71 | 97 / 79 |

Dans le premier parcours, chaque instance a reçu la modification en **3 143 ms** depuis le début du double envoi. Les deux réponses d’envoi et la réception étaient terminées en 3 472 ms. Il s’agit d’une collision intentionnelle entre transactions. Le test retrouve un seul document pour cet envoi. Dans le second parcours, chaque processus détient une écoute des racines et cinq écoutes de documents d’accès, soit **12 écoutes au total**. Une seconde attente sur A ne double pas ses écoutes.

A est ensuite arrêté pendant une attente. B reçoit un message pendant son absence. Le nouveau processus A reprend avec la version d’inbox connue, retrouve le dernier aperçu et rend exactement un message manqué après le curseur précédent. Le démarrage, la reprise et le rattrapage ont pris **525 ms**, avec une nouvelle écoute, 46 documents retournés et une estimation de 50. La relance du même envoi conserve son identifiant. Deux accusés concurrents avancent le même curseur ; répéter l’accusé ne modifie plus l’horodatage de la racine. Aucun service d’infrastructure supplémentaire.

## Volumétrie

Chaque taille comprend N racines Club et N racines professionnelles sur les périmètres mesurés. L’historique date de 2020 ; 10 % des dossiers ont quitté le club et 20 % des conversations professionnelles sont masquées pour le coach. Un autre club et un autre coach servent de témoins d’isolation. Les réponses contiennent respectivement 90 % et 80 % des N conversations. Les canaux sont mesurés dans des processus distincts pour isoler leurs compteurs.

Les opérations SDK comprennent les souscriptions initiales et les lectures de documents ou requêtes. Pour une écoute, le compteur documentaire retient le résultat initial puis les changements reçus. L’estimation inclut le minimum des requêtes vides et les documents absents demandés. Chaque cellule donne **Lot 2B → Lot 2B.1**. Pour l’ouverture, le temps mesure la réception de l’inbox complète. Pour le repos, il comprend une attente de 24 s. Pour le message, il part du lancement de l’envoi jusqu’à la réception par l’abonné ; les compteurs incluent l’envoi et la réponse d’inbox. Une ouverture ou un repos représente un HTTP par canal, un nouveau message en représente deux.

### Club

| Racines | Étape | Opérations SDK | Documents retournés | Estimation documentaire | Temps (ms) |
|---:|---|---:|---:|---:|---:|
| 100 | Ouverture | 195 → 10 | 294 → 294 | 294 → 297 | 836 → 230 |
| 100 | Repos | 194 → 9 | 194 → 194 | 194 → 197 | 24 506 → 24 057 |
| 100 | Nouveau message | 202 → 18 | 201 → 201 | 203 → 207 | 473 → 80 |
| 500 | Ouverture | 955 → 30 | 1 454 → 1 454 | 1 454 → 1 469 | 2 624 → 313 |
| 500 | Repos | 955 → 29 | 1 454 → 954 | 1 454 → 969 | 26 223 → 24 174 |
| 500 | Nouveau message | 963 → 38 | 1 461 → 961 | 1 463 → 979 | 2 097 → 196 |
| 1000 | Ouverture | 1 905 → 54 | 2 904 → 2 904 | 2 904 → 2 934 | 5 277 → 665 |
| 1000 | Repos | 1 905 → 53 | 2 904 → 1 904 | 2 904 → 1 934 | 29 344 → 24 226 |
| 1000 | Nouveau message | 1 913 → 62 | 2 911 → 1 911 | 2 913 → 1 944 | 4 971 → 255 |

### Professionnel

| Racines | Étape | Opérations SDK | Documents retournés | Estimation documentaire | Temps (ms) |
|---:|---|---:|---:|---:|---:|
| 100 | Ouverture | 102 → 3 | 201 → 201 | 201 → 201 | 561 → 193 |
| 100 | Repos | 101 → 2 | 101 → 101 | 101 → 101 | 24 315 → 24 038 |
| 100 | Nouveau message | 106 → 7 | 106 → 106 | 107 → 107 | 327 → 52 |
| 500 | Ouverture | 502 → 7 | 1 001 → 1 001 | 1 001 → 1 001 | 1 407 → 205 |
| 500 | Repos | 501 → 6 | 501 → 501 | 501 → 501 | 24 980 → 24 056 |
| 500 | Nouveau message | 506 → 11 | 506 → 506 | 507 → 507 | 1 111 → 87 |
| 1000 | Ouverture | 1 002 → 12 | 2 001 → 2 001 | 2 001 → 2 001 | 2 242 → 415 |
| 1000 | Repos | 1 002 → 11 | 2 001 → 1 001 | 2 001 → 1 001 | 26 507 → 24 084 |
| 1000 | Nouveau message | 1 007 → 16 | 2 006 → 1 006 | 2 007 → 1 007 | 2 038 → 128 |


Les lectures d’autorisation restent fraîches pour chaque projection. Le regroupement des lectures en lots de 100 documents et des recherches de membres en groupes de 30 réduit les allers-retours. Sur la référence, le traitement séquentiel pouvait dépasser le délai de détachement de l’écoute : la requête suivante devait relire toutes les racines. Le banc observe ce redémarrage au repos sur les grandes fixtures. Les requêtes de membres retirés ajoutent parfois une petite estimation au premier chargement, même si elles ne retournent aucun document.

À 1 000 conversations, l’inbox Club utilise encore **1 934 lectures documentaires estimées par attente de repos**, et l’inbox professionnelle **1 001**. Ces valeurs concernent un abonné, un canal et un passage. Deux instances et plusieurs requêtes authentifiées peuvent cumuler leurs contrôles. Les émulateurs ne mesurent pas la facture, les frais d’index, les dépendances facturées des règles du navigateur, le coût Auth ou les latences réseau de production. Les temps sont des observations, pas des percentiles.

## Non-régression et reproduction

Sur la même fixture du Lot 2B, sans interaction, les deux versions ont les mêmes totaux. Un onglet pendant 22 s donne **4 HTTP, 9 opérations SDK, 7 documents et une estimation de 9**. Deux onglets pendant 22 s donnent **8, 16, 14 et 16**. Un onglet pendant 62 s donne **8, 19, 17 et 19**. Le badge, la bulle et la page partagent leurs résultats. Aucun chargement global de l’annuaire pendant ces fenêtres.

Le signal de révocation a un coût observable lorsque le fil est ouvert. Sur les deux envois et deux accusés du banc desktop, on passe de **14 à 16 HTTP**, de **73 à 112 opérations SDK**, de **70 à 92 documents retournés** et d’une estimation de **77 à 116**. La référence avant optimisation rendait 380 documents sur ce parcours. Le gain au repos est conservé ; le parcours actif consomme davantage que le Lot 2B.

| Chrome local | Desktop, 1 440 px | Mobile, 500 px |
|---|---:|---:|
| Envoi → badge, fil fermé | 1 000 ms | 1 000 ms |
| Envoi → affichage dans le fil ouvert | 222 ms | 111 ms |
| Envoi → confirmation visible de lecture | 294 ms | 148 ms |
| Révocation du responsable → retrait du fil affiché | **14 ms** | **13 ms** |

Le Lot 2B avait mesuré environ 23 s pour ce dernier scénario. Les deux onglets convergent après lecture, un seul toast est observé, la déconnexion rejette la réponse en retard et le message envoyé pendant la coupure réapparaît à la reconnexion. Un passage par viewport ne définit pas une borne de latence.

Le contrôle smoke `coach-today` vérifie maintenant l’appel à `renderPriorityCard` avec la propriété `data-tour` et sa transmission au composant `Box`. Les 53 contrôles smoke passent. Le tutoriel et le Dashboard coach sont inchangés. La suite de règles passe 79 contrôles, dont un scénario groupé couvrant les anciennes identités, la réattribution du dossier, la perte du rôle, la tentative de lever sa propre révocation et les mutations directes refusées. Les tests ciblés des contacts, des forfaits, des e-mails, des annulations et des résiliations passent, ainsi que la compilation et ses budgets.

Avec Firebase CLI, Java 21, Chrome et les dépendances du dépôt :

```sh
firebase emulators:exec --config firebase.performance-test.json \
  --project demo-byl-performance --only auth,firestore \
  "node scripts/measureMessagingLot2B1.cjs"
```

Le banc extrait le backend `a14e066` dans un répertoire temporaire. `BYL_VOLUME_ONLY=1` sélectionne la volumétrie, `BYL_SKIP_VOLUME=1` sélectionne la sécurité et le redémarrage. Les lignes JSON donnent les mesures brutes par scénario. Le rejeu navigateur utilise `BYL_MSG_CASE=after` avec `scripts/measureClubMessaging.cjs`. Les essais de règles utilisent `npm run test:security-rules`.

## Risques résiduels et décision

1. **Accès direct professionnel avec ancien jeton.** Pour une garantie couvrant aussi les interventions Auth hors de BYL, il faut que tous les chemins de révocation mettent à jour une métadonnée protégée, ou arbitrer une migration des dernières lectures et mutations SDK vers l’API authentifiée. Cette dernière option affecterait les clients déjà installés ; elle n’a pas été entreprise dans ce lot de validation.
2. **Grandes inbox.** Le nombre d’opérations SDK baisse fortement, mais la quantité de documents nécessaires pour revalider les accès reste proportionnelle au nombre de racines. Les estimations et le nombre d’abonnés doivent servir à fixer une enveloppe avant d’envisager une généralisation.
3. **Données déjà affichées.** Le fil consulté bénéficie du signal ciblé. La liste sans fil ouvert, un annuaire déjà chargé, les terminaux hors ligne et les copies déjà reçues ont des garanties différentes. Les essais portent sur Chrome, des émulateurs et deux processus locaux ; ils ne couvrent pas un proxy de production ni un téléphone suspendu.

Je recommande de valider les corrections des parcours BYL et de décider explicitement de la politique Auth/SDK avant le lot suivant. Aucun changement de production ou d’un autre lot.
