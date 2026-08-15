# Claude Code — règles du dépôt

## Mission

Améliorer une maquette fonctionnelle et maximiser le code réutilisable dans BTM. Préserver la
justesse topographique, les contrats et les parcours ; simplifier librement l'interface.

## Lecture économique obligatoire

Au début d'une tâche :

1. lire `PROJECT_MAP.md` ;
2. utiliser une requête Graphify ciblée si `graphify-out/graph.json` existe ;
3. lire seulement le document de périmètre cité par la tâche et les fichiers de code concernés ;
4. inspecter les tests avant de modifier ;
5. vérifier toute relation Graphify `INFERRED` dans le source.

Pour la prochaine mission, lire `NEXT-CLAUDE-TASK.md`. Ne pas relire tous les documents.

Ne jamais ouvrir en entier :

- `src/demo/fixtures/ats34.generated.json` ;
- les shards `public/demo-datasets/v1/shards/*.json`.

Lire leurs contrats/manifests puis charger uniquement le fragment requis. Les shards sont générés,
pas édités manuellement.

## Autonomie Git

Autorisé : branche, commits cohérents, push, création/mise à jour d'une Draft PR, correction de CI
et commentaires de preuve. Interdit : push direct `main`, merge, déploiement, secrets, réécriture
d'historique partagé ou décision produit inventée.

Une seule PR cohésive est préférable quand elle livre un résultat testable. Ne découper que si une
frontière technique ou un risque de revue le justifie.

## Invariants produit

- Nouveau type `Topographic Adjustment`, jamais `Theodolite`.
- Un processing = une station ou un réseau connecté ; groupes indépendants séparés.
- Observations déjà dans BTM, pas d'upload web.
- Mapping station/variable/prisme et identité physique explicites et versionnés.
- Aucun shared point déduit automatiquement d'un nom.
- EDM, réflecteur, constantes, hauteur et poids par station–cible ; setups mixtes permis.
- Coordonnées initiales fournies ou calcul local avec station XYZ+orientation fixée.
- Agrégation initiale par médianes sur une fenêtre avec couverture ; fenêtre ≠ validité.
- Époque source, slot UTC et validité de configuration distincts.
- Corrections prisme/atmosphère une fois ; `.SCALE` n'est pas la T/P ; reflectorless delta zéro.
- Variables de sortie stables ; recalcul par UPSERT ; χ² `not-applicable` efface l'ancien booléen.
- Versions utilisées immuables ; resolver historique par slot.
- Preview Python/TypeScript non certifiée ; production = STAR*NET Ultimate Windows.
- Fichiers STAR*NET éphémères et régénérables ; base BTM future = source de vérité.
- Pas de mode expert : interface compacte + options avancées pour tous.

## Frontières techniques

- Domaine pur, aucune formule dans les composants React.
- I/O derrière repositories/gateways ; adaptateurs démo remplaçables.
- Composants réutilisables compatibles React 17, MUI 5, Router 6, Query 5, RHF/Zod/i18next.
- Pas de Tailwind, Redux de feature, Formik, Yup ou Axios sans décision explicite.
- Unités et provenance visibles ; presets/payloads validés par schéma.
- Conserver les moteurs validés. Une modification scientifique commence par un test minimal qui
  prouve le problème, puis ajoute un golden/parity test.
- Aucun secret VM dans code, logs, stockage navigateur, URL ou capture.

## Données de validation

Le générateur Python est l'unique source des 100 jeux. Utiliser `manifest.json`, charger un shard
à la demande et masquer `oracle` en mode aveugle. Ne pas régénérer ou réinventer les données dans
un composant.

```bash
npm run generate:validation-data
npm run check:validation-data
```

## Definition of Done d'une PR

1. outcome utilisateur et périmètre clairement décrits ;
2. code domaine/tests avec l'UI ;
3. loading/empty/error/stale/success, clavier et i18n vérifiés ;
4. typecheck, lint, tests TS/Python, catalogue, build et E2E exécutés ;
5. captures ou instructions de preview pour changements visuels ;
6. docs/Project Map mis à jour seulement si contrat ou architecture change ;
7. Graphify mis à jour après changement structurel ;
8. aucune déclaration de succès si une commande échoue : documenter le blocage exact.

Le propriétaire seul merge et déploie.
