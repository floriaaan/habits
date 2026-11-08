# Authentification configurable

Les commandes Cargo de ce guide se lancent depuis `backend/`. Exporter
`DATABASE_PATH=../data/habits.sqlite` pour réutiliser la base locale à la racine
(les conteneurs conservent leur chemin `/data/habits.sqlite`). Pour la connexion
mobile PAT/OIDC, consulter [le guide mobile](mobile.md).

`AUTH_MODE=disabled` est le défaut : toutes les routes `/api/v1` répondent 401,
même avec un token. Les healthchecks et les endpoints OAuth/webhook dédiés suivent
leurs propres règles. Aucun en-tête d'identité fourni par un proxy ne confère de
droits. NPMplus termine HTTPS ; garder `/health/*` internes.

## Mode local sans Pocket ID

`AUTH_MODE=local` (alias `tokens`) accepte uniquement les PAT et tokens de comptes
de service du tenant singleton `(urn:habit-tracker:local, default)`. L'UUID est
persisté en SQLite ; aucun utilisateur anonyme ni secret admin permanent n'est
créé. Au premier démarrage en mode local, le serveur crée le tenant (fuseau UTC)
et émet automatiquement un PAT initial avec tous les scopes, valable **24 heures**.
Une ligne JSON stdout `event=local_bootstrap` affiche `token` et `metadata`
(identifiants du token/utilisateur, scopes, expiration), même si `RUST_LOG=error`.
Elle apparaît dans `docker compose logs api` pour le Compose GHCR copié du README.
Cette ligne est une exception explicite à l'absence de secrets dans les logs :
protéger les journaux et utiliser ensuite des tokens dédiés aux clients.
Seule l'empreinte est stockée en base ; aucun endpoint ne restitue le secret.

L'émission, le marqueur administrateur et l'audit sont atomiques. Un redémarrage,
une expiration, une révocation ou un démarrage concurrent n'émettent pas d'autre
PAT initial. Aucun bootstrap automatique en mode `disabled` ou `oidc`, ni via
healthcheck, backup ou autre commande CLI. Les routes privées restent fermées
sans Bearer valide.

Pour choisir le fuseau du tenant et recevoir le token hors des logs serveur,
la CLI reste facultativement utilisable **avant** le premier démarrage :

```sh
cargo run --locked -- bootstrap-local Europe/Paris
```

Chaque habitude porte aussi son propre fuseau IANA. Un bootstrap CLI déjà fait
empêche l'émission automatique ; répéter la commande est refusé.
Un crash entre la validation SQLite et l'affichage peut perdre le secret initial :
utiliser la récupération CLI, sans supprimer le marqueur ni la base.
La récupération après perte/expiration exige l'accès local à la CLI et l'UUID
`metadata.user_id` de la sortie initiale. Si cette sortie est perdue, lire l'UUID
stable sur le volume local via SQLite :

```sh
docker compose exec -T api sqlite3 /data/habits.sqlite \
  "SELECT id FROM users WHERE issuer = 'urn:habit-tracker:local' AND subject = 'default';"
```

Émettre ensuite un token avec les scopes souhaités :

```sh
cargo run --locked -- token-create "${USER_ID:?}" \
  'habits:read,entries:read,statistics:read' "${EXPIRES_AT:?}"
```

`EXPIRES_AT` est un instant RFC 3339 UTC dans les 365 prochains jours. Les CLI
`bootstrap-admin ISSUER SUBJECT TIMEZONE` et `user-create ISSUER SUBJECT TIMEZONE`
existent aussi pour des identités explicites : le premier émet un PAT de 24 h,
le second renvoie l'UUID. Ces identités ne sont pas acceptées en mode local si
elles ne correspondent pas au singleton. L'administration n'accorde aucun droit
global sur les ressources d'autres tenants.

## PAT et comptes de service

Toutes les requêtes privées utilisent `Authorization: Bearer …`. Les tokens
opaques `ht_…` contiennent 256 bits issus du CSPRNG système ; seule leur empreinte
SHA-256 est stockée. Le secret est renvoyé à l'émission/rotation et n'est jamais
récupérable par lecture. Chaque accès vérifie expiration, révocation, utilisateur
actif et, le cas échéant, compte de service actif.

Scopes : `habits:read`, `habits:write`, `entries:read`, `entries:write`,
`statistics:read`, `integrations:manage`, `notifications:write`, `tokens:manage`.
Les services vérifient les scopes séparément de l'identité ; la persistance
filtre les ressources par `user_id` et vérifie les objets parents.

