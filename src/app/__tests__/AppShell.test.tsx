import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import i18n from '@/app/i18n';
import AppShell from '@/app/AppShell';

function renderShell() {
  const router = createMemoryRouter(
    [{ path: '/', element: <AppShell />, children: [{ index: true, element: <div>child</div> }] }],
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

  it('links only to routes that exist, never to scaffold navigation', () => {
    renderShell();
    // Both destinations are registered in the router and render a working screen. The rule this
    // guards is "no dead primary action", not "exactly one link".
    const hrefs = screen.queryAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs.sort()).toEqual(['/', '/validation-catalogue']);
  });

  it('switches the interface language', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('en');
    renderShell();

    expect(screen.getByTestId('demo-data-badge')).toHaveTextContent('Demo data');
    await user.click(screen.getByRole('button', { name: 'Français' }));

    await waitFor(() =>
      expect(screen.getByTestId('demo-data-badge')).toHaveTextContent('Données de démonstration'));
    expect(screen.getByTestId('nav-validation-catalogue')).toHaveTextContent('Catalogue de validation');

    await i18n.changeLanguage('en');
  });
});
