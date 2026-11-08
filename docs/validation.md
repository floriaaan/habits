# Preuves de validation — itération 2, 2026-11-02

Environnement : macOS arm64, Rust 1.99.1, Docker/OrbStack Linux arm64.
Les résultats ci-dessous concernent les commandes locales exécutées ; aucune
instance Pocket ID/Strava/HA réelle, CI GitHub ou publication GHCR n'est simulée.

## Contrôles

```sh
cd backend
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
cargo run --locked -- openapi > /tmp/openapi.json
diff -u ../docs/openapi.json /tmp/openapi.json
python3 scripts/check_domain_boundaries.py
cargo audit --deny warnings
cargo deny --locked check
cd ..
actionlint
docker compose config --quiet
python3 backend/scripts/docker_smoke.py
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
  `python3 backend/scripts/check_domain_boundaries.py` et `git diff --check` : succès.
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

## Bootstrap automatique et installation simplifiée — 2026-11-03

Le mainteneur a remplacé le fichier de production par un bloc Compose intégré
aux README EN/FR et demandé l'affichage automatique du premier PAT local.
Voir [décision et exception de journalisation](adr/ADR-011-auto-bootstrap.md).

- `cargo test --locked --all-targets` : **64 tests réussis** (62 unitaires et
  2 tests du vrai processus serveur). Les nouveaux tests prouvent une seule
  émission atomique lors d'appels concurrents, un PAT hashé et fonctionnel,
  le refus HTTP sans token, et aucun secret réémis au redémarrage ou après
  expiration/révocation. Les modes disabled et OIDC n'émettent aucun PAT initial.
- `cargo clippy --locked --all-targets --all-features -- -D warnings` et
  `cargo build --locked --release` : succès sur le poste de développement.
  `cargo fmt --all -- --check`, OpenAPI généré comparé au contrat versionné,
  `actionlint` et `git diff --check` : succès. Les tests du processus confirment
  aussi qu'un healthcheck exécuté avec AUTH_MODE=local n'émet pas de token.
- Les blocs Compose extraits des README sont identiques et validés seuls avec
  `docker compose --env-file /dev/null -f … config --format json` : image GHCR,
  aucun build, mode local, toutes les variables runtime présentes, non-root,
  rootfs read-only, capabilities supprimées et port loopback. Les liens locaux
  et blocs Markdown sont valides. `compose.production.yaml` est supprimé.
- **2 tests de politique CI et 3 tests d'export HACS réussis** ; frontières du
  domaine et syntaxe Python du smoke Docker vérifiées. Le smoke utilise maintenant
  le token émis au démarrage et tolère sa présence uniquement dans l'événement
  `local_bootstrap`, une seule fois malgré l'arrêt/restauration/redémarrage.

Les tests de démarrage utilisent des bases et ports loopback temporaires, sans
fournisseur externe. Aucun secret réel ni Home Assistant personnel n'est utilisé.

- [CI complète réussie](https://github.com/floriaaan/habits/actions/runs/41685228623) :
  64 tests Rust, tests HA réels, audit/deny, smoke Docker AMD64/ARM64 incluant le
  bootstrap automatique et l'absence de réémission après restauration/redémarrage.
  Les images testées sont publiées dans le manifeste GHCR multi-architecture
  (`latest` et `sha-e5af031b42f4b04316ad7adf6899b99d305dc8e2`). Aucun conteneur
  de production de l'opérateur n'a été modifié.

## Carte Lovelace non trouvée — 2026-11-03

- Le test HA ajouté avant correction échouait : aucune ressource module pour
  `habit-tracker-card` dans la collection Lovelace, malgré une route statique
  existante. La version 0.1.1 utilisait seulement `add_extra_js_url`.
- Version 0.1.2 : ressource module versionnée créée en mode UI/storage, ancienne
  URL mise à jour en conservant son ID, doublons propres à cette carte retirés,
  ressources tierces et config entries préservées. En YAML, configuration
  opérateur intacte, avertissement avec URL et procédure EN/FR explicite.
- [HACS et Hassfest réussis](https://github.com/floriaaan/habit-tracker-ha/actions/runs/41699914967).
  [Export et 3 tests d'archives réussis](https://github.com/floriaaan/habits/actions/runs/41700106259).
  [CI backend complète réussie](https://github.com/floriaaan/habits/actions/runs/41700106173) :
  **5 tests HA sur Linux**, dont liste des ressources reçue via WebSocket
  authentifié, téléchargement HTTP du module, migration/rechargement sans
  doublon, préservation YAML et parcours normal entités/actions/SSE. Les 64 tests
  Rust, audit/deny et smoke Docker AMD64/ARM64 passent aussi.
- Localement, les assertions de la suite HA passent, mais Python Homebrew
  3.14.3 plante lors de sa finalisation/GC après la suite complète. Les nouveaux
  tests migration et YAML exécutés séparément sortent avec code 0 ; la preuve
  d'exécution de la suite complète est celle du runner Linux ci-dessus.
- [Release HACS v0.1.2](https://github.com/floriaaan/habit-tracker-ha/releases/tag/v0.1.2)
  publiée avec `habit_tracker.zip`, vérifié identique aux fichiers du composant
  verrouillé dans le sous-module. Syntaxe JS, liens EN/FR et `git diff --check`
  vérifiés. Aucun accès/modification au Home Assistant personnel de l'opérateur.


## Onboarding HA et éditeur Lovelace — 2026-11-03

- Backend `f8d489d`, client public `7548ed3`, version **0.2.0**.
  Migration additive `0007_habit_setup.sql` ; aucun historique existant modifié.
- **67 tests Rust réussis**, fmt, Clippy avec warnings refusés, build release
  macOS arm64, frontières du domaine et OpenAPI identique au snapshot : succès.
  Nouveaux cas : accès sans token/scopes insuffisants, fuseau invalide, rejeu
  concurrent, même clé entre tenants, conflit de contenu et rollback complet si
  l'écriture du reçu échoue.
- **7 tests HA réussis sur Linux**, avec le vrai HA 2026.10.2 et le binaire Rust :
  sept presets, création libre, validation, refresh/entités, réponse perdue après
  commit et reprise avec la même clé, refus sans `habits:write`, remplacement du
  token du même compte et reprise du formulaire. Les anciens parcours actions,
  SSE, reauth et ressources Lovelace restent couverts.
- [CI backend](https://github.com/floriaaan/habits/actions/runs/41709882759) :
  Rust, HA, audit/deny et smoke Docker natifs AMD64/ARM64 réussis. Publication
  GHCR réussie : `ghcr.io/floriaaan/habits:latest` et
  `sha-f8d489df40f22d50631f34a1890e772e3ad53a58`, manifeste
  `sha256:df4de575f98e146fe83b1d19c96c41c6aedaa5a51fd2ea7e2794af21d0c16ce1`.
- [Release HACS v0.2.0](https://github.com/floriaaan/habit-tracker-ha/releases/tag/v0.2.0)
  publiée avec `habit_tracker.zip`, SHA-256
  `d6b25606fe5b89111bed15819b2170592b256b21dd3524886b2f15756188a3ee`.
- [HACS et Hassfest](https://github.com/floriaaan/habit-tracker-ha/actions/runs/41709843879),
  [export et tests des archives](https://github.com/floriaaan/habits/actions/runs/41709882727) : succès.
  Les 17 fichiers de `habit_tracker.zip` ont été comparés octet par octet au
  composant committé. Syntaxe JS, détection UI et `git diff --check` : succès.
- Chrome headless sur HA temporaire en loopback : ouverture de **Configurer**,
  choix de preset, formulaire prérempli, modification du nom et création réelle.
  Éditeur monté avec le vrai contexte et le vrai `ha-form` HA : capteur proposé
  par `getStubConfig`, changement de vue par le sélecteur, événement
  `config-changed`, conservation de `grid_options` et retrait du filtre de
  catégorie hors de la vue Habitudes. Captures en 1366×900 et 390×844 ; aucun
  débordement horizontal dans l'éditeur. Cette vérification n'est pas un test
  du homelab personnel ni un test automatisé du sélecteur de cartes Lovelace.
- Les deux nouveaux tests HA exécutés seuls sur macOS sortent avec code 0.
  La suite complète locale conserve le crash Python 3.14.3 en finalisation/GC
  déjà décrit ci-dessus ; la preuve de réussite complète provient du runner Linux.
  Aucun serveur HA personnel, secret opérateur ou fournisseur externe utilisé.


## Animations HA et export OTLP — 2026-11-03

- Backend `b94553e`, client `f236f46`, HACS **0.3.0**.
- **68 tests Rust réussis** localement : 65 tests de bibliothèque, deux tests de
  démarrage et le nouveau test OTLP exécutant le vrai binaire. Fmt, Clippy avec
  warnings refusés, build release macOS arm64, audit, deny, actionlint, frontières
  du domaine, OpenAPI inchangé et diff sans erreurs : succès.
- Le test collecteur loopback vérifie les logs OTLP HTTP JSON, le service, les
  templates de routes, le même request ID sur début/use-case/commit/réponse,
  l'absence du PAT, token rejeté, nom d'habitude, query et clé d'idempotence.
  L'API reste disponible pendant une panne du collecteur ; SIGTERM finit avec
  succès après flush. Aucun collecteur réel ni secret d'opérateur n'est utilisé.
- Test Chrome reproductible (`npm ci --ignore-scripts && npm test` dans le
  sous-module) : remplissage et vidage des arcs/verres, reprise de progression
  interrompue, layout à deux colonnes sur grand écran, absence de débordement sur
  mobile, préférence reduced-motion. Les matrices CSS singulières à scaleY(0)
  sont évitées par des keyframes scaleY normalisées ; le test initial échouait
  avant cette correction. Captures 1440×900 et 390×844 examinées.
- [HACS, Hassfest et test navigateur Linux réussis](https://github.com/floriaaan/habit-tracker-ha/actions/runs/41724751500).
- Les sept assertions de la suite HA locale passent ; le crash Python 3.14.3 en
  finalisation/GC reste présent après la suite complète. Le parcours HA principal
  exécuté seul sort avec code 0 et vérifie désormais `sensor.habits_<user_id>`,
  les PNG servis par l'API brands native et le maintien d'un entity ID personnalisé
  après rechargement. Les IDs existants ne sont pas renommés automatiquement.
- Archives HACS : trois tests réussis ; 19 fichiers identiques octet par octet au
  composant committé. Icônes PNG générées avec ImageGen, redimensionnées avec sips,
  source/prompt documentés dans le sous-module ; aucun asset distant au runtime.

- [CI backend](https://github.com/floriaaan/habits/actions/runs/41724945080) :
  Rust, audit/deny et **7 tests HA sur Linux réussis**, dont images natives HA,
  nommage du capteur et préservation du registre. L'export/les trois tests des
  archives passent aussi dans [le workflow dédié](https://github.com/floriaaan/habits/actions/runs/41724945237).
- [Release HACS v0.3.0](https://github.com/floriaaan/habit-tracker-ha/releases/tag/v0.3.0)
  publiée avec `habit_tracker.zip`, SHA-256
  `8966b73e86bc1728231dc36c9d55a3015cb0fd4ca80b89c97be14b66c3cbf2f5`.

- Smoke Docker **AMD64 et ARM64 réussis** et manifeste GHCR publié après toutes
  les validations : `ghcr.io/floriaaan/habits:latest` et
  `sha-b94553e49b8bc2980f9255d76ca2024ca04da76c`. Aucun conteneur de production
  ni instance HA personnelle de l'opérateur n'a été modifié.


## Verres cliquables et stabilité des animations — 2026-11-03

- Backend `bf8bc9f`, client `7e57bb2`, correctif HACS **0.3.1**.
- **69 tests Rust réussis** : 66 tests de bibliothèque, deux tests de démarrage,
  un test OTLP. Fmt, Clippy (warnings refusés), build release natif, OpenAPI généré
  et frontières du domaine : succès.
- Nouvelle action `set_value` testée en concurrence/rejeu, conflit de contenu,
  réduction/annulation, compensation XP, isolation, scopes et valeurs invalides.
  La protection des sources est couverte : un total sous le solde fournisseur
  est refusé, une augmentation puis un retour à ce solde préservent la source.
- Chrome : pas de verre plein fictif sur un élément construit hors du DOM,
  absence d'animation d'entrée, identité du nœud et de l'animation inchangée lors
  d'un refresh sans modification de cible, remplissage/vidage interrompu,
  clic sur le troisième verre envoyant une unique action set_value=750 et focus
  conservé sur ce verre, responsive et reduced-motion. Test navigateur Linux,
  HACS et Hassfest réussis dans [le client](https://github.com/floriaaan/habit-tracker-ha/actions/runs/41733431749).
- Le parcours HA principal local sort avec code 0 et envoie des valeurs absolues
  750, 250 et 0 par le vrai service HA vers le vrai backend. Les assertions sont
  conservées dans la suite HA exécutée sur Linux avant publication.
- Trois tests d'archives réussis ; 19 fichiers de ZIP identiques au composant
  committé, SHA-256 `b8c06e3f26403d044cb83d3d149f80985c3fc42b209cc86fef126dcad3ed6710`.

- [CI complète réussie](https://github.com/floriaaan/habits/actions/runs/41733459520) :
  69 tests Rust, 7 tests HA réels sur Linux, audit/deny, smoke Docker AMD64/ARM64
  et publication du manifeste `ghcr.io/floriaaan/habits:latest`, révision
  `bf8bc9fd111b55c67572e2cd0922edd6c528aad5`.
- [Release HACS v0.3.1](https://github.com/floriaaan/habit-tracker-ha/releases/tag/v0.3.1)
  avec le ZIP vérifié ci-dessus. Mise à jour backend nécessaire pour set_value ;
  pas de nouveau scope ni de migration. Aucune instance HA personnelle modifiée.


## Monorepo et mobile — 2026-11-05

- **71 tests Rust réussis** (68 unitaires, 1 observabilité, 2 démarrage). Session : PAT, scopes sans droit de lecture métier, expiration, révocation, compte de service, disabled et tenants OIDC isolés.
- Fmt, Clippy tous targets/features avec warnings refusés, OpenAPI régénéré et comparaison au snapshot : succès.
- Vérification de préservation : 63 fichiers du crate déplacés, dont seuls les quatre fichiers HTTP/tests prévus pour la session diffèrent. Les sept migrations et Cargo.lock sont identiques au commit de départ.
- **11 tests unitaires mobiles réussis**, plus **1 test du connector HTTP contre un processus Rust réel réussi** (base temporaire indépendante). Ce dernier est ignoré dans la commande sans `HABITS_BACKEND_BIN` et a été exécuté séparément avec ce paramètre.
- TypeScript strict, `expo install --check`, installation pnpm depuis le lockfile et export des bundles **iOS/Android** : succès. Versions retenues : Expo 58.0.23, React Native 0.88.1 et React 19.3.0.
- Simulateur **iPhone 18 Pro Max / iOS 27**, Expo Go SDK 58 : application ouverte, parcours fake exercé via les handlers React dans l'inspecteur Hermes (création « Test iOS », validation d'une habitude, dashboard à 10 XP). Rendu natif inspecté par capture ; un espace JSX hors Text détecté puis corrigé. Ce contrôle ne prouve pas une saisie tactile/clavier complète ni les redirects d'un development build.
- Frontières du domaine, 3 tests d'archives HACS, 2 tests de politique CI, actionlint et validation des deux configurations Compose : succès.
- Les **7 tests Home Assistant** affichent `OK`, mais le processus Python 3.14.3 local sort avec le code **139** après les tests. Réexécution avec faulthandler : segmentation fault pendant `Garbage-collecting`, `dictkeys_decref` / `finalize_modules` / `_Py_Finalize`. Le run complet HA n'est donc pas déclaré vert ; la cause précise du crash natif reste non déterminée. Le job Linux HA est conservé en CI.
- Le moteur Docker/OrbStack est arrêté sur ce poste : build/smoke conteneur et restauration du volume non exécutés pour cette tranche. Les noms/projets/volumes existants sont conservés dans Compose ; aucun volume de données n'a été déplacé ou effacé.
- Aucun fournisseur OIDC cible n'est configuré : vérifications JWT/JWKS Rust et tests de callback/refresh client réussis, mais aucun login natif interactif complet avec fournisseur réel ou serveur OAuth de test. Pocket ID, Strava et HA personnels n'ont pas été contactés.


## Accueil mobile V4 — 2026-11-06

- Expo Router 58.0.30 : layout partagé, Tabs produit, modale de création, détail d’habitude et console avancée conservée.
- **13 tests mobiles réussis**, dont deux tests du modèle d’accueil et des fixtures interactives. Le test HTTP/Rust est ignoré sur ce run sans `HABITS_BACKEND_BIN` ; son résultat précédent est conservé ci-dessus. TypeScript strict et exports iOS/Android réussis après les corrections.
- Captures natives Expo Go 58 sur **iPhone 18 Pro Max et iPad Pro 13 pouces, iOS 27** : clair, sombre, accessibilité grande taille, bas de page en texte agrandi. Création « Marche du soir » et incrément d’eau 1500 → 1750 mL confirmés via handlers React/Hermes. Ce ne sont pas des tests de taps physiques. L’accès agent-device T3 est désactivé dans cet environnement.
- Revue indépendante initiale `fix`, puis verdict ciblé **ship : 4/4 corrections résolues** (reflow du texte agrandi, sélection du dock, gouttière hydratation–dock, vacance du panneau supérieur iPad). Ce verdict porte sur la liste de corrections, pas sur une validation globale du produit.
- Comparaison automatique avec la comp V4 : environ **68 %**, état `drift`. Le gate pixel n’est pas passé et n’a pas été forcé. Les données, pictogrammes et proportions de la zone système diffèrent entre comp et capture native. Preuves dans `frontend/mobile/.impeccable/review/`, dont les crops et rapports de diff.
- Aucun émulateur Android disponible : export réussi uniquement, pas de validation visuelle Android. Indicateur de gestes natif absent des captures Expo Go malgré les insets et `autoHideHomeIndicator: false` : contrôle en application native autonome toujours requis ; aucune fausse barre n’a été dessinée. VoiceOver et gestes sur matériel non vérifiés.
- Trois maquettes Aujourd’hui générées avec l’outil intégré imagegen, ancrées sur la V4. Elles restent des propositions et ne déclenchent pas d’implémentation sans choix du mainteneur. Prompts et provenance conservés avec les images.


## Ajustement iPhone 17 Pro — 2026-11-06

- Effets de bord natifs désactivés dans le Stack ; suppression des dots et de leur rangée dans le dock. Pagination conservée à côté d’Ajouter.
- Hauteurs minimales calculées à partir de la hauteur mesurée du ScrollView au-dessus du dock, avec typographie et illustration plus compactes. Le texte agrandi conserve le défilement.
- TypeScript et 13 tests mobiles réussis (intégration HTTP ignorée sans binaire backend). Contrôle des espaces git réussi.
- Vérification visuelle finale sur le nouveau simulateur iPhone 17 Pro non aboutie : disque temporairement plein, puis confirmation système « Open in Expo Go » bloquante. L’accès agent-device T3 et l’envoi de touches système sont désactivés. Aucun résultat visuel sur ce modèle n’est revendiqué.

## Modale d’ajout C — 2026-11-07

- **14 tests mobiles réussis**, un test HTTP/Rust ignoré sans binaire backend ; TypeScript strict réussi.
- TypeScript strict et exports finaux iOS/Android réussis après les derniers garde-fous et l’ajustement de couleur du bouton principal. L’export prouve la génération des bundles, pas leur rendu natif.
- Revue de code indépendante : verdict ciblé **ship, 2/2 corrections résolues**. Ce verdict ne constitue pas une validation visuelle native.
- Aucun simulateur lancé, conformément à la demande du mainteneur. Rendu natif et comportement du clavier non vérifiés pour cette modale.


## Aujourd’hui A + sélecteur B — 2026-11-07

- Quatrième onglet `/today`, journal des saisies réelles, actions rapides du jour courant et sélection de semaine sur les 90 dernières dates. Historique des habitudes actives en lecture seule ; noms/unités versionnés et bilans calculés à partir des statistiques du jour. Une couverture hebdomadaire tronquée est signalée comme indisponible.
- **18 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Tests finaux, TypeScript strict et exports iOS/Android réussis après le dernier garde-fou de couverture hebdomadaire et son assertion de régression.
- Revue de code indépendante ciblée : problème P2 initial corrigé, verdict **ship** sur le code examiné. Ce verdict ne constitue pas une validation visuelle native.
- Aucun simulateur lancé, conformément à la demande du mainteneur. Rendu natif iOS/Android, gestes, VoiceOver et texte agrandi non vérifiés sur cet écran. L’export prouve la génération des bundles uniquement.

## Navigation entre jours — 2026-11-07

- Swipe horizontal : seuil de distance et dominante horizontale, un doigt, bornes des dates et suivi de semaine. Régression testée aux changements de mois et aux limites, ainsi que sur les gestes courts/verticaux.
- Suppression de la carte de succès ; annonce accessible conservée. Rafraîchissement depuis le titre du bilan avec état de chargement et blocage des appuis répétés.
- Transition de jour via Animated natif, avec écoute du réglage système de réduction des animations. Aucun paquet supplémentaire ni morphing entre routes ajouté.
- 19 tests réussis, 1 intégration HTTP ignorée sans binaire Rust. TypeScript et exports finaux iOS/Android réussis. Gestes et animation non vérifiés sur appareil : aucun simulateur utilisé.

- Revue ciblée : capture du swipe limitée au corps du journal pour préserver le défilement horizontal du sélecteur sur petit écran ; correction confirmée par revue de code.


## Morphing accueil–détail et maquettes de bienvenue — 2026-11-07

- Morphing limité aux lignes d’habitudes de l’accueil et à la carte d’en-tête du détail, avec retour depuis le bouton d’en-tête. Overlay dans une `Modal` native, rectangles mesurés, Reanimated 4.7.1 et Worklets 0.13.0 ; aucun Shared Element Transition expérimental activé dans le navigateur Tabs. Hydratation, liens directs et gestes de retour conservent leur navigation normale.
- Réduction des animations, rectangles invalides/hors écran, délais de secours des mesures et de l’overlay, et nettoyage à la déconnexion sont traités dans le code. Les tests de géométrie vérifient les valeurs non finies, dimensions nulles et limites de l’écran ; ils ne prouvent pas le cycle de vie natif de la Modal.
- Contrôles finaux après les ajustements du garde-fou et de l’opacité : **20 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN` ; TypeScript strict et exports iOS/Android réussis.
- Revue de code indépendante ciblée : le P2 concernant une navigation absorbée par le garde-fou a été corrigé ; verdict **ship** sur le code examiné. Ce verdict ne constitue pas une validation visuelle native.
- Aucun simulateur lancé, conformément à la demande du mainteneur. Morphing, superposition de la Modal, safe areas, gestes, VoiceOver et texte agrandi non vérifiés sur appareil. Les exports prouvent uniquement la génération des bundles.
- Trois propositions de bienvenue A (aperçu), B (rituel) et C (calme) ont été générées avec imagegen depuis `quiet-v1/home.png`. Images, prompts et provenance dans `frontend/mobile/.impeccable/mocks/welcome-v1/`. Aucune sélection ni implémentation ; le bouton de démonstration reste conditionné à la configuration, les connectors fake et HTTP étant exclusifs. Aucun nouveau parcours d’inscription email ni sélecteur d’instance.

