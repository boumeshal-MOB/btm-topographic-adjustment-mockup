import { useState } from 'react';
import { Alert, Button, Container, Paper, Stack, Typography } from '@mui/material';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';

function readableError(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return 'The requested screen could not be opened.';
}

/**
 * A recoverable product surface for stale demo URLs/state. React Router's development error page
 * exposes a stack and leaves non-technical users stranded.
 */
export default function RouteErrorPage() {
  const error = useRouteError();
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  const resetDemo = async () => {
    setResetting(true);
    setResetError('');
    try {
      const response = await fetch('/api/v2/demo/reset', { method: 'POST' });
      if (!response.ok) throw new Error('The demo state could not be reset.');
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
          <Typography variant="h1">This screen could not be opened</Typography>
          <Typography variant="body2" color="text.secondary">
            The draft may come from an older mock-up version or may no longer exist. Your stored
            processing configuration is not modified by this error.
          </Typography>
          <Alert severity="error">{readableError(error)}</Alert>
          {resetError && <Alert severity="error">{resetError}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="contained" href="/">Back to processings</Button>
            <Button variant="outlined" color="warning" disabled={resetting} onClick={resetDemo}>
              {resetting ? 'Resetting…' : 'Reset demo data'}
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
