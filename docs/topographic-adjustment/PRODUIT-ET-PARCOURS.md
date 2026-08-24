# Produit et parcours — BTM Topographic Adjustment

Ce que le processing doit permettre, écran par écran, et l'expérience visée. Les contrats, règles et
formules sont dans [`DOMAINE-ET-STARNET.md`](DOMAINE-ET-STARNET.md) ; ce qui est vérifié et ce qui
reste ouvert dans [`VALIDATION.md`](VALIDATION.md).

## Finalité

Créer dans BTM un nouveau type de processing, `Topographic Adjustment`, capable de préparer,
exécuter et exploiter une compensation topographique avec STAR*NET Ultimate. Il ne réutilise pas le
type `Theodolite` et ne demande jamais à l'utilisateur de charger des observations depuis la page
web : les valeurs Hz, Vz, Sd et, si disponibles, température/pression sont déjà dans `raw_data` et
reliées explicitement aux capteurs/prismes BTM.

La maquette Vercel valide l'expérience utilisateur et fournit des modules réutilisables. Elle
utilise des données de démonstration versionnées et un calcul scientifique de prévisualisation. La
vérité de production reste l'exécution STAR*NET 14 Ultimate sur le serveur Windows licencié.

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

Il n'existe pas de rôle « expert ». Le parcours principal reste compact et chaque zone propose des
détails ou options avancées accessibles à tous.

## Périmètre et limites

Inclus : parcours de création, administration, Analysis Lab, templates FR/UK, points physiques,
initialisation, corrections, synchronisation, catch-up, sorties stables, versions, préparation et
parsing STAR*NET, service Windows de pilote et jeux de validation synthétiques.

Non inclus dans la maquette : écriture dans la vraie base BTM, ordonnanceur de production, gestion
de licence STAR*NET à grande échelle, secrets de production, S3/Lambda pour STAR*NET, CoMeT et
import utilisateur de fichiers bruts.

## Principes d'interface

- Une action principale claire par vue ; détails progressifs, jamais un mur de paramètres.
- Aucun mode standard/expert : des sections `Advanced` repliables et recherchables.
- Valeurs résolues, unités, **source** et impact visibles au bon moment.
- Les erreurs indiquent la cause, les objets concernés et l'action possible.
- Le code couleur n'est jamais l'unique signal ; rôle et qualité ont texte/symbole/forme.
- Navigation clavier, focus visible, labels accessibles, contraste et responsive desktop/tablette.
- Français et anglais complets via i18n ; jargon géomètre naturel, pas une traduction littérale.
- États loading/empty/error/provisional/success et résultats obsolètes couverts.
- Pas de bouton mort ni de contrôle simulé présenté comme fonctionnel.
- **Un tableau énonce, un panneau édite.** Une station porte jusqu'à cent prismes : une ligne qui
  monte dix champs de formulaire ne peut être ni lue ni modifiée. Les valeurs sont denses et
  monospace, la modification passe par une sélection multiple ou un inspecteur latéral.

## Les neuf étapes de création

Le parcours conserve neuf intentions fonctionnelles. Le design peut les présenter autrement si la
progression, la reprise du brouillon et les validations restent évidentes.

### 1 · General

Nom, description, portée station unique/réseau et template FR/UK. Le projet est déjà connu dans BTM
et ne doit pas être redemandé. Un résumé compact montre la période observée, la dernière
observation, le volume, les cibles, les variables et la qualité des métadonnées.

### 2 · Stations

Les stations disponibles avec dernière observation, cibles, cycle, T/P et disponibilité. Une station
suffit pour `single-station` ; plusieurs doivent former un seul réseau connecté, et des groupes
indépendants nécessitent des processings distincts. Le texte ne prétend jamais que deux stations sont
reliées avant confirmation.

Sélectionner une station n'est pas un filtre : cela reconstruit la liste des visées, les points
communs et la proposition d'initialisation, parce que le graphe d'observation a changé.

### 3 · Instruments

