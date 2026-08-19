import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import { stationPointId } from '@/demo/resolve-run';
import WizardPage from '@/features/create/WizardPage';

/** A draft parked on the Adjustment step, with its approximate coordinates accepted. */
function draftAtAdjustment() {
  const store = demoStore();
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  draft.initialisation.result = store.computeDraftInitialisation(draft);
  draft.initialisation.result.accepted = true;
  draft.initialisation.references = [];
  draft.step = 5;
  return store.saveDraft(draft);
}

function renderWizard(draftId: string) {
  const router = createMemoryRouter(
    [{ path: '/create/:draftId', element: <WizardPage /> }],
    { initialEntries: [`/create/${draftId}`] },
  );
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

describe('Adjustment step: the datum of every run', () => {
  beforeEach(() => {
    queryClient.clear();
    demoStore().reset();
  });

  it('renders without writing the draft on mount', async () => {
    /**
     * Materialising the datum from an effect looked convenient and cost an afternoon: `update`
     * is recreated on every render, so the effect ran on every render, wrote the draft, re-rendered,
     * and React eventually threw `Maximum update depth exceeded` — surfacing inside a MUI input, far
     * from the cause. Opening a screen must not modify a configuration; the datum is an explicit act.
     */
    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.map(String).join(' ')); };

    const draft = draftAtAdjustment();
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });

    console.error = original;
    expect(errors.filter((line) => /Maximum update depth/.test(line))).toEqual([]);
    // Nothing was saved by simply arriving on the step.
    expect(demoStore().getDraft(draft.id)?.initialisation.references).toEqual([]);
  }, 40_000);

  it('blocks Next until something holds the network, then applies the datum in one click', async () => {
    const user = userEvent.setup();
    const draft = draftAtAdjustment();
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });

    // Nothing is held: the step says so and the wizard refuses to move on.
    expect(screen.getByText(/no datum and no unique solution/)).toBeVisible();
    expect(screen.getByTestId('wizard-next')).toBeDisabled();

    await user.click(screen.getByTestId('apply-recommended-datum'));

    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled(), { timeout: 15_000 });
    const controls = demoStore().getDraft(draft.id)!.initialisation.references;
    // The references are weighted…
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.modeE === 'weak' && control.modeH === 'weak')).toBe(true);
    // …and no station is held: a station without a record is a station STAR*NET will solve.
    expect(controls.some((control) => control.pointKey === stationPointId('NTE_ATS34'))).toBe(false);
  }, 60_000);

  it('frees a component by removing it from the record, and holds it back when asked', async () => {
    const user = userEvent.setup();
    const draft = draftAtAdjustment();
    renderWizard(draft.id);
    await screen.findByTestId('datum-table', {}, { timeout: 20_000 });
    await user.click(screen.getByTestId('apply-recommended-datum'));
    await waitFor(() => expect(screen.getByTestId('wizard-next')).toBeEnabled(), { timeout: 15_000 });

    const controlled = demoStore().getDraft(draft.id)!.initialisation.references[0].pointKey;
    const row = screen.getByTestId(`datum-row-${controlled}`);
    await user.click(within(row).getByRole('combobox', { name: `${controlled} H` }));
    await user.click(screen.getByRole('option', { name: 'Free' }));

    await waitFor(() => {
      const record = demoStore().getDraft(draft.id)!.initialisation.references
        .find((control) => control.pointKey === controlled);
      expect(record?.modeH).toBe('free');
      expect(record?.modeE).toBe('weak');
    }, { timeout: 15_000 });

    // Freeing the last held component of a point removes its record entirely.
    for (const component of ['E', 'N'] as const) {
      await user.click(within(row).getByRole('combobox', { name: `${controlled} ${component}` }));
      await user.click(screen.getByRole('option', { name: 'Free' }));
    }
    await waitFor(() => {
      const records = demoStore().getDraft(draft.id)!.initialisation.references;
      expect(records.some((control) => control.pointKey === controlled)).toBe(false);
    }, { timeout: 15_000 });
  }, 90_000);
});

vi.setConfig({ testTimeout: 90_000 });
