# ADR-011 — Démarrage local automatique et installation intégrée au README

- **Statut :** historique — décision consignée à la date indiquée.
- **Date de décision :** 2026-11-03.
- **Conversion en ADR :** 2026-11-05, sans nouvelle approbation ni changement du fond.

## Contexte

Simplifier le premier démarrage local et intégrer le Compose aux README.

## Décision consignée

2026-11-03. Remplace le parcours d'installation de `ADR-010-readmes.md` sur
demande explicite du mainteneur.

- Les README EN/FR contiennent directement un Compose GHCR complet à enregistrer
  comme `compose.yaml`. Supprimer `compose.production.yaml` ; le Compose du dépôt
  reste celui des builds locaux et des smoke tests. Toutes les variables runtime
  sont visibles, les groupes optionnels étant vides par défaut.
- Au démarrage du serveur en `AUTH_MODE=local` (alias `tokens`), provisionner le
  tenant local et son premier PAT administrateur automatiquement. Le fuseau du
  tenant est UTC par défaut ; chaque habitude garde son fuseau IANA explicite.
- Cette demande déroge au bootstrap CLI imposé par ADR-001 et à l'absence de
  secrets dans les logs : **une seule ligne JSON stdout** `event=local_bootstrap`
  contient le token et ses métadonnées, indépendamment du filtre de tracing.
  Tous les autres logs restent sans secrets. Le token expire après 24 h, se
  révoque/se remplace normalement et seule son empreinte est persistée.
- Utiliser le marqueur durable `users.is_admin` existant dans la même transaction
  SQLite immédiate que l'émission et l'audit. Un utilisateur déjà bootstrapé
  n'émet aucun token supplémentaire, même après expiration/révocation ou lors de
  démarrages concurrents. Aucun bootstrap automatique pour `disabled`, OIDC,
  healthcheck, backup ou commandes CLI sans rapport.
- La CLI `bootstrap-local TIMEZONE` reste disponible avant le premier lancement
  pour un fuseau explicite et une sortie privée. La récupération d'un token perdu
  ou expiré utilise `token-create` ; un crash entre commit et affichage ne doit pas
  provoquer une réémission automatique au redémarrage. Les logs de premier
  démarrage deviennent donc sensibles et doivent être accessibles aux opérateurs
  seulement. Les routes privées exigent toujours un token valide.

## Conséquences

Le secret initial apparaît une fois sur stdout ; les journaux de bootstrap nécessitent une protection opérateur.
