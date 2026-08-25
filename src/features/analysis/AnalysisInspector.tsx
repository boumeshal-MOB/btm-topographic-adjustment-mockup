import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type {
  AnalysisCoordinate,
  AnalysisObservationOverride,
  AnalysisObservationSnapshot,
  AnalysisReferenceSigmaOverride,
  AnalysisTrialResult,
} from '@/domain/analysis/types';
import { residualLevel } from '@/domain/analysis/quality';
import type { DiagnosticResidual } from '@/domain/engine/run-input';
import { StatusChip } from '@/features/shared/components';
import type { NetworkSelection, NetworkSelectionMode } from '@/features/shared/network-selection';
import type { ReferenceConstraintMode, ReferenceConstraintModeOverride } from '@/domain/analysis/types';
import { fixed, millimetres } from '@/features/shared/format';
import { residualImpactPercent } from '@/features/shared/diagnostic-view-model';

/**
 * One inspector for whatever the map or the table has selected.
 *
 * This is the lab's main gesture: select a business object, change *its* parameters, run again.
 * Editing is an explicit mode — open it, change values, apply or discard — so a stray keystroke
 * never silently invalidates the result on screen. Applied but not-yet-recalculated values are
 * shown in magenta here and in the tables until a new trial is run.
 */

/**
 * Magenta marks a value the user changed. It cannot be confused with the normal/warning/critical
 * quality scale, nor with the amber "shared" chip the theme's secondary colour produces.
 */
export const EDITED_COLOUR = '#C026D3';

interface AnalysisInspectorProps {
  selection?: NetworkSelection;
  result: AnalysisTrialResult;
  excluded: Set<string>;
  onExcludedChange: (next: Set<string>) => void;
  disabledReferences: Set<string>;
  onToggleReference: (engineName: string) => void;
  coordinateOverrides: Record<string, AnalysisCoordinate>;
  onCoordinateOverride: (engineName: string, value: AnalysisCoordinate | undefined) => void;
  referenceSigmaOverrides: Record<string, AnalysisReferenceSigmaOverride>;
  onReferenceSigmaOverride: (engineName: string, value: AnalysisReferenceSigmaOverride | undefined) => void;
  constraintModeOverrides: Record<string, ReferenceConstraintModeOverride>;
  onConstraintModeOverride: (engineName: string, value: ReferenceConstraintModeOverride | undefined) => void;
  observationOverrides: Record<string, AnalysisObservationOverride>;
  onObservationOverride: (observationId: string, value: AnalysisObservationOverride | undefined) => void;
  selectionCount?: number;
  onSelect: (selection: NetworkSelection | undefined, mode?: NetworkSelectionMode) => void;
}

const COMPONENTS = ['hz', 'vz', 'sd'] as const;
type Component = (typeof COMPONENTS)[number];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Box sx={{ textAlign: 'right' }}>{children}</Box>
    </>
  );
}

function Mono({ children, edited, testId }: { children: ReactNode; edited?: boolean; testId?: string }) {
  return (
    <Typography
      variant="body2"
      fontFamily="monospace"
      sx={edited ? { color: EDITED_COLOUR, fontWeight: 700 } : undefined}
      data-testid={testId}
    >
      {children}
    </Typography>
  );
}

/** Edit / apply / discard, shared by both inspectors. */
function EditBar({
  editing, dirty, hasOverrides, onEdit, onApply, onCancel, onClear, testIdPrefix = 'inspector',
}: {
  editing: boolean;
  dirty: boolean;
  hasOverrides: boolean;
  onEdit: () => void;
  onApply: () => void;
  onCancel: () => void;
  onClear: () => void;
  testIdPrefix?: string;
}) {
  const { t } = useTranslation();
  const actionSx = { minWidth: 88, height: 32, px: 1, whiteSpace: 'nowrap' } as const;
  if (!editing) {
    return (
      <Stack direction="row" spacing={0.5} alignItems="center">
        <Button size="small" variant="outlined" onClick={onEdit} sx={actionSx} data-testid={`${testIdPrefix}-edit`}>
          {t('analysis.inspector.edit')}
        </Button>
        <Button
          size="small"
          variant="outlined"
          color={hasOverrides ? 'warning' : 'inherit'}
          disabled={!hasOverrides}
          onClick={onClear}
          sx={actionSx}
          data-testid={`${testIdPrefix}-clear`}
        >
          {t('analysis.inspector.clearEdits')}
        </Button>
      </Stack>
    );
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Button size="small" variant="contained" disabled={!dirty} onClick={onApply} sx={actionSx} data-testid={`${testIdPrefix}-apply`}>
        {t('analysis.inspector.apply')}
      </Button>
      <Button size="small" variant="outlined" onClick={onCancel} sx={actionSx} data-testid={`${testIdPrefix}-cancel`}>
        {t('analysis.inspector.cancel')}
      </Button>
    </Stack>
  );
}

