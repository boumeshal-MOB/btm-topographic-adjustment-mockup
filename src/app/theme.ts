import { createTheme } from '@mui/material/styles';

/**
 * Distinct visual direction for this mock-up: a slate/amber technical palette,
 * deliberately different from the previous prototype's styling.
 */
export const theme = createTheme({
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
    h1: { fontSize: '1.75rem', fontWeight: 600 },
    h2: { fontSize: '1.375rem', fontWeight: 600 },
    body2: { fontSize: '0.875rem' },
  },
  components: {
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiButton: { defaultProps: { size: 'small' }, styleOverrides: { root: { textTransform: 'none' } } },
    MuiTable: { defaultProps: { size: 'small' } },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});
