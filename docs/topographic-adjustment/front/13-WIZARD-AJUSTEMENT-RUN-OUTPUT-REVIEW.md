# Frontend — Adjustment, Run, Output et Review

## Étape 6 — Adjustment

### Vue compacte

Afficher :

- Adjustment template et version ;
- 3D / local ou grid ;
- mètres ;
- format angulaire ;
- ordre EN/NE ;
- mode Slope/Zenith ;
- convergence STAR*NET sans unité ;
- maximum solution iterations ;
- χ² significance ;
- confidence level ;
- error propagation ;
- résumé Auto Adjust.

La convergence STAR*NET mesure la variation de la somme des carrés des résidus standardisés. Elle
ne doit jamais porter l'unité mètre ni reprendre le seuil numérique du moteur local de démo.

### Options avancées

- scale/datum factor ;
- earth radius ;
- refraction coefficient ;
- poids de fallback distance, direction, angle, azimut, zénith ;
- erreurs de centrage ;
- fixed linear/angular standard errors ;
- Auto Adjust : max standardized residual, removed per iteration, max attempts ;
- listings/sorties natives demandées ;
- politique en cas de χ² invalide ;
- seuils de publication BTM.

Les poids `station × cible` restent prioritaires sur les fallbacks du projet.

### Politique χ²

Choix explicites :

- `Fail run and do not publish` ;
- `Run STAR*NET Auto Adjust` ;
- `Publish failed QC` uniquement si la gouvernance BTM l'autorise ;
- `Send to Analysis Lab` comme action après le test/run.

Auto Adjust montre toujours : tentative, observation exclue, résidu standardisé, raison et
résultat. Ne jamais supprimer la mesure source.

### Test one epoch

Permettre de sélectionner un slot disponible et lancer un test non publié. Afficher :

- sources par station ;
- corrections ;
- `.dat/.prj` preview ;
- convergence, rang, χ², facteur de variance ;
- résidu maximal ;
- ellipses ;
- erreurs/warnings.

Dans Vercel, le calcul est fait par le moteur local et clairement étiqueté démonstration.

## Étape 7 — Run

### Déclenchement

- `Event-driven` par défaut ;
- `Every X minutes` ;
- `Manual only`.

Le schedule indique quand vérifier/calculer. Il ne définit pas les timestamps des sorties.

### Synchronisation réseau

- sync tolerance (min) ;
- stations requises/optionnelles ;
- attendre une nouvelle donnée de chaque station ;
- réutiliser la dernière époque si manquante ;
- max reused age (30/45/60/custom) ;
- calculer sans station optionnelle ;
- marquer provisoire.

Afficher un exemple vivant :

```text
Output slot 09:30
ATS34 09:25 fresh · ATS35 09:26 fresh · ATS36 09:32 fresh
Published timestamp: 09:30
```

### Catch-up

- activé/désactivé ;
- observation tardive ;
- T/P tardives ;
- fenêtre maximale de rattrapage ;
- nombre maximal de recalculs par slot ;
- réécrire la mesure du slot par UPSERT ;
- réutiliser la version de configuration valide au slot.

### Prévisualisation

Pour les derniers slots : état des stations, fraîcheur, résultat attendu Final/Provisional/Blocked,
raison et prochaine action.

## Étape 8 — Output

### Grille temporelle

- output interval : 30/60/custom ;
- anchor/alignment : pour 30 min, `:00/:30` ;
- max epoch-to-slot distance ;
- publication des résultats provisoires ;
- délai de fermeture/catch-up.

### Variables par cible publiée

| Composant | Définition | Unité |
|---|---|---|
| Adjusted X / Easting | coordonnée ajustée | m |
| Adjusted Y / Northing | coordonnée ajustée | m |
| Adjusted Z / Height | coordonnée ajustée | m |
| Delta X | X ajusté − X initial de la version | m |
| Delta Y | Y ajusté − Y initial de la version | m |
| Delta Z | Z ajusté − Z initial de la version | m |
| Sigma X/Y/Z | incertitudes 1σ | m |

Les variables appartiennent au processing et sont créées une fois. Une nouvelle configuration ne
crée pas de nouvelles variables.

### Variables globales

| Variable | Valeur |
|---|---|
| Chi2 Passed | 1/0 |
| Variance Factor | numérique |
| References Available | nombre de références présentes/utilisées |
| Target Availability | `observed active output targets / total active output targets × 100` |
| Provisional Flag | 1/0, optionnel mais recommandé |
| Quality Code | enum numérique documenté, optionnel |

Si une cible n'est pas ajustée pour un slot, ne pas inventer sa coordonnée. Le taux global indique
l'incomplétude. Pour un point physique partagé, la coordonnée peut être diffusée aux cibles BTM
liées si le mapping actif le prévoit ; la provenance du run indique quelles observations ont contribué.

### Nommage

Prévisualiser les noms de variables selon les conventions BTM, mais les IDs sont créés côté API.
Permettre une personnalisation de l'alias sans casser la composante métier.

## Étape 9 — Review & Create

### Résumé priorisé

1. erreurs bloquantes ;
2. warnings/fallbacks ;
3. stations et connectivité ;
4. cibles/références/points partagés ;
5. corrections non nulles ;
6. coordonnées initiales et couverture ;
7. template STAR*NET et overrides ;
8. run/synchronisation/catch-up ;
9. variables de sortie ;
10. période de validité et activation.

Afficher les engine names qui seront écrits dans le `.dat` et les collisions éventuelles.

### Actions

- `Test one epoch` ;
- `Create inactive` ;
- `Create and activate`, disponible si les validations minimales passent ;
- `Save draft`.

La création est atomique : processing, première version, mappings et variables de sortie. En cas
d'échec, ne laisser aucun processing partiel.

## Prompt ciblé

> Implémente Adjustment, Run, Output et Review selon ce document. Les paramètres Adjustment sont
> uniquement STAR*NET. Sépare clairement les itérations de solution et Auto Adjust. Implémente la
> sélection des cycles fresh/reused/missing, les slots alignés, le catch-up et l'UPSERT simulé.
> Crée la matrice de variables stables et la revue priorisée. Test one epoch doit exécuter le moteur
> de démo, produire diagnostics et previews sans publier. Ajoute tests pour :25/:26/:32→:30,
> station manquante réutilisée, catch-up, χ² fail/auto-adjust et aucune nouvelle variable par version.