## Morphing entre onglets — 2026-11-07

- Le dock et les liens Accueil → Progression capturent les rectangles visibles via refs natives avant navigation. Les surfaces de destination animent largeur, hauteur et origine avec une entrée Reanimated de 360 ms ; rôles correspondants, puis repli principal/première carte. Les dégradés restent des fonds absolus statiques, sans Modal, image instantanée ou shared tag pour ce trajet.
- Le focus remonte les surfaces natives, y compris sur les onglets déjà visités. L’état React des écrans est conservé ; les positions de défilement natives enfants peuvent être réinitialisées. Réduction des animations et mesures inexploitables conservent la navigation normale. Les liens directs et le retour système ne capturent pas de géométrie.
- Contrôles finaux : **22 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN` ; TypeScript strict et exports iOS/Android réussis après les derniers ajustements des fonds absolus et des liens Accueil → Progression. Les tests couvrent le découpage des rectangles visibles et la conversion de géométrie vers le repère de destination.
- Revue de code indépendante ciblée : verdict **ship** sur le code examiné. Aucun simulateur lancé, conformément à la demande du mainteneur ; rendu du morphing, gestes, safe areas, VoiceOver et texte agrandi non vérifiés sur appareil. Les exports prouvent uniquement la génération des bundles.


## Bienvenue V3 simplifiée — 2026-11-07

- Direction B simplifiée approuvée et implémentée : illustration décorative en vues natives, symboles de plateforme et SVG, exclue de l’accessibilité ; un seul CTA « Se connecter » ouvre `/login`. Les cartes « Avancer » / « À son rythme » et le lien de démonstration sont supprimés.
- La connexion réutilise les parcours PAT/OIDC et fake existants. Le mode simulé est expliqué sur `/login`. Le dashboard s’affiche directement pour une session valide restaurée ; la bienvenue couvre l’absence de session, la restauration et son indisponibilité. La console avancée est conservée.
- Contrôles finaux : **22 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN` ; TypeScript strict et exports iOS/Android réussis. Aucun nouveau test ajouté pour cette modification d’interface et de routage limitée ; les parcours d’authentification réutilisés disposent de tests existants.
- Revue indépendante ciblée du code : aucun défaut relevé. Ce résultat ne prouve pas le rendu natif. Thème sombre, zones sûres, défilement du texte agrandi et décoration masquée aux lecteurs d’écran sont traités dans le code ; l’indicateur de gestes reste natif.
- Aucun simulateur lancé, conformément à la demande du mainteneur. Apparence native iOS/Android, VoiceOver, texte agrandi, zones sûres et comportement du clavier non vérifiés pour ce parcours. Les exports prouvent uniquement la génération des bundles.


