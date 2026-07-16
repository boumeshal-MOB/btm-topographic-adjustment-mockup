import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Step,
  StepButton,
  Stepper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import { applyWizardDraftPatch, draftEngineNameCollisions, resolveDraftPhysicalIdentities, type WizardDraft } from '@/demo/draft';
import type { CatalogueReference, CatalogueStation, CatalogueTarget } from '@/demo/catalogue';
import type { GeometryCheck } from '@/domain/point-identity/local-geometry';
import { AdvancedSection, DiagnosticPanel, StatusChip, UnitField } from '@/features/shared/components';
import type { TestEpochResult } from '@/features/shared/types';

const STEPS = ['General', 'Stations', 'Instruments', 'Targets & Measurements', 'Initialisation', 'Adjustment', 'Run', 'Output', 'Review & Create'];

export default function WizardPage() {
  const { draftId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<WizardDraft>();
  const [error, setError] = useState<string>();

  const draftQuery = useQuery({
    queryKey: ['draft', draftId],
    queryFn: () => api<WizardDraft>('GET', `/api/v2/drafts/${draftId}`),
    enabled: !!draftId,
  });
  useEffect(() => {
    if (draftQuery.data && !draft) setDraft(draftQuery.data);
  }, [draftQuery.data, draft]);

  const save = useMutation({
    mutationFn: (next: WizardDraft) => api<WizardDraft>('PUT', `/api/v2/drafts/${next.id}`, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drafts'] });
      // connectivity is computed server-side from the SAVED draft: refresh it only once the
      // save round-trip is done, otherwise confirmed shared points show stale badges
      queryClient.invalidateQueries({ queryKey: ['connectivity'] });
    },
  });

  const update = (patch: Partial<WizardDraft>) => {
    if (!draft) return;
    const next = applyWizardDraftPatch(draft, patch);
    setDraft(next);
    save.mutate(next);
  };

  if (!draft) {
    return (
      <Container sx={{ py: 4 }}>
        {draftQuery.isError ? <Alert severity="error">Draft not found.</Alert> : <CircularProgress aria-label="Loading draft" />}
      </Container>
    );
  }

  const step = draft.step;
  const setStep = (next: number) => update({ step: Math.max(0, Math.min(STEPS.length - 1, next)) });

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h1">New Topographic Adjustment</Typography>
          <Chip size="small" label={`Draft saved ${new Date(draft.updatedAt).toLocaleTimeString()}`} variant="outlined" />
        </Stack>
        <Box sx={{ overflowX: 'auto', pb: 0.5 }}>
          <Stepper nonLinear activeStep={step} alternativeLabel sx={{ minWidth: 900 }}>
            {STEPS.map((label, index) => (
              <Step key={label} completed={index < step}>
                <StepButton onClick={() => setStep(index)}>{label}</StepButton>
              </Step>
            ))}
          </Stepper>
        </Box>
        {error && (
          <Alert severity="error" onClose={() => setError(undefined)}>
            {error}
          </Alert>
        )}
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2.5, md: 3 } }}>
          {step === 0 && <GeneralStep draft={draft} setDraft={setDraft} update={update} onError={setError} />}
          {step === 1 && <StationsStep draft={draft} setDraft={setDraft} onError={setError} />}
          {step === 2 && <InstrumentsStep draft={draft} update={update} />}
          {step === 3 && <TargetsStep draft={draft} update={update} onError={setError} />}
          {step === 4 && <InitialisationStep draft={draft} setDraft={setDraft} update={update} onError={setError} />}
          {step === 5 && <AdjustmentStep draft={draft} update={update} setDraft={setDraft} onError={setError} />}
          {step === 6 && <RunStep draft={draft} update={update} />}
          {step === 7 && <OutputStep draft={draft} update={update} />}
          {step === 8 && <ReviewStep draft={draft} onError={setError} onCreated={(id) => navigate(`/processing/topographic-adjustment/${id}`)} />}
        </Paper>
        <Stack
          direction="row"
          justifyContent="space-between"
          sx={{ position: 'sticky', bottom: 8, zIndex: 2, bgcolor: 'rgba(255,255,255,.94)', backdropFilter: 'blur(8px)', p: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
        >
          <Button variant="outlined" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          <Button variant="contained" disabled={step === STEPS.length - 1} onClick={() => setStep(step + 1)}>
            Next
          </Button>
        </Stack>
      </Stack>
    </Container>
  );
}

// ------------------------------------------------------------------ step 1: General

function GeneralStep({
  draft,
  setDraft,
  update,
  onError,
}: {
  draft: WizardDraft;
  setDraft: (draft: WizardDraft) => void;
  update: (p: Partial<WizardDraft>) => void;
  onError: (message: string) => void;
}) {
  const catalogue = useCatalogue();
  const queryClient = useQueryClient();
  const changePreset = useMutation({
    mutationFn: (presetId: WizardDraft['countryPresetId']) =>
      api<WizardDraft>('POST', `/api/v2/drafts/${draft.id}/preset`, { presetId }),
    onSuccess: (next) => {
      setDraft(next);
      queryClient.invalidateQueries({ queryKey: ['draft', draft.id] });
    },
    onError: (error) => onError(String(error)),
  });
  const summary = useMemo(() => {
    const stations = catalogue.data?.stations.filter((s) => draft.stationCodes.includes(s.stationCode)) ?? [];
    return {
      observations: stations.reduce((sum, s) => sum + s.observationCount, 0),
      targets: stations.reduce((sum, s) => sum + s.targetCount, 0),
      last: stations.map((s) => s.lastEpoch).sort().at(-1),
    };
  }, [catalogue.data, draft.stationCodes]);
  return (
    <Stack spacing={2}>
      <Typography variant="h2">General</Typography>
      <Typography variant="body2" color="text.secondary">
        Processing type: <b>Topographic Adjustment</b> — the BTM project is implicit (no Project field).
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField
          label="Processing name"
          required
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          sx={{ width: 320 }}
          inputProps={{ 'data-testid': 'processing-name' }}
        />
        <TextField label="Description" value={draft.description} onChange={(e) => update({ description: e.target.value })} sx={{ width: 380 }} />
      </Stack>
      <Stack direction="row" spacing={4} flexWrap="wrap" useFlexGap>
        <FormControl>
          <Typography variant="body2" fontWeight={600}>
            Adjustment scope
          </Typography>
          <RadioGroup row value={draft.scope} onChange={(e) => update({ scope: e.target.value as WizardDraft['scope'], stationCodes: [], stations: [], targets: [], sharedPoints: [] })}>
            <FormControlLabel value="single-station" control={<Radio />} label="Single station" />
            <FormControlLabel value="network" control={<Radio />} label="Network (connected)" />
          </RadioGroup>
        </FormControl>
        <FormControl>
          <Typography variant="body2" fontWeight={600}>
            Country preset (versioned template, not a national standard)
          </Typography>
          <RadioGroup
            row
            value={draft.countryPresetId}
            onChange={(event) => {
              const presetId = event.target.value as WizardDraft['countryPresetId'];
              const shouldChange =
                draft.stationCodes.length === 0 ||
                window.confirm('Changing the preset resets station, measurement, initialisation, adjustment, run and output proposals. Continue?');
              if (shouldChange) changePreset.mutate(presetId);
            }}
          >
            <FormControlLabel value="uk-supplied-hs2-nte" control={<Radio />} label="UK — supplied HS2/NTE project" />
            <FormControlLabel value="fr-starnet-monitoring" control={<Radio />} label="FR — STAR*NET monitoring" />
          </RadioGroup>
        </FormControl>
      </Stack>
      <TextField
        label="Configuration valid from (ISO UTC)"
        value={draft.validFrom}
        onChange={(e) => update({ validFrom: e.target.value })}
        helperText="Validity of version 1 — independent from the initialisation window (TIME-005/006)"
        sx={{ width: 320 }}
      />
      {draft.stationCodes.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`${draft.stationCodes.length} station(s)`} />
          <Chip size="small" label={`${summary.observations} raw observations`} />
          <Chip size="small" label={`${summary.targets} targets`} />
          <Chip size="small" label={`last observation ${summary.last ?? '—'}`} />
          <Chip size="small" label="variables: Hz, Vz, Sd (+T/P where present)" />
        </Stack>
      )}
      <Alert severity="info" variant="outlined">
        Changing the preset rebuilds editable proposals for the selected BTM stations. It clears confirmed shared points,
        initial coordinates and the test epoch; it never invents database data.
      </Alert>
    </Stack>
  );
}

