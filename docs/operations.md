# Exploitation et sauvegardes

## Déploiement

Pour une nouvelle installation, suivez le [README](../README.fr.md#installation--production)
pour télécharger l'image GHCR et créer l'utilisateur. Les commandes ci-dessous
utilisent le fichier autonome `compose.production.yaml`, sans build local :

```sh
docker compose -f compose.production.yaml pull
docker compose -f compose.production.yaml up --detach --wait
```

`compose.yaml` reste réservé aux builds locaux et smoke tests. Le volume
nommé local est initialisé avec les droits UID/GID 10001. Un bind mount alternatif
doit être préparé par l'opérateur avec ce propriétaire et des permissions 0700.
Ne jamais utiliser la base active sur un montage réseau. Les fichiers de base,
WAL et SHM doivent résider ensemble sur ce volume. Aucun secret de production
ou URL de fournisseur n'est nécessaire pour le mode local avec PAT.

NPMplus termine HTTPS ; interdire la publication des healthchecks et n'ouvrir
l'API qu'après l'authentification réelle. Le processus n'utilise pas
X-Forwarded-For pour construire un tenant ou un quota. Aucune dépendance réseau
HA/Strava au démarrage, sur readiness ou lors d'un check-in local.

## Sauvegarde cohérente

Ne pas copier seulement le fichier actif en ignorant le WAL. La CLI utilise
SQLite `VACUUM INTO` : snapshot transactionnel des données validées. Le chemin
de destination est un argument local CLI, jamais une entrée HTTP ; la commande
refuse un chemin déjà existant. Prévoir l'espace disque pour une copie complète.

```sh
docker compose -f compose.production.yaml exec -T api mkdir -p /data/backups
docker compose -f compose.production.yaml exec -T api /usr/local/bin/habit-tracker backup /data/backups/snapshot.sqlite
docker compose -f compose.production.yaml exec -T api sqlite3 /data/backups/snapshot.sqlite 'PRAGMA quick_check; PRAGMA foreign_key_check;'
mkdir -p backups
docker compose -f compose.production.yaml cp api:/data/backups/snapshot.sqlite backups/snapshot.sqlite
```

Sortie attendue : `ok` et aucune ligne de violation FK. Choisir un nouveau nom
à chaque sauvegarde. Copier hors hôte avec contrôle d'accès et chiffrement gérés
par l'opérateur. Une copie sur le même volume n'est pas une protection contre
la perte de disque.

Rétention définie : 7 snapshots quotidiens et 4 hebdomadaires hors hôte ; supprimer
les copies locales après transfert vérifié. Ordonnancement et purge à configurer
dans l'outil d'exploitation, pas dans un worker fictif. Les secrets chiffrés nécessitent la conservation séparée des clés et identifiants de version. Une sauvegarde SQLite seule ne suffit pas pour déchiffrer les connecteurs.
Une suppression de données doit aussi être appliquée aux sauvegardes à échéance
de cette rétention ; ne pas remettre en ligne une ancienne copie sans appliquer
les suppressions/revocations intervenues après le snapshot.

## Restauration hors ligne

Tester régulièrement sur un volume séparé. Conserver le fichier original et une
copie du volume courant avant la restauration. Exemple pour restaurer le snapshot
validé présent dans `/data/backups/snapshot.sqlite` :

```sh
docker compose -f compose.production.yaml stop api
docker compose -f compose.production.yaml run --rm --no-deps --entrypoint sqlite3 api /data/backups/snapshot.sqlite 'PRAGMA quick_check; PRAGMA foreign_key_check;'
# Continuer seulement si quick_check = ok et aucune violation FK.
docker compose -f compose.production.yaml run --rm --no-deps --entrypoint /bin/sh api -ec 'cp /data/habits.sqlite /data/backups/before-restore.sqlite; rm -f /data/habits.sqlite-wal /data/habits.sqlite-shm; cp /data/backups/snapshot.sqlite /data/habits.sqlite'
docker compose -f compose.production.yaml up --detach --wait
docker compose -f compose.production.yaml exec -T api /usr/local/bin/habit-tracker healthcheck
```

La suppression des sidecars n'a lieu qu'après arrêt gracieux de **tous** les
processus utilisant cette base (y compris CLI backup). Ne pas lancer une
restauration contre une API encore active. Les migrations reprennent au démarrage ;
une erreur de checksum arrête le processus, ne pas la contourner.

Les tests Rust sauvegardent une base WAL contenant des données, la rouvrent,
valident les FK et relisent les habitudes/entrées. Le smoke Compose vérifie aussi
un vrai arrêt/restauration/redémarrage sur son volume dédié.

## Logs et limites

Logs JSON sur stdout : request_id, méthode, statut, durée et erreurs de catégorie.
Pas d'Authorization, corps, claims, URL/query HTTP ou contenu SQL dans les logs
applicatifs. Conserver les logs avec rétention raisonnable et accès restreint.
Les request IDs reçus ne sont pas reflétés, un UUID serveur est généré.

Liveness ne teste pas la base ; readiness vérifie une requête SQLite après
migrations. Une panne HA/Strava ne modifie aucun healthcheck. Budget global
120 requêtes/s, 64 en cours, 10 s par requête, JSON 16 KiB. Le quota HTTP est global ; les quotas par identité restent à ajouter.

Avant chaque publication : fmt, clippy, tests, build release, audit/deny, smoke
Docker ; revoir images, toolchain, licences et dépendances natives. Le scan d'image
ne remplace pas ces tests et doit également être opéré périodiquement.

## Authentification et jobs

Voir [auth.md](auth.md) pour activer le mode local ou OIDC. Le mode disabled
reste fermé, même pour un PAT valide. Ne pas journaliser les valeurs env ou la
sortie du bootstrap ; Docker inspect/config peut exposer les envvars aux personnes
ayant accès au moteur. Sauvegarder ENCRYPTION_KEY/ENCRYPTION_KEY_ID séparément.
La ré-encryption des credentials et la rotation de clé ne sont pas automatisées :
ne pas changer la clé en place sans migration contrôlée ou reconnexion des providers.

Le worker n'est lancé que si Strava ou HA est configuré. Les jobs SQLite prennent
un bail de 60 s et un propriétaire unique ; les transactions d'import/purge et
pagination refusent un propriétaire expiré. Une reprise récupère les baux échus.
Huit essais maximum, backoff exponentiel borné à 6 h, Retry-After provider respecté.
La file est bornée à 1000 jobs pending/running par utilisateur. Les payloads Strava
terminés sont effacés, leur empreinte assure toujours l'idempotence. Un arrêt
pendant un appel HA peut conduire à un rejeu ; notification_id stable remplace
la notification plutôt que d'en créer une autre.

Les logs donnent des catégories d'erreur sans payload/token/URL. GET /api/v1/jobs/{id}
expose l'état à son propriétaire ; les métriques, alertes et relances administratives
des jobs échoués restent à outiller. La readiness n'attend jamais les providers.
