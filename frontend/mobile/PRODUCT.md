# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

App grand public dès le départ, pour les personnes qui veulent suivre leurs habitudes quotidiennes. Ce public a été confirmé par le mainteneur le 2026-11-05 ; ne pas réduire le produit à un outil personnel ou réservé aux utilisateurs Home Assistant.

## Product Purpose

Permettre de créer des habitudes, enregistrer rapidement leurs réalisations et comprendre sa progression. L'accueil doit équilibrer actions du jour et statistiques, sans obliger à choisir entre agir et comprendre.

## Positioning

Suivi d'habitudes auto-hébergé avec données conservées par son instance, API Rust et clients mobiles/Home Assistant. L'application doit être compréhensible par le grand public même lorsque l'installation du serveur relève d'un opérateur.

## Operating Context

Application native Expo iOS/Android, utilisée pour des consultations courtes au fil de la journée et pour revoir sa progression. Interface initiale en français. Backend dans `../../backend`, client Home Assistant séparé dans `../../integrations`. L'écran technique actuel sert à vérifier les opérations de l'API ; son apparence n'est pas l'identité visuelle cible.

## Capabilities and Constraints

- Habitudes booléennes, quantitatives, de durée et de fréquence ; objectifs quotidiens/hebdomadaires, catégories Sport, Esprit, Quotidien et Alimentation.
- Planifications, fuseaux IANA, jours de repos, saisies/corrections/annulations, statistiques, séries et XP calculés côté serveur.
- Connexion PAT ou OIDC ; email/mot de passe attendu dans une étape ultérieure. Session sécurisée, isolation des utilisateurs et droits serveur à préserver.
- Backend Rust/Axum/SQLite ; Expo/React Native/TypeScript, connectors fake/HTTP et TanStack Query déjà présents.
- Adresse de l'instance définie par `EXPO_PUBLIC_API_URL`, sans sélecteur de serveur à ajouter sur l'accueil.
- Expo Router est le routeur retenu ; routes dans `src/app/`, providers partagés dans le layout racine.
- Les bibliothèques UI sont autorisées depuis le 2026-11-06 ; préserver la composition V4 et les conventions natives.
- Pas de catalogue nutritionnel, calcul de calories ou podomètre dans le backend actuel. Ne pas transformer ces éléments de la référence en promesses de fonctionnalités.
- Navigation produit finale, onboarding grand public, modèle de distribution/hébergement et éventuelle offre commerciale : décisions ouvertes.

## Brand Commitments

Nom existant : Habits. L'image de référence fournie par le mainteneur guide les propositions visuelles ; sa traduction en système sera décidée après comparaison des maquettes. L'utilisateur a choisi des maquettes en images avant toute implémentation de leur design.

Le mainteneur a rejeté l’exploration `.impeccable/mocks/graphic-v1/` : contours noirs, orange/olive et coches vives sont déjà trop marqués. Direction explicite : **minimal, sobre et classe**. Repartir de la V4 avec des retouches presque imperceptibles : fonds plus mats, pastels doux, traits fins. Ne pas interpréter la référence précédente comme une demande de néo-brutalisme ou d’accents graphiques forts.

## Evidence on Hand

- Référence fournie : `.impeccable/references/habits-reference.png` (copie fidèle de la pièce jointe `image.png`).
- Contrat applicatif : `src/domain/models.ts`, `../../docs/openapi.json` et `../../docs/mobile.md`.
- Les contenus chiffrés des futures maquettes sont des données de démonstration, pas des résultats utilisateur réels.

## Product Principles

- Faire coexister l'action immédiate et la compréhension de la progression.
- Utiliser un vocabulaire courant pour un public non technique.
- Respecter les objectifs, périodes, repos et fuseaux réellement calculés par le serveur.
- Distinguer une absence de donnée, un échec de synchronisation et une progression nulle.
- Préserver la maîtrise des données et ne pas culpabiliser les jours de repos.

## Accessibility & Inclusion

Respecter les conventions natives iOS/Android, l'agrandissement du texte, les zones tactiles accessibles et la réduction des animations. La couleur ne doit pas être le seul signal de catégorie ou de réussite. Aucun besoin utilisateur spécifique supplémentaire n'a encore été établi.

