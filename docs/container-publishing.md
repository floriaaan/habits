# Publication de l’image OCI

## Décision

Le registre retenu pour cette itération est GitHub Container Registry (GHCR), car il utilise l’identité du dépôt et le `GITHUB_TOKEN` éphémère du job. Aucun compte, secret personnel ou domaine de production supplémentaire n’est nécessaire. Le nom de l’image est dérivé de `github.repository` converti en minuscules : `ghcr.io/<owner>/<repository>`.

La publication reste une opération de CI : aucun push n’est effectué lors du développement local. Le job `build-and-push` dépend des jobs `rust` et `container` réussis.

## Déclenchement et tags

Le job peut publier depuis le dépôt d’origine uniquement :

- un push sur la branche par défaut ;
- un push de tag SemVer `vMAJOR.MINOR.PATCH`, avec préversion ou métadonnées SemVer facultatives ;
- une exécution manuelle `workflow_dispatch` choisie dans GitHub Actions.

Les pull requests, exécutions planifiées et dépôts marqués comme forks ne publient jamais. Lors d’un push de tag, un tag commençant par `v` mais invalide en SemVer est ignoré avant toute connexion au registre.

Chaque publication reçoit un tag `sha-<commit complet>`. Un tag de version reçoit aussi sa version sans le préfixe `v` ; les caractères incompatibles avec un tag OCI, comme `+`, sont normalisés par Docker Metadata. `latest` est attribué seulement lorsque la référence exécutée est la branche par défaut. Une publication depuis un tag, y compris une version stable, ne déplace donc pas `latest`.

Les images contiennent les plateformes `linux/amd64` et `linux/arm64`. Buildx construit le manifeste multiarchitecture ; QEMU permet la compilation ARM64 sur le runner AMD64. Les caches BuildKit utilisent le backend GitHub Actions.

## Configuration GitHub

Activer GitHub Actions et autoriser `GITHUB_TOKEN` à créer ou mettre à jour le package GHCR associé au dépôt. Le droit `packages: write` est accordé uniquement au job de publication ; les autres jobs conservent `contents: read`. Si un package existe déjà, ses permissions doivent autoriser ce dépôt à le publier. La visibilité du package se règle dans GHCR : le workflow ne la modifie pas.

Depuis l’onglet Actions, choisir le workflow `ci`, puis **Run workflow**. Pour une publication de version, pousser un tag SemVer après validation des changements. Le nom exact et le digest de l’image apparaissent dans le récapitulatif de l’action Docker.

Les actions officielles Docker sont fixées par SHA de commit. Les références ci-dessous ont été vérifiées via l’API GitHub au moment de l’implémentation ; conserver le SHA et le commentaire de version ensemble lors des mises à jour :

- [login-action v4.7.0](https://github.com/docker/login-action/releases/tag/v4.7.0)
- [setup-buildx-action v4.4.1](https://github.com/docker/setup-buildx-action/releases/tag/v4.4.1)
- [metadata-action v6.2.0](https://github.com/docker/metadata-action/releases/tag/v6.2.0)
- [build-push-action v7.4.0](https://github.com/docker/build-push-action/releases/tag/v7.4.0)
- [setup-qemu-action v4.4.0](https://github.com/docker/setup-qemu-action/releases/tag/v4.4.0)

## Limites de validation

La vérification locale du workflow ne réalise pas de publication distante. La première exécution GitHub doit confirmer les permissions GHCR, l’accès aux caches et la construction ARM64 avec QEMU. Les tests du job `container` exécutent l’image de l’architecture native du runner ; ils ne constituent pas un test d’exécution ARM64.
