import { useMemo, type ReactNode } from 'react';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClientProvider } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { createAppTheme } from '@/app/theme';
import { queryClient } from '@/app/query-client';
import '@/app/i18n';

export function AppProviders({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage?.startsWith('fr') ? 'fr' : 'en';
  const theme = useMemo(() => createAppTheme(language), [language]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
