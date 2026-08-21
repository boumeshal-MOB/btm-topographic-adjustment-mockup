import type {
  AdjustmentConfigVersion,
  InitialCoordinate,
  PhysicalPoint,
  RawObservation,
  ReferenceConstraint,
  StationBinding,
  TargetBinding,
} from '@/domain/entities';
import type { WizardDraft } from '@/demo/draft';
import { resolveNetworkCoordinates, stationPointId } from '@/demo/network-coordinates';
import type { DemoCatalogue } from '@/demo/catalogue';
import { targetPrecision } from '@/demo/station-precision';
import { applyDistanceCorrections, type CorrectionTrace } from '@/domain/corrections';
import { selectStationCycle } from '@/domain/time/slots';
import { DEG2RAD } from '@/domain/math/geometry';
import type { ResolvedRunInput, ResolvedRunObservation, ResolvedRunPoint } from '@/domain/engine/run-input';

/**
 * Bridges the persisted configuration snapshot and the engine (`PROJECT_MAP.md`): resolve the
 * slot's config version upstream (TIME-007), then here select station epochs (fresh/reused/
 * missing, RUN-003..006), apply corrections exactly once (T01.4) and assemble the immutable
 * `ResolvedRunInput`. Pure with respect to the store: everything arrives as arguments.
 */

/**
 * Two constrained or fixed points is the floor for a unique solution (shared with the wizard gate).
 *
 * Below it the normal matrix is rank deficient: an infinity of translated and rotated solutions fits
 * the measurements equally well. That is a computation that does not pass, not a matter of taste.
 */
export const MINIMUM_HELD_REFERENCES = 2;

/**
 * Both live in `network-coordinates.ts`, which owns the coordinate resolution this module consumes;
 * they are re-exported here because this is where every caller already reads them from.
 */
export { DATUM_APPROXIMATION_SOURCE, stationPointId } from '@/demo/network-coordinates';

/**
 * One rule for reading a coordinate record, used for stations and points alike: a fully fixed record
 * holds the point still, a weighted component becomes a constraint equation, and anything else is
 * free. `legacyFixed` covers a pre-datum version whose local anchor was fixed implicitly.
 */
function resolveControl(
  control: ReferenceConstraint | undefined,
  legacyFixed: boolean,
): { free: boolean; constraints?: { component: 'e' | 'n' | 'h'; value: number; sigmaM: number }[] } {
  if (!control) return { free: !legacyFixed };
  const fullyFixed = control.modeE === 'fixed' && control.modeN === 'fixed' && control.modeH === 'fixed';
  if (fullyFixed) return { free: false };
  return {
    free: true,
    constraints: (['e', 'n', 'h'] as const).flatMap((component) => {
      const mode = component === 'e' ? control.modeE : component === 'n' ? control.modeN : control.modeH;
      const value = component === 'e' ? control.eastingM : component === 'n' ? control.northingM : control.heightM;
      const sigma = component === 'e' ? control.sigmaEM : component === 'n' ? control.sigmaNM : control.sigmaHM;
      return mode === 'weak' && sigma ? [{ component, value, sigmaM: sigma }] : [];
    }),
  };
}

// ---------------------------------------------------------------------------------------
// Draft -> resolved version snapshot (used at Review & Create and by Analysis save-candidate)
// ---------------------------------------------------------------------------------------

export interface BuildVersionArgs {
  draft: WizardDraft;
  processingId: number;
  versionNumber: number;
  versionId: string;
  createdBy: number;
  createdAt: string;
  reason: string;
  catalogue: DemoCatalogue;
}

