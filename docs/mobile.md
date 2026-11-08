# Application mobile

Architecture et conventions du frontend : [frontend/mobile/ARCHITECTURE.md](../frontend/mobile/ARCHITECTURE.md).

Le monorepo contient le serveur autonome dans `backend/`, le client Expo dans `frontend/mobile/` et les clients HA dans `integrations/`. Les commandes ci-dessous se lancent à la racine, sauf indication contraire. Node 24.18.x et pnpm 11.17.0 sont verrouillés ; Rust 1.99.1 reste nécessaire uniquement pour compiler le backend hors Docker.

## Démarrage sans backend

```sh
pnpm install --frozen-lockfile
cp frontend/mobile/.env.example frontend/mobile/.env
pnpm mobile
```

Le mode `fake` est le défaut. Après le splash, il ouvre directement l’accueil sans bienvenue ni connexion. L’accueil V4 présente six habitudes avec des saisies et un historique synthétiques sur trente jours. Les données restent en mémoire : reset ou redémarrage les réinitialise. Les intégrations sont simulées ; statistiques et XP fake restent simplifiés sans reproduire le moteur Rust. Le libellé DÉMO identifie cet accueil.

L'interface technique utilise les composants natifs React Native ; les bibliothèques UI sont autorisées pour la passe produit. Expo Router gère l'entrée et les routes dans `frontend/mobile/src/app/` ; le layout racine conserve les providers de session et de cache entre les écrans ([ADR-016](adr/ADR-016-mobile-expo-router.md)). Les opérations courantes ont des champs dédiés ; les opérations avancées utilisent des paramètres JSON préremplis. Sélectionner une action puis ajuster ses paramètres avant « Exécuter ». Un identifiant d'habitude n'est pas un identifiant de saisie, token ou compte de service.

## Connexion au backend

Dans `frontend/mobile/.env` :

```dotenv
EXPO_PUBLIC_CONNECTOR_MODE=http
EXPO_PUBLIC_API_URL=http://192.168.1.20:8080
EXPO_PUBLIC_ALLOW_HTTP=true
```

`EXPO_PUBLIC_API_URL` est l'origine complète : protocole, IP/domaine et port, **sans** `/api/v1`. L'adresse est affichée en lecture seule. Elle est embarquée dans le bundle : recharger Expo en développement, reconstruire/publier le bundle lors d'un changement en distribution. HTTP n'est permis que lorsque `__DEV__` et `EXPO_PUBLIC_ALLOW_HTTP=true` ; utiliser HTTPS pour une release. Aucune variable `EXPO_PUBLIC_*` ne contient de token ou secret client.

Adresses usuelles : `http://localhost:8080` dans le simulateur iOS, `http://10.0.2.2:8080` dans l'émulateur Android, IP LAN de l'ordinateur ou domaine HTTPS accessible sur téléphone. Le tunnel Metro sert le JavaScript ; il n'expose pas le backend. Les restrictions HTTP de la plateforme native s'appliquent aussi : préférer HTTPS si un appareil refuse le trafic en clair.

Lancer le serveur avec `AUTH_MODE=local task dev`, ou depuis `backend/` avec `AUTH_MODE=local DATABASE_PATH=../data/habits.sqlite cargo run --locked`. Le chemin explicite `../data/habits.sqlite` conserve la base locale à la racine après le déplacement. Le PAT initial de 24 heures apparaît une fois sur stdout ; émettre ensuite un PAT dédié avec les scopes utiles via l'API ou la [CLI](auth.md). Saisir ce PAT dans le champ de connexion. Le stockage sécurisé natif conserve les credentials et leur origine ; un changement d'origine supprime les anciens credentials avant tout appel.

Le Compose reste lié à loopback par défaut. Pour un téléphone, préférer un proxy HTTPS accessible ; si une exposition LAN de développement est nécessaire, utiliser une surcharge locale explicite (Compose récent, supportant `!override`) :

