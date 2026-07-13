# Instructions de reprise par le développeur BTM

## 1. Objectif

Transplanter dans le monorepo BTM le domaine, les schémas, composants, formulaires, presets et tests
validés dans la maquette GitHub. Ne pas recopier l'architecture de démonstration et ne pas
redévelopper une fonction déjà suffisamment générique.

La maquette validée est une implémentation de référence UX/domaine. Les ADR et conventions réelles
du monorepo BTM restent l'autorité d'intégration.

## 2. Entrées obligatoires

Le développeur reçoit :

- repository GitHub de la maquette sur un commit/tag validé ;
- `PROJECT_MAP.md` à jour ;
- `graphify-out/GRAPH_REPORT.md` et `graph.json` à jour ;
- dossier `docs/topographic-adjustment/` ;
- rapport des tests et checklist P0 ;
- lien de la maquette Vercel validée ;
- liste des limites de simulation encore présentes.

Créer un tag de référence avant la reprise, par exemple :

```text
mockup-validated-v1
```

## 3. Première instruction au développeur ou à son agent

```text
Audit the validated topographic-adjustment mock-up and the real BTM monorepo.

Read first:
- PROJECT_MAP.md;
- docs/topographic-adjustment/02-ARCHITECTURE-BTM-CIBLE.md;
- docs/topographic-adjustment/03-RULES-IA-ET-GARDE-FOUS.md;
- docs/topographic-adjustment/implementation/30-REUTILISATION-DU-PROTOTYPE.md;
- docs/topographic-adjustment/domain/20-REGLES-METIER.md;
- BTM accepted ADRs and the actual installed package versions.

Use Graphify/query tools to locate equivalent BTM modules before reading broad directories.

Do not modify code yet. Produce:
1. a reuse/refactor/replace matrix for every mock-up module;
2. the actual BTM paths and owners affected;
3. DB migrations and API changes required;
4. the Windows service boundary;
5. a dependency-aware PR plan;
6. risks, unknowns and ADR-worthy decisions.

Do not propose Lambda, S3, CoMeT or reuse of Theodolite. Do not port MSW, IndexedDB, fixtures or the
demo solver into production paths.
```

## 4. Matrice de transplantation

| Maquette | Action BTM |
|---|---|
| types, schemas Zod, fonctions pures | porter presque directement et retester |
| composants MUI du wizard/admin | intégrer dans la feature moderne et brancher sur hooks BTM |
| TanStack Query hooks | conserver l'API des hooks, remplacer les appels repository |
| DemoRepository/MSW | conserver uniquement pour tests frontend |
| fixture ATS34/synthétique | conserver uniquement comme tests/fixtures anonymisées |
| IndexedDB/local storage | remplacer par API/configuration PostgreSQL ; brouillon local UI possible selon convention BTM |
| DemoAdjustmentEngine/Web Worker | conserver pour tests de maquette seulement, jamais production |
| STAR*NET preview builder pur | réutiliser dans le service Windows avec golden tests |
| config timeline/version resolution | porter côté domaine/API/worker |
| output UPSERT simulation | remplacer par transaction réelle `measures` |
| Analysis Lab UI | brancher sur endpoints de trials/jobs réels |

## 5. PR de production recommandées

### PR BTM-01 — domaine et contrats partagés

- types et schémas stricts ;
- règles de temps, corrections, mapping, initialisation et sorties ;
- presets FR/UK ;
- tests unitaires/golden indépendants de l'UI ;
- aucune migration ni UI si cela rend la PR plus reviewable.

### PR BTM-02 — base et API Fastify

- migration forward-only du nouveau `processing_type` ;
- tables/JSONB de versions, output mappings, jobs, runs et audit ;
- endpoints Fastify TypeScript/Zod ;
- transactions atomiques ;
- variables de sortie stables ;
- tests Fastify/PostgreSQL.

### PR BTM-03 — frontend BTM

- enregistrement du nouveau type et routes ;
- wizard/admin réutilisés ;
- repositories BTM ;
- bridge i18n ;
- MSW et E2E double piste ;
- aucun écran d'import de données brutes.

