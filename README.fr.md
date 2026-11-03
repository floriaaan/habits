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

## Installation — production

### 1. Récupérer le fichier Compose de production

Prérequis : Docker Engine avec Docker Compose et un accès à l'image GHCR.
Téléchargez [compose.production.yaml](compose.production.yaml) dans votre dossier
de déploiement. Ce fichier suffit : ni Rust, ni clonage des sources, ni build
d'image. Exécutez les commandes suivantes depuis ce dossier.

L'image `ghcr.io/floriaaan/habits:latest` est disponible pour AMD64 et ARM64.
Docker sélectionne automatiquement la bonne plateforme.

### 2. Télécharger l'image

Si le package GHCR est privé, connectez-vous d'abord :

```sh
docker login ghcr.io
```

Renseignez votre identifiant GitHub puis, à l'invite du mot de passe, un personal
access token GitHub **classique** avec `read:packages` et un accès au package.
Ce credential de registre est distinct du token API Habit Tracker. Voir le
[guide d'authentification GHCR](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry#authenticating-to-the-container-registry).

```sh
docker compose -f compose.production.yaml pull
```

### 3. Créer l'utilisateur local et lancer l'API

Sur une **nouvelle installation**, exécutez le bootstrap une seule fois, puis
démarrez le service :

```sh
docker compose -f compose.production.yaml run --rm --no-deps api bootstrap-local Europe/Paris
docker compose -f compose.production.yaml up --detach --wait
docker compose -f compose.production.yaml exec -T api /usr/local/bin/habit-tracker healthcheck
```

Remplacez `Europe/Paris` par votre fuseau IANA si nécessaire. Le bootstrap affiche
un JSON avec `token` et `metadata.user_id`. Conservez le token dans un gestionnaire
de secrets : sa valeur n'est affichée qu'à l'émission et expire après **24 heures**.
Ne relancez pas le bootstrap sur une installation existante ; utilisez les commandes
ou l'API de gestion des tokens. Les migrations sont appliquées automatiquement.

Le Compose de production choisit `AUTH_MODE=local` par défaut : un utilisateur
persistant, avec un Bearer valide pour chaque requête API privée. Pocket ID n'est
pas nécessaire. `AUTH_MODE=disabled` ferme les routes privées ; il n'autorise jamais
un accès anonyme.

### 4. Connecter les clients

L'API écoute sur `http://127.0.0.1:8080` sur l'hôte Docker. Pour Home Assistant ou
des clients distants, placez-la derrière votre reverse proxy HTTPS, comme NPMplus :

- Un proxy sur l'hôte peut cibler `127.0.0.1:8080`. Un proxy en conteneur doit
  rejoindre le réseau Docker de l'API et peut cibler `api:8080`.
- Gardez `/health/*` internes. Pour `/api/v1/dashboard/events`, désactivez le
  buffering et autorisez les connexions longues (`proxy_read_timeout 75s` avec Nginx).
- Donnez à HA une URL du backend accessible **depuis HA**, sans `/api/v1`.
  Suivez le [guide d'installation HA](https://github.com/floriaaan/habit-tracker-ha/blob/main/README.fr.md#installation).

Pour créer une première habitude, chargez le token du bootstrap dans `HABIT_TOKEN`
depuis votre gestionnaire de secrets, puis exécutez sur l'hôte Docker :

```sh
curl --fail http://127.0.0.1:8080/api/v1/habits \
  -H "Authorization: Bearer $HABIT_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Lecture","category":"mind","kind":"boolean","unit":"count","target":1,"timezone":"Europe/Paris"}'
```

Pour HA au quotidien, émettez un token dédié avec `habits:read`, `statistics:read`
et `entries:write`. Définissez `HABIT_USER_ID` avec le `metadata.user_id` du bootstrap,
et `HABIT_EXPIRES_AT` avec une date UTC RFC 3339 future, dans les 365 prochains jours :

```sh
docker compose -f compose.production.yaml exec -T api \
  /usr/local/bin/habit-tracker token-create "${HABIT_USER_ID:?}" \
  'habits:read,statistics:read,entries:write' "${HABIT_EXPIRES_AT:?}"
```

Utilisez le champ `token` obtenu dans HA. C'est un token Habit Tracker, pas un token
GitHub ni un token longue durée de HA. Voir [authentification et rotation](docs/auth.md)
pour les autres clients.

### Configuration, mises à jour et données

Un `.env` facultatif, placé à côté du fichier de production, peut modifier ces défauts :

```dotenv
AUTH_MODE=local
HABIT_TRACKER_TAG=latest
HOST_BIND=127.0.0.1
HOST_PORT=8080
```

Un tag publié `sha-<commit-complet>` permet de figer une version. La
[référence de configuration](.env.example) liste les options OIDC et connecteurs ;
le Compose de production définit déjà l'adresse et le chemin internes de la base.
Si vous copiez `.env.example`, choisissez `AUTH_MODE=local` pour ce parcours :
son réglage initial laisse les routes privées fermées.
Strava et les notifications sortantes HA nécessitent une configuration supplémentaire ;
la lecture et les actions depuis HA ne nécessitent pas ce connecteur sortant.

Pour mettre à jour, sauvegardez la base puis téléchargez l'image et recréez le service :

```sh
docker compose -f compose.production.yaml pull
docker compose -f compose.production.yaml up --detach --wait
docker compose -f compose.production.yaml logs --tail=100 api
```

SQLite réside dans le volume local `habit_data`, monté dans `/data`. `down` le conserve ;
`down --volumes` le supprime. La base active doit rester sur disque local.
Le [guide de sauvegarde et restauration](docs/operations.md) décrit les snapshots
SQLite cohérents. Le conteneur utilise l'UID/GID 10001, un rootfs en lecture seule
et aucune capability.

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
task dev:bootstrap TIMEZONE=Europe/Paris   # Une seule fois, sur la base de développement
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
cargo run --locked -- bootstrap-local Europe/Paris
AUTH_MODE=local cargo run --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
```

`compose.yaml` construit l'image localement ; `compose.production.yaml` utilise
seulement GHCR. `python3 scripts/docker_smoke.py` teste un build et un volume
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
