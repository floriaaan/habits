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
