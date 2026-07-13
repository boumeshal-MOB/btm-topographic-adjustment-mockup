# Frontend — targets, points physiques et initialisation

## Étape 4 — Targets & Measurements

### 1. Tableau principal

Le tableau représente chaque cible BTM observée par une station.

| Colonne compacte | Contenu |
|---|---|
| Station | station source |
| BTM target | ID stable + nom source |
| Role | Reference / Monitoring / Auxiliary |
| Measurement type | Prism / Reflective sheet / Reflectorless / Unknown |
| Measurement setup | résumé réflecteur + EDM + poids |
| Distance correction | Already corrected / BTM ±x mm / N/A |
| Initialisation | Missing / Computed / Known / Review |
| Include | inclure dans le calcul |
| Publish | créer/utiliser les sorties |

Filtres : station, rôle, type, statut de revue, correction non nulle, publication. Prévoir une
barre de modification en lot pour les cibles homogènes.

Une cible nouvelle est `To review`, distincte par défaut et non incluse silencieusement.

### 2. Drawer Measurement setup

Champs :

- instrument hérité ;
- type de mesure ;
- EDM mode ;
- reflector template si applicable ;
- constante requise (mm) ;
- constante déjà appliquée dans Sd (mm) ;
- correction BTM calculée (lecture seule) ;
- target height (m) ;
- distance standard error (mm) ;
- distance ppm ;
- source de chaque valeur.

Règles :

- Prism exige un réflecteur ;
- Reflective sheet utilise son propre setup ;
- Reflectorless masque les champs prisme, force correction prisme à 0 et utilise les poids
  non-prism de l'instrument ;
- le changement d'EDM recalcule les poids et vérifie la compatibilité ;
- le fallback n'est jamais silencieux.

### 3. Noms

Afficher séparément :

- source name BTM ;
- physical point label ;
- STAR*NET engine name ;
- output target label éventuel.

`MPO` est une nomenclature France provenant de la base France, jamais un préfixe générique. UK
conserve les noms de la Lookup Table lorsqu'ils sont valides.

## Common physical points — réseau seulement

### 1. État initial

La base BTM contient des cibles/prismes distincts. Elle ne permet pas de savoir seule que deux
cibles de stations différentes visent le même point. L'écran doit donc commencer par :

```text
No shared physical point confirmed yet.
Targets remain distinct until you confirm a relationship.
```

Ne pas afficher des mappings communs inventés depuis le classeur, le nom ou `AdjustmentName`.

### 2. Réutilisation

Proposer en premier les mappings physiques versionnés déjà confirmés pour les mêmes IDs BTM.
Afficher la version, la période, l'auteur et le diff. L'utilisateur confirme la réutilisation si
la nouvelle période/configuration l'exige.

### 3. Assistant Find common points

Par paire de stations :

1. sélectionner deux paires certaines au minimum ;
2. recommander une troisième paire bien répartie ;
3. construire des nuages locaux depuis les observations représentatives ;
4. calculer transformation horizontale + translation 3D ;
5. proposer les appariements supplémentaires mutuellement les plus proches ;
6. afficher résidus, tolérances, confiance et géométrie ;
7. laisser l'utilisateur décocher chaque candidat ;
8. confirmer explicitement.

Un seul point est insuffisant si l'orientation relative est inconnue. Deux points donnent
`Weak geometry`. Trois points non alignés ou plus permettent une validation robuste.

### 4. Tableau de validation

| Colonne | Unité/règle |
|---|---|
| Use | case décochable |
| Station A target | nom source + ID |
| Station B target | nom source + ID |
| H residual | mm, indiqué dans l'en-tête |
| V residual | mm |
| 3D residual | mm |
| Confidence | pourcentage + explication |
| Evidence | Manual seed / Geometry candidate / Prior mapping |