```yaml
# compose.lan.yaml, fichier local non committé
services:
  dev:
    ports: !override
      - "192.168.1.20:8080:8080"
```

```sh
DEV_UID=$(id -u) DEV_GID=$(id -g) AUTH_MODE=local \
  docker compose --project-name habits-dev -f compose.dev.yaml -f compose.lan.yaml up
```

Adapter l'IP à celle de la machine. Initialiser les dossiers de cache/données par un premier `task dev` avant ce lancement. Le fichier ne change ni volumes ni identité du projet. `.env` racine reste celui de Compose ; son exemple est maintenant `backend/.env.example`.

## Auth OIDC optionnelle

Configurer côté Rust les variables `AUTH_MODE=oidc` et `OIDC_*` décrites dans [auth.md](auth.md). Créer chez le fournisseur un **client public natif**, sans secret client, supportant Authorization Code + PKCE S256. Enregistrer exactement la redirect URI `habits://oauth` (la valeur produite par `makeRedirectUri` pour ce scheme/path dans le development build).

Dans l'environnement mobile :

```dotenv
EXPO_PUBLIC_OIDC_ISSUER=https://identity.example.com
EXPO_PUBLIC_OIDC_CLIENT_ID=habits-mobile
EXPO_PUBLIC_OIDC_AUDIENCE=habits-api
EXPO_PUBLIC_OIDC_SCOPES=openid habits:read habits:write entries:read entries:write statistics:read
```

Ajouter `offline_access` uniquement si le fournisseur le supporte et si un refresh token est souhaité. Les scopes d'administration sont facultatifs et doivent être accordés côté fournisseur. L'audience et les scopes doivent correspondre au contrat Rust. Le fournisseur doit émettre un **access token JWT `typ=at+jwt`**, avec issuer/audience et signature conformes ; l'ID token n'est jamais envoyé à l'API. Une installation Pocket ID n'est pas réputée compatible sans vérification de ce contrat.

Le bouton OIDC ouvre le navigateur système. La session est vérifiée sur `/api/v1/session` avant stockage. Le refresh est mutualisé et sa rotation sauvegardée dans un seul objet SecureStore ; panne réseau/5xx conserve les credentials, `invalid_grant` les supprime. Les mutations ne sont jamais rejouées automatiquement après refresh : relancer avec la même clé d'idempotence lorsque l'API la prend en charge.

Utiliser un **development build**, pas Expo Go, pour les redirects OAuth :

```sh
pnpm mobile:ios
# ou, avec SDK Android et appareil/émulateur démarré
pnpm mobile:android
```

`expo run:*` génère les projets natifs ignorés par Git. Ces commandes nécessitent les outils natifs de la plateforme. Aucun compte email/mot de passe n'est créé dans ce lot ; cette évolution est prévue par [ADR-002](adr/ADR-002-monorepo-mobile.md).

## Session, commandes et limites

Les permissions visibles proviennent du backend ; masquer un bouton ne remplace pas son autorisation serveur. Un 401 définitif déconnecte, un 403 indique un droit manquant, une panne réseau ne révoque pas la session. Déconnexion = suppression locale des credentials et du cache, sans révocation du PAT ni fermeture du SSO navigateur.

La rotation/révocation d'accès est confirmée. Si elle invalide votre accès, conservez d'abord le nouveau secret affiché, puis reconnectez-vous. Les secrets émis sont masqués par défaut, conservés hors du cache Query et effacés après 60 secondes ou fermeture du résultat. Les clés d'idempotence restent les mêmes après échec incertain ; modifier le formulaire ou choisir « nouvelle intention » démarre une commande distincte.

Le dashboard se rafraîchit au retour au premier plan et après mutation ; son SSE n'est pas consommé par ce socle. Les jobs se consultent par ID. Web, push, cache hors ligne et publication stores ne sont pas inclus. L’accueil V4 et la page Aujourd’hui distincte sont implémentés.

