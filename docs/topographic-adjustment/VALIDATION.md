# Validation — catalogue, contrôles permanents et décisions ouvertes

Les 100 jeux synthétiques, ce qui est vérifié aujourd'hui, et ce qui reste réellement à décider. Une
anomalie résolue est protégée par un test ; elle n'est pas conservée comme dette narrative, mais la
cause reste écrite ici quand la reproduire coûterait cher.

## Le catalogue

### Statut et usage

`public/demo-datasets/v1` contient 100 réseaux synthétiques déterministes générés à partir d'une
vérité 3D connue. Ce ne sont pas des mesures de chantier. Ils servent la démonstration, les tests de
non-régression, la comparaison preview/STAR*NET et le mode aveugle de l'Analysis Lab.

Le catalogue remplace les jeux inventés à la main. Les anciennes fixtures ATS34/ATS35/FR restent
temporairement dans `src/demo/fixtures` parce que l'application et des tests historiques les utilisent
encore ; ce sont des fixtures de compatibilité et elles ne doivent plus être étendues.

### Fichiers canoniques

- `manifest.json` : index léger, distribution, scénarios, tailles et SHA-256 des shards ;
- `schema.json` : contrat minimal public ;
- `shards/validation-001-010.json` … `validation-091-100.json` : dix jeux par shard ;
- `packages/python/topographic-adjustment-core/src/btm_topography/validation_catalogue.py` : seule
  source de génération ;
- `test_validation_catalogue.py` : contraintes géométriques, couverture, identité et reproductibilité.

Ne jamais demander à une IA de lire tous les shards. Lire le manifest, sélectionner un ID puis charger
uniquement son shard. Le jeu canonique pour les tests réseau propres est `BTM-VAL-041` (trois stations,
aucun défaut injecté).

### Couverture exacte

| Axe | Distribution |
|---|---|
| Stations | 20 jeux chacun avec 1, 2, 3, 4 et 5 stations |
| Cibles | maximum 30 par station, distances inclinées vraies de 3 à 100 m |
| Références | 3 à 6 par station |
| Shared points | 0 pour une station ; 2 à 6 confirmés explicitement pour un réseau |
| Composition | 80 scénarios isolés, 20 avec une anomalie secondaire |

| Scénario principal | Nombre |
|---|---:|
| propre | 12 |
| référence déplacée de 2–3 mm | 14 |
| vibration transitoire de station | 14 |
| erreur grossière Hz | 6 |
| erreur grossière Vz | 6 |
| erreur grossière Sd | 6 |
| correction atmosphérique omise | 12 |
| courbure/réfraction omise | 10 |
| distance horizontale interprétée comme inclinée | 10 |
| réduction Face I/Face II | 10 |

Chaque jeu contient trois époques : `baseline`, `incident`, `verification`. Les références déplacées
restent déplacées après l'incident : la correction attendue est de libérer ou mettre à jour leur
contrainte, pas de simuler un retour arbitraire. La vibration touche une série contiguë de lignes de
visée. Les erreurs grossières ciblent une composante. Les effets atmosphériques et de courbure sont
calculés physiquement aux distances du jeu, y compris quand leur amplitude reste submillimétrique.

Les instruments du catalogue sont uniformes à l'intérieur d'un jeu : aucun des 100 jeux n'a deux
stations aux écarts-types différents. Un jeu futur qui mélangerait deux instruments rendrait visible la
résolution par station, qui est déjà en place.

### Structure utile

Un dataset regroupe : conventions, époques, stations et orientations vraies, points physiques, bindings
station–cible, mappings shared confirmés, contraintes de références, setups mixtes, coordonnées
initiales approximatives, T/P, observations Face I/II, traces de correction et oracle.

Deux cas d'identité sont systématiquement représentés dans les réseaux :

- même point physique observé sous des noms différents, relié explicitement ;
- même nom métier (`MPO001` en FR ou `MP001` en UK) utilisé par plusieurs stations pour des points
  physiques distincts, jamais relié automatiquement.

`oracle` contient vérité, faute injectée et action attendue. L'UI le masque en mode aveugle. Les tests
peuvent l'utiliser directement. Les valeurs `truth` de chaque observation permettent de séparer
géométrie exacte, bruit déterministe et faute.

### Génération et vérification

```bash
PYTHONPATH=packages/python/topographic-adjustment-core/src \
python -m btm_topography.validation_catalogue generate \
  --output public/demo-datasets/v1

PYTHONPATH=packages/python/topographic-adjustment-core/src \
python -m btm_topography.validation_catalogue check \
  --output public/demo-datasets/v1
```

La graine PCG64, le timestamp du manifest, l'ordre JSON et le découpage sont fixes. `check` régénère
dans un dossier temporaire et compare chaque octet. Toute modification scientifique intentionnelle
incrémente `GENERATOR_VERSION`, régénère tous les shards et met à jour les tests.

