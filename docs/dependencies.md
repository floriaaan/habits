# Dépendances vérifiées

Vérification le 2026-11-02 auprès de l’API crates.io (versions stables, non retirées).
Toolchain stable : Rust 1.99.1, manifeste officiel daté 2026-10-15.

| Crate | Version | MSRV publiée |
|---|---|---|
| [axum](https://crates.io/crates/axum/0.8.9) | 0.8.9 | 1.80 |
| [tokio](https://crates.io/crates/tokio/1.54.1) | 1.54.1 | 1.85 |
| [tower](https://crates.io/crates/tower/0.5.3) | 0.5.3 | 1.64.0 |
| [tower-http](https://crates.io/crates/tower-http/0.7.1) | 0.7.1 | 1.65 |
| [sqlx](https://crates.io/crates/sqlx/0.9.0) | 0.9.0 | 1.94.0 |
| [serde](https://crates.io/crates/serde/1.0.229) | 1.0.229 | 1.56 |
| [serde_json](https://crates.io/crates/serde_json/1.0.154) | 1.0.154 | 1.71 |
| [utoipa](https://crates.io/crates/utoipa/6.0.0) | 6.0.0 | 1.88 |
| [reqwest](https://crates.io/crates/reqwest/0.13.5) | 0.13.5 | 1.85.0 |
| [tracing](https://crates.io/crates/tracing/0.1.44) | 0.1.44 | 1.65.0 |
| [tracing-subscriber](https://crates.io/crates/tracing-subscriber/0.3.23) | 0.3.23 | 1.65.0 |
| [chrono](https://crates.io/crates/chrono/0.4.45) | 0.4.45 | 1.62.0 |
| [chrono-tz](https://crates.io/crates/chrono-tz/0.10.4) | 0.10.4 | 1.65 |
| [uuid](https://crates.io/crates/uuid/1.29.0) | 1.29.0 | 1.89.0 |
| [thiserror](https://crates.io/crates/thiserror/2.0.21) | 2.0.21 | 1.77 |
| [tempfile](https://crates.io/crates/tempfile/3.27.0) | 3.27.0 | 1.63 |
| [http-body-util](https://crates.io/crates/http-body-util/0.1.5) | 0.1.5 | 1.61 |
| [sha2](https://crates.io/crates/sha2/0.11.1) | 0.11.1 | 1.88 |
| [getrandom](https://crates.io/crates/getrandom/0.4.3) | 0.4.3 | 1.85 |
| [base64](https://crates.io/crates/base64/0.23.1) | 0.23.1 | 1.71.0 |
| [aes-gcm](https://crates.io/crates/aes-gcm/0.11.1) | 0.11.1 | 1.85 |
| [zeroize](https://crates.io/crates/zeroize/1.9.1) | 1.9.1 | 1.85 |
| [jsonwebtoken](https://crates.io/crates/jsonwebtoken/11.1.0) | 11.1.0 | 1.88.0 |

Cargo.lock fixe aussi les transitives. Les écarts de versions transitives sont
inspectés par cargo audit et cargo deny ; aucun advisory ignoré par défaut.
SQLx utilise exclusivement le backend SQLite ; les noms d’autres drivers
peuvent figurer dans le lock des macros sans être compilés dans le binaire.

Pour les mises à jour : vérifier MSRV/changelog/advisories, actualiser Cargo.lock,
toolchain et images, puis répéter fmt/clippy/test/release et smoke Docker.

## Revue des licences et des doublons

Le premier cargo deny a refusé `webpki-root-certs` 1.0.11 car sa licence
CDLA-Permissive-2.0 n'était pas dans la liste autorisée. Le texte LICENSE de la
crate a été lu : utilisation/modification/partage autorisés avec conservation
du texte lors du partage des données. La licence est explicitement autorisée,
sans ignorer un advisory, et copiée dans `licenses/` ainsi que l'image runtime.

Doublons transitifs revus et laissés visibles comme avertissements : base64
0.22/0.23 (SQLx/Reqwest), hashbrown 0.16/0.17 (hashlink/indexmap), syn 2/3
(macros de différentes générations), tower-http 0.6/0.7 (Reqwest/application),
block-buffer 0.10/0.12, cpufeatures 0.2/0.3, crypto-common 0.1/0.2, digest 0.10/0.11,
sha2 0.10/0.11 (SQLx/RustCrypto actuel), untrusted 0.7/0.9 (aws-lc/rustls-webpki).
Leurs contraintes semver diffèrent ; ne pas forcer une version incompatible.
Aucune vulnérabilité RustSec n'est ignorée dans deny.toml.

Images vérifiées par pull le 2026-11-02 et fixées par digest dans Dockerfile :
`rust:1.99.1-bookworm` et `debian:bookworm-slim`. Action CI checkout : version
stable v7.0.1 vérifiée via l'API GitHub officielle, fixée au commit
`3d3c42e5aac5ba805825da76410c181273ba90b1`.
