# Optimisation CI et publication multiarchitecture

2026-11-03. Décision avant implémentation, sans modification du contrat applicatif.

Le [run de référence 41530809211](https://github.com/floriaaan/habits/actions/runs/41530809211)
mesure 83 min 01 pour `build-and-push` : 79 min 16 de compilation ARM64 sous QEMU,
contre 4 min 37 pour AMD64. Le job Rust prend 16 min 51, dont 7 min 54 pour installer
les deux outils d'audit, sans cache. Un smoke Docker recompile aussi l'image avant
que le job de publication la reconstruise. Les jobs HA recompilent le binaire debug.

- Compiler les images sur runners GitHub natifs `ubuntu-24.04` (AMD64) et
  `ubuntu-24.04-arm` (ARM64), disponibles aussi pour les dépôts privés. Aucun QEMU,
  cross-compilateur, runner privé ou service de build supplémentaire.
- Compiler chaque image une fois, la charger dans Docker puis exécuter le smoke
  complet sur cette image avec `--no-build`. Transmettre les images testées via
  artefacts du même run ; les jobs de compilation n'ont aucun droit GHCR en écriture.
  Les références par architecture ne sont poussées qu'après Rust, audit, HA et smoke. Le job
  final `build-and-push` assemble les deux digests vérifiés ; il ne recompile rien.
  SHA/SemVer/latest ne sont publiés que lorsque les deux architectures ont réussi.
- Conserver les contrôles fmt, Clippy, tests, OpenAPI, frontières du domaine,
  audit/deny et smoke (auth, idempotence, XP, durcissement, sauvegarde/restauration).
  Le build release est exécuté dans le Dockerfile sur chaque architecture ; la
  compilation release native redondante du job Rust est supprimée.
- Réutiliser le binaire debug du job Rust dans les vrais tests HA via un artefact
  du même run. Les artefacts et caches ne sont pas interchangeables : seuls les
  artefacts du run courant sont exécutés/testés/promotionnés.
- Cache des dépendances Rust et des binaires d'audit, cache pip, couches BuildKit
  séparées par architecture. Le Dockerfile isole la compilation des dépendances
  du seul binaire avant copie des sources métier. Les mounts BuildKit éphémères
  actuels ne suffisent pas à persister `target` entre runners via le cache GHA.
- Écarter les changements purement documentaires des builds applicatifs (le snapshot
  OpenAPI reste contrôlé). Les changements de code, y compris HA, gardent la recette
  complète ; les couches serveur inchangées sont réutilisées. Cela évite qu'un commit
  HA annule un build backend précédent sans le remplacer. Exécution complète sur
  demande, tag et contrôle hebdomadaire. Une PR ne publie rien.
- Annuler les runs remplacés sur une même branche/PR ; conserver les runs de tags.
  Les tags finaux restent sérialisés dans leur run après les deux digests. Les
  artefacts Docker transportent les images exécutables et leurs labels de source ;
  les attestations Buildx ne sont pas transportées par `docker save/load`.

Les caches accélèrent la compilation sans remplacer les contrôles, et une panne de
cache n'autorise pas une publication sans tests. Les temps visés doivent être
confirmés par un run réel froid puis chaud ; aucun gain chiffré n'est promis avant
mesure. La confidentialité du dépôt et le déploiement HA ne changent pas.

Références : [runners ARM privés](https://github.blog/changelog/2026-01-29-arm64-standard-runners-are-now-available-in-private-repositories/),
[builds distribués Docker](https://docs.docker.com/build/ci/github-actions/multi-platform/),
[cache GHA et scopes](https://docs.docker.com/build/cache/backends/gha/),
[cache Rust](https://github.com/Swatinem/rust-cache).
