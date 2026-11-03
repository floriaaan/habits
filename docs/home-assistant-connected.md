# Home Assistant connecté à Habit Tracker

L'intégration `habit_tracker` crée les entités à partir des habitudes de l'API.
La carte `habit-tracker-card` utilise ces états et les services HA ; aucun PAT
n'est placé dans le JavaScript ou dans Lovelace. Le laboratoire précédent reste
disponible dans ses fichiers d'origine, sans être raccordé implicitement.

## Installer

Sur un dossier de configuration HA accessible depuis le poste de développement :

```sh
task ha:install HA_CONFIG_DIR=/chemin/vers/config-ha
```

Le dossier doit déjà contenir `configuration.yaml`. La commande copie seulement
`custom_components/habit_tracker/` et les deux cartes dans `www/habit-tracker/`.
Elle ne modifie pas `configuration.yaml`, les autres intégrations ou les dashboards.
Sans montage local, copier le dossier
`integrations/home-assistant/custom_components/habit_tracker` dans
`/config/custom_components/` par SSH/SFTP et la carte dans `/config/www/habit-tracker/`.
Ce dépôt privé n'est pas un dépôt HACS au format standard ; l'installation par
copie est le chemin livré. Aucun secret HA n'est requis pour cette copie.

1. Démarrer le backend avec `AUTH_MODE=local` ou l'OIDC configuré. Les routes
   restent refusées sans token ; `disabled` ne signifie pas accès anonyme.
2. Créer un PAT ou un token de compte de service du bon utilisateur :
   `habits:read`, `statistics:read`, `entries:write`. Les deux premiers suffisent
   aux lectures ; le dernier est indispensable aux boutons. Utiliser le bootstrap
   CLI existant puis l'API de tokens pour obtenir un token à durée adaptée.
3. Redémarrer HA après copie du composant Python. Dans **Paramètres → Appareils et
   services → Ajouter une intégration → Habit Tracker**, renseigner URL et token.
   HTTPS est requis par défaut. HTTP exige la case explicite et une liaison locale
   de confiance. Les redirections ne sont jamais suivies avec le token.
4. Ajouter la ressource Lovelace de type **module JavaScript** :
   `/local/habit-tracker/habit-tracker-card.js?v=1`.
5. Importer la vue de
   [habit-tracker-connected.yaml](../integrations/home-assistant/lovelace/habit-tracker-connected.yaml).
   Remplacer `sensor.habit_tracker_dashboard` si HA a choisi un autre identifiant.

Le token est conservé dans les config entries côté serveur HA. Protéger le dossier
`.storage` et ses sauvegardes comme les autres credentials HA. Les permissions du
tenant API ne remplacent pas les permissions des utilisateurs HA : des utilisateurs
HA autorisés à contrôler le capteur peuvent utiliser ses actions. Ne pas partager
un dashboard personnel avec des utilisateurs qui ne doivent pas voir ses données.

## Entités et actions

- Un capteur **Dashboard** : score global en %, groupes, périodes, historique et XP
  dans ses attributs. Éviter d'enregistrer ses gros attributs dans Recorder si
  l'historique API suffit ; utiliser son entity_id réel dans l'exclusion Recorder.
- Un capteur de progression par habitude, dans l'unité canonique.
- Une `switch` par habitude booléenne : `turn_on` réalise, `turn_off` annule les
  réalisations manuelles de la période.
- Deux `button` par habitude quantitative/de durée/fréquence : ajouter/retirer
  `presentation.step`, avec correction/annulation des entrées manuelles.
- Service `habit_tracker.perform_action`, ciblé sur le capteur dashboard :

```yaml
action: habit_tracker.perform_action
target:
  entity_id: sensor.habit_tracker_dashboard
data:
  habit_id: UUID_DE_L_HABITUDE
  action: increment # decrement, complete ou uncomplete
```

Les nouvelles habitudes créent automatiquement leurs entités au prochain snapshot.
L'archivage les rend indisponibles ; le registre conserve les personnalisations HA.
Un retrait supérieur au solde manuel est refusé (409). Les entrées Strava ne sont
jamais supprimées par les boutons. En cas de coupure réseau, le client réessaie
avec la même clé d'idempotence ; après un échec final, vérifier l'état avant une
nouvelle action humaine. Aucun état optimiste n'est enregistré comme une réussite.

## Métadonnées et rappels

`PUT /api/v1/habits/{id}/presentation`, scope `habits:write`, remplace les
métadonnées immédiates. Exemple pour une habitude `quantity` en `milliliters` :

```json
{
  "icon": "mdi:water",
  "color": "#75b7ad",
  "order": 10,
  "weight": 1,
  "step": 250,
  "illustration": "water",
  "reminder_at": "18:00:00"
}
```

