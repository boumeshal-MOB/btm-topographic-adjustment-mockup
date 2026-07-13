# Guide opérationnel — GitHub, Claude Code, Graphify et Pull Requests

## 1. Résultat recherché

Créer un nouveau repository GitHub privé contenant une maquette React fonctionnelle. Claude Code
développe, teste, pousse et ouvre les Pull Requests. Le Product Owner merge les PR puis déploie la
branche `main` sur Vercel à la fin.

```text
Spécifications → GitHub privé → Claude Code → PR fonctionnelles → merge PO → Vercel
```

Claude ne doit ni merger, ni déployer, ni gérer les secrets.

## 2. Création du repository

Nom recommandé :

```text
btm-topographic-adjustment-mockup
```

Paramètres :

- visibilité `Private` recommandée ;
- branche par défaut `main` ;
- ne pas initialiser avec un framework si Claude doit produire le scaffold ;
- autoriser les Pull Requests ;
- protéger `main` dès que possible : PR obligatoire et checks verts.

Le propriétaire clone/ouvre le dépôt dans Claude Code ou donne à Claude Code l'URL et les droits
GitHub nécessaires au push et à la création de PR.

## 3. Structure initiale avant le premier prompt

### Option A — structure déjà décompressée

Copier le dossier de spécification complet dans :

```text
docs/topographic-adjustment/
```

Copier ensuite :

```text
github-starter/PROJECT_MAP.md                     → PROJECT_MAP.md
github-starter/CLAUDE.md                          → CLAUDE.md
github-starter/.graphifyignore                    → .graphifyignore
github-starter/.github/PULL_REQUEST_TEMPLATE.md   → .github/PULL_REQUEST_TEMPLATE.md
```

Le classeur ATS34 peut être placé dans un repository privé sous :

```text
tools/demo-source/ATS34-Raw-Data-Lookup-Header.xlsx
```

Il reste une source de build/développement, jamais un upload proposé dans l'interface. Le script de
conversion produit une fixture JSON déterministe. `.graphifyignore` exclut le classeur de l'index.

Commit initial recommandé :

```text
docs: add topographic adjustment specification and AI project context
```

### Option B — la plus simple depuis l'interface GitHub

Si le propriétaire ne souhaite pas recréer les dossiers manuellement :

1. déposer `BTM-Topographic-Adjustment-Spec.zip` à la racine du repository ;
2. connecter Claude Code au repository ;
3. demander à Claude, dans la branche de PR-01, d'extraire **le contenu** du dossier supérieur
   `BTM-Topographic-Adjustment-Spec/` sous `docs/topographic-adjustment/` afin d'obtenir directement
   `docs/topographic-adjustment/README.md` ;
4. lui demander de copier les quatre fichiers `github-starter` à leur destination ;
5. supprimer le ZIP de la branche une fois les fichiers extraits ;
6. poursuivre dans la même PR avec l'application fonctionnelle.

Ainsi, la première PR reste bien une PR fonctionnelle ; il n'est pas nécessaire d'ouvrir une PR
séparée uniquement pour la documentation.

## 4. Première instruction à Claude Code

Envoyer le bloc suivant en remplaçant l'URL :

```text
Work in this GitHub repository:
<REPOSITORY_URL>

If the repository root contains BTM-Topographic-Adjustment-Spec.zip, first create branch
feat/pr01-functional-uk-flow, extract the contents of its top-level
BTM-Topographic-Adjustment-Spec/ folder into docs/topographic-adjustment/ so that README.md is
directly under that path, copy the files from
docs/topographic-adjustment/github-starter/ to their documented root destinations, remove the ZIP
from your branch, then reread the installed CLAUDE.md and PROJECT_MAP.md before implementation.

Read, in this order:
1. /CLAUDE.md
2. /PROJECT_MAP.md
3. /docs/topographic-adjustment/README.md
4. /docs/topographic-adjustment/01-PROMPT-MAITRE-MAQUETTE.md
5. the specifications referenced for PR-01 in PROJECT_MAP.md

You own implementation planning and normal Git operations. You may autonomously:
- create branches;
- commit coherent changes;
- push your branches;
- open and update Pull Requests;
- fix CI failures in your own branches.

You must never:
- merge a Pull Request;
- push directly to main;
- deploy to Vercel;
- create or modify GitHub/Vercel secrets;
- replace a confirmed product rule with an assumption.

Start with PR-01 Functional UK single-station vertical slice as defined in PROJECT_MAP.md.
This first PR must deliver a working end-to-end application, not a scaffold.

Before coding, post a concise implementation plan inside the PR description or as your first
progress note. Do not wait for approval for routine technical choices that comply with the specs.
Ask only if a missing decision would materially change product behaviour.

Run typecheck, unit tests, relevant Playwright tests and the production build before marking the PR
ready for review. Push the branch and open the PR when the vertical slice works.
```

## 5. PR-01 obligatoire — vertical slice fonctionnel

Nom recommandé :

