# Catégories des habitudes

2026-11-02. Précision de l'ADR-001 demandée pour les quatre groupes de la carte HA.

| Libellé de carte | Valeur API anglaise |
| --- | --- |
| Alimentation | `nutrition` |
| Sport | `sport` |
| Esprit | `mind` |
| Quotidien | `daily` |

La catégorie est un enum métier dans la définition d'habitude, présent dans les
requêtes et réponses de création/lecture/liste et les versions. Une catégorie
inconnue ou null est refusée. Elle n'est pas déduite du nom, du type ou de l'unité.
L'omission reste acceptée pour les clients antérieurs et signifie `daily`, y
compris dans la définition complète envoyée par PUT ; envoyer explicitement la
catégorie voulue pour la conserver. La migration 0005 ajoute `daily` uniquement
aux définitions et versions qui n'ont pas encore ce champ.

La catégorie est versionnée avec la définition : une modification suit la date
d'effet future du PUT existant, sans nouvelle route de modification immédiate.
Elle n'intervient pas dans l'éligibilité, les périodes, les streaks ou le ledger
XP. Les événements immuables, entrées, repos et identités ne sont pas réécrits.
Ce changement ajoute la métadonnée ; il ne branche pas encore les cartes à l'API
et ne crée pas d'agrégation par catégorie.

Déploiement : arrêter l'ancienne API et ses workers, sauvegarder SQLite avec la
CLI existante, puis démarrer le nouveau binaire qui applique la migration sous
transaction SQLx. Ne pas faire cohabiter les deux versions sur la base active.
Les anciens binaires refusent les nouveaux champs JSON et ne connaissent pas la
migration 0005. Un retour arrière exige l'arrêt du nouveau binaire et la
restauration hors ligne du snapshot pré-migration selon [operations.md](operations.md),
en conservant d'abord une copie des écritures postérieures si elles existent.
Pas de downgrade destructif automatique ni de modification des migrations 0001–0004.
