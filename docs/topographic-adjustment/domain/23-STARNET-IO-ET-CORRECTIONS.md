# STAR*NET — génération, corrections, exécution et parsing

## 1. Principe

Le builder produit à chaque run un `.dat` et un `.snproj` complets à partir du snapshot de la
version et des observations sélectionnées. Les fichiers sont temporaires ; la base reste la source
de vérité.

## 2. Noms STAR*NET

Le manuel fourni indique que les noms de station/point sont sensibles à la casse et limités à
15 caractères. Le tiret est normalement le séparateur des noms sur les observations.

Règle BTM stricte :

```regex
^[A-Za-z0-9_]{1,15}$
```

Éviter espaces, tirets, virgules, `=`, `#`, apostrophes et guillemets. Générer un alias neutre,
déterministe et versionné si nécessaire.

## 3. Coordonnées et contraintes

Le code `C` définit les coordonnées d'une station/point :

```text
C  POINT  EASTING  NORTHING  HEIGHT  sigmaE sigmaN sigmaH
```

Selon l'ordre configuré, le builder respecte EN/NE. Les modes sont traduits ainsi :

- fixed → `!` ;
- weak → sigma numérique en mètres ;
- free → `*` ou absence selon le cas contrôlé.

Exemple :

```text
C ST0001 0.0000 0.0000 0.0000 ! ! !
C REF001 12.3450 55.1200 1.8200 0.001 0.001 0.001
C PT0001 15.1000 42.9000 1.1000 * * *
```

STAR*NET traite un point fixed via un très petit écart-type interne, pas comme une constante
mathématique absolue. Les valeurs fixed linear/angular du projet doivent rester explicites.

Pour une initialisation en datum local où une station et son orientation sont fixées, le builder
ajoute un backsight auxiliaire fixe, placé à 1 000 m dans l'azimut d'orientation, puis une direction
`DN` fixe à lecture zéro dans le bloc de cette station. Cet auxiliaire porte un nom réservé BTM
`BTMORIxxx`, n'est lié à aucun point physique et n'est jamais publié.

## 4. Observations de station totale

Pour les jeux de directions avec distance inclinée et angle zénithal :

```text
DB  ST0001
DM  PT0001  HZ  SLOPE_DISTANCE  ZENITH  [stdErrs]  HI/HT
DM  REF001  HZ  SLOPE_DISTANCE  ZENITH  [stdErrs]  HI/HT
DE
```

La même `engineName` est utilisée depuis plusieurs stations pour un point physique partagé.

Le builder conserve l'époque et les IDs sources dans des commentaires ou le snapshot, sans créer
des noms moteur à partir de ces IDs.

## 5. Hauteurs

STAR*NET accepte `HI/HT` sur les lignes 3D. Toujours écrire les deux valeurs lorsque nécessaires,
plutôt qu'un unique delta historique. La hauteur d'instrument et la hauteur de cible proviennent de
la version/configuration résolue.

## 6. Chaîne de correction recommandée

Le builder écrit par défaut une distance inclinée finale déjà résolue :

```text
prismDeltaM = requiredConstantM - alreadyAppliedConstantM
afterPrismM = storedSlopeDistanceM + prismDeltaM

if atmosphereMode == cycle/fixed:
  ppm = atmosphericFormula(T, P)
  finalSlopeDistanceM = afterPrismM * (1 + ppm * 1e-6)
else:
  ppm = 0
  finalSlopeDistanceM = afterPrismM
```

Le `.dat` contient `finalSlopeDistanceM`. Le snapshot conserve stored, delta, T/P, ppm, formule,
résultat et source. Cette approche correspond au comportement visible dans l'exemple UK où
78,4100 m + 8,9 mm devient environ 78,4189 m avant STAR*NET.

## 7. `.PRISM`

Le manuel STAR*NET permet `.PRISM constant` ou `.PRISM correct incorrect`, en millimètres. Pour
éviter le double traitement dans un cycle mélangeant de nombreux setups, le builder canonique BTM
pré-corrige la valeur numérique et n'émet pas `.PRISM` par défaut.

Si une variante future utilise `.PRISM`, elle doit :

- écrire la commande avant les observations concernées ;
- gérer ON/OFF/CLEAR entre groupes ;
- ne pas pré-appliquer le même delta ;
- conserver exactement la même trace résolue ;
- être validée par tests golden contre la méthode pré-corrigée.

## 8. `.SCALE`

`.SCALE` s'applique aux distances horizontales ou à la composante horizontale des distances
inclinées dans un job local. Il sert au datum/échelle moyenne, pas à la correction atmosphérique
EDM complète.

Le builder :

- utilise le `scale_factor`/`.SCALE` seulement si la configuration de datum le demande ;
- ne calcule pas `.SCALE` depuis T/P ;
- garde ce facteur séparé dans la trace de correction.

