Travaille sur le dépôt GitHub :

`boumeshal-MOB/btm-topographic-adjustment-mockup`

## Objectif global

Créer et intégrer dans la maquette une bibliothèque de **100 jeux de données topographiques synthétiques, réalistes, reproductibles et mathématiquement vérifiables**, destinée à tester :

- l’initialisation des coordonnées ;
- l’ajustement d’une station seule ;
- l’ajustement d’un réseau connecté de plusieurs stations ;
- les points physiques communs ;
- les références ;
- les corrections de distance ;
- la réduction Cercle I / Cercle II ;
- le diagnostic des mauvaises observations ;
- le déplacement d’une référence ;
- l’instabilité temporaire d’une station ;
- l’Analysis Lab ;
- la comparaison entre le moteur mathématique interne et STAR\*NET 14 Ultimate.

Les jeux doivent être accessibles directement depuis l’application déployée sur Vercel. Ils sont exclusivement destinés à la démonstration, aux tests et à la validation scientifique. Ils ne doivent pas être intégrés au futur flux de données réel de BTM.

Ne merge pas et ne déploie pas la PR. Crée une branche dédiée, ouvre une Draft PR et fournis le lien de preview Vercel si l’intégration du dépôt le permet.

## 1. Principe scientifique fondamental

Ne génère jamais directement des valeurs Hz, Vz et Sd indépendantes ou aléatoires.

Chaque jeu doit être construit dans cet ordre :

1. Générer une géométrie vraie :
   - coordonnées des stations ;
   - orientations des stations ;
   - hauteurs d’instrument ;
   - coordonnées des points physiques ;
   - hauteurs de prisme ;
   - identités physiques partagées ;
   - références et contraintes.
2. Calculer les observations théoriques exactes depuis cette géométrie.
3. Appliquer les modèles physiques configurés :
   - constante de prisme ;
   - correction atmosphérique ;
   - courbure terrestre et réfraction ;
   - conversion distance inclinée/horizontale ;
   - Cercle I/Cercle II.
4. Ajouter un bruit instrumental réaliste et déterministe.
5. Injecter ensuite, uniquement dans les scénarios concernés, une anomalie contrôlée.
6. Conserver séparément :
   - la vérité terrain ;
   - les observations exactes ;
   - les observations bruitées ;
   - les observations fautées ;
   - le résultat attendu ;
   - les tolérances d’acceptation.

La même seed doit toujours reproduire exactement les mêmes fichiers.

Les valeurs synthétiques ne doivent jamais être présentées comme des mesures réellement effectuées sur un chantier.

## 2. Commencer par analyser le dépôt

Avant toute modification :

1. Lire `CLAUDE.md`.
2. Utiliser `PROJECT_MAP.md` et Graphify s’ils existent.
3. Identifier :
   - les contrats de données actuels ;
   - le modèle `raw_data` ;
   - les types TypeScript ;
   - le générateur de fixtures existant ;
   - le moteur Python existant ;
   - le moteur TypeScript éventuel ;
   - les repositories ;
   - l’Analysis Lab ;
   - l’intégration STAR\*NET Windows ;
   - les tests et commandes de validation.
4. Réutiliser les composants et contrats existants.
5. Ne pas créer un troisième moteur de calcul concurrent.
6. Adapter l’architecture proposée ci-dessous lorsqu’une solution déjà présente est meilleure.

Si un exemple de format supplémentaire est fourni ultérieurement, créer un adaptateur vers le format canonique. En attendant, les contrats présents dans le dépôt sont la référence.

## 3. Répartition exacte des 100 jeux

Créer exactement 20 jeux pour chaque taille :

| Stations | Jeux |
| ---: | ---: |
| 1 | 20 |
| 2 | 20 |
| 3 | 20 |
| 4 | 20 |
| 5 | 20 |
| **Total** | **100** |

Répartir les scénarios principaux ainsi :