## Morphing apaisé et défilement sous le dock — 2026-11-07

- Les transitions entre onglets associent uniquement les cartes de même rôle. Leur origine reste fixe ; les dimensions de départ sont bornées à ±8 % en largeur et ±12 % en hauteur, puis rejoignent les dimensions finales en 260 ms avec ralentissement cubique. La réduction des animations reste respectée.
- Le dock est une superposition absolue au-dessus des ScrollView pleine hauteur, sans fond rectangulaire derrière ses coins arrondis. Un espacement de fin égal à sa hauteur plus 6 points garde les derniers contrôles accessibles. Le calcul des hauteurs de cartes de l’accueil déduit la hauteur du dock.
- TypeScript strict et exports iOS/Android réussis ; **23 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Les tests vérifient notamment les limites de dimensions et l’origine fixe du morphing. Les exports prouvent uniquement la génération des bundles.
- Aucun simulateur utilisé. Le rendu natif des transitions, le passage visuel du contenu sous les coins du dock et les gestes restent à vérifier sur appareil.


## Dock Liquid Glass, largeur stable et effets de bord — 2026-11-07

- Les cartes occupant au moins 90 % de la largeur de l’écran aux deux extrémités du morphing gardent leur largeur finale. Un écart inférieur à 2 points ne déclenche pas non plus de variation de largeur. Les autres limites de mouvement et le filtrage des cartes visibles restent en place.
- Le dock utilise `expo-glass-effect` en matériau natif `regular`, après vérification des deux API de disponibilité, avec surface opaque de secours. Le development client doit être reconstruit pour intégrer ce nouveau module natif.
- Les ScrollView de l’accueil, d’Aujourd’hui et des pages partagées sont explicitement marquées par `ScrollViewMarker` et leurs effets de bord sont masqués, afin de retirer le voile automatique en haut. L’overscroll de l’accueil révèle une étincelle et « Même les habitudes prennent une pause. », décoration exclue de l’accessibilité.
- TypeScript strict, exports iOS/Android et **25 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Le test de géométrie couvre la stabilité des largeurs proches et pleine largeur. Revue indépendante ciblée du code : aucun défaut bloquant relevé. Les exports prouvent uniquement la génération des bundles.
- Aucun simulateur utilisé. L’effet de bord natif est la cause supposée du voile : le garde-fou est implémenté, sans preuve visuelle de sa disparition. Le rendu natif Liquid Glass, la barre de statut et l’easter egg restent à vérifier sur appareil ; les tests de géométrie ne prouvent pas leur rendu.


