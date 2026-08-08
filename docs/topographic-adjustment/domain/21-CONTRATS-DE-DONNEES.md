# Contrats de données logiques

Ces contrats définissent le domaine attendu. Les noms SQL exacts peuvent être adaptés au monorepo
BTM, mais les identités et invariants doivent rester reconnaissables.

## 1. Processing

```ts
type ProcessingStatus =
  | 'draft' | 'waiting_for_data' | 'ready' | 'running'
  | 'success' | 'warning' | 'provisional' | 'failed_qc'
  | 'technical_error' | 'disabled' | 'archived';

interface TopographicAdjustmentProcessing {
  id: number;
  projectId: number;
  type: 'Topographic Adjustment';
  name: string;
  description?: string;
  scope: 'single-station' | 'network';
  active: boolean;
  activeConfigVersionId?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 2. Version de configuration

```ts
type ConfigStatus = 'draft' | 'active' | 'archived';

interface AdjustmentConfigVersion {
  id: string;
  processingId: number;
  versionNumber: number;
  label: string;
  status: ConfigStatus;
  validFrom: string;       // inclusive
  validTo?: string;        // exclusive
  createdBy: number;
  createdAt: string;
  reason: string;
  usedByRun: boolean;
  countryPreset: TemplateRef;
  stationBindings: StationBinding[];
  targetBindings: TargetBinding[];
  physicalPoints: PhysicalPoint[];
  geometricRelationships: GeometricRelationship[];
  initialisation: InitialisationConfig;
  adjustment: StarNetAdjustmentConfig;
  runPolicy: RunPolicy;
  outputPolicy: OutputPolicy;
  overriddenFields: string[];
}
```

Une version utilisée est retournée en lecture seule. Pour l'éditer, l'API crée un draft dupliqué.

## 3. Variables d'entrée

```ts
interface ObservationVariableBinding {
  prismSensorId: number;
  hzVariableId: number;
  vzVariableId: number;
  sdVariableId: number;
  metadataModeVariableId?: number;
  metadataReflectorVariableId?: number;
}

interface EnvironmentalVariableBinding {
  temperatureVariableId?: number;
  pressureVariableId?: number;
  temporalToleranceMinutes: number;
}
```

Les IDs sont explicitement sélectionnés et validés par l'API. Le nom de variable n'est qu'un label.

## 4. Station

```ts
interface StationBinding {
  stationId: number;
  stationCode: string;
  required: boolean;
  instrumentTemplateId: string;
  instrumentHeightM: number;
  atmosphericPolicy: AtmosphericPolicy;
  defaultMeasurementSetupId?: string;
}

type AtmosphericMode =
  | 'already-applied'
  | 'cycle-temperature-pressure'
  | 'fixed-temperature-pressure'
  | 'none';

type MissingEnvironmentPolicy =
  | 'wait-or-fail'
  | 'fixed-fallback'
  | 'continue-without-correction'
  | 'assume-already-corrected';

interface AtmosphericPolicy {
  mode: AtmosphericMode;
  variables?: EnvironmentalVariableBinding;
  fixedTemperatureC?: number;
  fixedPressureHPa?: number;
  missingPolicy: MissingEnvironmentPolicy;
  fallbackTemperatureC?: number;
  fallbackPressureHPa?: number;
  marksResultProvisional: boolean;
  catchUpOnLateData: boolean;
  formulaId: string;
  formulaVersion: number;
}
```

## 5. Cible et configuration de mesure

```ts
type MeasurementType = 'prism' | 'reflective-sheet' | 'reflectorless';
type TargetRole = 'reference' | 'monitoring' | 'auxiliary';

interface TargetBinding {
  id: string;
  stationId: number;
  prismSensorId: number;
  rawTargetName: string;
  role: TargetRole;
  includeInAdjustment: boolean;
  publishOutput: boolean;
  observationVariables: ObservationVariableBinding;
  measurementSetup: ResolvedMeasurementSetup;
  physicalPointId: string;
  engineName: string;
  reviewStatus: 'ok' | 'to-review' | 'blocking';
}

