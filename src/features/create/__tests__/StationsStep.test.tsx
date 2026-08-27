import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import WizardPage from '@/features/create/WizardPage';

function renderStationsStep() {
  const store = demoStore();
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  draft.step = 1;
  store.saveDraft(draft);
  const router = createMemoryRouter(
    [{ path: '/create/:draftId', element: <WizardPage /> }],
    { initialEntries: [`/create/${draft.id}`] },
  );
  render(<AppProviders><RouterProvider router={router} /></AppProviders>);
  return draft.id;
}

describe('Stations step UK field examples', () => {
  beforeEach(() => {
    queryClient.clear();
    demoStore().reset();
  });

  it('shows KH01 and KH02 as two separate anonymised station choices', async () => {
    renderStationsStep();
    for (const stationCode of ['KH01', 'KH02']) {
      const checkbox = await screen.findByRole('checkbox', { name: `Select ${stationCode}` });
      const row = checkbox.closest('tr');
      expect(row).not.toBeNull();
      if (!row) throw new Error(`Missing table row for ${stationCode}`);
      expect(within(row).getByText(stationCode)).toBeInTheDocument();
      expect(within(row).getByText('UK field observations')).toBeInTheDocument();
      expect(row).toHaveTextContent('194');
      expect(row).toHaveTextContent('120');
    }
    expect(screen.queryByText(/Kilmuir|05053/i)).toBeNull();
  });

  it('selects KH02 independently and builds its 194 UK target proposals', async () => {
    const user = userEvent.setup();
    const draftId = renderStationsStep();
    await user.click(await screen.findByRole('checkbox', { name: 'Select KH02' }));

    await waitFor(() => {
      const stored = demoStore().getDraft(draftId)!;
      expect(stored.stationCodes).toEqual(['KH02']);
      expect(stored.targets).toHaveLength(194);
      expect(stored.adjustment.angleOutputUnits).toBe('DMS');
    });
  });
});