Ne précocher automatiquement que les paires manuelles certaines. Les candidats géométriques sont
sélectionnés par défaut uniquement si le produit le décide explicitement ; la règle sûre est de
les laisser non confirmés jusqu'à l'action utilisateur.

### 5. Shared physical points

Le tableau principal ne contient que les groupes confirmés partagés et les candidats en attente.
Les cibles individuelles restent dans le tableau Targets. Cela évite des centaines de mappings
triviaux.

### 6. Known geometric relationships

Table séparée : point A, point B, type, valeur, unité, sigma/tolérance, repère, source et usage.

Types : distance inclinée, distance horizontale, différence de hauteur, azimut-distance, vecteur
3D. Les points restent distincts. Une seule distance ne remplace pas les points communs nécessaires
pour orienter et translater deux réseaux.

### 7. Connectivité

Afficher un graphe/matrice par paire de stations avec `Connected`, `Weak geometry`, `Not connected`.
Le réseau déconnecté est informatif pendant l'édition et devient bloquant avant l'initialisation.
Effectuer ensuite un contrôle de rang réel.

## Étape 5 — Initialisation

### 1. Choix de méthode

Deux cartes mutuellement exclusives :

#### No coordinates — fix one station

Sélectionnée par défaut pour un nouveau processing. Demander : station ancre, E/N/H, orientation.
Autoriser `0/0/0/0` pour un système local.

Ne pas préremplir des coordonnées de référence provenant d'une fixture si elles ne sont pas
réellement déclarées disponibles dans BTM.

#### Use known reference coordinates

Afficher le jeu de références, le tableau E/N/H et les modes par composante : fixed (`!`), weak
(sigma en m), free (`*`). Autoriser saisie, collage tabulaire et import CSV de configuration.

Format CSV conseillé :

```text
point_id,easting_m,northing_m,height_m,mode_e,sigma_e_m,mode_n,sigma_n_m,mode_h,sigma_h_m
```

Valider et prévisualiser avant application. Cet import ne contient aucune observation Hz/Vz/Sd.

### 2. Fenêtre de données

Libellé : `Observation window used for initialisation`.

Expliquer :

```text
This period selects the observations used to estimate initial coordinates.
It does not define coordinate validity; validity follows the configuration version.
```

Pour chaque `station × cible`, utiliser la médiane de Hz, Vz et de la distance inclinée corrigée
sur la fenêtre. Ne pas prendre simplement la première ou la dernière date.

### 3. Couverture avant calcul

Afficher :

- points physiques disponibles / attendus et pourcentage ;
- couples station-cible disponibles / attendus ;
- observations brutes utilisées ;
- représentants médians produits ;
- cibles absentes ;
- période réelle min/max des données retenues.

### 4. Résultat

Tableau : point, E/N/H, source, nombre de stations, nombre d'observations, dispersion H/V,
qualité et commentaire. Une carte réseau affiche station ancre, points, rayons et points partagés.

Action : `Use as initial coordinates`. Ne pas dire `Fix coordinates` car elles restent
approximatives et ajustables.

### 5. Échecs explicites

- station non orientable ;
- référence absente dans la fenêtre ;
- composante réseau déconnectée ;
- seulement un point commun sans orientation connue ;
- points communs alignés ;
- résidus de transformation au-delà des tolérances ;
- cible sans observation représentative.

## Prompt ciblé

> Implémente Targets & Measurements, Common physical points et Initialisation selon ce document.
> Réutilise les fonctions pures de mapping, géométrie locale, corrections et médianes identifiées
> dans la stratégie de reprise. Aucune identité commune ne doit venir d'un nom seul. Pour un nouveau
> processing, le mode local-anchor est sélectionné et aucun tableau de coordonnées connues n'est
> prérempli. Affiche les résidus H/V/3D en mm, la couverture et les absents. Ajoute tests unitaires
> pour 1/2/3 points communs, noms homonymes, médianes, CSV coordonnées et réseau déconnecté.

