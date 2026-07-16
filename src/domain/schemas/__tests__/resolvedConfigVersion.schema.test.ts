import { describe, expect, it } from 'vitest';
import { resolvedAdjustmentConfigVersionSchema } from '@/domain/schemas/resolvedConfigVersion.schema';
import { zodIssuesToSchemaIssues } from '@/domain/schemas/common';
import { isDomainIssue } from '@/domain/errors';

const validStationBinding = {
  stationId: 1,
  stationCode: 'NTE_ATS34',
  required: true,
  instrumentTemplateId: 'leica-tm50-i',
  instrumentHeightM: 0,
  atmosphericPolicy: {
    mode: 'cycle-temperature-pressure',
    missingPolicy: 'wait-or-fail',
    marksResultProvisional: false,
    catchUpOnLateData: true,
    formulaId: 'standard-ppm-v1',
    formulaVersion: 1,
  },
};

const minimalResolvedVersion = {
  id: 'cfg-1',
  processingId: 1,
  versionNumber: 1,
  label: 'v1',
  status: 'active',
  validFrom: '2026-01-01T00:00:00.000Z',
  createdBy: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  reason: 'initial creation',
  usedByRun: false,
  countryPreset: { templateId: 'uk-supplied-hs2-nte', templateVersion: 1 },
  stationBindings: [validStationBinding],
  targetBindings: [],
  physicalPoints: [],
  geometricRelationships: [],
  initialisation: {
    mode: 'local-anchor',
    observationWindow: { from: '2025-03-01T00:00:00.000Z', to: '2025-03-31T00:00:00.000Z' },
    anchor: { stationId: 1, eastingM: 0, northingM: 0, heightM: 0, orientationDeg: 0 },
    references: [],
    initialCoordinates: [],
    coverage: {
      availablePhysicalPoints: 0,
      expectedPhysicalPoints: 0,
      availableStationTargetPairs: 0,
      expectedStationTargetPairs: 0,
      rawObservationCount: 0,
      representativeCount: 0,
      missingPairs: [],
    },
  },
  adjustment: {
    templateId: 'uk-supplied-hs2-nte',
    templateVersion: 1,
    adjustmentType: '3D',
    linearUnits: 'Meters',
    angleOutputUnits: 'DMS',
    localOrGrid: 'local',
    coordinateOrder: 'EN',
    input3dMode: 'Slope/Zenith',
    scaleFactor: 1,
    indexOfRefraction: 0.07,
    earthRadiusM: 6372000,
    convergeLimit: 0.01,
    maximumIterations: 10,
    chiSquareSignificancePercent: 5,
    performErrorPropagation: true,
    ellipseConfidencePercent: 95,
    defaultWeights: {
      distanceStdErrM: 0.001,
      distancePpm: 1,
      angleArcSec: 1.414,
      directionArcSec: 2.5,
      azimuthArcSec: 1,
      zenithArcSec: 1.5,
      instrumentCenteringM: 0.0008,
      targetCenteringM: 0.0008,
      verticalCenteringM: 0.0005,
    },
    autoAdjust: { enabled: true, maxStandardizedResidual: 3, outliersRemovedPerIteration: 1, maxIterations: 20 },
  },
  runPolicy: {
    trigger: 'event-driven',
    syncToleranceMinutes: 10,
    reuseMissingStation: true,
    maxReusedAgeMinutes: 45,
    computeWithoutOptionalStations: true,
    markReuseProvisional: true,
    catchUp: { enabled: true, windowHours: 24, onLateObservation: true, onLateEnvironment: true, maxRecalculationsPerSlot: 3 },
  },
  outputPolicy: {
    intervalMinutes: 30,
    alignment: 'utc-grid',
    maxEpochToSlotMinutes: 10,
    publishProvisional: true,
    targetComponents: ['adjusted-x', 'adjusted-y', 'adjusted-z'],
    globalComponents: ['chi2-passed'],
  },
  overriddenFields: [],
};