## Dock SwiftUI natif — 2026-11-07

- Remplacement du dock `expo-glass-effect` décrit dans la validation précédente par une arborescence SwiftUI complète via `@expo/ui` 58.0.27 : `Host`, `HStack`, `Button`, `Image` et `glassEffect` natif en variante `regular` interactive sur iOS 26 et versions ultérieures. La dépendance `expo-glass-effect` est supprimée.
- Navigation Expo Router et capture des morphings conservées dans les callbacks des boutons. Les autres plateformes et versions iOS utilisent le dock opaque React Native existant.
- TypeScript strict, exports iOS/Android et **25 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Les exports prouvent uniquement la génération des bundles.
- Aucun simulateur ni build natif exécuté. Le development client doit être reconstruit ; rendu Liquid Glass, gestes et accessibilité restent à vérifier sur appareil.

### Correction du crash ScrollViewMarker

- La création Fabric du marqueur expérimental provoquait une exception. Le podspec de react-native-screens 4.30.1 exclut son implémentation sans `RNS_GAMMA_ENABLED=1` et compile un stub à la place.
- Suppression de cet import et remplacement du marqueur par une View standard. Le dock SwiftUI et les options `scrollEdgeEffects` du Stack restent inchangés. Les descriptions antérieures du marqueur sont historiques, pas une validation de sa disponibilité native.
- Aucun simulateur utilisé. Le rendu du haut de l’écran reste à vérifier sur appareil.


