# Produit et workflow — BTM Topographic Adjustment

## Finalité

Créer dans BTM un nouveau type de processing, `Topographic Adjustment`, capable de préparer,
exécuter et exploiter une compensation topographique avec STAR*NET Ultimate. Il ne réutilise pas
le type `Theodolite` et ne demande jamais à l'utilisateur de charger des observations depuis la
page web : les valeurs Hz, Vz, Sd et, si disponibles, température/pression sont déjà dans
`raw_data` et sont reliées explicitement aux capteurs/prismes BTM.

La maquette Vercel valide l'expérience utilisateur et fournit des modules réutilisables. Elle
utilise des données de démonstration versionnées et un calcul scientifique de prévisualisation.
La vérité de production reste l'exécution STAR*NET 14 Ultimate sur le serveur Windows licencié.

## Résultat utilisateur attendu

Un utilisateur, quel que soit son niveau, peut :

- créer un ajustement pour une station unique ou un réseau connecté de stations ;
- choisir les cibles, références et relations entre points physiques ;
- résoudre les configurations de mesure par couple station–cible ;
- calculer ou fournir les coordonnées initiales ;
- tester une époque, diagnostiquer le réseau puis activer une configuration ;
- exécuter automatiquement ou manuellement des slots alignés sur une grille de sortie ;
- analyser les résidus, ellipses, déplacements et causes probables ;
- enregistrer un essai satisfaisant comme nouvelle version datée ;
- recalculer une période avec la configuration historiquement valable pour chaque slot.

Il n'existe pas de rôle « expert ». Le parcours principal reste compact et chaque zone propose
des détails ou options avancées accessibles à tous.

## Périmètre et limites

Inclus : parcours de création, administration, Analysis Lab, templates FR/UK, points physiques,
initialisation, corrections, synchronisation, catch-up, sorties stables, versions, préparation et
parsing STAR*NET, service Windows de pilote et jeux de validation synthétiques.

Non inclus dans la maquette : écriture dans la vraie base BTM, ordonnanceur de production,
gestion de licence STAR*NET à grande échelle, secrets de production, S3/Lambda pour STAR*NET,
CoMeT et import utilisateur de fichiers bruts.

## Parcours compact de création

Le parcours conserve neuf intentions fonctionnelles. Le design peut les présenter autrement si
la progression, la reprise du brouillon et les validations restent évidentes.

1. **General** — nom, description, portée station unique/réseau et template FR/UK. Le projet est
   déjà connu dans BTM et ne doit pas être redemandé.
2. **Stations** — sélection d'une station ou de plusieurs stations qui formeront un seul réseau
   connecté. Des groupes indépendants nécessitent des processings distincts.
3. **Instruments** — instrument par station et politique atmosphérique. Les configurations EDM,
   réflecteur, constante et hauteur appartiennent au couple station–cible, pas globalement à la
   station.
4. **Targets & Measurements** — sélection des cibles publiées, références et auxiliaires ;
   résolution des variables Hz/Vz/Sd ; configuration de mesure ; confirmation explicite des
   points physiques communs dans un réseau. **Groupé par station** comme les blocs du fichier
   natif, références d'abord, et chaque colonne est une valeur consommée par l'ajustement :
   constante de réflecteur et son Δ, hauteur de cible, nature de la distance stockée
   (inclinée/horizontale) et écarts-types. Le programme EDM (precise/fine/standard) n'est pas une
   décision : rien n'en dérive.
5. **Initialisation** — comment obtenir les coordonnées **approchées** : calcul depuis les
   coordonnées connues des références, saisie/import CSV, ou repère local en fixant une station
   XYZ et orientation. Les trois sont des outils de calcul : **fixer une station ici ne fixe rien
   dans les runs**. La fenêtre choisie sélectionne les observations ; ses médianes
   circulaires/linéaires produisent les rayons représentatifs. Afficher la couverture et les
   couples station–cible manquants. Les coordonnées ne deviennent les approximations du réseau
   qu'après acceptation explicite, et l'étape suivante reste verrouillée jusque-là.
