# BTM Topographic Adjustment — dossier de cadrage et prompts

Ce dossier est la source de référence pour construire une **nouvelle maquette interactive** du
processing BTM `Topographic Adjustment`, puis reprendre ses composants dans le produit BTM réel.

Il consolide :

- le fonctionnement utile de StarAdjust legacy ;
- les fichiers natifs STAR*NET fournis (`.dat`, `.prj`, `.snproj`, `.err`, `.pts`) ;
- le classeur ATS34 fourni pour la démonstration UK ;
- les décisions prises pendant les ateliers produit ;
- l'architecture et les ADR du produit BTM ;
- les fonctions déjà développées dans le prototype précédent qui peuvent être réutilisées.

## Ordre de lecture recommandé

1. [`00-PROJET-GLOBAL.md`](00-PROJET-GLOBAL.md) — vision, périmètre, décisions et workflow complet.
2. [`01-PROMPT-MAITRE-MAQUETTE.md`](01-PROMPT-MAITRE-MAQUETTE.md) — prompt principal à donner à l'IA.
3. [`02-ARCHITECTURE-BTM-CIBLE.md`](02-ARCHITECTURE-BTM-CIBLE.md) — frontière Vercel/BTM et architecture de production.
4. [`03-RULES-IA-ET-GARDE-FOUS.md`](03-RULES-IA-ET-GARDE-FOUS.md) — règles à placer dans le contexte permanent de l'IA.
5. [`04-SOURCES-ET-DECISIONS.md`](04-SOURCES-ET-DECISIONS.md) — provenance et usage de chaque famille de documents.
6. [`05-GUIDE-GITHUB-CLAUDE-GRAPHIFY.md`](05-GUIDE-GITHUB-CLAUDE-GRAPHIFY.md) — création du dépôt, Claude Code, Graphify et stratégie de PR.
7. [`06-REPRISE-DEVELOPPEUR-BTM.md`](06-REPRISE-DEVELOPPEUR-BTM.md) — instructions de transplantation de la maquette dans le vrai BTM.
8. [`07-STRATEGIE-MODELES-PLAN-EXECUTION.md`](07-STRATEGIE-MODELES-PLAN-EXECUTION.md) — prompt du modèle puissant puis prompt du modèle économique.
9. [`09-PYTHON-ENGINE-AND-BTM-HANDOFF.md`](09-PYTHON-ENGINE-AND-BTM-HANDOFF.md) — noyau scientifique Python, contrat Lambda et reprise BTM.
10. [`11-STARNET14-VM-BRIDGE.md`](11-STARNET14-VM-BRIDGE.md) — pilote sécurisé maquette/VM STAR*NET 14.
11. [`14-AUDIT-UX-TOPOGRAPHE-ET-I18N-FR.md`](14-AUDIT-UX-TOPOGRAPHE-ET-I18N-FR.md) — verdict métier, lexique français et écarts à traiter dans BTM.
12. Copier les fichiers prêts à l'emploi de [`github-starter/`](github-starter/) à la racine du nouveau dépôt.
13. Les spécifications frontend sous [`front/`](front/).
14. Les règles et contrats sous [`domain/`](domain/).
15. Les presets machine-readable sous [`configs/`](configs/).
16. La stratégie de reprise et les prompts d'implémentation sous [`implementation/`](implementation/).
17. Le jeu d'essai Vercel sous [`demo/`](demo/).

## Documents frontend

| Fichier | Périmètre |
|---|---|
| [`front/10-DESIGN-SYSTEM-ET-NAVIGATION.md`](front/10-DESIGN-SYSTEM-ET-NAVIGATION.md) | UX générale, navigation, composants communs, accessibilité |
| [`front/11-WIZARD-GENERAL-STATIONS-INSTRUMENTS.md`](front/11-WIZARD-GENERAL-STATIONS-INSTRUMENTS.md) | Étapes 1 à 3 |
| [`front/12-WIZARD-TARGETS-POINTS-PHYSIQUES-INITIALISATION.md`](front/12-WIZARD-TARGETS-POINTS-PHYSIQUES-INITIALISATION.md) | Étapes 4 et 5 |
| [`front/13-WIZARD-AJUSTEMENT-RUN-OUTPUT-REVIEW.md`](front/13-WIZARD-AJUSTEMENT-RUN-OUTPUT-REVIEW.md) | Étapes 6 à 9 |
| [`front/14-ADMINISTRATION-ANALYSIS-LAB.md`](front/14-ADMINISTRATION-ANALYSIS-LAB.md) | Administration, analyse, versions et recalculs |

## Documents métier et techniques