```text
feat: functional UK single-station adjustment flow
```

Branche :

```text
feat/pr01-functional-uk-flow
```

### Fonctionnel attendu

- shell React/Vite/MUI, navigation et i18n de feature ;
- MSW et repository de démonstration ;
- ATS34 préchargé sans import utilisateur ;
- résumé compact des données dans General ;
- sélection mono-station dans Stations ;
- instrument UK et correction atmosphérique configurables ;
- cibles et setups UK issus de la Lookup ;
- initialisation locale par défaut avec station ancre `0/0/0/0` ;
- fenêtre d'observations, médianes et couverture ;
- paramètres d'ajustement UK ;
- `Test one epoch` avec moteur de démonstration identifié comme non certifié ;
- Run et Output configurables ;
- Review sans erreur bloquante pour le happy path ;
- création du processing dans le repository de démo ;
- page d'administration minimale montrant le processing créé et sa configuration ;
- brouillon conservé pendant la navigation ;
- aucun bouton mort ;
- route SPA et build prêts pour Vercel.

### Tests minimums PR-01

- correction UK `required - alreadyApplied` ;
- médianes et couverture ;
- local anchor `0/0/0/0` ;
- stabilité des composants de sortie ;
- E2E du wizard complet jusqu'à la création ;
- réouverture du processing créé depuis Administration ;
- typecheck et build production.

### Non requis dans PR-01

Les éléments suivants peuvent être traités ensuite : mapping réseau avancé, fixture multi-stations,
FR complet, catch-up détaillé, versions historiques, Analysis Lab complet et service Windows.
Ils ne doivent pas être simulés par des boutons factices dans PR-01.

## 6. PR suivantes

Claude peut ajuster les frontières techniques, mais doit conserver les résultats fonctionnels :

| PR | Résultat attendu |
|---|---|
| PR-02 | réseau connecté, points physiques, assistant 2/3 points, relations géométriques, fixture synthétique |
| PR-03 | setups FR/UK complets, Prism/Sheet/Reflectorless, corrections et politiques T/P |
| PR-04 | synchronisation, reuse, provisoire, catch-up, grille de slots et sorties stables |
| PR-05 | versions, administration complète, Analysis Lab et reprocessing |
| PR-06 | preview STAR*NET, tests golden, accessibilité, performance, QA et documentation de reprise BTM |

Si Claude ouvre des PR empilées avant les merges, chaque PR doit préciser :

- sa branche de base ;
- les PR prérequises ;
- l'ordre de merge ;
- comment la rebaser/retargeter après le merge précédent.

## 7. Installation et usage Graphify

Après que PR-01 contient un scaffold fonctionnel :

```bash
uv tool install graphifyy
graphify install --project
```

Dans Claude Code :

```text
/graphify .
```

Graphify produit :

```text
graphify-out/
├── GRAPH_REPORT.md
├── graph.json
└── graph.html
```

Versionner `GRAPH_REPORT.md` et `graph.json`. `graph.html` est optionnel. Ignorer caches et fichiers
convertis. Pour les mises à jour structurelles :

```text
/graphify . --update
```

Commandes de navigation :

```text
/graphify query "what connects output slots to measures upsert?"
/graphify explain "InitialisationConfig"
/graphify path "TargetBinding" "ProcessingOutputVariable"
```

Graphify aide à localiser le code ; il ne remplace pas les règles métier. Une arête `INFERRED` doit
être confirmée dans la source.

## 8. Revue et merge par le Product Owner

Pour chaque PR :

1. ouvrir la preview/captures et lire le résumé ;
2. vérifier le parcours utilisateur indiqué ;
3. contrôler que les checks sont verts ;
4. vérifier les limites déclarées et l'absence de bouton factice ;
5. demander les corrections dans la PR si nécessaire ;
6. merger uniquement dans l'ordre des dépendances.

Le Product Owner ne déploie sur Vercel qu'après le merge de la version qu'il souhaite tester.

## 9. Déploiement Vercel par le Product Owner

Importer le repository GitHub dans Vercel avec :

```text
Framework preset: Vite
Install command: npm ci
Build command: npm run build
Output directory: dist
```

La configuration doit contenir une rewrite SPA vers `/index.html`. Aucun secret STAR*NET ou BTM
réel n'est nécessaire à la maquette. Les previews automatiques de PR peuvent être activées, mais le
déploiement de production reste sous le contrôle du propriétaire.

## 10. Passage ultérieur au développeur BTM

Le développeur part du repository GitHub, du Project Map et du graphe à jour. Il conserve domaine,
schémas, composants et tests puis remplace :

| Maquette | BTM réel |
|---|---|
| fixture JSON | `raw_data` |
| MSW | Fastify |
| repository local | PostgreSQL/TimescaleDB |
| Web Worker | service Windows STAR*NET |
| état de démo | variables du processing + `measures` |

Les prompts 9, 10 et 11 de `implementation/31-PROMPTS-IMPLEMENTATION.md` guident cette seconde phase.
