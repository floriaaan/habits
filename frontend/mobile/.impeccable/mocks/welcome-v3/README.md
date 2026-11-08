# Bienvenue V3 — simplification

Correction demandée par le mainteneur : suppression des deux cartes sans fonction « Avancer » et « À son rythme », suppression du lien « Découvrir la démo ». Seul CTA : « Se connecter ». L’illustration centrale représente les habitudes ; elle reste décorative, sans faux contrôles.

Imagegen, source ../welcome-v2/b-plus-c.png, prompt exact conservé. Cette direction remplace la combinaison V2 ; elle est sélectionnée, approuvée et implémentée dans `src/presentation/WelcomeScreen.tsx`. La référence imagegen n’est pas embarquée : l’illustration utilise des vues natives, des symboles de plateforme et du SVG, sans interaction et masqués aux lecteurs d’écran. Le CTA ouvre `/login`, qui réutilise l’authentification PAT/OIDC ou fake existante et indique le mode simulé. Une session valide restaurée accède directement au dashboard.

Validation native en attente : aucun simulateur utilisé, conformément à la demande du mainteneur. Les 22 tests mobiles réussis (1 intégration HTTP ignorée), TypeScript et les exports iOS/Android prouvent les contrôles de code et la génération des bundles ; ils ne prouvent pas l’apparence native, les zones sûres, VoiceOver, le texte agrandi ni le clavier. La revue ciblée du code ne relève aucun défaut. Voir `docs/validation.md` à la racine pour les limites de validation.