### PR BTM-04 — worker Windows STAR*NET

- claiming idempotent des jobs ;
- lecture bornée `raw_data`/T/P ;
- sélection d'époques et snapshot immuable ;
- workspace isolé ;
- génération `.dat/.snproj` ;
- exécution/lock de licence ;
- parsing natif ;
- transaction d'UPSERT ;
- nettoyage et récupération après crash.

### PR BTM-05 — event-driven, catch-up et reprocessing

- watermarks/détection de nouvelles données ;
- synchronisation, reuse et provisoire ;
- grille des slots ;
- donnée tardive et limites de catch-up ;
- résolution historique des versions ;
- dry-run de recalcul.

### PR BTM-06 — Analysis Lab et durcissement

- trials non publiants ;
- résidus/ellipses/rang/χ² ;
- sauvegarde en nouvelle version ;
- observabilité, sécurité et audit ;
- performance TimescaleDB ;
- tests d'intégration Windows et pilote.

Le développeur peut ajuster les frontières selon les packages et propriétaires BTM, mais doit
conserver les dépendances et critères fonctionnels.

## 6. Invariants de données

- `raw_data` reste intact ;
- les mappings Hz/Vz/Sd/T/P utilisent des IDs explicites ;
- les variables de sortie appartiennent au processing ;
- aucune variable supplémentaire n'est créée lors d'une nouvelle version ;
- une seule valeur finale existe par `(variable_id, timestamp)` ;
- un recalcul UPSERT la valeur existante ;
- les coordonnées ajustées ne sont pas dupliquées dans le journal des runs ;
- une version utilisée est immuable et reste résolvable historiquement ;
- les fichiers Windows ne sont jamais la source de vérité.

## 7. Invariants d'exécution

- STAR*NET Ultimate est le seul moteur de production ;
- chaque run possède un workspace isolé ;
- un snapshot résolu ne dépend plus du catalogue de templates courant ;
- aucun résultat partiel si parsing/mapping/DB échoue ;
- publication et statut sont transactionnels ;
- la suppression du workspace intervient après commit ;
- le lock de licence est explicite si nécessaire ;
- les jobs sont idempotents ;
- le catch-up republie le même slot avec la version historiquement valide.

## 8. Contrats à ne pas casser

Le développeur peut adapter les noms SQL et endpoints aux conventions BTM, mais doit préserver :

- identité stable du processing ;
- version/config snapshot ;
- `station × target` measurement setup ;
- PhysicalPoint et mapping inverse engine name ;
- séparation observation epoch/output slot/validity ;
- composants de sortie ;
- erreurs typées avec règle/champ/action ;
- comportement des templates et provenance.

Tout changement de sémantique doit être discuté et documenté avant implémentation.

## 9. Tests de non-régression obligatoires

- mêmes fonctions pures dans la maquette et BTM ou même golden expectations ;
- double piste E2E : MSW rapide et Fastify/PostgreSQL réelle ;
- golden files pour builder/parser STAR*NET ;
- test cinq processings simultanés avec mêmes noms locaux ;
- frontières de versions et recalcul multi-version ;
- :25/:26/:32 vers slot :30 ;
- T/P tardive et observation tardive ;
- point partagé diffusé aux bonnes variables cibles ;
- aucune publication partielle ;
- accès borné TimescaleDB et performance sur fenêtres réalistes.

La checklist complète reste
[`implementation/32-TESTS-CRITERES-ACCEPTATION.md`](implementation/32-TESTS-CRITERES-ACCEPTATION.md).

## 10. Definition of Done BTM

- nouveau type disponible dans BTM sans toucher les comportements `Theodolite` ;
- création et administration conformes à la maquette validée ;
- traitement réel d'une époque pilote par STAR*NET ;
- résultats correctement mappés dans les variables du processing ;
- recalcul idempotent ;
- versions historiques correctement résolues ;
- tous les P0 applicables couverts ;
- audit sécurité/observabilité réalisé ;
- runbook Windows et procédure de recovery documentés ;
- aucun composant de démonstration sur le chemin de production.