interface ResolvedMeasurementSetup {
  templateId?: string;
  measurementType: MeasurementType;
  edmMode: string;
  reflectorTemplateId?: string;
  requiredConstantM?: number;
  alreadyAppliedConstantM?: number;
  prismDeltaM: number;
  targetHeightM: number;
  distanceStdErrMm: number;
  distancePpm: number;
  sourceByField: Record<string, ValueSource>;
}

type ValueSource =
  | 'observation-metadata'
  | 'versioned-mapping'
  | 'config-override'
  | 'template'
  | 'station-fallback';
```

## 6. Points physiques et relations

```ts
interface PhysicalPoint {
  id: string;
  label: string;
  engineName: string;
  role: TargetRole;
  memberTargetBindingIds: string[];
  state: 'individual' | 'shared' | 'suggested' | 'inconsistent';
  source: 'prior-config' | 'manual' | 'geometry-confirmed' | 'default';
  decision?: {
    by: number;
    at: string;
    reason: string;
  };
}

interface GeometricRelationship {
  id: string;
  pointAId: string;
  pointBId: string;
  type: 'slope-distance' | 'horizontal-distance'
    | 'height-difference' | 'azimuth-distance' | 'vector-3d';
  value: Record<string, number>;
  sigmaM: number;
  frame?: string;
  usage: 'initialisation' | 'adjustment' | 'check-only';
  source: string;
  note?: string;
}
```

## 7. Initialisation

```ts
interface InitialisationConfig {
  mode: 'local-anchor' | 'known-references';
  observationWindow: { from: string; to: string };
  anchor?: {
    stationId: number;
    eastingM: number;
    northingM: number;
    heightM: number;
    orientationDeg: number;
  };
  references: ReferenceConstraint[];
  initialCoordinates: InitialCoordinate[];
  coverage: InitialisationCoverage;
}

type ConstraintMode = 'fixed' | 'weak' | 'free';

interface ReferenceConstraint {
  physicalPointId: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  modeE: ConstraintMode;
  modeN: ConstraintMode;
  modeH: ConstraintMode;
  sigmaEM?: number;
  sigmaNM?: number;
  sigmaHM?: number;
  source: string;
}

interface InitialCoordinate {
  physicalPointId: string;
  eastingM: number;
  northingM: number;
  heightM: number;
  stationCount: number;
  observationCount: number;
  horizontalSpreadM: number;
  verticalSpreadM: number;
  status: 'known' | 'computed' | 'review' | 'missing';
}

interface InitialisationCoverage {
  availablePhysicalPoints: number;
  expectedPhysicalPoints: number;
  availableStationTargetPairs: number;
  expectedStationTargetPairs: number;
  rawObservationCount: number;
  representativeCount: number;
  missingPairs: Array<{ stationId: number; targetBindingId: string }>;
}
```

## 8. Paramètres STAR*NET

```ts
interface StarNetAdjustmentConfig {
  templateId: string;
  templateVersion: number;
  adjustmentType: '3D';
  linearUnits: 'Meters';
  angleOutputUnits: 'DMS' | 'Gons';
  localOrGrid: 'local' | 'grid';
  coordinateOrder: 'EN' | 'NE';
  input3dMode: 'Slope/Zenith';
  edmStdErrorModel: 'additive' | 'propagated';
  scaleFactor: number;
  indexOfRefraction: number;
  earthRadiusM: number;
  convergeLimit: number; // sans unité
  maximumIterations: number;
  chiSquareSignificancePercent: number;
  performErrorPropagation: boolean;
  ellipseConfidencePercent: number;
  defaultWeights: StarNetWeights;
  autoAdjust: {
    enabled: boolean;
    maxStandardizedResidual: number;
    outliersRemovedPerIteration: number;
    maxIterations: number;
  };
}

interface StarNetWeights {
  distanceStdErrM: number;
  distancePpm: number;
  angleArcSec: number;
  directionArcSec: number;
  azimuthArcSec: number;
  zenithArcSec: number;
  instrumentCenteringM: number;
  targetCenteringM: number;
  verticalCenteringM: number;
}
```

## 9. Run et output

```ts
interface RunPolicy {
  trigger: 'event-driven' | 'schedule' | 'manual';
  scheduleEveryMinutes?: number;
  syncToleranceMinutes: number;
  reuseMissingStation: boolean;
  maxReusedAgeMinutes: number;
  computeWithoutOptionalStations: boolean;
  markReuseProvisional: boolean;
  catchUp: {
    enabled: boolean;
    windowHours: number;
    onLateObservation: boolean;
    onLateEnvironment: boolean;
    maxRecalculationsPerSlot: number;
  };
}

