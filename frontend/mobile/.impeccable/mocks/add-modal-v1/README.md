# Modale d’ajout — propositions V1

Maquettes exploratoires ; proposition C sélectionnée et implémentée le 2026-11-07. Source visuelle : ../quiet-v1/home.png ; dots exclus. Images générées avec imagegen, prompts exacts conservés dans les fichiers voisins. Sans simulateur.

- A : formulaire compact ; proposition recommandée pour la création directe.
- B : modèles locaux prédéfinis à adapter, proposition nouvelle et non catalogue existant.
- C : parcours en deux étapes ; seconde étape illustrée, après nom, catégorie et type.

Périmètre implémenté : nom, catégorie et type à la première étape ; objectif quotidien, presets ajustables et récapitulatif avec retour « Modifier » à la seconde. Litres, kilomètres et minutes sont convertis vers millilitres, mètres et secondes pour le connecteur ; les répétitions utilisent « fois », le booléen une validation. Aucun rappel ou calendrier supplémentaire. Le clavier n’est pas représenté : le contenu défile et le pied tient compte de la zone sûre, sans vérification native du clavier. Les exemples de volumes sont personnalisables, sans valeur de recommandation individuelle.

A et B restent des propositions non approuvées. C réutilise les composants et thèmes natifs existants ; `DESIGN.md` et les tokens approuvés sont conservés. Les preuves et limites de validation figurent dans `docs/validation.md` à la racine.