| Scénario principal | Jeux |
| --- | ---: |
| Réseau sain sans faute injectée | 12 |
| Référence déplacée | 14 |
| Vibration ou instabilité temporaire de station | 14 |
| Erreur grossière Hz | 6 |
| Erreur grossière Vz | 6 |
| Erreur grossière Sd | 6 |
| Correction atmosphérique | 12 |
| Courbure terrestre et réfraction | 10 |
| Distance horizontale/inclinée | 10 |
| Cercle I/Cercle II | 10 |
| **Total** | **100** |

Contraintes de couverture :

- 80 jeux avec un phénomène principal isolé ;
- 20 jeux avec un phénomène principal et une anomalie secondaire documentée ;
- chaque jeu conserve un résultat principal attendu non ambigu ;
- niveaux de difficulté : facile, intermédiaire, difficile ;
- aucun scénario ne doit être limité à une seule taille de réseau ;
- inclure des cas limites sans rendre la majorité des jeux artificiellement pathologiques.

## 4. Géométrie de chaque jeu

### Stations

- Entre 1 et 5 stations.
- Une station seule constitue un ajustement mono-station, pas un réseau.
- Pour 2 à 5 stations, le graphe du réseau doit être connecté.
- Chaque liaison utilisée pour rattacher deux groupes de stations doit disposer de 2 à 6 points physiques communs.
- Deux points communs représentent une géométrie minimale et fragile.
- Utiliser généralement au moins 3 points communs bien distribués.
- Inclure quelques cas avec seulement 2 points pour vérifier les avertissements de faible redondance.
- Éviter les configurations parfaitement colinéaires, sauf dans un jeu explicitement destiné à tester une mauvaise géométrie.

### Cibles et références

Pour chaque station :

- maximum 30 cibles observées au total ;
- distance station-cible comprise entre 3 m et 100 m ;
- 3 à 6 références ;
- les références, points communs et points de suivi font partie de cette limite de 30 ;
- un point peut être à la fois une référence et un point partagé, mais ses rôles doivent être explicites ;
- les références doivent normalement être suffisamment réparties en distance, azimut et hauteur.

### Identité physique

L’identité d’un point commun doit être explicite.

Ne jamais déduire automatiquement qu’il s’agit du même point uniquement parce que deux cibles portent le même nom.

Inclure des tests où :

- deux identifiants BTM différents représentent le même point physique ;
- deux cibles portant un nom similaire représentent des points physiques différents ;
- les noms locaux de stations ou de prismes se répètent entre plusieurs jeux ;
- l’identifiant destiné à STAR\*NET reste unique dans le dossier d’un run ;
- le mapping Physical Point ↔ cible/prisme BTM est conservé dans la configuration du jeu.

## 5. Modèle des observations

Gérer au minimum :

- Hz : direction horizontale ;
- Vz : angle zénithal ;
- Sd : distance inclinée ;
- éventuellement Hd : distance horizontale explicitement déclarée ;
- température ;
- pression ;
- timestamp ;
- station ;
- cible BTM ;
- point physique ;
- cycle ;
- série ;
- Cercle I ou Cercle II ;
- hauteur d’instrument ;
- hauteur de cible ;
- type de réflecteur ;
- constante de prisme ;
- état des corrections déjà appliquées.

Conventions obligatoires :

- définir clairement si l’azimut est compté depuis le Nord dans le sens horaire ;
- définir l’unité angulaire : degrés ou gon ;
- utiliser une seule convention interne canonique ;
- convertir explicitement à l’import/export ;
- ne jamais mélanger angle vertical et angle zénithal.

Pour une convention zénithale :

- composante horizontale : `H = Sd × sin(Vz)` ;
- composante verticale de la ligne de visée : `dZ = Sd × cos(Vz)` ;
- avec un azimut compté depuis le Nord :
  - `dE = H × sin(Azimut)` ;
  - `dN = H × cos(Azimut)`.

Les hauteurs d’instrument et de prisme doivent être appliquées une seule fois, avec une convention documentée et testée.

## 6. Bruit instrumental

Chaque template doit déclarer son modèle stochastique :

