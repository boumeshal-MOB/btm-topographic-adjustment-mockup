import { useTranslation } from 'react-i18next';
import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { DraftStationConfig, WizardDraft } from '@/demo/draft';
import { draftReflectorOptions, stationInstrumentPrecision, templateStationPrecision } from '@/demo/station-precision';
import { CUSTOM_REFLECTOR_ID, matchReflector } from '@/domain/instruments/reflector-catalogue';
import type { DistanceKind, MeasurementType } from '@/domain/entities';
import {
  MEASUREMENT_FAMILIES,
  samePrecision,
  type InstrumentPrecision,
} from '@/domain/instruments/measurement-precision';
import { UnitField } from '@/features/shared/components';

/**
 * How well one station measures — the single place these numbers are owned.
 *
 * The same component is mounted by the Instruments step and by the Adjustment step, on the same
 * draft, so the two screens cannot drift: editing here is editing there. What used to make the
 * numbers untrustworthy was not their value but their address — a project-wide `defaultWeights`
 * copied onto every sight, with no way to tell a datasheet figure from a typed one. Each row now
 * says where its value comes from.
 */
export function StationPrecisionEditor({
  draft,
  station,
  update,
}: {
  draft: WizardDraft;
  station: DraftStationConfig;
  update: (patch: Partial<WizardDraft>) => void;
}) {
  const { t } = useTranslation();
  const precision = stationInstrumentPrecision(draft, station);
  const template = templateStationPrecision(draft.countryPresetId, station.instrumentTemplateId);
  const fromTemplate = !station.precisionEdited && samePrecision(precision, template);

  const patchStation = (patch: Partial<DraftStationConfig>) => update({
    stations: draft.stations.map((candidate) => candidate.stationCode === station.stationCode
      ? { ...candidate, ...patch }
      : candidate),
  });

  /** Any edit here makes the station the author of its numbers, template or not. */
  const patchPrecision = (patch: Partial<InstrumentPrecision>) =>
    patchStation({ precision: { ...precision, ...patch }, precisionEdited: true });

  const patchFamily = (family: MeasurementType, patch: Partial<{ stdErrMm: number; ppm: number }>) =>
    patchPrecision({
      distanceByFamily: {
        ...precision.distanceByFamily,
        [family]: { ...precision.distanceByFamily[family], ...patch },
      },
    });

  /**
   * One row per precision actually in play, named by the reflectors that use it.
   *
   * The table used to list the three families whatever the template held, so an FR project — whose
   * catalogue is an MPO, a PAV and a reflectorless mode — got a "reflective sheet" row with zero
   * sights and a 1 mm figure borrowed from the project weights. A number nobody chose, for a
   * reflector nobody owns.
   *
   * Rows are grouped by family rather than by reflector because that is where the precision lives:
   * an EDM has one figure with a reflector and another without, so an MPO and a PAV share theirs.
   * Showing them as two editable rows over one stored value would trade one lie for another; the row
   * names them both instead.
   */
  const sights = draft.targets.filter((target) => target.stationCode === station.stationCode);
  const reflectorsOfTemplate = draftReflectorOptions(draft.countryPresetId);
  const rows = MEASUREMENT_FAMILIES.flatMap((family) => {
    const ofFamily = sights.filter((target) => target.measurementType === family);
    if (ofFamily.length === 0) return [];
    const names = [...new Set(ofFamily.map((target) => {
      const id = matchReflector(target, reflectorsOfTemplate);
      return id === CUSTOM_REFLECTOR_ID
        ? t('wizard.precision.customReflectorRow')
        : reflectorsOfTemplate.find((option) => option.id === id)?.label
          ?? t('wizard.precision.customReflectorRow');
    }))];
    return [{ family, names, count: ofFamily.length }];
  });

  const restoreTemplate = () => patchStation({ precision: template, precisionEdited: false });

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="caption" fontWeight={800} sx={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>
          {t('wizard.precision.title')}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={fromTemplate ? 'default' : 'secondary'}
          label={t(fromTemplate ? 'wizard.precision.sourceTemplate' : 'wizard.precision.sourceStation')}
          onClick={fromTemplate ? undefined : restoreTemplate}
          data-testid={`precision-source-${station.stationCode}`}
        />
        {!fromTemplate && (
          <Typography variant="caption" color="text.secondary">{t('wizard.precision.restoreHint')}</Typography>
        )}
      </Stack>

      <Stack direction="row" spacing={1.25} flexWrap="wrap" useFlexGap alignItems="flex-start">
        <UnitField
          label={t('wizard.precision.sigmaHz')}
          unit="″"
          width={132}
          step={0.05}
          value={precision.directionArcSec}
          onChange={(value) => patchPrecision({ directionArcSec: value })}
        />
        <UnitField
          label={t('wizard.precision.sigmaVz')}
          unit="″"
          width={132}
          step={0.05}
          value={precision.zenithArcSec}
          onChange={(value) => patchPrecision({ zenithArcSec: value })}
        />
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <InputLabel id={`distance-kind-${station.stationCode}`}>{t('wizard.precision.distanceKind')}</InputLabel>
          <Select
            labelId={`distance-kind-${station.stationCode}`}
            label={t('wizard.precision.distanceKind')}
            value={precision.distanceKind}
            onChange={(event) => patchPrecision({ distanceKind: event.target.value as DistanceKind })}
            inputProps={{ 'aria-label': `${t('wizard.precision.distanceKind')} ${station.stationCode}` }}
          >
            <MenuItem value="slope">{t('enums.distanceKind.slope')}</MenuItem>
            <MenuItem value="horizontal">{t('enums.distanceKind.horizontal')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {rows.length === 0 ? (
        <Typography variant="caption" color="text.secondary">{t('wizard.precision.notSighted')}</Typography>
      ) : (
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
        <Table size="small" aria-label={t('wizard.precision.distanceTable', { station: station.stationCode })}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: 'grey.50', fontSize: 11, fontWeight: 800, py: 0.5, letterSpacing: '.04em', color: 'text.secondary' } }}>
              <TableCell>{t('wizard.precision.family')}</TableCell>
              <TableCell sx={{ width: 150 }}>{t('wizard.precision.sigmaDistance')}</TableCell>
              <TableCell sx={{ width: 150 }}>{t('wizard.precision.ppm')}</TableCell>
              <TableCell>{t('wizard.precision.sights')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ family, names, count }) => {
              return (
                <TableRow key={family} hover>
                  <TableCell sx={{ py: 0.4 }}>
                    <Typography variant="caption" fontWeight={700}>{names.join(' · ')}</Typography>
                    {names.length > 1 && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {t('wizard.precision.sharedPrecision')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ py: 0.4 }}>
                    <UnitField
                      label=""
                      unit="mm"
                      width={124}
                      step={0.05}
                      value={precision.distanceByFamily[family].stdErrMm}
                      onChange={(value) => patchFamily(family, { stdErrMm: value })}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.4 }}>
                    <UnitField
                      label=""
                      unit="ppm"
                      width={124}
                      step={0.1}
                      value={precision.distanceByFamily[family].ppm}
                      onChange={(value) => patchFamily(family, { ppm: value })}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 0.4 }}>
                    <Typography variant="caption" color={count === 0 ? 'text.disabled' : 'text.secondary'}>
                      {t('wizard.precision.sightCount', { count })}
                    </Typography>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
      )}
    </Stack>
  );
}

