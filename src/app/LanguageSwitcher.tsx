import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from '@/app/i18n';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const language: SupportedLanguage = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';

  return (
    <Tooltip title={t('language.help')}>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={language}
        onChange={(_, next: SupportedLanguage | null) => {
          if (next) void i18n.changeLanguage(next);
        }}
        aria-label={t('language.label')}
        sx={{
          bgcolor: 'rgba(255,255,255,.12)',
          '& .MuiToggleButton-root': {
            borderColor: 'rgba(255,255,255,.45)',
            color: 'rgba(255,255,255,.8)',
            fontWeight: 800,
            px: 1,
            py: 0.25,
            '&.Mui-selected': { bgcolor: 'common.white', color: 'primary.main' },
          },
        }}
      >
        <ToggleButton value="fr" aria-label={t('language.fr')}>FR</ToggleButton>
        <ToggleButton value="en" aria-label={t('language.en')}>EN</ToggleButton>
      </ToggleButtonGroup>
    </Tooltip>
  );
}