export function AnalysisInspector(props: AnalysisInspectorProps) {
  const { t } = useTranslation();
  const { selection, result } = props;

  const residualsByScalarId = useMemo(() => {
    const map = new Map<string, DiagnosticResidual>();
    for (const residual of result.diagnostic.residuals) map.set(residual.scalarObservationId, residual);
    return map;
  }, [result.diagnostic.residuals]);

  if (!selection) {
    return (
      <Stack spacing={1} sx={{ p: 1.5 }} data-testid="analysis-inspector">
        <Typography variant="subtitle1" fontWeight={800}>{t('analysis.inspector.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('analysis.selection.hint')}</Typography>
        <Divider />
        <Typography variant="caption" color="text.secondary">{t('analysis.selection.syncHint')}</Typography>
      </Stack>
    );
  }

  if (selection.kind === 'sight') {
    return <SightInspector {...props} residualsByScalarId={residualsByScalarId} selection={selection} />;
  }
  return <PointInspector {...props} selection={selection} />;
}

// ---------------------------------------------------------------------------------------
// Point / station / control point
// ---------------------------------------------------------------------------------------

function PointInspector({
  selection,
  result,
  disabledReferences,
  onToggleReference,
  coordinateOverrides,
  onCoordinateOverride,
  referenceSigmaOverrides,
  onReferenceSigmaOverride,
  constraintModeOverrides,
  onConstraintModeOverride,
  observationOverrides,
  onObservationOverride,
  selectionCount,
  onSelect,
}: AnalysisInspectorProps & { selection: Extract<NetworkSelection, { kind: 'point' }> }) {
  const { t } = useTranslation();
  const point = result.points.find((candidate) => candidate.engineName === selection.engineName);
  const adjusted = result.diagnostic.points.find((candidate) => candidate.engineName === selection.engineName);

  const appliedCoordinate = coordinateOverrides[selection.engineName];
  const appliedSigmas = referenceSigmaOverrides[selection.engineName];
  const appliedModes = constraintModeOverrides[selection.engineName];

  const [editing, setEditing] = useState(false);
  const [coordinate, setCoordinate] = useState<AnalysisCoordinate>();
  const [sigmas, setSigmas] = useState<AnalysisReferenceSigmaOverride>({});
  const [modes, setModes] = useState<ReferenceConstraintModeOverride>({});
  const [draftFreed, setDraftFreed] = useState<boolean>();

  // A new selection must never inherit the previous object's pending edits.
  useEffect(() => {
    setEditing(false);
    setCoordinate(undefined);
    setSigmas({});
    setModes({});
    setDraftFreed(undefined);
  }, [selection.engineName]);

  const sights = useMemo(
    () => result.observations.filter((observation) =>
      observation.targetEngineName === selection.engineName
      || observation.stationEngineName === selection.engineName),
    [result.observations, selection.engineName],
  );

  if (!point) {
    return (
      <Stack spacing={1.25} sx={{ p: 1.5 }} data-testid="analysis-inspector">
        <Typography variant="subtitle1" fontWeight={800} fontFamily="monospace">{selection.engineName}</Typography>
        {adjusted && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.6 }}>
            <Row label={t('analysis.inspector.adjusted')}>
              <Mono>{fixed(adjusted.eastingM, 4)} / {fixed(adjusted.northingM, 4)} / {fixed(adjusted.heightM, 4)}</Mono>
            </Row>
          </Box>
        )}
        <SightList
          sights={sights}
          onSelect={onSelect}
          observationOverrides={observationOverrides}
          onObservationOverride={onObservationOverride}
        />
        <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
          {t('analysis.selection.clear')}
        </Button>
      </Stack>
    );
  }

  const baseCoordinate: AnalysisCoordinate = appliedCoordinate ?? point;
  const draftCoordinate = coordinate ?? baseCoordinate;
  const weakConstraints = point.constraints.filter((constraint) => constraint.mode === 'weak');
  const isReference = point.role === 'reference';
  const freed = disabledReferences.has(point.engineName);
  const effectiveFreed = draftFreed ?? freed;
  const hasOverrides = appliedCoordinate !== undefined
    || appliedSigmas !== undefined
    || appliedModes !== undefined
    || freed;
  const canToggleReference = isReference
    && (point.constraints.some((constraint) => constraint.mode !== 'free') || freed);
  const delta = adjusted
    ? {
        e: (adjusted.eastingM - point.eastingM) * 1000,
        n: (adjusted.northingM - point.northingM) * 1000,
        h: (adjusted.heightM - point.heightM) * 1000,
      }
    : undefined;
  const sigmaFor = (component: 'e' | 'n' | 'h', fallback?: number) =>
    sigmas[component] ?? appliedSigmas?.[component] ?? fallback ?? 0;
  const modeFor = (component: 'e' | 'n' | 'h', fallback: 'fixed' | 'weak' | 'free') =>
    modes[component] ?? appliedModes?.[component] ?? fallback;
  const dirty = coordinate !== undefined
    || Object.keys(sigmas).length > 0
    || Object.keys(modes).length > 0
    || draftFreed !== undefined;
  const resetControlDraft = () => {
    setEditing(false);
    setCoordinate(undefined);
    setSigmas({});
    setModes({});
    setDraftFreed(undefined);
  };
  const applyControlEdits = () => {
    if (coordinate) onCoordinateOverride(point.engineName, coordinate);
    if (Object.keys(sigmas).length > 0) {
      onReferenceSigmaOverride(point.engineName, { ...appliedSigmas, ...sigmas });
    }
    if (Object.keys(modes).length > 0) {
      onConstraintModeOverride(point.engineName, { ...appliedModes, ...modes });
    }
    if (draftFreed !== undefined && draftFreed !== freed) onToggleReference(point.engineName);
    resetControlDraft();
  };
  const clearControlEdits = () => {
    onCoordinateOverride(point.engineName, undefined);
    onReferenceSigmaOverride(point.engineName, undefined);
    onConstraintModeOverride(point.engineName, undefined);
    if (freed) onToggleReference(point.engineName);
  };

  return (
    <Stack spacing={1.25} sx={{ p: 1.5 }} data-testid="analysis-inspector">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} fontFamily="monospace" noWrap>{point.engineName}</Typography>
          <Typography variant="caption" color="text.secondary">
            {point.role === 'station' ? t('analysis.selection.station') : t('analysis.selection.point')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {selectionCount && selectionCount > 1 ? (
            <Chip size="small" color="info" label={t('analysis.selection.selectedCount', { count: selectionCount })} />
          ) : null}
          <StatusChip status={point.role} />
        </Stack>
      </Stack>

      {hasOverrides && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }} data-testid="inspector-edited">
          <Typography variant="caption">{t('analysis.inspector.editedPending')}</Typography>
        </Alert>
      )}

      {point.identityState === 'shared' && (
        <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
          <Typography variant="caption">{t('analysis.inspector.identity')}: {point.memberTargets.length} → 1</Typography>
          <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {point.memberTargets.map((member) => (
              <Chip key={member.bindingId} size="small" variant="outlined" label={`${member.stationCode} · ${member.rawTargetName}`} />
            ))}
          </Stack>
        </Alert>
      )}

      <Stack direction="row" spacing={0.6} flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" label={t('analysis.points.observationCountChip', { count: adjusted?.observationCount ?? 0 })} />
        {point.observedByStations.map((station) => <Chip key={station} size="small" variant="outlined" label={station} />)}
      </Stack>

      {/* A coordinate matrix is easier to scan than three slash-separated triplets. */}
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '78px repeat(3, minmax(68px, 1fr))',
            columnGap: 0.6,
            rowGap: 0.45,
            alignItems: 'center',
          }}
        >
          <span />
          {['E', 'N', 'H'].map((component) => (
            <Typography key={component} variant="caption" color="text.secondary" textAlign="right" fontWeight={800}>
              {component}
            </Typography>
          ))}
          <Typography variant="caption" color="text.secondary">{t('analysis.inspector.initial')}</Typography>
          {([baseCoordinate.eastingM, baseCoordinate.northingM, baseCoordinate.heightM] as const).map((value, index) => (
            <Typography
              key={`initial-${index}`}
              variant="caption"
              fontFamily="monospace"
              textAlign="right"
              sx={appliedCoordinate ? { color: EDITED_COLOUR, fontWeight: 800 } : undefined}
            >
              {fixed(value, 4)}
            </Typography>
          ))}
          {adjusted && (
            <>
              <Typography variant="caption" color="text.secondary">{t('analysis.inspector.adjusted')}</Typography>
              {[adjusted.eastingM, adjusted.northingM, adjusted.heightM].map((value, index) => (
                <Typography key={`adjusted-${index}`} variant="caption" fontFamily="monospace" textAlign="right">
                  {fixed(value, 4)}
                </Typography>
              ))}
            </>
          )}
          {delta && (
            <>
              <Typography variant="caption" color="text.secondary">Δ (mm)</Typography>
              {[delta.e, delta.n, delta.h].map((value, index) => (
                <Typography key={`delta-${index}`} variant="caption" fontFamily="monospace" textAlign="right">
                  {fixed(value, 2)}
                </Typography>
              ))}
            </>
          )}
          {adjusted && (
            <>
              <Typography variant="caption" color="text.secondary">σ (mm)</Typography>
              {[adjusted.sigmaEM, adjusted.sigmaNM, adjusted.sigmaHM].map((value, index) => (
                <Typography key={`sigma-${index}`} variant="caption" fontFamily="monospace" textAlign="right">
                  {millimetres(value)}
                </Typography>
              ))}
            </>
          )}
        </Box>
        {adjusted && (
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75, pt: 0.6, borderTop: '1px solid', borderColor: 'divider' }}>
            {t('analysis.inspector.ellipse')} a / b / θ&nbsp;
            <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.primary' }}>
              {millimetres(adjusted.ellipseSemiMajorM)} / {millimetres(adjusted.ellipseSemiMinorM)} mm / {fixed(adjusted.ellipseOrientationDeg, 1)}°
            </Box>
          </Typography>
        )}
      </Paper>

      {adjusted?.singleRay && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }}>
          <Typography variant="caption">{t('analysis.inspector.singleRay')}</Typography>
        </Alert>
      )}

      {isReference && (
        <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }} data-testid="control-constraints-section">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            justifyContent="space-between"
            alignItems={{ sm: 'center' }}
            gap={0.75}
            sx={{ mb: 1 }}
          >
            <Box>
              <Typography variant="subtitle2" fontWeight={800}>{t('analysis.inspector.control')}</Typography>
              <Typography variant="caption" color="text.secondary">{t('analysis.inspector.controlHelp')}</Typography>
            </Box>
            <EditBar
              editing={editing}
              dirty={dirty}
              hasOverrides={hasOverrides}
              onEdit={() => setEditing(true)}
              onApply={applyControlEdits}
              onCancel={resetControlDraft}
              onClear={clearControlEdits}
              testIdPrefix="control-constraints"
            />
          </Stack>
          <Stack spacing={0.75}>
            {point.constraints.map((constraint) => (
              <Box
                key={constraint.component}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '54px minmax(112px, 1fr) minmax(88px, auto)',
                  gap: 0.75,
                  alignItems: 'center',
                }}
              >
                <Typography variant="caption" fontWeight={700}>
                  {constraint.component === 'e' ? t('analysis.inspector.constraintE')
                    : constraint.component === 'n' ? t('analysis.inspector.constraintN')
                      : t('analysis.inspector.constraintH')}
                </Typography>
                {/* No label on the select: the row already says East/North/Height, so repeating
                    the section title would only narrow the control and add noise. */}
                {editing && constraint.mode !== 'fixed' ? (
                  <FormControl size="small" sx={{ minWidth: 112 }} disabled={effectiveFreed}>
                    <Select
                      value={modeFor(constraint.component, constraint.mode)}
                      onChange={(event) => setModes((current) => ({
                        ...current,
                        [constraint.component]: event.target.value as ReferenceConstraintMode,
                      }))}
                      inputProps={{ 'aria-label': `${t('analysis.inspector.control')} ${constraint.component.toUpperCase()}` }}
                    >
                      {/* A component cannot be fixed on its own — the engine has one weak
                          constraint per component and a fully fixed point. Fixing a whole point
                          is a datum decision made in the configuration. */}
                      <MenuItem value="weak">{t('enums.constraint.weak')}</MenuItem>
                      <MenuItem value="free">{t('enums.constraint.free')}</MenuItem>
                    </Select>
                  </FormControl>
                ) : (
                  <Chip
                    size="small"
                    variant="outlined"
                    label={t(`enums.constraint.${modeFor(constraint.component, constraint.mode)}`)}
                    sx={appliedModes?.[constraint.component] !== undefined
                      ? { color: EDITED_COLOUR, borderColor: EDITED_COLOUR }
                      : undefined}
                  />
                )}
                {modeFor(constraint.component, constraint.mode) === 'weak' && (editing ? (
                  <TextField
                    size="small"
                    type="number"
                    label={`σ ${constraint.component.toUpperCase()} mm`}
                    value={sigmaFor(constraint.component, constraint.sigmaM) * 1000}
                    onChange={(event) => setSigmas((current) => ({
                      ...current,
                      [constraint.component]: Number(event.target.value) / 1000,
                    }))}
                    inputProps={{ min: 0.001, step: 0.1 }}
                    disabled={effectiveFreed}
                    sx={{ width: 96 }}
                  />
                ) : (
                  <Mono
                    edited={appliedSigmas?.[constraint.component] !== undefined}
                    testId={`control-sigma-${constraint.component}`}
                  >
                    {millimetres(sigmaFor(constraint.component, constraint.sigmaM))} mm
                  </Mono>
                ))}
              </Box>
            ))}
            {weakConstraints.length === 0 && point.fixed && (
              <Typography variant="caption" color="text.secondary">{t('analysis.inspector.modeFixed')}</Typography>
            )}
            {!point.fixed && editing && !effectiveFreed && (
              <Box sx={{ pt: 0.75, mt: 0.25, borderTop: '1px solid', borderColor: 'divider' }}>
                <Typography variant="caption" color="text.secondary">
                  {t('analysis.inspector.initialCoordinates')}
                </Typography>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                  {([['E', 'eastingM'], ['N', 'northingM'], ['H', 'heightM']] as const).map(([label, key]) => (
                    <TextField
                      key={key}
                      size="small"
                      type="number"
                      label={`${label} (m)`}
                      value={draftCoordinate[key]}
                      onChange={(event) => setCoordinate({ ...draftCoordinate, [key]: Number(event.target.value) })}
                      inputProps={{ step: 0.0001 }}
                      sx={{ minWidth: 0 }}
                    />
                  ))}
                </Stack>
              </Box>
            )}
            {canToggleReference && (
              <Button
                size="small"
                variant="outlined"
                color={effectiveFreed ? 'warning' : 'inherit'}
                disabled={!editing}
                onClick={() => {
                  const next = !effectiveFreed;
                  setDraftFreed(next === freed ? undefined : next);
                }}
                sx={{ alignSelf: 'flex-start' }}
                data-testid="inspector-toggle-reference"
              >
                {effectiveFreed ? t('analysis.inspector.restoreReference') : t('analysis.inspector.freeReference')}
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      <SightList
        sights={sights}
        onSelect={onSelect}
        observationOverrides={observationOverrides}
        onObservationOverride={onObservationOverride}
      />
      <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
        {t('analysis.selection.clear')}
      </Button>
    </Stack>
  );
}