## Barre d’onglets iOS système et arrêt du morphing horizontal — 2026-11-07

- Remplacement des boutons SwiftUI personnalisés par `NativeTabs` de `expo-router/native-tabs` sur iOS : quatre destinations, barre cachée avant authentification, sans minimisation automatique. Le dock devient un fond blanc arrondi sous la barre système ; les autres plateformes gardent le dock React Native. `@expo/ui` est supprimé.
- La revue a identifié une capture différée inadaptée aux onglets natifs : `tabPress` invalide désormais les transitions personnalisées et laisse le système gérer la sélection, sans morphing personnalisé. Les liens applicatifs et le dock React Native conservent le morphing vertical : largeur et origine restent fixes. L’overlay du détail conserve aussi sa position horizontale et sa largeur ; le swipe de journée intentionnel reste inchangé.
- `ScrollViewport` place une surface opaque fixe derrière la barre de statut iOS. Les options stables du Stack désactivant les effets de bord sont conservées ; aucun marqueur expérimental n’est réintroduit.
- TypeScript strict et **25 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`.
- Aucun simulateur utilisé. Le rendu de la barre système sur le dock blanc, la disparition du voile et les gestes restent à vérifier sur appareil.


## Marges physiques et hauteur du dock natif — 2026-11-07

- Suppression du calque opaque de barre de statut décrit dans la validation précédente : il coupait visuellement le titre. `ScrollViewport` reste une View standard, sans marqueur Gamma. Les options stables du Stack masquent toujours les effets de bord.
- `DeviceInsetsProvider`, sous le SafeAreaProvider racine et au-dessus du Stack/NativeTabs, capture les marges physiques de fenêtre. Accueil, Aujourd’hui, Page/Dock, Welcome et TabCardMotion utilisent ces marges plutôt que les marges locales des onglets incluant leur barre native. Le dock réserve `56 + max(marge basse physique, 8)` points, soit 90 pour une marge de 34 ; l’accueil réserve la marge haute physique plus 12 points.
- L’easter egg est positionné en absolu à −54 points dans le ScrollView, au lieu de le précéder comme premier enfant. Le ScrollView reste ainsi le premier descendant natif détectable par le Stack.
- TypeScript et 25 tests passent ; un test d’intégration HTTP/Rust est ignoré en l’absence de binaire backend. Exports iOS/Android réussis. Aucun simulateur utilisé ; le rendu du haut, de la barre native et des gestes reste à vérifier sur appareil.


## Dock sombre, easter egg fixe et animation au focus — 2026-11-07

- Le fond du dock iOS suit le thème : blanc en clair, noir `#0c1011` en sombre. Les icônes et la teinte de sélection de NativeTabs utilisent la couleur de texte du thème.
- L’easter egg de l’accueil est désormais un frère fixe après `ScrollViewport`, à la marge physique haute + 20 points. Il ne se déplace pas avec le contenu ; seule son opacité est interpolée par le pilote natif entre une traction de marge haute + 96 et + 140 points, sans état React par événement de scroll. Il reste exclu de l’accessibilité.
- Le focus d’un onglet natif réactive une entrée locale des seules cartes visibles : hauteur de 104 à 100 %, opacité de 0,94 à 1, 260 ms, sans variation horizontale ni déplacement d’origine. Les liens applicatifs conservent leur morphing vertical capturé. La préférence système de réduction des animations est réactive et considérée active avant sa résolution native.
- TypeScript et **25 tests mobiles réussis** ; un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Exports iOS/Android réussis.
- Trois propositions de splash plein écran sont présentées dans `.impeccable/mocks/splash-v1` : A « Souffle » recommandé, B « Cartes », C « Un jour ». Elles ne sont pas implémentées.
- Aucun simulateur utilisé. Le rendu sombre de la barre native, l’overscroll et les animations restent à vérifier sur appareil ; tests et exports ne prouvent pas le rendu natif.


