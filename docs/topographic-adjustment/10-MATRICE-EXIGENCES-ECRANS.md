# Matrice exigences → écrans (traçabilité de la maquette)

Deliverable T01.18. Relie chaque famille de règles métier à l'écran / au composant qui la met en
œuvre, pour que le développeur BTM (ou une IA) retrouve immédiatement où une règle vit dans le
code. Les règles détaillées restent dans `domain/20-REGLES-METIER.md` ; ce tableau ne fait que
pointer vers l'implémentation.

Routes de la maquette :

| Route | Écran | Fichier |
|---|---|---|
| `/` | Liste des traitements + brouillons + utilitaires démo | `src/features/processings/ProcessingsPage.tsx` |
| `/create/:draftId` | Wizard de création (9 étapes) | `src/features/create/WizardPage.tsx` |
| `/processing/topographic-adjustment/:id` | Détail (runs, versions, variables, retraitement) | `src/features/processings/ProcessingDetailPage.tsx` |
| `/processing/topographic-adjustment/:id/runs/:runId` | Détail d'un run | `src/features/processings/RunDetailPage.tsx` |
| `/processing/topographic-adjustment/:id/analysis` | Analysis Lab | `src/features/analysis/AnalysisLabPage.tsx` |
| `/dev/fixtures` | Provenance fixture ATS34 (dev only, non lié) | `src/app/pages/DevFixtures.tsx` |

## Familles de règles → écran → domaine