| Route privée | Comportement |
| --- | --- |
| `POST /api/v1/tokens` | Émission PAT ou token de compte de service. |
| `GET /api/v1/tokens?limit=20&offset=0` | Métadonnées du tenant, sans secret. |
| `POST /api/v1/tokens/{id}/rotate` | Révocation et remplacement atomiques. |
| `DELETE /api/v1/tokens/{id}` | Révocation du token du tenant. |
| `POST /api/v1/service-accounts` | Création d'un compte du tenant. |
| `DELETE /api/v1/service-accounts/{id}` | Révocation du compte et de ses tokens. |

L'émission exige `tokens:manage`, des scopes connus, distincts et non vides et une
expiration future limitée à 365 jours. Un appelant ne peut émettre/faire tourner
un token avec plus de scopes qu'il n'en possède. Un compte de service ne peut
émettre/faire tourner des tokens ni créer/révoquer des comptes de service. Un
token doté de `tokens:manage` peut lister/révoquer les tokens de son tenant :
réserver ce scope à la gestion des accès. La rotation conserve scopes, compte
associé et expiration.

Créer un compte avec `{"name":"Home Assistant"}`, puis émettre un token avec
`scopes`, `expires_at` et `service_account_id` égal à son UUID. Pour un PAT,
`service_account_id` vaut `null`. Créations, rotations, révocations et bootstraps
alimentent `auth_audit` dans la transaction. Aucun export HTTP de l'audit ni
journal de chaque authentification n'est encore implémenté.

## OIDC optionnel

L'adaptateur existe ; aucune instance Pocket ID réelle n'a été configurée ou
validée. Confirmer que le fournisseur émet des **JWT access tokens pour cette
API** conformes au profil retenu. Un ID token, un access token opaque ou un token
`typ=JWT` ne satisfait pas ce contrat.

Activer explicitement `AUTH_MODE=oidc` et fournir ces paramètres non secrets :

| Variable | Contrat |
| --- | --- |
| `OIDC_ISSUER` | Issuer HTTPS exact, chemin et slash compris. |
| `OIDC_AUDIENCE` | Audience exacte de la ressource API. |
| `OIDC_JWKS_URL` | URL HTTPS fixe approuvée par l'opérateur. |
| `OIDC_ALLOWED_ALGORITHMS` | Liste distincte séparée par virgules parmi `RS256`, `ES256`, `EdDSA`. |
| `OIDC_ACCESS_TOKEN_TYP` | Obligatoirement `at+jwt`, profil RFC 9068 retenu. |

Issuer/JWKS refusent credentials, query et fragment. Des variables OIDC non vides
hors de ce mode empêchent le démarrage. Aucun discovery automatique ni endpoint
de login/callback Pocket ID n'est livré : le client obtient son access token
auprès du fournisseur, puis le présente à l'API.

Le vérificateur impose signature, algorithme autorisé, `kid`, `typ=at+jwt`, `iss`,
`aud`, `sub`, `exp`, `nbf`, avec tolérance d'horloge de 30 secondes. Il refuse les
URLs/clés du header de token, les extensions critiques non prises en charge et
les headers de chiffrement/compression. Les clés JWKS annoncent usage signature
et algorithme compatible ; RSA est borné à 2048–8192 bits, ES256 à P-256, EdDSA à
Ed25519. Seuls les scopes applicatifs connus du claim `scope` sont retenus ; aucun
droit implicite n'est accordé.

Le cache JWKS dure cinq minutes. Un `kid` inconnu déclenche un rafraîchissement
mutualisé, limité à un essai toutes les 30 secondes. Réponse limitée à 1 Mio et
64 clés, timeout de cinq secondes, sans redirection ni proxy d'environnement.
Une panne n'autorise pas les clés expirées/inconnues. Aucun basculement automatique
vers le tenant local n'a lieu en cas de panne OIDC.

Les utilisateurs sont provisionnés par `(issuer, subject)`, jamais par email.
Le mode OIDC accepte aussi les PAT/SA `ht_…` des tenants existants. La désactivation
locale est vérifiée ; l'introspection/révocation immédiate des JWT auprès du
fournisseur n'est pas implémentée.

## Vérification et limites

Les tests locaux couvrent isolation, scopes, hash, expiration, rotation/révocation,
comptes de service, signature/claims et rotation/panne JWKS via HTTP de test.
Consulter `docs/validation.md` pour les résultats effectivement obtenus. Ces tests
ne prouvent pas une compatibilité Pocket ID en production. Les secrets des
connecteurs et leurs limites sont décrits dans [integrations.md](integrations.md).

