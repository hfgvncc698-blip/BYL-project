# Banque d'images recettes nutrition

Ce dossier contient les images réalistes réutilisées par les recettes nutrition.
L'interface cherche d'abord une image prête dans `src/utils/recipeImageBank.js`, puis utilise une illustration locale de secours si aucune image ne correspond encore.

Format recommandé :
- `webp` ou `jpg`, ratio proche de `4:3` ou `3:2`.
- Nom descriptif en kebab-case, par exemple `breakfast-muesli-fruit.webp`.
- Photo servie, lumineuse, sans texte incrusté.

## Ajout d'une image générée

Quand Codex génère une nouvelle image, l'enregistrer dans la banque avec :

```bash
node scripts/registerRecipeImageAsset.cjs \
  --src /chemin/vers/image-generee.webp \
  --id main-poultry-starch-veg \
  --title "Assiette volaille, féculent et légumes" \
  --tags plat,volaille,feculent,legume
```

Le script copie le fichier dans ce dossier et crée ou met à jour l'entrée dans `src/utils/recipeImageBank.js` avec `ready: true`.

## Tags utiles

Tags de moment : `petit_dejeuner`, `collation`, `entree`, `plat`, `dessert`.

Tags de contenu : `volaille`, `poisson`, `oeuf`, `feculent`, `legume`, `fruit`, `laitage`, `muesli`, `avoine`, `barre_cerealiere`, `snack_sec`.

Le matching évite de mélanger les moments incompatibles : une image de collation ne sera pas utilisée pour un plat, même si plusieurs ingrédients se ressemblent.