describe('resolvedAdjustmentConfigVersionSchema (T01.3, strict)', () => {
  it('accepts a fully resolved version snapshot', () => {
    expect(() => resolvedAdjustmentConfigVersionSchema.parse(minimalResolvedVersion)).not.toThrow();
  });

  it('rejects a version whose adjustment.defaultWeights is still null (unresolved decision)', () => {
    const invalid = {
      ...minimalResolvedVersion,
      adjustment: { ...minimalResolvedVersion.adjustment, defaultWeights: null },
    };
    expect(() => resolvedAdjustmentConfigVersionSchema.parse(invalid)).toThrow();
  });

  it('rejects a version with zero station bindings (a resolved snapshot needs at least one)', () => {
    const invalid = { ...minimalResolvedVersion, stationBindings: [] };
    expect(() => resolvedAdjustmentConfigVersionSchema.parse(invalid)).toThrow();
  });

  it('rejects duplicate stationId within stationBindings (audit item 4, pass 3)', () => {
    const invalid = {
      ...minimalResolvedVersion,
      stationBindings: [
        validStationBinding,
        { ...validStationBinding, stationCode: 'OTHER_CODE' }, // same stationId, different code
      ],
    };
    const result = resolvedAdjustmentConfigVersionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('stationId') && /Duplicate stationId/.test(i.message))).toBe(true);
    }
  });

  it('rejects duplicate stationCode within stationBindings (audit item 4, pass 3)', () => {
    const invalid = {
      ...minimalResolvedVersion,
      stationBindings: [
        validStationBinding,
        { ...validStationBinding, stationId: 999 }, // same stationCode, different id
      ],
    };
    const result = resolvedAdjustmentConfigVersionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('stationCode') && /Duplicate stationCode/.test(i.message))).toBe(true);
    }
  });

  it('rejects an engine name longer than 15 characters or with forbidden characters', () => {
    const invalid = {
      ...minimalResolvedVersion,
      targetBindings: [
        {
          id: 't1',
          stationId: 1,
          prismSensorId: 1,
          rawTargetName: 'L34RE1100_329',
          role: 'monitoring',
          includeInAdjustment: true,
          publishOutput: true,
          observationVariables: { prismSensorId: 1, hzVariableId: 1, vzVariableId: 2, sdVariableId: 3 },
          measurementSetup: {
            measurementType: 'prism',
            edmMode: 'precise-prism',
            prismDeltaM: 0,
            targetHeightM: 0,
            distanceStdErrMm: 1,
            distancePpm: 1,
            sourceByField: {},
          },
          physicalPointId: 'pp-1',
          engineName: 'THIS-NAME-IS-WAY-TOO-LONG',
          reviewStatus: 'ok',
        },
      ],
    };
    expect(() => resolvedAdjustmentConfigVersionSchema.parse(invalid)).toThrow();
  });

  it('produces SchemaIssue-shaped errors (technical, no ruleId; code/fieldPath/message present)', () => {
    const result = resolvedAdjustmentConfigVersionSchema.safeParse({ ...minimalResolvedVersion, stationBindings: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = zodIssuesToSchemaIssues(result.error.issues);
      expect(issues.length).toBeGreaterThan(0);
      const stationBindingsIssue = issues.find((i) => i.fieldPath === 'stationBindings');
      expect(stationBindingsIssue).toBeDefined();
      expect(stationBindingsIssue).toMatchObject({
        code: expect.any(String),
        fieldPath: 'stationBindings',
        message: expect.any(String),
      });
      // Generic Zod issues are technical, never business rule violations (audit item 2).
      expect(issues.every((i) => !isDomainIssue(i))).toBe(true);
    }
  });

  it('rejects an unresolved prism constant instead of assuming zero', () => {
    const target = {
      id: 't1', stationId: 1, prismSensorId: 1, rawTargetName: 'MPO001', role: 'monitoring',
      includeInAdjustment: true, publishOutput: true,
      observationVariables: { prismSensorId: 1, hzVariableId: 1, vzVariableId: 2, sdVariableId: 3 },
      measurementSetup: { measurementType: 'prism', edmMode: 'precise-prism', prismDeltaM: 0, targetHeightM: 0, distanceStdErrMm: 1, distancePpm: 1, sourceByField: {} },
      physicalPointId: 'pp-1', engineName: 'P000001', reviewStatus: 'ok',
    };
    const point = { id: 'pp-1', label: 'MPO001', engineName: 'P000001', role: 'monitoring', memberTargetBindingIds: ['t1'], state: 'individual', source: 'default' };
    const result = resolvedAdjustmentConfigVersionSchema.safeParse({ ...minimalResolvedVersion, targetBindings: [target], physicalPoints: [point] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => /constants must be explicitly resolved/.test(issue.message))).toBe(true);
  });

  it('rejects inconsistent target ↔ physical-point ↔ engine-name mappings', () => {
    const target = {
      id: 't1', stationId: 1, prismSensorId: 1, rawTargetName: 'MPO001', role: 'monitoring',
      includeInAdjustment: true, publishOutput: true,
      observationVariables: { prismSensorId: 1, hzVariableId: 1, vzVariableId: 2, sdVariableId: 3 },
      measurementSetup: { measurementType: 'reflectorless', edmMode: 'reflectorless', prismDeltaM: 0, targetHeightM: 0, distanceStdErrMm: 1, distancePpm: 1, sourceByField: {} },
      physicalPointId: 'pp-1', engineName: 'P000001', reviewStatus: 'ok',
    };
    const point = { id: 'pp-1', label: 'MPO001', engineName: 'DIFFERENT', role: 'monitoring', memberTargetBindingIds: ['t1'], state: 'individual', source: 'default' };
    const result = resolvedAdjustmentConfigVersionSchema.safeParse({ ...minimalResolvedVersion, targetBindings: [target], physicalPoints: [point] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => /map back/.test(issue.message))).toBe(true);
  });

  it('rejects 100% significance/confidence and zero measurement sigma', () => {
    const result = resolvedAdjustmentConfigVersionSchema.safeParse({
      ...minimalResolvedVersion,
      adjustment: {
        ...minimalResolvedVersion.adjustment,
        chiSquareSignificancePercent: 100,
        ellipseConfidencePercent: 100,
        defaultWeights: { ...minimalResolvedVersion.adjustment.defaultWeights, directionArcSec: 0 },
      },
    });
    expect(result.success).toBe(false);
  });
});
