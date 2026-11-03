# Animations HA et observabilité — 2026-11-03

- Reprendre le layout de référence : anneaux à gauche et légende à droite sur une
  carte large, empilement uniquement sur petit écran. Conserver les calculs API.
- Animer arcs et verres dans les deux sens en reprenant la progression visuelle
  courante, y compris lors de mises à jour rapprochées. Respecter reduced-motion.
  Les verres utilisent une silhouette trapézoïdale avec reflet et un remplissage
  cyan ; aucune donnée optimiste ne remplace la confirmation backend.
- Livrer une icône générée dans le dossier natif HA brand (PNG 256 et 512).
- Nommer les nouveaux dashboards habits_<user_id> : le backend ne conserve pas
  encore de username/claim de présentation. Ne pas déduire une identité du PAT.
  Conserver unique_id et les identifiants de registre existants, personnalisables
  depuis HA, afin de préserver les dashboards et automatisations déjà installés.
- Export optionnel des logs via le SDK officiel OpenTelemetry OTLP HTTP JSON,
  activé par OTEL_EXPORTER_OTLP_LOGS_ENDPOINT (URL complète /v1/logs). Stdout JSON
  reste actif. Batch borné, timeout, arrêt avec flush ; une panne collecteur ne
  bloque ni l'API ni la readiness. Pas de sink propriétaire ou de transport shell.
- Corréler les événements par request_id et spans de use-case. Ne jamais exporter
  tokens, corps, headers, query strings, noms d'habitudes, URL webhook secrète ou
  credentials. Conserver le bootstrap explicite sur stdout hors de tracing.
  Les routes sont les templates Axum, jamais les chemins bruts sensibles.
- Tests : animations montantes/descendantes et interruption, HA entity IDs et
  marque locale, export vers collecteur loopback, panne collecteur, corrélation
  requête/service/réponse et absence des secrets connus dans les sorties.
