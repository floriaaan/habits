# ADR-003 — Décisions complémentaires — itération 1

- **Statut :** historique — décision consignée à la date indiquée.
- **Date de décision :** 2026-11-02.
- **Conversion en ADR :** 2026-11-05, sans nouvelle approbation ni changement du fond.

## Contexte

Première tranche du MVP, sans authentification de production.

## Décision consignée

Date : 2026-11-02. Subordonné à ADR-001, conservé sans modification.

### Limite livrable et identité

Cette itération fournit création/listage d'habitudes, check-in/lecture et tests
HTTP sur SQLite réel. Le binaire refuse **toute** requête privée (401), y compris
avec un Bearer, un en-tête user_id ou une extension injectée. Un middleware
d'authentification synthétique n'existe que sous `cfg(test)` ; aucun mode env
ne peut l'activer. Les services utilisent une identité typée et des scopes ;
l'absence de droit donne 403, une ressource étrangère 404.

La tâche Notion OIDC ne confirme ni issuer réel, audience de ressource, URL
JWKS, algorithmes, ni moyen de distinguer access token et ID token. Aucun JWT
n'est accepté avant confirmation de ces paramètres. Voir `docs/auth.md`.
PAT et service accounts : contrats et tables seulement, aucune émission de
token, aucun bootstrap admin provisoire, aucun secret permanent.

### Métier

- UUID pour identifiants ; identité utilisateur unique `(issuer, subject)`.
- Période quotidienne uniquement ; fréquence = nombre de réalisations/jour.
  N/semaine reste au backlog, sans prétendre le couvrir par une période/jour.
- Unités canoniques : count, meters, seconds, milliliters. Valeurs finies,
  strictement positives et <= 1e12 ; booléen = count avec cible et valeur 1.
- Une planification par habitude, jours ISO 1..7, fenêtre locale facultative
  `[début, fin)` dans la même journée. Fenêtres nocturnes refusées pour l'instant.
- Instants reçus en RFC3339 avec offset explicite, normalisés en UTC. Stockage
  UTC et date locale évaluée dans le fuseau IANA de l'habitude. Aux transitions
  DST, deux instants distincts peuvent partager l'heure locale ; aucune
  conversion ambiguë depuis une heure locale naïve. Pas d'instants futurs.
- Une exception repos exclut la date de l'éligibilité ; un check-in y est refusé.
  Les algorithmes taux/streak et l'administration des exceptions restent à faire.
- `Idempotency-Key` obligatoire pour les entrées, ASCII 1..128, portée utilisateur
  et opération check-in. Rejeu identique = entrée initiale (200), même clé avec
  un contenu différent = 409. Clé conservée aussi longtemps que l'événement.
- Entrée et événement immuable sont écrits dans une transaction `BEGIN IMMEDIATE`.
  Pas de projection/XP produits dans cette tranche : le ledger est vide, aucun
  gain artificiel. Les futures projections et compensations devront rejoindre
  cette même transaction. Les sources externes ne sont pas acceptées par HTTP.
- Pagination limit/offset bornés (1..100 / 0..100000), ordre stable UTC + UUID.

### Stockage et exploitation

SQLite local WAL, foreign_keys, synchronous=FULL, busy_timeout=5 s ; migrations
SQLx embarquées au démarrage. FK composites avec user_id sur les objets liés.
Les secrets d'intégrations ont seulement des colonnes BLOB ciphertext/nonce/key_id,
sans colonne plaintext ni API d'écriture. Le chiffrement effectif avec clé env
est un préalable obligatoire à OAuth/PAT ; aucune clé n'est nécessaire pour ce
binaire qui ne conserve aucun secret.

Jobs : schéma persistant seulement, worker/retry/lease non implémentés.
Les types User, RestException, EntryEvent, Integration, SourceIdentifier, Job et
XpLedgerEntry décrivent les contrats de stockage ; leur présence ne livre aucun
service de provisionnement, correction, connecteur, worker ou attribution XP.
Strava/HA : modules explicitement non implémentés, aucun endpoint simulé.
Reqwest est réservé aux adaptateurs sortants HTTPS, sans redirection automatique.

Limites corps 16 KiB, concurrence 64, budget HTTP 10 s, quota global fixe
120 requêtes/s pour ce premier binaire fermé ; ne pas exploiter X-Forwarded-For
comme identité de confiance. Ajouter les quotas par principal lors de l'auth.
Les healthchecks doivent être exclus de la publication NPMplus. OpenAPI est
exportable par CLI et servi sous authentification ; aucune interface Swagger.

Sauvegarde via CLI `VACUUM INTO` sur fichier nouveau, restauration hors ligne
après quick_check + foreign_key_check, et redémarrage avec migrations. Rétention
opérateur : une sauvegarde quotidienne, 7 jours + 4 hebdomadaires, copies hors
hôte protégées comme les données d'origine. Les suppressions RGPD doivent aussi
suivre ce délai documenté ; chiffrement des sauvegardes à gérer par l'opérateur.

### Sources et dépendances

Sources consultées : ADR local, projet et tâches Notion Habit Tracker (lecture
seule), API crates.io pour chaque version directe et manifeste stable Rust
`https://static.rust-lang.org/dist/channel-rust-stable.toml` (1.99.1).
Les versions exactes et MSRV sont consignées dans `docs/dependencies.md` et
résolues dans Cargo.lock. Compilation native et Docker valident la compatibilité.

Références : https://docs.rs/axum/0.8.9/axum/ ;
https://docs.rs/sqlx/0.9.0/sqlx/ ; https://docs.rs/utoipa/6.0.0/utoipa/ .

Licence choisie pour ce nouveau projet open-source : MIT, sans attribution à
une personne ou organisation inventée. Copyright collectif des contributeurs.

## Conséquences

Le périmètre est volontairement fermé ; les contrats préparent les itérations suivantes.

## Évolutions liées

Certaines dispositions de cette étape historique sont complétées ou remplacées par [ADR-004-iteration-2](ADR-004-iteration-2.md). Le texte initial reste conservé pour expliquer leur origine.
