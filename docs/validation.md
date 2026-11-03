# Preuves de validation — itération 2, 2026-11-02

Environnement : macOS arm64, Rust 1.99.1, Docker/OrbStack Linux arm64.
Les résultats ci-dessous concernent les commandes locales exécutées ; aucune
instance Pocket ID/Strava/HA réelle, CI GitHub ou publication GHCR n'est simulée.

## Contrôles

```sh
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
cargo run --locked -- openapi > /tmp/openapi.json
diff -u docs/openapi.json /tmp/openapi.json
python3 scripts/check_domain_boundaries.py
cargo audit --deny warnings
cargo deny --locked check
actionlint
docker compose config --quiet
python3 scripts/docker_smoke.py
git diff --check
```

- **51 tests réussis, 0 échec, 0 ignoré** ; SQLite réel temporaire et serveurs
  HTTP de fixture pour les providers.
- Fmt et Clippy (warnings refusés) : succès. Release native macOS arm64 : succès.
- Frontières du domaine, OpenAPI identique au snapshot et actionlint : succès.
- Compose et smoke Linux arm64 : succès, y compris PAT réel, idempotence/XP,
  sauvegarde et restauration ; projet/volume éphémère nettoyés.
- Audit : 1402 advisories chargés, 297 dépendances scannées, sortie zéro et aucun
  advisory signalé ; aucun advisory ignoré.
- Deny : advisories/bans/licenses/sources **ok**. Dix familles de versions
  transitives restent en avertissements, revues dans [dependencies.md](dependencies.md).
- Les nouvelles versions crypto ont été revérifiées contre les dernières stables
  crates.io non retirées et leur MSRV, puis compilées avec Cargo.lock.
- Workflow GHCR vérifié par actionlint et revue des conditions d'événements/tags ;
  les actions officielles sont fixées par SHA. Le premier run GitHub reste à faire.

## Comportements prouvés localement

1. Mode disabled fermé même avec un PAT valide, aucun en-tête d'identité accepté ;
   local limité au tenant singleton stable, bootstrap unique et fuseau explicite.
2. PAT CSPRNG/hash, scopes non extensibles, expiration, rotation et révocation
   atomiques ; comptes de service isolés et révocables ; audit sans token clair.
3. JWT signés de fixture : claims iss/aud/sub/exp/nbf, typ access token, signature,
   algorithme et paramètres JWK, refus ID token ; cache/rotation/refresh mutualisé,
   limite d'essais et panne JWKS. Parcours HTTP JWT multi-tenant avec clés en cache.
4. Isolation objet/scopes des habitudes, entrées, versions, exceptions, statistiques,
   XP, tokens, mappings, credentials et jobs ; FK composites inter-tenant.
5. Validation types/unités/valeurs finies, corps/UUID/pagination/champs inconnus,
   erreurs JSON uniformes et request_id, limites de taille/débit.
6. Création/rejeu/conflit/concurrence, rollback si événement échoue ; correction et
   annulation via événements, replay identique sans deuxième attribution d'XP.
7. Fuseaux IANA, sauts/replis DST, refus des instants sans offset et périodes
   hebdomadaires ; repos neutres pour taux/streak/XP ; définitions futures conservant
   l'ancienne cible historique ; compensation lors d'un ajout/retrait de repos.
8. Migrations répétables sur base vierge et upgrade depuis 0001 avec événements/XP
   historiques conservés puis compensables ; backup WAL/restauration avec FK valides.
9. Chiffrement AEAD lié au tenant/provider/version/clé, tampering refusé ; OAuth
   state hashé à usage unique/TTL et callback échangeant un code avec un serveur local.
10. Webhook challenge/abonnement, événement minimal durable et rejouage sans doublon ;
    Strava import/correction/purge avec compensation et retrait des données source.
11. Quotas observés conservateurs, reprise après huit échecs, lease récupérable et
    refus des mutations par un worker périmé ; source archivée préservée, snapshots
    successifs sous un même job, CAS de credentials et pagination à cutoff immuable.
12. Panne HA avec retry et notification_id stable ; le parcours manuel continue.
    Providers facultatifs absents : API manuelle utilisable et routes dédiées 503/404.
