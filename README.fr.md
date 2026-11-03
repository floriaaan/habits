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

## Développement

### Cloner le backend et le client HA

Le dépôt backend est privé et nécessite un accès GitHub. Le client HA public est
verrouillé comme sous-module Git.

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

## Références

[Contrat API](docs/openapi.json) · [Authentification](docs/auth.md) ·
[Intégrations](docs/integrations.md) · [Exploitation](docs/operations.md) ·
[Architecture / ADR-001](docs/adr/ADR-001-backend-rust.md) ·
[Validation](docs/validation.md) · [Tâches MVP](TODO-MVP.md)

Licence MIT — [LICENSE](LICENSE).
