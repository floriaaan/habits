# ADR-017 — Comptes e-mail et sessions mobiles

Statut : accepté par l’utilisateur.

## Contexte

L’accès mobile grand public doit proposer inscription et connexion sans jeton manuel.
Le parcours validé est la composition B (card blanche et zone d’action verte).
Cette décision remplace la limitation PAT/OIDC de l’ADR-002 pour ce nouveau mode.

## Décision

Ajouter `AUTH_MODE=accounts`, avec comptes e-mail/mot de passe isolés par tenant,
connexion immédiate sans vérification d’adresse et récupération par code SMTP. Ne pas relier implicitement
une adresse à un tenant local ou OIDC. Conserver les modes de déploiement existants.
Utiliser Argon2id pour les mots de passe, tokens opaques courts (15 minutes) et
refresh tokens rotatifs à durée absolue de 30 jours pour chaque connexion mobile.
Conserver la paire dans le coffre SecureStore existant et réutiliser sa logique de
renouvellement mutualisé. Révoquer la session sur déconnexion, toutes les sessions
sur réinitialisation du mot de passe, et la famille sur rejeu de refresh token.

Les boutons Apple et Google sont présents mais désactivés, explicitement « Bientôt ».
Leur intégration et une éventuelle coexistence e-mail/OIDC dans un même déploiement
restent des évolutions distinctes. SMTP est synchrone avec timeout ; pas de file
supplémentaire à ce stade. Voir [le contrat et la configuration](../auth.md).

## Conséquences

Le mode accounts fonctionne sans SMTP ; un relais STARTTLS permet la récupération du mot de passe.
Les nouveaux comptes ne récupèrent pas implicitement les habitudes d’un autre tenant.
Les inscriptions/récupérations sont limitées et les codes ne sont jamais exposés par
l’API. Aucune suppression de données ou migration automatique d’identité existante.

### Ajustement validé

À la demande de l’utilisateur, la vérification d’e-mail et ses routes sont retirées.
L’adresse n’est pas une identité vérifiée ; un doublon d’inscription ne remplace jamais
les credentials existants. Le SMTP devient facultatif, conservé pour la récupération.