Par station : l'instrument, sa hauteur, la politique atmosphérique et **la précision avec laquelle il
mesure**. Les trois choix atmosphériques principaux sont correction déjà appliquée, calcul T/P du
cycle, calcul T/P fixes ; `None` reste une décision explicite. La formule, les valeurs utilisées et
le chemin de fallback sont dans un détail, pas étalés par défaut.

La précision est ici parce que c'est ici qu'elle vit physiquement : un écart-type de distance est une
propriété de l'EDM **et de son réflecteur**, un écart-type angulaire une propriété de l'instrument.
Ni l'un ni l'autre n'est une propriété du projet. L'écran expose σ Hz, σ Vz, un couple mm + ppm par
famille de réflecteur, et la nature de la distance stockée (inclinée ou horizontale). Les valeurs
sont pré-remplies depuis le template du pays et chacune dit d'où elle vient.

Le réflecteur et sa constante restent résolus par couple station–cible à l'étape suivante.

### 4 · Targets & Measurements

Les cibles publiées, références et auxiliaires ; la résolution des variables Hz/Vz/Sd ; la
configuration de mesure ; et la confirmation explicite des points physiques communs dans un réseau.

**Groupé par station**, comme les blocs `DB … DE` du fichier natif, **références d'abord** : ce sont
les points qui porteront le référentiel, donc ce contre quoi une configuration est vérifiée avant
tout le reste. Chaque colonne est une valeur que l'ajustement consomme : réflecteur et état de sa
constante, hauteur de cible, σ de distance et σ angulaires résolus, nature de la distance, et
contrainte E/N/H. Le programme EDM (precise/fine/standard) n'est pas une décision : rien n'en dérive.

- **Le réflecteur vient du template du pays.** Le choisir écrit le réflecteur *et* ses deux
  constantes, donc elles ne peuvent pas se contredire. Le cas saisi à la main existe comme option
  explicite, pas comme chemin par défaut. La correspondance se fait sur les nombres et non sur
  l'identifiant stocké : une visée dont la constante a été retapée n'est plus ce réflecteur.
- **L'état de la constante tient en un mot** : appliquée par BTM avec son Δ, déjà appliquée sur le
  terrain (donc jamais réappliquée), ou aucune.
- **Les contraintes E/N/H se décident ici**, sur le prisme, avant l'ajustement. Fixe, contraint par
  son σ, ou libre — et libérer un point, c'est supprimer son enregistrement de coordonnée. Le
  référentiel de la station est dans l'en-tête de son bloc, où elle n'est jamais fixe : elle porte
  l'instrument, pas la référence.
- **Les σ suivent l'instrument** sauf si la visée est réellement mesurée autrement. Une valeur
  propre à une visée est signalée comme telle et reste comptable.
- **La modification se fait en lot.** On filtre, on sélectionne (case, plage au shift-clic, tout ce
  qui est visible), puis une barre écrit rôle, réflecteur, hauteur, σ, contrainte, ajustement ou
  publication sur toutes les lignes retenues. Un champ laissé vide n'est pas appliqué, et le nombre
  de lignes concernées est sur le bouton. Une visée seule s'édite en entier dans l'inspecteur.

Pour un réseau neuf, aucun point commun n'est préconfirmé. L'utilisateur saisit les premières paires
réelles ; après initialisation, une vérification peut aligner les nuages et proposer des paires dans
une tolérance en mm, modifiables avant confirmation. Les points confirmés sont séparés des autres
cibles, et les homonymes connus comme distincts sont montrés séparément afin d'éviter toute illusion
de mapping automatique.

Le panneau possède une aide **How matching works** qui sert aussi au diagnostic. Elle représente les
quatre étapes réellement exécutées : observations traitées de la fenêtre → nuages locaux 3D →
alignement par les paires amorces → recherche de candidats dans les tolérances. Après une analyse,
elle affiche les nombres de points disponibles pour chaque station, le nombre de paires demandées et
celui des paires réellement couvertes par une observation, les tolérances et l'étape d'arrêt.

