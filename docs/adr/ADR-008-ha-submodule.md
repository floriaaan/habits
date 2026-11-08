# ADR-008 — Client Home Assistant public, backend privé

- **Statut :** historique — décision consignée à la date indiquée.
- **Date de décision :** 2026-11-03.
- **Conversion en ADR :** 2026-11-05, sans nouvelle approbation ni changement du fond.

## Contexte

Séparer le client public Home Assistant du dépôt backend privé.

## Décision consignée

2026-11-03. Publication explicitement autorisée par le propriétaire.

- Créer `floriaaan/habit-tracker-ha` public avec un historique neuf. Exporter
  exclusivement le composant HA, sa carte connectée, son dashboard exemple,
  traductions, README, licence, manifest HACS et validation CI du client. Ne copier
  ni les sources Rust, ni la base, les credentials, les tests backend ou l'historique
  Git privé. Les liens du manifest ciblent uniquement le dépôt public.
- Le dépôt public devient l'unique source du client, référencée dans le backend
  par le sous-module `integrations/home-assistant/habit-tracker-ha`. Conserver
  séparément les fichiers du prototype laboratoire déjà présents. Supprimer la
  copie suivie par Git à la racine du backend après vérification de l'export.
- Le backend verrouille un commit du sous-module. Les clones et la CI exécutent
  `git submodule update --init --recursive` ; aucune mise à jour automatique de
  branche au démarrage. Pousser d'abord les changements du client, puis le nouveau
  pointeur du backend. Les tests d'intégration HA restent dans le dépôt privé et
  utilisent le client verrouillé avec le vrai binaire Rust.
- HACS et Hassfest s'exécutent dans le dépôt public. Le backend garde les tests
  d'archives et les tests HA/Rust ; ses scripts d'installation, de synchronisation
  et d'export utilisent le sous-module. Le dépôt privé ne se présente plus comme
  une entrée HACS indépendante.
- Installation HA existante : même domaine, version, identifiants et config entry ;
  aucun transfert des données backend. HACS installe le client public, le serveur
  Rust reste déployé séparément. Ne modifier aucune instance HA personnelle.
- Retour arrière du backend : rétablir le commit précédant la migration, sans
  suppression du dépôt public ni des données HA. Retour à une version du client :
  sélectionner son ancien commit dans le sous-module puis committer le pointeur.
  La publication publique est intentionnelle et ne peut pas être annulée par un
  simple changement de visibilité après téléchargement par des tiers.

## Conséquences

Le backend verrouille un commit du client ; une publication publique ne se révoque pas par un rollback Git.