- précision Hz ;
- précision Vz ;
- précision de distance sous la forme constante + ppm ;
- erreur de centrage ;
- erreur de mise en station ;
- erreur de hauteur d’instrument ;
- erreur de hauteur de prisme ;
- éventuelles corrélations ou erreurs communes à une série.

Utiliser un générateur déterministe, par exemple `numpy.random.Generator` avec `PCG64`.

Le bruit doit être réaliste et compatible avec les instruments des templates FR et UK déjà documentés dans le dépôt.

Pour les cas propres, sélectionner des seeds donnant un comportement statistique attendu et stable. Ne pas créer de tests CI aléatoires ou intermittents.

## 7. Scénarios à injecter

### 7.1 Référence déplacée de 2 à 3 mm

Créer une époque stable, une époque fautée et, lorsque pertinent, une époque de retour à la normale.

Dans l’époque fautée :

- déplacer physiquement une référence de 2,0 mm, 2,5 mm ou 3,0 mm ;
- appliquer le déplacement en E, N, H ou suivant un vecteur 3D ;
- conserver dans la configuration les anciennes coordonnées de référence ;
- recalculer les observations depuis la nouvelle position physique ;
- conserver le déplacement réel dans la vérité terrain.

La géométrie et les poids doivent rendre le déplacement détectable dans les cas annoncés comme détectables.

Le résultat attendu doit préciser :

- la référence fautive attendue ;
- son classement parmi les suspects ;
- les résidus attendus ;
- l’impact sur le χ² ;
- l’impact sur le facteur de variance ;
- la différence entre référence fixe, faiblement contrainte et libre.

Inclure quelques cas difficiles où les données permettent de détecter une incohérence, mais pas d’attribuer avec certitude la cause au mouvement de la référence. L’interface doit alors afficher « anomalie détectée, cause ambiguë ».

### 7.2 Vibration causée par le passage d’un train

Modéliser une perturbation temporaire et corrélée dans le temps :

- petit déplacement ou rotation temporaire de la station ;
- perturbation appliquée à plusieurs visées successives pendant une fenêtre temporelle ;
- retour à la position nominale après le passage ;
- timestamps permettant d’identifier la séquence.

Ne pas simuler une vibration comme une simple erreur indépendante sur une seule valeur.

Tester :

- vibration affectant plusieurs cibles ;
- vibration affectant principalement des références ;
- vibration sur un seul cercle ;
- vibration sur les deux cercles ;
- vibration durant une fraction seulement d’une série.

Si une seule observation d’une référence est affectée, ne pas exiger que le moteur distingue avec certitude :

- référence déplacée ;
- vibration de station ;
- mauvaise mesure isolée.

Dans ce cas, le résultat correct est une détection accompagnée d’hypothèses, pas une fausse certitude.

### 7.3 Mauvaise mesure Hz, Vz ou Sd

Créer des fautes isolées et identifiables :

- biais positif et négatif ;
- erreur sur Cercle I seulement ;
- erreur sur Cercle II seulement ;
- erreur identique sur les deux cercles ;
- erreur sur une référence ;
- erreur sur un point de suivi ;
- erreur à courte et longue distance.

Conserver :

- composante fautée ;
- valeur nominale ;
- valeur injectée ;
- amplitude ;
- observation exacte concernée ;
- résultat diagnostique attendu.

### 7.4 Correction atmosphérique

Tester séparément :

1. distance déjà corrigée par la station ;
2. distance brute avec correction BTM activée ;
3. distance brute avec correction BTM désactivée ;
4. température/pression manquantes ;
5. température/pression invalides ;
6. politique de repli par valeurs fixes ;
7. politique « ne pas corriger ce cycle ».

La formule doit être liée au modèle d’instrument choisi et provenir de la documentation officielle du fabricant ou de la documentation validée du projet.

Ne pas inventer une formule atmosphérique universelle.

Pour générer une distance brute :

1. partir de la distance géométrique vraie ;
2. calculer le PPM attendu avec le modèle sélectionné ;
3. inverser exactement la correction afin d’obtenir la distance brute simulée ;
4. vérifier qu’une nouvelle application de la correction retrouve la distance attendue.

