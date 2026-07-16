import { useState, type ReactNode } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
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
import type { AdjustmentDiagnostic } from '@/domain/engine/run-input';

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
      onChange={(e) => props.onChange(Number(e.target.value))}
      inputProps={{ step: props.step ?? 0.001 }}
      disabled={props.disabled}
      sx={{ width: props.width ?? 170 }}
    />
  );
}

export function AdvancedSection({ title = 'Advanced options', children }: { title?: string; children: ReactNode }) {
  return (
    <Accordion disableGutters variant="outlined">
      <AccordionSummary expandIcon={<span aria-hidden>▾</span>}>
        <Typography variant="body2" fontWeight={600}>
          {title}
        </Typography>
      </AccordionSummary>
      <AccordionDetails>{children}</AccordionDetails>
    </Accordion>
  );
}

export function ChiSquareBadge({ status }: { status?: ChiSquareStatus }) {
  if (!status) return <Chip size="small" label="χ² —" variant="outlined" />;
  const label = status === 'not-applicable' ? 'χ² Not applicable — no redundancy' : status === 'passed' ? 'χ² passed' : 'χ² failed';
  return <Chip size="small" color={status === 'passed' ? 'success' : status === 'failed' ? 'error' : 'warning'} label={label} />;
}

/** Compact SVG network view: stations, points, rays and exaggerated error ellipses. */
export function NetworkView({ diagnostic, height = 320 }: { diagnostic: AdjustmentDiagnostic; height?: number }) {
  const [selectedName, setSelectedName] = useState<string>();
  const points = diagnostic.points;
  if (points.length === 0) return <Alert severity="info">No points to display.</Alert>;
  const xs = points.map((p) => p.eastingM);
  const ys = points.map((p) => p.northingM);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const pad = span * 0.08;
  const scale = (height - 20) / (span + 2 * pad);
  const px = (e: number) => (e - minX + pad) * scale + 10;
  const py = (n: number) => height - ((n - minY + pad) * scale + 10);
  const stations = points.filter((p) => p.role === 'station');
  const rays = new Set(
    diagnostic.residuals
      .filter((residual) => residual.kind !== 'constraint')
      .map((residual) => `${residual.stationEngineName}|${residual.targetEngineName}`),
  );
  const selected = points.find((point) => point.engineName === selectedName);
  const ellipseExaggeration = span / 40 / Math.max(1e-6, Math.max(...points.map((p) => p.ellipseSemiMajorM)) || 1);
  return (
    <Box>
      <svg width="100%" height={height} role="img" aria-label="Network map with stations, points and error ellipses">
        {stations.flatMap((s) =>
          points
            .filter((p) => p.role !== 'station' && rays.has(`${s.engineName}|${p.engineName}`))
            .map((p) => (
              <line
                key={`${s.engineName}-${p.engineName}`}
                x1={px(s.eastingM)}
                y1={py(s.northingM)}
                x2={px(p.eastingM)}
                y2={py(p.northingM)}
                stroke="#c9d4e0"
                strokeWidth={0.6}
              />
            )),
        )}
        {points.map((p) => (
          <Tooltip key={p.engineName} title={`${p.engineName} · E ${p.eastingM.toFixed(4)} · N ${p.northingM.toFixed(4)} · H ${p.heightM.toFixed(4)}`}>
          <g
            transform={`translate(${px(p.eastingM)}, ${py(p.northingM)})`}
            onClick={() => setSelectedName(p.engineName)}
            onKeyDown={(event) => event.key === 'Enter' && setSelectedName(p.engineName)}
            role="button"
            tabIndex={0}
            aria-label={`Inspect point ${p.engineName}`}
            style={{ cursor: 'pointer' }}
          >
            <ellipse
              rx={Math.max(2, p.ellipseSemiMajorM * ellipseExaggeration * scale)}
              ry={Math.max(2, p.ellipseSemiMinorM * ellipseExaggeration * scale)}
              transform={`rotate(${90 - p.ellipseOrientationDeg})`}
              fill={p.role === 'reference' ? '#2e7d5b33' : '#1f3a5f22'}
              stroke={p.role === 'reference' ? '#2e7d5b' : '#3e6fa8'}
              strokeWidth={selectedName === p.engineName ? 2 : 0.8}
            />
            <circle r={p.role === 'station' ? 5 : 3} fill={p.role === 'station' ? '#c9822a' : p.role === 'reference' ? '#2e7d5b' : '#1f3a5f'} />
            <text x={6} y={-5} fontSize={10} fill="#333">
              {p.engineName}
              {p.singleRay && p.role !== 'station' ? ' •1-ray' : ''}
            </text>
          </g>
          </Tooltip>
        ))}
      </svg>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" label={`Ellipses ×${Math.round(ellipseExaggeration)}`} />
        <Typography variant="caption" color="text.secondary">
          Orange: station · green: reference · blue: monitoring · lines: observations used · “•1-ray”: uncontrolled point.
        </Typography>
      </Stack>
      {selected && (
        <Alert severity="info" icon={false} sx={{ mt: 1, py: 0.5 }}>
          <strong>{selected.engineName}</strong> · E {selected.eastingM.toFixed(4)} m · N {selected.northingM.toFixed(4)} m · H{' '}
          {selected.heightM.toFixed(4)} m · σE/N/H {(selected.sigmaEM * 1000).toFixed(2)} / {(selected.sigmaNM * 1000).toFixed(2)} /{' '}
          {(selected.sigmaHM * 1000).toFixed(2)} mm
        </Alert>
      )}
    </Box>
  );
}