## Vérifications

```sh
pnpm typecheck
pnpm test:mobile
pnpm mobile:export
# Test d'intégration du connector HTTP contre un binaire Rust local :
cd backend && cargo build --locked && cd ..
HABITS_BACKEND_BIN="$PWD/backend/target/debug/habit-tracker" \
  pnpm --filter @habits/mobile exec tsx --test tests/http-backend.test.ts
```

Le test d'intégration utilise sa propre base temporaire et s'arrête sans effacer les données de développement. Il est ignoré si `HABITS_BACKEND_BIN` est absent. L'export iOS/Android prouve la génération des bundles, pas le fonctionnement sur appareil ni un login auprès de votre fournisseur réel.

## Accueil V4 et navigation

Les routes produit sont dans `src/app/(tabs)/` : accueil, Aujourd’hui (`/today`), progression et profil. Expo Router gère leur état : `NativeTabs` fournit la barre système sur iOS, et Tabs avec le dock React Native sur les autres plateformes. Les trois habitudes affichées se paginent avec les flèches discrètes à côté du bouton Ajouter et les catégories filtrent cette liste. Un appui sur une habitude ou sur la quantité d’eau ouvre `/habit/[id]` pour valider, incrémenter/décrémenter ou définir une valeur exacte. Ajouter ouvre `/new` en modale, avec création idempotente par `setupHabit`. Le profil conserve l’accès aux 39 opérations dans `/console`.

La comparaison « vs hier » utilise uniquement les données disponibles et affiche un tiret sinon. Les jours futurs ne sont jamais ajoutés aux graphiques. Aucun graphique optimiste ne remplace la confirmation du connector. Les modes clair/sombre et le texte agrandi disposent de mises en page adaptées ; la zone native de gestes reste gérée par le système, sans fausse barre dessinée.

Le système visuel est documenté dans `frontend/mobile/DESIGN.md`. Les preuves et limites figurent dans [validation.md](validation.md).

Le dock arrondi, blanc en thème clair et noir `#0c1011` en thème sombre, se superpose au bas du contenu défilant. Sur iOS, il sert de fond à la vraie barre système `NativeTabs` de `expo-router/native-tabs`, avec quatre destinations, des icônes suivant la couleur de texte du thème et sans minimisation automatique. La barre disparaît avant authentification. Le module SwiftUI `@expo/ui` et `expo-glass-effect` ne sont plus utilisés. Les autres plateformes conservent le dock React Native. `ScrollViewport` reste une View standard, sans calque opaque devant le haut du contenu ; les effets de bord restent désactivés via les options stables du Stack. `DeviceInsetsProvider`, placé au-dessus du Stack et de NativeTabs, fournit les marges physiques de la fenêtre : les marges locales des onglets, qui incluent la hauteur de la barre native, ne sont pas ajoutées une seconde fois. Le dock mesure `56 + max(marge physique basse, 8)` points, soit 90 points pour une marge de 34. L’accueil réserve la marge physique haute plus 12 points avant son titre. Le marqueur expérimental ScrollViewMarker ne doit pas être monté. Le rendu du haut de l’écran reste à vérifier sur appareil. Un overscroll en haut de l’accueil révèle une étincelle et « Même les habitudes prennent une pause. », décoration masquée à l’accessibilité. Elle reste fixe sur le fond noir, à la marge physique haute + 20 points, comme sœur après `ScrollViewport`. Seule son opacité varie, par interpolation native entre une traction de marge haute + 96 et + 140 points, sans déplacement ni mise à jour React à chaque événement de défilement. Le ScrollView reste le premier descendant natif du Stack. Les ScrollView occupent toute la hauteur et réservent en fin de contenu la hauteur du dock plus une gouttière de 6 points, afin de garder les derniers contrôles accessibles au-dessus de lui.

