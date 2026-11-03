# TODO MVP 0.1.0 — ordre des dépendances

Alignement en lecture seule avec les 22 tâches de la base
[Tâches — Habit Tracker](https://app.notion.com/p/f4cd621878b44959b1234d402c6755b3),
consultée le 2026-11-02. Aucun statut Notion modifié. Les statuts ci-dessous
concernent le dépôt ; les preuves détaillées figurent dans docs/validation.md.
La recette des fournisseurs réels et le déploiement ne sont pas déclarés terminés.

1. [Initialiser le projet Cargo et l'arborescence modulaire](https://app.notion.com/p/40c4a85853dd8125876deed61ac0f728) — **livré**.
   Toolchain/Cargo.lock, structure ADR et frontières domaine vérifiées. Dépendance : ADR-001.

2. [Définir configuration typée et secrets par envvars](https://app.notion.com/p/40c4a85853dd81849709fee400c0d2e5) — **livré ; rotation de clé à compléter**.
   Config validée, clé env AES-256-GCM, AAD tenant/provider/version et tests de tampering. Ré-encryption/rotation des clés et procédure de récupération restent à automatiser. Dépendance : 1.

3. [Créer schéma SQLite SQLx et migrations](https://app.notion.com/p/40c4a85853dd813a8678c62b7b6715a4) — **livré**.
   Six migrations, FK composites/index tenant/idempotence, WAL ; upgrade depuis 0001 et reprise événements/XP testés. Dépendance : 1–2.

4. [Configurer Axum, Tokio, routing, errors et healthchecks](https://app.notion.com/p/40c4a85853dd81b5a3fbefcd2710c25c) — **livré**.
   Request IDs, erreurs uniformes, limites, healthchecks et routes fermées par défaut. Dépendance : 2–3.

5. [Appliquer l'isolation multi-utilisateur et contrôle d'accès](https://app.notion.com/p/40c4a85853dd815d9c43cdd1e42d8b07) — **livré pour les routes actuelles**.
   Filtres user_id/scopes/objets, tests multi-tenant services, HTTP PAT et JWT signé. Aucun droit global implicite. Dépendance : 3–4.

6. [Implémenter identité OIDC Pocket ID via JWT/JWKS](https://app.notion.com/p/40c4a85853dd81d19c30ce314a1c6ec3) — **adaptateur livré ; instance réelle à valider**.
   OIDC facultatif RFC 9068 at+jwt, claims stricts, algorithmes explicites, cache/rotation JWKS avec tests cryptographiques et HTTP hors ligne. Issuer/audience/profil Pocket ID réels non fournis ; ne pas assouplir le contrat pour accepter un ID token. Dépendance : 2, 4–5.

7. [Implémenter Personal Access Tokens et service accounts](https://app.notion.com/p/40c4a85853dd81949da9d3a16a3db5be) — **livré ; quota par identité à compléter**.
   Utilisateur local unique, bootstrap CLI, PAT/SA opaques hashés, scopes, expiration, rotation/révocation/audit transactionnel. Quota HTTP global présent ; quota par principal et lecture API audit/SA à ajouter. Dépendance : 3–5.

8. [Créer CRUD des habitudes et objectifs quantifiables](https://app.notion.com/p/40c4a85853dd811c8a92e528940caa46) — **livré**.
   Création/liste/lecture, catégories nutrition/sport/mind/daily, définitions futures historisées, archivage préservant les données. Type/unité/fuseau/période immuables. Dépendance : 5, 7.

9. [Créer schedules, repos, exceptions et timezone](https://app.notion.com/p/40c4a85853dd811eb49cced04a3be249) — **livré pour fenêtres dans une journée**.
   Schedules quotidiens/hebdomadaires, fréquence N/semaine, repos CRUD, IANA/DST et définitions versionnées. Vacances en plage et fenêtres traversant minuit restent des extensions explicites. Dépendance : 8.

10. [Créer les entries, check-in et déduplication](https://app.notion.com/p/40c4a85853dd81768fffd038648be850) — **livré**.
   Ajout/lecture/liste, correction/annulation par événements, replay, déduplication manuelle/source et XP atomiques. Dépendance : 8–9.

11. [Calculer les streaks et records déterministes](https://app.notion.com/p/40c4a85853dd8111baa8ebe68477eed7) — **livré**.
   Séries/records déterministes recalculables, repos neutres et jours ouverts exclus de la rupture prématurée. Dépendance : 9–10.

12. [Créer statistiques et heatmap via API](https://app.notion.com/p/40c4a85853dd814da3a5cd4423e5fa78) — **livré**.
   Statistiques 7/30/90 jours et heatmap individuelle 90 jours ; dashboard agrégé, anneaux pondérés, compteurs, comparaison ISO et heatmap 91 jours, repos exclus. Dépendance : 9–11.

13. [Implémenter XP, niveaux et récompenses réversibles](https://app.notion.com/p/40c4a85853dd8132b94aca8bbbc71406) — **livré pour les règles MVP**.
   10 XP par période atteinte, compensations, niveaux 100 XP et badges déterministes ; tests correction/repos/purge sans double attribution. Dépendance : 10–12.

14. [Implémenter OAuth Strava par utilisateur](https://app.notion.com/p/40c4a85853dd8159bc51d6acdea8ad8c) — **adaptateur livré ; validation fournisseur requise**.
   OAuth state hashé/usage unique/TTL, callback fixe, refresh chiffré avec CAS et révocation locale/purge. Application/capacité Strava non fournies ; révocation distante à effectuer chez le fournisseur, revue des conditions en vigueur avant activation. Dépendance : 2, 7, 10.

15. [Recevoir webhooks Strava et traiter jobs persistants](https://app.notion.com/p/40c4a85853dd81b8a761e7214717952f) — **livré et testé hors ligne**.
   Challenge/webhook, ACK durable rapide, jobs persistants idempotents, leases avec fencing des effets, reprise/backoff/8 essais, quotas globaux conservateurs et Retry-After. Dépendance : 14.

16. [Associer running et natation à des objectifs](https://app.notion.com/p/40c4a85853dd810a864fc5f826df280e) — **livré et testé hors ligne**.
   Run/TrailRun/VirtualRun et Swim, mappings métriques/unités, import paginé 90 jours, corrections/suppressions/purge avec recalcul/compensation. Tests source archivée, retries du même job et isolation. Rattrapage supérieur à 90 jours reste manuel/à concevoir. Dépendance : 10–15.

17. [Implémenter endpoints et connecteur Home Assistant](https://app.notion.com/p/40c4a85853dd81cea90ac0a1dca46012) — **intégration livrée ; déploiement homelab à valider**.
   Dashboard/PAT/SA, actions idempotentes et SSE révocable, intégration installable créant les entités, notifications/rappels persistants, token sortant chiffré. Tests HA 2026.10.2 + vrai binaire Rust isolés, panne/retry/DST couverts. Dépendance : 7, 10–13, 15.

18. [Documenter intégration Lovelace et notifications actionnables](https://app.notion.com/p/40c4a85853dd8163b256f2c3bc15ccbb) — **carte connectée et format HACS livrés ; publication HACS publique et notifications actionnables restantes**.
   Carte et vue dédiées sans secrets ni valeurs fictives ; métadonnées et portions génériques, responsive et états d'erreur. Ancien laboratoire conservé. Guide docs/home-assistant-connected.md ; recette visuelle dans le HA homelab et notifications actionnables natives à compléter, aucune PWA. Dépendance : 17.

19. [Documenter API OpenAPI v1 et pagination](https://app.notion.com/p/40c4a85853dd814f8fd5c42c6657f2fc) — **livré pour les routes actuelles**.
   OpenAPI généré y compris OAuth/webhook, snapshot CI, pagination et scopes. Dépendance : 4, 8–10.

20. [Créer Docker Compose durci et CI/CD](https://app.notion.com/p/40c4a85853dd817fb6a3df9d84490682) — **livré ; résultat de publication distante à valider**.
   Dépôt privé GitHub créé et premier push réalisé. Docker durci, CI Rust/audit/deny/smoke et HA ; build-and-push GHCR GITHUB_TOKEN amd64/arm64 après checks. Le succès de publication du workflow modifié n'est pas présumé. Dépendance : 1–5.

21. [Établir stratégie sauvegarde/restauration et observabilité](https://app.notion.com/p/40c4a85853dd81deaa0cef41d4d5fcb6) — **sauvegarde/restauration livrées ; exploitation à déployer**.
   Snapshot cohérent WAL et restauration Docker avec données/XP, rétention 7 quotidiens/4 hebdomadaires définie. Ordonnancement/copie chiffrée hors hôte, rotation de clés, métriques et alertes à déployer. Dépendance : 3–4, 20.

22. [Tester E2E sécurité, pannes et flux externes](https://app.notion.com/p/40c4a85853dd818a8bc4d910fcc97cf5) — **tests locaux livrés ; recette réelle restante**.
   Isolation, scopes/PAT/SA/JWT/JWKS, DST/repos/streak/XP, migrations/backup, panne HA, retries/webhook Strava et suppression/retention prouvés hors ligne. Recette Pocket ID/Strava/HA et registre réels, scan image et benchmarks homelab restent à réaliser avec paramètres opérateur. Dépendance : 6–21.
