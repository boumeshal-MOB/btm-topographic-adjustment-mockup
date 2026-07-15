# État de l'implémentation et guide de reprise (maquette livrée dans la PR #4)

Complément concret au document `06-REPRISE-DEVELOPPEUR-BTM.md` (matrice de transplantation) :
ce fichier décrit ce qui EST implémenté, où, et comment le reprendre — par un développeur BTM
ou par une IA de correction. Périmètre consolidé : PR-01…PR-06 livrées ensemble dans la
branche `feat/pr01-functional-uk-flow` (PR #4, Draft).

## 1. Carte du code livré

| Couche | Emplacement | Contenu | Réutilisable BTM ? |
|---|---|---|---|
| Noyau scientifique | `packages/python/topographic-adjustment-core/` | corrections, cycles station, initialisation/résection réseau, moindres carrés 3D, χ², covariance/ellipses et Auto Adjust scalaire | **Référence canonique Python 3.12**, indépendante d'AWS/BTM/React |
| Adaptateur navigateur | `src/domain/` | miroir TypeScript compatible Vercel, identité des points, sorties et aperçus STAR*NET | Conservé pour la maquette statique et vérifié par vecteurs de parité Python |
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
- Le solveur est étiqueté « Scientific preview (Python-parity model) — not a certified STAR*NET result ».
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
