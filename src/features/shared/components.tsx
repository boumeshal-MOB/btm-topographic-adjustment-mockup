import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  ButtonGroup,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { ChiSquareStatus } from '@/domain/entities';
import type { AdjustmentDiagnostic, DiagnosticPoint } from '@/domain/engine/run-input';
import { fixed, millimetres } from '@/features/shared/format';
import {
  updateNetworkSelections,
  type NetworkSelection,
  type NetworkSelectionMode,
} from '@/features/shared/network-selection';
import {
  groupResidualsByTarget,
  residualDisplayValue,
  smartLabelNames,
  sortDiagnosticPoints,
  type ResidualKindFilter,
} from '@/features/shared/diagnostic-view-model';

/** Colour + text, never colour alone (PRODUIT-ET-PARCOURS.md). */
export function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  const palette: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
    success: 'success',
    ready: 'success',
    passed: 'success',
    active: 'success',
    fresh: 'success',
    connected: 'success',
    provisional: 'warning',
    warning: 'warning',
    reused: 'warning',
    weak: 'warning',
    'to-review': 'warning',
    draft: 'default',
    'not-applicable': 'warning',
    'failed-qc': 'error',
    failed_qc: 'error',
    failed: 'error',
    blocking: 'error',
    missing: 'error',
    'not-connected': 'error',
    'technical-error': 'error',
    technical_error: 'error',
    running: 'info',
    archived: 'default',
    disabled: 'default',
    station: 'info',
    reference: 'success',
    monitoring: 'default',
    auxiliary: 'warning',
  };
  // Roles and lifecycle states share one chip, so the catalogue is picked by what the value is.
  // `defaultValue` keeps an unknown state visible as itself rather than as a missing-key marker.
  const key = ['station', 'reference', 'monitoring', 'auxiliary', 'shared'].includes(status)
    ? `enums.role.${status}`
    : `enums.status.${status}`;
  return (
    <Chip
      size="small"
      label={t(key, { defaultValue: status })}
      color={palette[status] ?? 'default'}
      variant="outlined"
    />
  );
}

/** Numeric field with an explicit unit in the label (units always visible, PRODUIT-ET-PARCOURS.md). */
export function UnitField(props: {
  label: string;
  unit: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
  width?: number;
}) {
  return (
    <TextField
      size="small"
      type="number"
      label={props.unit ? `${props.label} (${props.unit})` : props.label}
      value={Number.isFinite(props.value) ? props.value : ''}
      onChange={(event) => props.onChange(Number(event.target.value))}
      inputProps={{ step: props.step ?? 0.001 }}
      disabled={props.disabled}
      sx={{ width: props.width ?? 170 }}
    />
  );
}

export function AdvancedSection({
  title = 'Advanced options',
  children,
  defaultExpanded = false,
}: {
  title?: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow: 'hidden',
        '&:before': { display: 'none' },
        '&.Mui-expanded': { m: 0 },
      }}
    >
      <AccordionSummary
        expandIcon={<span aria-hidden>▾</span>}
        sx={{ minHeight: 46, '& .MuiAccordionSummary-content': { my: 1 } }}
      >
        <Typography variant="body2" fontWeight={700}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>{children}</AccordionDetails>
    </Accordion>
  );
}

export function ChiSquareBadge({ status }: { status?: ChiSquareStatus }) {
  const { t } = useTranslation();
  if (!status) return <Chip size="small" label="χ² —" variant="outlined" />;
  const label = status === 'not-applicable'
    ? t('quality.chiSquare.notApplicable')
    : status === 'passed'
      ? t('quality.chiSquare.passed')
      : t('quality.chiSquare.failed');
  return (
    <Chip
      size="small"
      color={status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'warning'}
      label={label}
    />
  );
}

const VIEW_WIDTH = 960;
/**
 * Role palette. Shape is the primary signal — square/diamond/circle — so the map stays readable
 * without colour; the hues only reinforce it. The hues deliberately use unambiguous surveying
 * colours: blue station, green control, charcoal monitoring and orange auxiliary.
 */
const ROLE_COLOURS: Record<DiagnosticPoint['role'], string> = {
  station: '#0067C5',
  reference: '#009B55',
  monitoring: '#202938',
  auxiliary: '#E66A00',
};

/** Reserved for one physical point observed under several names. Never used for a role. */
const SHARED_POINT_COLOUR = '#C026D3';

/** Confidence ellipses sit behind everything, as a neutral cloud rather than an outline. */
const ELLIPSE_FILL = 'rgba(100, 116, 139, 0.28)';

function roleColour(role: DiagnosticPoint['role']): string {
  return ROLE_COLOURS[role] ?? '#52606d';
}

function pointRoleLabel(point: DiagnosticPoint): string {
  if (point.singleRay && point.role !== 'station') return `${point.role} · uncontrolled (1 ray)`;
  return point.role;
}

/** Interactive SVG network explorer with smart labels, filtering, zoom, pan and point inspection. */
export interface NetworkViewInitialPoint {
  engineName: string;
  eastingM: number;
  northingM: number;
  heightM: number;
}

export interface NetworkDeltaThresholds {
  warningMm: number;
  criticalMm: number;
}

/**
 * The optional initial geometry adds displacement halos without replacing the role symbology:
 * fill/shape still means station/reference/monitoring, halo colour means coordinate change.
 *
 * Selection is controlled when `onSelectionChange` is supplied and self-managed otherwise, so the
 * read-only run/processing screens keep working untouched while the lab drives it from outside.
 */