## Session du client mobile

`GET /api/v1/session` utilise le middleware existant et ne nécessite aucun scope
métier. Il renvoie `user_id`, `mode` (`personal_access_token`, `service_account` ou
`oidc_access_token` ou `mobile_session`) et les `scopes` effectifs, sans secret, avec `Cache-Control: no-store`.
Un credential invalide, expiré/révoqué ou le mode disabled produit 401.


## Comptes grand public pour le mobile

Activer `AUTH_MODE=accounts`. L’inscription e-mail/mot de passe permet une connexion
immédiate, sans vérification d’adresse ni envoi d’e-mail. Les anciens comptes en attente
de vérification deviennent également utilisables avec leur mot de passe existant.
Une nouvelle inscription ne peut jamais remplacer le mot de passe d’une adresse déjà
inscrite. Chaque compte a son propre tenant non administrateur ; aucune liaison ou
migration implicite vers les tenants local/OIDC n’est effectuée.

Le mot de passe comporte au moins 12 caractères et au plus 1024 octets, hachés avec
Argon2id et un sel aléatoire. Deux calculs au plus s’exécutent simultanément hors de
l’exécuteur HTTP. L’adresse est normalisée en minuscules, mais n’est pas une preuve
de possession. L’application utilise `EXPO_PUBLIC_API_URL`, sans serveur à saisir.

SMTP est facultatif pour démarrer et s’inscrire. Pour récupérer un mot de passe,
configurer `SMTP_HOST`, `SMTP_PORT` (587 par défaut), `SMTP_USERNAME`, `SMTP_PASSWORD`
et `SMTP_FROM`. STARTTLS et certificat valide sont requis. Sans SMTP, la demande de
récupération répond 503 ; elle ne prétend pas avoir envoyé un e-mail.
Le Compose racine transmet ces variables. Exposer l’API derrière HTTPS.

| Route publique, POST | Corps JSON | Résultat |
| --- | --- | --- |
| `/api/v1/auth/register` | `email`, `password`, `timezone` | 204 ; compte créé, connexion immédiate possible |
| `/api/v1/auth/login` | `email`, `password` | paire de tokens |
| `/api/v1/auth/forgot-password` | `email` | 204 ; code si compte existant et SMTP configuré |
| `/api/v1/auth/reset-password` | `email`, `code`, `password` | 204 ; toutes les sessions révoquées |
| `/api/v1/auth/refresh` | `refresh_token` | paire renouvelée |
| `/api/v1/auth/logout` | `refresh_token` | 204 ; session révoquée |

Les anciennes routes `/auth/verify` et `/auth/resend` sont retirées. La colonne historique
`verified_at` est conservée pour compatibilité de schéma et n’intervient plus dans
l’authentification. Les codes de récupération restent à huit chiffres, valables
15 minutes, limités à cinq essais, à usage unique. Les réponses de récupération
n’indiquent pas si le compte existe. Limites par fenêtre de 15 minutes : cinq
inscriptions/demandes d’e-mail par adresse, dix connexions, quinze validations de code,
300 opérations au total pour l’instance. Répartir le budget global par client si le
trafic devient important.

Les paires contiennent `access_token` (`hs_…`), `refresh_token` (`hr_…`) et `expires_in`
(900 secondes). Chaque secret contient 256 bits aléatoires ; seules ses empreintes
sont stockées. Durée absolue d’une session : 30 jours. Le renouvellement remplace
atomiquement les deux tokens ; un rejeu révoque la famille. Une déconnexion révoque
la session même si son refresh vient d’être renouvelé. La désactivation du compte
est vérifiée à chaque accès/renouvellement. Le mobile conserve la paire dans
SecureStore, mutualise les renouvellements et purge le cache sur changement de compte.
La déconnexion reste réessayable si la révocation serveur échoue.

Les réponses d’authentification sont `no-store`. Codes, mots de passe, tokens et
contenu des e-mails ne sont pas journalisés. L’envoi SMTP est direct avec timeout,
sans file supplémentaire ; son fonctionnement réel reste à vérifier au déploiement.
Apple et Google restent désactivés (« Bientôt »), avec leurs icônes. Le mode accounts
accepte les PAT existants et les sessions mobiles ; le SSO reste propre aux
déploiements `AUTH_MODE=oidc`.