La barre d’onglets iOS capture synchroniquement les rectangles visibles en cache et le défilement courant avant le changement de focus. Les mesures de layout alimentent ce cache sans retarder la sélection native ni provoquer un remontage après un callback tardif. Les liens applicatifs Accueil → Progression et le dock React Native conservent leur capture asynchrone via `TabCardMotionProvider`. Les surfaces blanches se correspondent par rôle ; les cartes colorées par palette réelle, rose vers rose, vert vers vert et bleu vers bleu. La surface et son fond dégradé animent leur hauteur réelle en 300 ms, avec ralentissement cubique et opacité de 0,98 à 1. L’origine et la largeur restent fixes ; la hauteur capturée est bornée à ±12 % de celle d’arrivée. Une carte visible sans source correspondante utilise une entrée locale de 108 à 100 %. Les deux extrémités doivent être suffisamment visibles, hors zone du dock : une mince bordure exposée ne suffit pas. Les cartes hors écran n’animent pas. Le remontage des surfaces au focus réactive le mouvement sur les onglets déjà visités : l’état React des écrans est conservé, mais les défilements natifs enfants peuvent revenir à leur position initiale. Le réglage système de réduction des animations est suivi en direct et considéré actif tant que sa valeur native est inconnue ; il désactive morphings et entrées locales. Aucun `Modal`, image instantanée ou shared tag n’est utilisé pour ce trajet. Les liens directs et le retour système ne capturent pas de géométrie.

La modale d’ajout suit la proposition C approuvée : nom, catégorie et type à la première étape, objectif quotidien et récapitulatif modifiable à la seconde. Les quantités se saisissent en L, km ou fois ; les durées en minutes, avec presets ajustables et conversion vers mL, mètres ou secondes pour `setupHabit`. Sans `habits:write`, la création est désactivée et un message explique cet accès en lecture seule. Pendant l’enregistrement, les interactions et la fermeture sont bloquées ; un verrou évite les doubles soumissions et une même intention conserve sa clé d’idempotence après échec. Le contenu défile et le pied tient compte de la zone sûre ; le comportement réel avec clavier reste à vérifier.

## Aujourd’hui

La proposition A approuvée reprend le journal chronologique des saisies réelles et le sélecteur de semaine de B. Aujourd’hui est un quatrième onglet ; Accueil, Progression et Profil restent disponibles. Les heures du journal sont celles des saisies, affichées dans le fuseau de chaque habitude, sans horaires de routine inventés.

Le sélecteur donne accès aux 90 dernières dates, aujourd’hui compris ; les dates futures sont désactivées. Seules les habitudes actuellement actives sont incluses. Le jour courant conserve les actions rapides autorisées par le serveur ; les dates passées sont en lecture seule, avec un bilan issu des statistiques de ce jour et les noms/unités des versions historiques. Un historique manquant ou une période hebdomadaire tronquée est signalé comme indisponible et exclu du bilan, jamais assimilé à zéro ou à une réussite.

Le journal utilise les API existantes, sans modification du backend : toutes les pages de saisies et de versions sont chargées pour les habitudes actives, par lots de huit habitudes en parallèle. Une limite de pagination dépassée produit une erreur explicite plutôt qu’un historique silencieusement incomplet. La fenêtre visible de 90 dates ne limite donc pas le volume des saisies téléchargées. Lecture : `habits:read`, `entries:read`, `statistics:read` ; actions : `entries:write` ; ajout : `habits:write`.

Le journal Aujourd’hui permet de glisser horizontalement vers le jour précédent ou suivant, dans les mêmes limites que le sélecteur ; la semaine visible suit la sélection. Le défilement vertical et le pull-to-refresh sont conservés. Le titre « Encore aujourd’hui » (ou « Bilan du jour ») actualise aussi les données. Les confirmations réussies n’ajoutent plus de carte : elles sont annoncées aux lecteurs d’écran, et les erreurs restent inline. Une courte transition native accompagne les changements de jour, désactivée par le réglage système de réduction des animations.


## Morphing accueil → détail