Un nom présent dans la liste des cibles ne garantit pas qu'un point existe dans le nuage : il faut un
bloc traité complet `Hz/Vz/Sd` dans la fenêtre d'initialisation. Si moins de deux paires sont ainsi
couvertes, l'alignement ne démarre pas et les tolérances ne sont pas encore évaluées. Deux paires
valides donnent une géométrie faible sans redondance ; trois paires bien réparties ou davantage
permettent une proposition robuste. Dans tous les cas, le rapprochement reste une proposition et
requiert une confirmation explicite.

### 5 · Initialisation

Comment obtenir les coordonnées **approchées** : calcul depuis les coordonnées connues des
références (proposé en premier), saisie/import CSV, ou repère local en fixant une station XYZ et
orientation. Les trois sont des outils de calcul : **fixer une station ici ne fixe rien dans les
runs**.

La fenêtre choisie sélectionne les observations ; ses médianes circulaires/linéaires produisent les
rayons représentatifs. Elle décrit les données employées, pas la validité des coordonnées. Avant
calcul : nombre de cycles, couverture cible/station, couples manquants et dispersions. Après :
coordonnées, provenance et qualité. Les coordonnées ne deviennent les approximations du réseau
qu'après acceptation explicite, et l'étape suivante reste verrouillée jusque-là.

Le mode par défaut d'un brouillon neuf reste le repère local, parce qu'un brouillon vide ne connaît
aucune coordonnée et que démarrer sur un mode qui échouerait immédiatement serait pire.

### 6 · Adjustment

Trois choses, dans cet ordre.

1. **Le verdict du référentiel** — ce qui tient le réseau, en lecture seule, avec un renvoi vers
   l'étape qui en décide. Le verdict est ici parce que c'est l'écran qui lance un essai, et qu'un
   essai sur un réseau non tenu ne répond à rien ; et parce que le caractère *réel* d'une contrainte
   ne peut être jugé qu'après l'initialisation, qui se trouve entre les deux écrans.
2. **La précision des mesures** — les mêmes valeurs que l'étape Instruments, sur le même brouillon :
   les modifier ici les modifie là. Elles sont à découvert, pas dans une section avancée : c'est ce
   qui pèse chaque observation.
3. **Les paramètres STAR\*NET, puis le test d'une époque** — moteur de preview ou STAR*NET réel, même
   geste que le banc d'essai de l'Analysis Lab, sans publication. Chaque essai lancé est conservé
   avec la configuration qui l'a produit, et revenir à un essai restitue cette configuration telle
   quelle : un poids ne se juge pas seul, seulement contre ce qu'il fait à la solution.

Les centrages, la courbure, la réfraction, Auto Adjust et les défauts projet écrits dans le `.prj`
restent avancés. Un réseau dont rien n'est tenu est bloqué.

### 7 · Run

Event-driven ou toutes les X minutes, tolérance réseau, réutilisation d'une dernière mesure, statut
provisoire et catch-up des données tardives. Des exemples concrets expliquent fraîche, réutilisée,
manquante et provisoire.

### 8 · Output

Grille UTC de publication, cibles publiées et variables stables. L'écran prévisualise la grille et le
nombre exact de variables.

### 9 · Review & Create

Résumé des décisions, avertissements bloquants, création atomique du processing et de sa version 1.
Review compare la configuration résolue au template et ne bloque que sur des causes actionnables.
Créer sans activer est un cas réel : les deux actions sont deux boutons.

## Station unique et réseau

- Une station unique est un ajustement valide dans un repère local ou rattaché.
- Plusieurs stations sont admises uniquement si elles constituent un même réseau topographique.
- STAR*NET peut traiter plusieurs stations éloignées, mais des groupes non reliés ne forment pas un
  même réseau observable ; ils restent des processings séparés.
- La connectivité est établie par des points physiques communs confirmés, des références connues
  suffisantes ou des relations géométriques explicites. Elle n'est jamais déduite d'un nom seul.

## Identité physique des points

Un ID de prisme/capteur BTM identifie une entité de base, pas nécessairement un point physique. Deux
prismes de deux stations peuvent viser le même objet ; inversement `MPO001` ou `MP001` peut désigner
deux objets distincts. La configuration versionnée porte donc le mapping :

`station + prismSensorId + rawTargetName → targetBinding → physicalPointId → engineName`.

