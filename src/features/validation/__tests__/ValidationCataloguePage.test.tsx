import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { clearDatabase } from '@/demo/persistence';
import { demoStore } from '@/demo/store';
import i18n from '@/app/i18n';
import {
  readDataset,
  readManifest,
} from '@/domain/validation-catalogue/__tests__/catalogue-fixtures';

/**
 * The gateway is the I/O seam: in the browser it fetches static files from `public/`. Component
 * tests serve the *real* published files from disk through it, so the page is exercised against
 * the genuine manifest and a genuine shard rather than a hand-written stub.
 */
vi.mock('@/demo/validation-catalogue-gateway', async () => {
  const actual = await vi.importActual<typeof import('@/demo/validation-catalogue-gateway')>(
    '@/demo/validation-catalogue-gateway',
  );
  const fixtures = await import('@/domain/validation-catalogue/__tests__/catalogue-fixtures');
  return {
    ...actual,
    loadValidationManifest: vi.fn(async () => fixtures.readManifest()),
    loadValidationDataset: vi.fn(async ({ id }: { id: string }) => fixtures.readDataset(id)),
    loadedShardFiles: vi.fn(() => []),
  };
});

function renderCatalogue() {
  const router = createMemoryRouter(
    [
      {
        path: '/validation-catalogue',
        lazy: async () => ({ Component: (await import('@/features/validation/ValidationCataloguePage')).default }),
      },
      { path: '/processing/topographic-adjustment/:id/analysis', element: <div>analysis lab</div> },
    ],
    { initialEntries: ['/validation-catalogue'] },
  );
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

describe('validation catalogue browser', () => {
  beforeEach(async () => {
    clearDatabase();
    demoStore().reset();
    for (const session of [...demoStore().listValidationSessions()]) {
      demoStore().deleteValidationSession(session.processingId);
    }
    // The query cache is process-wide; without this the previous case's session list survives.
    queryClient.clear();
    await i18n.changeLanguage('en');
  });

  it('lists the catalogue from the manifest alone', async () => {
    renderCatalogue();

    expect(await screen.findByRole('heading', { name: 'Validation catalogue' })).toBeVisible();
    const count = await screen.findByTestId('validation-result-count');
    expect(count).toHaveTextContent('100 of 100 datasets');
    expect(screen.getByTestId('validation-row-BTM-VAL-041')).toBeVisible();
  }, 30_000);

  it('hides the expected scenario until blind mode is turned off', async () => {
    const user = userEvent.setup();
    renderCatalogue();

    const row = await screen.findByTestId('validation-row-BTM-VAL-001');
    // BTM-VAL-001 is a moved-reference case; blind mode must not say so anywhere on screen
    expect(within(row).getByText('Hidden')).toBeVisible();
    expect(screen.queryByText('Moved reference')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('blind-mode-toggle').querySelector('input')!);

    await waitFor(() => expect(within(row).queryByText('Hidden')).not.toBeInTheDocument());
    expect(within(row).getByText('Moved reference')).toBeVisible();
  }, 30_000);

  it('filters by stations, scenario, template and composition', async () => {
    const user = userEvent.setup();
    const manifest = readManifest();
    renderCatalogue();
    await screen.findByTestId('validation-result-count');

    await user.click(screen.getByLabelText('Stations'));
    await user.click(await screen.findByRole('option', { name: '1' }));
    const expected = manifest.datasets.filter((entry) => entry.stationCount === 1).length;
    await waitFor(() =>
      expect(screen.getByTestId('validation-result-count')).toHaveTextContent(`${expected} of 100 datasets`));

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() =>
      expect(screen.getByTestId('validation-result-count')).toHaveTextContent('100 of 100 datasets'));

    await user.click(screen.getByLabelText('Composition'));
    await user.click(await screen.findByRole('option', { name: 'With a secondary anomaly' }));
    await waitFor(() =>
      expect(screen.getByTestId('validation-result-count'))
        .toHaveTextContent(`${manifest.distribution.combined} of 100 datasets`));
  }, 45_000);

  it('finds a dataset by identifier and reports an empty result honestly', async () => {
    const user = userEvent.setup();
    renderCatalogue();
    await screen.findByTestId('validation-result-count');

    const search = screen.getByLabelText('Search by identifier');
    await user.type(search, 'BTM-VAL-041');
    await waitFor(() =>
      expect(screen.getByTestId('validation-result-count')).toHaveTextContent('1 of 100 datasets'));

    await user.clear(search);
    await user.type(search, 'BTM-VAL-999');
    expect(await screen.findByText('No dataset matches these filters.')).toBeVisible();
  }, 45_000);

  it('imports the canonical dataset and opens it in the Analysis Lab', async () => {
    const user = userEvent.setup();
    renderCatalogue();

    await screen.findByTestId('validation-row-BTM-VAL-041');
    await user.click(screen.getByTestId('open-BTM-VAL-041'));

    expect(await screen.findByRole('heading', { name: /Open BTM-VAL-041/ })).toBeVisible();
    await user.click(screen.getByTestId('confirm-import'));

    expect(await screen.findByText('analysis lab', {}, { timeout: 30_000 })).toBeVisible();

    const session = demoStore().listValidationSessions().find((item) => item.datasetId === 'BTM-VAL-041');
    expect(session).toBeDefined();
    expect(session!.faceReduction).toBe('none');

    // the imported session carries the network, not the answer
    const processing = demoStore().getProcessing(session!.processingId);
    expect(processing?.processing.scope).toBe('network');
    expect(JSON.stringify(demoStore().db)).not.toContain('faultPlans');
  }, 60_000);

  it('offers the existing session instead of importing the same dataset twice', async () => {
    const user = userEvent.setup();
    const dataset = readDataset('BTM-VAL-041');
    expect(dataset.id).toBe('BTM-VAL-041');

    renderCatalogue();
    await screen.findByTestId('validation-row-BTM-VAL-041');
    await user.click(screen.getByTestId('open-BTM-VAL-041'));
    await user.click(screen.getByTestId('confirm-import'));
    await screen.findByText('analysis lab', {}, { timeout: 30_000 });

    // re-render: the row now offers the existing lab session
    renderCatalogue();
    const row = await screen.findAllByTestId('validation-row-BTM-VAL-041');
    expect(within(row.at(-1)!).getByRole('button', { name: 'Open the existing session' })).toBeVisible();
  }, 60_000);
});
