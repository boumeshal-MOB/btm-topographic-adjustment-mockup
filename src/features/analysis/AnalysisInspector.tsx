import { useMemo, type ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
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
import type { DiagnosticResidual } from '@/domain/engine/run-input';
import { StatusChip } from '@/features/shared/components';
import type { NetworkSelection } from '@/features/shared/network-selection';

/**
 * One inspector for whatever the map or the table has selected.
 *
 * This is the lab's main gesture: select a business object, change *its* parameters, run again.
 * The user never edits a preview file and never types into a grid of numbers detached from the
 * object they belong to (FRONTEND-AND-ANALYSIS-LAB.md §"Modification simple par objet métier").
 */

interface AnalysisInspectorProps {
  selection?: NetworkSelection;
  result: AnalysisTrialResult;
  excluded: Set<string>;
  onToggleComponent: (scalarObservationId: string) => void;
  disabledReferences: Set<string>;
  onToggleReference: (engineName: string) => void;
  coordinateOverrides: Record<string, AnalysisCoordinate>;
  onCoordinateOverride: (engineName: string, value: AnalysisCoordinate) => void;
  referenceSigmaOverrides: Record<string, AnalysisReferenceSigmaOverride>;
  onReferenceSigmaOverride: (engineName: string, value: AnalysisReferenceSigmaOverride) => void;
  observationOverrides: Record<string, AnalysisObservationOverride>;
  onObservationOverride: (observationId: string, value: AnalysisObservationOverride) => void;
  onSelect: (selection: NetworkSelection | undefined) => void;
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

function Mono({ children }: { children: ReactNode }) {
  return <Typography variant="body2" fontFamily="monospace">{children}</Typography>;
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
// Point / station / reference
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
  onSelect,
}: AnalysisInspectorProps & {
  selection: Extract<NetworkSelection, { kind: 'point' }>;
}) {
  const { t } = useTranslation();
  const point = result.points.find((candidate) => candidate.engineName === selection.engineName);
  const adjusted = result.diagnostic.points.find((candidate) => candidate.engineName === selection.engineName);

  const sights = useMemo(
    () => result.observations.filter((observation) =>
      observation.targetEngineName === selection.engineName
      || observation.stationEngineName === selection.engineName),
    [result.observations, selection.engineName],
  );

  if (!point) {
    // A station appears in the solution without being a target binding; show what we do have.
    return (
      <Stack spacing={1.25} sx={{ p: 1.5 }} data-testid="analysis-inspector">
        <Typography variant="subtitle1" fontWeight={800} fontFamily="monospace">{selection.engineName}</Typography>
        {adjusted && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.6 }}>
            <Row label={t('analysis.inspector.adjusted')}>
              <Mono>
                {adjusted.eastingM.toFixed(4)} / {adjusted.northingM.toFixed(4)} / {adjusted.heightM.toFixed(4)}
              </Mono>
            </Row>
          </Box>
        )}
        <SightList sights={sights} onSelect={onSelect} />
        <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
          {t('analysis.selection.clear')}
        </Button>
      </Stack>
    );
  }

  const editedInitial = coordinateOverrides[point.engineName] ?? point;
  const weakConstraints = point.constraints.filter((constraint) => constraint.mode === 'weak');
  const isReference = point.role === 'reference';
  const freed = disabledReferences.has(point.engineName);
  const canToggleReference = isReference
    && (point.constraints.some((constraint) => constraint.mode !== 'free') || freed);
  const delta = adjusted
    ? {
        e: (adjusted.eastingM - point.eastingM) * 1000,
        n: (adjusted.northingM - point.northingM) * 1000,
        h: (adjusted.heightM - point.heightM) * 1000,
      }
    : undefined;

  return (
    <Stack spacing={1.25} sx={{ p: 1.5 }} data-testid="analysis-inspector">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} fontFamily="monospace" noWrap>
            {point.engineName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {point.role === 'station' ? t('analysis.selection.station') : t('analysis.selection.point')}
          </Typography>
        </Box>
        <StatusChip status={point.role} />
      </Stack>

      {point.identityState === 'shared' && (
        <Alert severity="info" variant="outlined" sx={{ py: 0.25 }}>
          <Typography variant="caption">
            {t('analysis.inspector.identity')}: {point.memberTargets.length} → 1
          </Typography>
          <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {point.memberTargets.map((member) => (
              <Chip
                key={member.bindingId}
                size="small"
                variant="outlined"
                label={`${member.stationCode} · ${member.rawTargetName}`}
              />
            ))}
          </Stack>
        </Alert>
      )}

      <Divider />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.6, alignItems: 'center' }}>
        <Row label={t('analysis.inspector.observations')}>
          <Mono>{adjusted?.observationCount ?? 0}</Mono>
        </Row>
        <Row label={t('analysis.points.observedFrom')}>
          <Typography variant="body2">{point.observedByStations.join(', ') || '—'}</Typography>
        </Row>
        <Row label={t('analysis.inspector.initial')}>
          <Mono>{point.eastingM.toFixed(4)} / {point.northingM.toFixed(4)} / {point.heightM.toFixed(4)}</Mono>
        </Row>
        {adjusted && (
          <Row label={t('analysis.inspector.adjusted')}>
            <Mono>{adjusted.eastingM.toFixed(4)} / {adjusted.northingM.toFixed(4)} / {adjusted.heightM.toFixed(4)}</Mono>
          </Row>
        )}
        {delta && (
          <Row label={t('analysis.inspector.delta')}>
            <Mono>
              {delta.e.toFixed(2)} / {delta.n.toFixed(2)} / {delta.h.toFixed(2)} mm
            </Mono>
          </Row>
        )}
        {adjusted && (
          <>
            <Row label={t('analysis.inspector.sigmas')}>
              <Mono>
                {(adjusted.sigmaEM * 1000).toFixed(2)} / {(adjusted.sigmaNM * 1000).toFixed(2)} / {(adjusted.sigmaHM * 1000).toFixed(2)} mm
              </Mono>
            </Row>
            <Row label={t('analysis.inspector.ellipse')}>
              <Mono>
                {(adjusted.ellipseSemiMajorM * 1000).toFixed(2)} / {(adjusted.ellipseSemiMinorM * 1000).toFixed(2)} mm
              </Mono>
            </Row>
          </>
        )}
      </Box>

      {adjusted?.singleRay && (
        <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }}>
          <Typography variant="caption">{t('analysis.inspector.singleRay')}</Typography>
        </Alert>
      )}

      {isReference && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">{t('analysis.inspector.control')}</Typography>
          <Stack spacing={0.75}>
            {point.constraints.map((constraint) => (
              <Stack key={constraint.component} direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ minWidth: 54 }}>
                  {constraint.component === 'e'
                    ? t('analysis.inspector.constraintE')
                    : constraint.component === 'n'
                      ? t('analysis.inspector.constraintN')
                      : t('analysis.inspector.constraintH')}
                </Typography>
                <Chip
                  size="small"
                  variant="outlined"
                  label={constraint.mode === 'fixed'
                    ? t('analysis.inspector.modeFixed')
                    : constraint.mode === 'weak'
                      ? t('analysis.inspector.modeWeak')
                      : t('analysis.inspector.modeFree')}
                />
                {constraint.mode === 'weak' && (
                  <TextField
                    size="small"
                    type="number"
                    label={`σ ${constraint.component.toUpperCase()} mm`}
                    value={(referenceSigmaOverrides[point.engineName]?.[constraint.component]
                      ?? constraint.sigmaM ?? 0) * 1000}
                    onChange={(event) => onReferenceSigmaOverride(point.engineName, {
                      ...referenceSigmaOverrides[point.engineName],
                      [constraint.component]: Number(event.target.value) / 1000,
                    })}
                    inputProps={{ min: 0.001, step: 0.1 }}
                    disabled={freed}
                    sx={{ width: 110 }}
                  />
                )}
              </Stack>
            ))}
            {weakConstraints.length === 0 && point.fixed && (
              <Typography variant="caption" color="text.secondary">{t('analysis.inspector.modeFixed')}</Typography>
            )}
            {canToggleReference && (
              <Button
                size="small"
                variant="outlined"
                color={freed ? 'warning' : 'inherit'}
                onClick={() => onToggleReference(point.engineName)}
                sx={{ alignSelf: 'flex-start' }}
                data-testid="inspector-toggle-reference"
              >
                {freed ? t('analysis.inspector.restoreReference') : t('analysis.inspector.freeReference')}
              </Button>
            )}
          </Stack>
        </>
      )}

      {!point.fixed && (
        <>
          <Divider />
          <Typography variant="overline" color="text.secondary">{t('analysis.inspector.initial')}</Typography>
          <Stack direction="row" spacing={0.75}>
            {([['E', 'eastingM'], ['N', 'northingM'], ['H', 'heightM']] as const).map(([label, key]) => (
              <TextField
                key={key}
                size="small"
                type="number"
                label={label}
                value={editedInitial[key]}
                onChange={(event) => onCoordinateOverride(point.engineName, {
                  ...editedInitial,
                  [key]: Number(event.target.value),
                })}
                inputProps={{ step: 0.0001 }}
              />
            ))}
          </Stack>
        </>
      )}

      <Divider />
      <SightList sights={sights} onSelect={onSelect} />
      <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
        {t('analysis.selection.clear')}
      </Button>
    </Stack>
  );
}