| Règles | Où l'utilisateur le voit | Écran / composant | Domaine pur sous-jacent |
|---|---|---|---|
| PROC-001..005 (type implicite, portée station/réseau, un réseau connecté = un traitement) | Wizard étape 1 (portée) + étape 2 (sélection) ; blocage « réseau ≥ 2 stations » à la revue | `GeneralStep`, `StationsStep`, `ReviewStep` | — |
| DATA-005/006 (pas d'upload d'observations brutes ; le produit lit le catalogue BTM) | Étape 2 liste les stations BTM ; aucune zone d'upload | `StationsStep`, `useCatalogue` | `src/demo/catalogue.ts` |
| DATA-007 / ADJ-007 (Auto Adjust exclut de l'essai, jamais des données brutes) | Analysis Lab (exclusions d'essai) ; bandeau « raw data untouched » | `AnalysisLabPage`, `DiagnosticPanel` | `engine/demo-engine-core.ts` (`runDemoAdjustmentWithAutoAdjust`) |
| MEAS-002..007 (setup EDM/réflecteur par station × cible ; pas d'autorité globale) | Étape 4 tableau cibles (type, constantes, hauteur, setup par ligne) | `TargetsStep` | `corrections/apply-distance-corrections.ts` |
| CORR-002/005/009 (Δ = requis − déjà appliqué, une seule fois ; reflectorless = 0 ; sheet garde son setup) | Colonne « BTM Δ » de l'étape 4 ; « Test one epoch » → résumé corrections ; run detail | `TargetsStep`, `AdjustmentStep`, `RunDetailPage` | `corrections/prism` (`resolvePrismDelta`) |
| CORR-007/008/010 (`.SCALE`/réfraction ≠ correction T/P ; formule toujours affichable) | Étape 6 zone avancée (note explicite) ; formulaId dans les traces | `AdjustmentStep` | `corrections/atmosphere` (`STANDARD_PPM_FORMULA_ID`) |
| ATMO-001..006 (4 modes atmosphériques, 4 politiques T/P manquante, provisoire) | Étape 3 par station (sélecteur mode + politique) | `InstrumentsStep` | `corrections/atmosphere` |
| POINT-001/002/011/012 (noms identiques ne prouvent rien ; points partagés confirmés à la main) | Étape 4 panneau « Common physical points » (geometry check + confirmation) ; badges connectivité | `CommonPointsPanel`, `ConnectivityBadges` | `point-identity/local-geometry.ts` |
| NAME-006 (noms moteur `^[A-Za-z0-9_]{1,15}$` ; collision bloque la revue) | Colonne « Engine name » éditable ; blocage à la revue | `TargetsStep`, `ReviewStep` | `point-identity/engine-names.ts` |
| INIT-002..005 (ancre locale 0/0/0/0 ; références réellement fournies ; médianes ; couverture) | Étape 5 (mode ancre/références, calcul, couverture/pairs manquantes) | `InitialisationStep` | `initialisation/initialisation.ts` |
| ADJ-002/003/006 (paramètres STAR*NET distincts du solveur démo ; convergence/rang) | Étape 6 (paramètres) ; badges diagnostic (rang, dof, itérations) | `AdjustmentStep`, `DiagnosticPanel` | `starnet/preview-builder.ts`, `engine/demo-engine-core.ts` |
| ADJ-009/010 (anti-manipulation ; single-ray → χ² not-applicable) | Analysis Lab (alertes) ; badge χ² « not-applicable » ; carte réseau « •1-ray » | `AnalysisLabPage`, `ChiSquareBadge`, `NetworkView` | `store.analysisTrial`, `chi-square.ts` |
| RUN-003..007 (choix d'époque fresh/reused/missing ; stations optionnelles) | Étape 7 (politique) ; puces d'état d'époque par station (test, run detail) | `RunStep`, `RunDetailPage` | `time/slots.ts` (`selectStationEpoch`), `resolve-run.ts` |
| RUN-008 (catch-up borné par créneau) | Détail onglet Overview « Catch-up this slot » + note ; erreur quand la borne est atteinte | `OverviewTab` | `store.runSlot` (garde catch-up) |
| TIME-005..008 (validité config ≠ fenêtre d'init ≠ créneau ; résolution par créneau) | Étape 1 (valid from) vs étape 5 (fenêtre) ; timeline versions ; retraitement par créneau | `GeneralStep`, `VersionsTab`, `ReprocessTab` | `time/slots.ts` (`resolveConfigForSlot`) |
| OUT-001/002/005..010 (variables stables créées une fois ; UPSERT ; rien d'inventé) | Étape 8 (compte de variables) ; onglet « Output variables » (séries UPSERT) | `OutputStep`, `OutputsTab` | `outputs/output-plan.ts`, `store.publishMeasures` |
| VER-001/002/003/010 (version utilisée = immuable ; duplication en brouillon ; pas de chevauchement) | Onglet « Configuration versions » (immuable, activer/archiver/dupliquer, fenêtres) | `VersionsTab` | `store.activateVersion/duplicateVersionAsDraft` |
| DEMO-001..005 (données démo étiquetées ; solveur non certifié ; frontière domaine pure) | Badge « Demo data » ; label « Demo solver — not production… » partout où un résultat apparaît | `AppShell`, `DiagnosticPanel` | `engine/demo-engine-core.ts` (`DEMO_ENGINE_LABEL`) |

## États d'écran couverts (vide / chargement / erreur / provisoire / succès)

- **Vide** : liste sans traitement ; étape 4 sans point partagé ; onglet runs sans run.
- **Chargement** : `CircularProgress` sur détail/wizard/Analysis Lab pendant les requêtes.
- **Erreur** : bandeaux `Alert severity="error"` (message serveur via `ApiError`) ; blocages de revue.
- **Provisoire** : statut `provisional`, puces d'époque `reused` en orange, χ² `not-applicable`.
- **Succès** : statut `success`, badge χ² `passed`, variables publiées visibles dans l'onglet Output.

## Accessibilité (T01.18)

- Navigation clavier : boutons/inputs MUI focusables ; le stepper utilise `StepButton`.
- Couleur jamais seule : `StatusChip`/`ChiSquareBadge` portent toujours un libellé texte (front/10 §6).
- Libellés d'unités toujours visibles dans les labels, en-têtes de tableaux et aperçus (front/10 §7).
- `aria-label` sur la carte réseau SVG, les cases à cocher de sélection et les tableaux de résidus.