export function buildVersionFromDraft(args: BuildVersionArgs): AdjustmentConfigVersion {
  const { draft, catalogue } = args;
  const stationInfo = new Map(catalogue.stations.map((s) => [s.stationCode, s]));
  const targetInfo = new Map(catalogue.targets.map((t) => [`${t.stationCode}|${t.rawTargetName}`, t]));

  const stationBindings: StationBinding[] = draft.stations.map((s) => {
    const info = stationInfo.get(s.stationCode);
    if (!info) throw new Error(`Unknown station ${s.stationCode}`);
    return {
      stationId: info.stationId,
      stationCode: s.stationCode,
      required: s.required,
      instrumentTemplateId: s.instrumentTemplateId,
      instrumentHeightM: s.instrumentHeightM,
      atmosphericPolicy: {
        ...s.atmosphericPolicy,
        variables:
          s.atmosphericPolicy.mode === 'cycle-temperature-pressure'
            ? {
                temperatureVariableId: info.temperatureVariableId,
                pressureVariableId: info.pressureVariableId,
                temporalToleranceMinutes: s.atmosphericPolicy.variables?.temporalToleranceMinutes ?? 15,
              }
            : s.atmosphericPolicy.variables,
      },
    };
  });

  // Physical points: confirmed shared groups + one individual point per remaining target
  // (POINT-001: distinct by default; POINT-011: sharing only via confirmed draft entries).
  const sharedByMember = new Map<string, string>();
  const physicalPoints: PhysicalPoint[] = [];
  for (const shared of draft.sharedPoints) {
    const id = `pp-${shared.key}`;
    for (const member of shared.members) sharedByMember.set(`${member.stationCode}|${member.rawTargetName}`, id);
  }

  const targetBindings: TargetBinding[] = draft.targets.map((t) => {
    const info = targetInfo.get(`${t.stationCode}|${t.rawTargetName}`);
    if (!info) throw new Error(`Unknown target ${t.stationCode}|${t.rawTargetName}`);
    const memberKey = `${t.stationCode}|${t.rawTargetName}`;
    const physicalPointId = sharedByMember.get(memberKey) ?? `pp-${t.stationCode}-${t.rawTargetName}`;
    const station = stationInfo.get(t.stationCode)!;
    // The standard errors a run is weighted with come from the station's instrument unless this
    // sight restates them: one chain, resolved once, for the native file and the preview alike.
    const precision = targetPrecision(draft, t);
    return {
      id: `tb-${t.stationCode}-${t.rawTargetName}`,
      stationId: station.stationId,
      prismSensorId: info.prismSensorId,
      rawTargetName: t.rawTargetName,
      role: t.role,
      includeInAdjustment: t.includeInAdjustment,
      publishOutput: t.publishOutput,
      observationVariables: {
        prismSensorId: info.prismSensorId,
        hzVariableId: info.hzVariableId,
        vzVariableId: info.vzVariableId,
        sdVariableId: info.sdVariableId,
      },
      measurementSetup: {
        templateId: t.measurementSetupId,
        measurementType: t.measurementType,
        edmMode: t.edmMode,
        reflectorTemplateId: t.measurementType === 'prism' ? (t.measurementSetupId ?? 'generic-prism') : undefined,
        requiredConstantM: t.measurementType === 'reflectorless' ? undefined : t.requiredConstantM,
        alreadyAppliedConstantM: t.measurementType === 'reflectorless' ? undefined : t.alreadyAppliedConstantM,
        prismDeltaM: t.measurementType === 'reflectorless' ? 0 : t.requiredConstantM - t.alreadyAppliedConstantM,
        targetHeightM: t.targetHeightM,
        distanceKind: precision.distanceKind.value,
        distanceStdErrMm: precision.distanceStdErrMm.value,
        distancePpm: precision.distancePpm.value,
        directionStdErrArcSec: precision.directionArcSec.value,
        zenithStdErrArcSec: precision.zenithArcSec.value,
        sourceByField: {
          requiredConstantM: t.measurementSetupId ? 'template' : 'config-override',
          alreadyAppliedConstantM: t.measurementSetupId ? 'template' : 'config-override',
          targetHeightM: info.adjustmentName !== undefined ? 'versioned-mapping' : 'config-override',
          // Which step of the chain actually produced this number, so a stored version says where
          // its weights came from instead of always claiming the template.
          distanceStdErrMm: precision.distanceStdErrMm.source === 'sight' ? 'config-override' : 'template',
        },
      },
      physicalPointId,
      engineName: t.engineName,
      reviewStatus: t.reviewStatus,
    };
  });

  // Build the physical point records (shared groups first, then individuals).
  // targetBindings maps 1:1 (same order) from draft.targets.
  const bindingByMember = new Map(draft.targets.map((t, i) => [`${t.stationCode}|${t.rawTargetName}`, targetBindings[i]]));
  for (const shared of draft.sharedPoints) {
    const members = shared.members
      .map((m) => bindingByMember.get(`${m.stationCode}|${m.rawTargetName}`))
      .filter((b): b is TargetBinding => !!b);
    if (members.length === 0) continue;
    physicalPoints.push({
      id: `pp-${shared.key}`,
      label: shared.key,
      engineName: members[0].engineName,
      role: members.some((m) => m.role === 'reference') ? 'reference' : 'monitoring',
      memberTargetBindingIds: members.map((m) => m.id),
      state: 'shared',
      source: shared.source,
    });
    // shared members use one engine name / one unknown (POINT-005)
    for (const member of members) member.engineName = members[0].engineName;
  }
  for (const binding of targetBindings) {
    if (physicalPoints.some((p) => p.memberTargetBindingIds.includes(binding.id))) continue;
    physicalPoints.push({
      id: binding.physicalPointId,
      label: binding.rawTargetName,
      engineName: binding.engineName,
      role: binding.role,
      memberTargetBindingIds: [binding.id],
      state: 'individual',
      source: 'default',
    });
  }

  const networkCoordinates = resolveNetworkCoordinates(draft);

  // Initial coordinates snapshot (INIT-008): points + station solutions.
  const initialCoordinates: InitialCoordinate[] = [];
  const result = draft.initialisation.result;
  if (result) {
    const pointIdByKey = new Map(physicalPoints.map((p) => [p.engineName, p.id]));
    for (const c of result.coordinates) {
      initialCoordinates.push({
        physicalPointId: pointIdByKey.get(c.pointKey) ?? c.pointKey,
        eastingM: c.eastingM,
        northingM: c.northingM,
        heightM: c.heightM,
        stationCount: c.stationCount,
        observationCount: c.observationCount,
        horizontalSpreadM: c.horizontalSpreadM,
        verticalSpreadM: c.verticalSpreadM,
        status: 'computed',
      });
    }
    for (const s of result.stationSolutions) {
      initialCoordinates.push({
        physicalPointId: stationPointId(s.stationCode),
        eastingM: s.eastingM,
        northingM: s.northingM,
        heightM: s.heightM,
        stationCount: 1,
        observationCount: 0,
        horizontalSpreadM: 0,
        verticalSpreadM: 0,
        status: 'computed',
      });
    }
  }

  return {
    id: args.versionId,
    processingId: args.processingId,
    versionNumber: args.versionNumber,
    label: `v${args.versionNumber}`,
    status: 'draft',
    validFrom: draft.validFrom,
    createdBy: args.createdBy,
    createdAt: args.createdAt,
    reason: args.reason,
    usedByRun: false,
    countryPreset: { templateId: draft.countryPresetId, templateVersion: 1 },
    stationBindings,
    targetBindings,
    physicalPoints,
    geometricRelationships: [],
    initialisation: {
      mode: draft.initialisation.mode,
      observationWindow: { from: draft.initialisation.windowFrom, to: draft.initialisation.windowTo },
      anchor: draft.initialisation.anchorStationCode
        ? {
            stationId: stationInfo.get(draft.initialisation.anchorStationCode)?.stationId ?? 0,
            eastingM: draft.initialisation.anchorEastingM,
            northingM: draft.initialisation.anchorNorthingM,
            heightM: draft.initialisation.anchorHeightM,
            orientationDeg: draft.initialisation.anchorOrientationDeg,
          }
        : undefined,
      // The coordinates are restated from the network resolution, never read off the record. A
      // constraint placed before the initialisation had run stored `0, 0, 0`, and that zero used to
      // travel all the way into the `C` line and pin the network to the origin.
      references: draft.initialisation.references.map((r) => ({
        physicalPointId: r.pointKey,
        eastingM: networkCoordinates.get(r.pointKey)?.eastingM ?? r.eastingM,
        northingM: networkCoordinates.get(r.pointKey)?.northingM ?? r.northingM,
        heightM: networkCoordinates.get(r.pointKey)?.heightM ?? r.heightM,
        modeE: r.modeE,
        modeN: r.modeN,
        modeH: r.modeH,
        sigmaEM: r.sigmaEM ?? r.sigmaM,
        sigmaNM: r.sigmaNM ?? r.sigmaM,
        sigmaHM: r.sigmaHM ?? r.sigmaM,
        source: r.source,
      })),
      initialCoordinates,
      coverage: {
        availablePhysicalPoints: result?.coverage.availablePhysicalPoints ?? 0,
        expectedPhysicalPoints: result?.coverage.expectedPhysicalPoints ?? 0,
        availableStationTargetPairs: result?.coverage.availableStationTargetPairs ?? 0,
        expectedStationTargetPairs: result?.coverage.expectedStationTargetPairs ?? 0,
        rawObservationCount: result?.coverage.observationsUsed ?? 0,
        representativeCount: result?.coverage.representativeCount ?? 0,
        missingPairs: [],
      },
    },
    adjustment: draft.adjustment,
    runPolicy: draft.runPolicy,
    outputPolicy: draft.outputPolicy,
    overriddenFields: [],
  };
}

