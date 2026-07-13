# Frontend — design system, navigation et principes UX

## 1. Objectif UX

La feature doit donner confiance à deux profils sans les identifier par rôle :

- l'utilisateur qui veut un parcours guidé avec des valeurs sûres ;
- l'utilisateur qui veut inspecter et modifier chaque paramètre.

La réponse est une interface compacte par défaut et des `Advanced options` accessibles partout.
Ne pas proposer un sélecteur `Standard/Expert`, car le niveau d'expertise ne peut pas être déduit
du rôle BTM.

## 2. Navigation produit

Ajouter les entrées suivantes dans le contexte du projet courant :

| Route logique | Écran |
|---|---|
| `/processing/topographic-adjustment` | Liste des processings |
| `/processing/topographic-adjustment/create` | Wizard de création |
| `/processing/topographic-adjustment/:id` | Administration d'un processing |
| `/processing/topographic-adjustment/:id/runs/:runId` | Détail d'un run |
| `/processing/topographic-adjustment/:id/reprocess` | Reprocessing |
| `/processing/topographic-adjustment/:id/analysis` | Analysis Lab |
| `/processing/topographic-adjustment/templates` | Catalogue de templates |
| `/processing/topographic-adjustment/audit` | Audit filtré |

Dans la maquette autonome, conserver une shell BTM simplifiée. Dans le produit réel, réutiliser
le layout, les breadcrumbs et le sélecteur de projet existants.

## 3. Structure visuelle

- largeur de contenu fluide, maximum adapté aux tableaux techniques ;
- barre d'actions sticky en bas du wizard ;
- stepper horizontal desktop, résumé compact/mobile ;
- une Card principale par décision métier, pas une Card par champ ;
- densité `small` pour inputs et tableaux ;
- drawers pour éditer un élément sans perdre le contexte ;
- dialogs uniquement pour confirmation, diff ou opération destructive/logiquement importante ;
- accordéons pour les options avancées ;
- tooltips pour termes courts, panneau `How is this calculated?` pour les explications longues.

## 4. Hiérarchie de l'information

Chaque écran suit le même ordre :

1. titre et statut ;
2. résumé compact de la décision ;
3. contenu principal ;
4. avertissements actionnables ;
5. options avancées ;
6. validation et action suivante.

Les explications scientifiques ne doivent pas occuper l'espace en permanence. Afficher une phrase
simple, puis permettre d'ouvrir formule, unité, source et exemple.

## 5. Composants réutilisables

Créer ou adapter les composants suivants :

```text
ProcessingStatusChip
QualityStatusChip
SourceBadge                 // Observation, Config, Template, Fallback
UnitField                   // label + unité + valeur + validation
AdvancedSection
ConfigurationDiffDialog
VersionTimeline
StationSelectorTable
MeasurementSetupTable
BulkEditToolbar
PointMappingAssistant
InitialisationCoverageCard
NetworkConnectivityCard
CorrectionTraceDrawer
StarNetParameterTable
EpochSelectionSummary
OutputVariableMatrix
ValidationSummary
NetworkView
ConfidenceEllipseLayer
ResidualTable
ChiSquareGauge
RunAttemptTimeline
```

Les composants ne doivent pas connaître MSW ou le schéma PostgreSQL. Ils consomment des view
models typés.

## 6. États et couleurs

Utiliser couleur + icône + texte, jamais la couleur seule.

| État | Traitement visuel |
|---|---|
| Ready / Success | vert sobre |
| Provisional / Warning | orange |
| Failed QC / Blocking | rouge |
| Running / In progress | bleu |
| Waiting for data | gris-bleu |
| Archived / Disabled | gris |

Employer `In progress` pour une action active et `Ongoing` pour un processus continu.

## 7. Formulaires

- react-hook-form + schémas Zod partagés avec les contrats API ;
- validation au blur et à l'étape suivante ;
- ne pas afficher dix alertes avant que l'utilisateur ait choisi sa méthode ;
- conserver les valeurs cachées uniquement si elles restent sémantiquement valides ; sinon les
  réinitialiser avec confirmation ;
- format d'affichage localisé, valeurs internes en SI ;
- champs numériques avec unité visible et plage autorisée ;
- source/provenance affichée pour les valeurs héritées ;
- changement de template : aperçu du diff avant remplacement des overrides.

## 8. Tableaux techniques

- header sticky ;
- recherche, filtres et compteur des lignes ;
- sélection multi-lignes et modification en lot ;
- colonnes principales visibles, détails dans drawer ;
- virtualisation ou pagination au-delà de 100 lignes ;
- unités dans les en-têtes (`Residual H (mm)`) ;
- colonnes persistantes/masquables pour les écrans experts ;
- export CSV autorisé pour audit/configuration, jamais présenté comme source des données brutes.

## 9. Accessibilité

- ordre de tabulation cohérent ;
- labels explicites et `aria-describedby` pour unités/erreurs ;
- focus ramené sur la première erreur à la validation ;
- drawers/dialogs avec gestion correcte du focus ;
- graphiques accompagnés d'un tableau ou résumé textuel ;
- contraste WCAG AA ;
- actions de ligne accessibles par menu et clavier.

## 10. Internationalisation

Créer un namespace `topographicAdjustment` avec au minimum `en` et `fr`, puis placeholders pour
les autres locales BTM (`it`, `vn`, `nl`, `pt`, `es`). Les clés sont sémantiques, par exemple :

```text
wizard.stations.title
measurement.atmosphere.mode.cycleTp
quality.chiSquare.failed
mapping.commonPoints.weakGeometry
```

Éviter les chaînes assemblées qui empêchent la traduction des accords/pluriels.

## 11. États de démonstration

La maquette affiche un badge discret `Demo data` dans le header. Le parcours utilisateur ne
montre aucun bouton d'import du classeur. Une route développeur non naviguée peut afficher la
provenance et réinitialiser les fixtures.

## 12. Prompt ciblé

> Construis la shell et le design system de la feature BTM Topographic Adjustment avec React,
> TypeScript et MUI 5. Applique les règles de ce document. Crée les composants réutilisables,
> les routes, les états loading/empty/error, le stepper 9 étapes et le namespace i18n. Ne code
> aucune donnée métier dans les composants et ne crée aucun bouton sans comportement. Fournis
> Storybook ou pages de démonstration internes pour les états principaux, puis des tests
> d'accessibilité et de navigation clavier.

