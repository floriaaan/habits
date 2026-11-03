# Habit Tracker

**Self-hosted habit tracking, built for Home Assistant and automation.**

English · [Français](README.fr.md)

Habit Tracker is a Rust REST API backed by SQLite. Track daily routines and sport,
record check-ins, and follow goals, streaks, statistics and XP. Boolean, quantity,
duration and frequency habits support schedules, rest days and IANA time zones.

Use the API from scripts or connect the
[Home Assistant integration and cards](https://github.com/floriaaan/habit-tracker-ha).
Pocket ID/OIDC, Strava and outbound Home Assistant notifications are optional.
The backend has no standalone web interface.

## Getting started

With Docker and Docker Compose installed, save this block as **`compose.yaml`**
in your deployment directory. The GHCR image supports AMD64 and ARM64; no build
is required. All runtime environment variables are defined below; leave optional
groups empty when unused.

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

If the GHCR package is private, first run `docker login ghcr.io` with your GitHub
username and a classic GitHub PAT with `read:packages`. Then start the API:

```sh
docker compose up --detach --wait
docker compose logs api
```

On the first startup in `local` mode, the backend creates the user and prints a
JSON line with **`event: local_bootstrap`**, `token` and `metadata.user_id`.
No bootstrap command is required. This token expires after **24 hours**: save it
and create dedicated client tokens using [token management](docs/auth.md).
It is never printed or regenerated on restart, even after expiration or revocation.
First-start logs therefore contain a secret; restrict access to operators.
Only the token hash is stored in the database.

The API listens on `127.0.0.1:8080` and requires a valid Bearer token. For remote
access, use your HTTPS reverse proxy; keep healthchecks internal and allow SSE
without buffering. The backend URL must be reachable from the HA server:
[HACS installation](https://github.com/floriaaan/habit-tracker-ha#installation).

OIDC, Strava and outbound HA notifications are optional; configure their groups
in the snippet or via `.env`. See [authentication](docs/auth.md) and
[connectors](docs/integrations.md). Data stays in `habit_data`;
`down --volumes` deletes it. To update, [back up first](docs/operations.md), then
run `docker compose pull && docker compose up --detach --wait`.

## Development

### Clone the backend and HA client

The backend repository is private; GitHub access is required. The public HA
client is pinned as a Git submodule.

```sh
git clone --recurse-submodules https://github.com/floriaaan/habits.git
cd habits
# For an existing clone:
git submodule update --init --recursive
```

### Develop inside Docker with Task

Install Docker Compose and [Task](https://taskfile.dev/docs/installation).
The development service uses the official Rust image directly, with the source
mounted into it. There is no development image to build and no host Rust requirement.

```sh
AUTH_MODE=local task dev
```

The API is available at `http://127.0.0.1:8080`. After editing Rust, stop with
Ctrl+C and rerun `task dev`; Cargo recompiles the changed code. Development data
uses `data/dev/`, and Linux build caches use `target/docker/`, separate from production.
If production is running on the same host port, use `HOST_PORT=8081` for development.

```sh
task dev:test
task dev:cargo -- fmt --all -- --check
task dev:cargo -- clippy --locked --all-targets --all-features -- -D warnings
task dev:shell
```

### Develop with a local Rust toolchain

Install Rust **1.99.1**, a C compiler and CMake. Dependencies are pinned in `Cargo.lock`.
`cargo run` does not load `.env`; export the variables you need.

```sh
AUTH_MODE=local cargo run --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

The repository’s `compose.yaml` builds locally; the installation snippet above pulls GHCR.
`python3 scripts/docker_smoke.py` tests a separate local build and temporary volume.
CI also checks audit/deny, OpenAPI, domain boundaries and both native image platforms.

### Work on the HA client

Edit `integrations/home-assistant/habit-tracker-ha`. Commit and push in that
repository first, then commit its updated pointer in the backend. The
[HA development guide](docs/home-assistant-connected.md) covers installation,
card synchronization and real HA tests. JavaScript changes need a browser reload;
Python integration changes need an appropriate HA reload or restart.

## Reference

[API contract](docs/openapi.json) · [Authentication](docs/auth.md) ·
[Integrations](docs/integrations.md) · [Operations](docs/operations.md) ·
[Architecture / ADR-001](docs/adr/ADR-001-backend-rust.md) ·
[Validation](docs/validation.md) · [MVP backlog](TODO-MVP.md)

Detailed technical documents are currently in French. MIT license — [LICENSE](LICENSE).
