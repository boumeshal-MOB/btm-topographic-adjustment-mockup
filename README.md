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
3. [`docs/topographic-adjustment/README.md`](docs/topographic-adjustment/README.md) — périmètres
   fonctionnels/techniques et catalogue de validation.
4. [`NEXT-CLAUDE-TASK.md`](NEXT-CLAUDE-TASK.md) — prochaine mission de refactor, prête à copier.

## Architecture de calcul

- `packages/python/topographic-adjustment-core` : référence Python 3.12 testable ;
- `packages/lambdas/topographic-adjustment` : frontière Lambda stateless prévue pour BTM ;
- `src/domain` : contrats et miroir TypeScript pour la maquette statique ;
- `server/starnet14-service` : pilote d'exécution STAR*NET sur Windows licencié ;
- `public/demo-datasets/v1` : 100 réseaux synthétiques déterministes pour les tests.

Vercel ne contient ni exécutable ni licence STAR*NET. Le propriétaire du dépôt merge les Pull
Requests et déploie `main`; les agents travaillent sur des branches et ne déploient pas.
