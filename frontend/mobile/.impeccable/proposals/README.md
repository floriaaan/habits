# Propositions de l’accueil Habits

Statut : proposition B « Le tableau de bord » approuvée par sélection explicite sur la page de comparaison. Maquette de référence : `../mocks/decision/dashboard.png`. Son implémentation dans l’application reste une étape distincte.

Cadrage confirmé le 2026-11-05 : grand public, équilibre entre actions et statistiques, maquettes en images avant code. Référence : `../references/habits-reference.png`. Contenu chiffré fictif, explicitement destiné à démontrer la composition.

Identité commune : formes généreuses et arrondies, texte noir sur fond clair, blocs rose/vert/bleu inspirés de la référence. Les calories et pas ne sont pas des capacités existantes.

Structures examinées avant comparaison : tableau de bord équilibré, agenda quotidien, bilan/actions en deux temps, catégories avec actions intégrées, hydratation centrale, calendrier de semaine, fil du jour avec bilan compact. Le tirage de surface `91b5aa69` retient les structures 7, 3 et 4 ; les trois propositions sont présentées avec la même fidélité.

- Le fil du jour : regroupement temporel des actions et synthèse compacte.
- Le tableau de bord : catégories et liste courante, modules statistiques pastel, hydratation visible.
- Les univers : progression et actions au sein de chaque catégorie.

Les prompts exacts et les sidecars des images sont conservés dans `../mocks/decision/`. Le fichier `choice.json` permet de réouvrir la comparaison. Après sélection, la composition approuvée devra être précisée pour Dynamic Type, mode sombre, tablette et adaptation Android avant implémentation.

## Révision du 2026-11-06

Le mainteneur demande de suivre précisément la référence pour les cartes, marges, espacements et fond anthracite. Proposition corrigée : `../mocks/decision/dashboard-v2.png` ; prompt exact et métadonnées dans les fichiers homonymes. Cette nouvelle image reste à examiner, sans approbation implicite. La version B initiale est conservée comme historique.

## Typographie et dock — 2026-11-06

Proposition `../mocks/decision/dashboard-v3.png` : sans-serif natif moins rond, fond noir sous la carte Hydratation, dock blanc cassé indépendant à quatre coins arrondis. Prompt et métadonnées homonymes conservés ; image en attente de retour utilisateur.

## Dock unifié — 2026-11-06

`../mocks/decision/dashboard-v4.png` regroupe dots de pagination, onglets et zone système native dans une même carte blanche. La typographie et le reste de la composition V3 sont conservés. Prompt exact et sidecar homonymes disponibles.