Règles :

- un point est individuel par défaut ; aucun rapprochement automatique par nom ;
- l'utilisateur peut fournir des paires communes manuelles ; deux paires 3D non confondues sont le
  minimum pratique pour rattacher deux nuages, une troisième bien répartie apporte la redondance
  recommandée ;
- l'assistant géométrique peut proposer des candidats après initialisation, mais rien n'est lié sans
  confirmation ;
- une proposition montre résidus horizontaux/verticaux en mm, confiance et preuve ;
- les mêmes noms associés à des points distincts sont montrés séparément et explicitement ;
- une ligne de base, distance, dénivelée, azimut-distance ou vecteur 3D connu peut compléter la
  géométrie sans prétendre que ses extrémités sont le même point ;
- les noms STAR*NET sont uniques dans un job, déterministes et internes. Les dossiers isolés par run
  empêchent toute collision entre processings simultanés.

## Mesures, instruments et corrections

Chaque `station × cible` possède une configuration de mesure : type `prism`, `reflective-sheet` ou
`reflectorless`, réflecteur, constante requise, constante déjà appliquée et hauteur de cible. Un
instrument peut donc mesurer dans un même cycle des prismes différents, des feuilles et du laser sans
prisme.

La **précision**, elle, se résout par une chaîne unique — `template pays → instrument de la station →
cette visée` — et chaque valeur affichée porte l'étape qui l'a énoncée. Une visée ne restate un
écart-type que si elle est réellement mesurée autrement. Les défauts projet (`defaultWeights`) restent
ce qui est écrit dans le `.prj`, pas ce qui pèse une observation.

Chaîne appliquée une seule fois à la distance inclinée stockée :

1. `prismDelta = requiredConstant − alreadyAppliedConstant` ;
2. `distanceAfterPrism = storedSlopeDistance + prismDelta` ;
3. correction atmosphérique selon la politique résolue ;
4. facteurs datum/grille STAR*NET séparés ;
5. courbure/réfraction selon les paramètres d'ajustement.

`reflectorless` force le delta de prisme à zéro. Une constante inconnue pour un réflecteur bloque ou
demande une décision ; elle n'est pas assimilée silencieusement à zéro. `.SCALE` ne représente jamais
la correction atmosphérique.

Si T/P sont absentes ou invalides : attendre/échouer, utiliser un fallback fixe, continuer sans
correction ou considérer déjà corrigé ; les chemins de secours peuvent marquer le résultat provisoire
et déclencher un catch-up quand les données arrivent.

## Initialisation et références

Deux méthodes :

- **coordonnées connues** : saisie ou CSV au format imposé, contraintes E/N/H fixe/contraint/libre et
  sigmas explicites ;
- **fixer une station** : la tenir en XYZ et orientation (0/0/0/0 autorisé), agréger une période
  représentative puis rayonner/resectionner le réseau. Ce n'est pas un « repère local » : la position
  tenue peut être la vraie position géoréférencée de la station comme une origine arbitraire, et dans
  les deux cas la station redevient libre dans les runs.

La période d'initialisation décrit les données utilisées, pas la validité des coordonnées. Leur
validité est celle de la version de configuration. Hz utilise une médiane/moyenne circulaire ; Vz/Sd
des médianes robustes. L'écran indique taux de points disponibles, observations retenues, dispersion
et échecs de rang/connectivité. Les coordonnées calculées deviennent des approximations initiales,
jamais des références « connues » inventées.

Fixer une station est un **dispositif de calcul**, pas un référentiel de run. Dès qu'un seul point est
contrôlé, la station est ajustée comme le reste du réseau ; elle ne reste tenue que si rien d'autre ne
tient le réseau, auquel cas la libérer laisserait la matrice normale singulière. Une station tenue dans
tous les runs épingle le réseau à son propre instrument.

Un point **observé** dont l'initialisation n'a produit aucune coordonnée entre libre à `0/0/0`, avec un
message qui dit d'où vient le zéro. L'écarter silencieusement faisait disparaître une observation
réellement faite, sans que personne puisse savoir pourquoi. Si une contrainte se trouve à plus d'un
kilomètre de l'approximation du même point, le référentiel et les coordonnées approchées ne sont pas
dans le même repère : l'écran le dit, parce que le solveur ne converge pas sur cette distance.