Les lignes d’habitudes de l’accueil utilisent `HabitMorphLink` : leur icône, nom et progression se transforment en carte d’en-tête du détail `/habit/[id]`. Le retour par le bouton d’en-tête inverse cette transition. La position horizontale et la largeur de l’overlay restent fixes pendant le trajet. La carte Hydratation conserve une navigation ordinaire ; les liens directs et les gestes de retour natifs ne déclenchent pas ce morphing.

`HabitMorphProvider`, placé sous les providers de session et au-dessus du Stack, mesure les rectangles natifs avec `measureInWindow` et anime une copie dans une `Modal` native transparente. Reanimated **4.7.1** et Worklets **0.13.0** animent la géométrie ; il ne s’agit pas des Shared Element Transitions expérimentales. Aucun drapeau expérimental SET n’est activé : ce mécanisme ne prend pas en charge notre navigateur Tabs.

Le réglage système de réduction des animations conserve la navigation sans morphing. Une mesure absente, invalide ou hors écran déclenche le parcours normal ; les mesures ont un délai de secours de 200 ms et l’overlay un garde-fou de 1 500 ms. La déconnexion invalide le trajet et retire l’overlay. Ces garde-fous ne constituent pas une preuve de rendu ou de gestes sur appareil.

## Bienvenue avant connexion — V3

La V3 simplifiée, issue de la proposition B, est sélectionnée et implémentée dans `WelcomeScreen`. Elle conserve une illustration centrale des habitudes et un seul bouton « Se connecter » vers `/login`. Les deux cartes « Avancer » et « À son rythme » ainsi que le lien de démonstration sont supprimés. Les maquettes et leur provenance restent dans `frontend/mobile/.impeccable/mocks/welcome-v3/` ; l’image imagegen sert de référence, pas de fond embarqué.

L’illustration est composée de vues natives, dégradés, symboles de plateforme et SVG. Elle est décorative, exclue de l’arbre d’accessibilité et sans interaction. Le thème sombre, les zones sûres et le défilement pour le texte agrandi sont pris en compte dans le code. L’indicateur de gestes reste géré par le système.

En mode HTTP, l’accueil de bienvenue apparaît lorsqu’aucune session authentifiée n’est disponible, pendant la restauration ou si celle-ci est indisponible. Le bouton est désactivé pendant la restauration. Une session valide restaurée ouvre directement le dashboard. La route `/login` réutilise les parcours PAT et OIDC existants, leurs erreurs et la reprise de connexion. Aucun parcours d’inscription ni sélecteur d’instance n’est ajouté. La console avancée reste accessible depuis le profil.

En mode fake, la session simulée est restaurée automatiquement : après le splash B existant, l’application ouvre directement l’accueil, sans bienvenue ni étape de connexion. Pendant cette restauration locale, la bienvenue n’est pas affichée, afin d’éviter un flash. Le profil masque la déconnexion en mode fake ; la remise à zéro des données simulées reste disponible.

Les exports et la revue du code ne constituent pas une validation native de cette V3 ; rendu, VoiceOver, texte agrandi, zones sûres et clavier restent à vérifier sur appareil, sans simulateur pour cette tranche. Voir [validation.md](validation.md).

## Splash plein écran — B « Les cartes »

La proposition B est sélectionnée et intégrée via `LaunchSplash`. Trois bandes pastel deviennent une pile, puis cinq surfaces prennent la composition de l’accueil en 760 ms, avec disparition en fondu de 190 ms. Une Modal native plein écran couvre aussi la barre d’onglets ; les couleurs suivent le thème, et la géométrie tient compte des marges physiques et de la largeur maximale de 700 points. La barre de statut est masquée uniquement pendant cette séquence.