// ------------------------------------------------------------------ step 2: Stations

function useCatalogue() {
  return useQuery({
    queryKey: ['catalogue'],
    queryFn: () => api<{ stations: CatalogueStation[]; references: CatalogueReference[]; lateDataDelivered: boolean }>('GET', '/api/v2/catalogue'),
  });
}

function StationsStep({ draft, setDraft, onError }: { draft: WizardDraft; setDraft: (d: WizardDraft) => void; onError: (m: string) => void }) {
  const catalogue = useCatalogue();
  const queryClient = useQueryClient();
  const select = useMutation({
    mutationFn: (stationCodes: string[]) => api<WizardDraft>('POST', `/api/v2/drafts/${draft.id}/stations`, { stationCodes }),
    onSuccess: (next) => {
      setDraft(next);
      queryClient.invalidateQueries({ queryKey: ['draft', draft.id] });
    },
    onError: (e) => onError(String(e)),
  });
  const toggle = (code: string) => {
    const selected = draft.stationCodes.includes(code)
      ? draft.stationCodes.filter((c) => c !== code)
      : draft.scope === 'single-station'
        ? [code]
        : [...draft.stationCodes, code];
    select.mutate(selected);
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Stations</Typography>
      <Typography variant="body2" color="text.secondary">
        {draft.scope === 'single-station'
          ? 'Select exactly one station available in BTM.'
          : 'Select at least two stations forming ONE connected network — independent groups belong in separate processings (PROC-004/005).'}
      </Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Station</TableCell>
              <TableCell>Dataset</TableCell>
              <TableCell align="right">Observed targets</TableCell>
              <TableCell>Last observation</TableCell>
              <TableCell align="right">Cycle (min)</TableCell>
              <TableCell>T/P variables</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(catalogue.data?.stations ?? []).map((s) => (
              <TableRow key={s.stationCode} hover selected={draft.stationCodes.includes(s.stationCode)}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={draft.stationCodes.includes(s.stationCode)}
                    onChange={() => toggle(s.stationCode)}
                    inputProps={{ 'aria-label': `Select ${s.stationCode}` }}
                  />
                </TableCell>
                <TableCell>{s.stationCode}</TableCell>
                <TableCell>{s.datasetLabel}</TableCell>
                <TableCell align="right">{s.targetCount}</TableCell>
                <TableCell>{s.lastEpoch}</TableCell>
                <TableCell align="right">{s.estimatedCycleMinutes}</TableCell>
                <TableCell>{s.hasEnvironmentVariables ? `T:${s.temperatureVariableId} P:${s.pressureVariableId}` : 'none'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
      {draft.stationCodes.length > 0 && (
        <Alert severity="success">
          {draft.stationCodes.length} station(s) selected · {draft.targets.length} targets proposed for review in step 4.
        </Alert>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 3: Instruments

function InstrumentsStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const catalogue = useCatalogue();
  const stationInfo = new Map((catalogue.data?.stations ?? []).map((station) => [station.stationCode, station]));
  const patchStation = (code: string, patch: Partial<WizardDraft['stations'][number]>) =>
    update({ stations: draft.stations.map((s) => (s.stationCode === code ? { ...s, ...patch } : s)) });
  const patchPolicy = (code: string, patch: Partial<WizardDraft['stations'][number]['atmosphericPolicy']>) =>
    update({
      stations: draft.stations.map((s) => (s.stationCode === code ? { ...s, atmosphericPolicy: { ...s.atmosphericPolicy, ...patch } } : s)),
    });
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Instruments</Typography>
      <Typography variant="body2" color="text.secondary">
        Station-level properties only. EDM mode, reflector and constants are resolved per station × target in step 4 — never a
        global station authority (MEAS-002/003).
      </Typography>
      {draft.stations.map((s) => {
        const counts = draft.targets.filter((t) => t.stationCode === s.stationCode);
        const info = stationInfo.get(s.stationCode);
        const usesEnvironment = s.atmosphericPolicy.mode === 'cycle-temperature-pressure' || s.atmosphericPolicy.mode === 'fixed-temperature-pressure';
        return (
          <Paper key={s.stationCode} variant="outlined" sx={{ p: 2 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
                  {s.stationCode}
                </Typography>
                <Chip size="small" label={`instrument: ${s.instrumentTemplateId}`} />
                <Chip size="small" label={`${counts.filter((t) => t.measurementType === 'prism').length} prism · ${counts.filter((t) => t.measurementType === 'reflective-sheet').length} sheet · ${counts.filter((t) => t.measurementType === 'reflectorless').length} reflectorless`} />
              </Stack>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
                <UnitField label="Instrument height" unit="m" value={s.instrumentHeightM} onChange={(v) => patchStation(s.stationCode, { instrumentHeightM: v })} />
                <FormControl size="small" sx={{ minWidth: 300 }}>
                  <InputLabel id={`atmo-${s.stationCode}`}>Atmospheric correction</InputLabel>
                  <Select
                    labelId={`atmo-${s.stationCode}`}
                    label="Atmospheric correction"
                    value={s.atmosphericPolicy.mode}
                    onChange={(e) => patchPolicy(s.stationCode, { mode: e.target.value as typeof s.atmosphericPolicy.mode })}
                  >
                    <MenuItem value="already-applied">Already applied by the station</MenuItem>
                    <MenuItem value="cycle-temperature-pressure">BTM — cycle temperature and pressure</MenuItem>
                    <MenuItem value="fixed-temperature-pressure">BTM — fixed temperature and pressure</MenuItem>
                    <MenuItem value="none">No atmospheric correction</MenuItem>
                  </Select>
                </FormControl>
                {usesEnvironment && (
                  <FormControl size="small" sx={{ minWidth: 280 }}>
                    <InputLabel id={`missing-${s.stationCode}`}>If T/P missing or invalid</InputLabel>
                    <Select
                      labelId={`missing-${s.stationCode}`}
                      label="If T/P missing or invalid"
                      value={s.atmosphericPolicy.missingPolicy}
                      onChange={(e) => patchPolicy(s.stationCode, { missingPolicy: e.target.value as typeof s.atmosphericPolicy.missingPolicy })}
                    >
                      <MenuItem value="wait-or-fail">Wait / fail this slot</MenuItem>
                      <MenuItem value="fixed-fallback">Use fixed fallback T/P</MenuItem>
                      <MenuItem value="continue-without-correction">Continue without correction</MenuItem>
                      <MenuItem value="assume-already-corrected">Assume already corrected</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Stack>
              {s.atmosphericPolicy.mode === 'cycle-temperature-pressure' && (
                <Alert severity={info?.hasEnvironmentVariables ? 'success' : 'warning'} variant="outlined" sx={{ py: 0 }}>
                  {info?.hasEnvironmentVariables
                    ? `BTM raw_data mapping: temperature variable ${info.temperatureVariableId} · pressure variable ${info.pressureVariableId}. Values are resolved for each station cycle.`
                    : 'No mapped temperature/pressure variables are available for this station; the missing-data policy will apply.'}
                </Alert>
              )}
              {s.atmosphericPolicy.mode === 'fixed-temperature-pressure' && (
                <Stack direction="row" spacing={2}>
                  <UnitField label="Fixed temperature" unit="°C" value={s.atmosphericPolicy.fixedTemperatureC ?? 12} onChange={(v) => patchPolicy(s.stationCode, { fixedTemperatureC: v })} step={0.1} />
                  <UnitField label="Fixed pressure" unit="hPa" value={s.atmosphericPolicy.fixedPressureHPa ?? 1013.25} onChange={(v) => patchPolicy(s.stationCode, { fixedPressureHPa: v })} step={0.1} />
                </Stack>
              )}
              {usesEnvironment && s.atmosphericPolicy.missingPolicy === 'fixed-fallback' && (
                <Stack direction="row" spacing={2}>
                  <UnitField label="Fallback temperature" unit="°C" value={s.atmosphericPolicy.fallbackTemperatureC ?? 12} onChange={(v) => patchPolicy(s.stationCode, { fallbackTemperatureC: v })} step={0.1} />
                  <UnitField label="Fallback pressure" unit="hPa" value={s.atmosphericPolicy.fallbackPressureHPa ?? 1013.25} onChange={(v) => patchPolicy(s.stationCode, { fallbackPressureHPa: v })} step={0.1} />
                  <FormControlLabel
                    control={<Switch checked={s.atmosphericPolicy.marksResultProvisional} onChange={(e) => patchPolicy(s.stationCode, { marksResultProvisional: e.target.checked })} />}
                    label="Mark result provisional"
                  />
                </Stack>
              )}
              <AdvancedSection title="Correction formula and run behaviour">
                <Stack spacing={1}>
                  {usesEnvironment ? (
                    <Typography variant="body2">
                      Formula: <code>{s.atmosphericPolicy.formulaId}</code> v{s.atmosphericPolicy.formulaVersion} — ppm = 281.8 − 0.29065 ×
                      P / (1 + T/273.15); corrected Sd = Sd after reflector × (1 + ppm×10⁻⁶). This is not STAR*NET <code>.SCALE</code>.
                    </Typography>
                  ) : (
                    <Typography variant="body2">No BTM atmospheric factor is applied in this mode.</Typography>
                  )}
                  <FormControlLabel
                    control={<Switch checked={s.required} onChange={(e) => patchStation(s.stationCode, { required: e.target.checked })} />}
                    label="Station required for a network run (RUN-006)"
                  />
                  <FormControlLabel
                    control={<Switch checked={s.atmosphericPolicy.catchUpOnLateData} onChange={(e) => patchPolicy(s.stationCode, { catchUpOnLateData: e.target.checked })} />}
                    label="Catch-up when late T/P arrives (ATMO-005)"
                  />
                </Stack>
              </AdvancedSection>
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 4: Targets

function TargetsStep({ draft, update, onError }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void; onError: (m: string) => void }) {
  const targetsQuery = useQuery({
    queryKey: ['targets', draft.stationCodes.join(',')],
    queryFn: () => api<CatalogueTarget[]>('GET', `/api/v2/catalogue/targets/${draft.stationCodes.join(',')}`),
    enabled: draft.stationCodes.length > 0,
  });
  const infoByKey = useMemo(
    () => new Map((targetsQuery.data ?? []).map((t) => [`${t.stationCode}|${t.rawTargetName}`, t])),
    [targetsQuery.data],
  );
  const [filter, setFilter] = useState('');
  const patchTarget = (index: number, patch: Partial<WizardDraft['targets'][number]>) => {
    const targets = draft.targets.map((t, i) => (i === index ? { ...t, ...patch } : t));
    update({ targets });
  };
  const visible = draft.targets
    .map((t, index) => ({ t, index }))
    .filter(({ t }) => !filter || t.rawTargetName.toLowerCase().includes(filter.toLowerCase()) || t.stationCode.toLowerCase().includes(filter.toLowerCase()));
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Targets & Measurements</Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <TextField size="small" label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Chip size="small" label={`${draft.targets.length} targets · ${draft.targets.filter((t) => t.includeInAdjustment).length} included · ${draft.targets.filter((t) => t.publishOutput).length} published`} />
      </Stack>
      <Box sx={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <Table size="small" stickyHeader>
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
            {visible.map(({ t, index }) => {
              const info = infoByKey.get(`${t.stationCode}|${t.rawTargetName}`);
              const delta = t.measurementType === 'reflectorless' ? 0 : (t.requiredConstantM - t.alreadyAppliedConstantM) * 1000;
              return (
                <TableRow key={`${t.stationCode}|${t.rawTargetName}`} hover>
                  <TableCell>{t.stationCode}</TableCell>
                  <TableCell>
                    {t.rawTargetName}
                    <Typography variant="caption" display="block" color="text.secondary">
                      {info ? `${info.hzVariableId}/${info.vzVariableId}/${info.sdVariableId} · sensor ${info.prismSensorId}` : '…'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Select size="small" variant="standard" value={t.role} onChange={(e) => patchTarget(index, { role: e.target.value as typeof t.role })}>
                      <MenuItem value="reference">reference</MenuItem>
                      <MenuItem value="monitoring">monitoring</MenuItem>
                      <MenuItem value="auxiliary">auxiliary</MenuItem>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      size="small"
                      variant="standard"
                      value={t.measurementType}
                      onChange={(e) => {
                        const measurementType = e.target.value as typeof t.measurementType;
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
                    <Select size="small" variant="standard" value={t.edmMode} onChange={(e) => patchTarget(index, { edmMode: e.target.value })}>
                      {t.measurementType === 'reflectorless' ? [
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
                    {t.measurementType === 'reflectorless' ? (
                      '—'
                    ) : (
                      <TextField size="small" variant="standard" type="number" value={t.requiredConstantM * 1000} onChange={(e) => patchTarget(index, { requiredConstantM: Number(e.target.value) / 1000 })} sx={{ width: 70 }} inputProps={{ step: 0.1, 'aria-label': `required constant ${t.rawTargetName}` }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {t.measurementType === 'reflectorless' ? (
                      '—'
                    ) : (
                      <TextField size="small" variant="standard" type="number" value={t.alreadyAppliedConstantM * 1000} onChange={(e) => patchTarget(index, { alreadyAppliedConstantM: Number(e.target.value) / 1000 })} sx={{ width: 70 }} inputProps={{ step: 0.1 }} />
                    )}
                  </TableCell>
                  <TableCell align="right">{delta.toFixed(1)}</TableCell>
                  <TableCell align="right">{t.targetHeightM.toFixed(3)}</TableCell>
                  <TableCell>
                    <TextField size="small" variant="standard" value={t.engineName} onChange={(e) => patchTarget(index, { engineName: e.target.value })} sx={{ width: 130 }} />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <Checkbox checked={t.includeInAdjustment} onChange={(e) => patchTarget(index, { includeInAdjustment: e.target.checked })} />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <Checkbox checked={t.publishOutput} onChange={(e) => patchTarget(index, { publishOutput: e.target.checked })} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Δ = required − already applied (CORR-002); reflectorless has no constant (CORR-009); a sheet keeps its own setup
        (MEAS-007). Sources: Lookup metadata → preset template → your overrides (MEAS-004/005).
      </Typography>
      {draft.scope === 'network' && <CommonPointsPanel draft={draft} update={update} onError={onError} />}
    </Stack>
  );
}

function CommonPointsPanel({ draft, update, onError }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void; onError: (m: string) => void }) {
  const [stationA, setStationA] = useState(draft.stationCodes[0] ?? '');
  const [stationB, setStationB] = useState(draft.stationCodes[1] ?? '');
  const [seedA1, setSeedA1] = useState('');
  const [seedB1, setSeedB1] = useState('');
  const [seedA2, setSeedA2] = useState('');
  const [seedB2, setSeedB2] = useState('');
  const [check, setCheck] = useState<GeometryCheck>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const runCheck = useMutation({
    mutationFn: () =>
      api<GeometryCheck>('POST', `/api/v2/drafts/${draft.id}/geometry-check`, {
        stationA,
        stationB,
        seeds: [
          { aTargetKey: seedA1, bTargetKey: seedB1 },
          { aTargetKey: seedA2, bTargetKey: seedB2 },
        ].filter((s) => s.aTargetKey && s.bTargetKey),
      }),
    onSuccess: (result) => {
      setCheck(result);
      setSelected(new Set()); // candidates are NEVER pre-confirmed (POINT-011)
    },
    onError: (e) => onError(String(e)),
  });
  const confirm = () => {
    const chosen = (check?.candidates ?? []).filter((c) => selected.has(`${c.aTargetKey}|${c.bTargetKey}`));
    const existing = draft.sharedPoints.length;
    update({
      sharedPoints: [
        ...draft.sharedPoints,
        ...chosen.map((c, i) => ({
          key: `SP_${existing + i + 1}`,
          members: [
            { stationCode: stationA, rawTargetName: c.aTargetKey },
            { stationCode: stationB, rawTargetName: c.bTargetKey },
          ],
          source: 'geometry-confirmed' as const,
        })),
      ],
    });
    setCheck(undefined);
  };
  const targetsFor = (code: string) => draft.targets.filter((t) => t.stationCode === code).map((t) => t.rawTargetName);
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
          Common physical points (network)
        </Typography>
        {draft.sharedPoints.length === 0 && (
          <Alert severity="info">
            No shared physical point confirmed yet. Targets remain distinct until you confirm a relationship (POINT-001/002 —
            identical names prove nothing).
          </Alert>
        )}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Select size="small" value={stationA} onChange={(e) => setStationA(e.target.value)} aria-label="Station A">
            {draft.stationCodes.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
          <Select size="small" value={stationB} onChange={(e) => setStationB(e.target.value)} aria-label="Station B">
            {draft.stationCodes.map((c) => (
              <MenuItem key={c} value={c}>
                {c}
              </MenuItem>
            ))}
          </Select>
          {[
            { a: seedA1, sa: setSeedA1, b: seedB1, sb: setSeedB1, n: 1 },
            { a: seedA2, sa: setSeedA2, b: seedB2, sb: setSeedB2, n: 2 },
          ].map(({ a, sa, b, sb, n }) => (
            <Stack key={n} direction="row" spacing={0.5} alignItems="center">
              <Select size="small" displayEmpty value={a} onChange={(e) => sa(e.target.value)} aria-label={`Seed ${n} on ${stationA}`}>
                <MenuItem value="">seed {n} · A…</MenuItem>
                {targetsFor(stationA).map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
              <Typography variant="body2">↔</Typography>
              <Select size="small" displayEmpty value={b} onChange={(e) => sb(e.target.value)} aria-label={`Seed ${n} on ${stationB}`}>
                <MenuItem value="">B…</MenuItem>
                {targetsFor(stationB).map((t) => (
                  <MenuItem key={t} value={t}>
                    {t}
                  </MenuItem>
                ))}
              </Select>
            </Stack>
          ))}
          <Button variant="contained" onClick={() => runCheck.mutate()} disabled={runCheck.isPending}>
            Check common points
          </Button>
        </Stack>
        {check && (
          <Stack spacing={1}>
            <Alert severity={check.status === 'ready' ? 'success' : check.status === 'weak' ? 'warning' : 'error'}>
              {check.status === 'weak' && <b>Weak geometry — </b>}
              {check.message}
            </Alert>
            {check.candidates.length > 0 && (
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Use</TableCell>
                      <TableCell>{stationA} target</TableCell>
                      <TableCell>{stationB} target</TableCell>
                      <TableCell align="right">H residual (mm)</TableCell>
                      <TableCell align="right">V residual (mm)</TableCell>
                      <TableCell align="right">3D residual (mm)</TableCell>
                      <TableCell align="right">Confidence</TableCell>
                      <TableCell>Evidence</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {check.candidates.map((c) => {
                      const key = `${c.aTargetKey}|${c.bTargetKey}`;
                      return (
                        <TableRow key={key}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selected.has(key)}
                              onChange={(e) => {
                                const next = new Set(selected);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                setSelected(next);
                              }}
                              inputProps={{ 'aria-label': `Confirm ${key}` }}
                            />
                          </TableCell>
                          <TableCell>{c.aTargetKey}</TableCell>
                          <TableCell>{c.bTargetKey}</TableCell>
                          <TableCell align="right">{(c.horizontalResidualM * 1000).toFixed(1)}</TableCell>
                          <TableCell align="right">{(c.verticalResidualM * 1000).toFixed(1)}</TableCell>
                          <TableCell align="right">{(c.residual3dM * 1000).toFixed(1)}</TableCell>
                          <TableCell align="right">{Math.round(c.confidence * 100)}%</TableCell>
                          <TableCell>{c.seed ? 'Manual seed' : 'Geometry candidate'}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
            <Button variant="contained" onClick={confirm} disabled={selected.size === 0}>
              Confirm {selected.size} selected pair(s)
            </Button>
          </Stack>
        )}
        {draft.sharedPoints.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="body2" fontWeight={600}>
              Shared physical points (confirmed) — individual targets stay out of this table (POINT-012)
            </Typography>
            {draft.sharedPoints.map((s) => (
              <Stack key={s.key} direction="row" spacing={1} alignItems="center">
                <Chip size="small" label={s.key} />
                <Typography variant="body2">{s.members.map((m) => `${m.stationCode}/${m.rawTargetName}`).join(' = ')}</Typography>
                <Chip size="small" variant="outlined" label={s.source} />
                <Button size="small" onClick={() => update({ sharedPoints: draft.sharedPoints.filter((x) => x.key !== s.key) })}>
                  Remove
                </Button>
              </Stack>
            ))}
          </Stack>
        )}
        <ConnectivityBadges draft={draft} />
      </Stack>
    </Paper>
  );
}

function ConnectivityBadges({ draft }: { draft: WizardDraft }) {
  const connectivity = useQuery({
    queryKey: ['connectivity', draft.id, draft.sharedPoints.length],
    queryFn: () => api<{ a: string; b: string; sharedPoints: number; status: string }[]>('GET', `/api/v2/drafts/${draft.id}/connectivity`),
    enabled: draft.scope === 'network',
  });
  if (!connectivity.data?.length) return null;
  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {connectivity.data.map((p) => (
        <Stack key={`${p.a}-${p.b}`} direction="row" spacing={0.5} alignItems="center">
          <Typography variant="body2">
            {p.a}↔{p.b} ({p.sharedPoints} shared):
          </Typography>
          <StatusChip status={p.status} />
        </Stack>
      ))}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 5: Initialisation

function InitialisationStep({
  draft,
  setDraft,
  update,
  onError,
}: {
  draft: WizardDraft;
  setDraft: (d: WizardDraft) => void;
  update: (p: Partial<WizardDraft>) => void;
  onError: (m: string) => void;
}) {
  const catalogue = useCatalogue();
  const compute = useMutation({
    mutationFn: () => api<WizardDraft['initialisation']['result']>('POST', `/api/v2/drafts/${draft.id}/initialisation/compute`),
    onSuccess: (result) => setDraft({ ...draft, initialisation: { ...draft.initialisation, result } }),
    onError: (e) => onError(String(e)),
  });
  const init = draft.initialisation;
  const patchInit = (patch: Partial<WizardDraft['initialisation']>) => update({ initialisation: { ...init, ...patch, result: patch.result ?? undefined } });
  const availableRefs = (catalogue.data?.references ?? []).filter((r) =>
    draft.targets.some((t) => t.rawTargetName === r.pointName && draft.stationCodes.includes(t.stationCode)),
  );
  const addReference = (r: CatalogueReference) => {
    const target = draft.targets.find((t) => t.rawTargetName === r.pointName);
    if (!target) return;
    patchInit({
      references: [
        ...init.references,
        {
          pointKey: target.engineName,
          eastingM: r.eastingM,
          northingM: r.northingM,
          heightM: r.heightM,
          modeE: 'weak',
          modeN: 'weak',
          modeH: 'weak',
          sigmaM: r.sigmaM,
          source: `Provided with dataset (${r.datasetId})`,
        },
      ],
    });
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Initialisation</Typography>
      <RadioGroup row value={init.mode} onChange={(e) => patchInit({ mode: e.target.value as typeof init.mode })}>
        <FormControlLabel value="local-anchor" control={<Radio />} label="No coordinates — fix one station (default)" />
        <FormControlLabel value="known-references" control={<Radio />} label="Use known reference coordinates" />
      </RadioGroup>
      {init.mode === 'local-anchor' ? (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="anchor-station">Anchor station</InputLabel>
            <Select labelId="anchor-station" label="Anchor station" value={init.anchorStationCode ?? ''} onChange={(e) => patchInit({ anchorStationCode: e.target.value })}>
              {draft.stationCodes.map((c) => (
                <MenuItem key={c} value={c}>
                  {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <UnitField label="Easting" unit="m" value={init.anchorEastingM} onChange={(v) => patchInit({ anchorEastingM: v })} />
          <UnitField label="Northing" unit="m" value={init.anchorNorthingM} onChange={(v) => patchInit({ anchorNorthingM: v })} />
          <UnitField label="Height" unit="m" value={init.anchorHeightM} onChange={(v) => patchInit({ anchorHeightM: v })} />
          <UnitField label="Orientation" unit="°" value={init.anchorOrientationDeg} onChange={(v) => patchInit({ anchorOrientationDeg: v })} step={0.0001} />
          <Chip size="small" label="0/0/0/0 is valid for a local frame (INIT-002)" variant="outlined" />
        </Stack>
      ) : (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Only coordinates genuinely provided with the dataset are offered — nothing is prefilled from fixtures (INIT-003).
            CSV import of reference coordinates is planned for a later milestone; manual selection below is fully functional.
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {availableRefs.map((r) => {
              const used = init.references.some((x) => x.pointKey === draft.targets.find((t) => t.rawTargetName === r.pointName)?.engineName);
              return (
                <Chip
                  key={r.pointName}
                  label={`${r.pointName} (σ ${(r.sigmaM * 1000).toFixed(1)} mm)`}
                  color={used ? 'success' : 'default'}
                  onClick={() => !used && addReference(r)}
                  onDelete={used ? () => patchInit({ references: init.references.filter((x) => x.pointKey !== draft.targets.find((t) => t.rawTargetName === r.pointName)?.engineName) }) : undefined}
                />
              );
            })}
          </Stack>
          {init.references.length > 0 && (
            <Typography variant="caption">
              {init.references.length} reference(s) selected — components weak with the provided sigmas (INIT-004: fixed/weak/free
              editable per component in Administration).
            </Typography>
          )}
        </Stack>
      )}
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Observation window from (ISO UTC)" value={init.windowFrom} onChange={(e) => patchInit({ windowFrom: e.target.value })} sx={{ width: 280 }} />
        <TextField size="small" label="to" value={init.windowTo} onChange={(e) => patchInit({ windowTo: e.target.value })} sx={{ width: 280 }} />
        <Button variant="contained" onClick={() => compute.mutate()} disabled={compute.isPending} data-testid="compute-initialisation">
          {compute.isPending ? 'Computing…' : 'Compute initial coordinates'}
        </Button>
      </Stack>
      <Alert severity="info" variant="outlined">
        This period selects the observations used to estimate initial coordinates (median of Hz, Vz and corrected Sd —
        INIT-005). It does not define coordinate validity; validity follows the configuration version (TIME-005).
      </Alert>
      {init.result && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" color="info" label={`pairs ${init.result.coverage.availableStationTargetPairs}/${init.result.coverage.expectedStationTargetPairs}`} />
            <Chip size="small" color="info" label={`points ${init.result.coverage.availablePhysicalPoints}/${init.result.coverage.expectedPhysicalPoints}`} />
            <Chip size="small" label={`${init.result.coverage.observationsUsed} raw obs · ${init.result.coverage.representativeCount} medians`} />
            <Chip size="small" label={`retained ${init.result.coverage.retainedFrom ?? '—'} → ${init.result.coverage.retainedTo ?? '—'}`} />
          </Stack>
          {init.result.coverage.missingStationTargets.length > 0 && (
            <Alert severity="warning">Missing pairs: {init.result.coverage.missingStationTargets.join(', ')}</Alert>
          )}
          {init.result.failures.map((f) => (
            <Alert key={f.subject} severity="error">
              {f.reason}
            </Alert>
          ))}
          {init.result.stationSolutions.map((s) => (
            <Typography key={s.stationCode} variant="body2">
              <b>{s.stationCode}</b>: E {s.eastingM.toFixed(4)} m · N {s.northingM.toFixed(4)} m · H {s.heightM.toFixed(4)} m ·
              orientation {s.orientationDeg.toFixed(4)}° ({s.source}){s.problems.length > 0 ? ` — ${s.problems.join('; ')}` : ''}
            </Typography>
          ))}
          <Box sx={{ overflowX: 'auto', maxHeight: 260, overflowY: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Point</TableCell>
                  <TableCell align="right">E (m)</TableCell>
                  <TableCell align="right">N (m)</TableCell>
                  <TableCell align="right">H (m)</TableCell>
                  <TableCell align="right">Stations</TableCell>
                  <TableCell align="right">Obs</TableCell>
                  <TableCell align="right">Spread H (mm)</TableCell>
                  <TableCell align="right">Spread V (mm)</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {init.result.coordinates.map((c) => (
                  <TableRow key={c.pointKey}>
                    <TableCell>{c.pointKey}</TableCell>
                    <TableCell align="right">{c.eastingM.toFixed(4)}</TableCell>
                    <TableCell align="right">{c.northingM.toFixed(4)}</TableCell>
                    <TableCell align="right">{c.heightM.toFixed(4)}</TableCell>
                    <TableCell align="right">{c.stationCount}</TableCell>
                    <TableCell align="right">{c.observationCount}</TableCell>
                    <TableCell align="right">{(c.horizontalSpreadM * 1000).toFixed(1)}</TableCell>
                    <TableCell align="right">{(c.verticalSpreadM * 1000).toFixed(1)}</TableCell>
                    <TableCell>
                      <StatusChip status={c.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Button
            variant="contained"
            color="success"
            disabled={init.result.accepted || init.result.failures.length > 0}
            onClick={() => patchInit({ result: { ...init.result!, accepted: true } })}
            data-testid="use-as-initial"
          >
            {init.result.accepted ? 'Initial coordinates accepted' : 'Use as initial coordinates'}
          </Button>
        </Stack>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 6: Adjustment

function AdjustmentStep({
  draft,
  update,
  setDraft,
  onError,
}: {
  draft: WizardDraft;
  update: (p: Partial<WizardDraft>) => void;
  setDraft: (d: WizardDraft) => void;
  onError: (m: string) => void;
}) {
  const a = draft.adjustment;
  const patch = (p: Partial<typeof a>) => update({ adjustment: { ...a, ...p } });
  const patchWeights = (p: Partial<typeof a.defaultWeights>) => patch({ defaultWeights: { ...a.defaultWeights, ...p } });
  const slotsQuery = useQuery({ queryKey: ['slots', draft.id], queryFn: () => api<string[]>('GET', `/api/v2/drafts/${draft.id}/slots`) });
  const [slot, setSlot] = useState('');
  const [result, setResult] = useState<TestEpochResult>();
  const [tab, setTab] = useState<'diagnostic' | 'dat' | 'snproj'>('diagnostic');
  const test = useMutation({
    mutationFn: () => api<TestEpochResult>('POST', `/api/v2/drafts/${draft.id}/test-epoch`, { slot }),
    onSuccess: (r) => {
      setResult(r);
      setDraft({ ...draft, testEpochPassed: r.diagnostic.ok && r.blocking.length === 0 });
    },
    onError: (e) => onError(String(e)),
  });
  const slots = slotsQuery.data ?? [];
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Adjustment (STAR*NET parameters only)</Typography>
      {draft.weightsRequireValidation && (
        <Alert severity="warning">
          <Stack spacing={0.5}>
            <span>FR weights and centrings are editable Topcon proposals, not a national standard. Review them before activation.</span>
            <FormControlLabel
              control={<Checkbox size="small" onChange={(event) => event.target.checked && update({ weightsRequireValidation: false })} />}
              label="I reviewed and accept these weights for this configuration version"
            />
          </Stack>
        </Alert>
      )}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip size="small" label={`template ${a.templateId} v${a.templateVersion}`} />
        <Chip size="small" label={`${a.adjustmentType} · ${a.linearUnits} · ${a.angleOutputUnits} · ${a.localOrGrid} · ${a.coordinateOrder} · ${a.input3dMode}`} />
      </Stack>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        <TextField size="small" label="Converge limit (unitless)" type="number" value={a.convergeLimit} onChange={(e) => patch({ convergeLimit: Number(e.target.value) })} inputProps={{ step: 0.001 }} helperText="STAR*NET threshold — not the demo solver's (ADJ-002)" />
        <TextField size="small" label="Max solution iterations" type="number" value={a.maximumIterations} onChange={(e) => patch({ maximumIterations: Number(e.target.value) })} />
        <TextField size="small" label="χ² significance (%)" type="number" value={a.chiSquareSignificancePercent} onChange={(e) => patch({ chiSquareSignificancePercent: Number(e.target.value) })} error={a.chiSquareSignificancePercent <= 0 || a.chiSquareSignificancePercent >= 100} helperText="Strictly between 0 and 100" inputProps={{ min: 0.001, max: 99.999 }} />
        <TextField size="small" label="Ellipse confidence (%)" type="number" value={a.ellipseConfidencePercent} onChange={(e) => patch({ ellipseConfidencePercent: Number(e.target.value) })} error={a.ellipseConfidencePercent <= 0 || a.ellipseConfidencePercent >= 100} helperText="Strictly between 0 and 100" inputProps={{ min: 0.001, max: 99.999 }} />
        <FormControlLabel control={<Switch checked={a.performErrorPropagation} onChange={(e) => patch({ performErrorPropagation: e.target.checked })} />} label="Error propagation" />
      </Stack>
      <FormControl size="small" sx={{ maxWidth: 420 }}>
        <InputLabel id="chi-policy">If χ² fails</InputLabel>
        <Select labelId="chi-policy" label="If χ² fails" value={draft.chiSquareFailurePolicy} onChange={(e) => update({ chiSquareFailurePolicy: e.target.value as WizardDraft['chiSquareFailurePolicy'] })}>
          <MenuItem value="fail-run">Fail run and do not publish</MenuItem>
          <MenuItem value="auto-adjust">Run STAR*NET Auto Adjust</MenuItem>
          <MenuItem value="publish-failed-qc">Publish with failed-QC status (explicitly allowed)</MenuItem>
        </Select>
      </FormControl>
      <AdvancedSection>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <UnitField label="Scale/datum factor" unit="—" value={a.scaleFactor} onChange={(v) => patch({ scaleFactor: v })} step={0.00000001} width={200} />
            <UnitField label="Earth radius" unit="m" value={a.earthRadiusM} onChange={(v) => patch({ earthRadiusM: v })} step={1000} width={200} />
            <UnitField label="Refraction coefficient" unit="—" value={a.indexOfRefraction} onChange={(v) => patch({ indexOfRefraction: v })} step={0.01} width={200} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            .SCALE is a horizontal datum factor and the refraction coefficient corrects zenith geometry — neither replaces the
            EDM T/P correction (CORR-007/008).
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <UnitField label="Distance stderr" unit="m" value={a.defaultWeights.distanceStdErrM} onChange={(v) => patchWeights({ distanceStdErrM: v })} step={0.0001} />
            <UnitField label="Distance ppm" unit="ppm" value={a.defaultWeights.distancePpm} onChange={(v) => patchWeights({ distancePpm: v })} step={0.1} />
            <UnitField label="Angle" unit="arcsec" value={a.defaultWeights.angleArcSec} onChange={(v) => patchWeights({ angleArcSec: v })} step={0.1} />
            <UnitField label="Direction" unit="arcsec" value={a.defaultWeights.directionArcSec} onChange={(v) => patchWeights({ directionArcSec: v })} step={0.1} />
            <UnitField label="Azimuth" unit="arcsec" value={a.defaultWeights.azimuthArcSec} onChange={(v) => patchWeights({ azimuthArcSec: v })} step={0.1} />
            <UnitField label="Zenith" unit="arcsec" value={a.defaultWeights.zenithArcSec} onChange={(v) => patchWeights({ zenithArcSec: v })} step={0.1} />
            <UnitField label="Instr. centering" unit="m" value={a.defaultWeights.instrumentCenteringM} onChange={(v) => patchWeights({ instrumentCenteringM: v })} step={0.0001} />
            <UnitField label="Target centering" unit="m" value={a.defaultWeights.targetCenteringM} onChange={(v) => patchWeights({ targetCenteringM: v })} step={0.0001} />
          </Stack>
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
            <FormControlLabel control={<Switch checked={a.autoAdjust.enabled} onChange={(e) => patch({ autoAdjust: { ...a.autoAdjust, enabled: e.target.checked } })} />} label="Auto Adjust available" />
            <TextField size="small" label="Max standardized residual" type="number" value={a.autoAdjust.maxStandardizedResidual} onChange={(e) => patch({ autoAdjust: { ...a.autoAdjust, maxStandardizedResidual: Number(e.target.value) } })} />
            <TextField size="small" label="Removed per iteration" type="number" value={a.autoAdjust.outliersRemovedPerIteration} onChange={(e) => patch({ autoAdjust: { ...a.autoAdjust, outliersRemovedPerIteration: Number(e.target.value) } })} />
            <TextField size="small" label="Max Auto Adjust iterations" type="number" value={a.autoAdjust.maxIterations} onChange={(e) => patch({ autoAdjust: { ...a.autoAdjust, maxIterations: Number(e.target.value) } })} helperText="Distinct from solution iterations (ADJ-003)" />
          </Stack>
        </Stack>
      </AdvancedSection>

      <Divider />
      <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 600 }}>
        Test one epoch (demo solver — nothing is published)
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 260 }}>
          <InputLabel id="test-slot">Output slot</InputLabel>
          <Select labelId="test-slot" label="Output slot" value={slot} onChange={(e) => setSlot(e.target.value)} data-testid="test-slot-select">
            {slots.slice(-12).map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="contained" disabled={!slot || test.isPending} onClick={() => test.mutate()} data-testid="run-test-epoch">
          {test.isPending ? 'Running…' : 'Test one epoch'}
        </Button>
        {draft.testEpochPassed && <Chip color="success" size="small" label="Test epoch passed — activation unlocked" />}
      </Stack>
      {result && (
        <Stack spacing={1}>
          <Stack direction="row" spacing={1}>
            {(['diagnostic', 'dat', 'snproj'] as const).map((t) => (
              <Button key={t} size="small" variant={tab === t ? 'contained' : 'outlined'} onClick={() => setTab(t)}>
                {t === 'diagnostic' ? 'Diagnostic' : t === 'dat' ? '.dat preview' : '.snproj preview'}
              </Button>
            ))}
          </Stack>
          {tab === 'diagnostic' && (
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {result.stationEpochs.map((s) => (
                  <Chip key={s.stationCode} size="small" label={`${s.stationCode}: ${s.state}${s.ageMinutes !== undefined ? ` (${Math.round(s.ageMinutes)} min)` : ''}`} color={s.state === 'fresh' ? 'success' : s.state === 'reused' ? 'warning' : 'error'} />
                ))}
                <Chip size="small" label={`corrections: ${result.correctionSummary.nonZeroPrismDeltas} prism Δ≠0 · ${result.correctionSummary.atmosphericCorrections} atmospheric`} />
              </Stack>
              {result.blocking.map((b) => (
                <Alert key={b} severity="error">
                  {b}
                </Alert>
              ))}
              <DiagnosticPanel diagnostic={result.diagnostic} warnings={result.warnings} />
            </Stack>
          )}
          {tab !== 'diagnostic' && (
            <Box component="pre" sx={{ p: 2, bgcolor: 'grey.100', borderRadius: 1, maxHeight: 360, overflow: 'auto', fontSize: 12 }} data-testid={`preview-${tab}`}>
              {tab === 'dat' ? result.previews.dat : result.previews.snproj}
            </Box>
          )}
        </Stack>
      )}
    </Stack>
  );
}

// ------------------------------------------------------------------ step 7: Run

function RunStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const r = draft.runPolicy;
  const patch = (p: Partial<typeof r>) => update({ runPolicy: { ...r, ...p } });
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Run & synchronisation</Typography>
      <FormControl>
        <Typography variant="body2" fontWeight={600}>
          Trigger
        </Typography>
        <RadioGroup row value={r.trigger} onChange={(e) => patch({ trigger: e.target.value as typeof r.trigger })}>
          <FormControlLabel value="event-driven" control={<Radio />} label="Event-driven (default)" />
          <FormControlLabel value="schedule" control={<Radio />} label="Every X minutes" />
          <FormControlLabel value="manual" control={<Radio />} label="Manual only" />
        </RadioGroup>
      </FormControl>
      {r.trigger === 'schedule' && (
        <UnitField label="Check every" unit="min" value={r.scheduleEveryMinutes ?? 30} onChange={(v) => patch({ scheduleEveryMinutes: v })} step={5} />
      )}
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        <UnitField label="Sync tolerance" unit="min" value={r.syncToleranceMinutes} onChange={(v) => patch({ syncToleranceMinutes: v })} step={1} />
        <FormControlLabel control={<Switch checked={r.reuseMissingStation} onChange={(e) => patch({ reuseMissingStation: e.target.checked })} />} label="Reuse last epoch when missing" />
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="max-age">Max reused age</InputLabel>
          <Select labelId="max-age" label="Max reused age" value={r.maxReusedAgeMinutes} onChange={(e) => patch({ maxReusedAgeMinutes: Number(e.target.value) })}>
            {[30, 45, 60, 90].map((v) => (
              <MenuItem key={v} value={v}>
                {v} min
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControlLabel control={<Switch checked={r.markReuseProvisional} onChange={(e) => patch({ markReuseProvisional: e.target.checked })} />} label="Mark reuse provisional (RUN-005)" />
        <FormControlLabel control={<Switch checked={r.computeWithoutOptionalStations} onChange={(e) => patch({ computeWithoutOptionalStations: e.target.checked })} />} label="Compute without optional stations" />
      </Stack>
      <Alert severity="info" variant="outlined">
        Example: sources at :25/:26/:32 publish the <b>09:30</b> slot when the tolerance allows it — source timestamps stay
        unchanged (TIME-003/004).
      </Alert>
      <AdvancedSection title="Catch-up">
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
          <FormControlLabel control={<Switch checked={r.catchUp.enabled} onChange={(e) => patch({ catchUp: { ...r.catchUp, enabled: e.target.checked } })} />} label="Catch-up enabled" />
          <FormControlLabel control={<Switch checked={r.catchUp.onLateObservation} onChange={(e) => patch({ catchUp: { ...r.catchUp, onLateObservation: e.target.checked } })} />} label="On late observation" />
          <FormControlLabel control={<Switch checked={r.catchUp.onLateEnvironment} onChange={(e) => patch({ catchUp: { ...r.catchUp, onLateEnvironment: e.target.checked } })} />} label="On late T/P" />
          <UnitField label="Window" unit="h" value={r.catchUp.windowHours} onChange={(v) => patch({ catchUp: { ...r.catchUp, windowHours: v } })} step={1} width={130} />
          <TextField size="small" type="number" label="Max recalcs/slot" value={r.catchUp.maxRecalculationsPerSlot} onChange={(e) => patch({ catchUp: { ...r.catchUp, maxRecalculationsPerSlot: Number(e.target.value) } })} sx={{ width: 150 }} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          A catch-up rewrites the SAME slot by UPSERT with the configuration historically valid at that slot (TIME-008, OUT-009).
        </Typography>
      </AdvancedSection>
    </Stack>
  );
}

// ------------------------------------------------------------------ step 8: Output

function OutputStep({ draft, update }: { draft: WizardDraft; update: (p: Partial<WizardDraft>) => void }) {
  const o = draft.outputPolicy;
  const patch = (p: Partial<typeof o>) => update({ outputPolicy: { ...o, ...p } });
  const published = draft.targets.filter((t) => t.publishOutput && t.includeInAdjustment);
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Output</Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap alignItems="center">
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="interval">Output interval</InputLabel>
          <Select labelId="interval" label="Output interval" value={o.intervalMinutes} onChange={(e) => patch({ intervalMinutes: Number(e.target.value) })}>
            {[15, 30, 60].map((v) => (
              <MenuItem key={v} value={v}>
                {v} min {v === 30 ? '(:00/:30)' : ''}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <UnitField label="Max epoch→slot" unit="min" value={o.maxEpochToSlotMinutes} onChange={(v) => patch({ maxEpochToSlotMinutes: v })} step={1} width={180} />
        <FormControlLabel control={<Switch checked={o.publishProvisional} onChange={(e) => patch({ publishProvisional: e.target.checked })} />} label="Publish provisional results" />
        <Chip size="small" label="UTC grid alignment" variant="outlined" />
      </Stack>
      <Typography variant="body2">
        Stable variables created ONCE at creation and owned by the processing — a new configuration version never creates new
        variables (OUT-001/002). Recalculation replaces the same (variable, timestamp) by UPSERT (OUT-009).
      </Typography>
      <Alert severity="info">
        {published.length} published target(s) × {o.targetComponents.length} components (Adjusted/Delta/Sigma X·Y·Z, metres) +{' '}
        {o.globalComponents.length} processing-wide variables ({o.globalComponents.join(', ')}) ={' '}
        <b>{published.length * o.targetComponents.length + o.globalComponents.length} variables</b>
      </Alert>
    </Stack>
  );
}

// ------------------------------------------------------------------ step 9: Review & Create

function ReviewStep({ draft, onError, onCreated }: { draft: WizardDraft; onError: (m: string) => void; onCreated: (id: number) => void }) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (activate: boolean) =>
      api<{ processing: { id: number } }>('POST', '/api/v2/projects/1/topographic-adjustments', { draftId: draft.id, activate }),
    onSuccess: (result) => {
      queryClient.invalidateQueries();
      onCreated(result.processing.id);
    },
    onError: (e) => onError(String(e)),
  });
  const blockers: string[] = [];
  if (!draft.name.trim()) blockers.push('Processing name is required (step 1).');
  if (draft.stationCodes.length === 0) blockers.push('Select at least one station (step 2).');
  if (draft.scope === 'network' && draft.stationCodes.length < 2) blockers.push('A network needs at least two stations (PROC-004).');
  if (!draft.initialisation.result?.accepted) blockers.push('Compute and accept initial coordinates (step 5).');
  const physicalIdentities = resolveDraftPhysicalIdentities(draft);
  const engineNames = physicalIdentities.identities.map((identity) => identity.engineName);
  const collisions = draftEngineNameCollisions(draft);
  if (collisions.length > 0) blockers.push(`Engine name collision across physical points: ${collisions.join(', ')} (NAME-006 blocks Review).`);
  if (physicalIdentities.duplicateMembers.length > 0) {
    blockers.push(`Targets assigned to more than one shared point: ${physicalIdentities.duplicateMembers.join(', ')}.`);
  }
  const warnings: string[] = [];
  if (draft.weightsRequireValidation) warnings.push('FR weights are manufacturer proposals — activation blocked until validated (D-05).');
  if (!draft.testEpochPassed) warnings.push('No successful Test one epoch yet — “Create and activate” stays disabled (front/11).');
  const nonZero = draft.targets.filter((t) => t.measurementType !== 'reflectorless' && Math.abs(t.requiredConstantM - t.alreadyAppliedConstantM) > 1e-9);
  return (
    <Stack spacing={2}>
      <Typography variant="h2">Review & Create</Typography>
      {blockers.map((b) => (
        <Alert key={b} severity="error">
          {b}
        </Alert>
      ))}
      {warnings.map((w) => (
        <Alert key={w} severity="warning">
          {w}
        </Alert>
      ))}
      <Stack spacing={0.5}>
        <Typography variant="body2">
          <b>{draft.name || '(unnamed)'}</b> — {draft.scope}, preset {draft.countryPresetId}, valid from {draft.validFrom}
        </Typography>
        <Typography variant="body2">
          Stations: {draft.stationCodes.join(', ')} · {draft.targets.filter((t) => t.includeInAdjustment).length} targets included ·{' '}
          {draft.targets.filter((t) => t.publishOutput).length} published · {draft.sharedPoints.length} confirmed shared point(s)
        </Typography>
        <Typography variant="body2">
          Non-zero corrections: {nonZero.length} target(s) ({[...new Set(nonZero.map((t) => `${((t.requiredConstantM - t.alreadyAppliedConstantM) * 1000).toFixed(1)} mm`))].join(', ') || '—'})
        </Typography>
        <Typography variant="body2">
          Initialisation: {draft.initialisation.mode} · coverage{' '}
          {draft.initialisation.result
            ? `${draft.initialisation.result.coverage.availableStationTargetPairs}/${draft.initialisation.result.coverage.expectedStationTargetPairs} pairs`
            : '—'}
        </Typography>
        <Typography variant="body2">
          STAR*NET: {draft.adjustment.angleOutputUnits}, refraction {draft.adjustment.indexOfRefraction}, radius {draft.adjustment.earthRadiusM} m, converge{' '}
          {draft.adjustment.convergeLimit} (unitless), {draft.adjustment.maximumIterations} it., χ² {draft.adjustment.chiSquareSignificancePercent}% — on failure:{' '}
          {draft.chiSquareFailurePolicy}
        </Typography>
        <Typography variant="body2">
          Run: {draft.runPolicy.trigger}, tolerance {draft.runPolicy.syncToleranceMinutes} min, reuse ≤ {draft.runPolicy.maxReusedAgeMinutes} min · Output every{' '}
          {draft.outputPolicy.intervalMinutes} min
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Engine names written to the .dat: {engineNames.slice(0, 10).join(', ')}
          {engineNames.length > 10 ? ` … (+${engineNames.length - 10})` : ''}
        </Typography>
      </Stack>
      <Stack direction="row" spacing={2}>
        <Button variant="outlined" disabled={blockers.length > 0 || create.isPending} onClick={() => create.mutate(false)} data-testid="create-inactive">
          Create inactive
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={blockers.length > 0 || !draft.testEpochPassed || draft.weightsRequireValidation || create.isPending}
          onClick={() => create.mutate(true)}
          data-testid="create-activate"
        >
          Create and activate
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Creation is atomic: processing + version 1 + physical point mappings + stable output variables — nothing partial on
        failure (front/13 §Étape 9).
      </Typography>
    </Stack>
  );
}