/**
 * The sights of the selected point, with their precision editable in place.
 *
 * Reaching a sight's sigma used to mean selecting the sight first; from a point, the observations
 * that determine it are exactly what a surveyor wants to reweight.
 */
function SightList({
  sights,
  onSelect,
  observationOverrides,
  onObservationOverride,
}: {
  sights: AnalysisObservationSnapshot[];
  onSelect: (selection: NetworkSelection | undefined, mode?: NetworkSelectionMode) => void;
  observationOverrides: Record<string, AnalysisObservationOverride>;
  onObservationOverride: (observationId: string, value: AnalysisObservationOverride | undefined) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, AnalysisObservationOverride>>({});

  const sightSignature = sights.map((sight) => sight.observationId).join('|');
  useEffect(() => {
    setEditing(false);
    setDraft({});
  }, [sightSignature]);

  if (sights.length === 0) return null;

  const hasOverrides = sights.some((sight) => {
    const override = observationOverrides[sight.observationId];
    return override !== undefined && Object.keys(override).length > 0;
  });
  const dirty = Object.keys(draft).length > 0;

  const resetDraft = () => {
    setDraft({});
    setEditing(false);
  };
  const applyEdits = () => {
    for (const [observationId, value] of Object.entries(draft)) {
      onObservationOverride(observationId, { ...observationOverrides[observationId], ...value });
    }
    resetDraft();
  };
  const clearEdits = () => {
    for (const sight of sights) onObservationOverride(sight.observationId, undefined);
    resetDraft();
  };

  const sigmaOf = (sight: AnalysisObservationSnapshot, key: 'sigmaHzArcSec' | 'sigmaVzArcSec' | 'sigmaSdMm') =>
    draft[sight.observationId]?.[key]
      ?? observationOverrides[sight.observationId]?.[key]
      ?? sight.effectivePrecision[key];

  return (
    <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }} data-testid="observation-precision-section">
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ sm: 'center' }}
        gap={0.75}
        sx={{ mb: 1 }}
      >
        <Box>
          <Typography variant="subtitle2" fontWeight={800}>{t('analysis.inspector.observationPrecision')}</Typography>
          <Typography variant="caption" color="text.secondary">{t('analysis.inspector.observationPrecisionHelp')}</Typography>
        </Box>
        <EditBar
          editing={editing}
          dirty={dirty}
          hasOverrides={hasOverrides}
          onEdit={() => setEditing(true)}
          onApply={applyEdits}
          onCancel={resetDraft}
          onClear={clearEdits}
          testIdPrefix="observation-precision"
        />
      </Stack>

      {editing ? (
        <Stack spacing={0.75} sx={{ mt: 0.5 }}>
          {sights.slice(0, 12).map((sight) => (
            <Box key={sight.observationId}>
              <Typography variant="caption" fontFamily="monospace">
                {sight.stationEngineName} → {sight.targetEngineName}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.25 }}>
                {([['Hz ″', 'sigmaHzArcSec'], ['Vz ″', 'sigmaVzArcSec'], ['Sd mm', 'sigmaSdMm']] as const)
                  .map(([label, key]) => (
                    <TextField
                      key={key}
                      size="small"
                      type="number"
                      label={label}
                      value={sigmaOf(sight, key)}
                      onChange={(event) => setDraft((current) => ({
                        ...current,
                        [sight.observationId]: {
                          ...current[sight.observationId],
                          [key]: Number(event.target.value),
                        },
                      }))}
                      inputProps={{ min: 0.0001, step: key === 'sigmaSdMm' ? 0.1 : 0.05 }}
                      sx={{ width: 92 }}
                    />
                  ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : (
        <Stack spacing={0.25}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'minmax(110px, 1fr) repeat(3, 50px)',
              gap: 0.5,
              px: 0.75,
            }}
          >
            <Typography variant="caption" color="text.secondary">{t('analysis.selection.sight')}</Typography>
            <Typography variant="caption" color="text.secondary" textAlign="right">Hz ″</Typography>
            <Typography variant="caption" color="text.secondary" textAlign="right">Vz ″</Typography>
            <Typography variant="caption" color="text.secondary" textAlign="right">Sd mm</Typography>
          </Box>
          {sights.slice(0, 24).map((sight) => (
            <Button
              key={sight.observationId}
              size="small"
              variant="text"
              onClick={(event) => onSelect({
                kind: 'sight',
                stationEngineName: sight.stationEngineName,
                targetEngineName: sight.targetEngineName,
              }, event.ctrlKey ? 'toggle' : 'replace')}
              sx={{
                display: 'grid',
                gridTemplateColumns: 'minmax(110px, 1fr) repeat(3, 50px)',
                gap: 0.5,
                px: 0.75,
                py: 0.4,
                justifyItems: 'stretch',
                textTransform: 'none',
                color: 'text.primary',
                borderTop: '1px solid',
                borderColor: 'divider',
                borderRadius: 0,
              }}
            >
              <Typography variant="caption" fontFamily="monospace" noWrap textAlign="left">
                {sight.stationEngineName} → {sight.targetEngineName}
              </Typography>
              {(['sigmaHzArcSec', 'sigmaVzArcSec', 'sigmaSdMm'] as const).map((key) => (
                <Typography
                  key={key}
                  variant="caption"
                  fontFamily="monospace"
                  textAlign="right"
                  data-testid={`observation-precision-${sight.observationId}-${key}`}
                  sx={observationOverrides[sight.observationId]?.[key] !== undefined
                    ? { color: EDITED_COLOUR, fontWeight: 800 }
                    : undefined}
                >
                  {fixed(sigmaOf(sight, key), 2)}
                </Typography>
              ))}
            </Button>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

// ---------------------------------------------------------------------------------------
// Sight line
// ---------------------------------------------------------------------------------------

function SightInspector({
  selection,
  result,
  excluded,
  onExcludedChange,
  observationOverrides,
  onObservationOverride,
  onSelect,
  selectionCount,
  residualsByScalarId,
}: AnalysisInspectorProps & {
  selection: Extract<NetworkSelection, { kind: 'sight' }>;
  residualsByScalarId: Map<string, DiagnosticResidual>;
}) {
  const { t } = useTranslation();
  const observation = result.observations.find((candidate) =>
    candidate.stationEngineName === selection.stationEngineName
    && candidate.targetEngineName === selection.targetEngineName);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AnalysisObservationOverride>({});
  const [draftExcluded, setDraftExcluded] = useState<Set<string>>();

  useEffect(() => {
    setEditing(false);
    setDraft({});
    setDraftExcluded(undefined);
  }, [selection.stationEngineName, selection.targetEngineName]);

  if (!observation) {
    return (
      <Stack spacing={1} sx={{ p: 1.5 }} data-testid="analysis-inspector">
        <Typography variant="subtitle1" fontWeight={800}>{t('analysis.selection.sight')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('analysis.observations.empty')}</Typography>
        <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
          {t('analysis.selection.clear')}
        </Button>
      </Stack>
    );
  }

  const applied = observationOverrides[observation.observationId];
  const scalarIds = COMPONENTS.map((kind) => `${observation.observationId}:${kind}`);
  const hasOverrides = (applied !== undefined && Object.keys(applied).length > 0)
    || scalarIds.some((scalarId) => excluded.has(scalarId));
  const effectiveExcluded = draftExcluded ?? excluded;

  const componentLabel: Record<Component, string> = {
    hz: t('analysis.inspector.componentHz'),
    vz: t('analysis.inspector.componentVz'),
    sd: t('analysis.inspector.componentSd'),
  };
  const valueKeyOf = (kind: Component) => kind === 'hz' ? 'hzDeg' as const
    : kind === 'vz' ? 'vzDeg' as const : 'finalSlopeDistanceM' as const;
  const sigmaKeyOf = (kind: Component) => kind === 'hz' ? 'sigmaHzArcSec' as const
    : kind === 'vz' ? 'sigmaVzArcSec' as const : 'sigmaSdMm' as const;
  const baseValue = (kind: Component) => kind === 'hz' ? observation.effectiveValues.hzDeg
    : kind === 'vz' ? observation.effectiveValues.vzDeg : observation.effectiveValues.finalSlopeDistanceM;
  const baseSigma = (kind: Component) => kind === 'hz' ? observation.effectivePrecision.sigmaHzArcSec
    : kind === 'vz' ? observation.effectivePrecision.sigmaVzArcSec : observation.effectivePrecision.sigmaSdMm;
  // The result remains the last calculated trial while the editor contains pending settings.
  // Therefore the inspector must explicitly layer applied overrides over the result snapshot.
  const valueOf = (kind: Component) => applied?.[valueKeyOf(kind)] ?? baseValue(kind);
  const sigmaOf = (kind: Component) => draft[sigmaKeyOf(kind)]
    ?? applied?.[sigmaKeyOf(kind)]
    ?? baseSigma(kind);

  const dirty = Object.keys(draft).length > 0 || draftExcluded !== undefined;

  const toggleComponent = (scalarId: string) => {
    const next = new Set(effectiveExcluded);
    if (next.has(scalarId)) next.delete(scalarId); else next.add(scalarId);
    setDraftExcluded(next);
  };
  const resetObservationDraft = () => {
    setEditing(false);
    setDraft({});
    setDraftExcluded(undefined);
  };
  const applyObservationEdits = () => {
    if (Object.keys(draft).length > 0) {
      onObservationOverride(observation.observationId, { ...applied, ...draft });
    }
    if (draftExcluded) onExcludedChange(draftExcluded);
    resetObservationDraft();
  };
  const clearObservationEdits = () => {
    onObservationOverride(observation.observationId, undefined);
    const nextExcluded = new Set(excluded);
    for (const scalarId of scalarIds) nextExcluded.delete(scalarId);
    onExcludedChange(nextExcluded);
  };

  return (
    <Stack spacing={1.25} sx={{ p: 1.5 }} data-testid="analysis-inspector">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} fontFamily="monospace" noWrap>
            {observation.stationEngineName} → {observation.targetEngineName}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('analysis.selection.sight')}</Typography>
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center">
          {selectionCount && selectionCount > 1 ? (
            <Chip size="small" color="info" label={t('analysis.selection.selectedCount', { count: selectionCount })} />
          ) : null}
          <StatusChip status={observation.pointRole} />
        </Stack>
      </Stack>

      {hasOverrides && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }} data-testid="inspector-edited">
          <Typography variant="caption">{t('analysis.inspector.editedPending')}</Typography>
        </Alert>
      )}
      {observation.sharedPhysicalPoint && (
        <Chip size="small" color="secondary" variant="outlined" label={t('analysis.inspector.identity')} />
      )}

      <Paper variant="outlined" sx={{ p: 1.1, borderRadius: 1.5 }} data-testid="observation-precision-section">
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ sm: 'center' }}
          gap={0.75}
          sx={{ mb: 1 }}
        >
          <Box>
            <Typography variant="subtitle2" fontWeight={800}>{t('analysis.inspector.observationPrecision')}</Typography>
            <Typography variant="caption" color="text.secondary">{t('analysis.inspector.observationPrecisionHelp')}</Typography>
          </Box>
          <EditBar
            editing={editing}
            dirty={dirty}
            hasOverrides={hasOverrides}
            onEdit={() => setEditing(true)}
            onApply={applyObservationEdits}
            onCancel={resetObservationDraft}
            onClear={clearObservationEdits}
            testIdPrefix="sight-observation"
          />
        </Stack>
        <Stack spacing={0.75}>
          {COMPONENTS.map((kind) => {
          const scalarId = `${observation.observationId}:${kind}`;
          const residual = residualsByScalarId.get(scalarId);
          const isUsed = !effectiveExcluded.has(scalarId);
          const level = residual ? residualLevel(residual.stdResidual) : undefined;
          return (
            <Box key={kind} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="body2" fontWeight={700}>{componentLabel[kind]}</Typography>
                <Tooltip title={observation.protected ? t('analysis.observations.protected') : ''}>
                  <FormControlLabel
                    control={(
                      <Checkbox
                        size="small"
                        checked={isUsed}
                        disabled={observation.protected || !editing}
                        onChange={() => toggleComponent(scalarId)}
                        inputProps={{
                          'aria-label': `${t('analysis.inspector.include')} ${componentLabel[kind]} ${observation.stationEngineName} ${observation.targetEngineName}`,
                        }}
                      />
                    )}
                    label={<Typography variant="caption">{t('analysis.inspector.include')}</Typography>}
                    sx={{ mr: 0 }}
                  />
                </Tooltip>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.5, mt: 0.5 }}>
                <Row label={t('analysis.observations.value')}>
                  <Mono edited={applied?.[valueKeyOf(kind)] !== undefined}>
                    {fixed(valueOf(kind), kind === 'sd' ? 4 : 6)} {kind === 'sd' ? 'm' : '°'}
                  </Mono>
                </Row>
                <Row label={t('analysis.observations.sigma')}>
                  {editing ? (
                    <TextField
                      size="small"
                      type="number"
                      value={sigmaOf(kind)}
                      onChange={(event) => setDraft((current) => ({ ...current, [sigmaKeyOf(kind)]: Number(event.target.value) }))}
                      inputProps={{ min: 0.0001, step: kind === 'sd' ? 0.1 : 0.05, 'aria-label': `${t('analysis.observations.sigma')} ${componentLabel[kind]}` }}
                      sx={{ width: 110 }}
                    />
                  ) : (
                    <Mono edited={applied?.[sigmaKeyOf(kind)] !== undefined}>
                      {fixed(sigmaOf(kind), 2)} {kind === 'sd' ? 'mm' : '″'}
                    </Mono>
                  )}
                </Row>
                {residual && (
                  <>
                    <Row label={t('analysis.inspector.residual')}>
                      <Mono>
                        {kind === 'sd'
                          ? `${millimetres(residual.residual)} mm`
                          : `${fixed(residual.residual * (180 / Math.PI) * 3600, 2)}″`}
                      </Mono>
                    </Row>
                    <Row label={t('analysis.inspector.standardised')}>
                      <Chip
                        size="small"
                        color={level === 'critical' ? 'error' : level === 'warning' ? 'warning' : 'default'}
                        variant="outlined"
                        label={fixed(residual.stdResidual, 2)}
                      />
                    </Row>
                    <Row label={t('analysis.inspector.impact')}>
                      <Mono>{Number.isFinite(residualImpactPercent(residual)) ? `${fixed(residualImpactPercent(residual), 0)}%` : '—'}</Mono>
                    </Row>
                  </>
                )}
              </Box>
            </Box>
          );
          })}
        </Stack>
      </Paper>

      <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
        <Typography variant="caption">{t('analysis.inspector.rawDataUntouched')}</Typography>
      </Alert>

      <Divider />
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" clickable label={observation.stationEngineName}
          onClick={() => onSelect({ kind: 'point', engineName: observation.stationEngineName })} />
        <Chip size="small" variant="outlined" clickable label={observation.targetEngineName}
          onClick={() => onSelect({ kind: 'point', engineName: observation.targetEngineName })} />
      </Stack>
      <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
        {t('analysis.selection.clear')}
      </Button>
    </Stack>
  );
}
