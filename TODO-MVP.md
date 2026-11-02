# TODO MVP 0.1.0 — ordre des dépendances

Alignement en lecture seule avec les 22 tâches de la base
[Tâches — Habit Tracker](https://app.notion.com/p/f4cd621878b44959b1234d402c6755b3),
consultée le 2026-11-02. Aucun statut Notion n'a été modifié. Les mentions
« livré » décrivent le dépôt, pas un changement de statut externe.
La première itération ne valide pas tous les critères de sortie ADR du MVP.

1. [Initialiser le projet Cargo et l'arborescence modulaire](https://app.notion.com/p/40c4a85853dd8125876deed61ac0f728) — livré.
   Toolchain/Cargo.lock, modules ADR, frontières domaine/adaptateurs. Dépendance : ADR-001.
2. [Définir configuration typée et secrets par envvars](https://app.notion.com/p/40c4a85853dd81849709fee400c0d2e5) — partiel.
   Config serveur validée livrée ; AEAD avec clé env, rotation et tests de secrets
   **à faire avant toute persistance OAuth**. Dépendance : 1.
3. [Créer schéma SQLite SQLx et migrations](https://app.notion.com/p/40c4a85853dd813a8678c62b7b6715a4) — socle livré.
   Schéma/filtres/FK/index uniques, WAL et migrations répétables ; projections
   métier à introduire avec leurs services. Dépendance : 1–2.
4. [Configurer Axum, Tokio, routing, errors et healthchecks](https://app.notion.com/p/40c4a85853dd81b5a3fbefcd2710c25c) — livré pour la tranche.
   request_id, erreurs, limites, logs et mode fermé. Dépendance : 2–3.
5. [Appliquer l'isolation multi-utilisateur et contrôle d'accès](https://app.notion.com/p/40c4a85853dd815d9c43cdd1e42d8b07) — tests de la tranche livrés.
   AuthZ par scopes et objet, FK tenant et tests HTTP/services. Étendre à chaque
   futur endpoint, sans droit global implicite. Dépendance : 3–4.
6. [Implémenter identité OIDC Pocket ID via JWT/JWKS](https://app.notion.com/p/40c4a85853dd81d19c30ce314a1c6ec3) — **bloqué par contrat fournisseur**.
   Faire confirmer tous les paramètres de docs/auth.md, puis vérification stricte,
   distinction ID/access token, rotation/cache/pannes et provisionnement stable.
   Aucun JWT accepté actuellement. Dépendance : 2, 4–5.
7. [Implémenter Personal Access Tokens et service accounts](https://app.notion.com/p/40c4a85853dd81949da9d3a16a3db5be) — contrats/tables seulement.
   CLI bootstrap, CSPRNG/hash, scopes, expiration, rotation/révocation/audit,
   compte de service tenant-scoped et quotas par principal. Dépendance : 3–6.
8. [Créer CRUD des habitudes et objectifs quantifiables](https://app.notion.com/p/40c4a85853dd811c8a92e528940caa46) — création/liste livrées en tests.
   Lecture individuelle, édition, archivage/suppression et changement de cible
   historisé restent à faire. Ouverture runtime dépend de 6 ou 7. Dépendance : 5.
9. [Créer schedules, repos, exceptions et timezone](https://app.notion.com/p/40c4a85853dd811eb49cced04a3be249) — partiel.
   Jours ISO/fenêtres/date IANA et refus repos livrés, DST testé. CRUD exceptions,
   vacances, N/semaine, fenêtres nocturnes, périodes versionnées à faire.
   Dépendance : 8.
10. [Créer les entries, check-in et déduplication](https://app.notion.com/p/40c4a85853dd81768fffd038648be850) — ajout/lecture/idempotence livrés en tests.
    Corrections/annulations avec journal immuable, source auto et replay de
    projections à faire. Même transaction entrée + agrégats + ledger lors de
    leur introduction. Dépendance : 8–9.
11. [Calculer les streaks et records déterministes](https://app.notion.com/p/40c4a85853dd8111baa8ebe68477eed7) — à faire.
    Replay tenant/période, repos neutres et DST ; preuve qu'une exception repos
    ne casse pas une série éligible. Dépendance : 9–10.
12. [Créer statistiques et heatmap via API](https://app.notion.com/p/40c4a85853dd814da3a5cd4423e5fa78) — à faire.
    7/30/90 jours, dénominateur éligible excluant les repos, pagination/périodes.
    Dépendance : 9–11.
13. [Implémenter XP, niveaux et récompenses réversibles](https://app.notion.com/p/40c4a85853dd8132b94aca8bbbc71406) — table ledger seulement.
    Règles versionnées, crédits/compensations atomiques, replay et tests de
    correction ; aucun XP ni niveau attribué dans ce socle. Dépendance : 10–12.
14. [Implémenter OAuth Strava par utilisateur](https://app.notion.com/p/40c4a85853dd8159bc51d6acdea8ad8c) — à faire.
    Clé AEAD fonctionnelle, state/allowlist, refresh/revocation, limites compte
    Strava/multi-athlète explicitement autorisées, politiques conservation.
    Dépendance : 2, 6–7, 10.
15. [Recevoir webhooks Strava et traiter jobs persistants](https://app.notion.com/p/40c4a85853dd81b8a761e7214717952f) — schéma jobs seulement.
    Challenge/protocole validé, ACK rapide, idempotence webhook, worker avec
    leases, reprise après crash, retries/backoff, quotas et déduplication source.
    Dépendance : 14.
16. [Associer running et natation à des objectifs](https://app.notion.com/p/40c4a85853dd810a864fc5f826df280e) — à faire.
    Unités, import/reconciliation, correction/suppression/révocation, purge des
    données et projections/XP recalculés. Dépendance : 10–15.
17. [Implémenter endpoints et connecteur Home Assistant](https://app.notion.com/p/40c4a85853dd81cea90ac0a1dca46012) — à faire.
    Indicateurs/check-ins scopés et notifications asynchrones ; timeout/panne HA
    ne doit pas bloquer le parcours manuel. Dépendance : 7, 10–13, worker de 15.
18. [Documenter intégration Lovelace et notifications actionnables](https://app.notion.com/p/40c4a85853dd8163b256f2c3bc15ccbb) — à faire.
    Exemples HA sans secrets ; card/extension distincte éventuelle, aucune PWA.
    Dépendance : 17.
19. [Documenter API OpenAPI v1 et pagination](https://app.notion.com/p/40c4a85853dd814f8fd5c42c6657f2fc) — livré pour les routes actuelles.
    Génération utoipa et contrôle du snapshot ; étendre contrats/scopes/erreurs
    à chaque route future, quotas par identité. Dépendance : 4, 8–10.
20. [Créer Docker Compose durci et CI/CD](https://app.notion.com/p/40c4a85853dd817fb6a3df9d84490682) — Docker et CI livrés, aucun CD configuré.
    Non-root/rootfs read-only/cap_drop, volume local, images/toolchain fixées,
    fmt/clippy/test/release/audit/deny et smoke. Publication/CD seulement après
    décisions de registre et environnement, sans URL inventée. Dépendance : 1–5.
21. [Établir stratégie sauvegarde/restauration et observabilité](https://app.notion.com/p/40c4a85853dd81deaa0cef41d4d5fcb6) — CLI/tests/procédure/rétention livrés.
    Ordonnancement opérateur, copie chiffrée hors hôte, rotation des sauvegardes
    et métriques/alertes quotas/latence/erreurs restent à déployer. Dépendance : 3–4, 20.
22. [Tester E2E sécurité, pannes et flux externes](https://app.notion.com/p/40c4a85853dd818a8bc4d910fcc97cf5) — tests locaux de la tranche livrés.
    Ajouter fournisseur JWT réel/test JWKS, PAT/SA, indisponibilités HA/Strava,
    reprises de jobs, rejouage webhook, suppression/correction Strava, taux/streak
    repos et tests conservation avant de déclarer le MVP terminé. Dépendance : 6–21.
