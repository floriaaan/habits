# Habit Tracker

**Le suivi d'habitudes auto-hébergé, conçu pour Home Assistant et l'automatisation.**

[English](README.md) · Français

Habit Tracker est une API REST en Rust avec SQLite. Suivez vos routines et votre
activité sportive, enregistrez vos réalisations et consultez objectifs, séries,
statistiques et XP. Les habitudes booléennes, quantitatives, de durée et de fréquence
prennent en charge planifications, jours de repos et fuseaux horaires IANA.

Utilisez l'API depuis vos scripts ou connectez
[l'intégration et les cartes Home Assistant](https://github.com/floriaaan/habit-tracker-ha).
Pocket ID/OIDC, Strava et les notifications sortantes vers HA sont facultatifs.
Le backend ne fournit pas d'interface web autonome.

## Installation

Avec Docker et Docker Compose, enregistrez ce bloc dans un **`compose.yaml`** dans
votre dossier de déploiement. L'image GHCR est disponible pour AMD64 et ARM64 ;
aucune compilation n'est nécessaire. Toutes les variables runtime sont définies ;
laissez les groupes optionnels vides si vous ne les utilisez pas.

```yaml
services:
  api:
    image: ghcr.io/floriaaan/habits:${HABIT_TRACKER_TAG:-latest}
    user: "10001:10001"
    read_only: true
    cap_drop: [ALL]
    security_opt:
      - no-new-privileges:true
    init: true
    environment:
      LISTEN_ADDR: 0.0.0.0:8080
      DATABASE_PATH: /data/habits.sqlite
      AUTH_MODE: ${AUTH_MODE:-local}
      OIDC_ISSUER: ${OIDC_ISSUER:-}
      OIDC_AUDIENCE: ${OIDC_AUDIENCE:-}
      OIDC_JWKS_URL: ${OIDC_JWKS_URL:-}
      OIDC_ALLOWED_ALGORITHMS: ${OIDC_ALLOWED_ALGORITHMS:-}
      OIDC_ACCESS_TOKEN_TYP: ${OIDC_ACCESS_TOKEN_TYP:-}
      ENCRYPTION_KEY: ${ENCRYPTION_KEY:-}
      ENCRYPTION_KEY_ID: ${ENCRYPTION_KEY_ID:-}
      STRAVA_CLIENT_ID: ${STRAVA_CLIENT_ID:-}
      STRAVA_CLIENT_SECRET: ${STRAVA_CLIENT_SECRET:-}
      STRAVA_REDIRECT_URI: ${STRAVA_REDIRECT_URI:-}
      STRAVA_WEBHOOK_VERIFY_TOKEN: ${STRAVA_WEBHOOK_VERIFY_TOKEN:-}
      STRAVA_WEBHOOK_PATH_TOKEN: ${STRAVA_WEBHOOK_PATH_TOKEN:-}
      STRAVA_SUBSCRIPTION_ID: ${STRAVA_SUBSCRIPTION_ID:-}
      STRAVA_ATHLETE_CAPACITY: ${STRAVA_ATHLETE_CAPACITY:-}
      STRAVA_MULTI_ATHLETE_APPROVED: ${STRAVA_MULTI_ATHLETE_APPROVED:-}
      HOME_ASSISTANT_URL: ${HOME_ASSISTANT_URL:-}
      HOME_ASSISTANT_ALLOW_HTTP: ${HOME_ASSISTANT_ALLOW_HTTP:-}
      RUST_LOG: ${RUST_LOG:-habit_tracker=info,tower_http=info}
    ports:
      - "${HOST_BIND:-127.0.0.1}:${HOST_PORT:-8080}:8080"
    volumes:
      - habit_data:/data
    healthcheck:
      test: [CMD, /usr/local/bin/habit-tracker, healthcheck]
      interval: 15s
      timeout: 5s
      start_period: 10s
      retries: 3
    restart: unless-stopped
    stop_grace_period: 15s
    mem_limit: 256m
    cpus: 1.0
    pids_limit: 128

volumes:
  habit_data:
    driver: local
```

Si le package GHCR est privé, faites d'abord `docker login ghcr.io` avec votre
identifiant GitHub et un PAT GitHub classique doté de `read:packages`.
Puis lancez :

```sh
docker compose up --detach --wait
docker compose logs api
```

Au premier démarrage en mode `local`, le backend crée l'utilisateur et affiche
une ligne JSON **`event: local_bootstrap`** contenant `token` et `metadata.user_id`.
Aucune commande de bootstrap n'est nécessaire. Ce token expire après **24 heures** :
conservez-le et créez un token dédié pour vos clients via la [gestion des tokens](docs/auth.md).
Il n'est jamais réaffiché ni régénéré au redémarrage, même expiré ou révoqué.
Les logs de ce premier lancement contiennent donc un secret ; réservez leur accès
aux opérateurs. La base ne stocke que l'empreinte du token.

L'API écoute sur `127.0.0.1:8080` et exige un Bearer valide. Pour un accès distant,
utilisez votre reverse proxy HTTPS ; les healthchecks restent internes et SSE doit
passer sans buffering. HA doit pouvoir joindre l'URL du backend depuis son serveur :
[installation HACS](https://github.com/floriaaan/habit-tracker-ha/blob/main/README.fr.md#installation).

OIDC, Strava et les notifications sortantes HA sont facultatifs ; leurs paramètres
se configurent dans le bloc ou via `.env`. Voir [authentification](docs/auth.md) et
[connecteurs](docs/integrations.md). Les données restent dans `habit_data` ;
`down --volumes` les supprime. Pour mettre à jour : [sauvegardez](docs/operations.md),
puis faites `docker compose pull && docker compose up --detach --wait`.

Pour chaque réglage et son origine, voir [Variables d’environnement](#variables-denvironnement).

Créez vos habitudes dans **HA → Paramètres → Appareils et services → Habit Tracker → Configurer**.
Les sept presets sont modifiables avant validation ; la création libre est disponible.
Ce parcours exige `habits:write` sur le token HA. Les cartes ont aussi un éditeur visuel Lovelace.

## Développement

### Cloner le backend et le client HA

Le client HA est verrouillé comme sous-module Git dans le dépôt backend.

```sh
git clone --recurse-submodules https://github.com/floriaaan/habits.git
cd habits
# Pour un clone existant :
git submodule update --init --recursive
```

### Développer dans Docker avec Task

Installez Docker Compose et [Task](https://taskfile.dev/docs/installation).
Le service de développement utilise directement l'image Rust officielle, avec
les sources montées. Aucune image de développement à construire, ni Rust à installer
sur l'hôte.

```sh
AUTH_MODE=local task dev
```

L'API est disponible sur `http://127.0.0.1:8080`. Après modification du Rust,
arrêtez avec Ctrl+C puis relancez `task dev` ; Cargo recompile les changements.
Les données de développement utilisent `data/dev/`, et les caches Linux
`target/docker/`, séparés de la production. Si le port est déjà utilisé par la
production, choisissez `HOST_PORT=8081` pour le développement.

```sh
task dev:test
task dev:cargo -- fmt --all -- --check
task dev:cargo -- clippy --locked --all-targets --all-features -- -D warnings
task dev:shell
```

### Développer avec Rust sur l'hôte

Installez Rust **1.99.1**, un compilateur C et CMake. Les dépendances sont fixées
dans `Cargo.lock`. `cargo run` ne charge pas `.env` ; exportez les variables nécessaires.

```sh
AUTH_MODE=local cargo run --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

Le `compose.yaml` du dépôt construit localement ; le bloc ci-dessus utilise GHCR. `python3 scripts/docker_smoke.py` teste un build et un volume
temporaires distincts. La CI vérifie aussi audit/deny, OpenAPI, les frontières du
domaine et les deux plateformes d'images natives.

### Modifier le client HA

Travaillez dans `integrations/home-assistant/habit-tracker-ha`. Committez et poussez
d'abord dans ce dépôt, puis committez son nouveau pointeur dans le backend.
Le [guide de développement HA](docs/home-assistant-connected.md) détaille installation,
synchronisation des cartes et tests HA réels. Une modification JavaScript nécessite
un rechargement du navigateur ; une modification Python, un rechargement adapté ou
un redémarrage de HA.

## Variables d'environnement

Les exemples sont illustratifs : remplacez les domaines `example.com`, identifiants
et valeurs entre `<…>` par les vôtres. Aucun secret prêt à l'emploi n'est fourni.
Sans OIDC, Strava ni notifications HA, les valeurs du Compose d'installation suffisent.

| Nom | Exemple de valeur | Rôle | Comment obtenir |
| --- | --- | --- | --- |
| `HABIT_TRACKER_TAG` | `latest` | Tag de l'image GHCR, utilisé par Compose. | [Choisir l'image](#docker-et-api) |
| `HOST_BIND` | `127.0.0.1` | Adresse de publication du port sur l'hôte Docker. | [Choisir l'adresse](#docker-et-api) |
| `HOST_PORT` | `8080` | Port publié sur l'hôte Docker. | [Choisir le port](#docker-et-api) |
| `LISTEN_ADDR` | `0.0.0.0:8080` | Adresse d'écoute de l'API dans le conteneur. | [Configurer l'API](#docker-et-api) |
| `DATABASE_PATH` | `/data/habits.sqlite` | Chemin de la base SQLite dans le conteneur. | [Choisir le stockage](#docker-et-api) |
| `RUST_LOG` | `habit_tracker=info,tower_http=info` | Filtre des logs applicatifs. | [Choisir les logs](#docker-et-api) |
| `AUTH_MODE` | `local` | Authentification `local` (alias `tokens`), `oidc` ou routes fermées `disabled`. | [Choisir le mode](#authentification) |
| `OIDC_ISSUER` | `https://id.example.com` | Issuer HTTPS exact du fournisseur. | [Lire les valeurs OIDC](#oidc) |
| `OIDC_AUDIENCE` | `habit-tracker-api` | Audience attendue des access tokens pour cette API. | [Confirmer l'audience](#oidc) |
| `OIDC_JWKS_URL` | `https://id.example.com/.well-known/jwks.json` | URL HTTPS des clés publiques de signature. | [Lire les valeurs OIDC](#oidc) |
| `OIDC_ALLOWED_ALGORITHMS` | `RS256` | Liste autorisée séparée par virgules : `RS256`, `ES256`, `EdDSA`. | [Confirmer la signature](#oidc) |
| `OIDC_ACCESS_TOKEN_TYP` | `at+jwt` | Type de JWT d'accès exigé par l'API. | [Vérifier le contrat](#oidc) |
| `ENCRYPTION_KEY` | `<base64-de-32-octets-aleatoires>` | Clé AES-256-GCM des credentials des connecteurs. | [Générer la clé](#chiffrement) |
| `ENCRYPTION_KEY_ID` | `key-1` | Identifiant de cette clé, de 1 à 64 octets. | [Choisir l'identifiant](#chiffrement) |
| `STRAVA_CLIENT_ID` | `12345` | Identifiant de votre application Strava. | [Créer l'application](#strava-oauth) |
| `STRAVA_CLIENT_SECRET` | `<secret-fourni-par-strava>` | Secret OAuth de cette application. | [Récupérer le secret](#strava-oauth) |
| `STRAVA_REDIRECT_URI` | `https://habits.example.com/integrations/strava/callback` | Callback HTTPS fixe pour l'autorisation par athlète. | [Configurer le callback](#strava-oauth) |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | `<secret-de-verification-genere>` | Valeur vérifiée pendant le challenge d'abonnement. | [Générer et enregistrer](#strava-webhook) |
| `STRAVA_WEBHOOK_PATH_TOKEN` | `<secret-de-chemin-genere>` | Secret dans l'URL webhook, au moins 32 caractères URL-safe. | [Générer le chemin](#strava-webhook) |
| `STRAVA_SUBSCRIPTION_ID` | `67890` | ID de l'abonnement webhook attendu. | [Créer l'abonnement](#strava-webhook) |
| `STRAVA_ATHLETE_CAPACITY` | `1` | Nombre maximal d'athlètes connectés autorisé pour l'application. | [Vérifier la capacité](#strava-oauth) |
| `STRAVA_MULTI_ATHLETE_APPROVED` | `false` | `true` exigé si la capacité configurée dépasse 1. | [Confirmer l'autorisation](#strava-oauth) |
| `HOME_ASSISTANT_URL` | `https://ha.example.com/` | URL HA pour les notifications sortantes du backend. | [Récupérer l'URL HA](#home-assistant) |
| `HOME_ASSISTANT_ALLOW_HTTP` | `false` | `true` autorise explicitement une liaison HA en HTTP local fiable. | [Choisir le protocole](#home-assistant) |

### Docker et API

Choisissez `HABIT_TRACKER_TAG` parmi les tags publiés de
[l'image GHCR](https://github.com/floriaaan/habits/pkgs/container/habits) : `latest`
pour la dernière image, ou `sha-<commit-complet>` pour figer une version.
`HOST_BIND` et `HOST_PORT` dépendent de votre reverse proxy et des ports libres ;
le défaut loopback `127.0.0.1:8080` convient à un proxy sur le même hôte.
Un proxy conteneurisé peut partager le réseau de l'API et cibler `api:8080`.

Conservez `LISTEN_ADDR=0.0.0.0:8080` et `DATABASE_PATH=/data/habits.sqlite` dans
Docker, pour écouter sur le réseau du conteneur et utiliser le volume local.
Hors Docker, choisissez une adresse locale et un chemin de disque local adaptés.
`RUST_LOG` peut rester à `info` ; `error` réduit les logs, sans masquer la ligne
initiale `local_bootstrap` contenant le token.

Compose lit automatiquement le `.env` placé à côté de `compose.yaml` pour les
valeurs `${…}`. `LISTEN_ADDR` et `DATABASE_PATH` sont des valeurs fixes du bloc :
modifiez-les directement dans `environment` si nécessaire. `cargo run` exige des
variables exportées et ne lit pas `.env`. Après modification des variables Compose,
recréez le service avec `docker compose up --detach --wait`.

### Authentification

Aucun fournisseur n'est requis pour `AUTH_MODE=local` : le premier token vient des
logs de démarrage, puis la [CLI ou l'API de gestion des tokens](docs/auth.md)
permettent d'émettre des PAT et tokens de comptes de service dédiés.
`AUTH_MODE=disabled` refuse toutes les requêtes privées, même avec un token valide.
C'est le défaut du binaire seul ; le Compose du README choisit `local`.
Pour `oidc`, configurez les cinq valeurs ci-dessous ; gardez-les toutes vides dans
les autres modes. Une panne OIDC ne bascule jamais automatiquement vers `local`.

### OIDC

Sur votre fournisseur, consultez le document `/.well-known/openid-configuration`
et recopiez **`issuer`** dans `OIDC_ISSUER` et **`jwks_uri`** dans `OIDC_JWKS_URL`,
sans modifier chemin ni slash. Pocket ID décrit ces endpoints dans son
[guide de connexion OIDC](https://pocket-id.org/docs/setup/connect-an-app).
Les deux URLs doivent être HTTPS et accessibles depuis le backend.

Faites confirmer par l'administrateur du fournisseur la valeur `aud` des **access
tokens destinés à cette API** et leur algorithme de signature ; renseignez
`OIDC_AUDIENCE` et une allowlist minimale dans `OIDC_ALLOWED_ALGORITHMS`.
L'audience n'est pas automatiquement le client ID d'une application.
`OIDC_ACCESS_TOKEN_TYP` doit être exactement `at+jwt` et le JWT réellement émis
doit annoncer ce `typ` : régler la variable ne convertit pas un token incompatible.
Un ID token ne convient pas. Si ce contrat n'est pas disponible, restez en mode
local. Le backend ne lance pas de login OIDC ni de discovery automatique ; voir
[le contrat complet](docs/auth.md#oidc-optionnel).

### Chiffrement

Pour Strava ou les notifications HA, générez **une fois** une clé de 32 octets
encodée en base64, puis placez sa sortie dans `ENCRYPTION_KEY` via votre gestionnaire
de secrets ou un `.env` local non versionné :

```sh
openssl rand -base64 32
```

Choisissez un identifiant stable tel que `key-1` pour `ENCRYPTION_KEY_ID` et gardez
les deux valeurs ensemble. Sans connecteur, laissez-les toutes deux vides.
Sauvegardez la clé séparément de SQLite. Remplacer la clé ou son ID rend les
credentials existants illisibles ; la rotation automatique n'est pas implémentée.

### Strava OAuth

1. Créez votre application sur [Strava — My API Application](https://www.strava.com/settings/api),
   puis copiez son **Client ID** et **Client Secret**. Voir le
   [guide officiel](https://developers.strava.com/docs/getting-started/).
2. Choisissez votre URL backend HTTPS publique. Configurez le domaine de callback
   de l'application Strava avec son hôte et `STRAVA_REDIRECT_URI` avec l'URL complète
   terminée par `/integrations/strava/callback`. Voir [OAuth Strava](https://developers.strava.com/docs/authentication/).
3. Lisez la capacité réellement accordée dans les paramètres API Strava. Gardez
   `STRAVA_ATHLETE_CAPACITY=1` pour votre seul compte ; au-delà, obtenez l'accès requis
   auprès de Strava et configurez la capacité accordée avec
   `STRAVA_MULTI_ATHLETE_APPROVED=true`. Ce booléen ne demande aucune autorisation
   à Strava. Voir [capacité des applications](https://developers.strava.com/docs/rate-limits/#athlete-capacity).

Activez aussi le chiffrement et configurez les secrets webhook ci-dessous.
Sans Strava, laissez **toutes** les variables `STRAVA_*` vides, y compris capacité
et booléen : toute valeur non vide déclenche la validation du groupe complet.
Les access/refresh tokens par athlète sont obtenus via le
[parcours OAuth de l'API](docs/integrations.md#strava), pas via des env vars.

### Strava webhook

1. Exécutez `openssl rand -hex 32` **deux fois** : une valeur pour
   `STRAVA_WEBHOOK_VERIFY_TOKEN`, une autre pour `STRAVA_WEBHOOK_PATH_TOKEN`.
2. Démarrez le backend avec le groupe Strava et le chiffrement configurés, en laissant
   d'abord `STRAVA_SUBSCRIPTION_ID` vide. Enregistrez auprès de Strava le callback
   HTTPS `/integrations/strava/webhook/<STRAVA_WEBHOOK_PATH_TOKEN>` de votre backend
   et la même valeur `verify_token` que `STRAVA_WEBHOOK_VERIFY_TOKEN`.
3. Copiez l'`id` de la réponse d'abonnement dans `STRAVA_SUBSCRIPTION_ID`, puis
   recréez le conteneur. Les POST sont refusés tant que cet ID n'est pas configuré.

La création/lecture de l'abonnement se fait via l'API Strava `push_subscriptions` :
[procédure officielle](https://developers.strava.com/docs/webhooks/#subscriptions).
Le secret de chemin doit rester masqué dans les logs du reverse proxy.

### Home Assistant

`HOME_ASSISTANT_URL` est l'URL de votre instance **accessible depuis le backend**,
idéalement HTTPS et terminée par `/`. Conservez `HOME_ASSISTANT_ALLOW_HTTP=false`,
sauf liaison HTTP locale de confiance pour laquelle vous choisissez explicitement
`true`. Configurez aussi le chiffrement.

Pour autoriser les notifications sortantes, créez un token longue durée dans
**Profil HA → Sécurité → Tokens d'accès longue durée**, comme décrit dans
[l'authentification HA](https://contributors.home-assistant.io/core/internals/auth-api/#long-lived-access-tokens).
Enregistrez-le via `PUT /api/v1/integrations/home-assistant` ; aucun env var de token
HA n'est prévu. Voir [connexion du backend vers HA](docs/integrations.md#home-assistant).

Ces variables sont inutiles pour installer les cartes via HACS : l'intégration HA
se configure avec l'URL du **backend** et un token **Habit Tracker**, depuis l'UI HA.

## Références

[Contrat API](docs/openapi.json) · [Authentification](docs/auth.md) ·
[Intégrations](docs/integrations.md) · [Exploitation](docs/operations.md) ·
[Architecture / ADR-001](docs/adr/ADR-001-backend-rust.md) ·
[Validation](docs/validation.md) · [Tâches MVP](TODO-MVP.md)

Licence MIT — [LICENSE](LICENSE).
