# Chargement de la carte par les ressources Lovelace

2026-11-03. Incident : les entités sont disponibles mais le navigateur affiche
`Custom element not found: habit-tracker-card`.

- L'intégration 0.1.1 sert bien le fichier JS, mais ne l'enregistre qu'avec
  `frontend.add_extra_js_url`. Ce mécanisme ne constitue pas une ressource du
  dashboard ; le test HA doit vérifier la collection Lovelace et non seulement
  le téléchargement HTTP du module.
- Conserver la route statique versionnée et sans credential. En mode ressources
  storage, enregistrer le module via la collection Lovelace existante, après son
  chargement. Mettre à jour une ancienne URL de notre carte en conservant l'ID de
  ressource ; dédupliquer uniquement les URLs appartenant à cette carte. Les
  ressources tierces, config entries, entités et données backend sont préservées.
- Supprimer l'inscription parallèle en extra JS pour éviter deux chemins de
  chargement. Dépendre explicitement de Lovelace, déjà dépendance de frontend.
- En mode ressources YAML, ne pas réécrire la configuration utilisateur : émettre
  un avertissement avec l'URL à déclarer sous `lovelace.resources` en type module.
  Documenter la différence et le contournement de la version 0.1.1.
- Livrer en version HACS 0.1.2 avec tests sur HA réel : première installation,
  ressource ancienne/manuelle, relance sans doublon et ressources YAML intactes.
  La montée de version invalide le cache URL. Le retour à 0.1.1 exige de retirer
  la ressource versionnée 0.1.2 et d'enregistrer la route 0.1.1 ou de revenir au
  mécanisme extra JS ; aucun fichier SQLite métier n'est migré.