13. Docker : UID 10001, rootfs read-only, cap_drop ALL, aucun privilège/socket Docker,
    live/ready, faux Bearer refusé, CLI bootstrap puis PAT réel, création/check-in,
    rejeu unique/10 XP, snapshot, arrêt/restauration/redémarrage et données/XP relus.
    Aucun token dans les logs ; uniquement le projet/volume éphémère du smoke supprimé.

La revue a trouvé et fait corriger quatre défauts de reprise : purge d'une source
sur habitude archivée, clé d'événement réutilisée sur snapshots modifiés d'un même
job, effets d'un worker dont le bail a expiré et cutoff de pagination recalculé au
retry. Des tests ciblés couvrent les quatre. Les compilations intermédiaires
échouées ont été corrigées et relancées ; aucun échec n'est considéré comme validé.

## Limites et recette externe

- Aucun remote GitHub : pas de push d'image ni de run distant vérifié. Build local
  Linux arm64 et release macOS arm64 prouvés ; publication amd64/arm64 configurée
  dans la CI, construction amd64 non exécutée ici.
- Pocket ID réel non configuré. L'adaptateur exige RFC 9068 at+jwt et les paramètres
  explicites de [auth.md](auth.md) ; vérifier leur disponibilité avant activation.
- OAuth/webhooks/sync Strava et HA testés contre des serveurs hors ligne. Aucun
  compte, secret ou URL de déploiement inventé. L'opérateur doit configurer les
  services, l'abonnement webhook, HTTPS et l'autorisation multi-athlète si nécessaire.
- La révocation Strava livrée est locale avec purge ; déautorisation distante,
  conditions/autorisation et rétention des données à valider avant exposition.
  Pas de TTL automatique des imports ni de nettoyage général des jobs échoués/HA.
- Rotation/ré-encryption des clés AEAD, quotas HTTP par principal, export API audit,
  métriques/alertes et ordonnanceur des sauvegardes restent à réaliser/déployer.
- Fenêtres horaires dans une journée, plages de vacances à ajouter ; changement de
  type/unité/fuseau/période via nouvelle habitude. Statistiques recalculées depuis
  les événements avec historique borné à cent ans ; benchmarks homelab non exécutés.
- Notifications HA persistantes livrées ; push mobile/actionnables et custom card
  constituent une extension distincte. Aucun frontend/PWA.

La liste ordonnée des tâches restantes figure dans [TODO-MVP](../TODO-MVP.md).

## Ajout des catégories — 2026-11-02

Vérifications relancées en Rust 1.99.1 sur macOS arm64 :

- `cargo test --locked --all-targets` : **53 tests réussis**, aucun échec.
- `cargo fmt --all -- --check`,
  `cargo clippy --locked --all-targets --all-features -- -D warnings` et
  `cargo build --locked --release` : succès.
- `cargo run --locked -- openapi` : snapshot régénéré, diff identique ;
  `python3 scripts/check_domain_boundaries.py` et `git diff --check` : succès.
- Création/lecture/liste des quatre catégories avec PAT réel, défaut `daily`,
  isolation et rejet des valeurs invalides ; catégorie future appliquée à sa
  date d'effet, historique et XP conservés.
- Migration 0005 rejouée sans écraser les catégories explicites ; upgrade depuis
  0001 préservant entrées et ledger, puis compensation encore fonctionnelle.

`task dev:cargo -- fmt --all` a échoué faute de socket Docker/OrbStack disponible.
Les vérifications ci-dessus ont donc été exécutées avec la toolchain locale ;
le build et le smoke Docker n'ont pas été relancés pour cet ajout.

## Dashboard et Home Assistant connecté — 2026-11-03

Les sections précédentes décrivent leurs itérations respectives. Le dépôt privé
GitHub existe désormais ; le résultat de publication distante du nouveau workflow
n'est pas assimilé aux preuves locales ci-dessous.

- `cargo fmt --all -- --check`, Clippy tous targets/features avec `-D warnings`,
  `cargo test --locked --all-targets` : **61 tests réussis**, zéro échec/ignoré.
  Build release natif macOS arm64 et build debug : succès.
- Snapshot OpenAPI régénéré et comparaison avec la CLI : identique ; frontières
  du domaine et `git diff --check` : succès. `actionlint` : succès.
- Audit : 1403 advisories, 297 dépendances, aucun advisory signalé. Deny :
  advisories/bans/licenses/sources OK ; avertissements de doublons transitifs
  déjà revus dans dependencies.md, aucune nouvelle version transitive introduite.
