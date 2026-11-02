# Intégrations optionnelles

Strava et Home Assistant sont désactivés sans configuration. Le métier et les
accès locaux fonctionnent indépendamment. Une route exigeant un connecteur absent
répond 503 (ou 404 pour un protocole Strava absent). Les appels externes utilisent
des jobs persistants ; aucun service réel n'a été configuré/validé ici.

## Chiffrement et réseau

Tout connecteur activé exige `ENCRYPTION_KEY`, base64 standard de 32 octets
aléatoires, et `ENCRYPTION_KEY_ID`, identifiant non vide d'au plus 64 octets.
Injecter la clé hors dépôt/logs et la conserver séparément des sauvegardes.
Credentials HA et access/refresh tokens Strava utilisent AES-256-GCM, nonce
aléatoire de 96 bits, AAD liant version, tenant, provider et identifiant de clé.
Ciphertext, nonce et identifiant sont en SQLite ; les PAT restent hashés.

Une seule clé est chargée. Rotation, trousseau d'anciennes clés et ré-encryption
ne sont pas implémentés : remplacer la clé/id rend les anciens secrets illisibles.
Prévoir une reconnexion contrôlée ou une migration dédiée.

Appels sortants sans redirection ni proxy d'environnement, connexion limitée à
trois secondes, requête à dix secondes et JSON à 1 Mio. Les URLs viennent de la
configuration opérateur, jamais d'un payload réseau arbitraire.

## Home Assistant

| Variable | Contrat |
| --- | --- |
| `HOME_ASSISTANT_URL` | Base HTTPS explicite, idéalement terminée par `/`. |
| `HOME_ASSISTANT_ALLOW_HTTP` | `true` autorise HTTP explicitement pour une liaison locale de confiance. |

L'URL refuse credentials, query et fragment. Sans URL, le connecteur est désactivé.
`PUT /api/v1/integrations/home-assistant`, scope `integrations:manage`, reçoit
`{"token":"…"}` ; le credential est chiffré, sans validation immédiate auprès de HA.

Un client HA utilise les routes métier normales avec un PAT/SA limité :

```sh
curl --fail-with-body "${API_URL:?}/api/v1/habits" \
  -H "Authorization: Bearer ${HABIT_TOKEN:?}"

curl --fail-with-body "${API_URL:?}/api/v1/habits/${HABIT_ID:?}/entries" \
  -H "Authorization: Bearer ${HABIT_TOKEN:?}" \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: ${EVENT_KEY:?}" \
  --data "${ENTRY_JSON:?}"
```

`ENTRY_JSON` contient `occurred_at` UTC RFC 3339 et `value` positive compatible
avec l'habitude. Lectures : `habits:read`, `entries:read` ou `statistics:read`
selon la route ; check-in : `entries:write`. Les indicateurs sont disponibles via
`/api/v1/habits/{id}/statistics` et `/api/v1/gamification`. Garder les tokens hors
des fichiers de configuration publiés.

`POST /api/v1/integrations/home-assistant/notifications` exige
`notifications:write`, un `Idempotency-Key` de 1–128 caractères ASCII visibles et
`{"title":"…","message":"…"}` (120/4096 octets maximum). La réponse 202 contient
`job_id`. Le worker appelle `persistent_notification.create`, `notification_id`
égal au job pour stabiliser les retries. Autres services/mobile push et custom
card ne sont pas implémentés. Un token HA invalide fait échouer le job.

## Strava

La présence d'une variable Strava déclenche la validation de configuration :

| Variable | Contrat |
| --- | --- |
| `STRAVA_CLIENT_ID` | Client fourni par l'opérateur. |
| `STRAVA_CLIENT_SECRET` | Secret injecté hors dépôt/logs. |
| `STRAVA_REDIRECT_URI` | Callback HTTPS fixe enregistré, route `/integrations/strava/callback`. |
| `STRAVA_WEBHOOK_VERIFY_TOKEN` | Secret de vérification du challenge d'abonnement. |
| `STRAVA_WEBHOOK_PATH_TOKEN` | Au moins 32 caractères alphanumériques, `_` ou `-`, aléatoires. |
| `STRAVA_SUBSCRIPTION_ID` | Abonnement attendu, indispensable avant réception des POST webhook. |
| `STRAVA_ATHLETE_CAPACITY` | Entier positif, défaut 1. |
| `STRAVA_MULTI_ATHLETE_APPROVED` | `true` exigé au-delà d'un athlète ; obtenir l'accord réel de Strava. |