## Splash B « Les cartes » — 2026-11-07

- Choix B intégré dans `LaunchSplash` : trois bandes pastel, pile puis composition d’accueil en cinq surfaces, animation de 760 ms et fondu de 190 ms. Modal native plein écran au-dessus de la barre d’onglets, thème et marges physiques pris en compte ; barre de statut masquée uniquement pendant la séquence.
- `expo-splash-screen` 58.0.13 et son plugin fournissent le splash initial statique noir, maintenu jusqu’à l’affichage de la Modal. L’application ou la bienvenue se monte dessous sans attendre de réseau ni d’authentification ; séquence une fois par montage racine. Réduction des animations, repli de lecture à 200 ms, garde-fou de 2,5 secondes dès le montage et annulation au démontage traités dans le code.
- TypeScript strict et **26 tests mobiles réussis**, un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Le test ajouté vérifie la géométrie des surfaces ; il ne prouve ni le cycle de vie natif du splash ni son rendu. Les exports iOS/Android finaux sont réussis.
- Aucun simulateur utilisé. Reconstruction native nécessaire pour le plugin ; lancement, fondu, barre de statut, réduction des animations et rendu sombre restent à vérifier sur appareil dans une build release. Expo Go et le development client ne reproduisent pas complètement le splash de production.


## Accès direct en mode démo — 2026-11-07

