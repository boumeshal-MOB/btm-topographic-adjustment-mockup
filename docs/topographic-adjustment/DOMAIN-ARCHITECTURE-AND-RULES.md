# Domaine, architecture et règles permanentes

## Hiérarchie d'autorité

1. décisions confirmées dans ce dossier ;
2. contrats et tests exécutables du dépôt ;
3. fichiers STAR*NET/BTM fournis et documentation éditeur ;
4. comportement du legacy comme source d'inspiration, jamais comme vérité automatique ;
5. anciennes maquettes uniquement pour comprendre une intention.

Une valeur inconnue reste marquée à valider. Ne pas copier un paramètre UK vers la France ni
inventer un mapping de point pour rendre une démo verte.

## Architecture cible

### Maquette

- React/MUI/Vite sur Vercel ;
- MSW et repositories de démonstration remplaçables ;
- noyau TypeScript pur pour l'interactivité ;
- noyau Python 3.12 canonique pour les calculs et tests scientifiques ;
- passerelle HTTPS temporaire vers le service Windows pour les essais STAR*NET réels ;
- données synthétiques commitées, clairement étiquetées ; aucune saisie de secret persistée.

### BTM réel

- nouveau `processing_type = Topographic Adjustment` ;
- observations Hz/Vz/Sd dans `raw_data`, chaque variable appartenant à un capteur/prisme ;
- mapping explicite et versionné des variables d'entrée ;
- configuration et historique en base BTM ;
- variables de sortie appartenant au processing, stables entre versions ;
- API BTM et file de jobs persistante/idempotente ;
- préparation/initialisation possibles dans une Lambda Python stateless ;
- STAR*NET Ultimate exécuté uniquement sur la VM Windows dédiée ;
- dossier éphémère isolé par `processingId/runId`, aucun fichier serveur comme source de vérité ;
- parse des sorties natives puis transaction base ; suppression du dossier seulement après
  persistance réussie.

Ni S3, ni FTP, ni Lambda ne sont nécessaires pour faire tourner STAR*NET lui-même. L'interface
réseau définitive entre BTM et la VM reste un choix d'infrastructure ; le pilote HTTPS actuel ne
doit pas devenir une architecture de production par accident.

## Frontières de code

- `src/domain` : fonctions/types purs, sans React, MSW, IndexedDB ou filesystem ;
- `src/repositories` : ports vers données, moteur et publication ;
- `src/demo` et `src/mocks` : adaptateurs de démonstration remplaçables ;
- `src/features` : présentation et orchestration, aucune formule scientifique cachée ;
- `packages/python/topographic-adjustment-core` : référence mathématique testable ;
- `packages/lambdas/topographic-adjustment` : adaptateur stateless, pas source du domaine ;
- `src/domain/starnet` : génération/parsing déterministes et transport vers le service ;
- `server/starnet14-service` : isolation, sécurité, exécution et collecte natives.

Les composants réutilisables doivent rester compatibles avec le runtime React 17 de BTM. Les
entrées externes et presets sont validés par schéma. Les unités figurent dans les types, labels,
tables et previews.

## Modèle logique minimal

### Processing et configuration

`TopographicAdjustmentProcessing` possède une portée `single-station|network`, un statut, un flag
enabled et une version active. `AdjustmentConfigVersion` est un snapshot complet contenant :

- stations et instruments ;
- target bindings, variables Hz/Vz/Sd et configurations de mesure ;
- points physiques et relations géométriques ;
- références, coordonnées initiales et provenance ;
- paramètres STAR*NET/poids/Auto Adjust ;
- politique Run/synchronisation/catch-up ;
- politique Output ;
- template ID/version, overrides, auteur, raison et intervalle de validité.

États de version : draft, active, archived. Intervalles semi-ouverts `[from,to[`, sans
chevauchement actif. Une version utilisée est immuable et reste résoluble historiquement.

