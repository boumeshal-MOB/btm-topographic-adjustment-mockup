import { Alert, AlertTitle, Box, Chip, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { AnalysisTrialResult } from '@/domain/analysis/types';
import { chiSquareDirection, optimismWarnings } from '@/domain/analysis/quality';

interface AnalysisRunRecapProps {
  result: AnalysisTrialResult;
  trialLabel: string;
  weightMultiplier: number;
  excludedComponentCount: number;
  freedReferenceCount: number;
  /** True while the editor holds changes that this result does not include. */
  stale: boolean;
}

/**
 * What the last calculation actually says, in one place.
 *
 * The verdict, the numbers behind it, the exclusions that produced it and any blocking error —
 * so the surveyor does not have to assemble the picture from four separate panels, and so a
 * result that no longer matches the settings is never read as current.
 */
export function AnalysisRunRecap({
  result,
  trialLabel,
  weightMultiplier,
  excludedComponentCount,
  freedReferenceCount,
  stale,
}: AnalysisRunRecapProps) {
  const { t } = useTranslation();
  const diagnostic = result.diagnostic;
  const direction = chiSquareDirection(diagnostic);
  const warnings = optimismWarnings({
    diagnostic,
    excludedComponentCount,
    freedReferenceCount,
    weightMultiplier,
    totalObservationComponents: result.observations.length * 3,
  });

  const solved = diagnostic.ok && diagnostic.converged && diagnostic.rankDeficiency === 0;
  const severity = !solved ? 'error' : direction === 'above' ? 'warning' : 'success';

  const figures: Array<[string, string]> = [
    [t('analysis.trials.rank'), `${diagnostic.rank}/${diagnostic.unknownCount}`],
    [t('analysis.trials.dof'), String(diagnostic.degreesOfFreedom)],
    [t('analysis.trials.varianceFactor'),
      Number.isFinite(diagnostic.varianceFactor) ? diagnostic.varianceFactor.toFixed(3) : '—'],
    [t('analysis.trials.maxStdResidual'), diagnostic.maxStdResidual.toFixed(2)],
    [t('analysis.trials.excludedComponents'), String(excludedComponentCount)],
    [t('analysis.recap.freedReferences'), String(freedReferenceCount)],
  ];

  return (
    <Stack spacing={1.25} data-testid="run-recap">
      <Alert severity={severity}>
        <AlertTitle>
          {solved
            ? t(`quality.chiSquare.direction.${direction}`)
            : t('analysis.recap.noSolution')}
        </AlertTitle>
        <Typography variant="body2">
          {solved && direction !== 'not-applicable'
            ? t(`quality.chiSquare.explain.${direction}`)
            : t('analysis.recap.noSolutionHelp')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('analysis.recap.basedOn', { trial: trialLabel })}
        </Typography>
      </Alert>

      {stale && (
        <Alert severity="warning" variant="outlined" data-testid="stale-trial">
          {t('analysis.trials.stale')}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 1 }}>
        {figures.map(([label, value]) => (
          <Paper key={label} variant="outlined" sx={{ p: 1 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography sx={{ fontSize: '1.05rem', fontWeight: 900 }}>{value}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Blocking problems first: they explain why there is no usable solution at all. */}
      {result.blocking.length > 0 && (
        <Alert severity="error" variant="outlined" data-testid="recap-blocking">
          <AlertTitle>{t('analysis.recap.blocking')}</AlertTitle>
          <Stack component="ul" sx={{ m: 0, pl: 2.2 }} spacing={0.2}>
            {result.blocking.map((message) => (
              <Typography key={message} component="li" variant="body2">{message}</Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {warnings.length > 0 && (
        <Alert severity="warning" variant="outlined" data-testid="recap-warnings">
          <Stack component="ul" sx={{ m: 0, pl: 2.2 }} spacing={0.2}>
            {warnings.map((warning) => (
              <Typography key={warning} component="li" variant="body2">
                {t(`quality.warning.${warning.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())}`)}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {result.alerts.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {result.alerts.map((alert) => (
            <Chip key={alert} size="small" color="warning" variant="outlined" label={alert} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