- Le connector fake restaure automatiquement sa session locale via `getSession`. L’accueil s’ouvre directement après le splash B existant, sans bienvenue ni connexion ; aucune bienvenue n’est rendue pendant la restauration fake. Le parcours HTTP conserve sa bienvenue avant connexion.
- Le profil masque la déconnexion en mode fake et conserve la remise à zéro des données simulées. Les propositions de refonte du profil restent des maquettes, sans implémentation de cette refonte.
- TypeScript strict et **26 tests mobiles réussis** ; un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Exports iOS/Android réussis.
- Aucun simulateur utilisé. Ces contrôles ne prouvent pas le rendu ni le démarrage sur appareil.


## Profil A « L’essentiel » — 2026-11-07

- Proposition A intégrée dans `ProfileScreen`, réexporté par la route `/profile` : identité de session, carte verte « Mon parcours », réglages compacts. Le dashboard existant fournit niveau et XP, avec garde de permissions `statistics:read` et `habits:read`, chargement, erreur et réessai ; aucune statistique inventée.
- Préférence locale Système / Clair / Sombre via alerte native, persistée dans SecureStore (`habits.appearance.v1`) et appliquée par `Appearance`. La connexion affiche les données de session sans requête de santé ; les outils ouvrent `/console`. Réinitialisation fake avec confirmation, déconnexion HTTP avec protection pendant l’opération.
- Thèmes, marges physiques, défilement sous le dock et motion partagés réutilisés. TypeScript strict et **26 tests mobiles réussis** ; un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Exports iOS/Android réussis. Revue indépendante ciblée du code : aucun défaut bloquant relevé. Les exports prouvent la génération des bundles, pas le rendu natif.
- Aucun simulateur utilisé. Les contrôles de code ne prouvent pas le rendu natif : dock, alertes, persistance après relancement, VoiceOver, texte agrandi et thème sombre restent à vérifier sur appareil.


