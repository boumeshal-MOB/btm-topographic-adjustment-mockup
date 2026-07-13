import { Box, Button, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export function ErrorFallback() {
  const { t } = useTranslation();
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
