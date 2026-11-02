# Contrats d'identité — bloquants avant ouverture de l'API

Le seul mode actif est `AUTH_MODE=disabled` : toutes les routes `/api/v1`
retournent 401, même avec un token. Aucun en-tête reverse-proxy (`X-User-Id`,
`X-Forwarded-*`) n'est une authentification. Le middleware de test est compilé
uniquement avec `cfg(test)`, sans feature/env de développement activable.
Les services contrôlent les scopes séparément ; les adaptateurs SQLite filtrent
chaque opération par user_id et vérifient la propriété de l'objet parent.

## JWT access token OIDC Pocket ID

À faire confirmer par le mainteneur, sans fournir ici de valeurs réelles :

1. Version/configuration Pocket ID et capacité à émettre un **JWT access token
   destiné à cette ressource API**. Un ID token destiné à un client OIDC ne
   satisfait pas ce contrat. Un access token opaque nécessite une décision
   supplémentaire ; ne pas le décoder comme JWT ni accepter son ID token associé.
2. `OIDC_ISSUER` exact HTTPS (comparaison byte-for-byte, chemin/slash compris).
3. `OIDC_AUDIENCE` exact de la ressource, distinct du client web quand nécessaire ;
   confirmer la forme `aud` string/liste et la politique multi-audience.
4. `OIDC_JWKS_URL` HTTPS autorisée et document discovery approuvé ; aucun `jku`,
   `x5u` ni URL arbitraire issu du token ne doit piloter une requête réseau.
5. `OIDC_ALLOWED_ALGORITHMS` liste explicite asymétrique revue avec les types,
   tailles et usages des clés ; refuser `none`, confusion HMAC/RSA, clé sans
   usage signature ou algorithme inattendu.
6. Profil access token : `OIDC_ACCESS_TOKEN_TYP` (p.ex. `at+jwt` **si confirmé**),
   ou discriminateur de claims vérifiable documenté. `typ=JWT` seul ne prouve
   pas qu'un token est un access token. Audience seule insuffisante si le
   fournisseur émet ID et access tokens avec la même audience.
7. Exemple de **schéma de claims expurgé**, `sub` stable non vide, `iss`, `aud`,
   `exp`, `nbf` obligatoires ; durée, clock skew borné, mapping des scopes,
   approvisionnement utilisateur et politique de désactivation.

Futur vérificateur : signature et tous les claims ci-dessus, cache JWKS borné,
rotation sur `kid` inconnu avec rafraîchissement mutualisé et limité, TTL,
time out et limites de réponse, aucune acceptation d'une clé inconnue pendant
une panne. Tests clé tournée, cache expiré, wrong issuer/audience/algorithm,
ID token, exp passé, nbf futur/absent, kid inconnu et panne fournisseur.
Ne jamais logger Authorization, claims bruts ou token. Une nouvelle identité
est liée uniquement par `(issuer, subject)`, jamais par email.

Les envvars OIDC proposées ne sont volontairement pas activables : leur présence
non vide arrête le démarrage pour éviter une configuration faussement effective.

## PAT et service accounts

Contrats préparés : `IdentityMode`, `Principal`, `Scope`, tables service_accounts,
access_tokens, auth_audit. **Émission et vérification non implémentées.**

- CLI de bootstrap ponctuelle, locale ; aucun secret admin permanent. Privilège
  d'administration explicite, jamais un droit global de lecture des habitudes.
- Token opaque >= 256 bits aléatoires CSPRNG ; affichage une fois lors de création,
  empreinte SHA-256 de 32 octets uniquement en base. Un hash rapide convient ici
  car le token n'est pas un mot de passe. Préfixe/id pour audit, jamais secret brut.
- Scopes `habits:read`, `habits:write`, `entries:read`, `entries:write` avec refus
  par défaut. Un compte de service reste rattaché à un tenant ; aucun accès global.
- Expiration obligatoire, révocation vérifiée à chaque accès, rotation atomique
  révoquant l'ancien et audit sans secret. Suppression/désactivation de l'utilisateur
  ou du compte de service invalide aussi ses tokens. Quota par principal.
- Pas de récupération de token ; le remplacer. Tests expiration, révocation,
  rotation, permissions et isolation avant d'exposer les endpoints.

## Secrets d'intégration

Aucun secret/refresh token n'est accepté ou stocké dans cette itération. Le
schéma impose des emplacements ciphertext/nonce/key_id, mais ne remplace pas un
chiffrement effectif. Avant OAuth : implémenter AEAD (AES-256-GCM ou équivalent
audité), nonce unique aléatoire, AAD tenant/provider/version, clé de 32 octets
injectée via `ENCRYPTION_KEY` et identifiant `ENCRYPTION_KEY_ID`. Validation stricte,
Debug expurgé, rotation/reencryption et sauvegarde des anciennes clés nécessaires.
Ne jamais considérer une simple conversion base64 comme du chiffrement.

## Réseau

NPMplus termine HTTPS. Ne publier que `/api/v1/*` lorsque l'auth sera implémentée ;
interdire `/health/*` à l'extérieur. Aucun CORS permissif ni cookie de session.
OAuth futur : state à usage unique, PKCE si supporté, callback sur allowlist
exacte HTTPS, aucune redirection utilisateur arbitraire. Strava webhook : protocole
de challenge et validation dédié avant toute route publique, réponse rapide,
déduplication et jobs persistants ; pas de worker simulé dans cette version.
