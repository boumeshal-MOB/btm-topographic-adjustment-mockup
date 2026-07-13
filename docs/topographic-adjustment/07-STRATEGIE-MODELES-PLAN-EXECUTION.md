# Stratégie de modèles — plan puissant, exécution économique

## 1. Principe

Utiliser le modèle le plus puissant une seule fois pour transformer les spécifications en un plan
d'implémentation précis. Utiliser ensuite un modèle moins coûteux pour exécuter un lot borné à la
fois, sans lui demander de reconstruire l'architecture ou de relire tous les documents.

```text
PR-00 contexte préparé
→ modèle puissant : IMPLEMENTATION_PLAN.md
→ validation/merge du plan
→ modèle économique : PR-01 fonctionnelle
→ modèle économique : PR suivantes
→ modèle puissant seulement pour arbitrage complexe ou audit final
```

## 2. Fichier central

Le modèle puissant crée à la racine :

```text
IMPLEMENTATION_PLAN.md
```

Ce fichier devient l'index d'exécution. Il ne remplace pas les règles métier ; il les référence.

Structure obligatoire :

```text
1. Goal and non-goals
2. Confirmed architecture
3. Repository/module structure
4. Domain contracts and invariants
5. Data and fixture strategy
6. PR dependency graph
7. PR-01 detailed vertical slice
8. Later PR plans
9. Task checklist by file/module
10. Tests mapped to rule IDs
11. Graphify/query strategy
12. Risks and explicit open decisions
13. Definition of Done
14. Execution log/checklist
```

Chaque tâche doit préciser :

- résultat observable ;
- fichiers à créer/modifier ;
- fonctions/types/composants concernés ;
- règles métier citées ;
- dépendances ;
- tests à écrire/exécuter ;
- condition de fin ;
- tâches explicitement hors scope.

## 3. Prompt du modèle puissant — création du plan

Utiliser ce prompt après le merge de PR-00 :

```text
You are the lead architect and implementation planner for this repository.

Your job is to create a precise, execution-ready plan. Do not implement application code in this
task. Do not create UI components, domain functions or tests yet.

Read in this order:
1. /CLAUDE.md
2. /PROJECT_MAP.md
3. /docs/topographic-adjustment/README.md
4. /docs/topographic-adjustment/00-PROJET-GLOBAL.md
5. /docs/topographic-adjustment/01-PROMPT-MAITRE-MAQUETTE.md
6. /docs/topographic-adjustment/domain/20-REGLES-METIER.md
7. /docs/topographic-adjustment/domain/21-CONTRATS-DE-DONNEES.md
8. /docs/topographic-adjustment/implementation/30-REUTILISATION-DU-PROTOTYPE.md
9. /docs/topographic-adjustment/implementation/32-TESTS-CRITERES-ACCEPTATION.md
10. the remaining detailed documents only when referenced by those sources.

Create a branch:

plan/implementation-roadmap

Create /IMPLEMENTATION_PLAN.md.

The plan must be detailed enough that a lower-cost execution model can implement each task without
redesigning the solution or rereading the entire specification.

The plan must contain:
- confirmed architecture and non-negotiable boundaries;
- proposed repository/module structure;
- exact PR dependency graph;
- a detailed PR-01 UK single-station vertical slice that produces a working application;
- later PRs for network, FR/mixed measurements, time/catch-up/output, administration/Analysis Lab,
  STAR*NET preview and QA;
- task checklist by file or module;
- exact business rule IDs for every task;
- tests and acceptance criteria mapped to each task;
- fixture and demo/production boundary;
- Graphify build/query/update points;
- risks and decisions that must not be guessed;
- Definition of Done for each PR;
- an execution log section that later models can update without rewriting architecture.

Optimise for low-token execution:
- avoid repeating prose already in the specifications;
- link each task to the minimum source files required;
- group related rules into bounded implementation slices;
- identify reusable utilities before proposing new code;
- include exact verification commands;
- separate mandatory PR-01 work from advanced follow-up work.

Do not weaken PR-01 into a scaffold. PR-01 must deliver the complete working UK single-station
journey defined in PROJECT_MAP.md.

Check the plan for contradictions with the business rules. If information is unconfirmed, record it
as an open decision and provide the safest mock-up boundary; do not invent a production value.

Commit and push the plan branch and open a Pull Request titled:

docs: add execution-ready implementation plan

The repository owner will review and merge it. Do not merge and do not deploy.
```

