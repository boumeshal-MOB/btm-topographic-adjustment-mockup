# BTM Topographic Adjustment Mock-up

Maquette interactive du futur processing BTM `Topographic Adjustment`, avec parcours station
unique/réseau, Analysis Lab, moteur scientifique de prévisualisation et pilote STAR*NET 14 sur VM
Windows.

## Démarrage

```bash
npm ci
npm run dev
```

Validation complète :

```bash
npm run typecheck
npm run lint
npm run test
npm run test:python
npm run check:validation-data
npm run build
npm run test:e2e
```

## Carte de lecture

1. [`CLAUDE.md`](CLAUDE.md) — garde-fous et méthode économique pour un agent de code.
2. [`PROJECT_MAP.md`](PROJECT_MAP.md) — état et localisation des modules.
3. Un seul des trois documents de périmètre, selon la tâche :
   - [`PRODUIT-ET-PARCOURS.md`](docs/topographic-adjustment/PRODUIT-ET-PARCOURS.md) — ce que le
     processing doit permettre, écran par écran, et l'expérience visée ;
   - [`DOMAINE-ET-STARNET.md`](docs/topographic-adjustment/DOMAINE-ET-STARNET.md) — contrats, règles,
     formules, templates, génération et exécution STAR*NET ;
   - [`VALIDATION.md`](docs/topographic-adjustment/VALIDATION.md) — les 100 jeux, les contrôles
     permanents, ce qui est résolu et ce qui reste ouvert.

Les instructions opérationnelles restent près de leur code : `packages/lambdas/topographic-adjustment/`,
`server/starnet14-service/`, `server/starnet14/` et `server/simulator/`.

## Architecture de calcul

- `packages/python/topographic-adjustment-core` : référence Python 3.12 testable ;
- `packages/lambdas/topographic-adjustment` : frontière Lambda stateless prévue pour BTM ;
- `src/domain` : contrats et miroir TypeScript pour la maquette statique ;
- `server/starnet14-service` : pilote d'exécution STAR*NET sur Windows licencié ;
- `public/demo-datasets/v1` : 100 réseaux synthétiques déterministes pour les tests.

Vercel ne contient ni exécutable ni licence STAR*NET. Le propriétaire du dépôt merge les Pull
Requests et déploie `main`; les agents travaillent sur des branches et ne déploient pas.
