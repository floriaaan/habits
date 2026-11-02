# Décisions — poursuite du MVP

2026-11-02. ADR-001 reste applicable ; les choix suivants précisent l'itération 2.

- Authentification optionnelle = adaptateur activable par configuration.
  `AUTH_MODE=disabled` reste fermé ; `AUTH_MODE=tokens`
  accepte les PAT et tokens de comptes de service. Aucun tenant anonyme ni droit
  issu d'un en-tête d'identité. OIDC exige le contrat de ressource décrit ci-dessous.
- Clarification du mainteneur : sans Pocket ID, un utilisateur local unique
  `(urn:habit-tracker:local, default)` est provisionné, UUID stable en SQLite.
  Ce compte local est explicitement demandé, sans compte fournisseur inventé.
  `AUTH_MODE=local` (alias tokens) utilise PAT/SA de cet utilisateur seulement ;
  disabled reste le défaut fermé. Aucun mode anonyme. Le bootstrap CLI est
  `bootstrap-local TIMEZONE` ; la gestion multi-utilisateur reste OIDC optionnelle.
  Strava/HA/Pocket ID sont optionnels et désactivés sans configuration.
- L'adaptateur OIDC optionnel vise explicitement un access token de ressource
  RFC 9068 (`typ=at+jwt`) ; son activation exige issuer, audience API, JWKS HTTPS
  et algorithmes autorisés explicites. Aucun ID token ni simple `typ=JWT` n'est
  accepté. La compatibilité de l'instance Pocket ID réelle reste à vérifier par
  l'opérateur. Sans ce contrat, utiliser le mode local ; en panne temporaire du
  fournisseur, ne pas basculer silencieusement vers un autre tenant.
- Bootstrap administrateur par CLI locale, une seule fois, avec issuer/subject
  et timezone fournis par l'opérateur. L'administrateur gère des identités, mais
  n'a aucun accès implicite aux habitudes des autres utilisateurs. Le bootstrap
  émet un PAT expirant sous 24 h, affiché une seule fois ; pas de secret permanent.
- Tokens opaques de 256 bits CSPRNG ; SHA-256 seulement en base. Scopes explicites,
  expiration obligatoire (maximum 365 jours), rotation/révocation atomique et
  audit transactionnel. Un token ne peut déléguer plus de scopes qu'il n'en porte.
- Build/push : GHCR accepté via GITHUB_TOKEN, nom dérivé du dépôt GitHub ;
  aucune publication locale ni destination inventée. Pas de push depuis les PR.
- Compléter le métier à partir des événements existants, avec une migration
  nouvelle : ne pas modifier une migration déjà livrée. Projections quotidiennes
  et ledger XP transactionnels, corrections/annulations par événements append-only.
  Une réalisation de période donne 10 XP, compensés si elle cesse d'être atteinte.
  Les seuils de niveau sont déterministes (100 XP/niveau), sans récompenses fictives.
- Les changements de définition sont historisés avec date d'effet locale ; ils
  ne réinterprètent pas silencieusement les anciennes cibles ou fuseaux.
- Les connecteurs sont configurables et fermés sans paramètres. Leurs tests
  utiliseront des serveurs HTTP de test ; aucun compte réel ni secret n'est créé.
  Les paramètres manquants des services réels empêchent de valider le déploiement
  fournisseur, pas de développer/tester les adaptateurs et moteurs locaux.
