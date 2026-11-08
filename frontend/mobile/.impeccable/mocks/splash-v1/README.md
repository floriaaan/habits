# Splashscreen — B sélectionnée et intégrée

Storyboard généré, trois temps par piste : A Le souffle (850 ms), B Les cartes (950 ms), C Un jour (750 ms). Le mainteneur a sélectionné B.

`LaunchSplash.tsx` implémente la transition en vues natives : trois bandes pastel, pile, puis composition d’accueil en cinq surfaces, 760 ms et fondu de 190 ms. Le splash est plein écran, adapté au thème et aux marges physiques. L’application ou la bienvenue se monte dessous sans attente du réseau ni de l’authentification. Réduction des animations respectée ; séquence une fois par montage racine. Le splash natif initial reste statique noir via `expo-splash-screen`.

`storyboard.png` : planche de comparaison. `comparison.html` : présentation. `prompt.txt` : prompt source. Les images sont des références de composition, pas des captures natives ou des assets embarqués. Aucun simulateur utilisé ; rendu et démarrage release sur appareil restent à vérifier après reconstruction native.