Les endpoints officiels Strava sont fixes dans le code. Aucune URL de production
du homelab n'est présumée. Création/gestion distante de l'abonnement webhook et
approbation multi-athlète restent des opérations opérateur.

`POST /api/v1/integrations/strava/authorize` exige `integrations:manage` et renvoie
l'URL OAuth avec `activity:read`. State opaque hashé, lié au tenant, à usage
unique, valable dix minutes ; au plus 20 states en attente par utilisateur.
Le callback valide state, code et permission de lecture, échange le code côté
serveur et chiffre les credentials validés. Le redirect URI est fixe. PKCE n'est
pas implémenté. La liaison refuse un athlète d'un autre tenant et respecte la
capacité configurée.

`PUT /api/v1/integrations/strava/mappings` exige `integrations:manage`,
`habits:write` et la lecture de l'habitude. Corps : sport `Run` ou `Swim`,
`habit_id` UUID appartenant au tenant et metric `distance`, `moving_time` ou
`count`, correspondant aux unités mètres, secondes ou count. `TrailRun` et
`VirtualRun` sont normalisés en `Run`. Modifier le mapping ne lance pas de sync.

`POST /api/v1/integrations/strava/sync` exige `integrations:manage` et
`Idempotency-Key`, renvoie 202 avec `job_id`. Import des 90 derniers jours, pages
de 100 activités, au plus 100 pages. Identifiants provider uniques, rapprochement
idempotent, corrections/purges et recalcul XP transactionnel. Une liste ne détecte
pas une activité supprimée absente des résultats : ce chemin passe par webhook
et lecture ciblée répondant 404.

### Webhook et retrait des données

Route publique : `/integrations/strava/webhook/{token}`. Le GET vérifie
`hub.mode=subscribe`, `hub.verify_token`, secret de chemin et challenge. Le POST
exige secret de chemin, abonnement attendu, identifiants positifs, type/aspect
autorisé et timestamp non futur au-delà de cinq minutes. Les événements anciens
restent recevables pour les retries. Masquer ces URLs des logs du reverse proxy.

Aucune signature HMAC de POST n'est inventée. Le handler déduplique le contenu
et enfile un événement minimal, avec timeout d'enqueue de 1,5 seconde. Le worker
relit l'état chez Strava au lieu de modifier les résultats d'après le payload.
Une réponse 404 ciblée purge la source ; une réponse 401 ou un refresh refusé
déconnecte et purge localement. Le refresh utilise un contrôle de révision.

`DELETE /api/v1/integrations/{id}`, scope `integrations:manage`, révoque localement
la connexion, efface credentials, jobs et mappings, purge entrées de source et
payloads d'événements ; historique XP compensé et métadonnées minimales subsistent.
Cette route **n'appelle pas la déautorisation distante Strava** : retirer aussi
l'application depuis le compte Strava si nécessaire. Les anciens snapshots
peuvent contenir les données ; suivre [operations.md](operations.md).

Les payloads des jobs Strava réussis sont vidés, empreinte d'idempotence conservée.
Pas encore de purge périodique générale des jobs échoués/HA ni de TTL automatique
des entrées importées. L'import limité à 90 jours n'est pas une suppression à
90 jours. Vérifier les conditions Strava et définir la rétention applicable avant
exposition réelle.

## Jobs et exploitation

Jobs SQLite isolés par tenant, au plus 1000 pending/running par utilisateur.
Rejouer une clé avec les mêmes type, intégration et contenu renvoie le job
existant ; contenu différent : 409. `GET /api/v1/jobs/{id}` exige
`integrations:manage` et renvoie seulement état, tentatives et prochaine date.

Le worker utilise des baux de 60 secondes, récupère les baux expirés et vérifie
le propriétaire avant chaque import/purge/pagination et à la finalisation.
Les mutations sous transaction renouvellent le bail et refusent un worker périmé. Erreurs temporaires : backoff exponentiel,
premier retry dix secondes, au plus huit tentatives. Les 4xx hors 429 sont
permanents ; `Retry-After` numérique et 429 sont pris en compte. Quotas Strava
persistants initiaux : 100 requêtes/15 minutes et 1000/jour ; les headers peuvent
réduire les limites et actualiser l'usage. Aucun succès externe n'est simulé.

Les tests hors ligne utilisent des serveurs HTTP locaux et des credentials de
fixture pour chiffrement, isolation, retries, idempotence, corrections/purges et
indisponibilité. Voir `docs/validation.md` pour les résultats exécutés. Restent à
vérifier réellement : contrat Pocket ID, client/scopes/capacité/abonnement Strava,
URL/token HA, routage HTTPS, autorisations et conditions de conservation.
