# Validation actuelle et décisions ouvertes

Ce document remplace les audits historiques. Il décrit uniquement ce qui est vérifié aujourd'hui,
la recette permanente et les limites encore ouvertes. Une anomalie résolue est protégée par un
test ; elle n'est pas conservée comme dette narrative.

## Verdict actuel

La maquette possède un parcours UK/FR, station unique/réseau, initialisation, preview scientifique,
versions, runs, sorties, administration, Analysis Lab et pilote STAR*NET. Les noyaux Python et
TypeScript couvrent géométrie 3D, corrections, moindres carrés, synchronisation, χ², facteur de
variance, sigmas/ellipses et Auto Adjust de démonstration.

Ces éléments constituent une base réutilisable, pas un moteur certifié ni une intégration BTM de
production. Le prochain travail autorisé est un refactor d'expérience et l'intégration du catalogue
de validation ; les contrats scientifiques ne doivent changer qu'avec preuve et non-régression.

## Contrôles permanents

### Données et identité

- [ ] Les entrées sont mappées explicitement à Hz/Vz/Sd et station/capteur.
- [ ] Une station ou un réseau connecté ; aucun groupe indépendant caché.
- [ ] Aucun shared point n'est déduit d'un nom ; les homonymes distincts restent séparés.
- [ ] Deux à six shared points explicites pour les réseaux du catalogue ; connectivité vérifiée.
- [ ] Configuration de mesure et constantes résolues par station–cible.
- [ ] Références, coordonnées initiales et provenance visibles.

### Calcul

- [ ] Conventions E/N/H, azimut Nord horaire, Vz zénithal et Sd inclinée conservées.
- [ ] Face II normalisée et moyenne angulaire circulaire.
- [ ] Constante puis atmosphère appliquées exactement une fois ; reflectorless delta zéro.
- [ ] Distance horizontale et inclinée jamais confondues.
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
- [ ] Sauvegarde Analysis Lab = snapshot complet d'un trial encore à jour.

### UX

- [ ] Parcours essentiel utilisable sans ouvrir Advanced.
- [ ] Tous les paramètres nécessaires restent accessibles avec unité/source/aide.
- [ ] Français/anglais, clavier, contrastes et états asynchrones vérifiés.
- [ ] Carte, table Points, observations et trial sont synchronisés.
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

## Limites réellement ouvertes

### Recette STAR*NET native

- Premier `.dmp` STAR*NET 14 réel à anonymiser et figer pour tester sigmas/ellipses.
- Vérification finale des templates CRLF FR/UK/canonique sans dialogue interactif.
- Détail structuré des observations réellement retirées par Auto Adjust natif ; le listing est
  actuellement la preuve de repli.
- Capacité de licence, concurrence et stratégie de lock/queue de production.
- Options natives disponibles dans l'édition installée et différences preview/native documentées.
- **Exclusion d'une seule composante** : un `DM` de jeu de directions porte Hz, Sd et Vz ensemble,
  donc exclure uniquement l'une d'elles n'est pas représentable dans le fichier natif. Le moteur de
  preview la retire, STAR*NET ajuste la visée complète ; l'écart est signalé dans les avertissements
  des fichiers générés. Exposer les deux moitiés demanderait d'éclater la visée en enregistrements
  natifs distincts (`DN` + mesure séparée) : à chiffrer avant de le promettre.
- Le `.dat`/`.prj` est désormais une image de `resolved.input` : contraintes de contrôle effectives
  (`effectiveControlConstraint`), coordonnées d'essai et visées retenues. Une paire impossible à générer n'est
  plus émise à moitié : `previews.error` bloque l'exécution native avec la vraie cause.

### Robustesse des écrans (résolu, à ne pas défaire)

- **Une réponse 200 qui n'est pas du JSON est une erreur.** Le backend de démo est un service
  worker : quand il ne répond plus, l'hôte sert le shell applicatif en 200. `api()` transformait ce
  corps en `{}` et le rendait comme s'il s'agissait de la charge utile attendue ; l'écran cassait
  loin de la cause (`sessions.data?.find is not a function` au milieu de l'Analysis Lab, ce qui
  emportait le plan de travail **et tous les essais en cours**). Ne pas rétablir un repli silencieux.
