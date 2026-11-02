# Preuves de validation — 2026-11-02

Réalisées dans le dépôt de cette itération ; aucun critère de fonctionnalité
future n'est déclaré satisfait à partir de tables ou modules vides.

## Environnement

- Hôte macOS arm64, toolchain Rust 1.99.1 installée avec rustfmt/clippy.
- Docker Engine 29.8.2 via OrbStack, images Linux arm64.
- Versions stables directes vérifiées via crates.io, verrouillées dans Cargo.lock.
- cargo-audit 0.22.2 et cargo-deny 0.20.2 installés avec `--locked`.

## Commandes exécutées et résultats

```sh
cargo check --locked
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
cargo test --locked --all-targets
cargo build --locked --release
cargo run --locked -- openapi > /tmp/habits-openapi.json
diff -u docs/openapi.json /tmp/habits-openapi.json
python3 scripts/check_domain_boundaries.py
docker compose config --quiet
cargo audit --deny warnings
cargo deny --locked check
python3 scripts/docker_smoke.py
```

- Check, fmt, clippy : réussis, aucun warning Clippy.
- Tests : **18 réussis, 0 échec, 0 ignoré** ; tests de bibliothèque/services/HTTP
  avec vrais fichiers SQLite temporaires, pas de mock de persistance.
- Release native : réussie ; release Linux arm64 également compilée dans le
  Dockerfile multi-stage.
- Export OpenAPI : généré et identique au snapshot `docs/openapi.json`.
- Frontières domaine : aucun import Axum/SQLx/Reqwest/Tower hors adaptateurs.
- Compose : configuration valide et démarrage en état healthy.
- cargo audit : succès, 1402 advisories RustSec chargés, aucun advisory signalé
  sur les 271 éléments dépendances/paquet scannés, aucun avertissement accepté.
- cargo deny : advisories/bans/licenses/sources **ok** après revue de la licence
  CDLA-Permissive-2.0 ; quatre familles de doublons transitifs restent signalées
  en avertissements (base64/hashbrown/syn/tower-http), documentées dans dependencies.md.
- Smoke Docker : succès après ajout des notices de licence dans l'image finale ;
  UID 10001, rootfs readonly, cap_drop ALL, non privileged, aucun socket Docker,
  healthchecks live/ready, 401 avec faux Bearer et faux en-tête d'identité,
  logs JSON sans token, snapshot SQLite vérifié, arrêt/restauration/redémarrage.
  Le projet/volume de smoke est éphémère et a été supprimé après chaque exécution.

Le premier essai de compilation des tests a échoué sur une chaîne SQL dynamique
du compteur de fixture, interdite par SQLx 0.9 ; elle a été remplacée par des
requêtes littérales. Les tests ont ensuite été relancés et passent.
Le premier cargo deny a refusé une licence absente de l'allowlist ; texte revu,
notice conservée, relance réussie. Aucun contournement de sécurité/advisory.

## Cas prouvés

1. Configuration refusant modes d'auth non implémentés et valeurs invalides,
   adresse de healthcheck conservant la famille IPv4/IPv6 de l'écoute.
2. Binaire HTTP refusant token absent, Bearer arbitraire et en-têtes usurpés.
3. Isolation création/listage et lecture/écriture d'entrées ; scopes distincts.
4. Idempotence identique, conflit de contenu, portée tenant et rejeux concurrents.
5. Rollback de l'entrée si l'insertion de l'événement échoue.
6. FK composites refusant les écritures inter-tenant ; migrations répétables,
   foreign_keys et WAL sur chacune des quatre connexions du pool.
7. Valeurs finies, noms, unités/types, pagination, champs inconnus, UUID, corps
   trop volumineux, clé idempotente obligatoire et quota HTTP global.
8. Date locale Europe/Paris, saut de printemps, heure répétée d'automne,
   refus de datetime sans offset, fenêtres et exception repos.
9. Sauvegarde d'une base WAL avec habitudes/entrées, restauration des données,
   contrôle d'intégrité et FK, refus d'écraser un snapshot existant.
10. Schémas/routes/sécurité OpenAPI et absence de dépendance à un provider au
    démarrage ou sur les routes livrées.

## Limites explicites

- **Aucune route métier utilisable en production avant implémentation de l'auth.**
  OIDC non implémenté faute de contrat resource/audience/JWKS/profil access token
  confirmé. PAT/service accounts : contrats et tables, sans émission, vérification
  ni CLI de bootstrap. Aucun compte n'est créé au démarrage.
- Pas de CRUD complet : création/liste des habitudes, ajout/lecture/liste des
  entrées seulement. Correction/annulation, fréquence N/semaine et administration
  des exceptions restent à faire ; périodes quotidiennes uniquement.
- Pas de calcul streak/records, taux/heatmap, XP/niveaux, agrégats ou projections.
  Le test repos prouve le refus d'un check-in ce jour-là ; il ne prouve pas encore
  le critère final sur les taux et séries, dont les moteurs restent à écrire.
- Pas de connecteur Strava/HA, OAuth, validation webhook, worker de jobs,
  synchronisation/retries ou chiffrement effectif de refresh tokens. Aucun secret
  de fournisseur n'est reçu ni persisté. Les tables futures sont explicitement
  inactives. Pas de test fictif de correction/suppression Strava ou de webhook.
- Les pannes provider n'ont aucun effet sur ce socle sans dépendance provider ;
  cela ne prouve pas la résilience des futurs connecteurs. Ajouter leurs tests
  de panne, quotas, révocation/suppression et conservation avant le MVP complet.
- CI GitHub configurée mais non exécutée à distance ; pas de publication/CD ni
  déploiement public. Linux arm64 et macOS arm64 vérifiés, amd64 non exécuté ici.
- Pas de benchmark de charge, métriques, scan CVE complet de l'image ou test
  d'un reverse proxy NPMplus réel. Le quota global n'est pas un quota par tenant.
- Rétention définie (7 quotidiennes + 4 hebdomadaires) et procédure documentée ;
  ordonnancement, copies chiffrées hors hôte et rotation opérateur non déployés.

Le backlog détaillé, aligné avec les 22 tâches Notion sans modification externe,
est dans `TODO-MVP.md`. Cette validation couvre la première itération demandée,
pas la totalité des critères d'acceptation ADR-001 du MVP final.
