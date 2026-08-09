import { enUS, frFR } from '@mui/material/locale';
import { createTheme, type ThemeOptions } from '@mui/material/styles';

/**
 * Distinct visual direction for this mock-up: a slate/amber technical palette,
 * deliberately different from the previous prototype's styling.
 */
const themeOptions: ThemeOptions = {
  palette: {
    mode: 'light',
    primary: { main: '#1F3A5F', light: '#4C6488', dark: '#122540' },
    secondary: { main: '#C9822A', light: '#E0A85C', dark: '#96611A' },
    background: { default: '#F4F6F8', paper: '#FFFFFF' },
    success: { main: '#2E7D5B' },
    warning: { main: '#C9822A' },
    error: { main: '#B3432B' },
    info: { main: '#3E6FA8' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: ['Inter', 'Segoe UI', 'Roboto', 'system-ui', 'sans-serif'].join(','),
    h1: { fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.025em' },
    h2: { fontSize: '1.375rem', fontWeight: 650, letterSpacing: '-0.015em' },
    body2: { fontSize: '0.875rem' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage: 'linear-gradient(180deg, #F8FAFC 0%, #F4F6F8 28rem)',
          backgroundAttachment: 'fixed',
        },
      },
    },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiButton: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, borderRadius: 7 } },
    },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiTableHead: {
      styleOverrides: { root: { backgroundColor: '#F1F5F9' } },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { color: '#475569', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.035em', textTransform: 'uppercase' },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiPaper: {
      styleOverrides: { outlined: { borderColor: '#DCE3EA', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.025)' } },
    },
  },
};

/** Apply the matching MUI catalogue as well as the application translations. */
export function createAppTheme(language: 'en' | 'fr') {
  return createTheme(themeOptions, language === 'fr' ? frFR : enUS);
}

export const theme = createAppTheme('en');
