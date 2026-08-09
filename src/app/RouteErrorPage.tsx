import { useState } from 'react';
import { Alert, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

function readableError(error: unknown, fallback: string): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return fallback;
}

/**
 * A recoverable product surface for stale demo URLs/state. React Router's development error page
 * exposes a stack and leaves non-technical users stranded.
 */
export default function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  const resetDemo = async () => {
    setResetting(true);
    setResetError('');
    try {
      const response = await fetch('/api/v2/demo/reset', { method: 'POST' });
      if (!response.ok) throw new Error(t('shell.routeError.resetFailed'));
      window.location.assign('/');
    } catch (caught) {
      setResetError(caught instanceof Error ? caught.message : String(caught));
      setResetting(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: 8 }}>
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Stack spacing={2}>
          <Typography variant="h1">{t('shell.routeError.title')}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t('shell.routeError.help')}
          </Typography>
          <Alert severity="error">{readableError(error, t('shell.routeError.fallback'))}</Alert>
          {resetError && <Alert severity="error">{resetError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" href="/">{t('shell.routeError.back')}</Button>
            <Button variant="outlined" color="warning" disabled={resetting} onClick={resetDemo}>
              {resetting ? t('shell.routeError.resetting') : t('shell.routeError.reset')}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
