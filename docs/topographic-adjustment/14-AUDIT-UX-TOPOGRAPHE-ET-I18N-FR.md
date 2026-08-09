# Audit UX topographe et terminologie française

## 1. Verdict

La maquette est adaptée à la validation fonctionnelle par un topographe et constitue une base
crédible pour la reprise dans BTM. Le parcours suit la logique métier d’une compensation
topographique, sans obliger l’utilisateur à choisir un niveau « standard » ou « expert » : les
décisions indispensables restent visibles et les réglages spécialisés sont regroupés dans les
options avancées.

Un topographe expérimenté ne choisirait pas un autre ordre général. Il demanderait surtout plus de
provenance, des contrôles de saisie adaptés aux conventions locales et un catalogue d’instruments
validé avant une mise en production. Ces compléments ne remettent pas en cause le workflow retenu.

## 2. Workflow métier validé

| Étape | Décision topographique | Avis d’audit |
|---|---|---|
| Général | portée mono-station ou réseau connecté, modèle FR/UK, date de configuration | Cohérent ; le projet BTM reste implicite |
| Stations | choix des stations appartenant à un même réseau | Cohérent ; les groupes indépendants restent dans des traitements distincts |
| Instruments | hauteur d’instrument et correction atmosphérique | Cohérent ; la correction de prisme reste au niveau station–cible |
| Cibles et mesures | rôle, type de cible, EDM, constantes, hauteurs, poids et identité physique | Conforme à la réalité des mesures mixtes d’un même instrument |
| Coordonnées approchées | repère local ou points de contrôle, fenêtre d’observation et médianes | Cohérent ; la période décrit les données utilisées, pas la validité de la configuration |
| Compensation | poids, paramètres STAR*NET, préflight et essai réel sur la VM | Conforme ; aucune publication n’est faite pendant le test |
| Exécution | déclenchement, synchronisation, réutilisation et recalcul tardif | Conforme au besoin événementiel et aux pas de sortie réguliers |
| Sorties | composantes et indicateurs publiés sur des variables stables | Conforme au modèle BTM et au recalcul par UPSERT |
| Vérification | synthèse, activation ou brouillon daté | Conforme au versionnement immuable |

L’Analyse de la compensation complète correctement le wizard : elle permet de comparer les
coordonnées approchées et compensées, les déplacements, incertitudes, ellipses, résidus, rang,
degrés de liberté, facteur de variance et χ² dans un seul contexte synchronisé. Les essais restent
temporaires jusqu’à la création explicite d’une nouvelle version datée.

## 3. Choix UX qu’un expert conserverait

- un seul traitement pour une station ou un réseau réellement connecté ;
- confirmation humaine des points physiques communs, sans fusion par nom ou proximité seule ;
- deux couples homologues comme minimum pratique et trois points bien répartis recommandés ;
- configurations de mesure résolues par couple station–cible pour accepter prismes, feuilles et
  mesures sans réflecteur dans une même station ;
- séparation explicite de la constante de prisme, de la correction atmosphérique, du facteur
  d’échelle et de la réfraction STAR*NET ;
- médiane des Hz/Vz/distances inclinées corrigées sur la période d’initialisation ;
- contrôle du taux de couverture avant l’acceptation des coordonnées approchées ;
- test de l’époque et inspection des fichiers natifs avant activation ;
- versions datées immuables et choix de la version historiquement valide lors d’un recalcul ;
- réglages avancés accessibles à tous, sans masquer définitivement les paramètres scientifiques.

## 4. Terminologie française retenue

| Concept interne ou anglais | Libellé français d’interface |
|---|---|
| Topographic Adjustment | Compensation topographique |
| Processing | Traitement |
| Adjustment | Compensation |
| Initial coordinates | Coordonnées approchées |
| Adjusted coordinates | Coordonnées compensées |
| Reference / control point | Point de contrôle |
| Monitoring point | Point de suivi |
| Shared physical point | Point physique commun |
| Matched pair | Couple homologue |
| Slope distance (`Sd`) | Distance inclinée (`Di` dans l’aide française, `Sd` conservé dans les contrats) |
| Easting / Northing / Height | Est / Nord / Altitude (`E/N/H`) |
| Output slot | Pas de sortie |
| Catch-up | Recalcul tardif / rattrapage |
| Standardised residual | Résidu standardisé |
| Variance factor | Facteur de variance |
| Datum | Repère |
| One ray | Une seule visée |