- Dashboard : jeu correspondant aux proportions de la capture (80 % arrondi),
  pondérations, compteurs, 91 dates sans données fictives, repos, fuseaux,
  isolation et validation. Actions concurrentes/rejouées, retrait à zéro, pas
  fractionnaires, compensation XP, refus de retrait Strava et rollback si le
  reçu échoue. Migration 0006 sur base vierge et upgrade depuis 0001 testés.
- SSE HTTP réel : invalidation après écriture, aucune donnée d'un autre tenant,
  fermeture après révocation et scopes requis. Rappels : aucune HA configurée,
  heures DST absentes/doublées, repos, déduplication après reconnexion du
  connecteur et reçus survivant à la purge des jobs.
- **3 tests Python réussis sur Home Assistant 2026.10.2 réel et le binaire Rust**,
  chacun avec SQLite/config HA temporaires : config flow, entités automatiques,
  switches/actions +/- jusqu'à zéro, push externe et découverte dynamique,
  révocation/réauthentification/rechargement/déchargement ; reprise de transport
  conservant la clé, redirection sans transmission du token. Aucun mock du moteur
  HA ; seul le résolveur DNS/mDNS est remplacé (endpoints loopback). Aucun accès
  à une instance personnelle. Commandes exactes dans home-assistant-connected.md.
- Copie d'installation dans une configuration temporaire : configuration et
  autre intégration conservées, bytecode exclu. Task SSH testée via transport
  local : deux cartes copiées, configuration conservée, fichiers temporaires
  nettoyés. Aucun transfert réel vers le HA de l'opérateur.
- Carte : syntaxe Node OK ; rendu headless desktop sombre 1600 px et mobile
  clair 390 px, sans débordement. 91 cellules ; noms HTML échappés, erreur
  d'action visible et état busy libéré, actions absentes si indisponible.
  Le snapshot de 12 habitudes a été produit par la vraie API de test ; seuls
  les conteneurs/icônes HA sont remplacés dans ce harnais de rendu.
  Revue indépendante : les deux défauts relevés (verres et couleurs de groupe)
  ont été notés résolus après recapture ; pas de certification HA implicite.

Le navigateur collaboratif a renvoyé des timeouts/absence d'hôte ; le rendu a été
vérifié avec le moteur headless T3. Docker/OrbStack était arrêté : smoke/build
Docker non relancés pour cette itération. Le workflow les conserve, ajoute les
tests HA et attend leurs résultats avant publication GHCR. La recette sur le
homelab réel, son proxy et ses credentials reste une opération de déploiement.

## Paquet HACS — 2026-11-03

- `python3 -m unittest discover -s tests -p test_hacs_package.py -v` : **2 tests
  réussis**. Arborescence HACS standard, JS/dashboard/traductions embarqués,
  correspondance des deux archives, exclusion du backend/historique Git/bytecode,
  reconstruction sans récupérer les fichiers étrangers du dossier de sortie et
  rejet des noms de dépôt contenant URL/traversée/commande.
- **3 tests HA 2026.10.2 réussis**, désormais depuis l'archive de distribution
  extraite dans une configuration temporaire. Le vrai frontend est démarré sur
  loopback, le module embarqué est enregistré une seule fois, servi à l'identique
  sans credential, et reste disponible après réauth/rechargement. Le chemin statique
  ne permet pas de lire le manifest voisin. Les tests précédents d'actions, SSE,
  transport et auth continuent à passer. Dépendance de test frontend :
  `home-assistant-frontend==20260930.4`, celle du manifest HA 2026.10.2.
- `task ha:package HA_REPOSITORY=floriaaan/habits` produit les deux archives dans
  `target/hacs/`, sans publication. `actionlint` sur les deux workflows, syntaxe JS
  avec Node et `git diff --check` : succès.
- Installation et tasks `ha:sync`/`ha:sync:ssh` vérifiées avec configuration et
  transport SSH locaux temporaires : fichiers étrangers conservés, carte connectée
  copiée dans le composant HACS, prototype dans `www`, temporaires nettoyés.