Stocker par cycle :

- température réelle ;
- pression réelle ;
- PPM théorique ;
- distance brute ;
- distance corrigée attendue ;
- état des données météo ;
- politique appliquée.

Prévoir des conditions atmosphériques produisant un effet mesurable aux distances disponibles, sans utiliser de valeurs physiquement absurdes.

Comparer explicitement les résultats avant et après correction.

### 7.5 Courbure terrestre et réfraction

Créer des cas avec des visées proches de 90 à 100 m, une précision verticale suffisante et plusieurs répétitions.

Tester :

- correction activée ;
- correction désactivée ;
- coefficient de réfraction configuré ;
- coefficient nul ;
- cohérence avec l’export STAR\*NET.

L’effet à 100 m reste faible. Ne pas fabriquer un déplacement centimétrique pour rendre le test spectaculaire.

Séparer strictement :

- échelle/datum ;
- constante de prisme ;
- atmosphère ;
- courbure terrestre ;
- réfraction.

### 7.6 Distance inclinée et distance horizontale

Chaque observation doit déclarer explicitement son type.

Tester :

- vraie distance inclinée ;
- vraie distance horizontale ;
- conversion correcte avec Vz ;
- distance horizontale incorrectement déclarée comme inclinée ;
- distance inclinée incorrectement déclarée comme horizontale ;
- Vz manquant lorsque la conversion est nécessaire.

Le logiciel ne doit jamais choisir silencieusement un type de distance.

Afficher dans le diagnostic l’interprétation utilisée et les conséquences d’une mauvaise interprétation.

### 7.7 Cercle I / Cercle II

Générer Cercle I et Cercle II depuis la même ligne de visée physique.

Inclure :

- défaut de collimation horizontal ;
- défaut d’index vertical ;
- bruit propre à chaque cercle ;
- observation complète sur deux cercles ;
- Cercle II manquant ;
- erreur sur un seul cercle ;
- directions proches de 0°/360° ou 0 gon/400 gon.

La réduction doit :

- normaliser correctement Cercle II ;
- utiliser une moyenne circulaire ;
- ne jamais faire une moyenne arithmétique incorrecte autour de 0°/360° ;
- conserver les observations brutes ;
- conserver séparément l’observation réduite ;
- expliquer quelle observation a été retenue.

Comparer le comportement avec les règles de normalisation de STAR*NET. STAR*NET documente la normalisation automatique des observations Face II et la directive `.NORMALIZE ON|OFF`. Les séries d’angles peuvent combiner les observations Face I et Face II dans une même série.

## 8. Structure des données

Adapter la structure exacte aux schémas déjà présents dans le dépôt.

Le format canonique doit néanmoins pouvoir représenter :

- `schemaVersion` ;
- `datasetId` ;
- `seed` ;
- titre et description ;
- nombre de stations ;
- scénario principal ;
- anomalies secondaires ;
- difficulté ;
- unités et conventions ;
- géométrie vraie ;
- stations vraies ;
- orientations vraies ;
- points physiques vrais ;
- bindings vers les cibles BTM ;
- configuration d’ajustement ;
- cycles et timestamps ;
- observations brutes ;
- observations Cercle I/Cercle II ;
- état de chaque correction ;
- faute injectée ;
- diagnostics attendus ;
- tolérances numériques ;
- provenance des formules et paramètres.

Séparer au minimum :

- les entrées visibles par le moteur ;
- la vérité terrain ;
- les résultats attendus.

Le mode aveugle de l’Analysis Lab ne doit pas révéler l’anomalie avant l’exécution.

Produire également :

- un export compatible avec le modèle BTM `raw_data` ;
- le mapping explicite des variables ;
- si utile, un export CSV ;
- les fichiers STAR\*NET à travers les générateurs existants du dépôt.

Ne pas maintenir manuellement une deuxième version `.dat/.prj` des mêmes données si elle peut être générée à la demande.

## 9. Publication dans la maquette

