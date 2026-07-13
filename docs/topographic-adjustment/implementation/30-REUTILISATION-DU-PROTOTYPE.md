# Stratégie de réutilisation du prototype existant

Le prototype actuel contient des briques utiles, mais il ne doit pas être copié intégralement. La
stratégie est de porter le domaine pur et les composants scientifiques derrière des interfaces,
puis de remplacer les choix de démonstration incompatibles avec BTM.

Les chemins ci-dessous se rapportent au dépôt actuel de maquette.

## 1. Réutiliser presque tel quel

| Module | Utilité | Action |
|---|---|---|
| `src/engine/geometry.ts` | angles, azimuts, polaire→ENH | extraire en package domaine pur |
| `src/engine/linalg.ts` | QR rank-revealing, covariance, ellipses | conserver pour moteur de démo/tests |
| `src/engine/stats.ts` | χ², quantiles, confiance | conserver pour démo et validations |
| `src/engine/localGeometry.ts` | transformation entre nuages locaux | conserver et renforcer les tolérances H/V |
| `src/engine/initial.ts` | médianes et coordonnées initiales | conserver, adapter aux nouveaux IDs BTM |
| `src/engine/pointIdentity.ts` | mapping, validation, connectivité | conserver les fonctions pures |
| `src/components/NetworkView.tsx` | réseau et ellipses | porter vers MUI/theme BTM |
| `src/components/charts.tsx` | résidus, χ², tendances | porter, ajouter accessibilité |
| `src/store/configTimeline.ts` | validité et résolution par slot | conserver, renommer domaine si nécessaire |
| `src/data/ats34.generated.json` | fixture UK réelle | conserver uniquement dans l'adaptateur démo |
| `scripts/convert-ats34.mjs` | conversion build-time | conserver comme outil développeur |

## 2. Réutiliser avec refactor important

### `src/engine/corrections.ts`

Conserver : formule versionnée, validation T/P, trace détaillée et calcul différentiel.

Adapter :

- la configuration de mesure devient autorité par `station × cible` ;
- les quatre modes atmosphériques et politiques manquantes sont explicites ;
- `.SCALE` n'est jamais alimenté par la formule atmosphérique ;
- la sortie fournit la distance finale destinée au builder `.dat` ;
- la source de chaque valeur est obligatoire.

### `src/engine/adjust.ts` et `src/engine/runner.ts`

Conserver uniquement comme `DemoAdjustmentEngine`. Ne pas les appeler moteur de production et ne
pas répliquer leurs paramètres locaux dans le modèle STAR*NET.

Créer une interface :

```ts
interface AdjustmentEngine {
  testEpoch(input: ResolvedRunInput, signal?: AbortSignal): Promise<AdjustmentDiagnostic>;
}
```

Implémentations : `BrowserLeastSquaresDemoEngine` et contrat futur `StarNetApiGateway`.

### `src/store/runExecution.ts`

Conserver : `slotMs`, `listSlots`, sélection fresh/reused/missing et assemblage de snapshot.

Corriger :

- ne plus créer `OutputResultVersion` ;
- simuler un UPSERT unique par variable/timestamp ;
- séparer mapping de variables stable et mapping physique versionné ;
- ajouter variables globales de qualité ;
- sélectionner la configuration par slot historique ;
- ne pas conserver de faux artefacts comme source de vérité.

### `src/components/PointIdentityPanel.tsx`

Conserver la logique d'assistant, mais :

- aucune donnée commune seedée pour le nouveau processing ;
- résidus avec unité dans les headers ;
- paires manuelles clairement séparées des candidats ;
- cibles individuelles hors du tableau partagé ;
- meilleur support clavier et édition en drawer ;
- composants contrôlés sans accès direct au store global.

### Wizard existant

Réutiliser les sous-formulaires et validations, mais reconstruire avec react-hook-form/Zod et MUI.
Conserver neuf étapes, General→Review, et fusionner références/datum dans Initialisation.

## 3. Ne pas réutiliser comme comportement produit

| Comportement actuel | Remplacement |
|---|---|
| IndexedDB source de vérité | repository démo seulement ; BTM API en production |
| `keepAllResultVersions: true` | une mesure unique, UPSERT |
| `duplicateStrategy: new-version` | stratégie de publication `upsert` |
| variables par version | variables stables appartenant au processing |
| résultats complets du run dupliqués | mesures + journal minimal |
| fichiers équivalents inventés | preview démo ; sorties natives en production |
| `Station.edmMode` comme autorité | setup par cible/observation |
| constante générale station | required/already-applied par setup |
| points partagés issus de `AdjustmentName` | confirmation ou mapping antérieur validé |
| coordonnées fixture affichées comme connues | local-anchor par défaut |
| Tailwind dans la feature reprenable | MUI 5 du produit BTM |
| `mode standard/expert` | vue compacte + Advanced options pour tous |
| paramètres locaux du solveur dans Adjustment | paramètres STAR*NET seulement |

## 4. Modèle de packages recommandé

Pour faciliter la reprise :

```text
src/features/topographic-adjustment/
  domain/
    entities.ts
    rules/
    corrections/
    initialisation/
    point-identity/
    time-slots/
    outputs/
  application/
    create-processing.ts
    resolve-run-input.ts
    preview-reprocess.ts
    save-config-version.ts
  infrastructure/
    demo/
    api/
    engines/
  presentation/
    components/
    pages/
    forms/
```

Le domaine et les use-cases n'importent pas React. Le code démo n'est jamais importé par le futur
bundle de production si le build cible ne le souhaite pas.

## 5. Interfaces à stabiliser en premier

- `TopographicAdjustmentRepository` ;
- `AdjustmentEngine` ;
- `RawObservationRepository` ;
- `TemplateRepository` ;
- `OutputVariableRepository` ;
- `ConfigurationVersionRepository` ;
- `RunRepository` ;
- `Clock` et `IdGenerator` injectables pour tests.

## 6. Migration des types

Ne pas réutiliser directement l'ancien `types/domain.ts`. Créer les nouveaux contrats depuis
`domain/21-CONTRATS-DE-DONNEES.md`, puis écrire des adaptateurs de compatibilité temporaires.

Cela évite de conserver par accident :

- `mode: standard | expert` ;
- `validFrom` instrument/station séparé de la version ;
- `keepAllResultVersions` ;
- `duplicateStrategy: new-version` ;
- `Station.constantAppliedByStationM` global ;
- `OutputResultVersion`.

## 7. Règle de pull request

Chaque PR doit livrer une vertical slice utilisable et contenir :

- domaine + schéma Zod ;
- repository MSW ;
- UI ;
- tests unitaires ;
- un scénario Playwright ;
- aucune dépendance vers un écran legacy non nécessaire.

Ne pas faire une PR de migration massive du frontend BTM. La feature suit l'approche strangler-fig
déjà décidée.

