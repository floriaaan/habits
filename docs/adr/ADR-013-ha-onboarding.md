# ADR-013 — Création d'habitudes dans HA et éditeur Lovelace

- **Statut :** historique — décision consignée à la date indiquée.
- **Date de décision :** 2026-11-03.
- **Conversion en ADR :** 2026-11-05, sans nouvelle approbation ni changement du fond.

## Contexte

Créer les habitudes depuis les écrans natifs Home Assistant.

## Décision consignée

2026-11-03. Extension des écrans natifs HA, sans frontend autonome.

- Ajouter un options flow « Configurer » à l'intégration, utilisable après la
  connexion initiale comme sur une installation existante. Choix d'un preset puis
  formulaire modifiable, ou création libre. Après création, proposer une autre
  habitude ou terminer. Le dashboard vide renvoie vers la configuration HA.
- Presets initiaux : lecture, méditation, rangement, eau, fruits/légumes, course,
  natation. Ce sont des suggestions modifiables, jamais des données créées sans
  soumission. Les valeurs sont normalisées en count, secondes, mètres ou mL et
  les objectifs sportifs proposés sont hebdomadaires. Fuseau HA par défaut.
- Le PAT HA doit ajouter `habits:write` pour ce parcours. Les tokens de lecture
  existants continuent de fonctionner ; un refus de création explique le scope
  manquant sans contourner l'authentification ni réémettre un token.
- Réutiliser le domaine, la validation et l'insertion d'habitude existants.
  Ajouter `POST /api/v1/habits/setup` avec `{habit, presentation}` et une clé
  d'idempotence obligatoire : créer habitude, planification, première version,
  présentation et reçu dans une transaction. Une migration additive stocke les
  reçus par utilisateur. Reprise après réponse perdue : même clé, même résultat ;
  payload changé : 409. Les routes de création existantes restent compatibles.
- Le client conserve la clé pendant le flow et réutilise le mécanisme de retry
  idempotent. Une panne ou un ancien backend produit une erreur explicite. Les
  entités sont découvertes par le coordinator existant après rafraîchissement.
- Ajouter un éditeur de carte natif `ha-form` : capteur Dashboard, mode et filtre
  de catégorie. `getStubConfig` propose le vrai capteur disponible et les anciennes
  configurations YAML restent valides. Le rendu visuel existant est conservé.
- Livraison HACS 0.2.0 et image backend mise à jour ; création via HA exige le
  nouveau endpoint, consultation/actions restent utilisables sur l'ancien backend.
  La migration n'altère aucune donnée existante. Avant rollback de binaire,
  conserver le schéma additif ou restaurer une sauvegarde cohérente ; ne pas
  supprimer la base. Validation : API/isolation/rejeu, options flow réel HA,
  droits insuffisants, presets et éditeur dans le navigateur.

## Conséquences

La création exige habits:write et le nouvel endpoint ; les anciens parcours de consultation restent compatibles.