- **Les frontières d'erreur sont par panneau** dans l'Analysis Lab (session de validation, carte,
  points, observations, banc d'essai). Un panneau fautif s'affiche en erreur nommée, avec sa cause
  technique et un « Réessayer », et laisse vivre le reste de l'écran — donc les essais, qui vivent
  dans l'état de la page. Une frontière au niveau de la route les détruit.
- **Le garde-fou du snapshot persisté valide aussi les collections imbriquées**
  (`diagnostics[*].points`/`residuals`, `runs[*].stationEpochs`, `versions[*]` et son
  `initialisation`). Valider le premier niveau seulement laissait passer un instantané d'un autre
  build qui échouait ensuite dans un écran. `validationSessions` reste optionnel : un instantané
  antérieur à son introduction doit rester chargeable.

### Référentiel et coordonnées (résolu, à ne pas défaire)

- **Le référentiel appartient à la configuration, pas au mode d'initialisation.** `resolve-run`
  déduisait le datum de `initialisation.mode` : la station fixée pour *calculer* les approximations
  restait fixe dans tous les runs, orientation comprise, et les références ne portaient aucune
  contrainte. Un enregistrement de coordonnée couvre désormais n'importe quel point moteur, stations
  incluses (`station:<code>`), et n'existe **que** pour un point tenu : libérer un point, c'est
  supprimer sa ligne. L'orientation fictive `BTMORI` n'est émise que si le réseau n'a aucun autre
  contrôle. Une version antérieure sans ligne de station garde son résultat historique par une
  branche de compatibilité explicite — une version utilisée est immuable.
- **Au moins deux références connues, sinon on ne publie pas.** Ce qui tient le réseau doit être une
  référence dont la coordonnée vient du levé (jeu de données, `references.csv`, saisie), fixe ou
  pondérée. Une approximation calculée à l'initialisation ne compte pas (provenance `datum`), et une
  station ne compte jamais. Le seuil est unique (`MINIMUM_HELD_REFERENCES`, `src/demo/resolve-run.ts`)
  et appliqué deux fois : `Next` verrouillé sur l'étape Ajustement (raison
  `not-enough-references`), et au run comme message bloquant — le slot devient `technical-error`
  à l'étape `resolve` et `publishMeasures` n'est jamais atteint, donc le cycle est sauté sans rien
  publier. Une version héritée tenue par sa seule station tombe sous la même règle : elle n'a pas de
  référence, donc elle ne publie plus — c'est le défaut que la règle vise.
- **Distance horizontale : conversion à l'entrée, jamais dans le `.dat`.** STAR*NET lit les distances
  selon un unique mode de projet ; un fichier natif ne peut pas mélanger inclinée et horizontale. Le
  choix est donc par visée sur la donnée stockée et `Sd = Hd / sin(zénith)` est appliqué dans la
  chaîne de corrections, tracé, et **refusé** à moins de ~3° de la verticale. Ne pas inventer de
  ligne d'option native pour basculer en cours de fichier sans l'avoir vérifiée sur l'installation.
- **Aucun écran n'écrit la configuration au montage.** Matérialiser le référentiel depuis un
  `useEffect` a coûté une demi-journée : `update` est recréé à chaque rendu, l'effet tournait à
  chaque rendu, écrivait le brouillon, re-rendait, et React finissait par lever
  `Maximum update depth exceeded` — remonté dans un `InputBase` MUI, loin de la cause. Le datum est
  un acte explicite (bouton « libérer les stations, contraindre les références ») et `Next` reste
  verrouillé tant que le réseau n'est pas tenu par au moins deux références connues.

### Limites connues de l'assistant

- Le **mode par défaut** d'un brouillon neuf reste le repère local : un brouillon vide ne connaît
  aucune coordonnée, et démarrer sur un mode qui échouerait immédiatement serait pire. Les trois
  modes sont explicites et « calculer depuis les références connues » est proposé en premier.
- `LegacyWizardPage.tsx` contient encore un **assistant complet mort** (export par défaut non
  routé : `GeneralStep`, `TargetsStep`, `InitialisationStep`, `CommonPointsPanel`…) à côté des
  quatre étapes réellement utilisées. À supprimer dans une passe dédiée (~700 lignes), pas au
  détour d'une autre tâche.