| Fichier | Périmètre |
|---|---|
| [`domain/20-REGLES-METIER.md`](domain/20-REGLES-METIER.md) | Règles numérotées et invariants |
| [`domain/21-CONTRATS-DE-DONNEES.md`](domain/21-CONTRATS-DE-DONNEES.md) | Modèle logique, contrats TypeScript/API et stockage |
| [`domain/22-TEMPLATES-FR-UK.md`](domain/22-TEMPLATES-FR-UK.md) | Templates pays, instrument, mesure, ajustement, run et output |
| [`domain/23-STARNET-IO-ET-CORRECTIONS.md`](domain/23-STARNET-IO-ET-CORRECTIONS.md) | Génération `.dat/.prj`, corrections et parsing natif |

## Configurations prêtes à intégrer

| Fichier | Périmètre |
|---|---|
| [`configs/README.md`](configs/README.md) | Statut, résolution et validation des presets |
| [`configs/fr-starnet-monitoring.v1.json`](configs/fr-starnet-monitoring.v1.json) | Preset France, Topcon et mesures déjà corrigées |
| [`configs/uk-supplied-hs2-nte.v1.json`](configs/uk-supplied-hs2-nte.v1.json) | Preset UK issu des fichiers HS2/NTE fournis |

Ces JSON sont des seeds de maquette et de développement. Ils doivent être validés par les schémas
Zod du domaine, puis transformés en snapshots résolus lors de la création d'une version.

## Documents de réalisation

| Fichier | Périmètre |
|---|---|
| [`implementation/30-REUTILISATION-DU-PROTOTYPE.md`](implementation/30-REUTILISATION-DU-PROTOTYPE.md) | Code à conserver, adapter ou supprimer |
| [`implementation/31-PROMPTS-IMPLEMENTATION.md`](implementation/31-PROMPTS-IMPLEMENTATION.md) | Prompts par lot, prêts à copier-coller |
| [`implementation/32-TESTS-CRITERES-ACCEPTATION.md`](implementation/32-TESTS-CRITERES-ACCEPTATION.md) | Scénarios fonctionnels, UX et techniques |
| [`demo/40-DONNEES-VERCEL.md`](demo/40-DONNEES-VERCEL.md) | Jeu ATS34 et données synthétiques de démonstration |

## Hiérarchie d'autorité

En cas de contradiction :

1. décisions produit explicites de ce dossier ;
2. fichiers natifs STAR*NET et manuel STAR*NET fourni ;
3. structure réelle BTM et ADR acceptés ;
4. données du classeur ATS34 ;
5. comportement de StarAdjust legacy ;
6. comportement de l'ancien prototype.

Le prototype précédent est une bibliothèque d'idées et de composants, **pas une source de vérité**.
Les fichiers personnalisés produits par des scripts batch legacy ne définissent pas le nouveau
contrat : le service cible lit les sorties natives STAR*NET.

## Décisions non négociables

- nouveau type BTM `Topographic Adjustment`, sans réutiliser `Theodolite` ;
- un processing couvre une station ou un réseau connecté, jamais plusieurs réseaux indépendants ;
- STAR*NET Ultimate est le seul moteur de production ;
- serveur Windows dédié pour STAR*NET, sans S3 ; une Lambda Python stateless peut préparer,
  initialiser et exécuter les essais du laboratoire mais ne lance pas STAR*NET ;
- données brutes lues dans BTM, aucun import de fichier de mesures dans le parcours produit ;
- fichiers STAR*NET temporaires et supprimables après ingestion réussie ;
- configurations versionnées en base, résultats uniques dans `measures` ;
- aucune fusion automatique de points physiques sur le nom d'une cible ;
- vue compacte par défaut et `Advanced options` accessible à tous, sans supposer le niveau d'expertise du rôle ;
- aucune correction de distance appliquée deux fois.

## Kit GitHub/Claude Code

Les fichiers suivants sont prêts à être copiés à la racine du nouveau repository :

| Fichier | Destination dans le nouveau repo |
|---|---|
| [`github-starter/PROJECT_MAP.md`](github-starter/PROJECT_MAP.md) | `/PROJECT_MAP.md` |
| [`github-starter/CLAUDE.md`](github-starter/CLAUDE.md) | `/CLAUDE.md` |
| [`github-starter/.graphifyignore`](github-starter/.graphifyignore) | `/.graphifyignore` |
| [`github-starter/.github/PULL_REQUEST_TEMPLATE.md`](github-starter/.github/PULL_REQUEST_TEMPLATE.md) | `/.github/PULL_REQUEST_TEMPLATE.md` |

GitHub est la source de vérité de la maquette. Claude Code peut créer des branches, commits et
Pull Requests de manière autonome. Il ne merge aucune PR et ne déploie rien : le Product Owner
merge les PR puis déclenche/valide le déploiement Vercel.