export function NetworkView({
  diagnostic,
  height = 480,
  initialPoints = [],
  sharedPointNames = [],
  sightLines = [],
  deltaThresholds = { warningMm: 2, criticalMm: 3 },
  onDeltaThresholdsChange,
  selection,
  selections,
  onSelectionChange,
  showInspector = true,
}: {
  diagnostic: AdjustmentDiagnostic;
  height?: number;
  initialPoints?: NetworkViewInitialPoint[];
  sharedPointNames?: string[];
  /** Complete observation geometry. Residuals alone cannot preserve a line after exclusion. */
  sightLines?: Array<{ stationEngineName: string; targetEngineName: string }>;
  deltaThresholds?: NetworkDeltaThresholds;
  onDeltaThresholdsChange?: (value: NetworkDeltaThresholds) => void;
  selection?: NetworkSelection;
  selections?: NetworkSelection[];
  onSelectionChange?: (selection: NetworkSelection | undefined, mode?: NetworkSelectionMode) => void;
  /** Hidden when the host renders a richer inspector for the same selection. */
  showInspector?: boolean;
}) {
  const { t } = useTranslation();
  const [ownSelections, setOwnSelections] = useState<NetworkSelection[]>([]);
  const activeSelections = onSelectionChange
    ? selections ?? (selection ? [selection] : [])
    : ownSelections;
  const activeSelection = activeSelections.at(-1);
  const setSelection = (next: NetworkSelection | undefined, mode: NetworkSelectionMode = 'replace') => {
    if (onSelectionChange) onSelectionChange(next, mode);
    else setOwnSelections((current) => updateNetworkSelections(current, next, mode));
  };
  const selectFromEvent = (next: NetworkSelection, ctrlKey: boolean) =>
    setSelection(next, ctrlKey ? 'toggle' : 'replace');
  const selectedName = activeSelection?.kind === 'point' ? activeSelection.engineName : undefined;
  const selectedPointNames = new Set(activeSelections
    .filter((candidate): candidate is Extract<NetworkSelection, { kind: 'point' }> => candidate.kind === 'point')
    .map((candidate) => candidate.engineName));
  const selectedSightKeys = new Set(activeSelections
    .filter((candidate): candidate is Extract<NetworkSelection, { kind: 'sight' }> => candidate.kind === 'sight')
    .map((candidate) => `${candidate.stationEngineName}|${candidate.targetEngineName}`));
  const [hoveredName, setHoveredName] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [labelMode, setLabelMode] = useState<'smart' | 'all' | 'none'>('smart');
  const [activeRole, setActiveRole] = useState<'all' | DiagnosticPoint['role']>('all');
  const [ellipseScaleMode, setEllipseScaleMode] = useState<'auto' | '1' | '10' | '100' | '1000'>('auto');
  const [expanded, setExpanded] = useState(false);
  const [showEllipses, setShowEllipses] = useState(true);
  const [showAlertColours, setShowAlertColours] = useState(true);
  const [cursor, setCursor] = useState<{ eastingM: number; northingM: number }>();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number }>();

  const points = diagnostic.points;
  if (points.length === 0) return <Alert severity="info">{t('analysis.networkView.noPoints')}</Alert>;

  const mapHeight = expanded ? Math.max(height, 650) : height;
  const xs = points.map((point) => point.eastingM);
  const ys = points.map((point) => point.northingM);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const span = Math.max(spanX, spanY, 1);
  const pad = span * 0.1;
  const usableWidth = VIEW_WIDTH - 64;
  const usableHeight = mapHeight - 64;
  const scale = Math.min(usableWidth / (spanX + 2 * pad), usableHeight / (spanY + 2 * pad));
  const contentWidth = (spanX + 2 * pad) * scale;
  const contentHeight = (spanY + 2 * pad) * scale;
  const offsetX = (VIEW_WIDTH - contentWidth) / 2;
  const offsetY = (mapHeight - contentHeight) / 2;
  const px = (easting: number) => offsetX + (easting - minX + pad) * scale;
  const py = (northing: number) => mapHeight - offsetY - (northing - minY + pad) * scale;
  const stations = points.filter((point) => point.role === 'station');
  const initialByName = new Map(initialPoints.map((point) => [point.engineName, point]));
  const sharedNames = new Set(sharedPointNames);
  const deltaByName = new Map(points.map((point) => {
    const initial = initialByName.get(point.engineName);
    const delta = initial
      ? {
          eMm: (point.eastingM - initial.eastingM) * 1000,
          nMm: (point.northingM - initial.northingM) * 1000,
          hMm: (point.heightM - initial.heightM) * 1000,
        }
      : undefined;
    return [point.engineName, delta ? { ...delta, magnitudeMm: Math.hypot(delta.eMm, delta.nMm, delta.hMm) } : undefined] as const;
  }));
  const displacementColour = (magnitudeMm?: number) => {
    if (!showAlertColours || magnitudeMm === undefined) return '#94a3b8';
    if (magnitudeMm >= deltaThresholds.criticalMm) return '#D32F2F';
    if (magnitudeMm >= deltaThresholds.warningMm) return '#F59E0B';
    return '#009B55';
  };
  const rays = new Set([
    ...sightLines.map((sight) => `${sight.stationEngineName}|${sight.targetEngineName}`),
    ...diagnostic.residuals
      .filter((residual) => residual.kind !== 'constraint')
      .map((residual) => `${residual.stationEngineName}|${residual.targetEngineName}`),
  ]);
  const selected = points.find((point) => point.engineName === selectedName);
  const maxEllipse = Math.max(1e-9, ...points.map((point) => point.ellipseSemiMajorM));
  // Size the largest ellipse to a legible radius rather than to a fraction of the network:
  // the previous span-based rule produced 3-4 px shapes that the point symbols hid entirely.
  const LARGEST_ELLIPSE_PX = 34;
  const autoEllipseScale = LARGEST_ELLIPSE_PX / Math.max(1e-9, maxEllipse * scale);
  const ellipseScale = ellipseScaleMode === 'auto' ? autoEllipseScale : Number(ellipseScaleMode);
  const labels = smartLabelNames(points, { zoom, selectedName, hoveredName, mode: labelMode });
  // A selected point must stay identifiable even when labels are globally hidden. Multi-selected
  // points follow the same rule so Ctrl+click never leaves an anonymous symbol on the plan.
  for (const name of selectedPointNames) labels.add(name);
  const clampZoom = (value: number) => Math.max(0.55, Math.min(6, value));
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const cycleLabels = () => setLabelMode((current) => current === 'smart' ? 'all' : current === 'all' ? 'none' : 'smart');
  const activePoints = activeRole === 'all' ? points.length : points.filter((point) => point.role === activeRole).length;

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }} data-testid="diagnostic-network-view">
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'center' }}
        gap={1}
        sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>{t('analysis.networkView.title')}</Typography>
          <Typography variant="caption" color="text.secondary">
            {t('analysis.networkView.help')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap justifyContent={{ lg: 'flex-end' }}>
          <ButtonGroup size="small" variant="outlined" aria-label={t('analysis.networkView.zoomControls')}>
            <Button
              onClick={() => setZoom((value) => clampZoom(value / 1.25))}
              aria-label={t('analysis.networkView.zoomOut')}
              sx={{ minWidth: 34 }}
            >−</Button>
            <Button disabled sx={{ minWidth: 58, '&.Mui-disabled': { color: 'text.primary' } }}>
              {Math.round(zoom * 100)}%
            </Button>
            <Button
              onClick={() => setZoom((value) => clampZoom(value * 1.25))}
              aria-label={t('analysis.networkView.zoomIn')}
              sx={{ minWidth: 34 }}
            >+</Button>
          </ButtonGroup>
          <Button size="small" variant="outlined" onClick={resetView}>{t('analysis.networkView.fit')}</Button>
          <Button size="small" variant="outlined" onClick={() => setExpanded((value) => !value)}>
            {expanded ? t('analysis.networkView.compact') : t('analysis.networkView.expand')}
          </Button>
        </Stack>
      </Stack>

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
        gap={0.75}
        sx={{ px: 1.25, py: 0.75, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}
      >
        <Stack direction="row" spacing={0.6} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={cycleLabels} data-testid="toggle-map-labels">
            {t('analysis.networkView.labels', { mode: t(`analysis.networkView.labelMode.${labelMode}`) })}
          </Button>
          <Button
            size="small"
            variant={showEllipses ? 'contained' : 'outlined'}
            onClick={() => setShowEllipses((value) => !value)}
            data-testid="toggle-ellipses"
          >
            {t('analysis.networkView.toggleEllipses')}
          </Button>
          <Button
            size="small"
            variant={showAlertColours ? 'contained' : 'outlined'}
            onClick={() => setShowAlertColours((value) => !value)}
            data-testid="toggle-alert-colours"
          >
            {t('analysis.networkView.toggleAlertColours')}
          </Button>
          <FormControl size="small" sx={{ minWidth: 118 }} disabled={!showEllipses}>
            <InputLabel id="ellipse-scale">{t('analysis.networkView.ellipses')}</InputLabel>
            <Select
              labelId="ellipse-scale"
              label={t('analysis.networkView.ellipses')}
              value={ellipseScaleMode}
              onChange={(event) => setEllipseScaleMode(event.target.value as typeof ellipseScaleMode)}
            >
              <MenuItem value="auto">{t('analysis.networkView.autoScale', { value: Math.round(autoEllipseScale) })}</MenuItem>
              <MenuItem value="1">{t('analysis.networkView.trueScale')}</MenuItem>
              <MenuItem value="10">×10</MenuItem>
              <MenuItem value="100">×100</MenuItem>
              <MenuItem value="1000">×1000</MenuItem>
            </Select>
          </FormControl>
        </Stack>
        {onDeltaThresholdsChange && (
          <Stack direction="row" spacing={0.6} alignItems="center" data-testid="delta-threshold-controls">
            <TextField
              size="small"
              type="number"
              label={t('analysis.map.deltaWarning')}
              value={deltaThresholds.warningMm}
              onChange={(event) => {
                const warningMm = Math.max(0, Number(event.target.value));
                onDeltaThresholdsChange({
                  warningMm,
                  criticalMm: Math.max(warningMm, deltaThresholds.criticalMm),
                });
              }}
              inputProps={{ min: 0, step: 0.1 }}
              sx={{ width: 124 }}
            />
            <TextField
              size="small"
              type="number"
              label={t('analysis.map.deltaCritical')}
              value={deltaThresholds.criticalMm}
              onChange={(event) => onDeltaThresholdsChange({
                ...deltaThresholds,
                criticalMm: Math.max(deltaThresholds.warningMm, Number(event.target.value)),
              })}
              inputProps={{ min: deltaThresholds.warningMm, step: 0.1 }}
              sx={{ width: 124 }}
            />
          </Stack>
        )}
      </Stack>

      <Stack direction={{ xs: 'column', lg: 'row' }} sx={{ minHeight: mapHeight }}>
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative', bgcolor: '#ffffff' }}>
          <Paper
            variant="outlined"
            role="group"
            aria-label={t('analysis.networkView.roleFilters')}
            sx={{
              position: 'absolute',
              zIndex: 2,
              top: 10,
              right: 10,
              maxWidth: 'calc(100% - 20px)',
              p: 0.6,
              borderRadius: 1.5,
              bgcolor: 'rgba(255,255,255,.94)',
              boxShadow: '0 2px 8px rgba(15,23,42,.10)',
            }}
          >
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap justifyContent="flex-end">
              {(['all', 'station', 'reference', 'monitoring', 'auxiliary'] as const).map((role) => {
                const count = role === 'all' ? points.length : points.filter((point) => point.role === role).length;
                if (role !== 'all' && count === 0) return null;
                const colour = role === 'all' ? '#334155' : roleColour(role);
                const active = activeRole === role;
                return (
                  <Chip
                    key={role}
                    size="small"
                    label={`${role === 'all' ? t('analysis.networkView.allPoints') : t(`enums.role.${role}`, { defaultValue: role })} · ${count}`}
                    variant={active ? 'filled' : 'outlined'}
                    onClick={() => setActiveRole(role)}
                    data-testid={`role-filter-${role}`}
                    aria-pressed={active}
                    sx={{
                      fontWeight: active ? 800 : 600,
                      color: active ? '#fff' : colour,
                      bgcolor: active ? colour : 'rgba(255,255,255,.92)',
                      borderColor: colour,
                      '&:hover': {
                        color: active ? '#fff' : colour,
                        bgcolor: active ? colour : `${colour}14`,
                      },
                    }}
                  />
                );
              })}
            </Stack>
          </Paper>
          <svg
            ref={svgRef}
            width="100%"
            height={mapHeight}
            viewBox={`0 0 ${VIEW_WIDTH} ${mapHeight}`}
            role="img"
            aria-label={t('analysis.networkView.mapAria')}
            onMouseLeave={() => setCursor(undefined)}
            style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((value) => clampZoom(value * (event.deltaY < 0 ? 1.12 : 0.89)));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
            }}
            onPointerMove={(event) => {
              const box = svgRef.current?.getBoundingClientRect();
              if (box && box.width > 0) {
                // client → viewBox → un-pan/un-zoom → ground coordinates
                const vx = ((event.clientX - box.left) / box.width) * VIEW_WIDTH;
                const vy = ((event.clientY - box.top) / box.height) * mapHeight;
                const cx = (vx - pan.x) / zoom;
                const cy = (vy - pan.y) / zoom;
                setCursor({
                  eastingM: (cx - offsetX) / scale + minX - pad,
                  northingM: (mapHeight - offsetY - cy) / scale + minY - pad,
                });
              }
              const drag = dragRef.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
            }}
            onPointerCancel={() => { dragRef.current = undefined; }}
            onDoubleClick={resetView}
          >
            <rect width={VIEW_WIDTH} height={mapHeight} fill="#ffffff" />
            {/* Frame reference, drawn outside the pan/zoom group so it stays put. */}
            <g transform={`translate(46 ${mapHeight - 46})`} pointerEvents="none" aria-hidden>
              <defs>
                <marker id="axis-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
                </marker>
              </defs>
              <line x1={0} y1={0} x2={0} y2={-34} stroke="#334155" strokeWidth={1.5} markerEnd="url(#axis-arrow)" />
              <line x1={0} y1={0} x2={34} y2={0} stroke="#334155" strokeWidth={1.5} markerEnd="url(#axis-arrow)" />
              <text x={-4} y={-40} fontSize={11} fontWeight={700} fill="#334155" textAnchor="middle">N (Y)</text>
              <text x={44} y={4} fontSize={11} fontWeight={700} fill="#334155">E (X)</text>
            </g>
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {/* Ellipses form their own layer under the sight lines and the symbols: drawn with
                  the points they hid the very marks they describe. */}
              {showEllipses && points.map((point) => {
                const faded = activeRole !== 'all' && point.role !== activeRole;
                if (faded) return null;
                return (
                  <ellipse
                    key={`ellipse-${point.engineName}`}
                    cx={px(point.eastingM)}
                    cy={py(point.northingM)}
                    rx={Math.max(2.5 / zoom, point.ellipseSemiMajorM * ellipseScale * scale)}
                    ry={Math.max(2 / zoom, point.ellipseSemiMinorM * ellipseScale * scale)}
                    transform={`rotate(${90 - point.ellipseOrientationDeg} ${px(point.eastingM)} ${py(point.northingM)})`}
                    fill={ELLIPSE_FILL}
                    stroke="none"
                    pointerEvents="none"
                  />
                );
              })}
              {stations.flatMap((station) =>
                points
                  .filter((point) => point.role !== 'station' && rays.has(`${station.engineName}|${point.engineName}`))
                  .map((point) => {
                    const faded = activeRole !== 'all' && station.role !== activeRole && point.role !== activeRole;
                    const sightKey = `${station.engineName}|${point.engineName}`;
                    const isSelectedSight = selectedSightKeys.has(sightKey);
                    const highlighted = isSelectedSight
                      || selectedPointNames.has(station.engineName)
                      || selectedPointNames.has(point.engineName);
                    const sight: NetworkSelection = {
                      kind: 'sight',
                      stationEngineName: station.engineName,
                      targetEngineName: point.engineName,
                    };
                    const geometry = {
                      x1: px(station.eastingM),
                      y1: py(station.northingM),
                      x2: px(point.eastingM),
                      y2: py(point.northingM),
                    };
                    return (
                      <g key={`${station.engineName}-${point.engineName}`}>
                        <line
                          {...geometry}
                          data-testid={`network-ray-${station.engineName}-${point.engineName}`}
                          stroke={isSelectedSight ? '#5B3FD0' : highlighted ? roleColour(point.role) : '#94A3B8'}
                          strokeWidth={isSelectedSight ? 3.2 : highlighted ? 2.2 : 1}
                          // A role filter may de-emphasise a sight, but never erase the network
                          // geometry. Keeping a visible floor also avoids rays appearing to vanish
                          // after selection/filter transitions.
                          strokeOpacity={faded ? 0.24 : highlighted ? 0.96 : 0.58}
                          vectorEffect="non-scaling-stroke"
                        />
                        {/* Invisible, generously wide hit area: a 1 px ray is unclickable in practice. */}
                        <line
                          {...geometry}
                          stroke="transparent"
                          strokeWidth={12 / zoom}
                          style={{ cursor: 'pointer' }}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => selectFromEvent(sight, event.ctrlKey)}
                          role="button"
                          tabIndex={0}
                          aria-label={t('analysis.networkView.inspectSightAria', { station: station.engineName, target: point.engineName })}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectFromEvent(sight, event.ctrlKey);
                            }
                          }}
                        />
                      </g>
                    );
                  }),
              )}
              {points.map((point) => {
                const isSelected = selectedPointNames.has(point.engineName);
                const isPrimary = selectedName === point.engineName;
                const isHovered = hoveredName === point.engineName;
                const faded = activeRole !== 'all' && point.role !== activeRole;
                const x = px(point.eastingM);
                const y = py(point.northingM);
                const pointRadius = (point.role === 'station' ? 7 : point.role === 'reference' ? 5.5 : 4.5) / zoom;
                const delta = deltaByName.get(point.engineName);
                const shared = sharedNames.has(point.engineName);
                // Only an exceeded threshold recolours the point; within tolerance it keeps its
                // role colour, so the map does not turn into a traffic light.
                const overThreshold = showAlertColours
                  && delta !== undefined
                  && delta.magnitudeMm >= deltaThresholds.warningMm;
                const symbolFill = overThreshold
                  ? displacementColour(delta.magnitudeMm)
                  : roleColour(point.role);
                const symbolStroke = shared ? SHARED_POINT_COLOUR : symbolFill;
                const strokeWidth = shared ? 2.4 : isSelected ? 2.2 : 1;
                const symbolRadius = pointRadius * (isPrimary ? 1.55 : isSelected ? 1.35 : isHovered ? 1.25 : 1);
                return (
                  <Tooltip
                    key={point.engineName}
                    title={`${point.engineName} · E ${fixed(point.eastingM, 4)} · N ${fixed(point.northingM, 4)} · H ${fixed(point.heightM, 4)}${delta ? ` · Δ3D ${fixed(delta.magnitudeMm, 2)} mm` : ''}`}
                  >
                    <g
                      transform={`translate(${x}, ${y})`}
                      opacity={faded ? 0.12 : 1}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseEnter={() => setHoveredName(point.engineName)}
                      onMouseLeave={() => setHoveredName(undefined)}
                      onClick={(event) => selectFromEvent({ kind: 'point', engineName: point.engineName }, event.ctrlKey)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          selectFromEvent({ kind: 'point', engineName: point.engineName }, event.ctrlKey);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={t('analysis.networkView.inspectAria', { point: point.engineName })}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      {/* No rings around a point: the symbol itself carries everything. Its fill
                          is the role colour, or the alert colour once a displacement threshold is
                          exceeded; its outline is magenta only for a shared physical point, and
                          otherwise matches the fill. Selection is shown by growing the symbol. */}
                      {point.role === 'station' ? (
                        <rect
                          x={-symbolRadius}
                          y={-symbolRadius}
                          width={symbolRadius * 2}
                          height={symbolRadius * 2}
                          rx={1.5 / zoom}
                          fill={symbolFill}
                          stroke={symbolStroke}
                          strokeWidth={strokeWidth}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : point.role === 'reference' ? (
                        <path
                          d={`M 0 ${-symbolRadius} L ${symbolRadius} 0 L 0 ${symbolRadius} L ${-symbolRadius} 0 Z`}
                          fill={symbolFill}
                          stroke={symbolStroke}
                          strokeWidth={strokeWidth}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : (
                        <circle
                          r={symbolRadius}
                          fill={symbolFill}
                          stroke={symbolStroke}
                          strokeWidth={strokeWidth}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {labels.has(point.engineName) && (
                        <g transform={`translate(${8 / zoom}, ${-8 / zoom})`}>
                          <rect
                            x={-2 / zoom}
                            y={-11 / zoom}
                            width={(point.engineName.length * 6.5 + (point.singleRay ? 32 : 4) + (sharedNames.has(point.engineName) ? 38 : 0)) / zoom}
                            height={16 / zoom}
                            rx={3 / zoom}
                            fill="rgba(255,255,255,.88)"
                            stroke={isSelected ? roleColour(point.role) : 'rgba(148,163,184,.55)'}
                            strokeWidth={isSelected ? 1.5 : 0.7}
                            vectorEffect="non-scaling-stroke"
                          />
                          <text
                            fontSize={10.5 / zoom}
                            fill="#172033"
                            fontWeight={isSelected ? 700 : 500}
                            data-testid={`network-label-${point.engineName}`}
                          >
                            {point.engineName}{sharedNames.has(point.engineName) ? ` · ${t('enums.role.shared')}` : ''}{point.singleRay && point.role !== 'station' ? ` · ${t('analysis.networkView.oneRayShort')}` : ''}
                          </text>
                        </g>
                      )}
                    </g>
                  </Tooltip>
                );
              })}
            </g>
          </svg>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ px: 1.25, py: 0.75, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}
          >
            {cursor && (
              <Chip
                size="small"
                variant="outlined"
                data-testid="cursor-coordinates"
                label={`E ${fixed(cursor.eastingM, 3)} · N ${fixed(cursor.northingM, 3)} m`}
                sx={{ bgcolor: 'background.paper', fontFamily: 'monospace' }}
              />
            )}
            {showEllipses && (
              <Chip size="small" variant="outlined" label={t('analysis.networkView.ellipseScale', { value: Math.round(ellipseScale) })} sx={{ bgcolor: 'background.paper' }} />
            )}
            <Chip size="small" variant="outlined" label={t('analysis.networkView.visible', { count: activePoints })} sx={{ bgcolor: 'background.paper' }} />
            {activeSelections.length > 1 && (
              <Chip
                size="small"
                color="info"
                label={t('analysis.selection.selectedCount', { count: activeSelections.length })}
              />
            )}
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              alignItems="center"
              data-testid="network-role-legend"
              sx={{ px: 0.5 }}
            >
              <Typography variant="caption" color="text.secondary">
                <Box component="span" data-testid="legend-station-symbol" sx={{ color: ROLE_COLOURS.station, fontWeight: 900 }}>■</Box>{' '}
                {t('analysis.networkView.legendStation')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <Box component="span" data-testid="legend-reference-symbol" sx={{ color: ROLE_COLOURS.reference, fontWeight: 900 }}>◆</Box>{' '}
                {t('analysis.networkView.legendReference')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <Box component="span" data-testid="legend-monitoring-symbol" sx={{ color: ROLE_COLOURS.monitoring, fontWeight: 900 }}>●</Box>
                <Box component="span" data-testid="legend-auxiliary-symbol" sx={{ color: ROLE_COLOURS.auxiliary, fontWeight: 900 }}>●</Box>{' '}
                {t('analysis.networkView.legendMonitoring')}
              </Typography>
              <Stack component="span" direction="row" spacing={0.4} alignItems="center">
                <Box component="span" data-testid="legend-shared-symbol" sx={{ width: 10, height: 10, border: '2px solid', borderColor: SHARED_POINT_COLOUR, borderRadius: '50%' }} />
                <Typography component="span" variant="caption" color="text.secondary">
                  {t('analysis.networkView.legendShared')}
                </Typography>
              </Stack>
            </Stack>
            {initialPoints.length > 0 && showAlertColours && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 0.5 }}>
                {t('analysis.networkView.deltaLegend', {
                  warning: deltaThresholds.warningMm,
                  critical: deltaThresholds.criticalMm,
                })}
              </Typography>
            )}
          </Stack>
        </Box>

        {showInspector && (
        <Box
          sx={{
            width: { xs: '100%', lg: 310 },
            borderLeft: { lg: '1px solid' },
            borderTop: { xs: '1px solid', lg: 'none' },
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 1.5,
          }}
        >
          {selected ? (
            <Stack spacing={1.25} data-testid="diagnostic-point-inspector">
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight={800} noWrap>{selected.engineName}</Typography>
                  <Typography variant="caption" color="text.secondary">{pointRoleLabel(selected)}</Typography>
                </Box>
                <StatusChip status={selected.singleRay ? 'weak' : selected.role} />
              </Stack>
              <Divider />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">Easting</Typography>
                <Typography variant="body2" fontFamily="monospace">{fixed(selected.eastingM, 4)} m</Typography>
                <Typography variant="caption" color="text.secondary">Northing</Typography>
                <Typography variant="body2" fontFamily="monospace">{fixed(selected.northingM, 4)} m</Typography>
                <Typography variant="caption" color="text.secondary">Height</Typography>
                <Typography variant="body2" fontFamily="monospace">{fixed(selected.heightM, 4)} m</Typography>
              </Box>
              <Divider />
              <Typography variant="overline" color="text.secondary">Uncertainty</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">σ E / N / H</Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {millimetres(selected.sigmaEM)} / {millimetres(selected.sigmaNM)} / {millimetres(selected.sigmaHM)} mm
                </Typography>
                <Typography variant="caption" color="text.secondary">Ellipse a / b</Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {millimetres(selected.ellipseSemiMajorM)} / {millimetres(selected.ellipseSemiMinorM)} mm
                </Typography>
                <Typography variant="caption" color="text.secondary">Orientation</Typography>
                <Typography variant="body2" fontFamily="monospace">{fixed(selected.ellipseOrientationDeg, 2)}°</Typography>
                <Typography variant="caption" color="text.secondary">Observations</Typography>
                <Typography variant="body2" fontFamily="monospace">{selected.observationCount}</Typography>
              </Box>
              {deltaByName.get(selected.engineName) && (
                <>
                  <Divider />
                  <Typography variant="overline" color="text.secondary">Change from initial coordinates</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                    <Typography variant="caption" color="text.secondary">Δ E / N / H</Typography>
                    <Typography variant="body2" fontFamily="monospace">
                      {fixed(deltaByName.get(selected.engineName)?.eMm, 2)} / {fixed(deltaByName.get(selected.engineName)?.nMm, 2)} / {fixed(deltaByName.get(selected.engineName)?.hMm, 2)} mm
                    </Typography>
                    <Typography variant="caption" color="text.secondary">Δ 3D</Typography>
                    <Chip
                      size="small"
                      label={`${fixed(deltaByName.get(selected.engineName)?.magnitudeMm, 2)} mm`}
                      sx={{ color: displacementColour(deltaByName.get(selected.engineName)!.magnitudeMm), fontWeight: 800 }}
                    />
                  </Box>
                </>
              )}
              {selected.singleRay && (
                <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }}>
                  This point is controlled by one ray only. Its geometry is weak even when the solver converges.
                </Alert>
              )}
              <Button size="small" variant="outlined" onClick={() => setSelection(undefined)}>Clear selection</Button>
            </Stack>
          ) : (
            <Stack spacing={1.25} justifyContent="center" sx={{ height: '100%', minHeight: 180 }}>
              <Typography variant="subtitle2">Point inspector</Typography>
              <Typography variant="body2" color="text.secondary">
                Select a point on the network to display its adjusted coordinates, component sigmas, confidence ellipse and observation count.
              </Typography>
              <Divider />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">Stations</Typography>
                <Typography variant="body2">{points.filter((point) => point.role === 'station').length}</Typography>
                <Typography variant="caption" color="text.secondary">References</Typography>
                <Typography variant="body2">{points.filter((point) => point.role === 'reference').length}</Typography>
                <Typography variant="caption" color="text.secondary">Monitoring</Typography>
                <Typography variant="body2">{points.filter((point) => point.role === 'monitoring').length}</Typography>
                <Typography variant="caption" color="text.secondary">1-ray points</Typography>
                <Typography variant="body2">{points.filter((point) => point.singleRay).length}</Typography>
              </Box>
            </Stack>
          )}
        </Box>
        )}
      </Stack>
    </Paper>
  );
}