// ---------------------------------------------------------------------------------------
// Version + slot -> ResolvedRunInput
// ---------------------------------------------------------------------------------------

export interface ResolveOptions {
  /** Extra observations delivered late (catch-up demo material). */
  extraObservations?: RawObservation[];
  /** Observation ids excluded by an Analysis Lab candidate version. */
  excludedObservationIds?: string[];
}

export interface ResolvedSlotRun {
  input: ResolvedRunInput;
  stationEpochs: { stationId: number; stationCode: string; epoch?: string; state: 'fresh' | 'reused' | 'missing'; ageMinutes?: number }[];
  provisional: boolean;
  blocking: string[];
  warnings: string[];
  correctionTraces: CorrectionTrace[];
  /** Observed publishable targets for Target Availability (OUT-006). */
  observedPublishTargets: number;
  totalPublishTargets: number;
  referencesAvailable: number;
}

export function resolveRunInputForSlot(
  version: AdjustmentConfigVersion,
  catalogue: DemoCatalogue,
  slotIso: string,
  options: ResolveOptions = {},
): ResolvedSlotRun {
  const warnings: string[] = [];
  const blocking: string[] = [];
  const traces: CorrectionTrace[] = [];
  const excluded = new Set(options.excludedObservationIds ?? []);

  const bindingsByStation = new Map<number, TargetBinding[]>();
  for (const binding of version.targetBindings) {
    bindingsByStation.set(binding.stationId, [...(bindingsByStation.get(binding.stationId) ?? []), binding]);
  }
  const pointById = new Map(version.physicalPoints.map((p) => [p.id, p]));
  const initialByPointId = new Map(version.initialisation.initialCoordinates.map((c) => [c.physicalPointId, c]));
  const referenceByPointKey = new Map(version.initialisation.references.map((r) => [r.physicalPointId, r]));

  const syncTol = version.runPolicy.syncToleranceMinutes;
  const maxAge = version.runPolicy.reuseMissingStation ? version.runPolicy.maxReusedAgeMinutes : syncTol;

  const observations: ResolvedRunObservation[] = [];
  const stationEpochs: ResolvedSlotRun['stationEpochs'] = [];
  const fixedOrientationsRad: Record<string, number> = {};
  let provisional = false;

  for (const station of version.stationBindings) {
    const all = [
      ...(catalogue.observationsByStation.get(station.stationCode) ?? []),
      ...(options.extraObservations ?? []).filter((o) => o.stationCode === station.stationCode),
    ];
    const bindings = (bindingsByStation.get(station.stationId) ?? []).filter((b) => b.includeInAdjustment);
    const candidateNames = new Set(bindings.map((binding) => binding.rawTargetName));
    const cycle = selectStationCycle(
      all.filter((observation) => candidateNames.has(observation.rawTargetName) && !excluded.has(observation.id)),
      slotIso,
      syncTol,
      syncTol,
      maxAge,
      version.outputPolicy.maxEpochToSlotMinutes,
    );
    const selectedByTarget = new Map(cycle.observations.map((observation) => [observation.rawTargetName, observation]));

    for (const binding of bindings) {
      const chosen = selectedByTarget.get(binding.rawTargetName);
      if (!chosen) continue; // DATA-008: never invented
      if (cycle.state === 'reused') provisional = version.runPolicy.markReuseProvisional ? true : provisional;

      const env = catalogue.envByStation.get(station.stationCode) ?? [];
      const corrected = applyDistanceCorrections(chosen, binding.measurementSetup, station.atmosphericPolicy, env);
      traces.push(corrected.trace);
      if (corrected.trace.blocking) {
        blocking.push(`${station.stationCode}/${binding.rawTargetName}: ${corrected.trace.warnings.join('; ')}`);
        continue;
      }
      if (corrected.trace.provisional) provisional = true;
      warnings.push(...corrected.trace.warnings.map((w) => `${station.stationCode}/${binding.rawTargetName}: ${w}`));

      const point = pointById.get(binding.physicalPointId);
      observations.push({
        id: chosen.id,
        stationEngineName: station.stationCode,
        targetEngineName: point?.engineName ?? binding.engineName,
        hzDeg: chosen.hzDeg,
        vzDeg: chosen.vzDeg,
        finalSlopeDistanceM: corrected.finalSlopeDistanceM,
        sigmaHzArcSec: binding.measurementSetup.directionStdErrArcSec
          ?? version.adjustment.defaultWeights.directionArcSec,
        sigmaVzArcSec: binding.measurementSetup.zenithStdErrArcSec
          ?? version.adjustment.defaultWeights.zenithArcSec,
        sigmaSdMm: binding.measurementSetup.distanceStdErrMm,
        sigmaSdPpm: binding.measurementSetup.distancePpm,
        instrumentHeightM: station.instrumentHeightM,
        targetHeightM: binding.measurementSetup.targetHeightM,
        excludedComponents: (['hz', 'vz', 'sd'] as const).filter((kind) => excluded.has(`${chosen.id}:${kind}`)),
      });
    }

    const state = cycle.state;
    stationEpochs.push({
      stationId: station.stationId,
      stationCode: station.stationCode,
      epoch: cycle.epoch,
      state,
      ageMinutes: cycle.ageMinutes,
    });
    if (state === 'missing' && station.required) {
      blocking.push(`Required station ${station.stationCode} has no usable epoch for this slot (RUN-006)`);
    }
    if (state === 'missing' && !station.required && !version.runPolicy.computeWithoutOptionalStations) {
      blocking.push(`Optional station ${station.stationCode} missing and the policy does not allow computing without it (RUN-007)`);
    }
  }

  // ------- points ---------------------------------------------------------------------
  const points: ResolvedRunPoint[] = [];
  const anchor = version.initialisation.anchor;
  const anchorStation = version.stationBindings.find((s) => s.stationId === anchor?.stationId);
  /**
   * A station is a coordinate record like any other (STAR*NET gives it no special status), so its
   * datum comes from the version's control records — not from how the initial coordinates happened
   * to be obtained. Fixing a station to *compute* approximations is an initialisation device; what a
   * run holds fixed is decided in the Adjustment step.
   */
  const stationControls = new Map(version.stationBindings.flatMap((station) => {
    const control = referenceByPointKey.get(stationPointId(station.stationCode));
    return control ? [[station.stationCode, control] as const] : [];
  }));
  /**
   * Compatibility: a version created before the datum moved to the Adjustment step carries no
   * station record at all. Such a version is immutable and must keep reproducing its historical
   * result, so its local anchor stays fixed with its orientation.
   */
  const legacyAnchorDatum = stationControls.size === 0
    && version.initialisation.mode === 'local-anchor'
    && anchor !== undefined;
  const controlledPointCount = version.physicalPoints.filter((point) =>
    referenceByPointKey.get(point.engineName) ?? referenceByPointKey.get(point.id)).length;

  for (const station of version.stationBindings) {
    const control = stationControls.get(station.stationCode);
    const isLegacyAnchor = legacyAnchorDatum && station.stationId === anchor?.stationId;
    const initial = initialByPointId.get(stationPointId(station.stationCode));
    const fallback = isLegacyAnchor ? anchor : undefined;
    const resolved = resolveControl(control, isLegacyAnchor);
    points.push({
      engineName: station.stationCode,
      eastingM: control?.eastingM ?? fallback?.eastingM ?? initial?.eastingM ?? 0,
      northingM: control?.northingM ?? fallback?.northingM ?? initial?.northingM ?? 0,
      heightM: control?.heightM ?? fallback?.heightM ?? initial?.heightM ?? 0,
      free: resolved.free,
      role: 'station',
      ...(resolved.constraints ? { constraints: resolved.constraints } : {}),
    });
    /**
     * The synthetic fixed backsight exists only to give a purely local network an orientation datum.
     * As soon as another point is controlled, the orientation follows from the geometry, and forcing
     * it would add a constraint the surveyor never asked for.
     */
    if (!resolved.free && controlledPointCount === 0) {
      fixedOrientationsRad[station.stationCode] = (anchor?.orientationDeg ?? 0) * DEG2RAD;
    }
  }
  if (version.initialisation.mode === 'local-anchor' && !anchorStation) {
    blocking.push('Local-anchor initialisation without an anchor station');
  }
  if (stationControls.size > 0 && controlledPointCount === 0
    && [...stationControls.values()].every((control) => control.modeE === 'free' && control.modeN === 'free' && control.modeH === 'free')) {
    blocking.push('Every station and point is free: the network has no datum (ADJ-004)');
  }

  const observedPointNames = new Set(observations.map((o) => o.targetEngineName));
  let referencesAvailable = 0;
  /**
    * The points that give this slot its datum: observed, and constrained or fixed.
    *
    * Neither the role nor the provenance of the coordinate is part of the test. Requiring a
    * coordinate from the survey refused an ordinary local-datum survey — fix a station to compute
    * approximations, free it, constrain two targets — which does have a datum and a unique solution.
    * What two constrained points buy is a solvable normal matrix; whether the coordinates are
    * absolute is a separate question, and one the interface states without blocking on it.
    */
  let heldReferences = 0;
  for (const point of version.physicalPoints) {
    if (!observedPointNames.has(point.engineName)) continue; // OUT-007/DATA-008
    const reference = referenceByPointKey.get(point.engineName) ?? referenceByPointKey.get(point.id);
    const initial = initialByPointId.get(point.id) ?? initialByPointId.get(point.engineName);
    if (reference) {
      referencesAvailable += 1;
      const resolved = resolveControl(reference, false);
      const holds = !resolved.free || (resolved.constraints?.length ?? 0) > 0;
      if (holds) heldReferences += 1;
      points.push({
        engineName: point.engineName,
        eastingM: reference.eastingM,
        northingM: reference.northingM,
        heightM: reference.heightM,
        free: resolved.free,
        role: 'reference',
        constraints: resolved.constraints,
      });
    } else if (initial) {
      points.push({
        engineName: point.engineName,
        eastingM: initial.eastingM,
        northingM: initial.northingM,
        heightM: initial.heightM,
        free: true,
        role: point.role,
      });
    } else {
      warnings.push(`Point ${point.engineName} observed but has no initial coordinates — skipped (INIT-010)`);
    }
  }
  /**
   * A network is held by its references. With fewer than two, a movement of the only held point
   * cannot be told apart from a movement of everything else, so the slot publishes nothing and the
   * cycle is skipped rather than producing a coordinate nobody can trust.
   */
  if (heldReferences < MINIMUM_HELD_REFERENCES) {
    blocking.push(
      `${heldReferences} constrained or fixed point(s) present in this slot: at least`
      + ` ${MINIMUM_HELD_REFERENCES} are required for a unique solution, so this cycle is skipped`
      + ' and nothing is published',
    );
  }
  const pointNames = new Set(points.map((p) => p.engineName));
  const usableObservations = observations.filter((o) => pointNames.has(o.targetEngineName));

  const publishable = version.targetBindings.filter((b) => b.publishOutput && b.includeInAdjustment);
  const observedPublish = publishable.filter((b) => observedPointNames.has(pointById.get(b.physicalPointId)?.engineName ?? ''));

  return {
    input: {
      processingId: version.processingId,
      configVersionId: version.id,
      outputSlot: slotIso,
      adjustment: version.adjustment,
      points,
      observations: usableObservations,
      fixedOrientationsRad,
    },
    stationEpochs,
    provisional,
    blocking,
    warnings,
    correctionTraces: traces,
    observedPublishTargets: observedPublish.length,
    totalPublishTargets: publishable.length,
    referencesAvailable,
  };
}
