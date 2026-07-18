import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
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
import type { ChiSquareStatus } from '@/domain/entities';
import type { AdjustmentDiagnostic, DiagnosticPoint, DiagnosticResidual } from '@/domain/engine/run-input';
import {
  groupResidualsByTarget,
  residualDisplayValue,
  smartLabelNames,
  sortDiagnosticPoints,
  type ResidualKindFilter,
} from '@/features/shared/diagnostic-view-model';

/** Colour + text, never colour alone (front/10 §6). */
export function StatusChip({ status }: { status: string }) {
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
  return <Chip size="small" label={status} color={palette[status] ?? 'default'} variant="outlined" />;
}

/** Numeric field with an explicit unit in the label (units always visible, front/10 §7). */
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
      label={`${props.label} (${props.unit})`}
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
  if (!status) return <Chip size="small" label="χ² —" variant="outlined" />;
  const label = status === 'not-applicable'
    ? 'χ² Not applicable — no redundancy'
    : status === 'passed'
      ? 'χ² passed'
      : 'χ² failed';
  return (
    <Chip
      size="small"
      color={status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'warning'}
      label={label}
    />
  );
}

const VIEW_WIDTH = 960;
const ROLE_COLOURS: Record<DiagnosticPoint['role'], string> = {
  station: '#c16f1b',
  reference: '#28815e',
  monitoring: '#285d91',
  auxiliary: '#7653a6',
};

function roleColour(role: DiagnosticPoint['role']): string {
  return ROLE_COLOURS[role] ?? '#52606d';
}

function pointRoleLabel(point: DiagnosticPoint): string {
  if (point.singleRay && point.role !== 'station') return `${point.role} · uncontrolled (1 ray)`;
  return point.role;
}

