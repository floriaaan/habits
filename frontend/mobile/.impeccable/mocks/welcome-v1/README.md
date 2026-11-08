# Bienvenue — propositions v1

Trois maquettes générées avec imagegen pour l’écran avant connexion. **Aucune proposition sélectionnée ; aucune implémentation de cet écran.**

| Proposition | Image | Prompt conservé | Intention |
| --- | --- | --- | --- |
| A — Aperçu produit | [a.png](a.png) | [a.prompt.txt](a.prompt.txt) | Trois cartes illustratives d’habitudes et une invitation à se connecter. |
| B — Rituel quotidien | [b.png](b.png) | [b.prompt.txt](b.prompt.txt) | Composition éditoriale autour de petits gestes quotidiens. |
| C — Accueil calme | [c.png](c.png) | [c.prompt.txt](c.prompt.txt) | Typographie sobre, emblème simple et espaces ouverts. |

Référence visuelle fournie à imagegen : [quiet-v1/home.png](../quiet-v1/home.png). Les prompts demandent le vocabulaire existant : fonds mats, gouttières sombres étroites, grandes cartes arrondies, pastels et typographie système compacte. Les images sont des intentions visuelles, pas des captures de l’application ni des preuves de comportement natif. Les textes et données d’aperçu restent illustratifs.

« Découvrir la démo » nécessite une configuration appropriée : le runtime utilise soit le connector fake, soit HTTP ; ces modes sont exclusifs. Aucun basculement de connector n’est promis par la maquette. « Se connecter » doit rejoindre le parcours réel prévu par la configuration, sans inscription email ou connexion sociale fictive. L’origine du backend reste une variable `EXPO_PUBLIC_API_URL`, sans sélecteur d’instance dans ce lot. Le texte de C « Vos données, sur votre instance » reste un texte de proposition à confirmer avant implémentation.

Ces propositions ne modifient ni `DESIGN.md` ni le sidecar du système visuel. Leur choix et leur implémentation constituent une étape séparée.
