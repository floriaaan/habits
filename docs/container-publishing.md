# Publication de l’image OCI

## Décision

Le registre retenu pour cette itération est GitHub Container Registry (GHCR), car il utilise l’identité du dépôt et le `GITHUB_TOKEN` éphémère du job. Aucun compte, secret personnel ou domaine de production supplémentaire n’est nécessaire. Le nom de l’image est dérivé de `github.repository` converti en minuscules : `ghcr.io/<owner>/<repository>`.

La publication reste une opération de CI : aucun push n’est effectué lors du développement local. Le job `build-and-push` dépend des contrôles `rust`, `security`, `home-assistant` et des deux smoke tests `container` réussis.

## Déclenchement et tags

Le job peut publier depuis le dépôt d’origine uniquement :

- un push sur la branche par défaut ;
- un push de tag SemVer `vMAJOR.MINOR.PATCH`, avec préversion ou métadonnées SemVer facultatives ;
- une exécution manuelle `workflow_dispatch` choisie dans GitHub Actions.

Les pull requests, exécutions planifiées et dépôts marqués comme forks ne publient jamais. Lors d’un push de tag, un tag commençant par `v` mais invalide en SemVer est ignoré avant toute connexion au registre.

Chaque publication reçoit un tag `sha-<commit complet>`. Un tag de version reçoit aussi sa version sans le préfixe `v` ; les caractères incompatibles avec un tag OCI, comme `+`, sont normalisés par Docker Metadata. `latest` est attribué seulement lorsque la référence exécutée est la branche par défaut. Une publication depuis un tag, y compris une version stable, ne déplace donc pas `latest`.

Les images contiennent les plateformes `linux/amd64` et `linux/arm64`. Chaque image
est compilée une fois sur son runner natif (`ubuntu-24.04`, `ubuntu-24.04-arm`),
puis testée par `scripts/docker_smoke.py --no-build`. Aucun QEMU. Les images testées
sont transmises par artefacts privés du run courant au job de publication, qui
vérifie architecture et label de commit, les pousse puis assemble leurs digests
avec `docker buildx imagetools create`. Une architecture en échec empêche la
publication des tags finaux. Les tags intermédiaires `build-<run>-<attempt>-<arch>`
identifient ces deux images ; leur visibilité suit celle du package GHCR.

Les couches de dépendances sont réutilisées via des caches BuildKit GHA distincts
par architecture. Les mounts `target` éphémères ont été remplacés par une couche
de dépendances exportable, adaptée au seul binaire sans `build.rs` de ce dépôt.
Rust bénéficie d'un cache de dépendances ; audit/deny ont un cache de binaires
versionné et continuent à consulter les advisories à chaque exécution. Le job HA
réutilise le binaire debug du même run, avec cache pip. Les artefacts expirent après
un jour et ne sont jamais utilisés depuis un run antérieur.

Le transport `docker save/load` conserve le contenu exécutable et les labels OCI ;
il ne transporte pas les attestations de provenance Buildx. La publication doit
utiliser une chaîne OCI incluant ces attestations si une provenance signée devient
un critère d'acceptation. Aucun contrôle d'authentification, d'isolation, d'audit ou
de smoke n'est supprimé.

Les commits purement documentaires ignorés par `paths-ignore` ne compilent pas
l'application ; le snapshot `docs/openapi.json` reste vérifié. Les modifications
de code, y compris HA, passent tous les contrôles. Les runs remplacés d'une même
branche/PR sont annulés, les tags sont préservés. Un déclenchement manuel ou le
contrôle hebdomadaire exécute la recette complète. Voir les
[mesures et décisions CI](decisions-ci.md).

## Configuration GitHub

Activer GitHub Actions et autoriser `GITHUB_TOKEN` à créer ou mettre à jour le package GHCR associé au dépôt. Le droit `packages: write` est accordé uniquement au job de publication ; les autres jobs conservent `contents: read`. Si un package existe déjà, ses permissions doivent autoriser ce dépôt à le publier. La visibilité du package se règle dans GHCR : le workflow ne la modifie pas.

Depuis l’onglet Actions, choisir le workflow `ci`, puis **Run workflow**. Pour une publication de version, pousser un tag SemVer après validation des changements. Le nom exact et le digest de l’image apparaissent dans le récapitulatif de l’action Docker.

Les actions officielles Docker sont fixées par SHA de commit. Les références ci-dessous ont été vérifiées via l’API GitHub au moment de l’implémentation ; conserver le SHA et le commentaire de version ensemble lors des mises à jour :

- [login-action v4.7.0](https://github.com/docker/login-action/releases/tag/v4.7.0)
- [setup-buildx-action v4.4.1](https://github.com/docker/setup-buildx-action/releases/tag/v4.4.1)
- [metadata-action v6.2.0](https://github.com/docker/metadata-action/releases/tag/v6.2.0)
- [build-push-action v7.4.0](https://github.com/docker/build-push-action/releases/tag/v7.4.0)

## Limites de validation

La vérification locale du workflow ne réalise pas de publication distante. Les
mesures de référence et les résultats des runs optimisés sont consignés dans
[validation.md](validation.md). Docker/OrbStack n'étant pas actif sur le poste lors
de cette modification, la recette des deux architectures et la publication doivent
être confirmées sur les runners GitHub. Les deux smoke tests exécutent cette fois
réellement les binaires de leur architecture native.
