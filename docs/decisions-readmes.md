# README bilingues et démarrage production

2026-11-03. Décisions avant rédaction des nouveaux guides.

- `README.md` devient l'entrée anglaise et `README.fr.md` sa version française,
  dans le backend comme dans le sous-module public HA. Les guides ont la même
  progression et les mêmes commandes, avec liens de langue réciproques.
- Ajouter un `compose.production.yaml` autonome, image GHCR uniquement, sans
  `build` ni montage des sources. Conserver `compose.yaml` pour les builds locaux
  et smoke tests, et `compose.dev.yaml`/Task pour le développement demandé.
- Le Compose de production reprend le durcissement, volume local `/data`, limites,
  healthcheck et variables optionnelles existants. Son défaut `AUTH_MODE=local`
  exige toujours un PAT valide et un bootstrap CLI ; aucun accès anonyme. Sans
  `.env`, le premier parcours n'exige aucun fournisseur OIDC/Strava/HA. Un
  `AUTH_MODE=disabled` explicite ferme toujours les routes privées.
- `HABIT_TRACKER_TAG` choisit le tag GHCR ; `HOST_BIND` reste loopback par défaut.
  Expliquer l'accès via proxy HTTPS et la connectivité depuis HA, sans inventer de
  domaine de production. Une image GHCR privée exige un accès de lecture au package.
- Le guide HA ne suppose aucun accès au dépôt backend privé. Il explique HACS,
  URL/token/scopes, entités, carte manuelle et mise à jour. La création d'habitudes
  reste une opération de l'API backend, pas une fonction HA inventée.
- Les exports de dépôt HACS emportent aussi `README.fr.md`, afin que les liens de
  langue fonctionnent dans l'archive. Aucun changement du domaine métier ni des
  identifiants/config entries HA.