type TargetOutputComponent =
  | 'adjusted-x' | 'adjusted-y' | 'adjusted-z'
  | 'delta-x' | 'delta-y' | 'delta-z'
  | 'sigma-x' | 'sigma-y' | 'sigma-z';

type GlobalOutputComponent =
  | 'chi2-passed' | 'variance-factor'
  | 'references-available' | 'target-availability'
  | 'provisional-flag' | 'quality-code';

interface OutputPolicy {
  intervalMinutes: number;
  alignment: 'utc-grid';
  maxEpochToSlotMinutes: number;
  publishProvisional: boolean;
  targetComponents: TargetOutputComponent[];
  globalComponents: GlobalOutputComponent[];
}
```

## 10. Mapping stable des variables de sortie

```ts
interface ProcessingOutputVariable {
  processingId: number;
  variableId: number;
  scope: 'target' | 'global';
  prismSensorId?: number;
  component: TargetOutputComponent | GlobalOutputComponent;
}
```

Ce mapping ne porte pas `configVersionId`. La version physique/engineName est résolue séparément.

## 11. Run minimal et diagnostic

```ts
interface AdjustmentRunSummary {
  id: string;
  processingId: number;
  configVersionId: string;
  outputSlot: string;
  trigger: 'event' | 'schedule' | 'manual' | 'catch-up' | 'reprocess' | 'test';
  status: 'running' | 'success' | 'provisional' | 'failed-qc' | 'technical-error';
  startedAt: string;
  finishedAt?: string;
  stationEpochs: Array<{
    stationId: number;
    epoch?: string;
    state: 'fresh' | 'reused' | 'missing';
    ageMinutes?: number;
  }>;
  autoAdjustAttempts: number;
  chi2Passed?: boolean;
  varianceFactor?: number;
  referencesAvailable?: number;
  targetAvailabilityPercent?: number;
  error?: { stage: string; code: string; message: string };
}
```

Ne pas recopier toutes les coordonnées ajustées dans ce contrat. Elles vivent dans les mesures
des variables de sortie.

## 12. Endpoints logiques

À adapter aux conventions BTM Fastify :

```text
GET    /api/v2/projects/:projectId/topographic-adjustments
POST   /api/v2/projects/:projectId/topographic-adjustments
GET    /api/v2/topographic-adjustments/:id
POST   /api/v2/topographic-adjustments/:id/config-versions
GET    /api/v2/topographic-adjustments/:id/config-versions
POST   /api/v2/topographic-adjustments/:id/config-versions/:versionId/activate
POST   /api/v2/topographic-adjustments/:id/config-versions/:versionId/archive
POST   /api/v2/topographic-adjustments/:id/test-run
POST   /api/v2/topographic-adjustments/:id/run
POST   /api/v2/topographic-adjustments/:id/reprocess/preview
POST   /api/v2/topographic-adjustments/:id/reprocess
GET    /api/v2/topographic-adjustments/:id/runs
GET    /api/v2/topographic-adjustments/:id/runs/:runId
GET    /api/v2/topographic-adjustment-templates
```

Les payloads de mutation portent une clé idempotente. Les erreurs sont typées avec `code`,
`fieldPath`, `ruleId` et message localisable.

## 13. Tables logiques

À mapper sur le schéma réel :

```text
treatments                              // processing BTM
variables                               // sorties appartenant au processing
raw_data                                // entrées
measures                                // sorties uniques
topographic_adjustment_config_versions
topographic_adjustment_output_variables
topographic_adjustment_jobs
topographic_adjustment_runs
topographic_adjustment_audit            // ou audit BTM existant
```

Les mappings détaillés peuvent vivre dans un JSONB de version validé ou dans des tables enfants.
La lecture d'un run doit toujours obtenir un snapshot résolu immuable.