6. **Adjustment** — **le référentiel de tous les runs** (chaque point, stations comprises, fixe /
   contraint par son σ / libre, comme les enregistrements `C` de STAR*NET), puis les paramètres
   STAR*NET, puis le test d'une époque — moteur de preview ou STAR*NET réel, même geste que le banc
   d'essai de l'Analysis Lab — sans publication. Un réseau dont rien n'est tenu est bloqué.
7. **Run** — event-driven ou toutes les X minutes, tolérance réseau, réutilisation d'une dernière
   mesure, statut provisoire et catch-up des données tardives.
8. **Output** — grille UTC de publication, cibles publiées et variables stables.
9. **Review & Create** — résumé des décisions, avertissements bloquants, création atomique du
   processing et de sa version 1 ; activation seulement après un test satisfaisant.

## Station unique et réseau

- Une station unique est un ajustement valide dans un repère local ou rattaché.
- Plusieurs stations sont admises uniquement si elles constituent un même réseau topographique.
- STAR*NET peut traiter plusieurs stations éloignées, mais des groupes non reliés ne forment pas
  un même réseau observable ; ils restent des processings séparés.
- La connectivité est établie par des points physiques communs confirmés, des références connues
  suffisantes ou des relations géométriques explicites. Elle n'est jamais déduite d'un nom seul.

## Identité physique des points

Un ID de prisme/capteur BTM identifie une entité de base, pas nécessairement un point physique.
Deux prismes de deux stations peuvent viser le même objet ; inversement `MPO001` ou `MP001` peut
désigner deux objets distincts. La configuration versionnée porte donc le mapping :

`station + prismSensorId + rawTargetName → targetBinding → physicalPointId → engineName`.

Règles :

- un point est individuel par défaut ; aucun rapprochement automatique par nom ;
- l'utilisateur peut fournir des paires communes manuelles ; deux paires 3D non confondues sont
  le minimum pratique pour rattacher deux nuages, une troisième paire bien répartie apporte la
  redondance recommandée ;
- l'assistant géométrique peut proposer des candidats après initialisation, mais rien n'est lié
  sans confirmation ;
- une proposition montre résidus horizontaux/verticaux en mm, confiance et preuve ;
- les mêmes noms associés à des points distincts sont montrés séparément et explicitement ;
- une ligne de base, distance, dénivelée, azimut-distance ou vecteur 3D connu peut compléter la
  géométrie sans prétendre que ses extrémités sont le même point ;
- les noms STAR*NET sont uniques dans un job, déterministes et internes. Les dossiers isolés par
  run empêchent toute collision entre processings simultanés.

## Mesures, instruments et corrections

Chaque `station × cible` possède une configuration de mesure : type `prism`,
`reflective-sheet` ou `reflectorless`, mode EDM, réflecteur, constante requise, constante déjà
appliquée, hauteur de cible et poids Hz/Vz/Sd. Un instrument peut donc mesurer dans un même cycle
des prismes différents, des feuilles et du laser sans prisme.

Chaîne appliquée une seule fois à la distance inclinée stockée :

1. `prismDelta = requiredConstant − alreadyAppliedConstant` ;
2. `distanceAfterPrism = storedSlopeDistance + prismDelta` ;
3. correction atmosphérique selon la politique résolue ;
4. facteurs datum/grille STAR*NET séparés ;
5. courbure/réfraction selon les paramètres d'ajustement.

`reflectorless` force le delta de prisme à zéro. Une constante inconnue pour un réflecteur bloque
ou demande une décision ; elle n'est pas assimilée silencieusement à zéro. `.SCALE` ne représente
jamais la correction atmosphérique.

Trois modes atmosphériques principaux sont visibles : déjà appliquée par la station, calculée à
partir de T/P du cycle, ou calculée à partir de valeurs T/P fixes. `None` est une décision
explicite. Si T/P sont absentes ou invalides : attendre/échouer, utiliser un fallback fixe,
continuer sans correction ou considérer déjà corrigé ; les chemins de secours peuvent marquer le
résultat provisoire et déclencher un catch-up quand les données arrivent.

## Initialisation et références

Deux méthodes :

- **coordonnées connues** : saisie ou CSV au format imposé, contraintes E/N/H fixed/weak/free et
  sigmas explicites ;
- **repère local** : fixer une station en XYZ et orientation (0/0/0/0 autorisé), agréger une
  période représentative puis rayonner/resectionner le réseau.

