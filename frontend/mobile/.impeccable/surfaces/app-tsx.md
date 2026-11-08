---
version: 1
slug: "app-tsx"
primary_target: "src/app/(tabs)/index.tsx"
related_targets: []
---

# Accueil mobile — composition corrigée selon la référence

## Surface

src/app/(tabs)/index.tsx et accueil natif. Mode : Operate. Public grand public. Équilibre entre actions et statistiques.

## Historique et autorité

Le tableau de bord B avait été retenu. Le 2026-11-06, le mainteneur a demandé explicitement une fidélité beaucoup plus stricte à l’image d’origine pour la composition des cartes, leurs espacements et le fond visible derrière. Cette correction prévaut sur la précédente interprétation à fond global blanc.

Référence de géométrie : `.impeccable/references/habits-reference.png`. La composition V2 a reçu un retour favorable. Le mainteneur demande ensuite une typographie moins ronde et un dock traité comme une carte sur le fond noir. Composition approuvée par le mainteneur : `.impeccable/mocks/decision/dashboard-v4.png`. V4 validée explicitement le 2026-11-06.

## Composition à préserver

- Fond anthracite continu, visible dans les interstices. Ne pas confondre le fond de l’application avec le cadre physique du téléphone présent sur la référence.
- Un panneau blanc supérieur unique, environ 43,5 % de la hauteur : zone système, titre Habits, quatre catégories, trois lignes d’habitudes sans sous-cartes ni séparateurs, petit bouton Ajouter en bas à droite.
- Deux cartes intermédiaires presque carrées, rose et vert, d’environ 22 % de hauteur. Interstices sombres réguliers de 5 à 6 points sur un écran de 430 points. Marges extérieures faibles de 4 à 6 points, pas de gouttière blanche de 16 ou 24 points.
- Hydratation : carte bleue autonome, avec quatre coins arrondis. Le fond redevient noir immédiatement sous elle. Le fond noir forme uniquement l’interstice avant le dock ; les marqueurs de pagination font partie du dock blanc.
- Dock : carte blanc cassé autonome, alignée avec les autres cartes, avec quatre coins arrondis. Elle inclut, du haut vers le bas, les marqueurs de pagination, les trois destinations iconographiques (sélection grise discrète), puis la zone système native de navigation/gestes. L’indicateur d’accueil iOS est noir sur le fond blanc du dock. Aucun dot ni indicateur système ne flotte sur le fond noir. Le noir ne forme que l’interstice avec Hydratation et les petites marges extérieures.
- Arrondis généreux comparables à la référence : environ 18 points en bas du panneau supérieur et 24 points sur les cartes intermédiaires. Mesures indicatives à confronter à la taille réelle lors de l’implémentation.
- Graphiques occupant la largeur des cartes, illustrations d’hydratation à gauche et volume à droite. Ne pas remettre un grand titre Hydratation ou un bouton vert supplémentaire qui déforme cette géométrie.

## Éléments conservés du produit

Catégories Sport, Esprit, Quotidien, Alimentation ; habitudes et indicateurs compatibles avec le backend. Les pas/calories de l’image originale ne deviennent pas des fonctionnalités livrées. Les chiffres de la maquette restent fictifs.

## Limites

La V4 est traduite en composants natifs, avec contrôle visuel sur simulateur iOS. Les graphiques, contrôles, segments et navigation devront être spécifiés fonctionnellement, réalisés en éléments natifs et testés avec les données réelles, Dynamic Type, le mode sombre, les tablettes et Android. La maquette ne doit pas être utilisée comme écran raster fonctionnel.

## Typographie — précision du mainteneur

Privilégier un sans-serif natif standard, non arrondi, lisible et agréable : SF Pro standard côté iOS, adaptation native Android. Titre et chiffres semi-gras, intertitres medium/semi-gras et descriptions regular ; éviter les lettres gonflées et les terminaisons très rondes. Conserver la hiérarchie et les proportions, sans confondre les arrondis des cartes avec la forme des caractères.

## Intégration de la zone système

La précision du mainteneur inclut les dots et la barre native dans la surface du dock. Lors de l’implémentation, prolonger le fond du dock dans les insets natifs et respecter les gestes système ; ne pas dessiner une fausse barre d’accueil dans React Native ni doubler celle du système. Adapter ce traitement aux conventions Android et à sa zone de navigation native.


## Direction contract

THESIS: Un accueil natif où actions et progression se partagent des cartes presque bord à bord ; le fond anthracite relie les blocs, sans page blanche globale.
OWN-WORLD: Surfaces blanc cassé, rose, vert et bleu ; police système non arrondie ; pictogrammes natifs et grands chiffres lisibles. Carte dock blanche incluant pagination, onglets et safe area système.
STORY: Voir ses objectifs, agir sur une habitude ou l’hydratation, puis retrouver sa progression. Les valeurs proviennent du connector ; le mode démonstration est identifié.
FIRST VIEWPORT: Panneau blanc unique en haut (~43 %), deux cartes pastel (~22 %), hydratation (~20 %), puis dock unifié. Interstices anthracite 5–6 pt. Ajouter reste compact en bas à droite du panneau supérieur.
FORM: Composition B, seed 91b5aa69, révision V4 approuvée explicitement le 2026-11-06. Pagination des habitudes adaptée au volume réel, native safe areas et texte agrandi préservés. L’hydratation réagit après confirmation serveur, sans faux chiffre optimiste.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
