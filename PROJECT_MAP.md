# BTM Topographic Adjustment — Project Map

## État

La baseline fonctionnelle couvre création/édition, station unique/réseau, setups FR/UK,
initialisation, ajustement preview, run/output, versions, reprocessing, Administration, Analysis
Lab et pilote STAR*NET 14. Le noyau Python, le miroir TypeScript et les générateurs/parsers natifs
sont testés. L'intégration BTM réelle reste hors maquette.

Le catalogue de 100 jeux est intégré : navigateur paresseux, mode aveugle, import d'un jeu comme
processing réel et Analysis Lab refondu autour d'une sélection synchronisée carte ↔ table ↔
inspecteur. Les moteurs sont inchangés.

## Sources courtes

| Besoin | Source |
|---|---|
| Produit et workflow | `docs/topographic-adjustment/PRODUCT-AND-WORKFLOW.md` |
| Architecture, règles, templates | `docs/topographic-adjustment/DOMAIN-ARCHITECTURE-AND-RULES.md` |
| Frontend et Analysis Lab | `docs/topographic-adjustment/FRONTEND-AND-ANALYSIS-LAB.md` |
| Catalogue synthétique | `docs/topographic-adjustment/VALIDATION-DATASETS.md` |
| STAR*NET/VM | `docs/topographic-adjustment/STARNET-AND-WINDOWS-SERVICE.md` |
| Audit courant et décisions ouvertes | `docs/topographic-adjustment/VALIDATION-AND-OPEN-DECISIONS.md` |

Ordre d'autorité : décisions confirmées → contrats/tests → fichiers/docs STAR*NET et BTM fournis →
legacy → ancienne maquette. Une inconnue reste ouverte, elle n'est pas inventée.

## Carte du code

| Périmètre | Emplacement |
|---|---|
| Shell et routes | `src/app/` |
| Wizard création/édition | `src/features/create/` |
| Liste et détail processings | `src/features/processings/` |
| Analysis Lab | `src/features/analysis/` |
| Navigateur du catalogue et session de validation | `src/features/validation/` |
| Composants partagés | `src/features/shared/` |
| Contrats, maths, temps, corrections, identité | `src/domain/` |
| Contrat catalogue, identité, mode aveugle, adaptateur | `src/domain/validation-catalogue/` |
| Chargement paresseux manifest/shard | `src/demo/validation-catalogue-gateway.ts` |
| Génération/parsing/transport STAR*NET | `src/domain/starnet/` |
| Ports repositories/moteurs | `src/repositories/` |
| Backend et fixtures démo | `src/demo/`, `src/mocks/` |
| Web Worker preview | `src/workers/` |
| Templates exécutables FR/UK | `src/configs/` |
| Noyau Python | `packages/python/topographic-adjustment-core/` |
| Adaptateur Lambda BTM | `packages/lambdas/topographic-adjustment/` |
| Service Windows et simulateur | `server/starnet14-service/`, `server/starnet14/`, `server/simulator/` |
| Passerelle Vercel | `api/starnet-service.ts` |
| Catalogue 100 jeux | `public/demo-datasets/v1/` |
| Tests frontend/E2E | `src/**/__tests__/`, `e2e/` |

## Flux principal

```text
slot de sortie
→ version valable pour le slot
→ cycles fresh/reused/missing par station
→ setup par station–cible
→ corrections uniques et tracées
→ snapshot immuable
→ preview scientifique ou STAR*NET Windows
→ rang/convergence/χ²/mapping
→ variables BTM stables et UPSERT
```

## Contrats à ne pas casser

- Brouillon unique sur les neuf intentions : General, Stations, Instruments, Targets &
  Measurements, Initialisation, Adjustment, Run, Output, Review.
- Edit part d'une version stockée et crée une nouvelle version ; il ne rouvre pas un autosave
  obsolète et ne change pas les IDs de sortie.
- Test STAR*NET appartient à Adjustment. Un processing inactif explique l'absence de slot.
- Identité : même point/noms différents = mapping explicite ; même nom/points différents =
  séparation visible.
- Initialisation locale autorise XYZ/orientation 0 et utilise la médiane de la période choisie.
- Une correction déclarée déjà appliquée n'est jamais réappliquée.
- Preview et native partagent le même snapshot mais gardent leur provenance.
- Analysis Lab sauvegarde un snapshot complet comme nouvelle version draft, jamais des mesures
  sources modifiées.
- Un jeu de validation importé devient un processing ordinaire ; seul un pointeur est persisté,
  jamais ses observations ni son oracle. Le mode aveugle est une opération sur la donnée
  (`sealDataset`), pas un indicateur d'affichage.
- L'identité vient de `targetBindings.physicalPointId` seul ; l'oracle n'est jamais lu pour la
  déduire, sinon le mode aveugle la ferait disparaître.

## Données

Les anciennes fixtures ATS34/ATS35/FR restent un adaptateur de compatibilité tant que les parcours
existants les référencent. Ne pas les étendre. Le catalogue `v1` est la source canonique des
nouveaux tests : manifest léger, dix shards, générateur Python déterministe, jeu golden
`BTM-VAL-041`.

## Production encore ouverte

- recette native `.dmp`, templates CRLF et différences Python/STAR*NET ;
- licence/concurrence/lock VM ;
- toutes les relations géométriques dans UI→Python→STAR*NET ;
- tables/API/jobs/publication BTM ;
- formule atmosphérique et poids/centrages FR approuvés ;
- rétention diagnostics et mapping final métriques/unités.

La liste détaillée et la recette vivent uniquement dans
`docs/topographic-adjustment/VALIDATION-AND-OPEN-DECISIONS.md`.
