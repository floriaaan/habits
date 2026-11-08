# ADR-016 — Navigation mobile avec Expo Router

- Statut : accepté
- Date : 2026-11-06
- Décision : demande explicite du mainteneur, « Utilises le router expo ».
- Remplace : le choix d'une entrée `App.tsx` sans routeur dans ADR-002.

## Contexte

Le socle initial tenait dans un écran technique. Le design V4 validé introduit un accueil produit et un dock ; la navigation doit désormais pouvoir accueillir plusieurs écrans et des liens directs.

## Décision

Utiliser Expo Router, dans sa version compatible avec le SDK Expo installé. Le point d'entrée est `expo-router/entry`, les routes se trouvent dans `frontend/mobile/src/app/` et le layout racine compose les providers de session et TanStack Query une seule fois autour du Stack.

Le callback `/oauth` revient à l'accueil sans lire ni afficher ses paramètres : AuthSession reste seul responsable du state, du PKCE et de l'échange du code. Un lien inconnu revient à l'accueil. L'autorisation reste contrôlée par le backend et les queries restent conditionnées à la session.

Les bibliothèques UI sont désormais autorisées par le mainteneur. Leur choix doit servir le design V4 validé et les conventions natives.

## Conséquences

La migration conserve pour l'instant l'écran technique existant à `/`. La proposition pour la passe produit est trois onglets (Aujourd'hui, Progression, Profil), une route de détail d'habitude et une création présentée en modale. Ces écrans ne sont pas déclarés livrés par cette migration.

Les providers, connectors fake/HTTP, clés Query et règles de stockage ne changent pas. La navigation par fichiers remplace l'ancien enregistrement manuel du composant racine.

## Références

- [Installation officielle Expo Router](https://docs.expo.dev/router/installation/)
- [ADR-002 — Socle mobile](ADR-002-monorepo-mobile.md)
