# Logs et observabilité

La console reste en JSON, pilotée par `RUST_LOG` (par défaut
`habit_tracker=info,tower_http=info`). L'export est facultatif et utilise OTLP HTTP
JSON, via le SDK OpenTelemetry Rust 0.33.1, versions verrouillées dans Cargo.lock.

## Configuration

| Variable | Exemple | Comment obtenir |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` | `http://alloy:4318/v1/logs` | URL complète du receiver OTLP HTTP logs fournie par l'administrateur du collecteur. Vide désactive l'export. |
| `OTEL_EXPORTER_OTLP_LOGS_HEADERS` | `Authorization=Bearer%20<collector-token>` | Headers exigés par le collecteur, format SDK `clé=valeur`, séparés par virgules, valeurs URL-encodées si nécessaire. Ne pas committer de vrais secrets. |
| `OTEL_SERVICE_NAME` | `habit-tracker` | Libellé choisi par l'opérateur, 1–128 caractères sans contrôles. |

Extrait à ajouter à l'environnement du conteneur :

```yaml
environment:
  RUST_LOG: habit_tracker=info
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: http://alloy:4318/v1/logs
  OTEL_EXPORTER_OTLP_LOGS_HEADERS: ${OTEL_EXPORTER_OTLP_LOGS_HEADERS:-}
  OTEL_SERVICE_NAME: habit-tracker
```

`alloy` est un exemple de nom de service Docker, pas une URL de production.
L'opérateur configure son receiver Alloy ou OpenTelemetry Collector pour accepter
OTLP HTTP sur le port choisi et router les logs vers son stockage. Tout autre
collecteur doit accepter ce même protocole. Le [Compose des README](../README.fr.md#installation)
embarque Alloy dans le profil `observability`, avec [config.alloy](../deploy/alloy/config.alloy)
monté depuis l’hôte en lecture seule, pour convertir le JSON en Protobuf
et l'envoyer à Rootprint avec sa clé d'ingestion. Rootprint exige actuellement
`application/x-protobuf` sur `/v1/logs` : le sink JSON ne doit pas le viser
directement. La configuration du bridge est validée ; aucun serveur Rootprint
réel de l'opérateur n'a été contacté. Le sink ne parle pas directement le
protocole Loki Push, syslog ou OTLP gRPC.

Les URLs refusent credentials intégrés, query et fragment et doivent terminer
par `/v1/logs`. HTTP est prévu pour le réseau local de confiance ; utiliser HTTPS
ailleurs. Les redirections et les proxies d'environnement sont désactivés. Les
headers d'authentification passent uniquement dans les requêtes au collecteur.
L'export ne s'active pas avec le seul `OTEL_EXPORTER_OTLP_ENDPOINT` générique.
Le protocole et les limites ci-dessous sont fixés par l'application.

## Corrélation et contenu

Un UUID serveur est renvoyé dans `X-Request-ID` et dans chaque erreur uniforme.
Le span `http.request` associe ce request ID, méthode, template de route Axum et
UUID du tenant authentifié. Début, use cases, erreurs et fin de requête héritent
de ce contexte. La fin donne statut et durée en millisecondes ; pour SSE, elle
correspond à la remise de la réponse au serveur HTTP, pas à la fermeture du flux.
Les healthchecks réussis (`/health/live`, `/health/ready`) n’émettent aucun log
de début/fin ni export OTLP ; leurs erreurs restent journalisées. Les jobs
portent leur propre identifiant, type, tentative et issue/retry.

Les opérations couvrent habitudes, entrées/corrections, statistiques et XP,
présentations/actions dashboard, création idempotente, tokens/comptes de service,
connecteurs/OAuth et réconciliation. Les erreurs métier sont typées ; les erreurs
SQL restent catégorielles pour éviter de divulguer des valeurs. Aucun argument
métier n'est capturé automatiquement par les spans (`skip_all`).

Tokens, headers, bodies, query strings, URL brute, état OAuth, idempotency keys,
noms d'habitudes et credentials ne sont jamais ajoutés aux événements. Les logs
SQLx et transports HTTP sont forcés à `off`, même avec `RUST_LOG=trace`, pour
éviter leur capture indirecte. Le bootstrap explicite initial reste une ligne
stdout séparée, hors de tracing : il n'est jamais envoyé par le sink OTLP.
Protéger les logs console contenant ce secret d'installation comme auparavant.
Les UUID et volumes d'activité restent des données opérationnelles à protéger.

L'appender SDK copie uniquement une allowlist des attributs de spans ; cette
fonction du SDK est marquée expérimentale et est couverte par un test bout en
bout. On exporte des logs corrélés par request ID, sans spans OTLP distribués,
W3C traceparent ni métriques ajoutés dans cette itération.

## Livraison et arrêt

File mémoire bornée à 2048 événements, batches de 256, intervalle d'une seconde,
timeout HTTP de trois secondes et flush d'arrêt borné à cinq secondes.
L'exporteur tourne sur son propre thread ; il n'entre dans aucun healthcheck ni
transaction métier. Une panne du collecteur ne bloque pas l'API. La livraison
est best effort : les données peuvent être perdues en cas de file pleine,
panne prolongée ou arrêt brutal. La console est conservée ; utiliser un agent
sur les logs Docker si une livraison durable est nécessaire. Les échecs internes
du SDK ne sont pas réexportés en boucle ; un flush d'arrêt incomplet produit un
message console sans endpoint ni secret.

Test reproductible : `cargo test --locked --test observability`. Il lance le vrai
binaire et un collecteur loopback, valide le JSON OTLP, les templates de routes,
la corrélation, l'absence des secrets testés, la continuité pendant une panne et
l'arrêt gracieux. Aucun collecteur réel n'est requis.

Sources : [SDK OTLP Rust](https://docs.rs/opentelemetry-otlp/0.33.1/opentelemetry_otlp/),
[bridge tracing](https://docs.rs/opentelemetry-appender-tracing/0.33.1/opentelemetry_appender_tracing/).
