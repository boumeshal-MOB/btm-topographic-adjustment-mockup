import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import AppShell from '@/app/AppShell';
import i18n, { LANGUAGE_STORAGE_KEY } from '@/app/i18n';

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
  beforeEach(async () => {
    window.localStorage.clear();
    await i18n.changeLanguage('en');
  });

  afterEach(async () => {
    cleanup();
    window.localStorage.clear();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('renders the title and the Demo data badge (DEMO-004)', () => {
    renderShell();
    expect(screen.getAllByText('Topographic Adjustment').length).toBeGreaterThan(0);
    expect(screen.getByTestId('demo-data-badge')).toHaveTextContent('Demo data');
  });

  it('renders only the functional home link, not scaffold navigation', () => {
    renderShell();
    const links = screen.queryAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/');
  });

  it('switches the complete shell to surveying French and remembers the choice', async () => {
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole('button', { name: 'French' }));

    expect(screen.getAllByText('Compensation topographique').length).toBeGreaterThan(0);
    expect(screen.getByTestId('demo-data-badge')).toHaveTextContent('Données de démonstration');
    expect(document.documentElement).toHaveAttribute('lang', 'fr');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr');
  });
});
