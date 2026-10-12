# Discussions privées du club

Accès : bouton « Discussions du club » sur le dashboard club et sur la page messagerie des coaches/clients. Le responsable voit deux listes (coaches et clients). Un membre ne voit que ses propres fils avec ses clubs. Les fiches clients sans compte lié sont visibles mais ne peuvent pas recevoir de message.

L’API `/api/messaging/club` vérifie les profils et rattachements courants à chaque requête. Les responsables sont les comptes users du club avec accountType=club_owner, clubRole=owner ou role=club. Les coaches sont les users coach du club, hors membres retirés. Les clients sont rattachés explicitement par clubId ou clubIds ; un simple lien au coach ne rend pas son client membre du club. Les changements de compte client ne donnent pas accès à l’ancien historique.

Les messages sont stockés dans `clubConversations`, séparément de `conversations` (coach–client). Le navigateur ne lit ni n’écrit directement cette collection : les règles Firestore générales refusent ces accès. L’API utilise exclusivement la collection club et ne lit jamais l’historique coach–client. Les administrateurs peuvent consulter un club en aperçu, sans envoyer à sa place ni marquer ses messages comme lus.

Envoi transactionnel avec identifiant de requête pour éviter les doublons après une coupure. Texte limité à 4 000 caractères. Historique paginé par 50 messages. Actualisation du fil toutes les 10 secondes, des contacts/non-lus toutes les 20 secondes. Pas d’e-mail ni de notification push ajoutés. Les répertoires sont plafonnés à 1 000 fiches par requête.

Validation : `node scripts/testClubMessaging.cjs` (API réelle avec stockage isolé), lint, smoke et compilation. Aucune donnée de démonstration ni aucun message réel créé. Déployer frontend et backend pour activer la fonctionnalité en production ; aucun index composé ni règle élargie nécessaire.
