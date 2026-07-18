import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { Box, Button, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
import type { WizardDraft } from '@/demo/draft';
import {
  buildNetworkViewModel,
  networkBounds,
  type NetworkViewNode,
} from '@/features/create/network-view-model';

const WIDTH = 840;
const HEIGHT = 460;
const PADDING = 48;
const STATION_COLOURS = ['#1f5a93', '#b6532f', '#31745a', '#76539b', '#946b16', '#3d6f78'];

function stationColour(stationCodes: readonly string[], stationCode: string): string {
  const index = Math.max(0, stationCodes.indexOf(stationCode));
  return STATION_COLOURS[index % STATION_COLOURS.length];
}

function sharedPointPath(x: number, y: number, radius: number): string {
  return [
    `M ${x} ${y - radius}`,
    `L ${x + radius} ${y}`,
    `L ${x} ${y + radius}`,
    `L ${x - radius} ${y}`,
    'Z',
  ].join(' ');
}

export function InitialCoordinatesNetworkView({ draft }: { draft: WizardDraft }) {
  const result = draft.initialisation.result;
  const model = useMemo(
    () => (result ? buildNetworkViewModel(draft, result) : undefined),
    [draft, result],
  );
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [activeStation, setActiveStation] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number }>();

  if (!result || !model || model.nodes.length === 0) return null;

  const bounds = networkBounds(model.nodes);
  const spanE = bounds.maxEastingM - bounds.minEastingM;
  const spanN = bounds.maxNorthingM - bounds.minNorthingM;
  const usableWidth = WIDTH - PADDING * 2;
  const usableHeight = HEIGHT - PADDING * 2;
  const scale = Math.min(usableWidth / spanE, usableHeight / spanN);
  const contentWidth = spanE * scale;
  const contentHeight = spanN * scale;
  const offsetX = (WIDTH - contentWidth) / 2;
  const offsetY = (HEIGHT - contentHeight) / 2;
  const pointById = new Map(model.nodes.map((node) => [node.id, node]));
  const selected = selectedId ? pointById.get(selectedId) : undefined;

  const project = (node: NetworkViewNode) => ({
    x: offsetX + (node.eastingM - bounds.minEastingM) * scale,
    y: HEIGHT - offsetY - (node.northingM - bounds.minNorthingM) * scale,
  });
  const relevant = (node: NetworkViewNode) =>
    !activeStation || node.stationCodes.includes(activeStation);

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  const clampZoom = (value: number) => Math.max(0.6, Math.min(4, value));
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    setZoom((value) => clampZoom(value * (event.deltaY < 0 ? 1.12 : 0.89)));
  };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan({ x: drag.panX + event.clientX - drag.x, y: drag.panY + event.clientY - drag.y });
  };
  const pointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = undefined;
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="initial-network-view">
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1}>
          <Box>
            <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
              Initial coordinate network
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Drag to pan, use the wheel or controls to zoom, and select a station or point for details.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Button size="small" variant="outlined" onClick={() => setZoom((value) => clampZoom(value / 1.2))} aria-label="Zoom out network">
              −
            </Button>
            <Chip size="small" label={`${Math.round(zoom * 100)}%`} variant="outlined" />
            <Button size="small" variant="outlined" onClick={() => setZoom((value) => clampZoom(value * 1.2))} aria-label="Zoom in network">
              +
            </Button>
            <Button size="small" onClick={resetView}>Fit</Button>
          </Stack>
        </Stack>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Typography variant="caption" fontWeight={600}>Isolate:</Typography>
          <Chip
            size="small"
            label="All stations"
            variant={activeStation ? 'outlined' : 'filled'}
            onClick={() => setActiveStation(undefined)}
          />
          {model.stationCodes.map((stationCode) => (
            <Chip
              key={stationCode}
              size="small"
              label={stationCode}
              variant={activeStation === stationCode ? 'filled' : 'outlined'}
              onClick={() => setActiveStation((current) => current === stationCode ? undefined : stationCode)}
              sx={{
                borderColor: stationColour(model.stationCodes, stationCode),
                '&::before': {
                  content: '""', width: 8, height: 8, borderRadius: '50%', mr: 0.75,
                  bgcolor: stationColour(model.stationCodes, stationCode),
                },
              }}
            />
          ))}
          <Chip size="small" variant="outlined" label="◆ shared point" />
          <Chip size="small" variant="outlined" label="■ station" />
        </Stack>

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.50' }}>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            width="100%"
            role="img"
            aria-label="Interactive initial coordinate network"
            style={{ display: 'block', minHeight: 360, cursor: dragRef.current ? 'grabbing' : 'grab', touchAction: 'none' }}
            onWheel={handleWheel}
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerUp}
            onPointerCancel={pointerUp}
          >
            <rect width={WIDTH} height={HEIGHT} fill="#f8fafc" />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              {model.links.map((link) => {
                const station = pointById.get(link.stationNodeId);
                const point = pointById.get(link.pointNodeId);
                if (!station || !point) return null;
                const a = project(station);
                const b = project(point);
                const faded = activeStation !== undefined && link.stationCode !== activeStation;
                return (
                  <line
                    key={link.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={stationColour(model.stationCodes, link.stationCode)}
                    strokeWidth={selectedId === link.pointNodeId || selectedId === link.stationNodeId ? 2.5 : 1.25}
                    strokeOpacity={faded ? 0.08 : 0.48}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
              {model.nodes.map((node) => {
                const p = project(node);
                const isSelected = selectedId === node.id;
                const opacity = relevant(node) ? 1 : 0.13;
                const colour = node.kind === 'station'
                  ? stationColour(model.stationCodes, node.stationCodes[0])
                  : node.stationCodes.length === 1
                    ? stationColour(model.stationCodes, node.stationCodes[0])
                    : '#172f4f';
                return (
                  <g
                    key={node.id}
                    opacity={opacity}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => setSelectedId(node.id)}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    aria-label={`Show ${node.kind} ${node.label}`}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedId(node.id);
                    }}
                  >
                    {node.kind === 'station' ? (
                      <rect
                        x={p.x - 7}
                        y={p.y - 7}
                        width={14}
                        height={14}
                        rx={2}
                        fill={colour}
                        stroke={isSelected ? '#111827' : '#ffffff'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : node.stationCodes.length > 1 ? (
                      <path
                        d={sharedPointPath(p.x, p.y, 6)}
                        fill={colour}
                        stroke={isSelected ? '#111827' : '#ffffff'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={5}
                        fill={colour}
                        stroke={isSelected ? '#111827' : '#ffffff'}
                        strokeWidth={isSelected ? 3 : 1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {(node.kind === 'station' || isSelected || zoom >= 1.35) && (
                      <text x={p.x + 9} y={p.y - 8} fontSize={11 / zoom} fill="#172033" style={{ pointerEvents: 'none' }}>
                        {node.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </Box>

        {selected && (
          <>
            <Divider />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} data-testid="network-node-details">
              <Box sx={{ minWidth: 190 }}>
                <Typography variant="subtitle2">{selected.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {selected.kind === 'station' ? 'Station solution' : selected.stationCodes.length > 1 ? 'Shared physical point' : 'Observed point'}
                </Typography>
              </Box>
              <Typography variant="body2">E {selected.eastingM.toFixed(4)} m</Typography>
              <Typography variant="body2">N {selected.northingM.toFixed(4)} m</Typography>
              <Typography variant="body2">H {selected.heightM.toFixed(4)} m</Typography>
              <Typography variant="body2">Stations: {selected.stationCodes.join(', ') || '—'}</Typography>
              {selected.observationCount !== undefined && <Typography variant="body2">Observations: {selected.observationCount}</Typography>}
              {selected.status && <Chip size="small" label={selected.status} color={selected.status === 'review' ? 'warning' : 'success'} />}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
}
