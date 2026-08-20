import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
  Button,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { WizardDraft } from '@/demo/draft';
import {
  buildDatumRows,
  componentConstraint,
  COMPONENTS,
  isHeld,
  MINIMUM_HELD_REFERENCES,
} from '@/features/create/datum-view-model';

/**
 * What holds the network, stated — not decided.
 *
 * The decision moved to the Targets step, where the reference prisms are: a constraint is a property
 * of a point, and asking for it two screens later meant deciding it away from the thing it applies
 * to. What has to stay here is the *verdict*, because this is the screen that launches a trial and a
 * trial on an unheld network is meaningless — and because whether a constraint is real can only be
 * judged once the Initialisation has produced coordinates, which happens between the two screens.
 */
export function DatumSummary({
  draft,
  onEditRequested,
}: {
  draft: WizardDraft;
  /** Sends the surveyor back to the screen that owns the decision. */
  onEditRequested: () => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => buildDatumRows(draft), [draft]);
  const held = rows.filter((row) => isHeld(row.control));
  const holding = held.filter((row) => row.role === 'reference' && row.known);
  const heldStations = held.filter((row) => row.role === 'station');
  const weightedApproximations = held.filter((row) => row.role !== 'station' && !row.known).map((row) => row.label);
  const constraintCount = held.reduce((count, row) =>
    count + COMPONENTS.filter((component) => componentConstraint(row.control, component).mode !== 'free').length, 0);

  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h3" sx={{ fontSize: '1.05rem', fontWeight: 700 }}>{t('wizard.datum.title')}</Typography>
          <Typography variant="body2" color="text.secondary">{t('wizard.datum.summaryDescription')}</Typography>
        </Box>
        <Button variant="outlined" size="small" onClick={onEditRequested} data-testid="edit-datum-in-targets">
          {t('wizard.datum.editInTargets')}
        </Button>
      </Stack>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        <Chip size="small" variant="outlined" label={t('wizard.datum.heldCount', { count: held.length })} />
        <Chip size="small" variant="outlined" label={t('wizard.datum.constraintCount', { count: constraintCount })} />
        <Chip
          size="small"
          variant="outlined"
          color={holding.length >= MINIMUM_HELD_REFERENCES ? 'success' : 'error'}
          label={t('wizard.datum.holdingCount', { count: holding.length, minimum: MINIMUM_HELD_REFERENCES })}
        />
        {heldStations.length > 0 && (
          <Chip size="small" color="warning" variant="outlined" label={t('wizard.datum.heldStations', { count: heldStations.length })} />
        )}
      </Stack>

      {holding.length < MINIMUM_HELD_REFERENCES && (
        <Alert
          severity="error"
          data-testid={held.length === 0 ? 'nothing-held' : 'not-enough-references'}
        >
          {held.length === 0
            ? t('wizard.datum.nothingHeld')
            : t('wizard.datum.notEnoughReferences', { count: holding.length, minimum: MINIMUM_HELD_REFERENCES })}
        </Alert>
      )}
      {weightedApproximations.length > 0 && (
        <Alert severity="warning" data-testid="weighted-approximations">
          {t('wizard.datum.weightedApproximation', { points: weightedApproximations.join(', ') })}
        </Alert>
      )}
      {heldStations.length > 0 && <Alert severity="info" variant="outlined">{t('wizard.datum.stationHeldNote')}</Alert>}

      {held.length > 0 && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'auto', maxHeight: 300 }}>
          <Table size="small" stickyHeader aria-label={t('wizard.datum.title')} data-testid="datum-summary-table">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'grey.50', fontSize: 10.5, fontWeight: 800, py: 0.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'text.secondary' } }}>
                <TableCell>{t('wizard.datum.point')}</TableCell>
                <TableCell>{t('wizard.datum.role')}</TableCell>
                <TableCell align="right">E (m)</TableCell>
                <TableCell align="right">N (m)</TableCell>
                <TableCell align="right">H (m)</TableCell>
                <TableCell>{t('wizard.targets.columnControl')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {held.map((row) => (
                <TableRow key={row.pointKey} hover data-testid={`datum-row-${row.label}`}>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: row.role === 'station' ? 800 : 500, py: 0.3 }}>
                    {row.label}
                  </TableCell>
                  <TableCell sx={{ py: 0.3 }}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                      <Typography variant="caption">{t(`enums.role.${row.role}`)}</Typography>
                      {row.role !== 'station' && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={row.known ? 'success' : 'warning'}
                          label={t(row.known ? 'wizard.datum.knownCoordinate' : 'wizard.datum.approximateCoordinate')}
                          sx={{ height: 17, '& .MuiChip-label': { px: 0.5, fontSize: 9.5 } }}
                        />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>{row.eastingM.toFixed(4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>{row.northingM.toFixed(4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>{row.heightM.toFixed(4)}</TableCell>
                  <TableCell sx={{ py: 0.3 }}>
                    <Stack direction="row" spacing={0.75}>
                      {COMPONENTS.map((component) => {
                        const { mode, sigmaMm } = componentConstraint(row.control, component);
                        return (
                          <Typography
                            key={component}
                            variant="caption"
                            fontFamily="monospace"
                            sx={{ color: mode === 'free' ? 'text.disabled' : mode === 'fixed' ? 'error.main' : 'primary.main', fontWeight: mode === 'free' ? 400 : 800 }}
                          >
                            {component}
                            {mode === 'fixed' ? '!' : mode === 'weak' ? ` ${sigmaMm.toFixed(1)}` : ' —'}
                          </Typography>
                        );
                      })}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Stack>
  );
}
