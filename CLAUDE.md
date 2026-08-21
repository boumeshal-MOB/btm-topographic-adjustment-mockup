# Claude Code — règles du dépôt

## Mission

Améliorer une maquette fonctionnelle et maximiser le code réutilisable dans BTM. Préserver la
justesse topographique, les contrats et les parcours ; simplifier librement l'interface.

## Lecture économique obligatoire

Au début d'une tâche :

0. lire `ETAT-ET-PROCHAINE-ITERATION.md` : ce que la dernière itération a changé, les pièges déjà
   payés, ce qui reste ouvert. Le mettre à jour à la fin d'une itération validée par le propriétaire ;
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

**UNE SEULE PR À LA FOIS. Erreur commise plusieurs fois, à ne plus jamais refaire.**

- Avant de créer une branche ou une PR : vérifier qu'aucune PR n'est ouverte. S'il y en a une, on
  **ajoute des commits dessus**, on n'en ouvre pas une seconde. Même si le sujet paraît différent.
- Avant de pousser sur une branche existante : vérifier que **sa PR est encore ouverte**. Une PR
  mergée ne déclenche plus la CI (le workflow écoute `pull_request` et `push: [main]`), donc le
  commit part dans le vide : ni CI, ni livraison, et personne ne le voit.
- Après un merge par le propriétaire : repartir de `main` à jour. Ne jamais continuer sur la branche
  qui vient d'être mergée.
- Ne jamais cherry-picker pour rattraper un mauvais aiguillage : ça laisse deux SHA pour un même
  contenu et une branche fantôme qui apparaît « non fusionnée » alors qu'elle est un doublon.
- Une tâche est livrée dans une seule branche dédiée et une seule PR vers `main`.
- La branche est synchronisée avec `main` avant livraison ; tout conflit est résolu.
- Les validations du dépôt et la CI GitHub doivent être entièrement vertes ; corriger jusque-là.
- **Vérifier la CI sur le SHA poussé, pas seulement les check-runs.** Un check-run Vercel « success »
  ne dit rien du workflow : interroger `actions/runs?branch=…` et comparer `head_sha` au HEAD local.
  Un run qui porte sur le commit précédent signifie que la CI n'a pas tourné.
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
- Fixer une station est un **dispositif de calcul** pour l'initialisation, jamais un référentiel de
  run : dès qu'un seul point est contrôlé, la station est ajustée comme le reste du réseau. Elle ne
  reste tenue que si rien d'autre ne tient le réseau, sinon la matrice normale serait singulière.
- Un point observé dont l'initialisation n'a produit aucune coordonnée entre libre à 0/0/0 avec un
  message qui le dit. L'écarter silencieusement faisait disparaître une observation faite.
- Un essai n'affiche jamais les chiffres d'un autre moteur que celui qui a tourné : lancer un test
  remet les résultats à zéro, changer de moteur remet aussi les essais à zéro, et rien n'est publié
  avant que STAR*NET ait répondu. Générer les fichiers d'entrée n'est pas un résultat.
- Au moins deux points **contraints ou fixes** parmi les cibles visées, sinon la matrice normale est
  de rang déficient : l'assistant bloque et un run ne publie rien. Ni le rôle du point ni la
  provenance de sa coordonnée n'entrent dans ce test — fixer une station pour calculer les
  approximations puis contraindre deux cibles est un référentiel valide.
- **L'initialisation est la seule source de coordonnées.** Un enregistrement de contrainte porte la
  décision et le sigma, jamais les nombres : `resolveNetworkCoordinates` les résout dans l'ordre
  `saisie à la main → déclarée par l'arpentage → calculée`. Un point sans aucune des trois n'a pas de
  coordonnée : il l'affiche (`—`, pas `0`) et ne peut pas être contraint. Un zéro écrit à sa place a
  épinglé un réseau à l'origine et fait remonter un `NaN` trois écrans plus loin.
- Coordonnées initiales fournies, ou calculées en fixant une station en XYZ + orientation. Ce n'est
  pas un « repère local » : la position tenue peut être la vraie position géoréférencée.
- Agrégation initiale par médianes sur une fenêtre avec couverture ; fenêtre ≠ validité.
- Époque source, slot UTC et validité de configuration distincts.
- Corrections prisme/atmosphère une fois ; `.SCALE` n'est pas la T/P ; reflectorless delta zéro.
- Variables de sortie stables ; recalcul par UPSERT ; χ² `not-applicable` efface l'ancien booléen.
  Les stations en ont aussi : libres pendant l'ajustement, leur position est une série. L'étape Output
  les affiche valorisées sur le cycle de l'essai, pas sous forme de compte.
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
