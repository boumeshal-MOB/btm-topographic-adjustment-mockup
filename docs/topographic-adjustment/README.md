# Documentation BTM Topographic Adjustment

La documentation est volontairement courte et divisée par périmètre. Les anciens plans de PR,
prompts successifs et audits résolus ont été supprimés ; les tests et l'historique Git en gardent
la trace sans consommer le contexte des prochaines sessions.

| Document | Question traitée |
|---|---|
| [`PRODUCT-AND-WORKFLOW.md`](PRODUCT-AND-WORKFLOW.md) | Que doit permettre le processing, du wizard au recalcul ? |
| [`DOMAIN-ARCHITECTURE-AND-RULES.md`](DOMAIN-ARCHITECTURE-AND-RULES.md) | Quels contrats, règles, formules, templates et frontières BTM préserver ? |
| [`FRONTEND-AND-ANALYSIS-LAB.md`](FRONTEND-AND-ANALYSIS-LAB.md) | Quelle expérience proposer, notamment pour l'analyse interactive ? |
| [`VALIDATION-DATASETS.md`](VALIDATION-DATASETS.md) | Comment utiliser/régénérer les 100 cas scientifiques ? |
| [`STARNET-AND-WINDOWS-SERVICE.md`](STARNET-AND-WINDOWS-SERVICE.md) | Comment générer, exécuter et parser STAR*NET sur Windows ? |
| [`VALIDATION-AND-OPEN-DECISIONS.md`](VALIDATION-AND-OPEN-DECISIONS.md) | Qu'est-ce qui est vérifié et que reste-t-il réellement à décider ? |

Pour un agent de code, commencer par `CLAUDE.md`, `PROJECT_MAP.md`, puis ouvrir un seul document de
périmètre. La prochaine mission complète est dans `NEXT-CLAUDE-TASK.md`.

Les instructions opérationnelles spécifiques restent près de leurs modules :

- `packages/lambdas/topographic-adjustment/README.md` ;
- `server/starnet14-service/README.md` ;
- `server/starnet14/README.md` ;
- `server/simulator/README.md`.