function PointResultsTable({ diagnostic }: { diagnostic: AdjustmentDiagnostic }) {
  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size="small" aria-label="Adjusted point results">
        <TableHead>
          <TableRow>
            <TableCell>Point</TableCell>
            <TableCell>Role</TableCell>
            <TableCell align="right">E (m)</TableCell>
            <TableCell align="right">N (m)</TableCell>
            <TableCell align="right">H (m)</TableCell>
            <TableCell align="right">σE / σN / σH (mm)</TableCell>
            <TableCell align="right">Confidence ellipse a / b (mm)</TableCell>
            <TableCell align="right">Obs.</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {diagnostic.points.map((point) => (
            <TableRow key={point.engineName} hover>
              <TableCell sx={{ fontWeight: 600 }}>{point.engineName}</TableCell>
              <TableCell><StatusChip status={point.singleRay ? 'weak' : point.role} /></TableCell>
              <TableCell align="right">{point.eastingM.toFixed(4)}</TableCell>
              <TableCell align="right">{point.northingM.toFixed(4)}</TableCell>
              <TableCell align="right">{point.heightM.toFixed(4)}</TableCell>
              <TableCell align="right">
                {(point.sigmaEM * 1000).toFixed(2)} / {(point.sigmaNM * 1000).toFixed(2)} / {(point.sigmaHM * 1000).toFixed(2)}
              </TableCell>
              <TableCell align="right">
                {(point.ellipseSemiMajorM * 1000).toFixed(2)} / {(point.ellipseSemiMinorM * 1000).toFixed(2)}
              </TableCell>
              <TableCell align="right">{point.observationCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

/** Shared diagnostic panel: quality numbers, residual table, network view, auto-adjust trace. */
export function DiagnosticPanel({ diagnostic, warnings = [] }: { diagnostic: AdjustmentDiagnostic; warnings?: string[] }) {
  const residuals = [...diagnostic.residuals]
    .filter((r) => r.kind !== 'constraint')
    .sort((a, b) => b.stdResidual - a.stdResidual)
    .slice(0, 12);
  return (
    <Stack spacing={2}>
      <Alert severity={diagnostic.ok ? (diagnostic.chiSquareStatus === 'failed' ? 'warning' : 'success') : 'error'}>
        {diagnostic.engineLabel}
        {diagnostic.failureReason ? ` — ${diagnostic.failureReason}` : ''}
      </Alert>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <ChiSquareBadge status={diagnostic.chiSquareStatus} />
        <Chip size="small" label={`converged: ${diagnostic.converged ? 'yes' : 'no'} (${diagnostic.iterations} it.)`} />
        <Chip size="small" label={`rank ${diagnostic.rank}/${diagnostic.unknownCount}`} color={diagnostic.rankDeficiency ? 'error' : 'default'} />
        <Chip size="small" label={`dof ${diagnostic.degreesOfFreedom}`} />
        <Chip size="small" label={`variance factor ${Number.isFinite(diagnostic.varianceFactor) ? diagnostic.varianceFactor.toFixed(3) : '—'}`} />
        <Chip size="small" label={`max STAR*NET |v|/σ ${diagnostic.maxStdResidual.toFixed(2)}`} />
        <Chip size="small" label={`${diagnostic.observationCount} obs · ${diagnostic.constraintCount} constraints`} />
      </Stack>
      {[...warnings, ...diagnostic.warnings].slice(0, 6).map((w) => (
        <Alert key={w} severity="warning" variant="outlined" sx={{ py: 0 }}>
          {w}
        </Alert>
      ))}
      {diagnostic.autoAdjustAttempts.length > 0 && (
        <Alert severity="info">
          Auto Adjust excluded {diagnostic.autoAdjustAttempts.length} observation(s) from the trial (raw data untouched, DATA-007):{' '}
          {diagnostic.autoAdjustAttempts.map((a) => `${a.excludedScalarObservationId} (${a.stdResidual.toFixed(1)})`).join(', ')}
        </Alert>
      )}
      <NetworkView diagnostic={diagnostic} />
      <AdvancedSection title={`Adjusted points (${diagnostic.points.length})`}>
        <PointResultsTable diagnostic={diagnostic} />
      </AdvancedSection>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" aria-label="Worst residuals">
          <TableHead>
            <TableRow>
              <TableCell>Observation</TableCell>
              <TableCell>Station</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Residual (mm / arcsec)</TableCell>
              <TableCell align="right">STAR*NET |v|/σ</TableCell>
              <TableCell align="right">Normalised |v|/(σ√r)</TableCell>
              <TableCell align="right">Redundancy</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {residuals.map((r) => (
              <TableRow key={r.observationId + r.kind}>
                <TableCell>{r.observationId}</TableCell>
                <TableCell>{r.stationEngineName}</TableCell>
                <TableCell>{r.targetEngineName}</TableCell>
                <TableCell>{r.kind}</TableCell>
                <TableCell align="right">
                  {r.kind === 'sd' ? (r.residual * 1000).toFixed(2) : ((r.residual * 180 * 3600) / Math.PI).toFixed(2)}
                </TableCell>
                <TableCell align="right">{r.stdResidual.toFixed(2)}</TableCell>
                <TableCell align="right">{Number.isFinite(r.normalizedResidual) ? r.normalizedResidual.toFixed(2) : '—'}</TableCell>
                <TableCell align="right">{r.redundancy.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Typography variant="caption" color="text.secondary">
          Worst 12 of {diagnostic.residuals.length} residuals — distances in mm, angles in arcsec (units in headers, front/10 §8).
        </Typography>
      </Box>
    </Stack>
  );
}
