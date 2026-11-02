# Habit Tracker

Socle de backend REST Rust pour le MVP 0.1.0, sans frontend. Monolithe modulaire
Axum/Tokio/Tower, SQLite/SQLx, OpenAPI utoipa, logs JSON tracing.
[ADR-001](docs/adr/ADR-001-backend-rust.md) est la source de vérité.

**État : première itération, authentification de production non implémentée.**
Les routes privées retournent systématiquement **401**, avec ou sans Bearer.
Le parcours création/listage d'habitudes et check-in/lecture est fonctionnel
au niveau services et HTTP avec un authentificateur uniquement compilé pour
les tests. Aucun mode debug ou en-tête ne permet d'y accéder dans le binaire.
Les healthchecks restent utilisables. Ce socle n'est pas le MVP complet.

## Démarrage local

Prérequis : rustup, compilateur C et CMake (SQLite embarqué, Rustls/aws-lc).
La toolchain 1.99.1 et les versions des crates sont fixées ; Cargo.lock est livré.
Installer CMake avec le gestionnaire de paquets de la machine si nécessaire.

```sh
rustup toolchain install 1.99.1 --profile minimal --component rustfmt --component clippy
cargo run --locked
curl --fail http://127.0.0.1:8080/health/ready
curl -i http://127.0.0.1:8080/api/v1/habits  # 401 attendu
```

Configuration env typée et validée :

- `LISTEN_ADDR` : IP:port, défaut `127.0.0.1:8080`.
- `DATABASE_PATH` : fichier SQLite local, défaut `data/habits.sqlite`, parent créé.
- `AUTH_MODE` : uniquement `disabled`, qui **ferme** toutes les routes privées.
- `RUST_LOG` : défaut `habit_tracker=info,tower_http=info`.

`.env.example` ne contient ni compte ni secret réel. `cargo run` ne charge pas
automatiquement `.env` ; exporter les variables nécessaires. Compose ne reprend
que `HOST_PORT` depuis son environnement/.env et fixe les chemins internes.
Ne pas mettre la base active sur NFS/SMB ou un volume réseau.

## Arborescence

```text
src/
├── main.rs                     # démarrage, signaux, CLI healthcheck/backup/openapi
├── lib.rs
├── config.rs
├── modules/
│   ├── mod.rs                  # erreurs métier
│   ├── auth/mod.rs             # Principal, modes et scopes ; pas de vérificateur
│   ├── users/mod.rs            # User, UserId et identité externe stable
│   ├── habits/mod.rs           # types, validation, service, repository
│   ├── entries/mod.rs          # types, validation, service, repository
│   ├── schedules/mod.rs        # jours, fenêtres et dates IANA
│   ├── streaks/mod.rs          # réservé, non implémenté
│   ├── statistics/mod.rs       # réservé, non implémenté
│   ├── gamification/mod.rs     # contrat ledger, services non implémentés
│   └── integrations/
│       ├── mod.rs              # politique du client sortant Reqwest
│       ├── strava/mod.rs       # réservé, non implémenté
│       └── home_assistant/mod.rs # réservé, non implémenté
├── infrastructure/
│   ├── mod.rs
│   ├── database/mod.rs         # adaptateurs SQLx et transactions
│   ├── database/tests.rs       # services sur SQLite réel
│   ├── jobs/mod.rs             # types et schéma, pas de worker
│   └── security/mod.rs         # fermé par défaut
└── http/
    ├── mod.rs
    ├── routes.rs               # handlers et OpenAPI
    ├── middleware.rs           # erreurs, request_id, limites, refus d'auth
    └── tests.rs                # tests HTTP, seul authentificateur synthétique
migrations/0001_initial.sql
tests/fixtures/{users.sql,habit.json,entry.json}
scripts/{check_domain_boundaries.py,docker_smoke.py}
docs/{auth.md,operations.md,decisions-iteration-1.md,dependencies.md,openapi.json,validation.md}
.github/workflows/ci.yml
Cargo.toml, Cargo.lock, rust-toolchain.toml, Dockerfile, compose.yaml, deny.toml
```

Le domaine ne dépend ni d'Axum, ni de SQLx, ni de Reqwest. Les deux interfaces
de persistance sont consommées par les services et implémentées dans l'adaptateur
SQLite ; aucune abstraction de transport dans le domaine.

## Routes et contrats

Routes opérationnelles sans authentification, à garder internes à NPMplus :

- `GET /health/live` : 200 tant que le processus répond.
- `GET /health/ready` : 200 si SQLite répond, sinon 503.

Routes câblées, actuellement fermées par le middleware de production :

- `GET /api/v1` : version.
- `GET /api/v1/openapi.json` : document OpenAPI, sans interface web.
- `POST /api/v1/habits` : création, scope `habits:write`.
- `GET /api/v1/habits?limit=20&offset=0` : liste isolée, scope `habits:read`.
- `POST /api/v1/habits/{habit_id}/entries` : check-in, scope `entries:write`.
- `GET /api/v1/habits/{habit_id}/entries` : liste, scope `entries:read`.
- `GET /api/v1/entries/{entry_id}` : lecture, scope `entries:read`.

