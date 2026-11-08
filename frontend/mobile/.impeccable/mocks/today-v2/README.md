# Aujourd’hui — propositions V2

Maquettes exploratoires demandées le 2026-11-07 ; au moins deux variantes sur trois comportent une timeline. La proposition A a ensuite été choisie avec le sélecteur de semaine de B. Aucun simulateur utilisé pour cette implémentation.

- A : journal chronologique des enregistrements effectués. Horaires issus des entrées, pas d’une planification fictive. Les actions restantes sont séparées du journal.
- B : routine par moments (matin, après-midi, soir), sans horaires précis. Le classement par moment est une nouvelle préférence à définir et persister si cette piste est retenue : le modèle actuel ne contient pas ce champ. Ne pas le déduire automatiquement de la catégorie.
- C : liste d’actions compacte sans timeline ; actions encore à faire puis réalisation validée.

Source : ../quiet-v1/home.png pour l’identité visuelle, avec retrait explicite des dots. Données de démonstration : méditation 10/10 min (seule habitude validée), course 3/5 km, eau 1,5/2 L, lecture 0/1 fois. Pas de calories, podomètre ou recommandations de santé. Prompts exacts conservés. Images générées par imagegen.

Implémentation : `/today` est un quatrième onglet, avec Accueil, Progression et Profil conservés. Le journal de A affiche les saisies réelles dans les fuseaux des habitudes ; les actions rapides concernent le jour courant. Le sélecteur de B permet de consulter les 90 dernières dates en lecture seule pour les jours passés, sans classement par moments à persister. Les dates futures sont désactivées.

Les images restent des références de composition, pas des captures du résultat natif. Les statistiques historiques et versions fournissent les bilans, noms et unités ; les périodes indisponibles sont signalées. 18 tests mobiles, TypeScript et exports finaux iOS/Android réussis ; le test HTTP/Rust est ignoré sans binaire backend. Le rendu natif reste non vérifié, conformément à la demande de ne lancer aucun simulateur. Voir `../../../../../docs/validation.md`.