Le dépôt source est privé. L'installation depuis l'API publique HACS et une
publication publique ne sont pas testées/revendiquées. Les jobs **Hassfest et
package ont réussi sur GitHub Actions**, [run 41666600516](https://github.com/floriaaan/habits/actions/runs/41666600516),
après ajout de la dépendance directe `http` demandée par Hassfest. Le validateur
HACS est ignoré tant que le dépôt reste privé. Le backend Rust n'a pas changé
dans cette itération ; la CI Rust/Docker complète n'est pas assimilée à ce run.

## Optimisation CI — 2026-11-03

Deux runs réels ont réussi et publié les deux plateformes dans GHCR :
[cache froid 41668658747](https://github.com/floriaaan/habits/actions/runs/41668658747)
et [cache chaud 41670603011](https://github.com/floriaaan/habits/actions/runs/41670603011).
Référence : [41530809211](https://github.com/floriaaan/habits/actions/runs/41530809211).
Durée totale : création du run jusqu'à la fin du dernier job, attente incluse.

| Mesure | Avant | Nouveau, froid | Nouveau, chaud |
| --- | ---: | ---: | ---: |
| CI entière | 99 min 59 s | 9 min 30 s | 3 min 12 s |
| `build-and-push` | 83 min 01 s | 48 s | 45 s |
| Rust | 16 min 51 s | 3 min 38 s | 1 min 11 s |
| Sécurité | incluse dans Rust | 8 min 35 s | 39 s |
| Image + smoke AMD64 | recompilée avant publication | 7 min 14 s | 56 s |
| Image + smoke ARM64 | QEMU dans publication | 5 min 27 s | 57 s |
| Home Assistant | absent du run de référence | 1 min 14 s | 1 min 02 s |

Les compilations d'images ont été déplacées dans une matrice native parallèle,
incluse dans le total ; le gain ne vient pas seulement d'un renommage de job.
Les logs de référence montrent 79 min 16 de compilation ARM64 sous QEMU contre
4 min 37 en AMD64. Le nouveau step ARM64 complet prend 4 min 45 à froid, cache et
export inclus. Le second run conserve les mêmes sources applicatives et Dockerfile,
avec un renforcement de la garde d'événement du workflow. Il mesure la réutilisation
du cache ; une modification Rust/dépendance provoquera les recompilations nécessaires.

Preuves dans les deux runs :

- fmt, Clippy tous targets/features `-D warnings`, **61 tests Rust**, build debug,
  OpenAPI identique, frontières du domaine et **2 tests de politique de publication**.
- Audit et deny exécutés : advisories/bans/licenses/sources OK, mêmes doublons
  transitifs déjà documentés. Le second run restaure les deux outils depuis le
  cache et ignore leur installation, sans ignorer leurs contrôles.
- **3 tests HA réels** avec le binaire debug téléchargé du même run, sans Cargo
  dans le job HA. Cache pip restauré au deuxième passage.
- Build release natif et **smoke complet sur AMD64 et ARM64** : healthchecks,
  refus sans token, PAT, événement idempotent, XP, non-root/read-only/capabilities,
  logs sans token, sauvegarde puis restauration de la réalisation et du ledger.
- Les deux compilations Docker sont `CACHED` au second passage. Les artefacts
  d'images testées (~41–43 Mo chacun) sont chargés sans recompilation par le job
  final, qui vérifie architecture/commit et inspecte le manifeste GHCR résultant :
  `linux/amd64` et `linux/arm64` présents. SHA et `latest` publiés dans ces runs.
- `actionlint` sur les deux workflows, tests Python locaux de publication,
  `git diff --check` : succès. Les règles refusent PR/forks/schedule/tags invalides ;
  une garde de contexte GitHub indépendante du script interdit aux PR d'atteindre
  le job doté de `packages: write`.

Le poste local n'a pas démarré Docker/OrbStack : ces preuves Docker sont celles
des runners GitHub. La publication de tags SemVer n'a pas été déclenchée ; sa
politique est couverte par les tests. Le transport `docker save/load` ne conserve
pas les attestations Buildx, comme indiqué dans container-publishing.md.

## Dépôt HA public et sous-module — 2026-11-03

- [floriaaan/habit-tracker-ha](https://github.com/floriaaan/habit-tracker-ha) créé
  **public**, avec un commit racine sans parent et uniquement le client HA, sa carte,
  dashboard exemple, traductions et fichiers de distribution. Export initial relu :
  les fichiers du composant sont identiques, seuls les liens du manifest ciblent le
  dépôt public. Aucun historique Git du backend transféré. La visibilité de
  `floriaaan/habits` a été revérifiée **PRIVATE** après publication.
- [HACS et Hassfest réussis](https://github.com/floriaaan/habit-tracker-ha/actions/runs/41672170932).
  Le premier passage HACS demandait des topics GitHub ; ajoutés puis validateur
  relancé avec succès, sans ignorer ce contrôle. Seul `brands` reste ignoré pour
  cette distribution par dépôt personnalisé, hors catalogue HACS par défaut.
- [Release v0.1.1](https://github.com/floriaaan/habit-tracker-ha/releases/tag/v0.1.1)
  publiée sur le commit `050c062a2a4bfc874c7544d72689fd45592be0d7`, archive
  `habit_tracker.zip` jointe. Même commit verrouillé en mode Git `160000` à
  `integrations/home-assistant/habit-tracker-ha`, déclaré dans `.gitmodules`.
- Clonage anonyme HTTPS du dépôt public et clonage neuf récursif du backend privé :
  succès ; le sous-module récupère exactement le commit verrouillé. Depuis ce clone
  neuf, **3 tests d'archives et 3 tests HA réels passent**, ces derniers avec le
  binaire Rust local existant (sources Rust inchangées). L'absence du sous-module
  provoque une erreur explicite avec la commande d'initialisation, sans créer
  d'archive vide.
- Installation par copie, `ha:sync` et `ha:sync:ssh` vérifiées avec configuration
  temporaire/transport local : sources lues depuis le sous-module, fichiers
  étrangers conservés, ancien prototype préservé. Aucun accès à un HA personnel.
- [CI backend complète réussie](https://github.com/floriaaan/habits/actions/runs/41673137229) :
  checkout récursif dans le job HA, 61 tests Rust, 3 tests HA, audit/deny, smoke natif
  AMD64/ARM64 et publication GHCR. [Archives privées validées séparément](https://github.com/floriaaan/habits/actions/runs/41673137021),
  avec 3 tests et sous-module initialisé. Les validateurs HACS/Hassfest résident
  maintenant dans le dépôt public ; le backend conserve les tests avec l'API Rust.
- `actionlint`, syntaxe JS et `git diff --check` : succès. Pas d'installation,
  redémarrage ou configuration effectué sur le Home Assistant de l'opérateur.

## README bilingues et Compose de production — 2026-11-03

- `README.md` anglais et `README.fr.md` français dans les deux dépôts, avec
  liens de langue réciproques. Les quatre guides ont des blocs de code équilibrés
  et des liens de fichiers locaux résolus. Le guide public HA ne dépend pas du
  dépôt backend privé.
- `compose.production.yaml` copié seul dans un répertoire temporaire et validé
  avec `docker compose --env-file /dev/null -f … config --format json` : image
  `ghcr.io/floriaaan/habits:latest`, aucune instruction build, auth locale par PAT,
  port loopback, volume local `/data`, UID/GID 10001, rootfs read-only et toutes les
  capabilities supprimées. Les options de durcissement correspondent au Compose
  des smoke tests. Les substitutions tag/auth/adresse/port ont aussi été vérifiées.
- **3 tests d'export HACS réussis**, dont la présence des README EN/FR et leurs
  liens réciproques dans l'archive. `actionlint` et `git diff --check` réussis.
- [HACS/Hassfest du client public réussis](https://github.com/floriaaan/habit-tracker-ha/actions/runs/41680597197)
  et [export backend réussi](https://github.com/floriaaan/habits/actions/runs/41680676445).
  Le sous-module verrouille le commit documentaire `ac8d1e1` ; le composant
  installé reste en version 0.1.1, sans changement de son code.
- [CI backend complète réussie](https://github.com/floriaaan/habits/actions/runs/41680676634) :
  fmt, clippy, tests Rust/HA, OpenAPI, audit/deny, smoke Docker natif AMD64/ARM64
  et publication multi-architecture GHCR. Ces smoke tests utilisent le Compose
  local existant ; ils ne constituent pas un déploiement du nouveau fichier de
  production sur le homelab.

Docker/OrbStack n'était pas démarré sur le poste : la validation locale du nouveau
Compose est statique. Aucun service de production ni Home Assistant personnel n'a
été démarré, installé ou reconfiguré pour cette rédaction.
