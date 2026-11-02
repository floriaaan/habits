# ADR-001 — Backend Rust pour Habit Tracker

- **Statut :** Accepté
- **Date :** 2026-11-02
- **Décideurs :** Mainteneur du projet
- **Contexte :** MVP 0.1.0

## Contexte et problème

Habit Tracker est une API REST self-hosted et open-source de suivi d'habitudes. Elle doit être accessible publiquement derrière un reverse proxy HTTPS, fonctionner sans frontend autonome, être multi-utilisateur dès le MVP et servir des clients Home Assistant, des scripts CLI et des connecteurs externes. La plateforme intègre Pocket ID via OIDC, une authentification non interactive, Strava (running et natation), des calculs d'objectifs, de streaks, de statistiques et de gamification. Le déploiement cible est un homelab Docker à ressources contraintes.

Une comparaison Rust/Axum et AdonisJS/Node.js a été menée. La sécurité mémoire, la simplicité du binaire de production, la consommation de ressources et la stabilité du domaine métier sont privilégiées ; le coût initial de développement en Rust est accepté. La protection contre les vulnérabilités dépend toujours des versions et du durcissement de l'application, et non du seul langage.

## Décision

Construire un **monolithe modulaire Rust** utilisant :

- Axum + Tokio + Tower pour HTTP et traitements asynchrones ;
- SQLx avec SQLite pour stockage transactionnel et migrations ;
- Serde pour sérialisation, validation explicite des entrées, utoipa pour OpenAPI ;
- Reqwest pour les appels sortants ;
- tracing pour logs structurés ;
- une implémentation JWT/JWKS vérifiant strictement `iss`, `aud`, `exp`, `nbf` et les algorithmes autorisés ;
- une file de travaux persistante en SQLite pour synchronisations/retries.

Les versions exactes des dépendances doivent être vérifiées contre les versions stables compatibles au moment de l'implémentation, puis fixées par `Cargo.lock`.

## Structure imposée

```text
src/
├── main.rs
├── config.rs
├── modules/
│   ├── auth/
│   ├── users/
│   ├── habits/
│   ├── entries/
│   ├── schedules/
│   ├── streaks/
│   ├── statistics/
│   ├── gamification/
│   └── integrations/
│       ├── strava/
│       └── home_assistant/
├── infrastructure/
│   ├── database/
│   ├── jobs/
│   └── security/
└── http/
    ├── routes.rs
    └── middleware.rs
```

Chaque module métier possède ses types, erreurs, services et interfaces de persistance lorsque nécessaire. Le domaine n'importe pas Axum, SQLx ou les SDK externes ; les adaptateurs restent dans `infrastructure` ou `integrations`. Éviter une architecture hexagonale cérémonielle et les abstractions inutilisées.

## Périmètre fonctionnel du MVP

1. Utilisateurs isolés par identité stable `(issuer, subject)`, ressources tenant-scoped et permissions testées.
2. Auth OIDC Pocket ID par variables d'environnement, vérification de JWT d'accès destinés à l'API, avec JWKS et rotation ; ne pas accepter arbitrairement un ID token comme access token.
3. Accès headless via PAT et service accounts, tokens opaques hashés, scopes, rotation/révocation/expiration et audit. Le bootstrap administrateur se fait par CLI et non par secret admin permanent.
4. Habitudes booléennes, quantitatives, de durée et de fréquence ; planifications et unités normalisées.
5. Check-ins manuels/automatiques avec événements idempotents, corrections et annulations.
6. Gestion des repos, exceptions, fuseaux horaires et horaires d'éligibilité.
7. Streaks et records recalculables, heatmap et statistiques 7/30/90 jours ; XP via ledger compensable.
8. Intégration Strava OAuth par utilisateur, événements webhook, synchronisation running/natation et rapprochement sans doublons. Respecter quotas, suppression, révocation et conditions de conservation ; le multi-athlète nécessite une capacité Strava autorisée.
9. Endpoints exploitables par Home Assistant pour lire les indicateurs, enregistrer des réalisations et déclencher les notifications HA. Aucune PWA ni frontend autonome ; la custom card/extension HA peut être un livrable distinct.
10. Contrats API versionnés `/api/v1`, OpenAPI, erreurs uniformes, pagination et healthchecks.

## Contraintes de sécurité

- HTTPS terminé par NPMplus, API authentifiée sauf healthchecks internes et endpoints OAuth/webhooks dédiés, protégés par leur protocole de validation.
- AuthN et AuthZ distinctes ; filtrage `user_id` en base, vérifications objet par objet, aucun droit global implicite.
- Secrets et refresh tokens chiffrés au repos à l'aide d'une clé injectée par envvar, jamais loggés ; PAT hashés.
- Validation et limites de taille/débit, timeouts, allowlists de redirection, aucune invocation shell à partir d'entrées réseau.
- Webhook Strava validé selon son protocole ; accusé rapide et jobs asynchrones idempotents.
- Conteneur non-root, filesystem en lecture seule sauf volume `/data`, capabilities supprimées, sans Docker socket.
- `cargo audit`, `cargo deny`, dépendances revues, images et toolchain actualisées ; ne pas présumer qu'un programme Rust est exempt de vulnérabilités.

## Données et transactions

- SQLite WAL sur disque local ; ne pas utiliser un montage réseau pour la base active.
- Migrations SQLx versionnées, index uniques sur identifiants de provider et idempotency keys.
- Transactions atomiques pour réalisation + agrégats + ledger XP ; projections recalculables à partir des événements.
- Horodatages stockés en UTC, périodes évaluées dans le fuseau IANA propre à l'utilisateur/habitude. Gérer explicitement DST.
- Sauvegarde SQLite cohérente, restauration testée et politique de rétention définie.

## Alternatives écartées

- **AdonisJS / Node.js :** excellente productivité et conventions, mais runtime plus lourd et surface native supplémentaire ; acceptable comme solution de repli si le coût Rust devient disproportionné.
- **Fastify / TypeScript :** familier et rapide à livrer, non retenu pour les mêmes arbitrages opérationnels.
- **Microservices / Redis / PostgreSQL :** surdimensionnés pour le MVP ; séparation ultérieure possible sur mesures.
- **Frontend autonome :** explicitement hors périmètre.

## Conséquences

**Positives :** binaire compact, empreinte RAM généralement faible, types métier stricts, maintenance opérationnelle limitée, indépendance de HA et Strava.

**Négatives :** plus de code applicatif à concevoir (notamment auth, jobs et intégrations), compilation CI plus coûteuse, courbe d'apprentissage Rust et vigilance sur `unsafe`/dépendances natives.

## Critères d'acceptation ADR

- Structure ci-dessus conservée et `cargo fmt`, `clippy`, tests et build release réussis.
- Une requête sans token ou sur une ressource d'un autre utilisateur est refusée ; tests automatisés d'isolation.
- Répéter un événement ou webhook n'ajoute pas une deuxième entrée ou XP.
- Une exception de repos n'augmente pas le taux de réussite et ne casse pas une série éligible.
- Une correction/suppression Strava recalcule les résultats concernés et respecte les politiques de données.
- L'API continue à fonctionner lorsque Home Assistant ou Strava est indisponible.
- Docker Compose démarre sans privilèges ; healthchecks, logs et sauvegarde/restauration sont testés.

## Réexamen

Réexaminer l'ADR en cas de problèmes significatifs de recrutement/contribution Rust, de changement majeur du modèle d'utilisation ou de limites SQLite prouvées par benchmarks et métriques.

