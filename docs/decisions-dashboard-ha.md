# Dashboard, actions HA et rappels

2026-11-03. Complément de l'ADR-001 pour raccorder le dashboard Home Assistant.

- `GET /api/v1/dashboard` retourne un snapshot transactionnel du seul utilisateur
  authentifié : groupes, habitudes, progression/période, éligibilité, métadonnées,
  compteurs, deux semaines ISO, 91 jours d'historique et gamification. Aucun chiffre
  de démonstration n'est utilisé. Au plus 200 habitudes actives ; au-delà, réponse
  explicite de validation plutôt qu'un résultat silencieusement tronqué.
- Pour chaque habitude, progression = `min(1, progress / target)` ; un objectif
  dépassé ne compense pas un objectif manqué. Moyenne pondérée par `weight` dans
  chaque catégorie ; moyenne à poids égal des catégories ayant des habitudes
  éligibles. Catégories vides/jours de repos : pourcentage `null`, exclus du calcul.
  Compteurs de réalisations distincts du pourcentage quantitatif. Une habitude a
  une seule catégorie et ne compte qu'une fois ; aucune duplication implicite de
  l'hydratation dans Quotidien et Alimentation.
- Les jours et périodes de chaque habitude restent dans son fuseau IANA. Le
  dashboard annonce le fuseau utilisateur et chaque date locale d'habitude. Les
  graphiques regroupent les dates civiles locales de même libellé ; les semaines
  commencent lundi. Les périodes hebdomadaires suivent le moteur existant (cible
  de la semaine, pas un septième artificiel par jour). Les dates antérieures à
  l'historique disponible et futures restent sans donnée. La heatmap dashboard
  contient 91 dates ; les statistiques individuelles restent bornées à 90 jours.
- `PUT /habits/{id}/presentation` remplace les métadonnées immédiates, sans changer
  les objectifs historiques : icône MDI, couleur hexadécimale, ordre, poids,
  incrément dans l'unité canonique, illustration `plain`/`water`/`portions`, heure
  locale facultative de rappel. Aucune URL d'image ni HTML arbitraire. Absence de
  ligne = valeurs par défaut ; aucune réécriture des événements existants.
- `POST /habits/{id}/actions` : `complete`, `uncomplete`, `increment`, `decrement`.
  Date/heure de l'action attribuée côté serveur, période locale courante. Clé
  d'idempotence obligatoire. Les événements, corrections/annulations, projections,
  XP et reçu de commande sont atomiques. Le retrait ne touche que des entrées
  manuelles, jamais une source Strava ; conflit si le retrait excède ce solde.
  Une case décochée annule les réalisations booléennes manuelles de la période.
- `GET /api/v1/dashboard/events` est un SSE authentifié d'invalidation, sans
  credentials dans l'URL et sans données métier dans le flux. Révisions SQLite
  transactionnelles via triggers, vérification chaque seconde ; pas de Redis.
  Les changements de minute/date déclenchent aussi un rafraîchissement. Le client
  relit le snapshot au premier événement et après reconnexion. Authentification
  et scopes revérifiés pendant le flux ; nombre de connexions borné. Le proxy doit
  désactiver le buffering pour cette route. Les interruptions de flux ne perdent
  pas les données, le snapshot fait autorité.
- Intégration HA `custom_components/habit_tracker` installable par copie : config
  flow URL + PAT/compte de service, entités automatiques, boutons/switches, flux SSE
  avec reconnexion, polling de secours et nettoyage au déchargement. Aucun token
  dans Lovelace/JavaScript. Les cartes utilisent les états HA et appellent les
  actions HA ; aucune dépendance à un frontend autonome. Pas de catalogue aliments.
- Rappels : un horaire local explicite par habitude, seulement jour éligible, après
  l'heure et avant la fermeture de fenêtre, objectif encore incomplet. Les heures
  inexistantes DST sont rattrapées au premier instant local suivant ; les heures
  doublées n'envoient qu'un rappel. Contrôle toutes les minutes, pas de rattrapage
  des jours antérieurs. Enqueue atomique et unique par habitude/date dans les jobs
  HA existants ; connecteur absent/révoqué = aucun envoi. Les retries gardent le
  même notification_id. Avant envoi, recontrôler repos, objectif et configuration.
  Le reçu de déduplication survit à la suppression d'un job et à la reconnexion
  du connecteur le même jour ; son notification_id est une trace opaque, sans
  dépendance de durée de vie à la ligne du job.

Migration additive 0006 : tables présentation/reçus/révisions/rappels et triggers.
Déploiement mono-version : arrêt API/workers, sauvegarde CLI, nouveau binaire.
Rollback : arrêt et restauration hors ligne du snapshot pré-migration, après
conservation des écritures nouvelles ; aucune suppression automatique. Conserver
les anciennes cartes laboratoire ; ajouter une carte connectée et un dashboard
exemple distincts pour préserver les installations existantes.

Références de contrat HA : [config entries](https://contributors.home-assistant.io/core/integrations/config-entries/),
[coordinator et push](https://contributors.home-assistant.io/core/integrations/fetching-data/),
[cycle de vie des entités](https://contributors.home-assistant.io/core/entities/state-updates/).
