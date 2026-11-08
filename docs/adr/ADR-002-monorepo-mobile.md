# ADR-002 — Monorepo et socle mobile Expo

- **Statut : accepté par le mainteneur le 2026-11-05.**
- **Date :** 2026-11-05.
- **Suite :** [spec d'implémentation](../specs/monorepo-mobile.md).
- Implémentation autorisée par validation explicite du mainteneur le 2026-11-05.

## Contexte

Le dépôt contient un backend Rust/Axum/SQLite à la racine, des clients Home Assistant et leur sous-module, une CI de publication Docker et des documents d'exploitation. Les routes couvrent habitudes, saisies, dashboard, statistiques, gamification, tokens et intégrations.

L'auth existe déjà : PAT opaques hashés, expirables et révocables, comptes de service, isolation par utilisateur, scopes et validation OIDC stricte. Le mode local utilise un utilisateur singleton. Le mode OIDC accepte des access tokens JWT `at+jwt` destinés à cette API. Il n'existe pas de login interactif, de session HTTP introspectable, ni de gestion email/mot de passe.

Référence inspectée : `/Users/floriaaan/dev/fridge-ai/mobile`, notamment `src/domain/interfaces/fridge-connector.ts`, `providers/create-connector.ts`, `src/application/shared/connector-context.tsx`, `query-client.ts` et `src/infrastructure/http/http-client.ts`. Le chemin relatif demandé n'existe pas à côté du worktree courant ; le dépôt frère du checkout principal a été utilisé en lecture seule.

## Décisions proposées

### 1. Monorepo léger

Placer le projet Cargo complet dans `backend/`, sans workspace Cargo racine pour un seul crate. Ajouter un workspace pnpm racine contenant `frontend/mobile`. Task reste le point d'entrée transversal. Pas de Nx, Turborepo, package partagé vide ou conversion du backend en package Node.

Déplacer sources, migrations, tests Rust et fixtures, manifestes Cargo, toolchain, configuration cargo-deny, Dockerfile, exemple d'environnement backend et scripts exclusivement backend. Conserver à la racine Compose, Taskfile, workflows GitHub, licences, documentation, données locales existantes et intégrations Home Assistant. Leur présence à la racine exprime leur rôle d'orchestration ou de client, pas du code serveur restant à déplacer.

Garder le contexte de build Docker à la racine avec `dockerfile: backend/Dockerfile` : les notices et licences racine restent copiables dans l'image. Adapter les COPY et exclure les dépendances/builds mobiles du contexte. Préserver noms de services, volumes, image, binaire, variables et routes existantes.

### 2. Expo, TypeScript et composants natifs

Application iOS/Android Expo en TypeScript strict, initialement avec une seule entrée `App.tsx` sans routeur. Ce point est remplacé par [ADR-016 — Expo Router](ADR-016-mobile-expo-router.md), à la demande du mainteneur le 2026-11-06. pnpm, React et React Native aux versions compatibles avec le SDK Expo retenu au moment de l'implémentation, verrouillées dans un lockfile racine ; ne pas recopier aveuglément les versions de fridge-ai.

« Sans lib externe » est interprété comme **sans bibliothèque UI** : `View`, `Text`, `TextInput`, `Pressable`, `ScrollView`, `StyleSheet`, etc. Expo et TanStack Query sont explicitement demandés ; SecureStore et les modules Expo nécessaires à OAuth constituent les dépendances techniques justifiées. Pas de Tamagui, kit UI, icônes, bibliothèque de formulaires ou graphiques.

### 3. Un contrat, deux connectors

`HabitsConnector` expose des opérations métier typées. `HttpHabitsConnector` utilise `fetch` natif ; `FakeHabitsConnector` fournit un jeu de données en mémoire modifiable et réinitialisable. Injection par contexte React au point de composition, choix explicite `fake`/`http` par configuration publique. Aucun repli automatique vers fake en cas de panne HTTP.

Séparation réduite : `domain` (types, contrat, erreurs), `application` (session et hooks Query), `infrastructure` (HTTP, fake, stockage et OAuth), `presentation` (écran technique). L'infrastructure ne doit pas importer les hooks ou le cache Query ; elle signale une invalidation de session à la couche application.

TanStack Query gère les lectures, mutations et invalidations. Les formulaires restent en état React local. Aucune duplication du calcul des streaks, statistiques ou objectifs dans le client HTTP. Le fake simule les cas utiles, sans réimplémenter intégralement le moteur Rust.

### 4. Auth : réutiliser Rust, compléter le parcours mobile

L'équivalent proposé de Better Auth couvre ici connexion, restauration de session, contrôle d'identité/scopes et déconnexion. **Il ne promet pas la parité avec Better Auth** : pas d'inscription email, mot de passe, récupération par email, passkeys ou liaison de comptes dans ce lot. Ce choix fait explicitement partie de la validation.

- **Local :** configurer l'adresse du serveur dans `EXPO_PUBLIC_API_URL` (URL complète avec protocole, IP ou domaine et port, par exemple `http://192.168.1.20:8080` en développement). L'écran affiche cette adresse sans champ d'édition ; seul le PAT dédié déjà émis est saisi. Vérifier le token auprès du backend avant stockage sécurisé. Aucun PAT dans `EXPO_PUBLIC_*`, les logs ou le cache Query. Le bootstrap existant reste un mécanisme opérateur ; aucune route publique de bootstrap.
- **OIDC :** client public mobile, Authorization Code + PKCE S256 via navigateur système et modules Expo. Aucun secret client embarqué. Issuer/client ID/scopes/audience configurés explicitement ; redirect URI mobile enregistrée chez le fournisseur. Utiliser uniquement l'access token pour l'API, jamais l'ID token.
- **Session :** ajouter `GET /api/v1/session`, protégé par le middleware existant sans exiger un scope métier. Renvoyer l'identité et les scopes effectifs, sans secret. SecureStore conserve les credentials ; React ne conserve que l'état utile au parcours.
- **Expiration :** PAT non renouvelable automatiquement. OIDC : renouvellement si le fournisseur délivre un refresh token, rotation enregistrée atomiquement côté client et un seul renouvellement concurrent. Sans refresh token, nouvelle connexion à expiration. Une erreur réseau ne vaut pas une révocation.
- **Déconnexion :** annuler les requêtes, supprimer les credentials locaux et vider le cache. Elle n'implique pas la révocation d'un PAT partagé ni la fermeture de la session SSO du navigateur. La révocation explicite reste une action distincte.

Un fournisseur OIDC doit réellement émettre les access tokens conformes au vérificateur actuel. `docs/auth.md` indique que Pocket ID n'a pas été validé sur une instance réelle : ne pas annoncer cette compatibilité ni assouplir les vérifications pour la simuler. Un test avec un fournisseur de test compatible prouve le protocole ; le test de l'instance cible sera rapporté séparément.

### Évolution prévue : email et mot de passe

Cette expérience est attendue, sans implémentation anticipée. Séparer le mécanisme de connexion (PAT, OIDC, puis email/mot de passe) de la session consommée par les hooks métier : identité stable `user_id`, scopes et état de session ne doivent pas dépendre de la méthode de connexion. Centraliser l'obtention, le stockage et le renouvellement des credentials dans l'infrastructure auth ; les connectors métier ne reçoivent que le credential courant. Le futur mécanisme Rust rejoindra le même `Principal` et les mêmes contrôles d'autorisation, sans imposer au domaine métier une dépendance à OIDC ou au singleton local.

Ne créer maintenant ni endpoints factices, ni tables de mots de passe, ni framework de fournisseurs. Une future spec définira inscription, hash des mots de passe, vérification/récupération, sessions révocables et association des identités existantes. Conserver les UUID et leurs données ; aucune fusion automatique de comptes par email ni transformation implicite du singleton local en compte nominatif. Le format de session et son mapping client pourront évoluer de façon additive.

### 5. Écran technique unique

Un écran défilant comporte connexion, habitudes/dashboard et sections avancées pour toutes les opérations HTTP applicatives existantes. Boutons directs pour les actions courantes ; champs simples et saisie JSON préremplie pour les paramètres complexes. Réponses lisibles, pagination explicite, état en cours, erreurs et identifiant de requête.

Pas de nouvelle logique métier, de design final, de navigation multi-écran ou de console HTTP arbitraire. Le périmètre précis et les exclusions de protocole sont décrits dans la spec.

## Alternatives écartées

- Recopier tout fridge-ai : apporte des fonctions et dépendances sans rapport avec ce socle.
- Déployer un service Node Better Auth : introduit un second serveur d'identité et une synchronisation avec Rust inutile pour les mécanismes présents.
- Développer des comptes/mots de passe en Rust maintenant : expérience attendue dans une étape ultérieure, explicitement différée pour ce lot. La récupération de compte, les emails et la politique de credentials seront spécifiés lors de cette étape.
- PAT uniquement : utilisable immédiatement, mais ne complète pas le parcours OIDC déjà prévu côté serveur.
- Générateur de client OpenAPI dès le départ : le contrat comporte des schémas à auditer ; commencer par des méthodes typées vérifiées contre les DTO Rust et le snapshot OpenAPI, sans chaîne de génération supplémentaire.

## Conséquences et réversibilité

Le backend conserve son autonomie Cargo et Docker. Le développement mobile ajoute une toolchain Node/pnpm. Les clients existants continuent à fonctionner ; l'endpoint session est additif. Aucun changement de schéma SQLite n'est prévu.

Séparer le déplacement mécanique, l'ajout session et l'application mobile en changements reviewables. Revenir au backend précédent reste possible sur la même base puisque les migrations et données ne changent pas. Ne pas déplacer les volumes ou données ignorées par Git ; ne jamais utiliser `docker compose down -v` pour cette migration.

## Références

- Existant : [auth](../auth.md), [ADR-001](ADR-001-backend-rust.md), `src/http/{routes,tracking,dashboard,auth,integrations}.rs` au commit `530edf3`.
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/) : workspace et configuration Metro native.
- [Expo OAuth/OIDC](https://docs.expo.dev/guides/authentication/) et [AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/) : PKCE, redirects et development build pour OAuth.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/) : stockage des credentials natifs.
- [TanStack Query React Native](https://tanstack.com/query/latest/docs/framework/react/react-native) : gestion du focus via AppState.
