import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

/**
 * Whole-shell failure without a label; a single contained panel with one.
 *
 * A contained failure stays inside its panel and names itself, because the rest of the screen — and
 * the work in progress around it — is still valid.
 */
export function ErrorFallback({
  label,
  message,
  onRetry,
}: {
  label?: string;
  message?: string;
  onRetry?: () => void;
} = {}) {
  const { t } = useTranslation();

  if (label === undefined) {
    return (
      <Box sx={{ p: 4 }}>
        <Stack spacing={2} alignItems="flex-start">
          <Typography variant="h1">{t('shell.errorBoundary.title')}</Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            {t('shell.errorBoundary.action')}
          </Button>
        </Stack>
      </Box>
    );
  }

  return (
    <Alert
      severity="error"
      data-testid="panel-error"
      action={onRetry && (
        <Button color="inherit" size="small" onClick={onRetry}>
          {t('shell.errorBoundary.retry')}
        </Button>
      )}
    >
      <AlertTitle>{t('shell.errorBoundary.panel', { section: label })}</AlertTitle>
      <Typography variant="body2">{t('shell.errorBoundary.panelHelp')}</Typography>
      {message && (
        <Typography variant="caption" fontFamily="monospace" sx={{ display: 'block', mt: 0.5 }}>
          {message}
        </Typography>
      )}
    </Alert>
  );
}