**L'initialisation est la seule source de coordonnées.** Un enregistrement de contrainte porte la
décision fixe/contraint/libre et le sigma déclaré, jamais les nombres : ceux-ci sont résolus à chaque
lecture, dans l'ordre `saisie à la main → déclarée par l'arpentage → calculée par l'initialisation`.
Un point qu'aucune des trois ne renseigne n'a **pas** de coordonnée — il l'affiche comme telle et ne
peut pas être contraint. Écrire un zéro à la place a produit un réseau épinglé à l'origine, une
solution dégénérée et un facteur de variance `NaN` remonté trois écrans plus loin.

## Ajustement et qualité

Un essai n'affiche jamais les chiffres d'un autre moteur que celui qui a tourné. Lancer un test remet
les résultats à zéro ; changer de moteur remet aussi les essais à zéro ; et avec STAR*NET rien n'est
affiché, enregistré ni marqué comme passé avant que le service ait répondu — générer les fichiers
d'entrée n'est pas un résultat. Le diagnostic numérique de l'aperçu n'est pas présenté sous un run
sous licence : ce sont les valeurs du listing STAR*NET qui sont affichées.

Le traitement est 3D par défaut et expose au minimum convergence, rang, degrés de liberté, test χ²,
facteur de variance, résidus standardisés, sigmas et ellipses de confiance. Un χ² non applicable reste
`not-applicable`, jamais converti en réussite.

Auto Adjust peut retirer progressivement une composante fautive jusqu'au seuil ou à la limite
configurée. Chaque tentative reste explicable. Une cible absente n'est pas ajustée. Le run vérifie le
nombre et la géométrie des références réellement présentes ; il ne déclare pas une solution valide à
partir d'un réseau déficient.

**Minimum de références : deux.** L'ajustement doit être tenu par de vraies références, fixes ou
contraintes. Les coordonnées approchées calculées à l'initialisation ne sont **jamais** comptées comme
telles : avec une seule référence, un mouvement de ce point est indiscernable d'un mouvement de tout
le réseau. En dessous de deux références connues et contraintes, l'assistant refuse d'avancer et un
run **ne publie rien** : le cycle est sauté (`technical-error`, étape `resolve`) plutôt que de produire
une coordonnée invalidable.

Le solveur Python/TypeScript est un aperçu scientifique et un oracle de test. Seule la sortie native
STAR*NET du serveur licencié peut être présentée comme résultat de production.

## Temps, exécution et publication

Trois temps sont distincts :

- l'époque source de chaque observation dans `raw_data` ;
- le slot de sortie aligné (par exemple `00` et `30` minutes UTC) ;
- l'intervalle de validité `[validFrom, validTo[` de la configuration.

En event-driven, une arrivée déclenche l'évaluation du prochain slot. En réseau, le resolver cherche
une observation de chaque station dans la tolérance. Une dernière mesure peut être réutilisée jusqu'à
un âge maximal lorsque le site est supposé stable ; le résultat est alors provisoire. Une donnée
tardive peut déclencher un catch-up borné qui remplace le même slot.

Exemple : observations à 10:25, 10:26 et 10:32, sortie toutes les 30 minutes → publication à 10:30,
jamais à 10:25/26/32. Le run journalise les observations fraîches, réutilisées ou manquantes.

## Sorties et versions

Par cible publiée **et par station** : Adjusted X/Y/Z, Delta X/Y/Z par rapport aux coordonnées
initiales et Sigma X/Y/Z. Les stations sont incluses parce qu'une station est libre pendant
l'ajustement : sa position bouge d'un run à l'autre comme celle d'un prisme, et ce mouvement est une
série. Globalement : χ², facteur de variance, références présentes, disponibilité des cibles et
indicateurs provisoires/qualité nécessaires.

