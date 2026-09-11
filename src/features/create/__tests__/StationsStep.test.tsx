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

  it('detects, previews, imports and selects a station from the interface', async () => {
    const user = userEvent.setup();
    const draftId = renderStationsStep();
    await user.click(await screen.findByTestId('open-station-import'));
    const file = new File([[
      'Timestamp,Station,Target,Hz,Vz,Sd,Temperature,Pressure',
      '2026-01-01 00:00:00,UI_STA,P01,10,95,25.5,12,1013',
      '2026-01-02 00:00:00,UI_STA,P01,11,96,25.6,13,1012',
    ].join('\n')], 'station.csv', { type: 'text/csv' });
    await user.upload(screen.getByTestId('station-files'), file);

    expect(await screen.findByDisplayValue('UI_STA')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Detected station import preview' })).toHaveTextContent('2');
    await user.click(screen.getByTestId('confirm-station-import'));

    await waitFor(() => {
      expect(demoStore().catalogue.stations.find((station) => station.stationCode === 'UI_STA')).toMatchObject({
        datasetId: 'user-import',
        targetCount: 1,
        observationCount: 2,
      });
      expect(demoStore().getDraft(draftId)?.stationCodes).toEqual(['UI_STA']);
    });
  });
});
