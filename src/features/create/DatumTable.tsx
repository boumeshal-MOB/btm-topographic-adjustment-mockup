import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
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
import type { DraftReference, WizardDraft } from '@/demo/draft';
import type { ConstraintMode } from '@/domain/entities';
import {
  buildDatumRows,
  recommendedDatum,
  DEFAULT_SIGMA_M,
  MODE_FIELD,
  SIGMA_FIELD,
  type Component,
  type DatumRow,
} from '@/features/create/datum-view-model';
import { UnitField } from '@/features/shared/components';

/**
 * The datum of every future run: the coordinate records STAR*NET will hold, weight or solve.
 *
 * This is where a station is freed. Fixing a station during Initialisation only produced approximate
 * coordinates; keeping it fixed here would make the network its own reference and leave the control
 * points unchecked. A row exists only for a controlled point, exactly like a `C` line with `!` or a
 * sigma — a free point needs none.
 */
export function DatumTable({
  draft,
  update,
}: {
  draft: WizardDraft;
  update: (patch: Partial<WizardDraft>) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => buildDatumRows(draft), [draft]);
  const controls = draft.initialisation.references;

  const setControls = (next: DraftReference[]) => update({
    initialisation: { ...draft.initialisation, references: next },
  });

  const modeOf = (row: DatumRow, component: Component): ConstraintMode =>
    row.control?.[MODE_FIELD[component]] ?? 'free';

  const setMode = (row: DatumRow, component: Component, mode: ConstraintMode) => {
    const existing = controls.find((control) => control.pointKey === row.pointKey);
    const updated: DraftReference = existing
      ? { ...existing, [MODE_FIELD[component]]: mode }
      : {
          pointKey: row.pointKey,
          eastingM: row.eastingM,
          northingM: row.northingM,
          heightM: row.heightM,
          modeE: 'free',
          modeN: 'free',
          modeH: 'free',
          sigmaM: DEFAULT_SIGMA_M,
          source: 'datum',
          [MODE_FIELD[component]]: mode,
        };
    const stillControlled = [updated.modeE, updated.modeN, updated.modeH].some((value) => value !== 'free');
    // A free point keeps no record: removing the row *is* freeing the point.
    const others = controls.filter((control) => control.pointKey !== row.pointKey);
    setControls(stillControlled ? [...others, updated] : others);
  };

  const setSigma = (row: DatumRow, component: Component, sigmaMm: number) => {
    const existing = controls.find((control) => control.pointKey === row.pointKey);
    if (!existing) return;
    setControls(controls.map((control) => control.pointKey === row.pointKey
      ? { ...control, [SIGMA_FIELD[component]]: sigmaMm / 1000 }
      : control));
  };

  const heldPoints = rows.filter((row) => (['E', 'N', 'H'] as Component[]).some((component) => modeOf(row, component) !== 'free'));
  const fixedStations = rows.filter((row) => row.role === 'station'
    && (['E', 'N', 'H'] as Component[]).every((component) => modeOf(row, component) === 'fixed'));
  const constraintCount = heldPoints.reduce((count, row) =>
    count + (['E', 'N', 'H'] as Component[]).filter((component) => modeOf(row, component) !== 'free').length, 0);

  return (
    <Stack spacing={1.25}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>
            {t('wizard.datum.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">{t('wizard.datum.description')}</Typography>
        </Box>
        <Button
          variant="outlined"
          onClick={() => setControls(recommendedDatum(rows))}
          data-testid="apply-recommended-datum"
        >
          {t('wizard.datum.recommend')}
        </Button>
      </Stack>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" label={t('wizard.datum.heldCount', { count: heldPoints.length })} />
        <Chip size="small" variant="outlined" label={t('wizard.datum.constraintCount', { count: constraintCount })} />
        {fixedStations.length > 0 && (
          <Chip size="small" color="warning" variant="outlined" label={t('wizard.datum.fixedStations', { count: fixedStations.length })} />
        )}
      </Stack>

      {heldPoints.length === 0 && <Alert severity="error">{t('wizard.datum.nothingHeld')}</Alert>}
      {heldPoints.length === 1 && <Alert severity="warning">{t('wizard.datum.singleControl')}</Alert>}
      {fixedStations.length > 0 && <Alert severity="info" variant="outlined">{t('wizard.datum.stationFixedNote')}</Alert>}

      <Box sx={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
        <Table size="small" stickyHeader aria-label={t('wizard.datum.title')} data-testid="datum-table">
          <TableHead>
            <TableRow>
              <TableCell>{t('wizard.datum.point')}</TableCell>
              <TableCell>{t('wizard.datum.role')}</TableCell>
              <TableCell align="right">E (m)</TableCell>
              <TableCell align="right">N (m)</TableCell>
              <TableCell align="right">H (m)</TableCell>
              {(['E', 'N', 'H'] as Component[]).map((component) => (
                <TableCell key={component} sx={{ minWidth: 150 }}>{component}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.pointKey} hover data-testid={`datum-row-${row.label}`}>
                <TableCell sx={{ fontFamily: 'monospace', fontWeight: row.role === 'station' ? 800 : 400 }}>
                  {row.label}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={row.role === 'station' ? 'default' : row.role === 'reference' ? 'primary' : 'default'}
                    label={t(`enums.role.${row.role}`)}
                  />
                </TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.eastingM.toFixed(4)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.northingM.toFixed(4)}</TableCell>
                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{row.heightM.toFixed(4)}</TableCell>
                {(['E', 'N', 'H'] as Component[]).map((component) => {
                  const mode = modeOf(row, component);
                  return (
                    <TableCell key={component}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <FormControl size="small" sx={{ minWidth: 86 }}>
                          <Select
                            value={mode}
                            onChange={(event) => setMode(row, component, event.target.value as ConstraintMode)}
                            inputProps={{ 'aria-label': `${row.label} ${component}` }}
                          >
                            <MenuItem value="fixed">{t('enums.constraint.fixed')}</MenuItem>
                            <MenuItem value="weak">{t('enums.constraint.weak')}</MenuItem>
                            <MenuItem value="free">{t('enums.constraint.free')}</MenuItem>
                          </Select>
                        </FormControl>
                        {mode === 'weak' && (
                          <UnitField
                            label=""
                            unit="mm"
                            width={78}
                            step={0.1}
                            value={((row.control?.[SIGMA_FIELD[component]] ?? row.control?.sigmaM ?? DEFAULT_SIGMA_M) * 1000)}
                            onChange={(value) => setSigma(row, component, value)}
                          />
                        )}
                      </Stack>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}
