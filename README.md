# Habit Tracker

API REST self-hosted Rust 0.1.0, sans frontend : Axum/Tokio/Tower,
SQLite/SQLx, OpenAPI utoipa et logs JSON tracing.
[ADR-001](docs/adr/ADR-001-backend-rust.md) reste la source de vérité.

Le parcours local est utilisable avec PAT : habitudes, planifications quotidiennes
ou hebdomadaires, réalisations, corrections/annulations idempotentes, repos,
statistiques 7/30/90 jours, heatmap, streaks et XP compensables.
Pocket ID/OIDC, Strava et Home Assistant sont facultatifs. Leurs adaptateurs sont
testés hors ligne ; leur validation avec des comptes réels reste à effectuer.

## Démarrage local

Prérequis : rustup, compilateur C et CMake. Rust 1.99.1 et dépendances fixées
par rust-toolchain.toml, Cargo.toml et Cargo.lock.

```sh
rustup toolchain install 1.99.1 --profile minimal --component rustfmt --component clippy
cargo run --locked -- bootstrap-local Europe/Paris
AUTH_MODE=local cargo run --locked
```

Le bootstrap affiche une seule fois un PAT de 24 h, à conserver dans un gestionnaire
de secrets. Il ne se répète pas. L'utilisateur local persiste avec le même UUID.
Sans `AUTH_MODE=local` ou `oidc`, **toutes les routes privées retournent 401**.
Le mode local exige un Bearer valide de cet utilisateur unique. Aucun en-tête
d'identité ou mode anonyme ne donne accès aux données. Une panne OIDC ne déclenche
aucun basculement vers un autre utilisateur.

```sh
curl --fail http://127.0.0.1:8080/health/ready
# HABIT_TOKEN doit être chargé depuis votre gestionnaire de secrets.
curl --fail -H "Authorization: Bearer $HABIT_TOKEN" -H 'Content-Type: application/json' --data @tests/fixtures/habit.json http://127.0.0.1:8080/api/v1/habits
```

`.env.example` fournit les noms de configuration sans secret. `cargo run` ne charge
pas `.env` automatiquement ; exporter les variables. Compose transmet les paramètres
facultatifs. `LISTEN_ADDR` vaut `127.0.0.1:8080`, `DATABASE_PATH` vaut
`data/habits.sqlite`, `AUTH_MODE` vaut `disabled` par défaut. La base active doit
rester sur disque local. [Authentification](docs/auth.md),
[connecteurs et exemples HA](docs/integrations.md).

## Arborescence

```text
src/
├── main.rs, lib.rs, config.rs
├── modules/
│   ├── auth/, users/, habits/, entries/, schedules/
│   ├── streaks/, statistics/, gamification/
│   └── integrations/{strava/,home_assistant/}
├── infrastructure/
│   ├── database/{mod,auth,tracking,integrations,jobs}.rs
│   ├── jobs/mod.rs
│   ├── security/{mod,cipher,oidc}.rs
│   └── integrations.rs
└── http/{routes,middleware,auth,tracking,integrations}.rs
migrations/000{1_initial,2_auth,3_events_projections,4_integrations_jobs}.sql
tests/fixtures/    scripts/    docs/    .github/workflows/ci.yml
```

