import { Alert, Container, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={2}>
        <Typography variant="h1">{t('app.title')}</Typography>
        <Alert severity="info">{t('shell.scaffoldNotice')}</Alert>
      </Stack>
    </Container>
  );
}
