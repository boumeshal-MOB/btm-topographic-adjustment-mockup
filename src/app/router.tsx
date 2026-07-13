import { createBrowserRouter } from 'react-router-dom';
import AppShell from '@/app/AppShell';
import Home from '@/app/pages/Home';

/**
 * Only screens with working functionality are registered here (protocol rule:
 * "no dead primary action"). Wizard, administration and analysis routes are added in the
 * sessions that implement them (T01.11+).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [{ index: true, element: <Home /> }],
  },
]);
