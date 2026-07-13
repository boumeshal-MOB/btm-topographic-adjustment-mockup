# Presets de configuration

Les fichiers de ce dossier sont des seeds versionnés pour la maquette et le catalogue de templates.
Ils ne sont pas encore des `AdjustmentConfigVersion` complètes : stations, variables BTM, cibles,
références, coordonnées, validité et auteurs ne peuvent être résolus qu'au moment de la création du
processing.

## Résolution

```text
CountryPreset seed
  + sélection et métadonnées BTM
  + choix/overrides utilisateur
  + IDs de variables et mappings physiques
  + coordonnées initiales calculées ou connues
  = ConfigurationVersion résolue et immuable
```

Créer deux schémas Zod distincts :

- `CountryPresetSchema`, qui autorise les champs de projet encore à valider ;
- `ResolvedAdjustmentConfigVersionSchema`, strict, qui refuse toute valeur manquante avant test ou activation.

`null` dans un seed signifie « décision requise », jamais zéro. Le preset France laisse notamment
`adjustment.defaultWeights` à `null` car les poids/centrages STAR*NET du chantier n'ont pas été
confirmés. La validation Review doit bloquer l'activation tant qu'ils ne sont pas résolus.

Chaque champ résolu conserve : template ID/version, valeur finale, source et éventuel override. Une
modification future du JSON seed ne change aucune version de processing déjà créée.
