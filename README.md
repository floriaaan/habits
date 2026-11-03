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

## Getting started — production

### 1. Get the production Compose file

You need Docker Engine with Docker Compose and access to the GHCR image.
Download [compose.production.yaml](compose.production.yaml) into your deployment
directory. This is the only project file required: no Rust installation, source
checkout or image build. Run the following commands beside that file.

The image is `ghcr.io/floriaaan/habits:latest`, available for AMD64 and ARM64.
Docker selects the platform automatically.

### 2. Pull the image

If the GHCR package is private, sign in first:

```sh
docker login ghcr.io
```

Enter your GitHub username and a GitHub personal access token **(classic)** with
`read:packages` and access to the package at the password prompt. This registry
credential is separate from the Habit Tracker API token. See
[GitHub's registry authentication guide](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry).

```sh
docker compose -f compose.production.yaml pull
```

### 3. Create the local user and start the API

On a **new installation**, run the bootstrap once, then start the service:

```sh
docker compose -f compose.production.yaml run --rm --no-deps api bootstrap-local Europe/Paris
docker compose -f compose.production.yaml up --detach --wait
docker compose -f compose.production.yaml exec -T api /usr/local/bin/habit-tracker healthcheck
```

Choose your own IANA time zone instead of `Europe/Paris` if needed. Bootstrap
prints a JSON response with `token` and `metadata.user_id`. Save the token in a
password manager: its secret is shown only at issuance and expires after **24 hours**.
Do not rerun bootstrap on an existing installation; use the token-management CLI
or API instead. Migrations run automatically.

Production Compose defaults to `AUTH_MODE=local`: one persistent user, with a valid
Bearer token required for every private API request. No Pocket ID setup is needed.
`AUTH_MODE=disabled` explicitly closes private routes; it never enables anonymous access.

### 4. Connect your clients

The API listens at `http://127.0.0.1:8080` on the Docker host. For Home Assistant
or remote clients, put it behind your HTTPS reverse proxy, such as NPMplus:

- A proxy on the host can target `127.0.0.1:8080`. A containerized proxy must share
  the API's Docker network and can target `api:8080`.
- Keep `/health/*` internal. For `/api/v1/dashboard/events`, disable proxy buffering
  and allow long connections (`proxy_read_timeout 75s` with Nginx).
- Give Home Assistant a backend URL reachable **from HA**, without `/api/v1`.
  Follow the [HA installation guide](https://github.com/floriaaan/habit-tracker-ha#installation).

For a first habit, load the bootstrap token into `HABIT_TOKEN` from your secret
manager, then run this on the Docker host:

```sh
curl --fail http://127.0.0.1:8080/api/v1/habits \
  -H "Authorization: Bearer $HABIT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Reading","category":"mind","kind":"boolean","unit":"count","target":1,"timezone":"Europe/Paris"}'
```

For ongoing HA use, issue a dedicated token with `habits:read`, `statistics:read`
and `entries:write`. Set `HABIT_USER_ID` to the bootstrap's `metadata.user_id` and
`HABIT_EXPIRES_AT` to a future RFC 3339 UTC timestamp within 365 days:

```sh
docker compose -f compose.production.yaml exec -T api \
  /usr/local/bin/habit-tracker token-create "${HABIT_USER_ID:?}" \
  'habits:read,statistics:read,entries:write' "${HABIT_EXPIRES_AT:?}"
```

Use the returned `token` in HA. This is a Habit Tracker token, not a GitHub or HA
long-lived access token. [Authentication and rotation](docs/auth.md) covers other clients.

### Configuration, updates and data

An optional `.env` beside the production file can override these defaults:

```dotenv
AUTH_MODE=local
HABIT_TRACKER_TAG=latest
HOST_BIND=127.0.0.1
HOST_PORT=8080
```

Use a published `sha-<full-commit>` tag to pin a deployment. The
[configuration reference](.env.example) lists optional OIDC and integration
settings; production Compose already sets the internal database path and address.
If you copy `.env.example`, set `AUTH_MODE=local` for this walkthrough: that
example otherwise leaves private routes disabled.
Strava and outbound HA notifications need additional configuration; reading and
updating habits from HA does not require the outbound HA connector.

To update, back up the database, then pull and recreate the service:

```sh
docker compose -f compose.production.yaml pull
docker compose -f compose.production.yaml up --detach --wait
docker compose -f compose.production.yaml logs --tail=100 api
```

SQLite lives in the local `habit_data` volume, mounted at `/data`. `down` preserves
it; `down --volumes` deletes it. Keep the active database on local disk.
[Backup and restore](docs/operations.md) describes consistent SQLite snapshots.
The container runs as UID/GID 10001 with a read-only root filesystem and no capabilities.

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
task dev:bootstrap TIMEZONE=Europe/Paris   # Once, on the development database
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
cargo run --locked -- bootstrap-local Europe/Paris
AUTH_MODE=local cargo run --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

`compose.yaml` builds the image locally; `compose.production.yaml` only pulls GHCR.
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
