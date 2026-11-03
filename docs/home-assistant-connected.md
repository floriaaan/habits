# Home Assistant connecté à Habit Tracker

L'intégration `habit_tracker` crée les entités à partir des habitudes de l'API.
La carte `habit-tracker-card` utilise ces états et les services HA ; aucun PAT
n'est placé dans le JavaScript ou dans Lovelace. Le laboratoire précédent reste
disponible dans ses fichiers d'origine, sans être raccordé implicitement.

## Installer via HACS

Une seule intégration HACS installe le composant et la carte connectée. La carte
est embarquée dans `custom_components/habit_tracker/www/` et chargée automatiquement
par HA, sans copie dans `/config/www` ni ressource Lovelace à déclarer.

**Publication publique encore nécessaire** : `floriaaan/habits` est privé, et
[HACS ne gère pas les dépôts privés](https://www.hacs.dev/docs/faq/private_repositories/).
Le code est au format HACS ; un dépôt public distinct limité au client HA peut être
créé après accord, sans publier le backend ni son historique. Pour préparer ce dépôt :

```sh
task ha:package HA_REPOSITORY=PROPRIETAIRE/DEPOT_PUBLIC
```

Remplacer le paramètre par le nom réellement choisi. `target/hacs/hacs-repository.zip`
contient l'arborescence du dépôt de distribution (`hacs.json`, README, licence et
`custom_components/habit_tracker/`) ; `target/hacs/habit_tracker.zip` contient
uniquement le composant à extraire dans `/config/custom_components/habit_tracker/`.
La commande ne publie rien. Les liens du manifest exporté ciblent le dépôt donné.
La CI produit également ces deux archives et exécute Hassfest ; le validateur HACS
est réservé à un dépôt public. Aucune admission au catalogue HACS n'est revendiquée.

Une fois le dépôt de distribution public : **HACS → ⋮ → Dépôts personnalisés → URL
GitHub → Integration → Ajouter**, chercher **Habit Tracker**, télécharger et
redémarrer HA. Pas de deuxième dépôt Dashboard à installer. HA **2026.10.2 minimum**.
Le serveur Rust se lance séparément ; HACS n'installe pas un add-on du backend.
Voir le [guide livré dans le paquet](../integrations/home-assistant/README-HACS.md).

## Installation par copie (secours et développement)

Sur un dossier de configuration HA accessible depuis le poste de développement :

```sh
task ha:install HA_CONFIG_DIR=/chemin/vers/config-ha
```

Le dossier doit déjà contenir `configuration.yaml`. La commande copie seulement
`custom_components/habit_tracker/` et le prototype dans `www/habit-tracker/`.
Elle ne modifie pas `configuration.yaml`, les autres intégrations ou les dashboards.
Sans montage local, copier le dossier
`custom_components/habit_tracker` dans `/config/custom_components/` par SSH/SFTP.
Aucun secret HA n'est requis pour cette copie.

## Configurer le backend et l'intégration

1. Démarrer le backend avec `AUTH_MODE=local` ou l'OIDC configuré. Les routes
   restent refusées sans token ; `disabled` ne signifie pas accès anonyme.
2. Créer un PAT ou un token de compte de service du bon utilisateur :
   `habits:read`, `statistics:read`, `entries:write`. Les deux premiers suffisent
   aux lectures ; le dernier est indispensable aux boutons. Utiliser le bootstrap
   CLI existant puis l'API de tokens pour obtenir un token à durée adaptée.
3. Redémarrer HA après installation du composant Python. Dans **Paramètres → Appareils et
   services → Ajouter une intégration → Habit Tracker**, renseigner URL et token.
   HTTPS est requis par défaut. HTTP exige la case explicite et une liaison locale
   de confiance. Les redirections ne sont jamais suivies avec le token.
4. Recharger le navigateur : l'intégration charge la carte automatiquement. En
   migration, retirer l'ancienne ressource `/local/habit-tracker/habit-tracker-card.js?...`
   pour éviter de charger une ancienne version. Conserver la config entry existante.
5. Importer la vue de
   [dashboard.yaml](../custom_components/habit_tracker/www/dashboard.yaml).
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
task --watch ha:sync HA_WWW_DIR=/chemin/config-ha/custom_components/habit_tracker/www
# Ou sans montage, après installation initiale et configuration de l'accès SSH :
task --watch ha:sync:ssh HA_SSH_HOST=alias-ssh
```

La task SSH utilise aussi le dossier du composant lorsqu'il est installé ; le
prototype continue à aller dans `/config/www/habit-tracker`. La copie est automatique ;
faire un rechargement complet du navigateur (cache ignoré) après modification du JS.
Une modification Python exige une copie puis un redémarrage
ou rechargement adapté de l'intégration. Cela ne constitue pas un hot reload Python.

## Validation reproductible

```sh
cargo build --locked
python3.14 -m venv /tmp/habits-ha-tests
/tmp/habits-ha-tests/bin/pip install homeassistant==2026.10.2 home-assistant-frontend==20260930.4
HABIT_TRACKER_BIN="$PWD/target/debug/habit-tracker" \
  /tmp/habits-ha-tests/bin/python -m unittest discover -s tests -p test_home_assistant.py -v
```

Ces tests installent l'archive de distribution dans un vrai HA et lancent le binaire
Rust sur SQLite temporaire. Le frontend et le module statique sont également testés.
Seul le DNS/mDNS est remplacé par un resolveur de test standard, tous les endpoints
étant sur loopback. Ils ne contactent pas une installation HA personnelle. La CI
exécute ces tests avant publication de l'image. Pas de certification HA/HACS ni de
validation de déploiement sur le homelab réel implicite.

Contrats suivis : [config entries](https://contributors.home-assistant.io/core/integrations/config-entries/),
[coordinator et push](https://contributors.home-assistant.io/core/integrations/fetching-data/),
[cycle de vie des entités](https://contributors.home-assistant.io/core/entities/state-updates/).