La période d'initialisation décrit les données utilisées, pas la validité des coordonnées. Leur
validité est celle de la version de configuration. Hz utilise une médiane/moyenne circulaire ;
Vz/Sd des médianes robustes. L'écran indique taux de points disponibles, observations retenues,
dispersion et échecs de rang/connectivité. Les coordonnées calculées deviennent des approximations
initiales, jamais des références « connues » inventées.

## Ajustement et qualité

Le traitement est 3D par défaut et expose au minimum convergence, rang, degrés de liberté, test
χ², facteur de variance, résidus standardisés, sigmas et ellipses de confiance. Un χ² non
applicable reste `not-applicable`, jamais converti en réussite.

Auto Adjust peut retirer progressivement une composante fautive jusqu'au seuil ou à la limite
configurée. Chaque tentative reste explicable. Une cible absente n'est pas ajustée. Le run vérifie
le nombre et la géométrie des références réellement présentes ; il ne déclare pas une solution
valide à partir d'un réseau déficient.

**Minimum de références : deux.** L'ajustement doit être tenu par de vraies références, fixes ou
contraintes/pondérées. Les coordonnées approchées calculées à l'initialisation ne sont **jamais**
comptées comme telles : avec une seule référence, un mouvement de ce point est indiscernable d'un
mouvement de tout le réseau. En dessous de deux références connues et contraintes, l'assistant
refuse d'avancer et un run **ne publie rien** : le cycle est sauté (`technical-error`, étape
`resolve`) plutôt que de produire une coordonnée invalidable.

Le solveur Python/TypeScript est un aperçu scientifique et un oracle de test. Seule la sortie
native STAR*NET du serveur licencié peut être présentée comme résultat de production.

## Temps, exécution et publication

Trois temps sont distincts :

- l'époque source de chaque observation dans `raw_data` ;
- le slot de sortie aligné (par exemple `00` et `30` minutes UTC) ;
- l'intervalle de validité `[validFrom, validTo[` de la configuration.

En event-driven, une arrivée déclenche l'évaluation du prochain slot. En réseau, le resolver
cherche une observation de chaque station dans la tolérance. Une dernière mesure peut être
réutilisée jusqu'à un âge maximal lorsque le site est supposé stable ; le résultat est alors
provisoire. Une donnée tardive peut déclencher un catch-up borné qui remplace le même slot.

Exemple : observations à 10:25, 10:26 et 10:32, sortie toutes les 30 minutes → publication à
10:30, jamais à 10:25/26/32. Le run journalise les observations fraîches, réutilisées ou manquantes.

## Sorties et versions

Par cible publiée : Adjusted X/Y/Z, Delta X/Y/Z par rapport aux coordonnées initiales et
Sigma X/Y/Z. Globalement : χ², facteur de variance, références présentes, disponibilité des
cibles et indicateurs provisoires/qualité nécessaires.

Une variable de sortie appartient au processing et conserve le même ID à travers les versions.
Un recalcul remplace la valeur pour `variable_id + timestamp` (UPSERT) ; `χ² not-applicable`
supprime toute ancienne valeur binaire correspondante. L'historique utile est la configuration et
le run, pas une duplication des séries finales.

Un processing contient plusieurs versions immuables en base. Un run normal utilise l'active ; un
recalcul ou catch-up utilise la version valide pour le slot historique, y compris archivée. Une
version utilisée n'est jamais supprimée. Modifier un processing crée un draft dérivé, puis une
activation datée après contrôle. Les fichiers STAR*NET sont régénérés pour chaque run puis le
dossier temporaire peut être supprimé après persistance des diagnostics nécessaires.

## Administration

La page principale donne directement accès à Create, Edit, Run now et Analysis Lab. Le détail
permet de parcourir versions, stations/mesures, identité des points, initialisation, ajustement,
run/synchronisation, sorties, runs, recalculs, analyse et audit. Les mêmes composants et contrats
sont réutilisés entre wizard et administration.

Le recalcul propose une période, résout la version par slot, montre un dry-run, exige une raison et
réutilise les variables existantes. L'Analysis Lab est défini dans
[`FRONTEND-AND-ANALYSIS-LAB.md`](FRONTEND-AND-ANALYSIS-LAB.md).
