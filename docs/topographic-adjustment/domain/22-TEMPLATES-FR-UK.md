# Templates France et Royaume-Uni

## 1. Nature des templates

Un template propose des valeurs initiales. Il ne constitue pas une norme nationale, ne crée pas
de point physique et ne modifie pas une configuration existante lorsqu'il évolue.

Familles : Country preset, Instrument, Measurement setup, Adjustment, Run et Output.

## 2. Priorité de résolution

1. métadonnée réellement enregistrée avec l'observation ;
2. configuration `station × cible` de la version ;
3. override explicite ;
4. template ;
5. fallback station autorisé ;
6. warning ou blocage.

## 3. Template UK — supplied HS2/NTE project

### Provenance

Valeurs confirmées dans les fichiers `.prj/.snproj` fournis et dans le classeur
`ATS34 Raw Data, Lookup, Header`.

### STAR*NET Adjustment

| Paramètre | Valeur |
|---|---:|
| Adjustment type | 3D |
| Linear units | Meters |
| Angle output | DMS |
| Local/grid | Local |
| Coordinate order | EN |
| 3D input mode | Slope/Zenith |
| Scale factor | 1.0 |
| Index of refraction | 0.07 |
| Earth radius | 6 372 000 m |
| Converge limit | 0.01, sans unité |
| Maximum solution iterations | 10 |
| Chi-square significance | 5 % |
| Error propagation | On |
| Ellipse confidence | 95 % |

### Poids projet

| Paramètre | Valeur |
|---|---:|
| Distance | 1.0 mm + 1.0 ppm |
| Angle | 1.414 arcsec |
| Direction | 2.5 arcsec |
| Azimuth | 1.0 arcsec |
| Zenith | 1.5 arcsec |
| Instrument centering | 0.8 mm |
| Target centering | 0.8 mm |
| Vertical centering | 0.5 mm |

### Auto Adjust

- max standardized residual : 3.0 ;
- outliers removed per iteration : 1 ;
- max Auto Adjust iterations : 20.

### Instrument et cibles

- instrument proposé : Leica TM50 I ;
- hauteur par défaut : 0 m pour installation permanente, modifiable ;
- distances inclinées du classeur enregistrées avec constante terrain 0 mm ;
- Leica Circular Prism : +0,0 mm ;
- L-bar : +8,9 mm ;
- Micro Prism : +26,5 mm ;
- 360 mini : +30,0 mm ;
- target height du classeur : 0 m ;
- T/P du cycle proposées quand les variables existent ;
- noms moteur issus de la Lookup UK s'ils sont compatibles.

Ne jamais nommer ce template d'après une personne. Utiliser la provenance projet/fichier.

## 4. Template FR — STAR*NET monitoring

### STAR*NET Adjustment initial

| Paramètre | Valeur |
|---|---:|
| Adjustment type | 3D |
| Linear units | Meters |
| Angle output | Gons |
| Local/grid | Local |
| Coordinate order | EN |
| 3D input mode | Slope/Zenith |
| Scale factor | 1.0 |
| Index of refraction | 0.13 |
| Earth radius | 6 371 000 m |
| Converge limit | 0.01, sans unité |
| Maximum solution iterations | 30 |
| Chi-square significance | 5 % |
| Error propagation | On |
| Ellipse confidence | 95 % |

Ces valeurs sont modifiables et doivent être validées par le géomètre du projet avant activation.
Les paramètres CoMeT comme Huber/VCE ne sont pas importés car le moteur est STAR*NET uniquement.

### Instrument Topcon MS05AXII

Valeurs constructeur proposées par famille :

| Famille | Distance | Angle |
|---|---:|---:|
| Standard prism | 0,8 mm + 1 ppm | 0,5 arcsec instrument |
| Reflective sheet | 0,5 mm + 1 ppm | setup dédié |
| Reflectorless | 1,0 mm + 1 ppm | setup dédié |

Les valeurs correspondent à la documentation constructeur MS05AXII et restent des précisions
nominales. Les poids du projet peuvent être plus conservateurs selon centrage, site et calibration.

Source constructeur :
<https://www.topconpositioning.com/content/dam/topcon_digital_asset_hub/collateral/brochures/MSSeries_MSAXII_Broch_T547EN_TEAM_EN_EU_HiRes.pdf>

### Configurations France initiales

| Setup | Type | Requise | Déjà appliquée | Delta BTM | Distance |
|---|---|---:|---:|---:|---|
| MPO FR | Prism | +25,5 mm | +25,5 mm | 0,0 mm | déjà corrigée |
| PAV FR | Prism/reflector selon catalogue | 0,0 mm | 0,0 mm | 0,0 mm | déjà corrigée |
| Reflective sheet Topcon | Reflective sheet | template | valeur déclarée | différence | selon état BTM |
| Reflectorless Topcon | Reflectorless | N/A | N/A | 0,0 mm | selon état BTM |

`MPO` est une nomenclature de la base France, pas un nom générique de point physique.

### Atmosphère France

Mode initial : `Already applied by station`. BTM applique 0 ppm. Si un projet France fournit des
distances brutes, l'utilisateur crée une configuration/version distincte et choisit T/P cycle,
fixes ou aucune correction.

## 5. Politique atmosphérique versionnée

Un modèle par défaut peut utiliser :

```text
ppm = 281.8 − 0.29065 × P_hPa / (1 + T_C / 273.15)
scale = 1 + ppm × 10⁻⁶
```

Nommer cette implémentation `standard-ppm-v1`, afficher la formule et la version, et ne pas la
présenter comme formule constructeur Leica/Topcon. Elle doit pouvoir être remplacée par une
formule validée sans modifier les runs/configurations historiques.

## 6. Run template par défaut

```json
{
  "trigger": "event-driven",
  "syncToleranceMinutes": 10,
  "reuseMissingStation": true,
  "maxReusedAgeMinutes": 45,
  "computeWithoutOptionalStations": true,
  "markReuseProvisional": true,
  "catchUp": {
    "enabled": true,
    "windowHours": 24,
    "onLateObservation": true,
    "onLateEnvironment": true,
    "maxRecalculationsPerSlot": 3
  }
}
```

Le preset ne décide pas quelles stations sont requises : cela appartient au processing.

## 7. Output template par défaut

```json
{
  "intervalMinutes": 30,
  "alignment": "utc-grid",
  "maxEpochToSlotMinutes": 10,
  "publishProvisional": true,
  "targetComponents": [
    "adjusted-x", "adjusted-y", "adjusted-z",
    "delta-x", "delta-y", "delta-z",
    "sigma-x", "sigma-y", "sigma-z"
  ],
  "globalComponents": [
    "chi2-passed", "variance-factor",
    "references-available", "target-availability", "provisional-flag"
  ]
}
```

## 8. Template application rules

- appliquer un preset à un draft seulement ;
- afficher le diff ;
- ne pas écraser un override sans confirmation ;
- stocker template ID/version et champs surchargés ;
- sauvegarder les valeurs résolues dans la ConfigurationVersion ;
- ne jamais résoudre un run depuis la version actuelle du catalogue de templates.

