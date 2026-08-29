# Direction artistique de l’application

Le dashboard coach est la référence visuelle des écrans authentifiés. Les composants partagés de `src/components/ui/AppPrimitives.jsx` doivent être utilisés avant d’ajouter des valeurs locales.

## Hiérarchie

- Fond de page : fond applicatif clair/sombre défini par `useAppTheme`.
- Surface principale : blanche en mode clair (`#FFFFFF`), sombre neutre en mode sombre (`#111827`), rayon de 22 px, bordure subtile, ombre légère et flou de 14 px.
- Tuile interne : rayon de 20 px, fond adouci, bordure subtile, sans déplacement au survol.
- Les dégradés colorés sont réservés aux bandeaux d’accueil, aux états promotionnels et aux accents explicites ; ils ne servent pas de fond aux cartes de contenu.
- Contrôle : rayon de 14 à 16 px. Les badges restent en forme de pilule.

## En-têtes et icônes

- En-tête de section : icône circulaire de 40 px, pictogramme de 20 px, titre `md` en graisse 900 et sous-texte de 14 px.
- Carte fonctionnelle ou métrique : icône carrée arrondie de 44 px avec un rayon de 14 px.
- L’accent coloré exprime le domaine : bleu général, vert activité, turquoise nutrition, violet programmes.
- Une icône décorative ne doit jamais afficher un curseur de lien.

## Chiffres

- Valeur principale : 32 px, graisse 950, interlettrage `-0.04em`, hauteur de ligne 1.
- La valeur est placée au bas d’une tuile métrique ou alignée à droite lorsque la carte est une ligne de synthèse.
- Le libellé précède toujours la valeur ; le sous-texte explicatif reste secondaire et ne concurrence pas le chiffre.

## Navigation

- Toute navigation de retour de page utilise `PageBackButton` dans la première carte d’en-tête, avant l’icône ou le titre.
- Le bouton Retour est une bulle circulaire de 36 × 36 px avec fond adouci, bordure subtile et accent bleu au survol ; il ne flotte jamais seul au-dessus de la carte.
- Lorsqu’un bouton Retour est présent, aucun badge d’icône décoratif ne lui est accolé : le titre vient directement après la bulle de retour.
- Toute flèche de navigation isolée utilise `AppNavigationArrow`.
- Zone interactive : 28 × 28 px ; pictogramme : 20 px.
- Aucun fond ni contour au repos ; la flèche devient bleue au survol.
- Le focus clavier reçoit un contour bleu de 2 px.
- Le curseur en forme de main n’apparaît que sur les zones réellement interactives.
- Les chevrons d’accordéon, de pagination ou de menu ne sont pas des flèches de navigation et conservent leur sémantique propre.

## Comportements

- Une carte non cliquable ne se déplace jamais au survol.
- Une carte entièrement cliquable peut changer légèrement de bordure, mais ne doit pas simuler un bouton si seule une action interne est disponible.
- Les boutons peuvent changer de couleur ou de fond, sans translation verticale.
- Les actions destructives restent explicitement libellées sur ordinateur et rouges ; sur mobile, une icône seule exige un libellé accessible et une infobulle.

## Composants de référence

- `AppSurface` : surface ou tuile.
- `AppSectionHeader` : en-tête, icône, titre, sous-texte et actions.
- `AppIconBadge` : contenant d’icône cohérent.
- `AppNavigationArrow` : flèche de navigation homogène.
- `PageBackButton` : retour de page circulaire intégré à la carte d’en-tête.
- `AppMetricTile` et `AppMetricValue` : métriques et chiffres.
- `AppSupportingText` : sous-texte secondaire.
