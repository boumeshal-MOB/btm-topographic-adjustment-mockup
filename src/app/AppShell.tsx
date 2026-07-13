import { AppBar, Box, Chip, Toolbar, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';

/**
 * Compact app shell: title bar with a discrete "Demo data" badge (rule DEMO-004 /
 * front/10 §11). No navigation links are rendered for screens that do not exist yet —
 * a later session adds routes as their screens become functional.
 */
export default function AppShell() {
  const { t } = useTranslation();
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h2" component="span" sx={{ color: 'common.white', flexGrow: 1 }}>
            {t('app.title')}
          </Typography>
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