L'étape Output n'annonce pas un compte de variables : elle les affiche, valorisées sur le cycle qui a
servi à construire l'ajustement (l'essai de l'étape Ajustement). Un compte ne dit pas si le delta de
P07 vaut deux millimètres ou deux mètres.

Une variable de sortie appartient au processing et conserve le même ID à travers les versions. Un
recalcul remplace la valeur pour `variable_id + timestamp` (UPSERT) ; `χ² not-applicable` supprime
toute ancienne valeur binaire correspondante. L'historique utile est la configuration et le run, pas
une duplication des séries finales.

Un processing contient plusieurs versions immuables en base. Un run normal utilise l'active ; un
recalcul ou catch-up utilise la version valide pour le slot historique, y compris archivée. Une
version utilisée n'est jamais supprimée. Modifier un processing crée un draft dérivé, puis une
activation datée après contrôle. Les fichiers STAR*NET sont régénérés pour chaque run puis le dossier
temporaire peut être supprimé après persistance des diagnostics nécessaires.

## Administration

La page principale liste les processings et donne directement `Edit`, `Run now`, `Analysis Lab`,
activate/deactivate, duplicate et archive. Les brouillons du wizard restent reprenables.

`Edit` charge une copie complète de la version active/dernière dans le wizard. Sauvegarder crée une
nouvelle version ; les mappings et variables de sortie existants restent stables. Le détail d'un
processing présente synthèse/runs, timeline des configurations, paramètres résolus, sorties et
reprocessing sans recopier les mêmes formulaires en variantes divergentes.

Le recalcul propose une période, résout la version par slot, montre un dry-run, exige une raison et
réutilise les variables existantes.

## Analysis Lab

Le laboratoire doit permettre de comprendre pourquoi un ajustement réussit ou échoue, d'essayer une
correction scientifiquement traçable puis d'enregistrer la configuration retenue. Il ne doit pas
devenir un éditeur de fichier `.dat/.prj` ni une grille où l'utilisateur change des nombres bruts sans
savoir à quel objet ils appartiennent.

### Entrée et mode aveugle

Depuis la page principale ou un processing : choisir version et époque/jeu de validation. La version
active et le dernier slot sont proposés. Pour les jeux synthétiques, le mode aveugle cache la vérité
et le type d'anomalie ; révéler la réponse attendue est une action explicite destinée à la recette.

### Espace d'analyse unifié

La disposition exacte est libre, mais les sélections doivent rester synchronisées :

- **carte E/N** avec stations, références, points de suivi, points physiques partagés, ellipses et
  lignes de visée ; symboles distincts pour les rôles et double auréole pour les points partagés ;
- sélection d'une station, d'un point, d'un prisme ou d'une ligne de visée depuis la carte ou la
  table ; surbrillance réciproque et inspecteur commun ;
- filtres par rôle, station, composante Hz/Vz/Sd, état, résidu et exclusion ;
- exagération des ellipses/déplacements clairement affichée comme visuelle ;
- **une seule table Points** : shared references, references, autres shared points, stations,
  monitoring puis auxiliaires ; identité, observé depuis, contrôle, initial E/N/H, ajusté E/N/H,
  ΔE/ΔN/ΔH/Δ3D en mm, sigmas, ellipse, observations et max résidu standardisé ;
- détail des observations de la sélection avec valeur, sigma, résidu, redondance, setup et trace des
  corrections.

Il ne doit pas subsister un tableau « résultats » et un autre tableau « références » qui montrent des
valeurs différentes pour le même essai. Carte, indicateurs, points et observations changent ensemble
quand l'essai sélectionné change.

### Banc d'essai

Le lancement d'un essai est **un seul bloc, placé sous la table d'observations** : on édite vers le
bas et on lance là où la réponse apparaît. Le bloc enchaîne toujours les mêmes étapes, quel que soit
le moteur : ce qui va tourner, avec quel moteur, un unique bouton, puis le résultat et les fichiers
natifs.

- **Les deux moteurs se pilotent identiquement.** Le moteur de preview et le STAR\*NET licencié
  partagent le bouton, la ligne d'étapes, le bandeau de résultat et les onglets de fichiers ; le
  résultat natif est projeté sur le même contrat de diagnostic. En mode réel, le bouton teste le
  service puis soumet : un clic, comme pour la preview.
