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
import { stationInstrumentPrecision, templateStationPrecision } from '@/demo/station-precision';
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
  dense = false,
}: {
  draft: WizardDraft;
  station: DraftStationConfig;
  update: (patch: Partial<WizardDraft>) => void;
  /** Drops the per-family table down to the families this station actually sights. */
  dense?: boolean;
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

  const sighted = new Set(draft.targets
    .filter((target) => target.stationCode === station.stationCode)
    .map((target) => target.measurementType));
  const families = dense
    ? MEASUREMENT_FAMILIES.filter((family) => sighted.has(family))
    : MEASUREMENT_FAMILIES;

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
            {families.map((family) => {
              const count = draft.targets.filter((target) =>
                target.stationCode === station.stationCode && target.measurementType === family).length;
              return (
                <TableRow key={family} hover>
                  <TableCell sx={{ py: 0.4 }}>
                    <Typography variant="caption" fontWeight={700}>{t(`wizard.targets.${familyKey(family)}`)}</Typography>
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
    </Stack>
  );
}

/** The translation keys for the reflector families predate this screen; keep using them. */
function familyKey(family: MeasurementType): 'prism' | 'sheet' | 'reflectorless' {
  if (family === 'prism') return 'prism';
  if (family === 'reflective-sheet') return 'sheet';
  return 'reflectorless';
}