### Entrées

Une `ObservationVariableBinding` relie un `prismSensorId` à Hz, Vz, Sd et métadonnées éventuelles.
Une `TargetBinding` relie station, prisme, nom brut, rôle, configuration de mesure, point physique
et nom moteur. `stationCode` brut et `stationId` BTM sont reliés explicitement et uniques dans une
configuration ; un doublon est une erreur.

### Sorties

Le mapping stable relie processing, point physique, prisme BTM, composante et `variable_id`.
Plusieurs prismes qui représentent un point commun gardent leurs sorties propres si le produit le
demande ; le résultat STAR*NET revient d'abord par `engineName`, puis passe par le snapshot de
mapping exact du run. Aucun rapprochement par label au moment du parsing.

### Run

Le run minimal conserve processing, version, slot, trigger, observations sources, statut
fresh/reused/missing, début/fin, diagnostics χ²/variance/rang, tentatives Auto Adjust, erreur et
provenance du moteur. Les coordonnées finales vivent dans `measures`; leur duplication dans chaque
run n'est pas requise. La politique de rétention des diagnostics détaillés reste à décider.

## Règles métier stables

### Processing et données

- **PROC** — un processing = une station ou un réseau connecté ; groupes indépendants séparés.
- **DATA** — pas d'upload brut ; mapping de variable explicite, schématisé et versionné ; aucune
  inférence de rôle depuis un nom seul.
- **TIME** — époque source, fenêtre d'initialisation, slot de sortie et validité de config sont
  distincts ; calcul interne et stockage en UTC.

### Mesures et corrections

- **MEAS** — EDM/réflecteur/constantes/hauteurs/poids résolus par station–cible ; mélanges permis.
- **CORR** — appliquer les corrections une fois, dans un ordre tracé ; réflecteur sans constante
  résolue = décision requise ; reflectorless = delta zéro ; `.SCALE` réservé datum/grille.
- **ATMO** — modes déjà appliqué, cycle T/P, T/P fixe ou none ; formule/version/provenance ;
  invalidité et fallback explicites ; catch-up possible.

Formule de référence actuelle, remplaçable après validation métier :

```text
ppm = 281.8 − 0.29065 × P_hPa / (1 + T_C / 273.15)
scale = 1 + ppm × 10⁻⁶
correctedSlope = (storedSlope + prismDelta) × scale
```

### Géométrie et identité

- **POINT** — individuel par défaut ; shared uniquement après confirmation ou reprise d'une
  version ; candidats géométriques tolérés mais jamais auto-validés ; homonymes séparés.
- **NAME** — `engineName` ASCII, déterministe, unique par job et mappé dans le snapshot ; les
  noms BTM visibles restent inchangés.
- **INIT** — coordonnées fournies ou station fixe XYZ+orientation ; agrégation robuste sur une
  période ; couverture affichée ; pas de coordonnée connue inventée ; rang/connectivité bloquants.

Conventions scientifiques : E/N/H en mètres ; azimut depuis le Nord dans le sens horaire ; Vz
angle zénithal ; Sd distance inclinée ; `hd = Sd sin(Vz)` ; `dh = Sd cos(Vz)` ; Face II normalisée
par Hz±180° et `Vz=360°−Vz`, puis moyenne circulaire. Une distance horizontale n'est jamais
injectée silencieusement comme Sd.

### Ajustement et sorties

- **ADJ** — moindres carrés pondérés, convergence/rang/dof/χ²/variance/résidus/sigmas/ellipses ;
  Auto Adjust traçable ; preview non certifiée clairement signalée.
- **RUN** — event-driven ou périodique ; synchronisation et réutilisation bornées ; état
  provisoire ; catch-up borné/idempotent.
- **OUT** — slots UTC ; variables stables ; UPSERT par variable+timestamp ; `not-applicable`
  supprime l'ancien booléen χ² au lieu de le laisser stale.