- **Le transport vit dans `useStarNetExecution`**, partagé par le banc et le détail d'un run. Une
  deuxième copie du polling, des chronos et des contrôles d'appartenance est exactement là où les deux
  écrans divergeraient.
- **Pas de modale de confirmation** : la liste avant → après se lit en place, au-dessus du bouton.
- **Les fichiers natifs sont un aide-lecture, pas un parseur** : `native-highlight.ts` type les jetons
  décisifs (`!` fixé, `*` libre, écarts-types, valeurs BTM du `.prj`, verdicts du `.lst`) et marque les
  lignes à lire en premier. Le texte copié ou téléchargé reste l'original, et la couleur n'est jamais
  le seul signal — une légende nomme chaque rôle.

### Modification simple par objet métier

Le geste principal est : sélectionner l'objet sur la carte ou la table, modifier dans l'inspecteur,
puis relancer. Les contrôles sont adaptés au type sélectionné :

- **prisme/target binding** : inclure/exclure, rôle, setup, hauteur, constante, σ Hz/Vz/Sd,
  publication et identité physique ;
- **mesure ou composante** : inclure/protéger, sigma, marqueur de revue ; une valeur Hz/Vz/Sd peut
  être surchargée temporairement pour diagnostic, avec valeur source conservée ;
- **référence** : fixe/contraint/libre par E/N/H, coordonnée et sigma ;
- **station** : coordonnées/orientation initiales, hauteur, instrument et politique T/P ;
- **ligne de visée** : ses composantes, résidus, setup et correction appliquée ;
- **ajustement** : seuils, centrages, courbure/réfraction, pondération et Auto Adjust.

Ne pas demander à l'utilisateur d'éditer le texte du preview STAR*NET. `.dat/.prj` restent un artefact
dérivé en lecture seule pour audit/téléchargement. Une modification temporaire de mesure ne réécrit
jamais `raw_data`.

### Essais

- L'essai 0 est la baseline immuable.
- Toute modification crée un état non calculé/obsolète ; les anciennes valeurs ne sont pas présentées
  comme le résultat des nouveaux paramètres.
- Relancer utilise le même snapshot pour le preview Python et STAR*NET.
- Le comparateur montre convergence, rang, dof, χ², variance, max |v|/σ, exclusions et deltas.
- Sélectionner un essai restaure paramètres, carte, tableau, résidus et explication.
- Les suggestions automatiques restent des hypothèses ; une référence déplacée, une vibration de
  station et une faute isolée ne doivent pas être confondues sans preuve.
- Avertir quand un succès provient surtout de sigmas gonflées, trop d'exclusions, références libérées,
  dof faibles ou ellipses dégradées.

### Enregistrement

Un essai convergé, plein rang, acceptable et encore à jour peut devenir une **nouvelle version draft
datée**. La sauvegarde est globale, pas une série de cases qui pourraient oublier une partie du
snapshot. Elle contient les nouvelles coordonnées initiales des points libres, les contraintes des
références, les setups/poids effectifs, les paramètres, les exclusions, les mappings et le reste
hérité. La raison et `validFrom` sont obligatoires. L'activation est séparée et les anciens runs
restent immuables.

## Critères UX de recette

- Un nouveau venu termine le parcours station unique sans ouvrir les options avancées.
- Un géomètre peut retrouver chaque paramètre STAR*NET utile et sa provenance.
- Une station de cent prismes se lit et se configure sans faire défiler mille champs.
- Un réseau ne paraît jamais connecté avant confirmation des points/contraintes.
- Une anomalie du catalogue peut être explorée sans lire de JSON ou modifier un fichier.
- Une sélection carte ↔ ligne de visée ↔ observation est cohérente et réversible.
- Changer un poids, une référence ou un setup invalide le résultat et met à jour le prochain essai.
- Le même écran fonctionne en français et en anglais, avec unités et termes métier corrects.
- Les moteurs existants restent derrière leurs contrats ; un refactor visuel ne duplique pas les
  formules dans les composants.
