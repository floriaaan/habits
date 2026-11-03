# Interface Home Assistant — export du laboratoire

Une [intégration et une carte connectées](home-assistant-connected.md) sont
maintenant disponibles séparément. Ce document décrit les anciens exports de
laboratoire conservés à l'identique ; leurs valeurs simulées ne deviennent pas
automatiquement des données API.

Snapshot du 2 novembre 2026, importé depuis la section « Export UI Home Assistant »
de la [page du projet Notion](https://app.notion.com/p/40c4a85853dd81bc996df54f7aad39cd).
Le README et le fragment `components.yaml` fournis accompagnent cette migration.

Décision d'intégration : conserver les trois exports à l'identique, en renommant
seulement les fichiers pour suivre l'arborescence demandée. Il s'agit d'un
prototype Lovelace distinct du backend Rust ; aucun frontend autonome ni route
publique supplémentaire n'est ajouté. L'import n'installe rien dans Home Assistant.

## Fichiers

```text
integrations/home-assistant/
├── cards/
│   └── habit-lab-visual-card.js
├── lovelace/
│   ├── habit-tracker-dashboard.json
│   └── components.yaml
└── docs/
    └── helpers-reference.json
docs/home-assistant-ui.md
```

| Export source | Fichier dans le dépôt |
| --- | --- |
| `habit-lab-visual-card.js.txt` (Notion) | [habit-lab-visual-card.js](../integrations/home-assistant/cards/habit-lab-visual-card.js) |
| `habit-lab-dashboard.json` (Notion) | [habit-tracker-dashboard.json](../integrations/home-assistant/lovelace/habit-tracker-dashboard.json) |
| `habit-lab-helpers.json` (Notion) | [helpers-reference.json](../integrations/home-assistant/docs/helpers-reference.json) |
| `components.yaml` (pièce jointe fournie) | [components.yaml](../integrations/home-assistant/lovelace/components.yaml) |

Le JSON du dashboard contient une vue `sections` et toutes ses cartes.
`components.yaml` est seulement une liste des trois cartes visuelles, à insérer
dans une section existante. Le JSON des helpers est une référence de configuration,
pas un fichier HA `configuration.yaml` à importer directement.

## État réel du prototype

La carte `custom:habit-lab-visual-card` utilise `HTMLElement`, Shadow DOM et SVG,
sans bundle npm ni compilation Rust. Son rendu lit `hass.states` :

- `rings` : quatre anneaux Sport, Esprit, Quotidien, Alimentation. Running/natation
  et eau/fruits sont segmentés ; les quatre catégories ont le même poids dans la
  moyenne globale. Les transitions durent 800 ms et respectent reduced motion.
- `weekly` : histogramme de sept jours, valeurs et série fictives codées en dur.
- `heatmap` : treize semaines fictives générées dans le JavaScript, aucun historique réel.

Les contrôles Mushroom et entities modifient les helpers HA ; ils n'enregistrent
aucune entrée dans l'API Rust. Le bloc « Connexion Strava » du dashboard est
informatif et inactif. Le prototype ne consulte ni les statistiques ni les XP
du backend ; la moyenne des anneaux ne représente pas son taux de réussite.

## Installation manuelle dans Home Assistant

1. Installer/charger les ressources Mushroom et card-mod utilisées par le
   dashboard complet. Les trois cartes visuelles seules utilisent uniquement
   `habit-lab-visual-card.js` et les helpers du mode rings.
2. Copier `integrations/home-assistant/cards/habit-lab-visual-card.js` dans
   `/config/www/habit-tracker/habit-lab-visual-card.js` de l'instance HA.
   Si le répertoire `www` vient d'être créé, redémarrer HA une fois.
3. Dans **Paramètres > Tableaux de bord > Ressources**, enregistrer l'URL
   `/local/habit-tracker/habit-lab-visual-card.js?v=20261102` comme **module JavaScript**.
   Le README source signale une ressource inline déjà présente : la remplacer
   au lieu de charger les deux définitions de `habit-lab-visual-card`.
4. Créer les sept helpers ci-dessous et vérifier leurs identifiants réels.
5. Créer un dashboard de laboratoire dédié. Dans son éditeur de configuration
   brute, importer l'objet JSON du dashboard complet, ou insérer les cartes de
   `components.yaml` dans une section existante. Conserver une copie de la
   configuration actuelle avant remplacement.
6. Recharger la page après modification de la ressource ; incrémenter le paramètre
   `v` si le navigateur garde l'ancienne version.

Le chemin `/local/`, le type de ressource et le rechargement sont décrits dans la
[documentation officielle HA](https://contributors.home-assistant.io/frontend/custom-ui/resources/).
En gestion YAML des ressources, la clé est `type: module` dans `lovelace.resources` ;
`resource_type` du README source n'est pas cette clé YAML. Fusionner avec la
configuration existante plutôt que créer une seconde section `lovelace`.

Les fichiers sous `www` sont accessibles sans authentification HA : ne jamais y
placer PAT, token HA, secret ou configuration privée. Aucun secret n'est nécessaire
pour cette carte de laboratoire.

## Développer avec les changements dans Home Assistant

Le dépôt ne fournit pas encore de package HACS, d'intégration Python HA ni d'app
(anciennement add-on) installable. Pour utiliser la carte actuelle, HA doit servir
son fichier JavaScript ; le backend Rust reste un processus séparé. Les changements
d'un dépôt Git distant ne sont pas récupérés automatiquement par Home Assistant.

### Depuis un poste de développement et un partage monté

Rendre le dossier `config/www/habit-tracker` de HA accessible depuis le poste de
développement : partage monté, ou dossier local si HA tourne sur la même machine.
Créer ce dossier dans la configuration HA et s'assurer que le partage est monté.
La tâche exige une destination existante, ne copie que la carte JavaScript et ne
modifie ni le dashboard, ni les helpers, ni les autres fichiers de configuration.

```sh
# Remplacer ce chemin par le dossier HA réellement accessible depuis ton poste.
task ha:sync HA_WWW_DIR="/chemin/vers/config/www/habit-tracker"

# Copie initiale puis synchronisation à chaque modification du fichier source.
task --watch ha:sync HA_WWW_DIR="/chemin/vers/config/www/habit-tracker"
```

Le mode watch repose sur [la surveillance native de Task](https://taskfile.dev/docs/guide/watch).
Il ne nécessite ni Rust ni serveur de compilation pour la carte. Ctrl+C arrête la
surveillance. La tâche remplace uniquement `habit-lab-visual-card.js` à destination :
garder le dépôt comme source de vérité plutôt que modifier cette copie dans HA.

Conserver une seule ressource module dans HA :
`/local/habit-tracker/habit-lab-visual-card.js?v=20261102`. Après une modification,
recharger entièrement la page HA. Pour une session de développement, ouvrir les
outils du navigateur, désactiver le cache réseau puis recharger ; si l'ancienne
version persiste, changer `v` dans la ressource et recharger. La synchronisation
du fichier ne remplace pas à chaud une classe custom element déjà chargée.

### Depuis le poste de développement par SSH

Si l'instance possède déjà un serveur SSH, aucun partage n'est nécessaire.
`HA_WWW_DIR` reste réservé aux dossiers locaux ; utiliser la tâche SSH :

```sh
# Remplacer IP_LOCALE_HA par l'adresse locale réelle, et le compte si nécessaire.
ssh root@IP_LOCALE_HA
# Quitter avec exit après avoir confirmé la connexion.

task ha:sync:ssh HA_SSH_HOST="root@IP_LOCALE_HA"
task --watch ha:sync:ssh HA_SSH_HOST="root@IP_LOCALE_HA"
```

Le compte doit être celui du serveur SSH, pas un identifiant de connexion à l'UI HA.
Le premier accès vérifie la clé de l'hôte ; ne pas désactiver cette vérification.
La tâche cherche la configuration dans `/homeassistant` puis `/config`, crée le
dossier `www/habit-tracker` et remplace uniquement la carte après transfert complet.
Elle utilise le client OpenSSH du poste et n'exécute pas le contenu JavaScript.
Elle ne redémarre pas HA et ne modifie pas les ressources Lovelace.

Pour éviter une demande de mot de passe à chaque sauvegarde, utiliser une clé SSH
déjà configurée avec ssh-agent, ou ajouter une clé publique dans `authorized_keys`
de l'app SSH. Ne pas écraser les clés existantes ni partager une clé privée ou un
mot de passe dans le dépôt. Un alias dans `~/.ssh/config` peut définir hôte, compte,
port et IdentityFile ; passer ensuite cet alias comme `HA_SSH_HOST`.

Avec l'app [Advanced SSH & Web Terminal](https://github.com/hassio-addons/addon-ssh/blob/main/ssh/DOCS.md),
l'identifiant et l'authentification se configurent dans les options de l'app.
Utiliser le réseau local ou un VPN pour cet accès ; l'URL HTTPS du dashboard ne
détermine pas l'adresse/port SSH. L'installation avec clé et la connexion réelle
doivent être vérifiées sur l'instance cible avant d'activer la surveillance.

### Si Home Assistant tourne en conteneur sur le même hôte Docker

Une autre possibilité est de monter directement le dossier `cards` du dépôt en
lecture seule dans le conteneur HA, en conservant son montage `/config` existant :

```yaml
# Fragment à fusionner dans le service Home Assistant existant.
volumes:
  - /chemin/absolu/habit-tracker/integrations/home-assistant/cards:/config/www/habit-tracker:ro
```

Le chemin source doit exister sur la machine du moteur Docker. Un chemin du Mac
ne peut pas être monté tel quel par un moteur Docker situé sur une autre machine.
Avec ce montage, aucune copie n'est nécessaire : enregistrer dans le dépôt, puis
recharger la page HA avec le cache désactivé. Ce montage ne s'applique pas directement
à une installation HA OS gérée par Supervisor.

### Dashboard et backend

Les modifications de `habit-tracker-dashboard.json` doivent encore être reportées
dans l'éditeur de configuration brute du dashboard : le mode storage ne surveille
pas ce fichier Git. `helpers-reference.json` reste une référence pour les helpers.

Pour le backend, utiliser `AUTH_MODE=local task dev` ; après modification Rust,
Ctrl+C puis relancer la tâche pour recompiler. Le port actuel est publié sur la
boucle locale du poste de développement ; une instance HA distante doit disposer
d'un accès réseau/reverse proxy explicitement configuré avant de pouvoir appeler
l'API. L'import de la carte et sa synchronisation ne créent pas encore cette liaison.

## Référence des helpers

Créer les helpers via l'interface HA, en reprenant les noms, icônes et paramètres
de [helpers-reference.json](../integrations/home-assistant/docs/helpers-reference.json).
Les objectifs ci-dessous proviennent du prototype et sont codés dans sa carte ;
ils ne sont pas les valeurs `max` des widgets ni les objectifs de l'API.

| Catégorie | Entité attendue | Type/unité | Objectif du prototype |
| --- | --- | --- | --- |
| Esprit | `input_boolean.labo_habits_lecture` | booléen | Lecture réalisée |
| Esprit | `input_boolean.labo_habits_meditation` | booléen | Méditation réalisée |
| Quotidien | `input_boolean.labo_habits_rangement` | booléen | Rangement effectué |
| Sport | `input_number.labo_habits_running_km` | km | 25 km/semaine |
| Sport | `input_number.labo_habits_natation_m` | m | 3000 m/semaine |
| Alimentation | `input_number.labo_habits_eau_consommee` | mL | 2000 mL/jour |
| Alimentation | `input_number.labo_habits_fruits_et_legumes` | portions | 5 portions/jour |

Aucun reset quotidien/hebdomadaire ni gestion de repos n'est fourni par cet export.
Les helpers globaux et le dashboard partagé ne constituent pas une isolation par
utilisateur ; la carte ne doit pas servir de frontière d'autorisation.

## Raccordement à l'API : travail restant

Le backend expose désormais `category` dans les habitudes et leurs versions :
Alimentation = `nutrition`, Sport = `sport`, Esprit = `mind`, Quotidien = `daily`.
L'omission vaut `daily`, sans déduction à partir du nom ; catégoriser explicitement
les anciennes habitudes via une définition future si nécessaire. Cette métadonnée
ne raccorde pas encore les helpers ni les anneaux à l'API.

Le contrat HTTP disponible figure dans [integrations.md](integrations.md) et
[openapi.json](openapi.json). Il reste à :

1. Rendre les entités, objectifs et catégories configurables au lieu de conserver
   les identifiants de laboratoire dans la carte ; fournir les données réelles
   via un client HA côté serveur, avec un PAT/compte de service par tenant.
2. Alimenter `weekly` et `heatmap` avec les périodes/statistiques retournées par
   l'API, en conservant les fuseaux, repos et périodes éligibles du moteur Rust.
   Treize semaines représentent 91 jours, contre une heatmap API bornée à 90 jours :
   prévoir une case sans donnée, sans fabriquer une journée de résultat.
3. Transformer une action HA en événement idempotent de réalisation/correction/
   annulation. Un total de helper ne doit pas être ajouté comme un nouvel incrément
   à chaque rafraîchissement. Convertir km en mètres ; une annulation booléenne
   doit annuler l'entrée, et non envoyer une réalisation de valeur zéro.
4. Prévoir indisponibilité, erreurs, révocation, permissions et changement de
   période, puis valider le rendu sur mobile et les thèmes clair/sombre dans HA.

Aucun PAT de l'API ne doit être intégré au JavaScript ou au JSON Lovelace. Le
modèle d'accès de HA doit également être défini avant de partager des données
personnelles entre ses utilisateurs. Aucun CORS permissif ni accès anonyme n'est ajouté.

## Vérification de l'import

Les octets des trois exports ont été conservés ; seules leurs destinations ont changé.

| Fichier | SHA-256 de l'export importé |
| --- | --- |
| `habit-lab-visual-card.js` | `52dcbb5bb12b77c437d8c578ecaa7b397de75db1f8c866b1b6ae72cce6a6e79c` |
| `habit-tracker-dashboard.json` | `0d540ebfb09f581711bd04d9d9b78bf2920ceb24b1856d6b628bd3d40e9e9a5f` |
| `helpers-reference.json` | `e3715fb577f51decfc83a22ef179203740178c48ef388cd717c9be6bffe0a2fe` |

Contrôles locaux : syntaxe JavaScript, JSON valides, concordance des sept entités
et des trois modes entre les fichiers. Ces contrôles ne remplacent pas une recette
dans une instance HA ; aucun déploiement ni test visuel sur l'instance source n'est réalisé.
