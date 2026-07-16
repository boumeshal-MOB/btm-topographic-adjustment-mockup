# État de l'implémentation et guide de reprise (maquette livrée dans la PR #4)

Complément concret au document `06-REPRISE-DEVELOPPEUR-BTM.md` (matrice de transplantation) :
ce fichier décrit ce qui EST implémenté, où, et comment le reprendre — par un développeur BTM
ou par une IA de correction. Périmètre consolidé : PR-01…PR-06 livrées ensemble dans la
branche `feat/pr01-functional-uk-flow` (PR #4, Draft).

## 1. Carte du code livré

| Couche | Emplacement | Contenu | Réutilisable BTM ? |
|---|---|---|---|
| Domaine pur | `src/domain/` | maths (QR, chi², ellipses), solveur Gauss-Newton (`math/adjust.ts`), corrections prisme/atmosphère (`corrections/`), créneaux & versions (`time/slots.ts`), identité de points & noms moteur (`point-identity/`), initialisation par médianes (`initialisation/`), plan de variables de sortie (`outputs/`), aperçus `.dat`/`.snproj` (`starnet/preview-builder.ts`), cœur du moteur démo (`engine/`) | **Oui — port direct.** Aucun import React/MSW/IndexedDB (frontière ESLint) |
| Interfaces | `src/repositories/` | `AdjustmentEngine` (`testEpoch(input, signal?)`) et types de diagnostic | Oui — contrat du futur worker STAR*NET |
| Adaptateurs démo | `src/demo/` | `store.ts` (état + logique d'orchestration), `resolve-run.ts` (version+créneau → `ResolvedRunInput`), `catalogue.ts`, `draft.ts`, `persistence.ts` (localStorage), fixtures | Orchestration transposable dans l'API BTM ; le store lui-même est jetable |
| API simulée | `src/mocks/handlers.ts` + `src/api/client.ts` | Surface REST `/api/v2/*` (MSW, active en dev ET en prod Vercel) | La surface REST est le contrat : remplacer MSW par Fastify sans toucher au reste |
| Worker | `src/workers/` | `BrowserLeastSquaresDemoEngine` (Web Worker + abort + repli synchrone) | Remplacé par le worker Windows STAR*NET en production |
| UI | `src/features/` | wizard 9 étapes (`create/WizardPage.tsx`), administration (`processings/`), détail de run, Analysis Lab (`analysis/`), composants partagés (`shared/`) | Oui — MUI 5, React Router v6, TanStack Query v5, compatible React 17 (aucune API React 18 hors `src/main.tsx`) |

## 2. Points d'entrée pour corriger un bug

1. Reproduire via l'UI (`npm run dev`) ou via un test : `src/demo/__tests__/store.test.ts`
   couvre seed, création UK, réseau, FR, données tardives — sans navigateur.
2. La logique métier fautive est presque toujours dans `src/domain/**` (pur, testable en
   isolation) ou dans `src/demo/resolve-run.ts`/`store.ts` (orchestration).
3. L'UI ne calcule rien : elle affiche les réponses de `/api/v2/*`. Un « mauvais chiffre » se
   corrige côté domaine/store, pas dans les composants.
4. Ne jamais lire `src/demo/fixtures/ats34.generated.json` en entier (1,8 Mo) — passer par
   `src/demo/fixtures/contract.ts` ou des commandes ciblées (règle `CLAUDE.md`).

## 3. Validation locale

```bash
npm run typecheck && npm run lint && npm test   # 163 tests unitaires/intégration
npm run build && npx playwright test            # 5 parcours E2E sur le bundle construit
```

Les E2E (`e2e/journey.spec.ts`) couvrent : administration complète (runs, versions
immuables, variables stables, retraitement), wizard UK 9 étapes avec « Test one epoch » et
activation, Analysis Lab (Trial 0, alerte anti-manipulation, version candidate), confirmation
de points communs réseau (POINT-011).

## 4. Invariants à ne pas casser en reprise

- `stationCode` (texte brut) ≠ `stationId` (numérique BTM) — jamais joints implicitement.
- `ChiSquareStatus` (`passed|failed|not-applicable`) est l'unique autorité χ² ; `not-applicable`
  quand dof ≤ 0 ; aucun 1/0 fabriqué pour la variable `chi2-passed`.
- Correction prisme appliquée UNE fois : `delta = required − alreadyApplied` (CORR-002) ;
  `.SCALE` n'est jamais la correction atmosphérique T/P (CORR-007).
- Versions de configuration utilisées par un run = immuables (VER-001/002) ; évolution par
  duplication en brouillon ; résolution par créneau `[validFrom, validTo[` (TIME-007).
- Variables de sortie créées une seule fois ; recalcul = remplacement par
  `(variable_id, timestamp)` (OUT-001/009) ; rien n'est publié pour un point non observé.
- Auto Adjust exclut des observations du SEUL essai, jamais des données brutes (DATA-007).
- Le solveur démo est étiqueté « Demo solver — not production/certified STAR*NET result »
  (DEMO-004) : ne jamais retirer cette mention ni le présenter comme certifié.

## 5. Chemin de remplacement par la vraie plateforme

1. **API** : réimplémenter la surface `/api/v2/*` de `src/mocks/handlers.ts` en Fastify ;
   les types de `src/features/shared/types.ts` décrivent les payloads attendus par l'UI.
2. **Moteur** : implémenter `AdjustmentEngine` (`src/repositories/adjustment-engine.ts`) au-
   dessus du worker STAR*NET Ultimate ; `buildDatPreview`/`buildSnprojPreview` produisent déjà
   les entrées texte.
3. **Persistance** : remplacer `DemoStore`/localStorage par la base BTM en conservant les
   invariants du §4 ; `resolve-run.ts` documente la résolution complète d'un créneau.
4. **UI** : réutilisable telle quelle (React 17 compatible) ; supprimer uniquement le
   démarrage MSW dans `src/main.tsx` et les utilitaires démo (reset, données tardives).

## 6. Moteur de calcul et formules de correction côté BTM (Python / lambda)

Décision produit BTM : les moteurs de calcul et les **formules de correction** de la vraie
plateforme sont écrits en **Python**, pour être exécutables dans de futures **lambdas BTM**. La
maquette n'implémente aucune lambda (garde-fou `CLAUDE.md`) : sa couche `src/domain/**` reste la
**référence fonctionnelle portable** que l'implémentation Python doit refléter à l'identique.

Points à préserver lors du portage TypeScript → Python :

- **Correction de distance** (`src/domain/corrections/apply-distance-corrections.ts`) : la
  séquence est prisme d'abord (`resolvePrismDelta` : Δ = requis − déjà appliqué, une seule fois,
  reflectorless = 0), puis atmosphère (`resolveAtmosphericPpm`, formule `standard-ppm-v1`). Le
  `formulaId`/`formulaVersion` porté dans chaque `CorrectionTrace` sert justement à garantir que
  la lambda Python annonce la **même** identité de formule ; ne pas changer ces identifiants sans
  versionner la formule des deux côtés (CORR-010).
- **Jamais de double correction** : si la station a déjà corrigé (mode `already-applied`, cas FR
  MPO), la lambda doit renvoyer Δ = 0 et ppm = 0 exactement comme la démo (CORR-005). Le test
  `store.test.ts` (ATS35 vs FR) fixe ce contrat en chiffres.
- **`.SCALE`/réfraction ≠ correction T/P** (CORR-007/008) : garder ces deux facteurs hors de la
  correction EDM dans le portage Python.
- **Solveur** : la lambda de calcul remplace `BrowserLeastSquaresDemoEngine` derrière l'interface
  `AdjustmentEngine` ; le format d'entrée est déjà produit par `buildDatPreview`/`buildSnprojPreview`.
  Le contrat `ResolvedRunInput → AdjustmentDiagnostic` (`src/domain/engine/run-input.ts`) est le
  point de jonction : la lambda produit un `AdjustmentDiagnostic` équivalent (statut χ² canonique
  `passed|failed|not-applicable`, jamais de 1/0 fabriqué).

Autrement dit : côté BTM on remplace l'exécution (worker navigateur → lambda Python), pas les
contrats. Les tests de non-régression du §3 servent d'oracle pour valider la parité Python.
