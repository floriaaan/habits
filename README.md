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
      OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: ${OTEL_EXPORTER_OTLP_LOGS_ENDPOINT:-}
      OTEL_EXPORTER_OTLP_LOGS_HEADERS: ${OTEL_EXPORTER_OTLP_LOGS_HEADERS:-}
      OTEL_SERVICE_NAME: ${OTEL_SERVICE_NAME:-habit-tracker}
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

For each setting and where to obtain it, see [Environment variables](#environment-variables).

Create your habits in **HA → Settings → Devices & services → Habit Tracker → Configure**.
The seven presets are editable before confirmation; custom habits are supported.
This requires `habits:write` on the HA token. Cards also have a visual Lovelace editor.

## Development

### Clone the backend and HA client

The HA client is pinned as a Git submodule in the backend repository.

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

## Environment variables

Examples are illustrative: replace `example.com` domains, IDs and `<…>` placeholders
with your own values. No ready-to-use secrets are provided. Without OIDC, Strava
or outbound HA notifications, the installation Compose values are sufficient.

| Name | Example value | Purpose | How to obtain |
| --- | --- | --- | --- |
| `HABIT_TRACKER_TAG` | `latest` | GHCR image tag, used by Compose. | [Choose an image](#docker-and-api) |
| `HOST_BIND` | `127.0.0.1` | Published port's bind address on the Docker host. | [Choose an address](#docker-and-api) |
| `HOST_PORT` | `8080` | Published port on the Docker host. | [Choose a port](#docker-and-api) |
| `LISTEN_ADDR` | `0.0.0.0:8080` | API listen address inside the container. | [Configure the API](#docker-and-api) |
| `DATABASE_PATH` | `/data/habits.sqlite` | SQLite database path inside the container. | [Choose storage](#docker-and-api) |
| `RUST_LOG` | `habit_tracker=info,tower_http=info` | Application log filter. | [Choose logging](#docker-and-api) |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | `http://alloy:4318/v1/logs` | Optional full OTLP HTTP logs receiver URL. | [Obtain the endpoint](#observability) |
| `OTEL_EXPORTER_OTLP_LOGS_HEADERS` | `Authorization=Bearer%20<collector-token>` | Optional collector authentication headers. | [Obtain headers](#observability) |
| `OTEL_SERVICE_NAME` | `habit-tracker` | Collector service label. | [Choose a label](#observability) |
| `AUTH_MODE` | `local` | `local` authentication (`tokens` alias), `oidc`, or closed routes with `disabled`. | [Choose a mode](#authentication) |
| `OIDC_ISSUER` | `https://id.example.com` | Provider's exact HTTPS issuer. | [Read OIDC settings](#oidc) |
| `OIDC_AUDIENCE` | `habit-tracker-api` | Expected access token audience for this API. | [Confirm the audience](#oidc) |
| `OIDC_JWKS_URL` | `https://id.example.com/.well-known/jwks.json` | HTTPS URL of public signing keys. | [Read OIDC settings](#oidc) |
| `OIDC_ALLOWED_ALGORITHMS` | `RS256` | Comma-separated allowlist from `RS256`, `ES256`, `EdDSA`. | [Confirm signing](#oidc) |
| `OIDC_ACCESS_TOKEN_TYP` | `at+jwt` | Access JWT type required by this API. | [Verify the contract](#oidc) |
| `ENCRYPTION_KEY` | `<base64-of-32-random-bytes>` | AES-256-GCM key for connector credentials. | [Generate a key](#encryption) |
| `ENCRYPTION_KEY_ID` | `key-1` | This key's identifier, 1–64 bytes. | [Choose an identifier](#encryption) |
| `STRAVA_CLIENT_ID` | `12345` | Your Strava application's ID. | [Create an application](#strava-oauth) |
| `STRAVA_CLIENT_SECRET` | `<secret-from-strava>` | Application's OAuth secret. | [Get the secret](#strava-oauth) |
| `STRAVA_REDIRECT_URI` | `https://habits.example.com/integrations/strava/callback` | Fixed HTTPS callback for each athlete's authorization. | [Configure the callback](#strava-oauth) |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | `<generated-verification-secret>` | Value checked during the subscription challenge. | [Generate and register](#strava-webhook) |
| `STRAVA_WEBHOOK_PATH_TOKEN` | `<generated-path-secret>` | Secret in the webhook URL, at least 32 URL-safe characters. | [Generate the path](#strava-webhook) |
| `STRAVA_SUBSCRIPTION_ID` | `67890` | Expected webhook subscription ID. | [Create a subscription](#strava-webhook) |
| `STRAVA_ATHLETE_CAPACITY` | `1` | Maximum connected athletes permitted for the application. | [Check capacity](#strava-oauth) |
| `STRAVA_MULTI_ATHLETE_APPROVED` | `false` | `true` required when configured capacity exceeds 1. | [Confirm access](#strava-oauth) |
| `HOME_ASSISTANT_URL` | `https://ha.example.com/` | HA URL for outbound backend notifications. | [Get the HA URL](#home-assistant) |
| `HOME_ASSISTANT_ALLOW_HTTP` | `false` | `true` explicitly allows a trusted local HTTP connection to HA. | [Choose a protocol](#home-assistant) |

### Docker and API

Choose `HABIT_TRACKER_TAG` from the published
[GHCR image tags](https://github.com/floriaaan/habits/pkgs/container/habits): `latest`
for the latest image, or `sha-<full-commit>` to pin a version.
`HOST_BIND` and `HOST_PORT` depend on your reverse proxy and available host ports;
the `127.0.0.1:8080` loopback default suits a proxy running on the same host.
A containerized proxy can share the API network and target `api:8080`.

Keep `LISTEN_ADDR=0.0.0.0:8080` and `DATABASE_PATH=/data/habits.sqlite` in Docker
to listen on the container network and use the local volume. Outside Docker,
choose an appropriate local address and local disk path. Keep `RUST_LOG` at
`info` or use `error` for fewer logs; it never hides the initial `local_bootstrap`
line containing the token.

Compose automatically reads the `.env` next to `compose.yaml` for `${…}` values.
`LISTEN_ADDR` and `DATABASE_PATH` are fixed in the snippet: edit them directly
under `environment` if needed. `cargo run` requires exported environment variables
and does not read `.env`. After changing Compose variables, recreate the service
with `docker compose up --detach --wait`.

### Observability

Set `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` to the collector's complete OTLP HTTP
logs URL, for example `http://alloy:4318/v1/logs` on your trusted Docker network.
Ask the collector administrator for the endpoint and any authentication headers.
Use HTTPS outside a trusted local network. `OTEL_EXPORTER_OTLP_LOGS_HEADERS`
uses the SDK's comma-separated `key=value` format; keep credentials in your
secret environment. Choose an `OTEL_SERVICE_NAME` label, default `habit-tracker`.
Leave the endpoint empty to keep console-only logging.

JSON console logs remain enabled. Request IDs correlate request start, scoped
use cases, errors and response status/duration. The exporter batches in a bounded
queue and flushes at shutdown; collector failures do not block API readiness.
Delivery is best effort: unavailable collectors or a full queue can lose exports,
while console logs remain available. This exports logs, not distributed traces
or metrics. See [collector setup and limits](docs/observability.md).

### Authentication

`AUTH_MODE=local` needs no provider: get the first token from startup logs, then
use the [token CLI or API](docs/auth.md) to issue dedicated PATs and service account
tokens. `AUTH_MODE=disabled` rejects all private requests, even with a valid token.
That is the standalone binary's default; the README Compose chooses `local`.
For `oidc`, configure all five settings below; keep them all empty in other modes.
An OIDC outage never automatically switches to `local`.

### OIDC

Open your provider's `/.well-known/openid-configuration` document and copy
**`issuer`** into `OIDC_ISSUER` and **`jwks_uri`** into `OIDC_JWKS_URL`, preserving
paths and trailing slashes. Pocket ID documents these endpoints in its
[OIDC connection guide](https://pocket-id.org/docs/setup/connect-an-app).
Both URLs must use HTTPS and be reachable from the backend.

Ask your provider administrator to confirm the `aud` value of **access tokens
intended for this API** and their signing algorithm. Set `OIDC_AUDIENCE` and a
minimal `OIDC_ALLOWED_ALGORITHMS` allowlist accordingly. The audience is not
automatically an application's client ID. `OIDC_ACCESS_TOKEN_TYP` must be exactly
`at+jwt`, and the issued JWT must actually declare that `typ`: setting the variable
does not convert an incompatible token. An ID token is unsuitable. Stay in local
mode if this contract is unavailable. The backend does not initiate OIDC login
or perform automatic discovery; see the [full contract](docs/auth.md#oidc-optionnel).

### Encryption

For Strava or outbound HA notifications, generate a base64-encoded 32-byte key
**once**, then set `ENCRYPTION_KEY` to its output through your secret manager or
an untracked local `.env`:

```sh
openssl rand -base64 32
```

Choose a stable identifier such as `key-1` for `ENCRYPTION_KEY_ID` and keep the two
values together. Leave both empty when no connector is used. Back up the key
separately from SQLite. Replacing the key or its ID makes existing credentials
unreadable; automatic rotation is not implemented.

### Strava OAuth

1. Create an application in [Strava — My API Application](https://www.strava.com/settings/api),
   then copy its **Client ID** and **Client Secret**. See the
   [official guide](https://developers.strava.com/docs/getting-started/).
2. Choose your public HTTPS backend URL. Set the Strava application's callback
   domain to its host and `STRAVA_REDIRECT_URI` to the complete URL ending in
   `/integrations/strava/callback`. See [Strava OAuth](https://developers.strava.com/docs/authentication/).
3. Read the capacity actually granted in Strava's API settings. Keep
   `STRAVA_ATHLETE_CAPACITY=1` for your own account; for more athletes, obtain the
   required access from Strava and set the granted capacity with
   `STRAVA_MULTI_ATHLETE_APPROVED=true`. This boolean does not request access
   from Strava. See [application capacity](https://developers.strava.com/docs/rate-limits/#athlete-capacity).

Also enable encryption and configure the webhook secrets below. Without Strava,
leave **all** `STRAVA_*` variables empty, including capacity and the boolean:
any nonempty value triggers validation of the whole group. Each athlete's
access/refresh tokens come from the [API's OAuth flow](docs/integrations.md#strava),
not environment variables.

### Strava webhook

1. Run `openssl rand -hex 32` **twice**: use one value for
   `STRAVA_WEBHOOK_VERIFY_TOKEN` and another for `STRAVA_WEBHOOK_PATH_TOKEN`.
2. Start the backend with Strava settings and encryption configured, initially
   leaving `STRAVA_SUBSCRIPTION_ID` empty. Register your backend's HTTPS callback
   `/integrations/strava/webhook/<STRAVA_WEBHOOK_PATH_TOKEN>` with Strava and use
   the same `verify_token` as `STRAVA_WEBHOOK_VERIFY_TOKEN`.
3. Copy the subscription response's `id` into `STRAVA_SUBSCRIPTION_ID`, then recreate
   the container. Webhook POSTs are rejected until that ID is configured.

Create/view the subscription through Strava's `push_subscriptions` API:
[official procedure](https://developers.strava.com/docs/webhooks/#subscriptions).
Keep the path secret out of reverse proxy logs.

### Home Assistant

Set `HOME_ASSISTANT_URL` to your instance's URL **reachable from the backend**,
ideally HTTPS with a trailing `/`. Keep `HOME_ASSISTANT_ALLOW_HTTP=false`, unless
you explicitly choose `true` for a trusted local HTTP connection. Also configure
encryption.

To authorize outbound notifications, create a long-lived token under
**HA profile → Security → Long-lived access tokens**, as described in
[HA authentication](https://contributors.home-assistant.io/core/internals/auth-api/#long-lived-access-tokens).
Register it through `PUT /api/v1/integrations/home-assistant`; there is no HA token
environment variable. See [backend-to-HA setup](docs/integrations.md#home-assistant).

These variables are unnecessary for HACS cards: configure the HA integration
with the **backend** URL and a **Habit Tracker** token in HA's UI instead.

## Reference

[API contract](docs/openapi.json) · [Authentication](docs/auth.md) ·
[Integrations](docs/integrations.md) · [Operations](docs/operations.md) ·
[Architecture / ADR-001](docs/adr/ADR-001-backend-rust.md) ·
[Validation](docs/validation.md) · [MVP backlog](TODO-MVP.md)

Detailed technical documents are currently in French. MIT license — [LICENSE](LICENSE).