Le comportement métier de ces handlers est exercé dans les tests HTTP :
201 à la création, 200 au rejeu identique, 409 si la même clé change de contenu,
404 pour une ressource absente ou étrangère, 403 si scope insuffisant, 422 pour
entrée invalide, 413 au-delà de 16 KiB, 429 au-delà de 120 requêtes/s globales,
503 sur indisponibilité de stockage, 504 au-delà du budget de 10 secondes.
Concurrence bornée à 64. Pagination : limit 1..100, offset <= 100000.

Contrat d'habitude (exemple de données, pas une commande fonctionnelle en runtime) :

```json
{"name":"Running","kind":"quantity","unit":"meters","target":5000,"timezone":"Europe/Paris","schedule":{"weekdays":[1,3,5],"start":"06:00:00","end":"22:00:00"}}
```

Contrat de check-in : en-tête `Idempotency-Key` requis (1..128 ASCII visibles),
corps `{"occurred_at":"2026-03-28T23:30:00Z","value":5000}`. Un offset RFC3339
explicite est obligatoire. L'API normalise l'instant en UTC et calcule sa date
dans le fuseau de l'habitude. Les champs inconnus, dont user_id/source, sont refusés.
Boolean : count/cible 1/entrée 1 ; duration : seconds ; frequency : count avec
cible entière et entrées unitaires ; quantity : meters, milliliters ou count.
Seules les périodes quotidiennes sont implémentées.

Toutes les erreurs ont la forme suivante, avec le même identifiant que
l'en-tête `X-Request-Id`, généré par le serveur sans faire confiance au client :

```json
{"error":{"code":"unauthorized","message":"Valid authentication required","request_id":"<UUID>"}}
```

Export hors ligne, sans connexion base ni secrets :

```sh
cargo run --locked -- openapi > docs/openapi.json
```

## Migrations et invariants

`0001_initial.sql` crée users, habits, schedules, schedule_exceptions, entries,
entry_events, source_identifiers, integrations, jobs, xp_ledger, service_accounts,
access_tokens et auth_audit. SQLx embarque la migration et enregistre son checksum
dans `_sqlx_migrations`. Le démarrage la rejoue sans recréer les tables déjà migrées ;
ne pas exécuter manuellement le SQL plusieurs fois ni modifier une migration appliquée.

WAL, foreign_keys=ON, synchronous=FULL, busy_timeout 5 s sur toutes les connexions.
FK composites tenant/objet, identité provider unique, clés événements/sources/jobs
uniques. Écriture atomique entrée + événement sous `BEGIN IMMEDIATE`, testée sous
rejeux concurrents et erreur d'insertion. Aucun XP ni agrégat n'est actuellement
calculé : les futurs calculateurs et compensations doivent intégrer cette transaction.

Les tables futures ne sont pas la preuve de fonctionnalités livrées : pas de
worker de jobs, de chiffrement OAuth, de PAT utilisable, de streak/heatmap ou de XP.
Voir [les décisions](docs/decisions-iteration-1.md) et [TODO-MVP](TODO-MVP.md).

## Docker

```sh
docker compose config --quiet
docker compose up --build --detach --wait
docker compose logs --follow api
docker compose exec -T api /usr/local/bin/habit-tracker healthcheck
docker compose down  # conserve le volume
```

Le conteneur utilise UID/GID 10001, rootfs en lecture seule, capabilities supprimées,
no-new-privileges, aucun socket Docker, volume Docker **local** `/data`. Port publié
sur loopback seulement, `HOST_PORT=8080` par défaut. Pour NPMplus, utiliser un réseau
Docker privé ou un accès hôte adapté, terminer HTTPS et refuser `/health/*` côté public.
Ne pas monter de volume réseau ou activer privileged pour résoudre un problème de droits.
Les images de base sont fixées par digest ; revoir régulièrement leurs mises à jour.

Sauvegarde, restauration et rétention : [docs/operations.md](docs/operations.md).

## Vérification

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
python3 scripts/check_domain_boundaries.py
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --deny warnings
cargo install cargo-deny --version 0.20.2 --locked
cargo deny --locked check
python3 scripts/docker_smoke.py
```

Les fixtures sont strictement de test, injectées dans une base temporaire par
test. Le binaire et les migrations n'initialisent aucun compte. Les tests
vérifient le refus de l'auth runtime, les droits objet/scopes, les validations,
les rejouages concurrents, l'atomicité, les dates/DST, les repos, OpenAPI et la
restauration de données. Le smoke Docker crée et supprime uniquement son propre
projet/volume éphémère. La CI exécute ces contrôles sur push/PR et chaque semaine.

Résultats réellement obtenus et limites : [docs/validation.md](docs/validation.md).
Pour contribuer, suivre ADR-001 et ne pas annoncer les intégrations complètes
avant leurs tests réels. Licence MIT.