Stocker les fixtures de démonstration séparément du flux de données réel.

Prévoir :

- un manifeste léger listant les 100 jeux ;
- un chargement paresseux d’un jeu à la demande ;
- aucune inclusion des 100 jeux dans le bundle JavaScript principal ;
- aucune dépendance à une base BTM réelle ;
- aucune saisie de fichier depuis la page de production ;
- aucun secret STAR\*NET dans GitHub, les fixtures ou le navigateur.

Une organisation possible, à adapter au dépôt :

```
public/demo-datasets/
  manifest.json
  DS-001/
    input.json
    truth.json
    expected.json
  DS-002/
    ...

```

Le manifeste doit permettre de filtrer par :

- nombre de stations ;
- scénario ;
- difficulté ;
- nombre de points communs ;
- nombre de références ;
- présence de Cercle I/Cercle II ;
- état atmosphérique ;
- résultat χ² attendu ;
- détectabilité attendue.

## 10. Refonte ciblée de l’Analysis Lab

L’Analysis Lab doit devenir l’interface principale de validation des 100 jeux.

### Accès

- Rendre l’Analysis Lab accessible depuis la page principale.
- Ajouter une entrée claire « Laboratoire d’analyse ».
- Conserver aussi l’accès depuis un processing.

### Catalogue des jeux

Ajouter :

- recherche ;
- filtres ;
- résumé du scénario ;
- aperçu de la géométrie ;
- statistiques du réseau ;
- bouton « Charger ce jeu » ;
- bouton « Jeu suivant ».

### Mode aveugle

Par défaut, masquer :

- la faute injectée ;
- le point fautif ;
- l’amplitude ;
- le diagnostic attendu.

Après le calcul, proposer « Révéler la vérité terrain ».

### Exécution

Permettre depuis le même écran :

- exécution avec le moteur scientifique interne ;
- exécution avec STAR\*NET lorsque le service est disponible ;
- affichage explicite « STAR\*NET non exécuté » si le service ne répond pas ;
- comparaison de plusieurs essais ;
- modification des paramètres ;
- nouvelle exécution sans perdre l’essai précédent.

Ne jamais simuler un faux résultat STAR\*NET.

### Paramètres testables

Permettre notamment d’activer/désactiver :

- correction atmosphérique ;
- constante de prisme ;
- courbure/réfraction ;
- interprétation Sd/Hd ;
- réduction Cercle I/Cercle II ;
- poids Hz/Vz/Sd ;
- poids des références ;
- exclusion d’une observation ;
- Auto Adjust.

### Tableau unique des points

Fusionner les tableaux actuels en un seul tableau synchronisé avec l’essai sélectionné.

Ordre d’affichage :

1. références partagées ;
2. références ;
3. autres points partagés ;
4. stations ;
5. points de suivi.

Colonnes minimales :

- point ;
- rôle ;
- point physique ;
- station(s) observatrice(s) ;
- coordonnées initiales ;
- coordonnées ajustées ;
- ΔE, ΔN, ΔH et Δ3D ;
- σE, σN, σH ;
- ellipse de confiance ;
- nombre d’observations ;
- résidu normalisé maximum ;
- état inclus/exclu ;
- vérité terrain après révélation ;
- erreur par rapport à la vérité après révélation.

Les valeurs doivent toujours correspondre à l’essai actuellement sélectionné.

### Diagnostic des observations

Ajouter une vue permettant de filtrer par :

- station ;
- cycle ;
- série ;
- Cercle I/Cercle II ;
- point ;
- composante Hz/Vz/Sd ;
- observation retenue ou exclue.

Afficher :

- résidu ;
- résidu standardisé ;
- poids ;
- contribution au χ² ;
- timestamp ;
- groupe temporel ;
- classement des observations suspectes.

### Comparaison des essais

Pour chaque essai, afficher :

- moteur utilisé ;
- convergence ;
- rang ;
- degrés de liberté ;
- χ² ;
- facteur de variance ;
- résidu standardisé maximal ;
- références disponibles ;
- taux de disponibilité des cibles ;
- observations exclues ;
- paramètres modifiés ;
- différence par rapport au baseline ;
- différence par rapport à la vérité terrain après révélation.