Si un dataset expose une différence avec un moteur, ajouter d'abord un test minimal qui prouve le
contrat, avant de corriger le moteur.

## Verdict actuel

La maquette possède un parcours UK/FR, station unique/réseau, initialisation, preview scientifique,
versions, runs, sorties, administration, Analysis Lab, navigateur de catalogue et pilote STAR*NET. Les
noyaux Python et TypeScript couvrent géométrie 3D, corrections, moindres carrés, synchronisation, χ²,
facteur de variance, sigmas/ellipses et Auto Adjust de démonstration.

Ces éléments constituent une base réutilisable, pas un moteur certifié ni une intégration BTM de
production. Les contrats scientifiques ne changent qu'avec preuve et non-régression.

## Contrôles permanents

### Données et identité

- [ ] Les entrées sont mappées explicitement à Hz/Vz/Sd et station/capteur.
- [ ] Une station ou un réseau connecté ; aucun groupe indépendant caché.
- [ ] Aucun shared point n'est déduit d'un nom ; les homonymes distincts restent séparés.
- [ ] Deux à six shared points explicites pour les réseaux du catalogue ; connectivité vérifiée.
- [ ] Configuration de mesure et constantes résolues par station–cible.
- [ ] Précision résolue par la chaîne template → instrument → visée, avec sa provenance affichée.
- [ ] Références, coordonnées initiales et provenance visibles.

### Calcul

- [ ] Conventions E/N/H, azimut Nord horaire, Vz zénithal et Sd inclinée conservées.
- [ ] Face II normalisée et moyenne angulaire circulaire.
- [ ] Constante puis atmosphère appliquées exactement une fois ; reflectorless delta zéro.
- [ ] Distance horizontale et inclinée jamais confondues ; conversion tracée et refusée près du zénith.
- [ ] Courbure/réfraction et `.SCALE` séparés de l'atmosphère.
- [ ] Convergence, rang, dof, χ², variance, résidus, sigmas et ellipses cohérents.
- [ ] `not-applicable` ne conserve pas une ancienne valeur binaire χ².
- [ ] Preview signalée non certifiée ; STAR*NET natif identifié comme tel.

### Temps, versions et sorties

- [ ] Source epoch, fenêtre d'initialisation, output slot et validité de version distincts.
- [ ] Synchronisation fresh/reused/missing, provisoire et catch-up borné testés.
- [ ] Le resolver historique choisit la version valide pour chaque slot.
- [ ] Recalcul = UPSERT des variables existantes, pas création de séries concurrentes.
- [ ] Une version utilisée reste immuable et archivable, jamais supprimée.
- [ ] Sauvegarde Analysis Lab = snapshot complet d'un essai encore à jour.

### UX

- [ ] Parcours essentiel utilisable sans ouvrir Advanced.
- [ ] Tous les paramètres nécessaires restent accessibles avec unité/source/aide.
- [ ] Une station de cent prismes reste lisible et modifiable en lot.
- [ ] Français/anglais, clavier, contrastes et états asynchrones vérifiés.
- [ ] Carte, table Points, observations et essai sont synchronisés.
- [ ] Sélection station/prisme/ligne de visée et édition par objet compréhensibles.
- [ ] Aucun fichier preview brut à éditer, bouton mort ou résultat stale.

