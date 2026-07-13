# Audit avant développement — BTM Topographic Adjustment

Date : 14 juillet 2026  
Dépôt audité : `boumeshal-MOB/btm-topographic-adjustment-mockup`  
Branche auditée : `main`, après fusion des PR #1 et #2  
Document central : `IMPLEMENTATION_PLAN.md`

## 1. Verdict exécutif

**Verdict : prêt avec corrections obligatoires avant de lancer PR-01.**

Le plan est globalement très bon : architecture séparée, règles métier identifiées, six PR
cohérentes, 18 tâches détaillées pour la première version, tests liés aux identifiants de règles et
bonne séparation entre maquette Vercel et production STAR*NET Windows.

Cependant, il ne faut pas commencer le code exactement dans son état actuel. Deux hypothèses du
plan sont fausses et provoqueraient une réécriture inutile :

1. les données ATS34 et leur convertisseur existent déjà dans l'ancien dépôt `StarNet` ;
2. le moteur de démonstration, QR, statistiques, initialisation, identité des points et 64 tests
   existent également et passent.

Le plan actuel prévoit de les réécrire. Cela augmenterait fortement les tokens, le volume de code
et le risque scientifique, alors que l'objectif confirmé est de réutiliser les briques saines.
Cette réutilisation concerne le **domaine scientifique, les données et les tests**, pas le design
de l'ancienne maquette. La nouvelle maquette doit conserver une vraie liberté de conception et ne
doit pas être une reproduction visuelle de l'ancien prototype.

Évaluation :

| Axe | État actuel | Après corrections |
|---|---:|---:|
| Couverture fonctionnelle planifiée | 90 % | 97 % |
| Architecture réutilisable BTM | 8/10 | 9/10 |
| Préparation de PR-01 | 7/10 | 9/10 |
| Efficacité des tokens | 6/10 | 9/10 |
| Risque topographique/statistique | moyen | maîtrisé |

## 2. Corrections obligatoires avant PR-01

### B-01 — Remplacer D-01 et D-02 par une stratégie de portage contrôlé

Le dépôt source `boumeshal-MOB/StarNet`, commit de référence accessible sur `origin/main`
`bd4216d5299ff761512e37a04ed46282c0c811bb`, contient déjà :

- `data-source/ATS34 Raw Data, Lookup, Header (1).xlsx` ;
- `src/data/ats34.generated.json` ;
- `scripts/convert-ats34.mjs` ;
- `src/engine/geometry.ts` ;
- `src/engine/linalg.ts` avec QR Householder pivoté et détection de rang ;
- `src/engine/stats.ts` ;
- `src/engine/localGeometry.ts` ;
- `src/engine/initial.ts` ;
- `src/engine/pointIdentity.ts` ;
- `src/engine/adjust.ts`, `runner.ts`, Worker et tests ;
- logique de visualisation réseau, slots et timeline de configuration comme références de
  comportement, sans obligation de reprendre leurs composants visuels.

Contrôle effectué pendant l'audit : **64 tests sur 64 réussis** et build Vite réussi. Le bundle de
l'ancienne application est volumineux ; il ne faut donc pas copier toute l'application. Il faut
porter uniquement les fonctions pures et leurs tests, puis adapter leurs types aux nouveaux
contrats. Les pages, formulaires, composants, styles, organisation visuelle et textes de l'ancien
prototype ne constituent pas une cible à reproduire.

Modifications du plan :

- T01.2 : porter le convertisseur et la fixture, puis les renforcer selon le nouveau contrat ;
- T01.5–T01.7 et T01.10 : porter les modules purs et leurs tests, sans reprendre les anciens types ;
- T01.4 : adapter `corrections.ts`, car l'autorité devient `station × cible` ;
- T01.9 : adapter les slots/versions sans reprendre `OutputResultVersion` ;
- supprimer l'instruction « implement fresh pure functions » de D-02 ;
- conserver la liste « ne pas réutiliser » du document `30-REUTILISATION-DU-PROTOTYPE.md`.

Règle de portage : reprendre un algorithme existant seulement après avoir identifié son contrat,
ses tests et les adaptations nécessaires. Ne jamais copier une page complète simplement parce
qu'elle existe déjà.

### B-02 — Rendre la fixture réellement déterministe

Le plan exige à la fois une date de conversion et un JSON identique après régénération. Une valeur
`new Date().toISOString()` rend ces deux exigences incompatibles.

Décision recommandée :

