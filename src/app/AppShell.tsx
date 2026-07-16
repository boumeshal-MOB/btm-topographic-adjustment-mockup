import { AppBar, Box, Chip, Toolbar, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet } from 'react-router-dom';

/**
 * Compact app shell: title bar with a discrete "Demo data" badge (rule DEMO-004 /
 * front/10 §11). The product title is the persistent way back to the processings list
 * (single, consistent home affordance across every screen).
 */
export default function AppShell() {
  const { t } = useTranslation();
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography
            variant="h2"
            component={RouterLink}
            to="/"
            sx={{ color: 'common.white', flexGrow: 1, textDecoration: 'none', '&:hover': { opacity: 0.9 } }}
          >
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