### Qualité technique

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run test:python`
- [ ] `npm run check:validation-data`
- [ ] `npm run build`
- [ ] `npm run test:e2e`
- [ ] CI GitHub verte et preuve visuelle des parcours modifiés.

## Résolu — à ne pas défaire

Ces défauts ont coûté cher à trouver. Chacun est protégé par un test ; la cause est écrite pour que
personne ne rétablisse le comportement d'origine en croyant simplifier.

### Robustesse des écrans

- **Une réponse 200 qui n'est pas du JSON est une erreur.** Le backend de démo est un service worker :
  quand il ne répond plus, l'hôte sert le shell applicatif en 200. `api()` transformait ce corps en
  `{}` et le rendait comme s'il s'agissait de la charge utile attendue ; l'écran cassait loin de la
  cause (`sessions.data?.find is not a function` au milieu de l'Analysis Lab, ce qui emportait le plan
  de travail **et tous les essais en cours**). Ne pas rétablir un repli silencieux.
- **Les frontières d'erreur sont par panneau** dans l'Analysis Lab (session de validation, carte,
  points, observations, banc d'essai). Un panneau fautif s'affiche en erreur nommée, avec sa cause
  technique et un « Réessayer », et laisse vivre le reste de l'écran — donc les essais, qui vivent dans
  l'état de la page. Une frontière au niveau de la route les détruit.
- **Le garde-fou du snapshot persisté valide aussi les collections imbriquées**
  (`diagnostics[*].points`/`residuals`, `runs[*].stationEpochs`, `versions[*]` et son
  `initialisation`). Valider le premier niveau seulement laissait passer un instantané d'un autre build
  qui échouait ensuite dans un écran. `validationSessions` reste optionnel : un instantané antérieur à
  son introduction doit rester chargeable.
- **Aucun écran n'écrit la configuration au montage.** Matérialiser le référentiel depuis un
  `useEffect` a coûté une demi-journée : `update` est recréé à chaque rendu, l'effet tournait à chaque
  rendu, écrivait le brouillon, re-rendait, et React finissait par lever `Maximum update depth
  exceeded` — remonté dans un `InputBase` MUI, loin de la cause.

### Référentiel et coordonnées

- **Le référentiel appartient à la configuration, pas au mode d'initialisation.** `resolve-run`
  déduisait le datum de `initialisation.mode` : la station fixée pour *calculer* les approximations
  restait fixe dans tous les runs, orientation comprise, et les références ne portaient aucune
  contrainte. Un enregistrement de coordonnée couvre désormais n'importe quel point moteur, stations
  incluses (`station:<code>`), et n'existe **que** pour un point tenu. L'orientation fictive `BTMORI`
  n'est émise que si le réseau n'a aucun autre contrôle. Une version antérieure sans ligne de station
  garde son résultat historique par une branche de compatibilité explicite — une version utilisée est
  immuable.
- **Au moins deux références connues, sinon on ne publie pas.** Ce qui tient le réseau doit être une
  référence dont la coordonnée vient du levé (jeu de données, `references.csv`, saisie), fixe ou
  contrainte. Une approximation calculée à l'initialisation ne compte pas (provenance `datum`), et une
  station ne compte jamais. Le seuil est unique (`MINIMUM_HELD_REFERENCES`, `src/demo/resolve-run.ts`)
  et appliqué deux fois : `Next` verrouillé sur l'étape Ajustement (raison `not-enough-references`), et
  au run comme message bloquant — le slot devient `technical-error` à l'étape `resolve` et
  `publishMeasures` n'est jamais atteint, donc le cycle est sauté sans rien publier.
- **Distance horizontale : conversion à l'entrée, jamais dans le `.dat`.** STAR*NET lit les distances
  selon un unique mode de projet ; un fichier natif ne peut pas mélanger inclinée et horizontale. Le
  choix est donc par visée sur la donnée stockée et `Sd = Hd / sin(zénith)` est appliqué dans la chaîne
  de corrections, tracé, et **refusé** à moins de ~3° de la verticale. Ne pas inventer de ligne
  d'option native pour basculer en cours de fichier sans l'avoir vérifiée sur l'installation.
- **Le `.dat`/`.prj` est une image de `resolved.input`** : contraintes de contrôle effectives
  (`effectiveControlConstraint`), coordonnées d'essai et visées retenues. Une paire impossible à
  générer n'est plus émise à moitié : `previews.error` bloque l'exécution native avec la vraie cause.

### Précision des mesures

- **La précision appartient à l'instrument de la station, pas au projet.** Le brouillon recopiait
  `preset.adjustment.defaultWeights` sur *chaque* visée, si bien qu'un seul nombre décrivait tout un
  réseau et que les `measurementFamilies` déjà déclarées par le template FR n'étaient jamais lues. Une
  chaîne unique répond maintenant — `template pays → instrument de la station → cette visée` — et
  chaque valeur porte l'étape qui l'a énoncée. Une visée ne restate un écart-type que si elle est
  réellement mesurée autrement. `defaultWeights` reste le défaut projet écrit dans le `.prj`.
- **Rouvrir une version stockée reconstruit les deux niveaux.** Une version garde une précision par
  binding, parce que c'est ce que le moteur a consommé. L'éditeur doit en déduire ce que la station
  énonce et quelles visées s'en écartent réellement ; plus grossier perdrait un override ou
  transformerait chaque visée en override.

### Pièges d'interface MUI

Trouvés en lisant des captures, pas le code : le typecheck et les tests passaient.

- **Un `placeholder` sur un `TextField` *outlined* ne s'affiche pas** tant que le label n'est pas
  réduit (`InputLabelProps={{ shrink: true }}`). Les quatre champs de σ héritées rendaient une case
  vide, ce qui annulait exactement l'intention « afficher par défaut la précision de la station ».
- **Un `Select` dont la valeur sélectionnée est `''` rend une case vide** sans `displayEmpty`, donc
  l'option « de l'instrument » était invisible.
- **`text-transform: uppercase` transforme chaque `σ` en `Σ`.** Un écart-type n'est pas une somme : les
  en-têtes de tableau ne sont pas capitalisés, comme ceux de l'Analysis Lab.
- **`data-testid` sur un `Select` MUI n'atteint pas l'élément cliquable** : les props supplémentaires
  vont sur la racine, et seul `SelectDisplayProps` touche la div d'affichage — laquelle est typée
  `HTMLAttributes<HTMLDivElement>`, qui exclut `data-*`.

## Limites réellement ouvertes

### Recette STAR*NET native

- Premier `.dmp` STAR*NET 14 réel à anonymiser et figer pour tester sigmas/ellipses.
- Vérification finale des templates CRLF FR/UK/canonique sans dialogue interactif.
- Détail structuré des observations réellement retirées par Auto Adjust natif ; le listing est
  actuellement la preuve de repli.
- Capacité de licence, concurrence et stratégie de lock/queue de production.
- Options natives disponibles dans l'édition installée et différences preview/native documentées.
- **Exclusion d'une seule composante** : un `DM` de jeu de directions porte Hz, Sd et Vz ensemble, donc
  exclure uniquement l'une d'elles n'est pas représentable dans le fichier natif. Le moteur de preview
  la retire, STAR*NET ajuste la visée complète ; l'écart est signalé dans les avertissements des
  fichiers générés. Exposer les deux moitiés demanderait d'éclater la visée en enregistrements natifs
  distincts (`DN` + mesure séparée) : à chiffrer avant de le promettre.
- **Parité de l'orientation fixée** : `src/domain/math/adjust.ts` et le noyau Python implémentent une
  orientation fixée en *retirant une inconnue*, alors que le `.dat` ajoute un point fixe et une
  observation exacte. Les degrés de liberté diffèrent donc entre aperçu et natif. Décider lequel des
  deux aligner.
- **Enregistrement azimut natif** : la syntaxe exacte reste en attente du manuel éditeur. Rien ne sera
  écrit sans preuve.

### Fonctionnel/BTM

- Saisie et matérialisation complète de toutes les `geometricRelationships` dans Python et STAR*NET ;
  le contrat existe mais toute la chaîne n'est pas encore exposée.
- Publication réelle dans `raw_data/measures`, transactions, file de jobs et audit BTM.
- Choix final tables normalisées vs JSONB pour le snapshot de configuration.
- Politique de rétention des diagnostics runs et sessions Analysis Lab.
- Mapping final métriques/unités du catalogue de variables BTM.
- Formule atmosphérique et plages T/P approuvées pour la production.
- Poids et centrages France approuvés par la cellule topographique.

### Catalogue et interface

- Le détail par face n'est pas affiché pour une visée. `RawObservation` ne porte pas de dimension face :
  la réduction a lieu à l'import, et le laboratoire montre les composantes réduites plus la politique
  appliquée. Exposer les deux faces demanderait d'étendre le contrat d'observation.
- La politique de réduction des faces est choisie à l'import, pas surchargée par essai. Changer d'avis
  réimporte le jeu.
- Le facteur de variance des jeux générés reste inférieur à 1 : leurs références sont posées exactement
  sur leur vérité tout en déclarant 1–1,5 mm. L'UI explique le côté du test plutôt que de corriger les
  poids. Si la production veut un khi-deux centré, c'est le générateur qui doit bruiter les coordonnées
  de référence.
- L'import déclare un centrage nul parce que le générateur ne simule aucune erreur de centrage. Un jeu
  futur qui en simulerait une devrait porter ses propres valeurs.
- La fixture ATS34 dépend encore d'un convertisseur `xlsx` de développement. Refaire un audit de
  dépendances lors de son remplacement par le catalogue, puis retirer le classeur/convertisseur
  seulement quand aucun parcours ni test de compatibilité n'en dépend.
- **i18n** : le shell, la page d'accueil, le catalogue de validation, l'Analysis Lab, la carte réseau,
  le vocabulaire partagé (`enums.role`, `enums.status`, `enums.constraint`, `enums.distanceKind`) et
  les étapes Instruments, Cibles, Initialisation et Ajustement sont traduits. La langue est mémorisée,
  déduite du navigateur au premier passage, et posée sur `documentElement.lang`. Restent en anglais :
  les libellés du stepper, les étapes General, Stations, Run, Output et Review, le détail d'un
  processing, le détail d'un run, le panneau de recalcul historique et la passerelle STAR*NET.
- Le nom d'un processing importé depuis le catalogue est stocké : il reste volontairement composé
  d'identifiants et de nombres, car il ne peut pas suivre un changement de langue ultérieur.
- Le mode par défaut d'un brouillon neuf reste le repère local : un brouillon vide ne connaît aucune
  coordonnée, et démarrer sur un mode qui échouerait immédiatement serait pire. Les trois modes sont
  explicites et « calculer depuis les références connues » est proposé en premier.
