# ADR-007 — Distribution Home Assistant via HACS

- **Statut :** historique — décision consignée à la date indiquée.
- **Date de décision :** 2026-11-03.
- **Conversion en ADR :** 2026-11-05, sans nouvelle approbation ni changement du fond.

## Contexte

Distribuer ensemble le composant Home Assistant et sa carte.

## Décision consignée

2026-11-03. Complément de l'ADR-001, avant implémentation.

La publication a ensuite été autorisée et le client déplacé dans un sous-module
public ; voir [ADR-008-ha-submodule.md](ADR-008-ha-submodule.md). Les décisions
ci-dessous décrivent l'étape de préparation initiale.

- Une seule entrée HACS, de type **Integration**, livre le composant Python et la
  carte connectée. Source canonique : `custom_components/habit_tracker/` à la racine
  du dépôt, seule intégration présente. La carte est embarquée dans `www/` ; le
  prototype laboratoire reste séparé dans `integrations/home-assistant/cards/`.
- L'intégration dépend explicitement de `frontend` et `http` et enregistre son module avec
  `frontend.add_extra_js_url`. Un chemin statique HA limité au seul fichier JS,
  versionné par le manifest, évite la copie dans `/config/www` et la déclaration
  manuelle d'une ressource Lovelace, en mode stockage comme en mode YAML.
  Ce fichier ne contient aucun credential ni donnée utilisateur. Le backend Rust
  et ses routes privées ne changent pas. Les mises à jour nécessitent un
  redémarrage HA et un rechargement du navigateur.
- HACS ne gère pas les dépôts privés. `floriaaan/habits` reste privé. Préparer un
  export limité à l'intégration, son dashboard exemple, sa documentation, sa licence
  et son manifeste HACS permet de publier ensuite un dépôt public distinct, sans
  exposer le backend ni son historique. La publication publique attend un accord
  explicite du propriétaire ; le format HACS seul ne rend pas ce dépôt installable.
- Pas de soumission au catalogue HACS, de téléchargement de code au runtime ou de
  token GitHub ajouté à HA. HACS gère le téléchargement et les mises à jour depuis
  une branche ou une release GitHub ; aucun système de mise à jour parallèle.
- Le parcours par copie et les tasks de synchronisation restent utilisables pour
  le développement. Une ancienne ressource `/local/.../habit-tracker-card.js`
  doit être retirée lors du passage au module fourni automatiquement ; le
  prototype `habit-lab-visual-card` n'est pas concerné.

Références : [structure HACS](https://www.hacs.dev/docs/publish/integration/),
[dépôts privés](https://www.hacs.dev/docs/faq/private_repositories/),
[manifest HACS](https://contributors.home-assistant.io/marketplace/reference/hacs-json/),
[chemins statiques HA](https://contributors.home-assistant.io/blog/2024/06/18/async_register_static_paths/),
[chargement de modules HA 2026.10.2](https://github.com/home-assistant/core/blob/2026.10.2/homeassistant/components/frontend/__init__.py).

## Conséquences

La distribution publique est séparée du backend privé ; les décisions ultérieures précisent publication et chargement.

## Évolutions liées

Certaines dispositions de cette étape historique sont complétées ou remplacées par [ADR-008-ha-submodule](ADR-008-ha-submodule.md), [ADR-012-ha-resource-loading](ADR-012-ha-resource-loading.md). Le texte initial reste conservé pour expliquer leur origine.
