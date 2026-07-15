import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import AppShell from '@/app/AppShell';
import Home from '@/app/pages/Home';

function renderShell() {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell />, children: [{ index: true, element: <Home /> }] }],
    { initialEntries: ['/'] },
  );
  return render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

describe('AppShell', () => {
  it('renders the title and the Demo data badge (DEMO-004)', () => {
    renderShell();
    expect(screen.getAllByText('Topographic Adjustment').length).toBeGreaterThan(0);
    expect(screen.getByTestId('demo-data-badge')).toHaveTextContent('Demo data');
  });

  it('renders no scaffold navigation link to an unimplemented screen', () => {
    renderShell();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
