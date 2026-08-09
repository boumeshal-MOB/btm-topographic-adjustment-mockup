import { AppBar, Box, Button, Chip, Toolbar } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet } from 'react-router-dom';
import LanguageSwitcher from '@/app/LanguageSwitcher';

/**
 * Compact app shell: title bar with a discrete "Demo data" badge (rule DEMO-004 /
 * front/10 §11). No navigation links are rendered for screens that do not exist yet —
 * a later session adds routes as their screens become functional.
 */
export default function AppShell() {
  const { t } = useTranslation();
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={0} sx={{ borderBottom: '3px solid', borderColor: 'secondary.main' }}>
        <Toolbar sx={{ gap: 2, minHeight: 58 }}>
          <Button
            component={RouterLink}
            to="/"
            aria-label={t('app.backToProcessings')}
            sx={{ color: 'common.white', fontSize: '1.15rem', px: 0, flexGrow: 1, justifyContent: 'flex-start' }}
          >
            {t('app.title')}
          </Button>
          <LanguageSwitcher />
          <Chip
            label={t('app.demoDataBadge')}
            color="secondary"
            size="small"
            variant="filled"
            data-testid="demo-data-badge"
          />
        </Toolbar>
      </AppBar>
      <Box component="main">
        <Outlet />
      </Box>
    </Box>
  );
}
