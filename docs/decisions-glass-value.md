# Valeur directe des verres et animations — 2026-11-03

Les rendus HA réutilisent les nœuds animés dont la cible ne change pas ; une
modification n'anime que les cibles concernées. La cible vient des attributs
explicites, jamais d'un style calculé sur un élément détaché. Le premier rendu
montre immédiatement la valeur confirmée, sans animation d'entrée fictive.

Un verre est un bouton clavier : le n-ième définit le total à min(n * step,
target). Une nouvelle action set_value reçoit une valeur finie >= 0, uniquement
pour quantity/duration, avec entries:write. Elle utilise la transaction et le
reçu idempotent existants ; aucun nouvel endpoint ni migration. La valeur vise
le total de période, sans supprimer de données fournisseur : une réduction sous
le solde fournisseur est refusée. Une augmentation applique l'éligibilité
existante ; une diminution corrige/annule les entrées manuelles existantes avec
compensation XP. Les anciennes actions et payloads restent compatibles.