function PointResultsTable({ diagnostic }: { diagnostic: AdjustmentDiagnostic }) {
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | DiagnosticPoint['role']>('all');
  const points = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return sortDiagnosticPoints(diagnostic.points).filter((point) => {
      if (role !== 'all' && point.role !== role) return false;
      return !needle || point.engineName.toLowerCase().includes(needle) || point.role.includes(needle);
    });
  }, [diagnostic.points, role, search]);
  const grouped = points.reduce<Array<{ role: DiagnosticPoint['role']; rows: DiagnosticPoint[] }>>((groups, point) => {
    const current = groups.at(-1);
    if (current?.role === point.role) current.rows.push(point);
    else groups.push({ role: point.role, rows: [point] });
    return groups;
  }, []);

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Find a point"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 230 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="point-role-filter">Role</InputLabel>
          <Select labelId="point-role-filter" label="Role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <MenuItem value="all">All roles</MenuItem>
            <MenuItem value="station">Stations</MenuItem>
            <MenuItem value="reference">References</MenuItem>
            <MenuItem value="monitoring">Monitoring</MenuItem>
            <MenuItem value="auxiliary">Auxiliary</MenuItem>
          </Select>
        </FormControl>
        <Chip size="small" variant="outlined" label={`${points.length}/${diagnostic.points.length} points`} />
        <Chip size="small" variant="outlined" color="warning" label={`${diagnostic.points.filter((point) => point.singleRay).length} one-ray`} />
      </Stack>
      <Box sx={{ overflow: 'auto', maxHeight: 430, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader aria-label="Adjusted point results" sx={{ minWidth: 920 }}>
          <TableHead>
            <TableRow>
              <TableCell>Point</TableCell>
              <TableCell>Role / geometry</TableCell>
              <TableCell align="right">E (m)</TableCell>
              <TableCell align="right">N (m)</TableCell>
              <TableCell align="right">H (m)</TableCell>
              <TableCell align="right">σE / σN / σH (mm)</TableCell>
              <TableCell align="right">Ellipse a / b / θ</TableCell>
              <TableCell align="right">Obs.</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {grouped.map((group) => [
              <TableRow key={`group-${group.role}`}>
                <TableCell colSpan={8} sx={{ py: 0.65, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: roleColour(group.role) }} />
                    <Typography variant="caption" fontWeight={800} textTransform="uppercase">{group.role}</Typography>
                    <Typography variant="caption" color="text.secondary">{group.rows.length} point(s)</Typography>
                  </Stack>
                </TableCell>
              </TableRow>,
              ...group.rows.map((point) => (
                <TableRow key={point.engineName} hover>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{point.engineName}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                      <StatusChip status={point.role} />
                      {point.singleRay && <Chip size="small" color="warning" variant="outlined" label="1-ray" />}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fixed(point.eastingM, 4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fixed(point.northingM, 4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fixed(point.heightM, 4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {millimetres(point.sigmaEM)} / {millimetres(point.sigmaNM)} / {millimetres(point.sigmaHM)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {millimetres(point.ellipseSemiMajorM)} / {millimetres(point.ellipseSemiMinorM)} / {fixed(point.ellipseOrientationDeg, 1)}°
                  </TableCell>
                  <TableCell align="right">{point.observationCount}</TableCell>
                </TableRow>
              )),
            ])}
            {points.length === 0 && (
              <TableRow><TableCell colSpan={8}><Alert severity="info">No point matches the current filters.</Alert></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}

function residualSeverity(value: number): 'default' | 'warning' | 'error' {
  if (!Number.isFinite(value)) return 'default';
  if (value >= 4) return 'error';
  if (value >= 2.5) return 'warning';
  return 'default';
}

function ResidualResultsTable({ diagnostic }: { diagnostic: AdjustmentDiagnostic }) {
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<ResidualKindFilter>('all');
  const groups = useMemo(
    () => groupResidualsByTarget(diagnostic.residuals, { kind, search }),
    [diagnostic.residuals, kind, search],
  );
  const visibleCount = groups.reduce((sum, group) => sum + group.residuals.length, 0);

  return (
    <Stack spacing={1.25}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          label="Find observation, station or target"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={{ minWidth: 300 }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="residual-kind-filter">Component</InputLabel>
          <Select
            labelId="residual-kind-filter"
            label="Component"
            value={kind}
            onChange={(event) => setKind(event.target.value as ResidualKindFilter)}
          >
            <MenuItem value="all">All components</MenuItem>
            <MenuItem value="hz">Horizontal angle</MenuItem>
            <MenuItem value="vz">Zenith angle</MenuItem>
            <MenuItem value="sd">Slope distance</MenuItem>
            <MenuItem value="constraint">Constraints</MenuItem>
          </Select>
        </FormControl>
        <Chip size="small" variant="outlined" label={`${visibleCount}/${diagnostic.residuals.length} scalar residuals`} />
        <Chip size="small" variant="outlined" label={`${groups.length} target group(s)`} />
      </Stack>
      <Box sx={{ overflow: 'auto', maxHeight: 500, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader aria-label="Worst residuals" sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell>Observation</TableCell>
              <TableCell>Station</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Residual</TableCell>
              <TableCell align="right">STAR*NET |v|/σ</TableCell>
              <TableCell align="right">Normalised |v|/(σ√r)</TableCell>
              <TableCell align="right">Redundancy</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((group) => [
              <TableRow key={`target-${group.targetEngineName}`}>
                <TableCell colSpan={8} sx={{ py: 0.65, bgcolor: 'grey.50' }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="caption" fontWeight={800}>{group.targetEngineName || 'Constraint'}</Typography>
                    <Typography variant="caption" color="text.secondary">{group.stationEngineNames.join(', ') || 'datum constraint'}</Typography>
                    <Chip size="small" variant="outlined" label={`${group.residuals.length} residual(s)`} />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={residualSeverity(group.maxStarNetResidual)}
                      label={`max |v|/σ ${fixed(group.maxStarNetResidual, 2)}`}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={residualSeverity(group.maxNormalisedResidual)}
                      label={`max normalised ${fixed(group.maxNormalisedResidual, 2)}`}
                    />
                    <Chip size="small" variant="outlined" label={`mean r ${fixed(group.meanRedundancy, 2)}`} />
                  </Stack>
                </TableCell>
              </TableRow>,
              ...group.residuals.map((residual) => {
                const display = residualDisplayValue(residual);
                return (
                  <TableRow key={residual.scalarObservationId} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{residual.observationId}</TableCell>
                    <TableCell>{residual.stationEngineName || '—'}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{residual.targetEngineName || '—'}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={residual.kind} /></TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      {fixed(display.value, 2)} {display.unit}
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small" variant="outlined" color={residualSeverity(Math.abs(residual.stdResidual))} label={fixed(residual.stdResidual, 2)} />
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        variant="outlined"
                        color={residualSeverity(Math.abs(residual.normalizedResidual))}
                        label={fixed(residual.normalizedResidual, 2)}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{fixed(residual.redundancy, 3)}</TableCell>
                  </TableRow>
                );
              }),
            ])}
            {visibleCount === 0 && (
              <TableRow><TableCell colSpan={8}><Alert severity="info">No residual matches the current filters.</Alert></TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        All scalar residuals are retained. Distances and constraints are shown in millimetres; angles are shown in arcseconds.
        Groups are ordered by their most critical normalised residual.
      </Typography>
    </Stack>
  );
}

function MetricCard({ label, value, detail, status = 'default' }: {
  label: string;
  value: string;
  detail?: string;
  status?: 'default' | 'success' | 'warning' | 'error';
}) {
  const borderColor = status === 'success' ? 'success.main' : status === 'warning' ? 'warning.main' : status === 'error' ? 'error.main' : 'divider';
  return (
    <Paper variant="outlined" sx={{ px: 1.25, py: 1, borderRadius: 1.5, borderTopWidth: 3, borderTopColor: borderColor, minWidth: 0 }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
      <Typography variant="subtitle1" fontWeight={800} noWrap>{value}</Typography>
      {detail && <Typography variant="caption" color="text.secondary" display="block" noWrap>{detail}</Typography>}
    </Paper>
  );
}

/** Shared diagnostic panel: quality metrics, full residual audit, network explorer and auto-adjust trace. */
export function DiagnosticPanel({
  diagnostic,
  warnings = [],
  showNetwork = true,
}: {
  diagnostic: AdjustmentDiagnostic;
  warnings?: string[];
  showNetwork?: boolean;
}) {
  const allWarnings = [...new Set([...warnings, ...diagnostic.warnings])];
  const chiStatus = diagnostic.chiSquareStatus === 'passed'
    ? 'success'
    : diagnostic.chiSquareStatus === 'failed'
      ? 'error'
      : 'warning';
  const geometryStatus = diagnostic.rankDeficiency > 0 || diagnostic.degreesOfFreedom <= 0 ? 'warning' : 'success';
  return (
    <Stack spacing={1.5}>
      <Alert severity={diagnostic.ok ? (diagnostic.chiSquareStatus === 'failed' ? 'warning' : 'success') : 'error'}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1}>
          <Box>
            <Typography variant="body2" fontWeight={800}>{diagnostic.engineLabel}</Typography>
            {diagnostic.failureReason && <Typography variant="caption">{diagnostic.failureReason}</Typography>}
          </Box>
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            <ChiSquareBadge status={diagnostic.chiSquareStatus} />
            <StatusChip status={diagnostic.converged ? 'converged' : 'failed'} />
          </Stack>
        </Stack>
      </Alert>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))', xl: 'repeat(7, minmax(0, 1fr))' },
          gap: 1,
        }}
      >
        <MetricCard label="Convergence" value={diagnostic.converged ? 'Converged' : 'Not converged'} detail={`${diagnostic.iterations} iteration(s)`} status={diagnostic.converged ? 'success' : 'error'} />
        <MetricCard label="Rank" value={`${diagnostic.rank}/${diagnostic.unknownCount}`} detail={diagnostic.rankDeficiency > 0 ? `${diagnostic.rankDeficiency} deficient` : 'full rank'} status={diagnostic.rankDeficiency > 0 ? 'error' : 'success'} />
        <MetricCard label="Degrees of freedom" value={`${diagnostic.degreesOfFreedom}`} detail={diagnostic.degreesOfFreedom <= 0 ? 'no redundancy' : 'redundant network'} status={geometryStatus} />
        <MetricCard label="Variance factor" value={fixed(diagnostic.varianceFactor, 3)} detail="a-posteriori" status={chiStatus} />
        <MetricCard label="Max STAR*NET |v|/σ" value={fixed(diagnostic.maxStdResidual, 2)} detail="largest scalar residual" status={residualSeverity(diagnostic.maxStdResidual)} />
        <MetricCard label="Observations" value={`${diagnostic.observationCount}`} detail={`${diagnostic.constraintCount} constraint(s)`} />
        <MetricCard label="Adjusted points" value={`${diagnostic.points.length}`} detail={`${diagnostic.points.filter((point) => point.singleRay).length} one-ray`} status={diagnostic.points.some((point) => point.singleRay) ? 'warning' : 'success'} />
      </Box>

      {allWarnings.length > 0 && (
        <Stack spacing={0.75}>
          {allWarnings.map((warning) => (
            <Alert key={warning} severity="warning" variant="outlined" sx={{ py: 0.25 }}>
              {warning}
            </Alert>
          ))}
        </Stack>
      )}

      {diagnostic.autoAdjustAttempts.length > 0 && (
        <Alert severity="info" variant="outlined">
          Auto Adjust excluded {diagnostic.autoAdjustAttempts.length} scalar observation(s) from the trial while leaving raw data untouched: {' '}
          {diagnostic.autoAdjustAttempts.map((attempt) => `${attempt.excludedScalarObservationId} (${fixed(attempt.stdResidual, 1)})`).join(', ')}
        </Alert>
      )}

      {showNetwork && <NetworkView diagnostic={diagnostic} />}

      <AdvancedSection title={`Adjusted points (${diagnostic.points.length})`} defaultExpanded>
        <PointResultsTable diagnostic={diagnostic} />
      </AdvancedSection>

      <AdvancedSection title={`Residual diagnostics (${diagnostic.residuals.length})`} defaultExpanded>
        <ResidualResultsTable diagnostic={diagnostic} />
      </AdvancedSection>
    </Stack>
  );
}
