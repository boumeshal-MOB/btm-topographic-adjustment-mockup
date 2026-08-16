import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { TrialChange } from '@/features/analysis/analysis-view-model';

interface RunTrialDialogProps {
  open: boolean;
  changes: TrialChange[];
  trialName: string;
  onTrialNameChange: (value: string) => void;
  engineLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation shown before a trial runs.
 *
 * A trial is cheap to start and easy to lose track of, especially against the real STAR*NET
 * service. Naming it and reading the before → after list first is what makes a series of trials
 * a comparison rather than a pile.
 */
export function RunTrialDialog({
  open,
  changes,
  trialName,
  onTrialNameChange,
  engineLabel,
  pending,
  onConfirm,
  onCancel,
}: RunTrialDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onClose={() => !pending && onCancel()} maxWidth="md" fullWidth>
      <DialogTitle>{t('analysis.runDialog.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField
              size="small"
              label={t('analysis.runDialog.name')}
              value={trialName}
              onChange={(event) => onTrialNameChange(event.target.value)}
              sx={{ flexGrow: 1 }}
              inputProps={{ 'aria-label': t('analysis.runDialog.name') }}
              data-testid="trial-name"
            />
            <Chip size="small" variant="outlined" label={engineLabel} />
          </Stack>

          {changes.length === 0 ? (
            <Alert severity="info">{t('analysis.trials.upToDate')}</Alert>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary">
                {t('analysis.runDialog.description', { count: changes.length })}
              </Typography>
              <Table size="small" aria-label={t('analysis.runDialog.title')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('analysis.runDialog.what')}</TableCell>
                    <TableCell>{t('analysis.runDialog.before')}</TableCell>
                    <TableCell>{t('analysis.runDialog.after')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {changes.map((change, index) => (
                    <TableRow key={`${change.key}-${change.subject ?? index}`}>
                      <TableCell>
                        <Typography variant="body2">{t(`analysis.runDialog.change.${change.key}`, { defaultValue: change.key })}</Typography>
                        {change.subject && (
                          <Typography variant="caption" color="text.secondary" fontFamily="monospace">
                            {change.subject}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace" color="text.secondary">
                          {change.before}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" fontFamily="monospace" fontWeight={700}>
                          {change.after}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
          <Alert severity="info" variant="outlined">{t('analysis.inspector.rawDataUntouched')}</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={pending}>{t('validation.import.cancel')}</Button>
        <Button
          variant="contained"
          onClick={onConfirm}
          disabled={pending || changes.length === 0}
          data-testid="confirm-run-trial"
        >
          {pending ? t('analysis.trials.running') : t('analysis.trials.run')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