L'heure facultative est locale à l'habitude, à la minute, dans sa fenêtre de saisie.
`null` désactive le rappel. Pour des portions : `unit=count`, `step=1`,
`illustration=portions`. Autre illustration : `plain`. Icônes `mdi:...`, couleurs
`#RRGGBB`, poids dans `]0,100]`, ordre entre -10000 et 10000 ; pas d'URL d'image,
de HTML ni de catalogue d'aliments. Les champs omis prennent leurs valeurs par
défaut : inclure les métadonnées à conserver dans chaque PUT.

Les rappels automatiques exigent aussi le connecteur sortant : `HOME_ASSISTANT_URL`,
clé de chiffrement et credential HA via `PUT /api/v1/integrations/home-assistant`.
Le token API saisi dans HA et le token HA sortant sont deux credentials distincts.
Voir [integrations.md](integrations.md). Le worker vérifie toutes les minutes,
seulement pour les habitudes encore incomplètes et éligibles. Il enfile au plus
un rappel par habitude/date locale, ignore les jours passés et recontrôle repos,
configuration et objectif avant envoi. Les jobs existants assurent les retries et
un `notification_id` stable. Pas d'envoi lorsque HA est désactivé/révoqué ; pas de
push mobile/actionnable ajouté. Les changements DST sont couverts par les tests.

## Calculs et mise à jour

`GET /api/v1/dashboard` exige `habits:read` et `statistics:read` et donne un snapshot
cohérent du tenant, au plus 200 habitudes actives (au-delà, erreur explicite).

- Ratio d'habitude plafonné à 100 %, moyenne pondérée des habitudes éligibles dans
  une catégorie, puis moyenne à poids égal des catégories actives. `null` signifie
  aucune donnée éligible ; aucun zéro fictif n'est ajouté aux moyennes.
- Compteurs `completed/eligible` distincts de la progression quantitative.
  `weekly.*_success_percent` compte les réalisations parmi les habitudes éligibles
  des dates civiles de la semaine à ce jour ; le jour ouvert est inclus. Ce ratio
  peut donc encore monter aujourd'hui. `*_percent` mesure la progression moyenne.
- Comparaison des semaines ISO actuelle/précédente, sept dates chacune. Les
  dates futures restent sans donnée. Les objectifs hebdomadaires suivent les
  périodes du moteur existant, sans division artificielle par sept.
- Heatmap de 91 dates civiles locales ; regroupement par même libellé de date,
  chaque habitude conservant son fuseau. Série globale `streak_91_days` : jours
  où toutes les habitudes éligibles ont réussi, record borné à cette fenêtre.
  Les séries individuelles de l'API statistiques gardent leur historique complet.
- Une seule catégorie par habitude. L'hydratation n'est pas comptée deux fois.
  Les poids visuels actuels s'appliquent aussi à la comparaison historique ; les
  cibles/plannings historiques restent versionnés.

`GET /api/v1/dashboard/events` diffuse des invalidations SSE, sans données métier.
L'intégration relit le snapshot à chaque changement de révision ou de minute.
Les écritures deviennent visibles en environ une seconde, plus la latence réseau.
Au maximum 16 flux par processus, rotation après cinq minutes, auth/scopes
revérifiés chaque seconde. Reconnexion après coupure/redémarrage ; polling de
secours toutes les 60 secondes. Le déchargement annule le flux et ses abonnements.

Sur NPMplus, désactiver le buffering et autoriser les connexions longues pour la
route SSE. Exemple d'extraits pour le location correspondant :

```nginx
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 75s;
```

Pour le développement de la carte :

```sh
task --watch ha:sync HA_WWW_DIR=/chemin/config-ha/www/habit-tracker
# Ou sans montage, après installation initiale et configuration de l'accès SSH :
task --watch ha:sync:ssh HA_SSH_HOST=alias-ssh
```

La copie est automatique ; recharger le navigateur HA après modification du JS
(ou changer `?v=1`). Une modification Python exige une copie puis un redémarrage
ou rechargement adapté de l'intégration. Cela ne constitue pas un hot reload Python.

## Validation reproductible

```sh
cargo build --locked
python3.14 -m venv /tmp/habits-ha-tests
/tmp/habits-ha-tests/bin/pip install homeassistant==2026.10.2
HABIT_TRACKER_BIN="$PWD/target/debug/habit-tracker" \
  /tmp/habits-ha-tests/bin/python -m unittest discover -s tests -p test_home_assistant.py -v
```

Ces tests lancent le vrai composant HA et le binaire Rust sur SQLite temporaire.
Seul le DNS/mDNS est remplacé par un resolveur de test standard, tous les endpoints
étant sur loopback. Ils ne contactent pas une installation HA personnelle. La CI
exécute ces tests avant publication de l'image. Pas de certification HA/HACS ni de
validation de déploiement sur le homelab réel implicite.

Contrats suivis : [config entries](https://contributors.home-assistant.io/core/integrations/config-entries/),
[coordinator et push](https://contributors.home-assistant.io/core/integrations/fetching-data/),
[cycle de vie des entités](https://contributors.home-assistant.io/core/entities/state-updates/).