L’animation se joue une fois par montage du layout racine. La bienvenue ou l’application restaurée est déjà montée dessous : aucune attente d’authentification ou de réseau ne prolonge le splash. La réduction des animations court-circuite la séquence ; la lecture du réglage dispose d’un repli après 200 ms et l’animation d’un garde-fou de 2,5 secondes dès le montage. `expo-splash-screen` 58.0.13 conserve un splash natif statique noir jusqu’à l’affichage de la Modal. Son plugin demande une reconstruction native ; vérifier le lancement sur appareil avec une build release, Expo Go et le development client ne reproduisant pas complètement le splash de production.

Les storyboards et leur provenance restent dans `frontend/mobile/.impeccable/mocks/splash-v1/`. Aucun simulateur utilisé ni rendu natif validé pour cette intégration.


## Profil — A « L’essentiel »

La proposition A est intégrée dans `ProfileScreen`, accessible par l’onglet `/profile` : identité de session, carte verte « Mon parcours », puis réglages. Le niveau et les XP réutilisent la requête dashboard, uniquement avec `statistics:read` et `habits:read`. Chargement, accès insuffisant, erreur et réessai sont explicites ; aucune statistique illustrative n’est ajoutée.

« Apparence » ouvre une alerte native Système / Clair / Sombre. Le choix est conservé localement dans SecureStore (`habits.appearance.v1`) et appliqué via `Appearance`, sans modifier le compte serveur. « Connexion » affiche les informations de session et l’origine déjà connues, sans ping de santé. « Outils avancés » ouvre `/console`. En démo, une confirmation précède la réinitialisation des données en mémoire ; en HTTP, l’action est la déconnexion. Les opérations sont protégées contre les doubles soumissions.

Le profil réutilise les thèmes, les marges physiques, le dock et les transitions existants. La référence visuelle reste dans `frontend/mobile/.impeccable/mocks/profile-v1/`. Le rendu, les alertes natives, VoiceOver et le texte agrandi restent à vérifier sur appareil, sans simulateur utilisé pour cette tranche.


## Progression B avec régularité et catégories de A

La composition sélectionnée est implémentée dans `ProgressScreen`, réexporté par la route `/progress`. Elle conserve le sélecteur glissant Semaine / Mois (7 / 30 jours), la courbe rose lissée et le détail de toutes les valeurs journalières de B. La carte verte Régularité de A remplace celle de B ; la carte Par catégorie de A s’ajoute sans supprimer une autre section.

La régularité distingue le record sur 91 jours des jours complets de la période sélectionnée. Elle présente aussi une grille des jours, la série actuelle et les XP. Les catégories affichent explicitement les valeurs d’aujourd’hui ; ouvrir une catégorie révèle ses habitudes et leurs liens vers les fiches existantes. Chargement, permissions insuffisantes, erreur avec réessai et données absentes restent explicites.

La carte rose de l’accueil ouvre `/progress?section=overview`. La carte verte et la flamme ouvrent `section=regularity`, avec défilement vers la carte verte. Ces ancres s’appliquent une fois par focus ou changement de section ; modifier la période ne ramène pas la page à l’ancre. Navigation partagée et mouvement vertical sont conservés ; Hydratation ouvre toujours le détail de l’habitude.

L’accueil et Progression partagent `chart-model.ts` : interpolation cubique monotone bornée, sans dépassement des valeurs ni trait entre des dates manquantes. Le connector fake produit trente jours de saisies UTC plausibles, avec des quantités arrondies au pas des objectifs et des versions d’habitudes remontant à 29 jours. Ses séries hebdomadaires conservent sept jours courants et sept jours précédents, avec des moyennes calculées depuis les valeurs réelles. Courbes, totaux, XP et séries dérivent des saisies simulées ; aucune donnée HTTP n’est remplacée.

Les images A/B/C, leurs prompts et la comparaison restent archivés dans `frontend/mobile/.impeccable/mocks/progression-v1/`. Elles documentent le choix B + cartes de A ; elles ne sont pas embarquées dans l’interface. Aucun rendu natif n’a été vérifié sur appareil pour cette refonte.
