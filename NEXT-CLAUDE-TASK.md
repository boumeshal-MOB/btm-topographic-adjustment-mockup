# Mission Claude Code — refactor UX libre et intégration des jeux de validation

Travaille dans ce repository et livre une seule Draft Pull Request fonctionnelle. Tu peux créer la
branche, committer, pousser et corriger la CI. Ne merge pas et ne déploie pas.

## Lecture minimale

1. `CLAUDE.md`
2. `PROJECT_MAP.md`
3. `docs/topographic-adjustment/FRONTEND-AND-ANALYSIS-LAB.md`
4. `docs/topographic-adjustment/VALIDATION-DATASETS.md`
5. `docs/topographic-adjustment/VALIDATION-AND-OPEN-DECISIONS.md`
6. `public/demo-datasets/v1/manifest.json` uniquement, puis un shard ciblé si nécessaire

Utilise Graphify pour localiser les composants et contrats. Inspecte le code et les tests concernés
avant de modifier. Ne lis pas tout le corpus et ne régénère pas les données : les 100 jeux et leur
générateur sont déjà fournis et vérifiés.

## Objectif

Transformer la maquette actuelle en une expérience plus claire, plus moderne et plus utile à un
géomètre, tout en conservant les fonctions et moteurs validés. Intégrer le catalogue de validation
pour pouvoir explorer et tester réellement les scénarios dans la maquette.

Tu as une liberté complète de conception. Ne reproduis pas l'interface actuelle et ne copie pas
visuellement STAR*NET. Garde ce qui fonctionne, remplace ce qui gêne et choisis la structure qui
sert le mieux le workflow. Les documents définissent les outcomes et invariants, pas un wireframe.

## Résultats attendus

### Catalogue de validation

- Navigateur léger basé sur `manifest.json`, avec filtres stations/scénario/template/isolé-combiné.
- Chargement à la demande d'un seul shard, validation et états loading/empty/error.
- Mode aveugle par défaut ; révélation explicite de l'oracle pour la recette.
- Conversion vers les repositories/snapshots existants, sans chemin scientifique parallèle.
- `BTM-VAL-041` comme cas réseau propre de référence.
- Un échantillon représentatif de chaque famille de défaut testable dans Analysis Lab ; stratégie
  de tests ciblée plutôt que 100 E2E identiques.

### Analysis Lab

Prends inspiration des capacités de STAR*NET : représentation du réseau, stations, lignes de
visée, sélection de mesures, résidus, sigmas et ellipses. Propose toutefois une interaction BTM
plus simple : l'utilisateur sélectionne une station, un prisme, un point ou une observation, puis
modifie des paramètres métier dans un inspecteur. Il ne modifie pas le texte du `.dat/.prj` ni une
grille de valeurs de preview déconnectée du domaine.

La carte, les indicateurs, une table Points unique et le détail des observations restent
synchronisés avec le trial sélectionné. La table commence par shared references, references et
shared points, puis stations/monitoring/auxiliaires ; elle contient initial, ajusté, ΔE/ΔN/ΔH/Δ3D,
sigmas, ellipse et résidu. La sélection d'une ligne de visée révèle ses faces et Hz/Vz/Sd.

Conserve la séparation explicite entre :

- mêmes points physiques observés sous des noms différents ;
- mêmes noms de cible appartenant à des points physiques distincts.

Toute modification invalide le résultat courant. Relancer crée un trial comparable. Sauvegarder
un résultat satisfaisant crée une version draft complète et datée ; aucune valeur source n'est
réécrite.

### Expérience générale

- Analysis Lab accessible directement depuis la page principale.
- Création, édition, run, versions et parcours FR/UK/réseau sans régression.
- Interface compacte avec options avancées, français/anglais, responsive et accessible.
- Suppression des tableaux/contrôles dupliqués et des résultats incohérents/stales.
- Détails STAR*NET téléchargeables/lisibles mais dérivés et en lecture seule.

## Contraintes de réalisation

- Préserve les moteurs Python/TypeScript et contrats actuels derrière leurs tests.
- Ne change une formule que si un test minimal prouve un défaut ; ajoute alors un test de parité.
- Ne charge pas les 12 Mo de catalogue au démarrage ni dans le bundle initial.
- Pas de secrets, déploiement, nouveau backend de production ou réécriture BTM.
- Ne commence pas une refonte architecturale sans bénéfice utilisateur démontrable.
- Les décisions visuelles et de composition t'appartiennent ; documente brièvement les principaux
  choix et leurs compromis dans la PR, pas dans un nouveau corpus de spécifications.

## Validation et livraison

Exécute les commandes de `CLAUDE.md`, dont la vérification byte-for-byte du catalogue. Ajoute des
tests de domaine/composant/E2E sur les comportements modifiés, teste les erreurs et la navigation
clavier, puis vérifie le build de production.

La PR doit présenter : outcome visible, périmètre, captures, architecture de chargement des shards,
tests exacts et résultats, limites restantes. Résous les conflits avec `main`, attends une CI verte,
laisse la PR en Draft et arrête-toi. Le propriétaire review, merge et déploie.
