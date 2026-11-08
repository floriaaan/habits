# syntax=docker/dockerfile:1
FROM rust:1.99.1-bookworm@sha256:9181b56c2a21ab1d5e73cffe04fc762426d30aa7fac3c91141dd033f49a7fc8b AS dependencies
WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock backend/rust-toolchain.toml ./
# This repository has one binary and no build script. Cache its dependencies in
# an exported layer; ephemeral cache mounts are not included in the GHA cache.
RUN mkdir src && printf 'fn main() {}\n' > src/main.rs \
    && cargo build --locked --release \
    && rm -rf src target/release/habit-tracker target/release/deps/habit_tracker-*

FROM dependencies AS build
COPY backend/migrations ./migrations
COPY backend/src ./src
RUN cargo build --locked --release && cp target/release/habit-tracker /usr/local/bin/habit-tracker

FROM debian:bookworm-slim@sha256:99c0b25c46d0214d5a2091092e7908907dcaecd6a962cde0ac700acee222b6f3 AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir /data && chown 10001:10001 /data && chmod 700 /data
COPY --from=build /usr/local/bin/habit-tracker /usr/local/bin/habit-tracker
COPY LICENSE THIRD-PARTY-NOTICES.md /usr/share/doc/habit-tracker/
COPY licenses /usr/share/doc/habit-tracker/licenses
USER 10001:10001
WORKDIR /data
ENV LISTEN_ADDR=0.0.0.0:8080 DATABASE_PATH=/data/habits.sqlite AUTH_MODE=disabled
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["/usr/local/bin/habit-tracker", "healthcheck"]
ENTRYPOINT ["/usr/local/bin/habit-tracker"]