- le hash SHA-256 du classeur est l'identité de provenance ;
- `convertedAt` est une métadonnée stable fournie explicitement ou exclue de la comparaison ;
- les lignes métier sont triées avec une clé déterministe ;
- le test compare le contenu canonique, le hash, les compteurs et les warnings ;
- aucun timestamp d'exécution volatile ne fait échouer le diff.

### B-03 — Ajouter la sélection explicite Hz/Vz/Sd dans l'UX

Les contrats contiennent `ObservationVariableBinding`, mais la tâche T01.12 décrit les cibles et
les setups sans donner clairement la main sur les variables Hz, Vz et Sd.

Le drawer ou un sous-panneau `Input variables` doit afficher, pour chaque cible/prisme BTM :

- `hzVariableId` ;
- `vzVariableId` ;
- `sdVariableId` ;
- leur capteur/prisme parent ;
- la source du mapping ;
- le statut compatible/manquant.

Une proposition provenant des métadonnées BTM est autorisée, mais elle doit rester confirmable.
Le rôle n'est jamais déduit uniquement du nom. T/P reste dans la politique atmosphérique.

### B-04 — Définir le comportement lorsqu'il n'y a pas de redondance

Un ajustement mono-station peut avoir une redondance globale grâce aux références, comme le jeu
ATS34 existant. Mais d'autres époques ou cibles peuvent être exactement déterminées ou mono-rayon.
Dans ce cas, `dof <= 0` ne doit pas devenir silencieusement un échec χ² ordinaire.

Ajouter :

```ts
type ChiSquareStatus = 'passed' | 'failed' | 'not-applicable';
```

Règles UI et publication :

- afficher `Not applicable — no redundancy` lorsque `dof <= 0` ;
- ne jamais afficher `Passed` ;
- conserver les sigmas issus de la propagation a priori, avec provenance ;
- signaler les cibles mono-rayon/non contrôlées ;
- appliquer une politique explicite de publication ou de blocage ;
- ne pas lancer Auto Adjust quand le test n'est mathématiquement interprétable.

### B-05 — Corriger Graphify avant sa première exécution

La configuration actuelle indexerait toute la documentation Markdown et le fichier JSON ATS34 de
plus d'un mégaoctet. Cela consommerait des tokens pour des contenus déjà indexés manuellement par
`PROJECT_MAP.md`.

Ajouter à `.graphifyignore` :

```gitignore
docs/topographic-adjustment/
IMPLEMENTATION_PLAN.md
src/demo/fixtures/*.generated.json
src/data/*.generated.json
```

Conserver dans le graphe : code source, tests, contrats TypeScript et éventuellement
`PROJECT_MAP.md`. Générer un premier graphe après le portage du domaine et du moteur, avant les
grandes tâches UI, puis le mettre à jour à la fin de PR-01.

## 3. Corrections importantes à planifier sans bloquer le scaffold

### H-01 — Ajouter un parser natif STAR*NET

PR-06 prévoit le builder `.dat/.snproj` et les golden tests, mais aucune tâche explicite ne construit
le parser des sorties natives. Or la production doit éviter les exports custom des scripts batch.

Ajouter en PR-06 un parser pur et testé pour les fichiers natifs disponibles : coordonnées,
sigmas, ellipses, résidus, χ², facteur de variance, convergence et erreurs. Le mapping inverse doit
être `engineName → PhysicalPoint → cibles BTM`. Un nom inconnu ou dupliqué bloque toute publication.

### H-02 — Clarifier le chemin MSW/repository

Éviter deux implémentations parallèles. Choisir un seul chemin de démonstration :

```text
UI/TanStack Query → use-case → repository HTTP → fetch → MSW → demo store IndexedDB
```

Le futur adaptateur remplace l'URL/MSW par Fastify sans modifier le domaine ni les composants.

### H-03 — Compléter les actions de la liste Administration

Le plan couvre surtout `Open` en PR-01 et les onglets en PR-05. Ajouter explicitement en PR-05 :

- Run now ;
- Activate/Deactivate processing ;
- Duplicate ;
- Archive processing ;
- prochaine action et qualité sur la liste.

### H-04 — Ajouter les tests d'isolation/concurrence

Ajouter au minimum des tests contractuels : cinq processings pouvant utiliser simultanément les
noms `STA1/MPO001`, aucun mapping traversant un processing, publication transactionnelle sans
mesure partielle. Le lock de licence et le nettoyage de workspace restent des exigences du service
Windows, avec contrat et scénario de test documentés dans le handoff.

### H-05 — Compléter la fermeture d'un slot