/** Interactive SVG network explorer with smart labels, filtering, zoom, pan and point inspection. */
export function NetworkView({ diagnostic, height = 480 }: { diagnostic: AdjustmentDiagnostic; height?: number }) {
  const [selectedName, setSelectedName] = useState<string>();
  const [hoveredName, setHoveredName] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [labelMode, setLabelMode] = useState<'smart' | 'all' | 'none'>('smart');
  const [activeRole, setActiveRole] = useState<'all' | DiagnosticPoint['role']>('all');
  const [ellipseScaleMode, setEllipseScaleMode] = useState<'auto' | '1' | '10' | '100' | '1000'>('auto');
  const [expanded, setExpanded] = useState(false);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number }>();

  const points = diagnostic.points;
  if (points.length === 0) return <Alert severity="info">No points to display.</Alert>;

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
  const rays = new Set(
    diagnostic.residuals
      .filter((residual) => residual.kind !== 'constraint')
      .map((residual) => `${residual.stationEngineName}|${residual.targetEngineName}`),
  );
  const selected = points.find((point) => point.engineName === selectedName);
  const maxEllipse = Math.max(1e-9, ...points.map((point) => point.ellipseSemiMajorM));
  const autoEllipseScale = span / 45 / maxEllipse;
  const ellipseScale = ellipseScaleMode === 'auto' ? autoEllipseScale : Number(ellipseScaleMode);
  const labels = smartLabelNames(points, { zoom, selectedName, hoveredName, mode: labelMode });
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
        sx={{ px: 1.5, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'grey.50' }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>Network explorer</Typography>
          <Typography variant="caption" color="text.secondary">
            Drag to move · wheel or controls to zoom · select a point to inspect coordinates and uncertainty.
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => setZoom((value) => clampZoom(value / 1.25))} aria-label="Zoom out network">−</Button>
          <Chip size="small" variant="outlined" label={`${Math.round(zoom * 100)}%`} />
          <Button size="small" variant="outlined" onClick={() => setZoom((value) => clampZoom(value * 1.25))} aria-label="Zoom in network">+</Button>
          <Button size="small" onClick={resetView}>Fit</Button>
          <Button size="small" variant="outlined" onClick={cycleLabels}>Labels: {labelMode}</Button>
          <Button size="small" variant="outlined" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Compact' : 'Expand'}</Button>
          <FormControl size="small" sx={{ minWidth: 132 }}>
            <InputLabel id="ellipse-scale">Ellipses</InputLabel>
            <Select
              labelId="ellipse-scale"
              label="Ellipses"
              value={ellipseScaleMode}
              onChange={(event) => setEllipseScaleMode(event.target.value as typeof ellipseScaleMode)}
            >
              <MenuItem value="auto">Auto ×{Math.round(autoEllipseScale)}</MenuItem>
              <MenuItem value="1">True scale ×1</MenuItem>
              <MenuItem value="10">×10</MenuItem>
              <MenuItem value="100">×100</MenuItem>
              <MenuItem value="1000">×1000</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Stack>

      <Stack direction={{ xs: 'column', lg: 'row' }} sx={{ minHeight: mapHeight }}>
        <Box sx={{ flex: 1, minWidth: 0, position: 'relative', bgcolor: '#f8fafc' }}>
          <Stack
            direction="row"
            spacing={0.75}
            flexWrap="wrap"
            useFlexGap
            sx={{ position: 'absolute', zIndex: 2, top: 10, left: 10, right: 10 }}
          >
            {(['all', 'station', 'reference', 'monitoring', 'auxiliary'] as const).map((role) => {
              const count = role === 'all' ? points.length : points.filter((point) => point.role === role).length;
              if (role !== 'all' && count === 0) return null;
              return (
                <Chip
                  key={role}
                  size="small"
                  label={`${role === 'all' ? 'All points' : role} · ${count}`}
                  variant={activeRole === role ? 'filled' : 'outlined'}
                  onClick={() => setActiveRole(role)}
                  sx={{ bgcolor: activeRole === role ? 'background.paper' : 'rgba(255,255,255,.86)', backdropFilter: 'blur(6px)' }}
                />
              );
            })}
          </Stack>
          <svg
            width="100%"
            height={mapHeight}
            viewBox={`0 0 ${VIEW_WIDTH} ${mapHeight}`}
            role="img"
            aria-label="Network map with stations, points and error ellipses"
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
            <rect width={VIEW_WIDTH} height={mapHeight} fill="#f8fafc" />
            {Array.from({ length: 9 }, (_, index) => {
              const x = (index + 1) * VIEW_WIDTH / 10;
              return <line key={`grid-v-${x}`} x1={x} y1={0} x2={x} y2={mapHeight} stroke="#e8edf3" strokeWidth={1} />;
            })}
            {Array.from({ length: 6 }, (_, index) => {
              const y = (index + 1) * mapHeight / 7;
              return <line key={`grid-h-${y}`} x1={0} y1={y} x2={VIEW_WIDTH} y2={y} stroke="#e8edf3" strokeWidth={1} />;
            })}
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {stations.flatMap((station) =>
                points
                  .filter((point) => point.role !== 'station' && rays.has(`${station.engineName}|${point.engineName}`))
                  .map((point) => {
                    const faded = activeRole !== 'all' && station.role !== activeRole && point.role !== activeRole;
                    const highlighted = selectedName === station.engineName || selectedName === point.engineName;
                    return (
                      <line
                        key={`${station.engineName}-${point.engineName}`}
                        x1={px(station.eastingM)}
                        y1={py(station.northingM)}
                        x2={px(point.eastingM)}
                        y2={py(point.northingM)}
                        stroke={highlighted ? roleColour(point.role) : '#aebdca'}
                        strokeWidth={highlighted ? 2.2 : 1}
                        strokeOpacity={faded ? 0.08 : highlighted ? 0.9 : 0.38}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  }),
              )}
              {points.map((point) => {
                const isSelected = selectedName === point.engineName;
                const isHovered = hoveredName === point.engineName;
                const faded = activeRole !== 'all' && point.role !== activeRole;
                const x = px(point.eastingM);
                const y = py(point.northingM);
                const ellipseRx = Math.max(2.5 / zoom, point.ellipseSemiMajorM * ellipseScale * scale);
                const ellipseRy = Math.max(2 / zoom, point.ellipseSemiMinorM * ellipseScale * scale);
                const pointRadius = (point.role === 'station' ? 7 : point.role === 'reference' ? 5.5 : 4.5) / zoom;
                return (
                  <Tooltip
                    key={point.engineName}
                    title={`${point.engineName} · E ${point.eastingM.toFixed(4)} · N ${point.northingM.toFixed(4)} · H ${point.heightM.toFixed(4)}`}
                  >
                    <g
                      transform={`translate(${x}, ${y})`}
                      opacity={faded ? 0.12 : 1}
                      onPointerDown={(event) => event.stopPropagation()}
                      onMouseEnter={() => setHoveredName(point.engineName)}
                      onMouseLeave={() => setHoveredName(undefined)}
                      onClick={() => setSelectedName((current) => current === point.engineName ? undefined : point.engineName)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setSelectedName(point.engineName);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Inspect point ${point.engineName}`}
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      <ellipse
                        rx={ellipseRx}
                        ry={ellipseRy}
                        transform={`rotate(${90 - point.ellipseOrientationDeg})`}
                        fill={`${roleColour(point.role)}18`}
                        stroke={roleColour(point.role)}
                        strokeWidth={isSelected ? 2.6 : isHovered ? 1.8 : 0.9}
                        vectorEffect="non-scaling-stroke"
                      />
                      {point.role === 'station' ? (
                        <rect
                          x={-pointRadius}
                          y={-pointRadius}
                          width={pointRadius * 2}
                          height={pointRadius * 2}
                          rx={1.5 / zoom}
                          fill={roleColour(point.role)}
                          stroke="#fff"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : point.role === 'reference' ? (
                        <path
                          d={`M 0 ${-pointRadius} L ${pointRadius} 0 L 0 ${pointRadius} L ${-pointRadius} 0 Z`}
                          fill={roleColour(point.role)}
                          stroke="#fff"
                          strokeWidth={1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      ) : (
                        <circle
                          r={pointRadius}
                          fill={roleColour(point.role)}
                          stroke={point.singleRay ? '#d14343' : '#fff'}
                          strokeDasharray={point.singleRay ? '3 2' : undefined}
                          strokeWidth={point.singleRay ? 2 : 1.5}
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                      {labels.has(point.engineName) && (
                        <g transform={`translate(${8 / zoom}, ${-8 / zoom})`}>
                          <rect
                            x={-2 / zoom}
                            y={-11 / zoom}
                            width={(point.engineName.length * 6.5 + (point.singleRay ? 32 : 4)) / zoom}
                            height={16 / zoom}
                            rx={3 / zoom}
                            fill="rgba(255,255,255,.88)"
                            stroke={isSelected ? roleColour(point.role) : 'rgba(148,163,184,.55)'}
                            strokeWidth={isSelected ? 1.5 : 0.7}
                            vectorEffect="non-scaling-stroke"
                          />
                          <text fontSize={10.5 / zoom} fill="#172033" fontWeight={isSelected ? 700 : 500}>
                            {point.engineName}{point.singleRay && point.role !== 'station' ? ' · 1-ray' : ''}
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
            spacing={1}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ position: 'absolute', left: 12, right: 12, bottom: 10 }}
          >
            <Chip size="small" variant="outlined" label={`Ellipses ×${Math.round(ellipseScale)}`} sx={{ bgcolor: 'rgba(255,255,255,.9)' }} />
            <Chip size="small" variant="outlined" label={`${activePoints} visible`} sx={{ bgcolor: 'rgba(255,255,255,.9)' }} />
            <Typography variant="caption" color="text.secondary" sx={{ bgcolor: 'rgba(255,255,255,.82)', px: 0.75, borderRadius: 1 }}>
              ■ station · ◆ reference · ● monitoring/auxiliary · dashed outline: uncontrolled 1-ray point
            </Typography>
          </Stack>
        </Box>

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
                <Typography variant="body2" fontFamily="monospace">{selected.eastingM.toFixed(4)} m</Typography>
                <Typography variant="caption" color="text.secondary">Northing</Typography>
                <Typography variant="body2" fontFamily="monospace">{selected.northingM.toFixed(4)} m</Typography>
                <Typography variant="caption" color="text.secondary">Height</Typography>
                <Typography variant="body2" fontFamily="monospace">{selected.heightM.toFixed(4)} m</Typography>
              </Box>
              <Divider />
              <Typography variant="overline" color="text.secondary">Uncertainty</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 0.75 }}>
                <Typography variant="caption" color="text.secondary">σ E / N / H</Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {(selected.sigmaEM * 1000).toFixed(2)} / {(selected.sigmaNM * 1000).toFixed(2)} / {(selected.sigmaHM * 1000).toFixed(2)} mm
                </Typography>
                <Typography variant="caption" color="text.secondary">Ellipse a / b</Typography>
                <Typography variant="body2" fontFamily="monospace">
                  {(selected.ellipseSemiMajorM * 1000).toFixed(2)} / {(selected.ellipseSemiMinorM * 1000).toFixed(2)} mm
                </Typography>
                <Typography variant="caption" color="text.secondary">Orientation</Typography>
                <Typography variant="body2" fontFamily="monospace">{selected.ellipseOrientationDeg.toFixed(2)}°</Typography>
                <Typography variant="caption" color="text.secondary">Observations</Typography>
                <Typography variant="body2" fontFamily="monospace">{selected.observationCount}</Typography>
              </Box>
              {selected.singleRay && (
                <Alert severity="warning" variant="outlined" sx={{ py: 0.25 }}>
                  This point is controlled by one ray only. Its geometry is weak even when the solver converges.
                </Alert>
              )}
              <Button size="small" variant="outlined" onClick={() => setSelectedName(undefined)}>Clear selection</Button>
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
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{point.eastingM.toFixed(4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{point.northingM.toFixed(4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{point.heightM.toFixed(4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {(point.sigmaEM * 1000).toFixed(2)} / {(point.sigmaNM * 1000).toFixed(2)} / {(point.sigmaHM * 1000).toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {(point.ellipseSemiMajorM * 1000).toFixed(2)} / {(point.ellipseSemiMinorM * 1000).toFixed(2)} / {point.ellipseOrientationDeg.toFixed(1)}°
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
                      label={`max |v|/σ ${group.maxStarNetResidual.toFixed(2)}`}
                    />
                    <Chip
                      size="small"
                      variant="outlined"
                      color={residualSeverity(group.maxNormalisedResidual)}
                      label={`max normalised ${Number.isFinite(group.maxNormalisedResidual) ? group.maxNormalisedResidual.toFixed(2) : '—'}`}
                    />
                    <Chip size="small" variant="outlined" label={`mean r ${Number.isFinite(group.meanRedundancy) ? group.meanRedundancy.toFixed(2) : '—'}`} />
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
                      {display.value.toFixed(2)} {display.unit}
                    </TableCell>
                    <TableCell align="right">
                      <Chip size="small" variant="outlined" color={residualSeverity(Math.abs(residual.stdResidual))} label={residual.stdResidual.toFixed(2)} />
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        variant="outlined"
                        color={residualSeverity(Math.abs(residual.normalizedResidual))}
                        label={Number.isFinite(residual.normalizedResidual) ? residual.normalizedResidual.toFixed(2) : '—'}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{residual.redundancy.toFixed(3)}</TableCell>
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
export function DiagnosticPanel({ diagnostic, warnings = [] }: { diagnostic: AdjustmentDiagnostic; warnings?: string[] }) {
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
        <MetricCard label="Variance factor" value={Number.isFinite(diagnostic.varianceFactor) ? diagnostic.varianceFactor.toFixed(3) : '—'} detail="a-posteriori" status={chiStatus} />
        <MetricCard label="Max STAR*NET |v|/σ" value={diagnostic.maxStdResidual.toFixed(2)} detail="largest scalar residual" status={residualSeverity(diagnostic.maxStdResidual)} />
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
          {diagnostic.autoAdjustAttempts.map((attempt) => `${attempt.excludedScalarObservationId} (${attempt.stdResidual.toFixed(1)})`).join(', ')}
        </Alert>
      )}

      <NetworkView diagnostic={diagnostic} />

      <AdvancedSection title={`Adjusted points (${diagnostic.points.length})`} defaultExpanded>
        <PointResultsTable diagnostic={diagnostic} />
      </AdvancedSection>

      <AdvancedSection title={`Residual diagnostics (${diagnostic.residuals.length})`} defaultExpanded>
        <ResidualResultsTable diagnostic={diagnostic} />
      </AdvancedSection>
    </Stack>
  );
}