## Progression : liens, données démo et courbes — 2026-11-07

- Carte rose de l’accueil vers `section=overview` ; carte verte et flamme vers `section=regularity`, avec ancre sur la page Progression existante. Navigation partagée et motion verticale conservées ; lien Hydratation vers le détail inchangé.
- Courbe cubique monotone commune à l’accueil et à Progression, bornée sans dépassement et interrompue aux dates manquantes. Le fake fournit sept jours de saisies UTC réalistes par pas arrondis ; graphiques, totaux, XP et séries dérivent de ces entrées. Pas de modification des données HTTP.
- TypeScript strict et **30 tests mobiles réussis** ; un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Exports iOS/Android réussis.
- Les maquettes A/B/C de `frontend/mobile/.impeccable/mocks/progression-v1/` restent des propositions en attente de choix, sans implémentation de la refonte visuelle.
- Aucun simulateur utilisé ni rendu natif vérifié ; ces contrôles de code ne prouvent pas le rendu, l’accessibilité ou les interactions sur appareil.


## Progression B + régularité et catégories de A — 2026-11-07

- `ProgressScreen`, réexporté par `/progress`, implémente B avec sélection des 7 ou 30 derniers jours, courbe rose lissée et liste complète des valeurs journalières. La régularité verte de A remplace celle de B ; les catégories de A sont ajoutées sans supprimer une autre section.
- Record sur 91 jours, jours complets de la période, grille, série actuelle et XP utilisent les données du dashboard. Les catégories sont explicitement celles d’aujourd’hui et ouvrent les habitudes puis leur détail. Les ancres de l’accueil restent en place et ne réinitialisent pas le défilement lors d’un changement de période.
- Le fake fournit trente jours de saisies UTC arrondies au pas des objectifs, avec versions d’habitudes couvrant ces dates. Ses tableaux hebdomadaires conservent sept jours courants et sept précédents ; les moyennes dérivent des valeurs réelles. Données HTTP inchangées.
- TypeScript strict et **32 tests mobiles réussis** ; un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Exports finaux iOS/Android réussis ; ils prouvent uniquement la génération des bundles.
- Aucun simulateur utilisé ni rendu natif vérifié. Les tests de modèle et exports ne prouvent pas le rendu, la navigation, VoiceOver, le texte agrandi ou le thème sombre sur appareil. Les maquettes originales sont archivées, le choix hybride étant désormais implémenté.


## Morphings rétablis, y compris les cartes colorées — 2026-11-07

- Les changements d’onglet natifs capturent synchroniquement les rectangles en cache corrigés du défilement courant avant sélection. Les mesures de layout alimentent le cache ; aucun callback de mesure tardif ne déclenche une seconde sélection ou un remontage différé. Les liens applicatifs conservent la capture asynchrone.
- Cartes blanches associées par rôle, cartes colorées par palette réelle. Surface et dégradé animent leur hauteur sur 300 ms, avec origine et largeur fixes, amplitude capturée bornée à ±12 %, opacité de 0,98 à 1 et entrée locale de 108 à 100 % sans source correspondante. Les cartes insuffisamment visibles aux deux extrémités sont exclues ; réduction des animations réactive et active par défaut avant résolution native.
- TypeScript strict et **34 tests mobiles réussis** ; un test HTTP/Rust ignoré sans `HABITS_BACKEND_BIN`. Les tests couvrent notamment le défilement des rectangles en cache et l’association des palettes. Exports iOS/Android finaux réussis. La clé de la carte sortante reste stable pendant la préparation du prochain onglet.
- Aucun simulateur utilisé ni rendu natif vérifié. Les contrôles de code ne prouvent pas le rendu des transitions, VoiceOver ou le texte agrandi sur appareil.
