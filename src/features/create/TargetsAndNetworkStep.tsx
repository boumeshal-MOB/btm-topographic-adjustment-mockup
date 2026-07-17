import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Checkbox,
  Chip,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { CatalogueTarget } from '@/demo/catalogue';
import type { WizardDraft } from '@/demo/draft';
import { NetworkCommonPointsPanel } from '@/features/create/NetworkCommonPointsPanel';

export function TargetsAndNetworkStep({
  draft,
  update,
  onError,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
  onError: (message: string) => void;
}) {
  const targetsQuery = useQuery({
    queryKey: ['targets', draft.stationCodes.join(',')],
    queryFn: () => api<CatalogueTarget[]>('GET', `/api/v2/catalogue/targets/${draft.stationCodes.join(',')}`),
    enabled: draft.stationCodes.length > 0,
  });
  const infoByKey = useMemo(
    () => new Map((targetsQuery.data ?? []).map((target) => [`${target.stationCode}|${target.rawTargetName}`, target])),
    [targetsQuery.data],
  );
  const [filter, setFilter] = useState('');
  const patchTarget = (index: number, patch: Partial<WizardDraft['targets'][number]>) => {
    update({ targets: draft.targets.map((target, targetIndex) => targetIndex === index ? { ...target, ...patch } : target) });
  };
  const visible = draft.targets
    .map((target, index) => ({ target, index }))
    .filter(({ target }) =>
      !filter ||
      target.rawTargetName.toLowerCase().includes(filter.toLowerCase()) ||
      target.stationCode.toLowerCase().includes(filter.toLowerCase()),
    );

  return (
    <Stack spacing={2}>
      <Typography variant="h2">Targets & Measurements</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <TextField size="small" label="Filter station or target" value={filter} onChange={(event) => setFilter(event.target.value)} />
        <Chip size="small" label={`${draft.targets.length} targets · ${draft.targets.filter((target) => target.includeInAdjustment).length} included · ${draft.targets.filter((target) => target.publishOutput).length} published`} />
      </Stack>
      <Box sx={{ overflowX: 'auto', maxHeight: 440, overflowY: 'auto' }}>
        <Table size="small" stickyHeader sx={{ minWidth: 1450 }}>
          <TableHead>
            <TableRow>
              <TableCell>Station</TableCell>
              <TableCell>BTM target (Hz/Vz/Sd ids)</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>EDM mode</TableCell>
              <TableCell align="right">Required cst (mm)</TableCell>
              <TableCell align="right">Applied cst (mm)</TableCell>
              <TableCell align="right">BTM Δ (mm)</TableCell>
              <TableCell align="right">Target h (m)</TableCell>
              <TableCell>Engine name</TableCell>
              <TableCell>Include</TableCell>
              <TableCell>Publish</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map(({ target, index }) => {
              const info = infoByKey.get(`${target.stationCode}|${target.rawTargetName}`);
              const delta = target.measurementType === 'reflectorless'
                ? 0
                : (target.requiredConstantM - target.alreadyAppliedConstantM) * 1000;
              return (
                <TableRow key={`${target.stationCode}|${target.rawTargetName}`} hover>
                  <TableCell>{target.stationCode}</TableCell>
                  <TableCell>
                    {target.rawTargetName}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {info ? `${info.hzVariableId}/${info.vzVariableId}/${info.sdVariableId} · sensor ${info.prismSensorId}` : '…'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Select size="small" variant="standard" value={target.role} onChange={(event) => patchTarget(index, { role: event.target.value as typeof target.role })}>
                      <MenuItem value="reference">reference</MenuItem>
                      <MenuItem value="monitoring">monitoring</MenuItem>
                      <MenuItem value="auxiliary">auxiliary</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      variant="standard"
                      value={target.measurementType}
                      onChange={(event) => {
                        const measurementType = event.target.value as typeof target.measurementType;
                        patchTarget(index, {
                          measurementType,
                          edmMode: measurementType === 'reflectorless' ? 'fine-non-prism' : 'precise-prism',
                          ...(measurementType === 'reflectorless' ? { requiredConstantM: 0, alreadyAppliedConstantM: 0 } : {}),
                        });
                      }}
                    >
                      <MenuItem value="prism">prism</MenuItem>
                      <MenuItem value="reflective-sheet">sheet</MenuItem>
                      <MenuItem value="reflectorless">reflectorless</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select size="small" variant="standard" value={target.edmMode} onChange={(event) => patchTarget(index, { edmMode: event.target.value })}>
                      {target.measurementType === 'reflectorless' ? [
                        <MenuItem key="fine-non-prism" value="fine-non-prism">Fine · no prism</MenuItem>,
                        <MenuItem key="standard-non-prism" value="standard-non-prism">Standard · no prism</MenuItem>,
                      ] : [
                        <MenuItem key="precise-prism" value="precise-prism">Precise · prism</MenuItem>,
                        <MenuItem key="fine-prism" value="fine-prism">Fine · prism</MenuItem>,
                        <MenuItem key="standard-prism" value="standard-prism">Standard · prism</MenuItem>,
                      ]}
                    </Select>
                  </TableCell>
                  <TableCell align="right">
                    {target.measurementType === 'reflectorless' ? '—' : (
                      <TextField
                        size="small"
                        variant="standard"
                        type="number"
                        value={target.requiredConstantM * 1000}
                        onChange={(event) => patchTarget(index, { requiredConstantM: Number(event.target.value) / 1000 })}
                        inputProps={{ step: 0.1, 'aria-label': `Required constant ${target.stationCode} ${target.rawTargetName}` }}
                        sx={{ width: 88 }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {target.measurementType === 'reflectorless' ? '—' : (
                      <TextField
                        size="small"
                        variant="standard"
                        type="number"
                        value={target.alreadyAppliedConstantM * 1000}
                        onChange={(event) => patchTarget(index, { alreadyAppliedConstantM: Number(event.target.value) / 1000 })}
                        inputProps={{ step: 0.1, 'aria-label': `Applied constant ${target.stationCode} ${target.rawTargetName}` }}
                        sx={{ width: 88 }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">{delta.toFixed(1)}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      variant="standard"
                      type="number"
                      value={target.targetHeightM}
                      onChange={(event) => patchTarget(index, { targetHeightM: Number(event.target.value) })}
                      inputProps={{ step: 0.001, 'aria-label': `Target height ${target.stationCode} ${target.rawTargetName}` }}
                      sx={{ width: 85 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      variant="standard"
                      value={target.engineName}
                      onChange={(event) => patchTarget(index, { engineName: event.target.value })}
                      inputProps={{ 'aria-label': `Engine name ${target.stationCode} ${target.rawTargetName}` }}
                      sx={{ minWidth: 150 }}
                    />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <Checkbox checked={target.includeInAdjustment} onChange={(event) => patchTarget(index, { includeInAdjustment: event.target.checked })} inputProps={{ 'aria-label': `Include ${target.stationCode} ${target.rawTargetName}` }} />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <Checkbox checked={target.publishOutput} onChange={(event) => patchTarget(index, { publishOutput: event.target.checked })} inputProps={{ 'aria-label': `Publish ${target.stationCode} ${target.rawTargetName}` }} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Δ = required − already applied (CORR-002); reflectorless has no constant (CORR-009). Sources: lookup metadata → preset template → your overrides.
      </Typography>
      {draft.scope === 'network' && <NetworkCommonPointsPanel draft={draft} update={update} onError={onError} />}
    </Stack>
  );
}