Les identifiants de variables, codes de stations, noms de points, clés JSON, commandes CLI et
contenus natifs STAR*NET ne sont jamais traduits. La langue de l’interface ne modifie ni les unités
internes SI, ni les fichiers `.dat/.prj`, ni les résultats numériques.

## 5. Points à compléter pour la production BTM

### Priorité P1

1. **Coordonnées de contrôle** — le prototype sait utiliser le catalogue de démonstration. BTM doit
   aussi permettre une saisie explicite et un import CSV de coordonnées avec format, système,
   unités, incertitudes et provenance contrôlés. L’import concerne les coordonnées de contrôle,
   jamais les observations brutes.
2. **Décimales localisées** — valider la saisie de la virgule française dans tous les champs
   numériques tout en conservant des nombres JSON/SI canoniques côté API.
3. **Diagnostics traduisibles** — remplacer les messages libres provenant du moteur ou de l’API
   par `code + paramètres + détail technique`. L’interface traduit le code ; le détail natif reste
   consultable pour l’audit.
4. **Catalogue instrument** — brancher les modèles Leica/Topcon validés, versions de firmware,
   modes EDM, précisions constructeur et dates d’étalonnage du vrai BTM. La maquette ne propose
   actuellement qu’un modèle résolu par preset.
5. **Provenance des valeurs** — pour chaque poids, coordonnée et correction, afficher clairement
   la source : modèle, station, BTM, valeur saisie ou valeur de repli.

### Priorité P2

- colonnes masquables et ordre mémorisé dans les grands tableaux techniques ;
- export CSV du diagnostic et de la configuration résolue pour revue, jamais comme source de
  données brutes ;
- comparaison côte à côte de deux versions avec impact estimé ;
- préférence d’unité angulaire degrés/gon limitée à l’affichage, avec conversion testée ;
- raccourcis de navigation entre un point du plan, sa ligne de résultat et ses observations.

## 6. Internationalisation livrée dans la maquette

- sélecteur compact `FR / EN` dans l’en-tête ;
- langue mémorisée dans le navigateur et attribut HTML `lang` synchronisé ;
- locale MUI synchronisée pour les paginations, commandes et libellés d’accessibilité natifs ;
- shell, liste, wizard, administration, exécutions, pont STAR*NET et Analyse de la compensation
  couverts par le namespace `topographicAdjustment` ;
- catalogues anglais et français protégés par un test de parité des clés ;
- test composant et test E2E de sélection/persistance du français ;
- vocabulaire scientifique et topographique contrôlé par des assertions dédiées.

## 7. Checklist de recette par un topographe

- [ ] Basculer en français, recharger puis vérifier que le choix est conservé.
- [ ] Créer un traitement mono-station FR et vérifier « distance inclinée », « point de contrôle »
      et « coordonnées approchées ».
- [ ] Créer un réseau et confirmer manuellement des couples homologues bien répartis.
- [ ] Vérifier qu’une cible sans réflecteur ne reçoit aucune correction de prisme.
- [ ] Vérifier qu’une distance déclarée déjà corrigée ne reçoit aucune seconde correction.
- [ ] Calculer les coordonnées approchées sur une période et examiner couverture, médianes et
      points manquants.
- [ ] Préparer une époque, lire le diagnostic, puis lancer exactement les mêmes fichiers sur
      STAR*NET 14.
- [ ] Comparer coordonnées approchées/compensées, ΔE/ΔN/ΔH/Δ3D, sigmas, ellipses et résidus.
- [ ] Modifier un poids, relancer un essai et vérifier que les résultats deviennent obsolètes avant
      recalcul.
- [ ] Enregistrer un réglage validé comme nouvelle version datée sans modifier l’historique.
- [ ] Recalculer une période avec la version valide pour chaque pas de sortie.
