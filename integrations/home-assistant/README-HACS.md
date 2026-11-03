# Habit Tracker pour Home Assistant

Intégration et carte Lovelace connectées à l'API Habit Tracker : entités créées
automatiquement, anneaux par catégorie, cases, incréments, semaines et historique.
Home Assistant **2026.10.2 minimum**. Un backend Habit Tracker compatible avec
`/api/v1/dashboard` et `/api/v1/dashboard/events` doit déjà être démarré et joignable
depuis HA. HACS installe le client HA, pas le serveur Rust ni un add-on.

## Installation HACS

Le dépôt de distribution doit être **public** : HACS ne peut pas installer un
[dépôt privé](https://www.hacs.dev/docs/faq/private_repositories/).

1. Dans **HACS → ⋮ → Dépôts personnalisés**, ajouter l'URL GitHub du dépôt de
   distribution, catégorie **Integration**. Il n'est pas nécessaire d'ajouter une
   seconde entrée de type Dashboard.
2. Chercher **Habit Tracker**, télécharger puis redémarrer Home Assistant.
3. **Paramètres → Appareils et services → Ajouter une intégration → Habit Tracker**.
   Saisir l'URL du backend et un PAT (ou token de compte de service) du bon
   utilisateur avec `habits:read`, `statistics:read`, `entries:write`.
   HTTPS par défaut ; HTTP exige l'option explicite pour une liaison locale fiable.
4. Recharger le navigateur. La carte est chargée automatiquement par l'intégration,
   y compris avec un dashboard YAML. Aucune copie dans `/config/www`, ressource
   Lovelace manuelle ou helper `input_boolean`/`input_number` n'est nécessaire.
5. Ajouter une carte manuelle :

```yaml
type: custom:habit-tracker-card
entity: sensor.habit_tracker_dashboard
mode: rings
```

Remplacer l'entité si HA a choisi un autre identifiant. Modes : `rings`, `habits`
(filtre facultatif `category: mind` ou `daily`), `nutrition`, `sport`, `weekly`,
`heatmap`. Le [dashboard complet](custom_components/habit_tracker/www/dashboard.yaml)
est également fourni. Les cartes utilisent exclusivement les états et services HA,
sans token côté navigateur.

## Mise à jour et migration

Les versions publiées apparaissent dans HACS. Après une mise à jour, redémarrer HA
puis recharger le navigateur. Le numéro de version du module évite l'ancien cache.
Les données restent dans le backend ; les config entries et identifiants des entités
restent inchangés. HACS peut aussi installer la branche par défaut.

Pour passer d'une installation manuelle, retirer l'ancienne ressource Lovelace
`/local/habit-tracker/habit-tracker-card.js?...` avant de recharger la page ;
l'intégration charge désormais la carte. Ne pas supprimer/recréer la config entry.
Une ressource du prototype `habit-lab-visual-card` est indépendante et peut rester.

## Entités et permissions

- Capteur **Dashboard** : score, groupes, compteurs, semaines, heatmap et XP dans
  les attributs. La série globale est bornée aux 91 dates de la heatmap.
- Capteur de progression par habitude ; switch pour les habitudes booléennes ;
  boutons ajouter/retirer pour les habitudes quantitatives, de durée ou fréquence.
- Service `habit_tracker.perform_action` sur le capteur Dashboard, avec `habit_id`
  et `action: complete|uncomplete|increment|decrement`.

Les actions sont idempotentes ; un retrait corrige/annule les entrées manuelles,
sans supprimer les entrées Strava. SSE assure la mise à jour en environ une seconde,
avec polling de secours toutes les 60 secondes. Le proxy doit désactiver le buffering
SSE et accepter les connexions longues. Après révocation/expiration du token,
réauthentifier l'intégration ; les routes backend restent fermées sans token.

Le PAT est stocké côté serveur HA dans ses config entries. Protéger `.storage` et
ses sauvegardes. Les permissions HA contrôlent l'accès aux entités : ne pas partager
des entités personnelles avec des utilisateurs qui ne doivent pas y accéder.
Les rappels exigent une configuration distincte du connecteur HA sortant du backend.
L'installation HACS ne configure pas automatiquement ces credentials ni Strava/OIDC.

## Dépannage

- **Carte inconnue** : vérifier que l'intégration est chargée, retirer l'ancienne
  ressource manuelle puis recharger complètement le navigateur.
- **Entités indisponibles** : vérifier URL, portée/expiration du token et accès
  réseau depuis HA. Une erreur d'authentification demande une nouvelle connexion.
- **Statistiques vides** : elles nécessitent des habitudes et réalisations réelles ;
  aucune donnée de démonstration n'est injectée.
- Éviter d'enregistrer les gros attributs du capteur Dashboard dans Recorder si
  l'historique de l'API suffit. Utiliser son entity_id réel dans l'exclusion Recorder.

Installation manuelle de secours : copier uniquement `custom_components/habit_tracker`
dans le dossier de configuration HA puis reprendre à l'étape 2. Licence MIT.