- **VER** — snapshot complet, version utilisée immuable, résolution historique par slot ; aucun
  fichier éphémère comme historique.

## Paramètres de templates

Un template préremplit un draft ; il ne constitue pas une norme nationale et ne modifie jamais
une version existante. Ordre de résolution : métadonnée d'observation, mapping versionné,
override, template, fallback autorisé, warning/blocage.

### UK — projet fourni HS2/NTE

| Paramètre | Valeur initiale |
|---|---:|
| Dimension / unités / ordre | 3D / metres / EN |
| Angles / entrée 3D | DMS / Slope-Zenith |
| Local-grid / scale | Local / 1.0 |
| Réfraction / rayon Terre | 0.07 / 6 372 000 m |
| Convergence / itérations | 0.01 (unité STAR*NET) / 10 |
| χ² / ellipse | 5 % / 95 % |
| Distance | 1.0 mm + 1.0 ppm |
| Angle / direction / azimut / zénith | 1.414 / 2.5 / 1.0 / 1.5 arcsec |
| Centrages instrument / cible / vertical | 0.8 / 0.8 / 0.5 mm |
| Auto Adjust | max |v|/σ 3.0, 1 retrait/itération, 20 itérations |

Instrument proposé Leica TM50 I. Les Sd fournies ont été enregistrées avec constante terrain
0 mm : circulaire +0.0 mm, L-bar +8.9 mm, micro-prisme +26.5 mm, 360 mini +30.0 mm. La correction
est un setup par cible.

### France — monitoring STAR*NET

| Paramètre | Valeur initiale |
|---|---:|
| Dimension / unités / ordre | 3D / metres / EN |
| Angles / entrée 3D | gons / Slope-Zenith |
| Local-grid / scale | Local / 1.0 |
| Réfraction / rayon Terre | 0.13 / 6 371 000 m |
| Convergence / itérations | 0.01 / 30 |
| χ² / ellipse | 5 % / 95 % |

Instrument proposé Topcon MS AX, avec valeurs nominales constructeur par setup et validation
projet requise. Par défaut les distances France et l'atmosphère sont déjà corrigées. MPO FR :
constante requise +25.5 mm et déjà appliquée +25.5 mm, donc delta BTM 0. `MPO` est une
nomenclature de la base France, pas une identité physique universelle. Les poids/centrages FR de
production ne doivent pas être inventés.

## Génération et parsing STAR*NET

- coordonnées/contraintes et observations sont écrites depuis le snapshot résolu ;
- orientation locale fixée : station connue et direction fictive/contrainte générée de façon
  déterministe lorsque le template natif le requiert ; ce point moteur est mappé et exclu des
  sorties métier ;
- utiliser le template `.prj` natif validé, modifier uniquement des lignes courtes reconnues et
  écrire CRLF ;
- `.dat/.prj/.snproj` sont régénérés par run dans un dossier isolé ;
- appel CLI standard : `StarNet.exe <project.prj> /RUN` ;
- parser `.run`, `.lst`, `.pts`, `.err` et `.dmp` lorsqu'il existe ;
- ne publier qu'après validation de cohérence des comptes/noms/unités ;
- les résultats natifs et preview partagent un contrat d'affichage mais gardent leur provenance.

## Reprise BTM

Le développeur remplace dans cet ordre les adaptateurs, sans réécrire les composants métier :

1. enums/tables et contrats de version ;
2. repositories démo par API BTM/raw_data ;
3. persistance des sorties et runs ;
4. file de jobs/idempotence ;
5. service Windows et lock licence ;
6. ordonnanceur/catch-up/reprocessing ;
7. durcissement Analysis Lab et audit.

Les points d'intégration exacts, décisions ouvertes et tests de sortie sont regroupés dans
[`VALIDATION-AND-OPEN-DECISIONS.md`](VALIDATION-AND-OPEN-DECISIONS.md).
