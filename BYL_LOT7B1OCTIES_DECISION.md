# Lot 7B.1 OCTIES — décision proposée

## Situation

**Production toujours bloquée. P0-4 reste ouvert.** Aucun déploiement, aucune donnée réelle, aucune purge utilisateur, aucune migration irréversible ni modification des règles de production réalisés.

La correction du rejet réseau de module différé et la prévention du cache HTTP via apiFetch sont intégrées dans BYL, pas dans un prototype. Les mécanismes antérieurs de mémoire, admission, brouillons serveur et migration restent en place. Aucun autre lot lancé.

## Conditions avant publication

1. Valider les corrections et les résultats de ce lot. Qualifier la récupération de modules sur un build distribué, plusieurs moteurs et les timings d’initialisation encore non couverts.
2. Qualifier les sessions Firebase Auth sur appareil partagé, les fetch directs, les médias privés et les couches HTTP de l’hébergement. L’inventaire source ne prouve pas l’absence de toute copie persistante privée.
3. Établir les preuves de propriété réellement disponibles. Les données non attribuables et mutations non synchronisées restent exclues du nettoyage tant que leur disposition n’est pas résolue.
4. Approuver la procédure opérationnelle d’anciens contextes, fermeture complète, contrôle après redémarrage et traitement de recontamination. Aucun « nettoyage global terminé » depuis le seul silence des onglets.
5. Définir autorité de qualification des plans, conservation des preuves/reçus, assistance et décisions de perte potentielle. Ne pas réutiliser un reçu rendu incohérent par une modification ultérieure.
6. Revoir séparément, après autorisation explicite, les garde-fous de qualification empêchant aujourd’hui une purge réelle. Ne pas simplement activer un flag en production.
7. Respecter les préconditions de sécurité antérieures, dont Auth externe et grandes inbox. Pas de clôture implicite de P0-3 ou de P0-4.

## Retour arrière

En cas de régression, désactiver les actions de récupération/nettoyage concernées tout en conservant les lecteurs en mémoire et la barrière d’identité. Ne pas revenir à la persistance privée en clair. Une suppression déjà effectuée n’a pas de rollback local garanti ; les brouillons serveur vérifiés sont la seule reprise prévue pour leurs contenus.

## Arrêt

Lot OCTIES uniquement. Attendre la validation explicite avant migration réelle, purge, déploiement ou autre lot.
