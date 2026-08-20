import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import { api } from '@/api/client';
import type { CatalogueReference, CatalogueStation } from '@/demo/catalogue';
import type { DraftStationConfig, WizardDraft } from '@/demo/draft';
import { StationPrecisionEditor } from '@/features/create/StationPrecisionEditor';
import { AdvancedSection, UnitField } from '@/features/shared/components';

/**
 * The instrument of each station: how high it stands, how it corrects the atmosphere, and — new
 * here — **how well it measures**.
 *
 * Precision moved to this screen because that is where it physically belongs. A distance standard
 * error is a property of an EDM and its reflector, an angular one a property of the instrument; the
 * project-wide `defaultWeights` that used to hold them could not express "this station is a Topcon
 * at 0.5″ and that one is not", and the per-family figures the FR template already declared were
 * never read. What is still resolved per station × target in step 4 is the reflector and its
 * constant (MEAS-002/003), and any sight that genuinely departs from its instrument.
 */
export function InstrumentsStep({
  draft,
  update,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
}) {
  const { t } = useTranslation();
  const catalogue = useQuery({
    queryKey: ['catalogue'],
    queryFn: () => api<{ stations: CatalogueStation[]; references: CatalogueReference[]; lateDataDelivered: boolean }>('GET', '/api/v2/catalogue'),
  });
  const stationInfo = new Map((catalogue.data?.stations ?? []).map((station) => [station.stationCode, station]));

  const patchStation = (code: string, patch: Partial<DraftStationConfig>) =>
    update({ stations: draft.stations.map((station) => (station.stationCode === code ? { ...station, ...patch } : station)) });
  const patchPolicy = (code: string, patch: Partial<DraftStationConfig['atmosphericPolicy']>) =>
    update({
      stations: draft.stations.map((station) => (station.stationCode === code
        ? { ...station, atmosphericPolicy: { ...station.atmosphericPolicy, ...patch } }
        : station)),
    });

  return (
    <Stack spacing={2}>
      <Stack spacing={0.25}>
        <Typography variant="h2">{t('wizard.instruments.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('wizard.instruments.description')}</Typography>
      </Stack>

      {draft.stations.map((station) => {
        const sights = draft.targets.filter((target) => target.stationCode === station.stationCode);
        const info = stationInfo.get(station.stationCode);
        const usesEnvironment = station.atmosphericPolicy.mode === 'cycle-temperature-pressure'
          || station.atmosphericPolicy.mode === 'fixed-temperature-pressure';
        const overrides = sights.filter((target) =>
          target.distanceStdErrMm !== undefined
          || target.distancePpm !== undefined
          || target.directionStdErrArcSec !== undefined
          || target.zenithStdErrArcSec !== undefined
          || target.distanceKind !== undefined).length;
        return (
          <Paper key={station.stationCode} variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}>
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'monospace' }}>
                  {station.stationCode}
                </Typography>
                <Chip size="small" variant="outlined" label={station.instrumentTemplateId} />
                <Chip size="small" variant="outlined" label={t('wizard.instruments.sightCount', { count: sights.length })} />
                {overrides > 0 && (
                  <Chip
                    size="small"
                    color="secondary"
                    variant="outlined"
                    label={t('wizard.instruments.overrideCount', { count: overrides })}
                    data-testid={`instrument-overrides-${station.stationCode}`}
                  />
                )}
              </Stack>

              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
                <UnitField
                  label={t('wizard.instruments.instrumentHeight')}
                  unit="m"
                  value={station.instrumentHeightM}
                  onChange={(value) => patchStation(station.stationCode, { instrumentHeightM: value })}
                />
                <FormControl size="small" sx={{ minWidth: 300 }}>
                  <InputLabel id={`atmo-${station.stationCode}`}>{t('wizard.instruments.atmospheric')}</InputLabel>
                  <Select
                    labelId={`atmo-${station.stationCode}`}
                    label={t('wizard.instruments.atmospheric')}
                    value={station.atmosphericPolicy.mode}
                    onChange={(event) => patchPolicy(station.stationCode, { mode: event.target.value as DraftStationConfig['atmosphericPolicy']['mode'] })}
                  >
                    <MenuItem value="already-applied">{t('wizard.instruments.atmoApplied')}</MenuItem>
                    <MenuItem value="cycle-temperature-pressure">{t('wizard.instruments.atmoCycle')}</MenuItem>
                    <MenuItem value="fixed-temperature-pressure">{t('wizard.instruments.atmoFixed')}</MenuItem>
                    <MenuItem value="none">{t('wizard.instruments.atmoNone')}</MenuItem>
                  </Select>
                </FormControl>
                {usesEnvironment && (
                  <FormControl size="small" sx={{ minWidth: 280 }}>
                    <InputLabel id={`missing-${station.stationCode}`}>{t('wizard.instruments.missingPolicy')}</InputLabel>
                    <Select
                      labelId={`missing-${station.stationCode}`}
                      label={t('wizard.instruments.missingPolicy')}
                      value={station.atmosphericPolicy.missingPolicy}
                      onChange={(event) => patchPolicy(station.stationCode, { missingPolicy: event.target.value as DraftStationConfig['atmosphericPolicy']['missingPolicy'] })}
                    >
                      <MenuItem value="wait-or-fail">{t('wizard.instruments.missingWait')}</MenuItem>
                      <MenuItem value="fixed-fallback">{t('wizard.instruments.missingFallback')}</MenuItem>
                      <MenuItem value="continue-without-correction">{t('wizard.instruments.missingContinue')}</MenuItem>
                      <MenuItem value="assume-already-corrected">{t('wizard.instruments.missingAssume')}</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Stack>

              <Divider flexItem />
              <StationPrecisionEditor draft={draft} station={station} update={update} />

              {station.atmosphericPolicy.mode === 'cycle-temperature-pressure' && (
                <Alert severity={info?.hasEnvironmentVariables ? 'success' : 'warning'} variant="outlined" sx={{ py: 0 }}>
                  <Typography variant="caption">
                    {info?.hasEnvironmentVariables
                      ? t('wizard.instruments.envMapped', {
                          temperature: info.temperatureVariableId,
                          pressure: info.pressureVariableId,
                        })
                      : t('wizard.instruments.envMissing')}
                  </Typography>
                </Alert>
              )}
              {station.atmosphericPolicy.mode === 'fixed-temperature-pressure' && (
                <Stack direction="row" spacing={1.5}>
                  <UnitField label={t('wizard.instruments.fixedTemperature')} unit="°C" step={0.1} value={station.atmosphericPolicy.fixedTemperatureC ?? 12} onChange={(value) => patchPolicy(station.stationCode, { fixedTemperatureC: value })} />
                  <UnitField label={t('wizard.instruments.fixedPressure')} unit="hPa" step={0.1} value={station.atmosphericPolicy.fixedPressureHPa ?? 1013.25} onChange={(value) => patchPolicy(station.stationCode, { fixedPressureHPa: value })} />
                </Stack>
              )}
              {usesEnvironment && station.atmosphericPolicy.missingPolicy === 'fixed-fallback' && (
                <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
                  <UnitField label={t('wizard.instruments.fallbackTemperature')} unit="°C" step={0.1} value={station.atmosphericPolicy.fallbackTemperatureC ?? 12} onChange={(value) => patchPolicy(station.stationCode, { fallbackTemperatureC: value })} />
                  <UnitField label={t('wizard.instruments.fallbackPressure')} unit="hPa" step={0.1} value={station.atmosphericPolicy.fallbackPressureHPa ?? 1013.25} onChange={(value) => patchPolicy(station.stationCode, { fallbackPressureHPa: value })} />
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={station.atmosphericPolicy.marksResultProvisional}
                        onChange={(event) => patchPolicy(station.stationCode, { marksResultProvisional: event.target.checked })}
                      />
                    )}
                    label={t('wizard.instruments.markProvisional')}
                  />
                </Stack>
              )}

              <AdvancedSection title={t('wizard.instruments.advanced')}>
                <Stack spacing={1}>
                  <Typography variant="body2">
                    {usesEnvironment
                      ? t('wizard.instruments.formula', {
                          id: station.atmosphericPolicy.formulaId,
                          version: station.atmosphericPolicy.formulaVersion,
                        })
                      : t('wizard.instruments.noFormula')}
                  </Typography>
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={station.required}
                        onChange={(event) => patchStation(station.stationCode, { required: event.target.checked })}
                      />
                    )}
                    label={t('wizard.instruments.required')}
                  />
                  <FormControlLabel
                    control={(
                      <Switch
                        checked={station.atmosphericPolicy.catchUpOnLateData}
                        onChange={(event) => patchPolicy(station.stationCode, { catchUpOnLateData: event.target.checked })}
                      />
                    )}
                    label={t('wizard.instruments.catchUp')}
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
