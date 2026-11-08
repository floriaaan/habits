# Spec — Monorepo et application mobile technique

**Statut : validée par le mainteneur le 2026-11-05 ; implémentation livrée ; preuves et limites dans [la validation](../validation.md#monorepo-et-mobile--2026-11-05).** Date : 2026-11-05.
Décisions : [ADR-002](../adr/ADR-002-monorepo-mobile.md).

## Résultat attendu

Depuis un checkout propre, pouvoir lancer le backend conservant toutes ses fonctions, puis une application Expo iOS/Android en fake sans serveur ou en HTTP contre une instance réelle. L'application présente un seul écran fonctionnel, sans bibliothèque UI, et permet d'exercer les opérations applicatives du backend.

La validation explicite du mainteneur autorise l'implémentation de cette spec.

## 1. Organisation et migration

Arborescence cible :

```text
backend/
  Cargo.toml, Cargo.lock, rust-toolchain.toml, deny.toml
  Dockerfile, .env.example
  src/, migrations/, tests/, scripts/
frontend/mobile/
  app.json, package.json, tsconfig.json, .env.example
  src/app/                  routes Expo Router et layout racine (ADR-016)
  src/domain/             # DTO, HabitsConnector, ApiError
  src/application/        # session, queries, mutations, providers
  src/infrastructure/    # http, fake, SecureStore, OAuth
  src/presentation/      # un écran, petites sections si nécessaire
docs/                    # décisions, spécifications, exploitation, OpenAPI
integrations/            # clients Home Assistant inchangés
scripts/, tests/         # orchestration, distribution et tests HA
.github/workflows/
compose.yaml, compose.dev.yaml, Taskfile.yml
package.json, pnpm-workspace.yaml, pnpm-lock.yaml
```

Déplacer `tests/*.rs` et `tests/fixtures/` dans `backend/tests/`. Déplacer `check_domain_boundaries.py` et `docker_smoke.py` dans `backend/scripts/`, en explicitant leurs chemins de travail. Conserver `ci_publication.py`, les scripts HA et les tests Python associés à la racine. Les guides serveur et `docs/openapi.json` restent dans la documentation commune.

Adapter les chemins dans Docker, Compose, Task, scripts, CI, cache Rust, artefacts de binaire, variables `HABIT_TRACKER_BIN`, tests HA et commandes README FR/EN. Les dépendances Rust et migrations existantes sont conservées. `sqlx::migrate!("./migrations")` continue à résoudre depuis le manifeste backend.

Compose dev garde son montage racine et utilise `/workspace/backend` comme répertoire de travail. Préserver `data/dev`, `target/docker`, le projet `habits-dev` et le volume production existant. Garder le chargement de `.env` racine pour les utilisateurs actuels ; documenter la copie depuis `backend/.env.example`. Les commandes Cargo directes utilisent `cd backend` ; les commandes Task existantes restent disponibles depuis la racine.

Ajouter des commandes racine pour mobile start, iOS, Android, typecheck et tests. Épingler pnpm et la version Node supportée ; installation reproductible avec `pnpm install --frozen-lockfile`. Les workflows restent sous `.github/workflows` et conservent leurs protections de publication. Ajouter un job mobile indépendant, sans publication store/EAS.

## 2. Contrat applicatif et transport

Le contrat `HabitsConnector` possède des méthodes nommées par opération, pas un simple `request(path, body)` exposé à l'écran. Les types reflètent les DTO Rust : UUID et timestamps en chaînes, champs optionnels/nullables respectés, unités et enums exacts, pagination conservée. Vérifier également les réponses réelles des routes lorsque le schéma OpenAPI est incomplet.

Le client HTTP centralise base URL, Bearer, JSON, réponses 204, timeout, annulation et erreurs `{error: {code, message, request_id}}`. Une réponse non JSON ou invalide devient une erreur de protocole explicite. Propager les AbortSignal de Query. Ne pas suivre de redirection vers une autre origine avec des credentials.

`EXPO_PUBLIC_API_URL` définit l'origine de l'API, avec protocole, IP ou domaine et port ; les méthodes ajoutent `/api/v1`. Lire cette variable dans un seul module de configuration avec `process.env.EXPO_PUBLIC_API_URL`. Elle est publique et embarquée dans le bundle Expo, jamais un secret. En mode HTTP, son absence ou une valeur invalide produit une erreur de configuration explicite, sans fallback ; le mode fake n'en dépend pas. Aucun champ de saisie d'adresse serveur dans l'écran. HTTPS requis hors développement local explicitement activé. Refuser credentials/query/fragment dans l'URL serveur. Les informations OIDC sont associées à cette instance et ne sont jamais réutilisées implicitement pour une autre.

Les mutations n'ont pas de retry automatique. Pour les routes exigeant `Idempotency-Key`, créer une clé par intention utilisateur, la conserver lors d'une reprise après résultat incertain et ne pas la partager entre deux intentions. Les lectures ont des retries bornés pour erreurs transitoires, aucun retry sur 401/403/422. Les erreurs 409, 413, 429, 503 et 504 restent distinctes.

Le fake implémente les mêmes méthodes, conserve les modifications durant la session et offre des données déterministes, un reset et quelques erreurs simulées. Il ne contacte aucun serveur, ne sauvegarde aucun secret et indique clairement que les intégrations externes sont simulées. Couvrir créations, modifications, archivage, saisies, annulations et invalidations utiles ; ne pas prétendre reproduire toute la sémantique statistique Rust.

## 3. Session et auth

Ajouter `GET /api/v1/session` dans les routes privées et OpenAPI :

```json
{
  "user_id": "uuid",
  "mode": "personal_access_token",
  "scopes": ["habits:read", "entries:read"]
}
```

Modes sérialisés : `personal_access_token`, `service_account`, `oidc_access_token`. Aucun token, email ou expiration inventée : le `Principal` actuel n'expose pas toutes ces données. Réponse `Cache-Control: no-store`, 401 pour credentials invalides/expirés ou auth disabled. Aucun scope supplémentaire n'est nécessaire pour lire sa propre identité.

États client : restauration, déconnecté, authentifié, vérification indisponible. Au démarrage, lire SecureStore et vérifier `/session` avant de charger les données privées. En cas de panne réseau, conserver les credentials et proposer Réessayer ; ne pas déclarer une connexion vérifiée. Un 403 métier n'invalide pas la session.

Le login PAT vérifie `/session` sur l'URL configurée avant de sauvegarder les credentials associés à cette origine. Au démarrage, si `EXPO_PUBLIC_API_URL` diffère de l'origine sauvegardée, supprimer l'ancienne session sans envoyer son token à la nouvelle instance. Les comptes de service restent soumis aux restrictions serveur et n'obtiennent pas de fonctions de gestion par simple présence d'un bouton.

Le login OIDC utilise discovery de l'issuer configuré, un client public, PKCE S256, state et redirect URI enregistrée. Les scopes doivent inclure ceux attendus par l'API. Le fournisseur doit savoir émettre `at+jwt` avec issuer et audience attendus. Aucune modification opportuniste des contrôles Rust pour accepter un ID token. Tester retour OAuth, annulation et state invalide. Utiliser un development build pour les redirects natifs, pas Expo Go comme preuve OAuth.

Si un refresh token est disponible, le renouveler à expiration avec mutualisation des appels et enregistrer sa rotation avant de reprendre. Après renouvellement, les lectures peuvent être reprises une fois ; les mutations ne sont pas rejouées automatiquement. `invalid_grant` ou 401 définitif déconnecte ; timeout/5xx n'efface pas les credentials. Sans refresh token, demander une reconnexion à expiration.

Déconnexion, changement de serveur via configuration ou changement de connector : annuler les lectures, invalider la génération de session et vider le cache avant de créer le nouveau contexte. Une réponse tardive d'une ancienne session ne peut ni réauthentifier ni effacer la nouvelle. Les clés Query incluent instance, mode de connector et utilisateur. Aucun secret dans les clés, résultats Query, erreurs ou logs.

La déconnexion est locale. Révoquer un PAT est une action serveur distincte avec confirmation. Si l'utilisateur révoque ou fait tourner le credential actuellement utilisé, demander une nouvelle connexion ; ne pas laisser un faux état connecté.

## 4. Écran unique et couverture

Même écran pour connexion et outils authentifiés : sections masquées selon état et scopes, boutons désactivés pendant mutation, labels accessibles, clavier géré et contenu défilant. L'autorisation définitive reste côté serveur.

Couverture requise des routes existantes (préfixe `/api/v1` sauf mention contraire) :

- **Session :** adresse configurée affichée en lecture seule, connexion PAT, connexion OIDC configurée, restauration, identité/scopes, déconnexion ; badge fake visible.
- **Dashboard :** `GET /dashboard`, rafraîchissement manuel et au retour au premier plan. Lire les actions disponibles et appeler `POST /habits/{id}/actions` pour `complete`, `uncomplete`, `increment`, `decrement`, `set_value` avec les paramètres du contrat.
- **Habitudes :** liste paginée, détail, création `POST /habits`, création avec présentation `POST /habits/setup`, mise à jour `PUT /habits/{id}`, archivage `DELETE`, versions, `PUT /habits/{id}/presentation`.
- **Saisies :** liste par habitude, détail, ajout, correction et annulation via les routes `/habits/{id}/entries` et `/entries/{id}`. Préserver les règles d'idempotence propres à chaque route.
- **Repos et calculs :** liste des exceptions, ajout/retrait par date, statistiques par habitude, recalcul, gamification et ledger paginé.
- **Accès :** liste paginée de tokens, émission, rotation et révocation ; création/révocation de comptes de service. Pour révoquer un compte existant, saisir son ID : aucun endpoint de liste n'existe actuellement. Afficher les secrets nouvellement émis uniquement à la demande dans un résultat éphémère, hors cache Query et logs, puis les effacer.
- **Intégrations :** liste, connexion HA, notification HA, autorisation Strava, mapping, synchronisation, déconnexion et consultation des jobs. Ouvrir l'URL Strava renvoyée par le backend dans le navigateur ; le callback serveur existant termine l'autorisation, puis rafraîchir la liste au retour. Aucun nouveau callback mobile Strava requis.
- **Diagnostic :** version authentifiée `GET /api/v1` et lecture authentifiée `/api/v1/openapi.json` ; erreurs avec request ID. Les healthchecks restent destinés à l'exploitation et ne conditionnent pas la connexion mobile.

Les formulaires courants (connexion, création simple, saisie et actions dashboard) ont des champs dédiés. Les paramètres avancés peuvent être édités en JSON prérempli, avec validation syntaxique et erreurs serveur lisibles. IDs, dates et pagination ont des champs explicites. Pas de génération automatique de formulaires depuis OpenAPI.

Les callbacks OAuth serveur et webhooks sont des protocoles machine, pas des boutons à reproduire. Le flux SSE `/dashboard/events` reste compatible mais son abonnement mobile est différé : ce lot utilise invalidation après mutation, rafraîchissement manuel et AppState. Les CLI de bootstrap, backup et administration opérateur ne deviennent pas des routes mobiles.

Après mutation, invalider uniquement les lectures affectées : habitudes/dashboard, saisies/statistiques/gamification, tokens ou intégrations/jobs selon le cas. Les jobs peuvent être relus à intervalle borné pendant l'affichage jusqu'à leur état terminal. Aucun polling en arrière-plan ni cache métier persistant.

## 5. Développement réseau

Documenter `EXPO_PUBLIC_API_URL` dans `frontend/mobile/.env.example`, avec des exemples pour simulateur iOS, émulateur Android et téléphone réel (par exemple `http://192.168.1.20:8080` sur le LAN). Documenter le rechargement du bundle en développement et la reconstruction/publication du bundle pour changer cette valeur en distribution. Le Compose actuel n'écoute que sur `127.0.0.1` : proposer une surcharge locale explicite pour le LAN ou une URL HTTPS accessible, sans ouvrir l'API sur toutes les interfaces par défaut. Le tunnel Metro ne publie pas automatiquement le backend.

Le web n'est pas une cible d'acceptation de ce lot : pas de stockage web des secrets ou de CORS global ajouté pour contourner un problème natif. L'exemple d'environnement ne contient que URL, mode fake/http et configuration OIDC publique. Les secrets Strava/HA restent côté serveur, à l'exception des credentials saisis pour les opérations déjà prévues par l'API.

## 6. Ordre d'implémentation après validation

1. Établir le résultat des contrôles backend existants et relever les éventuels échecs préexistants.
2. Déplacer mécaniquement le backend et adapter chemins/CI/Docker/documentation ; vérifier préservation avant ajout fonctionnel.
3. Ajouter `/session` et ses tests de sécurité ; régénérer le snapshot OpenAPI.
4. Scaffolder Expo, interface, connectors, session et hooks Query.
5. Brancher l'écran unique et toutes les opérations listées ; documenter démarrage et limites.
6. Exécuter les contrôles ciblés, puis les gates existantes affectées ; rapporter les preuves et toute validation externe indisponible.

## 7. Critères d'acceptation

- Seuls les composants serveur résident dans `backend/` ; Cargo, Task, Docker et CI utilisent les bons chemins. Le frontend n'est pas requis pour compiler ou lancer le serveur.
- Tests Rust existants, fmt/clippy, vérification des frontières, comparaison OpenAPI et tests de distribution/HA continuent de passer. Vérifier Docker sur son contexte réel et le scénario démarrage/volume conservé sans effacement de données.
- pnpm installe depuis le lockfile ; typecheck, tests ciblés et export/bundle Expo iOS/Android passent. Un export n'est pas présenté comme une preuve de fonctionnement sur appareil.
- Fake démarre sans API, les opérations modifient les données visibles et le reset revient aux fixtures. Chaque méthode du contrat possède une implémentation fake et HTTP ; vérifier la couverture des routes listées.
- Contre Rust en mode local : connexion PAT, création d'une habitude, saisie/action, lecture du dashboard et statistiques, correction/annulation, archivage et déconnexion fonctionnent.
- `/session` couvre token valide, expiré/révoqué, disabled, OIDC, isolation et compte de service ; les permissions existantes ne sont pas élargies.
- Tests client ciblés : restauration, 401 vs 403 vs panne réseau, annulation/réponse tardive après changement d'identité, stockage sécurisé, refresh mutualisé et rotation OIDC, JSON/204/erreur HTTP, idempotence et invalidation après mutation.
- Tester le parcours natif OAuth avec un fournisseur de test compatible ; consigner séparément le résultat Pocket ID/instance cible et les éventuels prérequis externes manquants. Ne jamais remplacer un test absent par une affirmation de compatibilité.
- Vérification manuelle sur au moins une cible native accessible : clavier, scroll, champs/boutons et parcours principal. Signaler explicitement si l'environnement ne permet pas cette vérification.
- README FR/EN documentent mode fake, mode HTTP, bootstrap/PAT, OIDC, adresses locales et commandes déplacées.

## 8. Hors périmètre et validation demandée

Pas de passe design, publication stores, frontend web, offline-first, synchronisation persistante, push mobile, nouvelle logique métier ou migration des données. L'auth email/mot de passe et sa récupération sont attendues dans une étape ultérieure ; passkeys et social login multiple restent hors périmètre.

Valider cet ensemble signifie notamment accepter : pnpm + Expo sans kit UI ; réutilisation PAT/OIDC avec `/session` ; écran technique couvrant aussi les opérations avancées via JSON ; absence d'abonnement SSE mobile pour cette première passe. L'auth email/mot de passe est prévue ultérieurement, avec les points d'extension décrits ci-dessous, sans en commencer l'implémentation.

## 9. Préparer l'auth email/mot de passe ultérieure

Le parcours de connexion et l'accès aux credentials sont isolés des queries et opérations métier. Les consommateurs de session utilisent `user_id`, scopes et état de session ; ils ne déduisent ni les droits ni l'identité d'un PAT, d'un email ou du mode OIDC. Le futur login email/mot de passe pourra fournir une session à ce même cycle de restauration/déconnexion sans réécrire les hooks métier. Les permissions continuent à être décidées côté Rust via `Principal`.

Cette tranche ne crée aucun schéma, endpoint, formulaire ou méthode vide pour l'auth future. Le choix du stockage des mots de passe, des sessions, de la récupération et de l'association des identités sera détaillé dans un ADR/spec dédié. La transition devra préserver les UUID, les données et les accès PAT/OIDC existants ; aucune liaison automatique par email.

Critères de préparation : les modules métier et l'écran hors section connexion n'importent pas l'implémentation PAT/OIDC ; un fake authentifié peut alimenter leurs hooks sans credential réel. Couvrir aussi le changement de `EXPO_PUBLIC_API_URL` : un ancien token n'est jamais transmis à la nouvelle origine.