## 4. Validation du plan par le Product Owner

Avant merge, vérifier uniquement :

- PR-01 reste fonctionnelle de bout en bout ;
- aucune décision produit confirmée n'a été modifiée ;
- le plan distingue clairement maquette et production BTM ;
- les tâches ont des résultats et tests précis ;
- les fonctions avancées sont bien dans les PR suivantes ;
- les inconnues sont visibles et non inventées.

Le Product Owner merge ensuite le plan dans `main`.

## 5. Prompt du modèle économique — exécution

Utiliser ensuite ce prompt pour PR-01, puis remplacer `PR-01` par le prochain lot :

```text
Execute PR-01 from /IMPLEMENTATION_PLAN.md.

Follow /CLAUDE.md and /PROJECT_MAP.md.

Context budget rules:
1. Read only the PR-01 section and its direct dependencies in IMPLEMENTATION_PLAN.md.
2. Run scoped Graphify queries for the modules/types involved.
3. Read only the source/specification files explicitly cited by the plan task being executed.
4. Do not reread the full docs directory.
5. Do not redesign architecture already decided in the approved plan.
6. If the plan contradicts a confirmed rule or lacks a product decision that changes behaviour,
   stop that task, record the blocker and continue with independent tasks when safe.

You may autonomously create the branch, commit coherent changes, push and open/update the Pull
Request. You may fix tests and CI failures on your branch.

You must not merge, deploy, modify secrets or push directly to main.

For each task:
- implement the smallest complete vertical behaviour;
- add/update its tests;
- run the verification commands specified in the plan;
- check the task in IMPLEMENTATION_PLAN.md;
- add commit/PR evidence to the execution log;
- avoid unrelated refactors.

PR-01 must end with a working UK single-station journey, not partial screens.

Before opening or marking the PR ready:
- run typecheck;
- run unit/component tests;
- run the Playwright happy path;
- run the production build;
- verify no dead primary actions;
- verify no raw-observation upload;
- verify the Vercel mock-up works without a real backend.

Open/update the PR with screenshots, rule IDs, tests, deferred items and known limitations.
Do not merge and do not deploy.
```

## 6. Prompt économique pour une tâche corrective simple

```text
Implement only task <TASK_ID> from IMPLEMENTATION_PLAN.md.

Read PROJECT_MAP.md, that task, its direct dependencies and the cited files only. Use a scoped
Graphify query before reading code. Do not redesign architecture or touch unrelated modules.

Add the specified test, run the task verification commands, update the execution log, commit and
push to the current PR branch. Report only outcome, tests and any blocker.
```

## 7. Quand réutiliser le modèle puissant

Uniquement pour :

- arbitrage topographique ou architecture non prévue ;
- contradiction entre règles et plan ;
- modification transversale de plusieurs PR/modules ;
- refonte après échec de la stratégie ;
- audit final avant validation de la maquette ;
- plan de transplantation dans le vrai BTM.

Les corrections de formulaire, tests, styles, mapping déjà spécifié et petits bugs restent au modèle
économique.

## 8. Discipline de mise à jour

- Le plan est modifié par le modèle puissant pour les décisions structurelles.
- Le modèle économique coche les tâches et ajoute les preuves sans réécrire l'architecture.
- `PROJECT_MAP.md` ne change que si architecture, contrat ou statut de milestone change.
- Graphify est mis à jour après une PR structurelle.
- La documentation détaillée reste la source de vérité métier.