Le frontend source mentionne un délai de fermeture/catch-up dans Output. Le plan décrit la fenêtre
de catch-up, mais pas clairement le moment où un slot passe de provisoire à final. Ajouter un champ
ou une règle explicite, sans le confondre avec l'intervalle de publication.

### H-06 — Marquer officiellement le plan approuvé

Le fichier fusionné affiche encore `draft — pending owner approval`. Remplacer cette ligne par
`approved` avec date/PR afin d'éviter qu'un exécuteur s'arrête ou tente de replanifier.

## 4. Liberté de conception de la nouvelle maquette

### Ce qui est libre

Claude peut proposer une expérience réellement différente de l'ancien prototype :

- nouvelle composition visuelle et nouveau design system MUI ;
- navigation, regroupement et présentation des étapes ;
- cartes, drawers, tableaux, assistants, vues réseau et visualisations ;
- ordre de lecture et mécanismes de progressive disclosure ;
- textes d'aide, résumés, empty states et retours de validation ;
- organisation responsive desktop/tablette ;
- simplification du nombre de clics et des informations affichées par défaut.

Les neuf domaines fonctionnels du wizard doivent rester traçables, mais ils ne sont pas une
contrainte de reproduction pixel par pixel. Claude peut proposer de fusionner ou présenter
différemment certaines étapes si :

1. aucune capacité n'est supprimée ;
2. la charge cognitive diminue ;
3. le draft, le retour arrière et les validations restent fiables ;
4. la PR explique le changement et fournit une matrice besoin → écran ;
5. le parcours UK complet reste testable de bout en bout.

### Ce qui n'est pas libre

La liberté UX ne permet pas de modifier :

- les règles topographiques et statistiques ;
- la séparation station/instrument/measurement setup ;
- les corrections, unités et sources des valeurs ;
- la distinction époques/slots/validité ;
- l'identité des points physiques et la confirmation humaine ;
- les templates UK/France confirmés ;
- l'immutabilité des versions et les variables stables ;
- la frontière Demo solver / STAR*NET production ;
- les contrats réutilisables par le futur développement BTM.

### Règle de revue design

Les documents frontend décrivent les informations, actions, validations et principes UX attendus.
Ils ne doivent pas être interprétés comme des wireframes figés. Les tests doivent vérifier le
comportement accessible et les résultats utilisateur, pas imposer la structure DOM ou la copie de
l'ancien écran.

## 5. Checklist fonctionnelle de couverture

Légende : **Couvert** = prévu avec règles/tests ; **Partiel** = intention présente mais précision
manquante ; **Absent** = à ajouter ; **Production** = contrat seulement dans la maquette.

