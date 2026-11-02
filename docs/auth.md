# Authentification configurable

`AUTH_MODE=disabled` est le défaut : toutes les routes `/api/v1` répondent 401,
même avec un token. Les healthchecks et les endpoints OAuth/webhook dédiés suivent
leurs propres règles. Aucun en-tête d'identité fourni par un proxy ne confère de
droits. NPMplus termine HTTPS ; garder `/health/*` internes.

## Mode local sans Pocket ID

`AUTH_MODE=local` (alias `tokens`) accepte uniquement les PAT et tokens de comptes
de service du tenant singleton `(urn:habit-tracker:local, default)`. L'UUID est
persisté en SQLite ; aucun utilisateur anonyme ni secret admin permanent n'est
créé. Le serveur provisionne ce tenant à son premier démarrage, sans token.

Exécuter le bootstrap local sur la même base que le serveur :

```sh
cargo run --locked -- bootstrap-local Europe/Paris
# Ou sur le volume de l'API Compose déjà démarrée :
docker compose exec api /usr/local/bin/habit-tracker bootstrap-local Europe/Paris
```

Le premier bootstrap applique le fuseau fourni au tenant local, même s'il a été
provisionné en UTC au démarrage. Chaque habitude porte aussi son propre fuseau IANA. La
sortie JSON contient le token et ses métadonnées : tous les scopes, expiration
sous 24 h, secret affiché à l'émission uniquement. Le conserver hors des logs et
créer ensuite des tokens adaptés aux clients. Répéter le bootstrap est refusé.
Configurer ensuite `AUTH_MODE=local` pour le processus serveur (avec Compose,
recréer le service après modification de cette variable).
La récupération après perte/expiration exige l'accès local à la CLI et l'UUID :

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
