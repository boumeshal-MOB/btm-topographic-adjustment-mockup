import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Box,
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
import { resolveNetworkCoordinates, stationPointId } from '@/demo/network-coordinates';
import { targetAvailabilityPercent } from '@/domain/outputs/output-plan';
import { heldPointCount } from '@/domain/engine/run-input';
import { chi2PassedOutputValue } from '@/domain/chi-square';
import { fixed, isRealNumber, millimetres } from '@/features/shared/format';

/**
 * The variables this processing will create, with the values of the cycle the adjustment was built
 * on — the trial run at the Adjustment step.
 *
 * It replaces a count. A count says how many series will exist; it does not say whether the delta of
 * P07 is two millimetres or two metres, which is the one question worth asking before creating a
 * processing that will publish that series for years.
 *
 * `Delta = adjusted − initial coordinate` (OUT-004), and the initial coordinate is the one the
 * Initialisation step produced (`network-coordinates.ts`) — the same value that gets frozen in the
 * version and used by every future run.
 */
export function OutputVariablesPreview({ draft }: { draft: WizardDraft }) {
  const { t } = useTranslation();
  const trial = draft.testEpoch;
  const initial = useMemo(() => resolveNetworkCoordinates(draft), [draft]);

  const rows = useMemo(() => {
    if (!trial) return [];
    const adjusted = new Map(trial.points.map((point) => [point.engineName, point]));

    const seen = new Set<string>();
    const targetRows = draft.targets
      .filter((target) => target.publishOutput && target.includeInAdjustment)
      .filter((target) => {
        if (seen.has(target.engineName)) return false;
        seen.add(target.engineName);
        return true;
      })
      .map((target) => ({
        label: target.engineName,
        scope: 'target' as const,
        adjusted: adjusted.get(target.engineName),
        initial: initial.get(target.engineName),
      }));

    const stationRows = draft.stationCodes.map((stationCode) => ({
      label: stationCode,
      scope: 'station' as const,
      // The engine names a station by its code; its initial coordinate is filed under `station:<code>`.
      adjusted: adjusted.get(stationCode),
      initial: initial.get(stationPointId(stationCode)),
    }));

    return [...stationRows, ...targetRows];
  }, [draft.stationCodes, draft.targets, initial, trial]);

  /**
   * The points this trial's adjustment actually holds — fixed or constrained, and present in the
   * cycle. It used to count every adjusted point, which announced 33 references for a network held
   * by three: the number of points that MOVED, not the number that held them still.
   *
   * Same definition as the run publishes (`heldPointCount`), fed from the control records because a
   * trial keeps positions, not the engine input.
   */
  const referencesUsed = useMemo(() => {
    const present = new Set(trial?.points.map((point) => point.engineName) ?? []);
    return heldPointCount(draft.initialisation.references
      .filter((control) => present.has(control.pointKey)
        || present.has(control.pointKey.replace(/^station:/, '')))
      .map((control) => {
        const modes = [control.modeE, control.modeN, control.modeH];
        // Mirrors `resolveControl`: a fixed component holds the point outright, a weak one weights
        // it with a pseudo-observation while leaving it free to move.
        return {
          free: !modes.includes('fixed'),
          constraints: modes
            .filter((mode) => mode === 'weak')
            .map(() => ({ component: 'e' as const, value: 0, sigmaM: control.sigmaM })),
        };
      }));
  }, [draft.initialisation.references, trial]);

  if (!trial) {
    return (
      <Alert severity="info" data-testid="output-variables-untested">
        {t('wizard.output.noTrialYet')}
      </Alert>
    );
  }

  const targetRowCount = rows.filter((row) => row.scope === 'target').length;
  const observedTargets = rows.filter((row) => row.scope === 'target' && row.adjusted).length;
  const globals: [string, string][] = [
    ['chi2-passed', fixed(chi2PassedOutputValue(trial.chiSquareStatus), 0)],
    ['variance-factor', fixed(trial.varianceFactor, 3)],
    ['references-available', String(referencesUsed)],
    ['target-availability', fixed(targetAvailabilityPercent(observedTargets, targetRowCount), 1)],
    ['provisional-flag', trial.provisional ? '1' : '0'],
  ];

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
        <Typography variant="subtitle2">{t('wizard.output.variablesTitle')}</Typography>
        <Chip size="small" variant="outlined" label={t('wizard.output.fromCycle', { slot: trial.slot })} />
        <Chip
          size="small"
          variant="outlined"
          label={t('wizard.output.variableCount', { count: rows.length * 9 + globals.length })}
        />
      </Stack>
      <Typography variant="body2" color="text.secondary">{t('wizard.output.variablesNote')}</Typography>

      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'auto', maxHeight: 340 }}>
        <Table size="small" stickyHeader aria-label={t('wizard.output.variablesTitle')} data-testid="output-variables-table">
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: 'grey.50', fontSize: 10.5, fontWeight: 800, py: 0.5, letterSpacing: '.04em', color: 'text.secondary' } }}>
              <TableCell>{t('wizard.output.point')}</TableCell>
              <TableCell align="right">Adjusted X</TableCell>
              <TableCell align="right">Adjusted Y</TableCell>
              <TableCell align="right">Adjusted Z</TableCell>
              <TableCell align="right">Delta X (mm)</TableCell>
              <TableCell align="right">Delta Y (mm)</TableCell>
              <TableCell align="right">Delta Z (mm)</TableCell>
              <TableCell align="right">Sigma X (mm)</TableCell>
              <TableCell align="right">Sigma Y (mm)</TableCell>
              <TableCell align="right">Sigma Z (mm)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.scope}-${row.label}`} hover data-testid={`output-row-${row.label}`}>
                <TableCell sx={{ fontFamily: 'monospace', py: 0.3, fontWeight: row.scope === 'station' ? 800 : 500 }}>
                  {row.label}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    {t(`wizard.output.scope.${row.scope}`)}
                  </Typography>
                </TableCell>
                <NumberCell value={row.adjusted?.eastingM} decimals={4} />
                <NumberCell value={row.adjusted?.northingM} decimals={4} />
                <NumberCell value={row.adjusted?.heightM} decimals={4} />
                <NumberCell value={delta(row.adjusted?.eastingM, row.initial?.eastingM)} decimals={2} inMillimetres />
                <NumberCell value={delta(row.adjusted?.northingM, row.initial?.northingM)} decimals={2} inMillimetres />
                <NumberCell value={delta(row.adjusted?.heightM, row.initial?.heightM)} decimals={2} inMillimetres />
                <NumberCell value={row.adjusted?.sigmaEM} decimals={2} inMillimetres />
                <NumberCell value={row.adjusted?.sigmaNM} decimals={2} inMillimetres />
                <NumberCell value={row.adjusted?.sigmaHM} decimals={2} inMillimetres />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {globals.map(([component, value]) => (
          <Chip
            key={component}
            size="small"
            variant="outlined"
            label={`${component} ${value}`}
            data-testid={`output-global-${component}`}
          />
        ))}
      </Stack>
    </Stack>
  );
}

/**
 * `null` when either side is missing, so a point the trial did not solve reads as absent rather than
 * as a delta of zero — the difference between "not observed" and "did not move".
 */
function delta(adjustedM: number | undefined, initialM: number | undefined): number | null {
  if (!isRealNumber(adjustedM) || !isRealNumber(initialM)) return null;
  return adjustedM - initialM;
}

function NumberCell({
  value,
  decimals,
  inMillimetres,
}: {
  value: number | null | undefined;
  decimals: number;
  inMillimetres?: boolean;
}) {
  return (
    <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 11.5, py: 0.3 }}>
      {inMillimetres ? millimetres(value, decimals) : fixed(value, decimals)}
    </TableCell>
  );
}