| Domaine | Legacy / UK fourni | Besoin France | BTM cible | État du plan |
|---|---|---|---|---|
| Nouveau type `Topographic Adjustment` | oui | oui | enum/endpoints dédiés | Couvert |
| Projet implicite, aucun champ Project | n/a | oui | contexte BTM | Couvert |
| Station unique | cas ATS34 | oui | sélection d'une station | Couvert PR-01 |
| Réseau connecté | orchestration legacy | oui | plusieurs stations liées | Couvert PR-02 |
| Groupes indépendants séparés | oui | oui | plusieurs processings | Couvert |
| Données brutes déjà en base | fichier pour démo | oui | `raw_data` | Couvert |
| Mapping explicite Hz/Vz/Sd | Lookup partiel | indispensable | variable IDs | **Partiel B-03** |
| T/P depuis variables BTM | prévu | cas variable | IDs explicites | Couvert PR-03 |
| Instrument par station | Leica | Topcon | version de config | Couvert |
| EDM par station × cible | setups UK | mixte FR | jamais global | Couvert |
| Prism/Sheet/Reflectorless mélangés | catalogue | Topcon | même instrument/cycle | Couvert PR-03 |
| Constante requise − appliquée | 0/+8.9/+26.5/+30 | MPO 25.5−25.5 | trace par observation | Couvert |
| Distance inclinée corrigée | oui | déjà corrigée par défaut | aucune double correction | Couvert |
| 4 modes atmosphériques | oui | already-applied par défaut | politique versionnée | Couvert |
| T/P manquantes/invalides | fallback | oui | fail/fallback/no correction | Couvert |
| `.SCALE` séparé de T/P | STAR*NET | oui | datum seulement | Couvert |
| Réfraction séparée de T/P | 0.07 | 0.13 | STAR*NET | Couvert |
| Local-anchor 0/0/0/0 | compatible | besoin confirmé | défaut nouveau processing | Couvert |
| Coordonnées connues seulement si réelles | Header ATS34 | import/saisie | aucune donnée inventée | Couvert |
| Médianes fenêtre d'initialisation | amélioration | oui | provenance séparée | Couvert |
| Couverture et points absents | amélioration | oui | affichage | Couvert |
| Points physiques distincts par défaut | oui | MPO homonymes | mapping versionné | Couvert PR-02 |
| 2 seeds minimum, 3 recommandés | n/a | besoin réseau | assistant contrôlé | Couvert |
| Relations géométriques sans fusion | n/a | oui | contraintes | Couvert |
| Noms moteur max 15, mapping inverse | STAR*NET | MPO réservé FR | isolé par processing | Couvert |
| Paramètres UK fournis | HS2/NTE | n/a | preset versionné | Couvert |
| Paramètres FR STAR*NET | n/a | Topcon/Gons | preset versionné | Couvert PR-03 |
| Test one epoch non publié | proche legacy | oui | diagnostic de démo | Couvert PR-01 |
| χ² bilatéral | oui | oui | QC | **Partiel B-04** |
| Rang, dof, résidus, sigmas, ellipses | oui | oui | diagnostic | Couvert |
| Auto Adjust traçable | STAR*NET Ultimate | oui | exclusions sans modifier raw | Couvert PR-05 |
| Event-driven / schedule / manuel | legacy | oui | RunPolicy | Couvert |
| Synchronisation et reuse 30/45/60 | réseau | oui | fresh/reused/missing | Couvert PR-04 |
| Provisoire et catch-up | amélioration | oui | même slot/config historique | Couvert PR-04 |
| Sorties alignées :00/:30 | oui | oui | output slot distinct | Couvert |
| Fermeture provisoire→finale | partiel | oui | politique de slot | **Partiel H-05** |
| X/Y/Z, Delta, Sigma | exports legacy | oui | variables stables | Couvert |
| Chi2/variance/références/disponibilité | oui | oui | variables globales | Couvert |
| UPSERT même variable/timestamp | nouveau besoin | oui | `measures` | Couvert |
| Versions immuables/archivées | historique legacy | oui | config par slot | Couvert PR-05 |
| Reprocessing par période/config | legacy | oui | dry-run + UPSERT | Couvert PR-05 |
| Administration complète | prototype | oui | 12 onglets | Partiel H-03 |
| Analysis Lab et comparaison trials | amélioration | oui | nouvelle version candidate | Couvert PR-05 |
| Génération `.dat/.snproj` | legacy | oui | temporaire par run | Couvert PR-06 |
| Parsing des sorties natives | scripts legacy custom à remplacer | oui | parser natif | **Absent H-01** |
| Workspaces isolés et lock licence | serveur legacy | oui | service Windows | Production H-04 |
| Aucun Lambda/S3/CoMeT | n/a | confirmé | Windows dédié | Couvert |
| UI compacte + Advanced pour tous | prototype à simplifier | oui | pas de rôle expert | Couvert |
| Accessibilité, clavier, unités | amélioration | oui | tests E2E | Couvert |
| Aucun upload de mesures brutes | fichiers démo seulement | oui | données BTM | Couvert |

## 6. Audit d'optimisation des tokens

### Ce qui est déjà bon

- `PROJECT_MAP.md` sert d'index compact ;
- chaque tâche cite ses règles et les documents minimaux ;
- l'architecture est décidée une seule fois ;
- les vérifications sont nommées ;
- les fonctions avancées sont découpées par PR ;
- l'exécuteur est interdit de relire tout le dossier ou de redessiner l'architecture.

### Ce qui gaspillerait des tokens aujourd'hui

1. réécrire environ 3 800 lignes de moteur/tests déjà disponibles ;
2. indexer les 30 documents Markdown et le gros JSON ATS34 dans Graphify ;
3. demander `Execute PR-01` dans une seule session longue ;
4. laisser le modèle produire des comptes rendus détaillés après chaque petite modification ;
5. relancer toute la suite E2E après chaque fichier au lieu de tests ciblés ;
6. utiliser plusieurs agents en parallèle : chacun recharge son propre contexte ;
7. copier puis corriger l'ancien frontend au lieu de concevoir directement la nouvelle expérience.

### Stratégie recommandée

Garder une seule branche et une seule PR-01, mais exécuter par sessions bornées :

