import { AppBar, Box, Button, Chip, ToggleButton, ToggleButtonGroup, Toolbar, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

const LANGUAGES = ['en', 'fr'] as const;

/**
 * Compact app shell: title bar, the discrete "Demo data" badge (rule DEMO-004), a link to the
 * validation catalogue and the language switch. Only routes whose screens actually work are
 * linked — there is no dead primary action.
 */
export default function AppShell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const language = LANGUAGES.includes(i18n.language as (typeof LANGUAGES)[number])
    ? (i18n.language as (typeof LANGUAGES)[number])
    : 'en';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" elevation={0} sx={{ borderBottom: '3px solid', borderColor: 'secondary.main' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 58, flexWrap: 'wrap' }}>
          <Button
            component={RouterLink}
            to="/"
            aria-label="Back to topographic adjustment processings"
            sx={{ color: 'common.white', fontSize: '1.15rem', px: 0, justifyContent: 'flex-start' }}
          >
            {t('app.title')}
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            component={RouterLink}
            to="/validation-catalogue"
            size="small"
            variant={location.pathname.startsWith('/validation-catalogue') ? 'outlined' : 'text'}
            sx={{ color: 'common.white', borderColor: 'rgba(255,255,255,.6)' }}
            data-testid="nav-validation-catalogue"
          >
            {t('app.validationCatalogue')}
          </Button>
          <Tooltip title={t('language.help')}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={language}
              onChange={(_, next: string | null) => next && void i18n.changeLanguage(next)}
              aria-label={t('language.label')}
              sx={{
                bgcolor: 'rgba(255,255,255,.12)',
                '& .MuiToggleButton-root': { color: 'common.white', borderColor: 'rgba(255,255,255,.4)', px: 1.1, py: 0.25 },
                '& .Mui-selected': { bgcolor: 'rgba(255,255,255,.28) !important' },
              }}
            >
              {/* The visible text is the code; the accessible name is the language in words. */}
              <ToggleButton value="en" aria-label={t('language.en')}>EN</ToggleButton>
              <ToggleButton value="fr" aria-label={t('language.fr')}>FR</ToggleButton>
            </ToggleButtonGroup>
          </Tooltip>
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