Les règles métier n'importent ni Axum ni SQLx ni Reqwest. Les handlers délèguent
aux services et adaptateurs ; les transactions SQLx regroupent les écritures.
Choix complémentaires : [décisions de l'itération 2](docs/decisions-iteration-2.md).

## API v1

Healthchecks internes sans token : `GET /health/live` et `/health/ready`.
À garder inaccessibles depuis l'entrée publique NPMplus.

| Routes privées | Fonction |
|---|---|
| `GET /api/v1`, `/api/v1/openapi.json` | Version et contrat |
| `GET/POST /api/v1/habits` | Liste/création |
| `GET/PUT/DELETE /api/v1/habits/{id}` | Lecture, définition future, archivage |
| `GET /api/v1/habits/{id}/versions` | Historique des définitions |
| `GET /api/v1/habits/{id}/exceptions` ; `PUT/DELETE …/exceptions/{date}` | Repos |
| `POST/GET /api/v1/habits/{id}/entries` | Réalisation/liste |
| `GET/PUT/DELETE /api/v1/entries/{id}` | Lecture, correction, annulation |
| `GET …/habits/{id}/statistics` ; `POST …/habits/{id}/recalculate` | Projections et replay |
| `GET /api/v1/gamification`, `/api/v1/gamification/ledger` | XP, niveaux, badges, ledger |
| `GET/POST /api/v1/tokens` ; `DELETE …/tokens/{id}` ; `POST …/tokens/{id}/rotate` | PAT/SA |
| `POST /api/v1/service-accounts` ; `DELETE …/service-accounts/{id}` | Comptes de service |
| `GET /api/v1/integrations` ; `DELETE …/integrations/{id}` | Configuration/révocation locale |
| `PUT …/integrations/home-assistant` ; `POST …/home-assistant/notifications` | HA chiffré/jobs |
| `POST …/integrations/strava/authorize`, `…/strava/sync` ; `PUT …/strava/mappings` | OAuth/synchronisation |
| `GET /api/v1/jobs/{id}` | État sans payload ni credentials |

Les endpoints dédiés `/integrations/strava/callback` et
`/integrations/strava/webhook/{token}` suivent les validations OAuth/webhook,
sans Bearer. Le callback exige un state à usage unique et la destination est
configurée ; le webhook ne supprime rien avant vérification auprès de Strava.

Le [contrat OpenAPI](docs/openapi.json) détaille corps, scopes et réponses.
Les mutations d'entrée et jobs exigent `Idempotency-Key` : rejeu identique sans
nouvelle entrée/XP, conflit 409 si contenu différent. Ressource étrangère : 404 ;
scope insuffisant : 403 ; validation : 422. Erreurs JSON uniformes et
`X-Request-Id` généré côté serveur. Limites : JSON 16 KiB, 120 requêtes/s globales,
64 simultanées, timeout 10 s. Pagination limit 1..100, offset <=100000.

Les dates RFC3339 exigent un offset ; stockage UTC, éligibilité en fuseau IANA
(DST testé). Les fenêtres horaires restent dans une même journée. Les changements
de cible/planning prennent effet à une date future ; type, unité, période et fuseau
restent immuables. Boolean=count/1, duration=seconds, frequency=count entier,
quantity=meters/milliliters/count. Les repos ne comptent ni comme réussites ni
comme échecs et ne cassent pas les séries. Une période atteinte rapporte 10 XP ;
les changements de résultat produisent des compensations dans le ledger.

## Migrations et stockage

SQLx applique automatiquement les quatre migrations et vérifie leurs checksums :

1. `0001_initial.sql` : tables tenant-scoped, identités, habitudes, schedules,
   exceptions, entrées/événements, sources, intégrations, jobs, tokens et ledger.
2. `0002_auth.sql` : bootstrap, désactivation et audit des comptes de service.
3. `0003_events_projections.sql` : définitions versionnées, événements métier,
   projections et ledger compensable ; reprise des événements/XP existants testée.
4. `0004_integrations_jobs.sql` : bail des jobs, hash de payload, révision des
   credentials, states OAuth hashés, mappings et compteurs de quotas.

WAL, FK activées, synchronous=FULL, busy_timeout 5 s ; FK composites et index
uniques assurent isolation et idempotence. Réalisation/événements/projections/XP
sont atomiques sous `BEGIN IMMEDIATE`. Les credentials sont chiffrés AES-256-GCM
avec clé injectée, les PAT et states OAuth sont hashés. Ne pas modifier une
migration déjà appliquée.

## Docker et publication

```sh
docker compose config --quiet
docker compose up --build --detach --wait
docker compose exec -T api /usr/local/bin/habit-tracker bootstrap-local Europe/Paris
AUTH_MODE=local docker compose up --detach --wait
docker compose exec -T api /usr/local/bin/habit-tracker healthcheck
docker compose down
```

UID/GID 10001, rootfs read-only, capabilities supprimées, no-new-privileges,
aucun Docker socket, volume local `/data`, port loopback `HOST_PORT=8080`.
NPMplus termine HTTPS. [Sauvegardes/restauration](docs/operations.md).

La CI construit et publie dans `ghcr.io/<owner>/<repository>` avec `GITHUB_TOKEN`,
après validation Rust/Docker, sur branche par défaut, tags SemVer et déclenchement
manuel ; aucune publication depuis les PR. Images amd64/arm64, tags SHA/SemVer/latest
selon événement. [Conditions exactes](docs/container-publishing.md).
Aucun push réel n'a été réalisé depuis ce dépôt sans remote GitHub.

## Vérification

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
cargo run --locked -- openapi > /tmp/openapi.json
diff -u docs/openapi.json /tmp/openapi.json
python3 scripts/check_domain_boundaries.py
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --deny warnings
cargo install cargo-deny --version 0.20.2 --locked
cargo deny --locked check
actionlint
python3 scripts/docker_smoke.py
```

Le smoke utilise son propre projet/volume éphémère et vérifie aussi PAT local,
check-in, idempotence, XP et restauration. Les fixtures ne sont jamais chargées
dans une base runtime. Preuves et limites : [validation](docs/validation.md).
Travail restant ordonné et aligné Notion : [TODO-MVP](TODO-MVP.md).
Licence MIT.