function SightList({
  sights,
  onSelect,
}: {
  sights: AnalysisObservationSnapshot[];
  onSelect: (selection: NetworkSelection | undefined) => void;
}) {
  const { t } = useTranslation();
  if (sights.length === 0) return null;
  return (
    <Box>
      <Typography variant="overline" color="text.secondary">{t('analysis.observations.title')}</Typography>
      <Stack direction="row" spacing={0.4} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
        {sights.slice(0, 24).map((sight) => (
          <Chip
            key={sight.observationId}
            size="small"
            variant="outlined"
            clickable
            label={`${sight.stationEngineName} → ${sight.targetEngineName}`}
            onClick={() => onSelect({
              kind: 'sight',
              stationEngineName: sight.stationEngineName,
              targetEngineName: sight.targetEngineName,
            })}
          />
        ))}
      </Stack>
    </Box>
  );
}

// ---------------------------------------------------------------------------------------
// Sight line
// ---------------------------------------------------------------------------------------

function SightInspector({
  selection,
  result,
  excluded,
  onToggleComponent,
  observationOverrides,
  onObservationOverride,
  onSelect,
  residualsByScalarId,
}: AnalysisInspectorProps & {
  selection: Extract<NetworkSelection, { kind: 'sight' }>;
  residualsByScalarId: Map<string, DiagnosticResidual>;
}) {
  const { t } = useTranslation();
  const observation = result.observations.find((candidate) =>
    candidate.stationEngineName === selection.stationEngineName
    && candidate.targetEngineName === selection.targetEngineName);

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

  const override = observationOverrides[observation.observationId];
  const patch = (change: AnalysisObservationOverride) =>
    onObservationOverride(observation.observationId, { ...override, ...change });

  const componentLabel: Record<Component, string> = {
    hz: t('analysis.inspector.componentHz'),
    vz: t('analysis.inspector.componentVz'),
    sd: t('analysis.inspector.componentSd'),
  };
  const valueOf = (kind: Component) => kind === 'hz'
    ? observation.effectiveValues.hzDeg
    : kind === 'vz' ? observation.effectiveValues.vzDeg : observation.effectiveValues.finalSlopeDistanceM;
  const unitOf = (kind: Component) => (kind === 'sd' ? 'm' : '°');
  const sigmaOf = (kind: Component) => kind === 'hz'
    ? observation.effectivePrecision.sigmaHzArcSec
    : kind === 'vz' ? observation.effectivePrecision.sigmaVzArcSec : observation.effectivePrecision.sigmaSdMm;
  const sigmaUnitOf = (kind: Component) => (kind === 'sd' ? 'mm' : '″');
  const sigmaKeyOf = (kind: Component) => kind === 'hz'
    ? 'sigmaHzArcSec' as const
    : kind === 'vz' ? 'sigmaVzArcSec' as const : 'sigmaSdMm' as const;

  return (
    <Stack spacing={1.25} sx={{ p: 1.5 }} data-testid="analysis-inspector">
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={800} fontFamily="monospace" noWrap>
            {observation.stationEngineName} → {observation.targetEngineName}
          </Typography>
          <Typography variant="caption" color="text.secondary">{t('analysis.selection.sight')}</Typography>
        </Box>
        <StatusChip status={observation.pointRole} />
      </Stack>

      {observation.sharedPhysicalPoint && (
        <Chip size="small" color="secondary" variant="outlined" label={t('analysis.inspector.identity')} />
      )}

      <Divider />
      <Stack spacing={1.25}>
        {COMPONENTS.map((kind) => {
          const scalarId = `${observation.observationId}:${kind}`;
          const residual = residualsByScalarId.get(scalarId);
          const isUsed = !excluded.has(scalarId) && !observation.excludedComponents.includes(kind);
          return (
            <Box key={kind} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}>
                <Typography variant="body2" fontWeight={700}>{componentLabel[kind]}</Typography>
                <Tooltip title={observation.protected ? t('analysis.observations.protected') : ''}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        size="small"
                        checked={isUsed}
                        disabled={observation.protected}
                        onChange={() => onToggleComponent(scalarId)}
                        inputProps={{
                          'aria-label': `${t('analysis.inspector.include')} ${componentLabel[kind]} ${observation.stationEngineName} ${observation.targetEngineName}`,
                        }}
                      />
                    }
                    label={<Typography variant="caption">{t('analysis.inspector.include')}</Typography>}
                    sx={{ mr: 0 }}
                  />
                </Tooltip>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.5, mt: 0.5 }}>
                <Row label={t('analysis.observations.value')}>
                  <Mono>{valueOf(kind).toFixed(kind === 'sd' ? 4 : 6)} {unitOf(kind)}</Mono>
                </Row>
                <Row label={t('analysis.observations.sigma')}>
                  <TextField
                    size="small"
                    type="number"
                    value={Number.isFinite(sigmaOf(kind)) ? sigmaOf(kind) : ''}
                    onChange={(event) => patch({ [sigmaKeyOf(kind)]: Number(event.target.value) })}
                    inputProps={{ min: 0.0001, step: kind === 'sd' ? 0.1 : 0.05, 'aria-label': `${t('analysis.observations.sigma')} ${componentLabel[kind]}` }}
                    sx={{ width: 110 }}
                    helperText={sigmaUnitOf(kind)}
                  />
                </Row>
                {residual && (
                  <>
                    <Row label={t('analysis.inspector.residual')}>
                      <Mono>
                        {kind === 'sd'
                          ? `${(residual.residual * 1000).toFixed(2)} mm`
                          : `${(residual.residual * (180 / Math.PI) * 3600).toFixed(2)}″`}
                      </Mono>
                    </Row>
                    <Row label={t('analysis.inspector.standardised')}>
                      <Chip
                        size="small"
                        color={Math.abs(residual.stdResidual) > 3 ? 'error' : Math.abs(residual.stdResidual) > 2 ? 'warning' : 'default'}
                        variant="outlined"
                        label={residual.stdResidual.toFixed(2)}
                      />
                    </Row>
                    <Row label={t('analysis.inspector.redundancy')}>
                      <Mono>{Number.isFinite(residual.redundancy) ? residual.redundancy.toFixed(2) : '—'}</Mono>
                    </Row>
                  </>
                )}
              </Box>
            </Box>
          );
        })}
      </Stack>

      <Divider />
      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          variant="outlined"
          clickable
          label={observation.stationEngineName}
          onClick={() => onSelect({ kind: 'point', engineName: observation.stationEngineName })}
        />
        <Chip
          size="small"
          variant="outlined"
          clickable
          label={observation.targetEngineName}
          onClick={() => onSelect({ kind: 'point', engineName: observation.targetEngineName })}
        />
      </Stack>
      <Button size="small" variant="outlined" onClick={() => onSelect(undefined)}>
        {t('analysis.selection.clear')}
      </Button>
    </Stack>
  );
}
