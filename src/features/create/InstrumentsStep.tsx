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
import { withAtmosphericDefaults } from '@/domain/corrections/atmosphere';
import { AtmosphericFormula } from '@/features/shared/AtmosphericFormula';
import { RuleExample } from '@/features/shared/RuleExample';
import { UnitField } from '@/features/shared/components';

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
 *
 * What this screen deliberately does NOT carry any more is **run behaviour**. Whether a station is
 * indispensable to a network run is a property of the run, not of its instrument, and it now lives
 * in the Run step next to the other missing-data rules. The atmospheric formula, on the other hand,
 * belongs here and is stated at the top of each station rather than buried in an advanced section:
 * it is what multiplies every distance the station measures.
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
  /**
   * Any change to the policy passes through `withAtmosphericDefaults`, so choosing "fixed T/P" or
   * "fixed fallback" *writes* the proposed atmosphere instead of merely displaying it. The screen
   * used to render `?? 12` over an `undefined` policy: it read as configured, and every slot failed
   * on missing T/P. A default the user can see must be a default the run has.
   */
  const patchPolicy = (code: string, patch: Partial<DraftStationConfig['atmosphericPolicy']>) =>
    update({
      stations: draft.stations.map((station) => (station.stationCode === code
        ? { ...station, atmosphericPolicy: withAtmosphericDefaults({ ...station.atmosphericPolicy, ...patch }) }
        : station)),
    });

  /**
   * The formula goes at the top of the step when every station applies the same one — the ordinary
   * case — and drops into a station's own card only when that station departs from it.
   *
   * Repeating an identical block per station cost a third of the screen to say one thing three
   * times. The signature covers the substituted values too, so two stations with different fixed
   * atmospheres are correctly treated as different.
   */
  const formulaSignature = (station: DraftStationConfig) => JSON.stringify([
    station.atmosphericPolicy.mode,
    station.atmosphericPolicy.formulaId,
    station.atmosphericPolicy.formulaVersion,
    station.atmosphericPolicy.fixedTemperatureC,
    station.atmosphericPolicy.fixedPressureHPa,
  ]);
  const signatures = new Set(draft.stations.map(formulaSignature));
  const sharedFormula = signatures.size === 1 ? draft.stations[0] : undefined;

  return (
    <Stack spacing={2}>
      <Stack spacing={0.25}>
        <Typography variant="h2">{t('wizard.instruments.title')}</Typography>
        <Typography variant="body2" color="text.secondary">{t('wizard.instruments.description')}</Typography>
      </Stack>

      {sharedFormula && <AtmosphericFormula policy={sharedFormula.atmosphericPolicy} />}

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
        const toleranceMinutes = station.atmosphericPolicy.variables?.temporalToleranceMinutes;
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

              {/* Only when this station departs from the formula stated at the top of the step. */}
              {!sharedFormula && <AtmosphericFormula policy={station.atmosphericPolicy} />}

              <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap alignItems="center">
                <UnitField
                  label={t('wizard.instruments.instrumentHeight')}
                  unit="m"
                  value={station.instrumentHeightM}
                  onChange={(value) => patchStation(station.stationCode, { instrumentHeightM: value })}
                />
                <RuleExample
                  example={(
                    <>
                      <b>Already applied</b>: the station delivers corrected distances, nothing is applied again.{' '}
                      <b>T/P of the cycle</b>: each observation is corrected with the reading nearest to it.{' '}
                      <b>Fixed T/P</b>: one atmosphere for the whole processing — a choice for a short indoor baseline, not
                      for a site that swings 20 °C over a day. <b>None</b>: distances go through untouched, which is a
                      declaration that the correction is negligible, not that it is unknown.
                    </>
                  )}
                >
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
                </RuleExample>
                {usesEnvironment && (
                  <RuleExample
                    example={(
                      <>
                        No usable T/P for a sight. <b>Wait or fail</b> stops the slot — and in a network it stops the{' '}
                        <b>whole</b> slot, not just this station. <b>Fixed fallback</b> substitutes the values below and
                        can flag the result provisional. <b>Continue without correction</b> publishes an uncorrected
                        distance. <b>Assume already corrected</b> declares the station did the work itself — the only one
                        of the four that claims something about the instrument rather than about the missing data.
                      </>
                    )}
                  >
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
                  </RuleExample>
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
              {station.atmosphericPolicy.mode === 'cycle-temperature-pressure' && toleranceMinutes !== undefined && (
                <Typography variant="caption" color="text.secondary">
                  {t('wizard.instruments.tpTolerance', { minutes: toleranceMinutes })}
                </Typography>
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
                  <RuleExample
                    example={(
                      <>
                        A sight corrected with the fallback atmosphere instead of a real reading. Marked provisional, the
                        run is listed as <i>provisional</i> and carries <code>provisional-flag = 1</code>, so nobody reads
                        a substituted atmosphere as a measured one.
                      </>
                    )}
                  >
                    <FormControlLabel
                      control={(
                        <Switch
                          checked={station.atmosphericPolicy.marksResultProvisional}
                          onChange={(event) => patchPolicy(station.stationCode, { marksResultProvisional: event.target.checked })}
                        />
                      )}
                      label={t('wizard.instruments.markProvisional')}
                    />
                  </RuleExample>
                </Stack>
              )}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );
}