- L'i18n de l'assistant couvre les trois étapes refondues (cibles, initialisation, ajustement).
  General, Stations, Instruments, Run, Output et Review restent en anglais.

### Fonctionnel/BTM

- Saisie et matérialisation complète de toutes les `geometricRelationships` dans Python et
  STAR*NET ; le contrat existe mais toute la chaîne n'est pas encore exposée.
- Publication réelle dans `raw_data/measures`, transactions, file de jobs et audit BTM.
- Choix final tables normalisées vs JSONB pour le snapshot de configuration.
- Politique de rétention des diagnostics runs et sessions Analysis Lab.
- Mapping final métriques/unités du catalogue de variables BTM.
- Formule atmosphérique et plages T/P approuvées pour la production.
- Poids et centrages France approuvés par la cellule topographique.

### Catalogue de validation et UI

Le navigateur, le chargement paresseux, le mode aveugle, l'import vers les repositories existants
et la sélection synchronisée de l'Analysis Lab sont livrés et testés. Restent ouverts :

- Le détail par face n'est pas affiché pour une visée. `RawObservation` ne porte pas de dimension
  face : la réduction a lieu à l'import, et le laboratoire montre les composantes réduites plus la
  politique appliquée. Exposer les deux faces demanderait d'étendre le contrat d'observation.
- La politique de réduction des faces est choisie à l'import, pas surchargée par essai. Changer
  d'avis réimporte le jeu.
- Le facteur de variance des jeux générés reste inférieur à 1 : leurs références sont posées
  exactement sur leur vérité tout en déclarant 1–1,5 mm. L'UI explique le côté du test plutôt que
  de corriger les poids. Si la production veut un khi-deux centré, c'est le générateur qui doit
  bruiter les coordonnées de référence.
- L'import déclare un centrage nul parce que le générateur ne simule aucune erreur de centrage.
  Un jeu futur qui en simulerait une devrait porter ses propres valeurs.
- La fixture ATS34 dépend encore d'un convertisseur `xlsx` de développement. Refaire un audit de
  dépendances lors de son remplacement par le catalogue, puis retirer le classeur/convertisseur
  seulement quand aucun parcours ni test de compatibilité n'en dépend.
- L'i18n couvre le shell, la page d'accueil, le catalogue de validation, l'Analysis Lab, la carte
  réseau et le vocabulaire partagé (`enums.role`, `enums.status`, `enums.constraint`). La langue
  est mémorisée, déduite du navigateur au premier passage, et posée sur `documentElement.lang`.
  Restent en anglais, faute d'écran refondu dans cette branche : le wizard de création
  (`src/features/create/`), le détail d'un processing, le détail d'un run, le panneau de
  recalcul historique et la passerelle STAR*NET. La PR #26 contient déjà une traduction de ces
  écrans ; elle vise l'ancienne mise en page et doit être réadaptée, pas reprise telle quelle.
- Le nom d'un processing importé depuis le catalogue est stocké : il reste volontairement composé
  d'identifiants et de nombres, car il ne peut pas suivre un changement de langue ultérieur.

## Seuil de livraison du prochain refactor

Le travail est prêt à reviewer lorsque :

1. l'application démarre et les parcours existants restent fonctionnels ;
2. le catalogue est parcourable sans charger 12 Mo au démarrage ;
3. au moins un cas propre et un cas de chaque famille de défaut sont testables dans Analysis Lab ;
4. le résultat d'un trial devient obsolète après chaque modification et doit être recalculé ;
5. la table Points unique contient initial/adjusted/deltas/sigmas/ellipse/résidu ;
6. carte et inspecteur permettent de sélectionner station, prisme, shared point et ligne de visée ;
7. les deux identités « même point/noms différents » et « même nom/points distincts » sont claires ;
8. la sauvegarde crée un draft complet sans modifier `raw_data` ni l'historique ;
9. le bundle initial et les temps d'interaction restent acceptables ;
10. toutes les validations exécutables ci-dessus sont vertes, ou le blocage exact est documenté.
