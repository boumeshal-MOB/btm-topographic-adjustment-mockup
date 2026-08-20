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
  Tooltip,
  Typography,
} from '@mui/material';
import type { WizardDraft } from '@/demo/draft';
import { fixed } from '@/features/shared/format';
import {
  buildDatumRows,
  componentConstraint,
  COMPONENTS,
  isHeld,
  MINIMUM_HELD_REFERENCES,
} from '@/features/create/datum-view-model';

/**
 * What gives the network its datum, stated — not decided.
 *
 * The decision belongs to the Targets step, where the prisms are. What has to stay here is the
 * **verdict**, because this is the screen that launches a trial and a trial without a datum answers
 * nothing.
 *
 * One rule governs the colours: red is reserved for a computation that cannot pass. Fewer than two
 * constrained or fixed points means a rank-deficient normal matrix, so that is red and it blocks.
 * Everything else — a constraint placed on a computed coordinate, a station left constrained — is a
 * remark: it goes in a single discreet counter with the detail on hover, never a stack of banners.
 * Warnings that shout are warnings that get ignored.
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
  /** What the solver needs: constrained or fixed points that are not the station itself. */
  const holding = held.filter((row) => row.role !== 'station');
  const heldStations = held.filter((row) => row.role === 'station');
  const computedCoordinates = held.filter((row) => row.role !== 'station' && !row.known).map((row) => row.label);
  const constraintCount = held.reduce((count, row) =>
    count + COMPONENTS.filter((component) => componentConstraint(row.control, component).mode !== 'free').length, 0);

  const solvable = holding.length >= MINIMUM_HELD_REFERENCES;

  /** Remarks worth keeping reachable, and worth keeping quiet. */
  const remarks = [
    ...(computedCoordinates.length > 0
      ? [t('wizard.datum.computedCoordinates', { points: computedCoordinates.join(', ') })]
      : []),
    ...(heldStations.length > 0 ? [t('wizard.datum.stationHeldNote')] : []),
  ];

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

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <Chip
          size="small"
          variant="outlined"
          color={solvable ? 'success' : 'error'}
          label={t('wizard.datum.holdingCount', { count: holding.length, minimum: MINIMUM_HELD_REFERENCES })}
          data-testid="datum-holding-count"
        />
        <Chip size="small" variant="outlined" label={t('wizard.datum.constraintCount', { count: constraintCount })} />
        {/* One line for every remark, detail on hover: a screen that shouts stops being read. */}
        {remarks.length > 0 && (
          <Tooltip
            title={(
              <Stack spacing={0.5} sx={{ py: 0.25 }}>
                {remarks.map((remark) => <Typography key={remark} variant="caption">{remark}</Typography>)}
              </Stack>
            )}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ cursor: 'help', textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
              data-testid="datum-remarks"
            >
              {t('wizard.datum.remarks', { count: remarks.length })}
            </Typography>
          </Tooltip>
        )}
      </Stack>

      {/* The only red on this block, and only when the computation genuinely cannot pass. */}
      {!solvable && (
        <Alert
          severity="error"
          data-testid={held.length === 0 ? 'nothing-held' : 'not-enough-references'}
        >
          {t('wizard.datum.notSolvable', { count: holding.length, minimum: MINIMUM_HELD_REFERENCES })}
        </Alert>
      )}

      {held.length > 0 && (
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'auto', maxHeight: 300 }}>
          <Table size="small" stickyHeader aria-label={t('wizard.datum.title')} data-testid="datum-summary-table">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: 'grey.50', fontSize: 10.5, fontWeight: 800, py: 0.5, letterSpacing: '.04em', color: 'text.secondary' } }}>
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
                        <Typography variant="caption" color="text.secondary">
                          {t(row.known ? 'wizard.datum.knownCoordinate' : 'wizard.datum.approximateCoordinate')}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>{fixed(row.eastingM, 4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>{fixed(row.northingM, 4)}</TableCell>
                  <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>{fixed(row.heightM, 4)}</TableCell>
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
                            {mode === 'fixed' ? '!' : mode === 'weak' ? ` ${fixed(sigmaMm, 1)}` : ' —'}
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
