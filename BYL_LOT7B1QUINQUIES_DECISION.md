# Lot 7B.1 QUINQUIES — décision proposée

## Recommandation

**Ne pas autoriser de migration ou de purge réelle à ce stade. P0-4 reste ouvert et la production reste bloquée.** Le lot qualifie les primitives et leurs échecs, mais ne fournit pas une récupération universelle des anciennes données.

La décision A+D reste en vigueur : connexion habituelle, brouillons serveur nouveaux, RAM privée pendant la session, aucun second mot de passe. Aucun retour à une persistance claire pour améliorer les performances.

## Ce qui est qualifié

- Refus de récupération avant lecture dans le modèle lorsque compte, propriétaire, confirmation, réseau ou périmètre ne permettent pas l’admission.
- Import explicite de fixture à provenance connue vers un brouillon séparé, avec recontrôle de droits/version, reçu, reprise et absence de duplication/publication.
- Mécanismes Chrome réels de suppression bloquée, réussite différée après fermeture, échec partiel, reprise, réouverture et recontamination.
- Avec le SDK Firestore réel, survie d’une écriture offline après fermeture et perte effective lors de l’effacement de persistance synthétique.
- Conservation des préférences publiques dans la sélection synthétique, distinction entre nettoyage d’un onglet et état global du navigateur.

## Ce qui empêche une autorisation générale

1. **Provenance des anciens brouillons.** Les formats historiques ne disposent pas du manifeste fiable utilisé dans les tests. Refus par défaut. L’UID de clé n’est pas une preuve suffisante et ne doit pas devenir une dérogation pour faciliter la migration.
2. **Mutations Firestore.** Aucun convertisseur sûr des files historiques vers de simples brouillons n’est qualifié. Redémarrer l’ancien SDK en ligne peut publier des opérations ; purger peut perdre la seule copie.
3. **Anciens onglets et restauration.** Un writer non coopérant peut recréer la base ; un onglet ne nettoie pas le sessionStorage des autres. Il faut qualifier le protocole de fermeture/restauration des versions effectivement utilisées.
4. **Périmètre partagé.** Une base contient potentiellement plusieurs comptes. Aucun effacement global sans disposition autorisée de toutes les données uniques ou inconnues, sans les exposer au compte courant.
5. **Preuve de nettoyage.** Journal local et ACK inter-onglets insuffisants. Les migrations réelles nécessitent autorisations et reçus protégés, état physique vérifié, anciens workers/clients traités et contre-tests après réouverture.

## Options soumises à validation

| Option | Conséquence | Recommandation |
|---|---|---|
| Maintenir la quarantaine QUATER | Aucun effacement ; anciennes données encore sur disque | État actuel, pas de levée P0-4 |
| Concevoir un pilote strictement limité aux copies dont provenance/disposition est démontrée | Traitement au cas par cas, refus des éléments inconnus ; qualification supplémentaire avant toute action réelle | Suite proposée, après validation ; pas une autorisation de purge implicite |
| Accepter explicitement l’abandon de données locales irrécupérables dans un périmètre identifié | Perte potentiellement irréversible ; pas d’exposition préalable à un autre compte pour « vérifier » | Décision distincte à présenter avec bilan de perte, jamais par défaut |
| Utiliser un profil neuf contrôlé pour un pilote | Évite l’ancien stockage dans ce nouveau profil | Ne corrige ni n’efface l’ancien profil ; P0-4 sur le parc reste ouvert |

## Critères avant future action réelle

- Inventaire technique du périmètre et versions, sans lecture interdite intercomptes.
- Provenance prouvée pour chaque récupération ; refus explicite sinon.
- Vérification des droits au moment de l’import, versions, idempotence durable et relecture serveur.
- Résolution explicite de chaque donnée potentiellement unique avant suppression.
- Anciennes connexions/onglets/processus/Service Workers traités, sans fermeture faisant perdre silencieusement des brouillons.
- Test d’échec/reprise, recontamination et réouverture avec A/B sur le périmètre prévu.
- Confirmation séparée de toute suppression irréversible ; plan de récupération et limites de retour arrière compris.
- Aucun engagement d’effacement forensique ou rétroactif de copies exportées.

Aucun lot suivant, déploiement, migration réelle, règle de production ou changement d’un autre module n’est engagé. Attendre la validation explicite de l’utilisateur.