Prévoir les actions :

- « Reprendre les paramètres de cet essai » ;
- « Comparer au baseline » ;
- « Appliquer la correction recommandée » ;
- « Relancer » ;
- « Sauvegarder comme version candidate ».

La sauvegarde crée une nouvelle version brouillon de configuration. Elle ne modifie jamais les observations brutes ni une version historique.

### Tableau de bord des 100 jeux

Ajouter une exécution par lot avec :

- progression ;
- réussite/échec ;
- moteur utilisé ;
- temps de calcul ;
- diagnostic attendu ;
- diagnostic obtenu ;
- conformité numérique ;
- lien vers le détail du jeu.

Une exécution par lot ne doit pas envoyer automatiquement les 100 jeux vers le service Windows STAR\*NET sans confirmation explicite.

## 11. Oracle mathématique indépendant

Utiliser de préférence Python pour :

- le générateur géométrique ;
- les modèles physiques ;
- l’oracle de validation ;
- les tests scientifiques.

Réutiliser le package Python déjà présent s’il existe.

L’oracle ne doit pas simplement appeler le même code que le moteur testé. Il doit fournir une vérification indépendante des coordonnées et des observations.

Ajouter des tests analytiques simples calculables à la main pour :

- rayonnement ;
- conversion Sd/Hd ;
- azimut ;
- angle zénithal ;
- hauteurs instrument/prisme ;
- correction atmosphérique ;
- courbure/réfraction ;
- normalisation Cercle II ;
- moyenne circulaire ;
- résidus et χ².

## 12. Comparaison avec STAR\*NET

Utiliser les générateurs et lecteurs STAR\*NET déjà présents.

Pour un échantillon représentatif puis, si le service est disponible, pour l’ensemble compatible :

1. générer `.dat` et le projet depuis la configuration canonique ;
2. lancer STAR\*NET dans un dossier de run isolé ;
3. lire les sorties natives ;
4. comparer les coordonnées, résidus et indicateurs ;
5. distinguer :
   - égalité de modèle ;
   - différence de convention ;
   - différence de pondération ;
   - courbure/réfraction ;
   - arrondi ;
   - fonction propre à STAR\*NET.

Ne jamais exiger une égalité bit à bit entre deux moteurs différents.

Définir des tolérances documentées par jeu.

Conserver la clé du service uniquement en mémoire de l’onglet, conformément au comportement actuel. Ne jamais la publier ni la sauvegarder.

## 13. Critères d’acceptation scientifiques

Le travail est accepté seulement si :

- les 100 jeux sont présents ;
- la distribution 20/20/20/20/20 est vérifiée automatiquement ;
- toutes les distances station-cible sont comprises entre 3 m et 100 m ;
- aucune station n’observe plus de 30 cibles ;
- chaque station possède 3 à 6 références ;
- chaque réseau multi-station est connecté ;
- les liaisons réseau utilisent 2 à 6 points communs ;
- un jeu mono-station ne prétend pas avoir des points communs réseau ;
- toutes les observations dérivent d’une vérité géométrique ;
- la régénération est déterministe ;
- les conventions sont explicites ;
- les données fautées sont générées après les données nominales ;
- la vérité terrain n’est pas transmise au moteur pendant le calcul ;
- les cas sans anomalie convergent dans les tolérances prévues ;
- les anomalies détectables apparaissent dans le classement attendu ;
- les cas ambigus ne produisent pas une fausse explication certaine ;
- la correction attendue améliore effectivement les indicateurs concernés ;
- Cercle I/Cercle II est correctement réduit autour de 0°/360° ;
- Sd et Hd ne sont jamais confondues silencieusement ;
- les corrections atmosphériques sont vérifiées par des valeurs attendues indépendantes ;
- la comparaison moteur interne/oracle est automatisée ;
- la comparaison STAR\*NET est clairement distinguée d’une preview interne ;
- l’Analysis Lab reste utilisable avec un seul tableau principal ;
- les workflows existants de création et d’édition d’un processing ne régressent pas.

