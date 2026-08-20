# Claude Code — règles du dépôt

## Mission

Améliorer une maquette fonctionnelle et maximiser le code réutilisable dans BTM. Préserver la
justesse topographique, les contrats et les parcours ; simplifier librement l'interface.

## Lecture économique obligatoire

Au début d'une tâche :

1. lire `PROJECT_MAP.md` ;
2. utiliser une requête Graphify ciblée si `graphify-out/graph.json` existe ;
3. lire seulement le document de périmètre concerné et les fichiers de code visés ;
4. inspecter les tests avant de modifier ;
5. vérifier toute relation Graphify `INFERRED` dans le source.

Trois documents de périmètre, dans `docs/topographic-adjustment/` :

| Document | Question traitée |
|---|---|
| `PRODUIT-ET-PARCOURS.md` | Que doit permettre le processing, écran par écran, et avec quelle UX ? |
| `DOMAINE-ET-STARNET.md` | Quels contrats, règles, formules et templates préserver, et comment STAR*NET est généré/exécuté ? |
| `VALIDATION.md` | Qu'est-ce qui est vérifié, qu'est-ce qui est résolu et à ne pas défaire, que reste-t-il ouvert ? |

Ouvrir un seul des trois. Ne pas relire tout le corpus.

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

## Règle de livraison

- Une tâche est livrée dans une seule branche dédiée et une seule PR vers `main`.
- La branche est synchronisée avec `main` avant livraison ; tout conflit est résolu.
- Les validations du dépôt et la CI GitHub doivent être entièrement vertes ; corriger jusque-là.
- Claude ne merge jamais et ne déploie jamais : le merge final appartient au propriétaire.
- La livraison fournit toujours le lien de la PR et son état.

## Invariants produit

- Nouveau type `Topographic Adjustment`, jamais `Theodolite`.
- Un processing = une station ou un réseau connecté ; groupes indépendants séparés.
- Observations déjà dans BTM, pas d'upload web.
- Mapping station/variable/prisme et identité physique explicites et versionnés.
- Aucun shared point déduit automatiquement d'un nom.
- Réflecteur, constantes et hauteur par station–cible ; setups mixtes permis. Le réflecteur est
  choisi dans le template du pays et fixe ses deux constantes.
- La précision se résout par une chaîne unique, `template pays → instrument de la station → cette
  visée`, et chaque valeur affichée dit quelle étape l'a énoncée. Un σ de distance appartient à l'EDM
  et à son réflecteur, un σ angulaire à l'instrument ; aucun des deux n'appartient au projet.
  `adjustment.defaultWeights` est le défaut écrit dans le `.prj`, pas ce qui pèse une observation.
- Le référentiel se décide sur les prismes, à l'étape Cibles, avant l'ajustement. Une station n'est
  jamais fixe. Libérer un point, c'est supprimer son enregistrement de coordonnée.
- Au moins deux références **connues** et contraintes, sinon l'assistant bloque et un run ne publie
  rien : une approximation calculée à l'initialisation ne tient pas un réseau.
- Coordonnées initiales fournies ou calcul local avec station XYZ+orientation fixée.
- Agrégation initiale par médianes sur une fenêtre avec couverture ; fenêtre ≠ validité.
- Époque source, slot UTC et validité de configuration distincts.
- Corrections prisme/atmosphère une fois ; `.SCALE` n'est pas la T/P ; reflectorless delta zéro.
- Variables de sortie stables ; recalcul par UPSERT ; χ² `not-applicable` efface l'ancien booléen.
- Versions utilisées immuables ; resolver historique par slot.
- Preview Python/TypeScript non certifiée ; production = STAR*NET Ultimate Windows.
- Fichiers STAR*NET éphémères et régénérables ; base BTM future = source de vérité.
- Pas de mode expert : interface compacte + options avancées pour tous.
- Un tableau énonce, un panneau édite. Une station porte jusqu'à cent prismes : pas de champ de
  formulaire par valeur dans une ligne, et la modification de masse passe par une sélection.

## Frontières techniques

- Domaine pur, aucune formule dans les composants React.
- I/O derrière repositories/gateways ; adaptateurs démo remplaçables.
- Composants réutilisables compatibles React 17, MUI 5, Router 6, Query 5, RHF/Zod/i18next.
- Pas de Tailwind, Redux de feature, Formik, Yup ou Axios sans décision explicite.
- Unités et provenance visibles ; presets/payloads validés par schéma.
- Conserver les moteurs validés. Une modification scientifique commence par un test minimal qui
  prouve le problème, puis ajoute un golden/parity test.
- Aucun secret VM dans code, logs, stockage navigateur, URL ou capture.
- `src/repositories` contient des interfaces sans implémentation, volontairement : c'est le seam que
  la reprise BTM remplace. Ne pas le supprimer comme du code mort.
- Ne pas citer un `§N` de document : aucun document n'a de section numérotée, et trente-neuf
  commentaires ont porté des renvois faux pendant des mois. Nommer le fichier, ou le titre exact.
- Un écran ne modifie jamais la configuration à son montage : `update` est recréé à chaque rendu et
  un `useEffect` qui écrit le brouillon finit en `Maximum update depth exceeded`, remonté loin de la
  cause.

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
5. captures pour tout changement visuel — les lire, pas seulement les produire : `σ` rendu `Σ` par
   un `text-transform`, un placeholder MUI invisible et un `Select` vide ont tous passé le typecheck
   et les tests, et n'ont été vus que sur l'image ;
6. docs/Project Map mis à jour seulement si contrat ou architecture change ;
7. Graphify mis à jour après changement structurel ;
8. aucune déclaration de succès si une commande échoue : documenter le blocage exact.

Le propriétaire seul merge et déploie.
