# Architecture du frontend mobile

Cette organisation sépare les responsabilités sans changer les parcours, le design, les clés TanStack Query ou le contrat du backend. Les fichiers Expo Router restent des points d’entrée, pas des implémentations d’écran.

## Organisation

```text
src/
  app/                    Routes Expo Router : exports, redirections, callback OAuth
  bootstrap/              Composition des adaptateurs et racine des providers
  domain/                 Modèles, contrat HabitsConnector, erreurs, calendrier
  application/            Ports, session, requêtes, mutations, pagination, journal
  infrastructure/         Implémentations HTTP/fake, OAuth, stockage sécurisé
  presentation/
    shell/                Welcome/accueil, onglets natifs, splash
    features/
      activity/           Fiche, graphique, dernières saisies, actions flottantes
      auth/               Connexion et welcome
      home/               Accueil et cards statistiques/hydratation
      new-habit/          Formulaire de création en deux étapes
      profile/            Profil, préférences et actions du compte
      progress/           Statistiques, détail quotidien, régularité, catégories
      technical/          Console opérateur et catalogue des opérations
      today/              Sélecteur de jour, timeline, habitudes restantes
    shared/
      charts/             Interpolation et tracé néon
      layout/             Insets physiques, contours, cadre commun des onglets
      models/             Formatage et lecture de l’historique du dashboard
      motion/             Morphing entre onglets et vers une habitude
      navigation/         Dock
      ui/                 Thème, texte, icônes et boutons
```

## Dépendances

- `domain` ne dépend d’aucune autre couche locale.
- `application` dépend de ses ports et du domaine, jamais des adaptateurs ou de la présentation. Les hooks de session et de préférences conservent leurs intégrations React/native.
- `infrastructure` implémente les contrats du domaine et de `application/ports.ts`.
- `bootstrap/create-runtime.ts` choisit les implémentations. Les consommateurs reçoivent un `Runtime` décrit par des ports, pas par `ReturnType` d’une factory d’infrastructure.
- `presentation` utilise l’application et le domaine. Elle n’importe pas les adaptateurs ni le bootstrap.
- `shared` ne connaît pas les fonctionnalités. Une fonctionnalité n’importe pas une autre fonctionnalité : leur assemblage appartient à `shell`.
- Les primitives UI sont des feuilles. Les animations importent directement ces feuilles, jamais le module public qui expose aussi le dock. Cette distinction évite une boucle UI → dock → animation → UI.

## Contrôleurs et affichage

Un `*Screen.tsx` gère l’entrée et l’authentification, appelle son `use*Controller`, puis transmet son modèle à la vue. Les limites de montage liées à l’utilisateur sont conservées.

Les contrôleurs possèdent les lectures, mutations, autorisations, valeurs dérivées, clés d’idempotence et états d’interaction. Les détails du geste de changement de jour et de l’ancrage de navigation restent dans leurs contrôleurs de présentation : ils ne sont pas des règles du domaine.

Les `*View`, `*Card` et `ActivityActions` affichent les données et appellent des callbacks. Ils peuvent connaître le thème, la taille de fenêtre, les refs natives et les mesures de layout. Ils n’appellent ni `useApp`, ni les hooks de requête/mutation. Les props des sections utilisent `Pick` sur le contrat de leur contrôleur pour ne recevoir que les capacités utiles ; les imports correspondants sont des imports de types.

`WaterCard.tsx` est le petit conteneur de la card d’hydratation ; `WaterCardView.tsx` est son affichage. La console technique est volontairement un outil connecté, isolé dans sa fonctionnalité : son workbench expose les opérations complètes du backend, avec ses primitives locales. Ses contrôles ne deviennent pas des composants du produit grand public.

Ne pas extraire chaque ligne de JSX. Extraire une section quand elle a une responsabilité lisible ou un usage partagé. Garder les styles propres à une fonctionnalité près de celle-ci ; partager les primitives, les géométries et les règles réellement identiques.

## Invariants à conserver

- Les clés de cache restent liées à l’origine, au mode et à l’utilisateur ; les mutations invalident les mêmes ressources.
- Les clés d’idempotence, les timestamps des saisies réessayées et les verrous synchrones de soumission ne sont pas des détails visuels. Ne pas les déplacer dans les boutons.
- Les statistiques restent issues des données du connecteur ; un jour absent ou de repos ne devient pas une valeur inventée.
- `DeviceInsetsProvider` reste au-dessus des navigateurs. Le dock ne doit pas ajouter une seconde fois ses insets.
- Le scroll reste derrière le dock et les actions flottantes. Leur conteneur est transparent et la hauteur mesurée réserve seulement un espace à la fin du contenu.
- Préserver l’ordre des vues natives autour du scroll, les identités des cards, la correspondance des couleurs et la prise en compte de la réduction des animations.
- Les routes natives et les noms de fichiers dans `app/` restent stables.

## Vérification

Depuis la racine du monorepo :

```sh
pnpm --filter @habits/mobile typecheck
pnpm --filter @habits/mobile test
pnpm --filter @habits/mobile export
```

`tests/architecture.test.ts` vérifie les imports locaux, les frontières des couches, l’indépendance des fonctionnalités, les composants d’affichage, l’absence de cycles et les routes sans logique métier. TypeScript refuse aussi les variables, paramètres et imports inutilisés.

Les tests des calculs, du calendrier, des connecteurs et de l’authentification restent indépendants du runtime React Native. Les exports Metro vérifient les deux graphes natifs. Ils ne prouvent pas le rendu, VoiceOver/TalkBack ou la fluidité sur appareil ; aucune validation par simulateur n’a été faite pendant cette restructuration.