Choix du builder BTM : le facteur résolu est écrit une seule fois via `.SCALE` dans le `.dat` et
le `scale_factor` du `.snproj` reste neutre à `1.0`, comme dans le projet UK fourni. Il ne faut
jamais renseigner simultanément les deux avec la même correction.

## 9. Réfraction et courbure

`index_of_refraction`/`.REFRACTION` agit sur les corrections internes des angles zénithaux avec la
géométrie courbe. Il ne remplace pas la correction T/P de la distance. Si les angles ont déjà été
corrigés manuellement pour courbure/réfraction, la configuration STAR*NET doit empêcher une double
correction selon les options supportées.

## 10. Pondération

Ordre de priorité : poids explicite observation/setup, puis fallback Instrument du projet.

Les standard errors de distance sont en mètres dans `.snproj` et les ppm sans conversion. Les
angles sont convertis vers le format attendu. Les erreurs de centrage sont incluses uniquement si
la configuration le demande.

Pour supporter dans un même instrument des prismes, feuilles réfléchissantes et tirs sans prisme,
le builder résout le poids de distance de chaque visée :

```text
sigmaDistanceM = sqrt((sigmaMm / 1000)² + (distanceM × ppm × 1e-6)²)
```

Il écrit ensuite sur chaque ligne `DM` les trois écarts-types explicites direction/distance/zénith.
Le `edm_ppm` global du `.snproj` reste à zéro afin de ne pas appliquer une deuxième fois la
composante ppm. Les erreurs de centrage instrument/cible restent gérées séparément par STAR*NET.

## 11. `.snproj`

Générer au minimum les sections Adjustment, Listing, Instrument et DataFileList nécessaires à la
version STAR*NET installée. Ne pas recopier les options Plot/UI inutiles sauf si le CLI en dépend.

Exiger les sorties natives suivantes :

- listing avec observations, résidus, convergence, coordonnées, standard deviations et ellipses ;
- coordinate `.pts` ;
- error `.err` ;
- autres fichiers natifs nécessaires aux contrôles confirmés.

Les paramètres Auto Adjust proviennent de la configuration et restent distincts des itérations de
solution.

## 12. Exemple de mapping réseau

Configuration :

| Source BTM | Physical point | Engine name |
|---|---|---|
| STA1 / MPO001 | pp-A | PT000101 |
| STA2 / MPO078 | pp-A | PT000101 |
| STA3 / MPO001 | pp-B | PT000102 |

Extrait conceptuel :

```text
DB ST0001
DM PT000101 ...
DE

DB ST0002
DM PT000101 ...
DE

DB ST0003
DM PT000102 ...
DE
```

Le parser effectue le chemin inverse depuis le snapshot de la version.

## 13. Plusieurs projets simultanés

Cinq processings peuvent tous utiliser `STA1` et `MPO001` car les noms sont résolus dans des
workspaces séparés :

```text
C:\BTM-StarNet\work\processing-101\run-A\
C:\BTM-StarNet\work\processing-205\run-B\
C:\BTM-StarNet\work\processing-309\run-C\
C:\BTM-StarNet\work\processing-410\run-D\
C:\BTM-StarNet\work\processing-511\run-E\
```

La concurrence de fichiers est évitée. La concurrence du binaire/licence STAR*NET est gérée par un
lock/worker pool selon les capacités réelles de l'installation.

## 14. Parsing natif

Le parser ne se base pas sur les fichiers custom `argus_export`/`chisquare_export` générés par des
scripts batch. Il extrait des sorties natives :

- coordonnées ajustées et incertitudes ;
- ellipses ;
- résidus et résidus standardisés ;
- χ² et facteur de variance ;
- convergence/itérations ;
- erreurs et warnings ;
- observations exclues par Auto Adjust si exposées.

Chaque valeur parsée est associée à son `engineName`, puis au mapping de version. Les nombres sont
validés avant écriture ; un point inconnu ou dupliqué bloque la publication du run.

## 15. Transaction de publication

1. parser tous les fichiers ;
2. valider exhaustivité, unités, mapping et qualité ;
3. construire toutes les lignes `measures` ;
4. ouvrir une transaction ;
5. UPSERT les mesures ;
6. écrire le résumé de run ;
7. commit ;
8. marquer le job réussi ;
9. supprimer le workspace.

En cas d'erreur avant commit, aucune sortie partielle n'est publiée.

## 16. Tests golden

Conserver des fixtures anonymisées :

- input config + observations ;
- `.dat/.snproj` attendus ;
- `.lst/.pts/.err` natifs ;
- résultat parsé attendu.

Tester séparément FR corrigé, UK brut, Reflectorless, setup mixte, nom collision, HI/HT,
Auto Adjust, échec χ² et point de sortie inconnu.