Pour les cas sans bruit, viser une récupération numérique proche de la précision machine après traitement correct du datum.

Pour les cas bruités, définir les tolérances selon le modèle stochastique, les sigmas et le niveau de confiance, pas avec une valeur arbitraire identique pour tous les réseaux.

Pour les références déplacées de 2 à 3 mm destinées à être détectables, utiliser une précision et une redondance suffisantes pour que le signal soit statistiquement identifiable.

## 14. Tests techniques

Ajouter :

- tests unitaires des formules ;
- tests de propriétés et invariants géométriques ;
- tests du générateur ;
- tests de reproductibilité ;
- tests des 100 manifestes ;
- tests des mappings physiques ;
- tests du loader ;
- tests du moteur interne ;
- tests des lecteurs/générateurs STAR\*NET ;
- tests de comparaison ;
- tests de l’Analysis Lab ;
- tests E2E d’un cas sain ;
- tests E2E d’une référence déplacée ;
- tests E2E atmosphère désactivée/activée ;
- tests E2E Cercle I/Cercle II ;
- tests E2E d’une distance Hd/Sd incorrectement déclarée.

Lancer les commandes existantes du dépôt, notamment :

```
typecheck
lint
tests unitaires
tests Python
build
tests E2E

```

Adapter les noms exacts aux scripts existants.

La validation locale des 100 jeux doit rester suffisamment rapide pour la CI. Les appels réels à STAR\*NET doivent être séparés des tests CI obligatoires si le service Windows n’est pas disponible.

## 15. Livrables

La Draft PR doit contenir :

1. un document expliquant la génération scientifique ;
2. la matrice de couverture des 100 jeux ;
3. le générateur reproductible ;
4. l’oracle indépendant ;
5. le manifeste ;
6. les 100 jeux ;
7. le loader de données de démonstration ;
8. l’Analysis Lab mis à jour ;
9. les tests ;
10. les scripts de validation ;
11. la documentation des conventions et formules ;
12. les résultats de comparaison interne/oracle ;
13. les résultats STAR\*NET disponibles ;
14. les limites et phénomènes non identifiables.

## 16. Références officielles minimales

Vérifier les choix STAR\*NET à partir de la documentation officielle MicroSurvey, notamment :

- types de données et options inline ;
- constante de prisme `.PRISM` ;
- coefficient de réfraction `.REF` ;
- unités et conventions ;
- normalisation Face II ;
- séries Cercle I/Cercle II.

Utiliser les documentations constructeur présentes dans le dépôt pour les formules propres aux instruments.

Ne pas recopier un comportement historique si les fichiers ou scripts legacy contredisent la documentation officielle. Documenter explicitement toute différence.

## 17. Liberté d’implémentation

Tu peux modifier l’organisation technique si une solution plus simple, robuste et facilement réutilisable par les développeurs BTM existe.

Les contraintes ci-dessus définissent :

- les phénomènes à représenter ;
- les contrats fonctionnels ;
- les résultats attendus ;
- les preuves de validation.

Elles ne t’obligent pas à reproduire l’ancienne interface ni à conserver une architecture inutilement complexe.

Privilégie :

- le code lisible ;
- les fonctions pures ;
- les contrats explicites ;
- les modules réutilisables ;
- les petits adaptateurs ;
- l’absence de duplication ;
- les explications visibles à la demande ;
- une interface compacte adaptée à un topographe expert sans effrayer un utilisateur occasionnel.

À la fin :

- ouvre une Draft PR ;
- ne merge pas ;
- ne déploie pas manuellement ;
- indique le lien de preview Vercel s’il existe ;
- fournis un résumé des 100 jeux ;
- fournis les résultats des tests ;
- fournis les écarts observés entre l’oracle, le moteur interne et STAR\*NET ;
- indique clairement ce qui reste simulé et ce qui a réellement été exécuté avec STAR\*NET.