| Session | Tâches | Effort |
|---|---|---|
| A | T01.1–T01.3 scaffold, fixture, contrats | Sonnet medium |
| B | T01.4 corrections | Sonnet high |
| C | T01.5–T01.8 temps, initialisation, noms, sorties | Sonnet high |
| D | T01.9 repository/MSW | Sonnet medium |
| E | T01.10 portage moteur/Worker | Sonnet high, session dédiée |
| F | T01.11–T01.13 wizard jusqu'à initialisation | Sonnet medium |
| G | T01.14–T01.17 adjustment jusqu'à administration | Sonnet high puis medium |
| H | T01.18 E2E, a11y, build, Graphify final | Sonnet medium |

À chaque session : nouveau contexte Claude Code, même branche, lecture de la tâche et de ses seules
sources, tests ciblés, commit cohérent. Lancer la suite complète à la fin de chaque session et avant
la PR, pas après chaque fichier. Les longues sessions conservent les blocs de raisonnement dans le
contexte ; repartir d'un commit propre limite ce coût et les dérives.

Ne pas utiliser Ponytail ou Caveman pendant PR-01. Ne pas lancer une équipe d'agents. Utiliser un
agent d'exploration seulement pour une question ciblée si Graphify ne répond pas.

La liberté de conception ne doit pas être supprimée pour économiser des tokens. Le bon compromis
est de figer le domaine et les critères d'acceptation, puis de laisser Sonnet proposer une solution
UX dans ce cadre. Une courte proposition d'architecture d'information au début de la session F est
suffisante ; il n'est pas nécessaire de générer plusieurs variantes complètes.

## 7. Modèle recommandé

**Modèle par défaut : Claude Sonnet 5.** Il offre actuellement le meilleur compromis vitesse,
capacité et coût pour l'implémentation. Utiliser `/effort medium` pour le scaffold, les formulaires,
MSW et les adaptations mécaniques ; `/effort high` pour corrections, géométrie, moindres carrés,
χ², synchronisation, point identity et parser STAR*NET.

Ne pas confier toute PR-01 à Haiku 4.5 : l'économie nominale ne compense pas le risque de reprises
sur les contrats topographiques et les workflows complexes. Haiku peut servir uniquement pour une
tâche mécanique déjà totalement bornée, par exemple compléter des clés i18n ou reformater une
fixture après validation.

Utiliser Opus 4.8 uniquement pour :

- arbitrage d'une contradiction métier ;
- revue du portage du solveur T01.10 ;
- revue du parser natif PR-06 ;
- audit final transversal.

## 8. Ordre d'action recommandé

1. créer une petite PR documentaire corrigeant B-01 à B-05 et H-06 ;
2. fusionner cette PR ;
3. démarrer PR-01 avec Sonnet 5, session A ;
4. porter les briques scientifiques de `StarNet` au lieu de les réécrire, sans porter ses écrans ;
5. construire Graphify après le domaine/moteur, avec les exclusions corrigées ;
6. en session F, proposer une nouvelle architecture UX compacte puis implémenter directement la
   variante retenue dans les limites fonctionnelles ;
7. demander une revue Opus 4.8 ciblée du moteur avant de marquer PR-01 prête ;
8. le propriétaire merge et déploie ensuite sur Vercel.

## 9. Prompt court pour corriger le plan

```text
Create a docs-only branch fix/plan-audit-corrections.

Read CLAUDE.md, PROJECT_MAP.md, IMPLEMENTATION_PLAN.md and
AUDIT-AVANT-CODE-BTM-TOPOGRAPHIC-ADJUSTMENT.md only.

Apply items B-01 to B-05 and H-06 exactly. Do not implement application code and do not redesign
the approved architecture. Preserve PR-01 as one functional UK single-station PR, but replace
fresh reimplementation with controlled porting from boumeshal-MOB/StarNet at commit
bd4216d5299ff761512e37a04ed46282c0c811bb.

Update task dependencies, tests, Graphify timing/ignore rules and the plan status. Add H-01 to
PR-06 and record H-02 to H-05 in the appropriate later PR tasks. Validate internal links and rule
coverage. Commit, push and open a PR. Do not merge or deploy.

Important design freedom:
- reuse only proven scientific/domain functions, fixture conversion and useful tests;
- do not copy the previous prototype's pages, styles, layout or information architecture;
- treat frontend documents as functional/UX requirements, not fixed wireframes;
- allow a new compact, modern MUI experience and a different presentation of the nine functional
  domains, provided every requirement remains traceable and the UK journey stays E2E-testable;
- require a concise requirement-to-screen matrix in PR-01 instead of visual conformity with the
  old mock-up.
```
