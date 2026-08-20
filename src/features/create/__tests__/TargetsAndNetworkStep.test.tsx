import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { demoStore } from '@/demo/store';
import { stationPointId } from '@/demo/resolve-run';
import WizardPage from '@/features/create/WizardPage';

/**
 * A draft parked on Targets & Measurements, with the ATS34 station and its sights.
 *
 * `withKnownReferences` brings the workbook header coordinates along, because a constraint only
 * means something on a coordinate the survey actually knows.
 */
function draftAtTargets(withKnownReferences = false) {
  const store = demoStore();
  const draft = store.createDraft('uk-supplied-hs2-nte', 'single-station');
  store.applyStationSelection(draft, ['NTE_ATS34']);
  if (withKnownReferences) {
    draft.initialisation.mode = 'known-references';
    draft.initialisation.references = store.catalogue.references
      .filter((reference) => reference.datasetId === 'ats34')
      .flatMap((reference) => {
        const target = draft.targets.find((item) => item.rawTargetName === reference.pointName);
        return target ? [{
          pointKey: target.engineName,
          eastingM: reference.eastingM,
          northingM: reference.northingM,
          heightM: reference.heightM,
          modeE: 'free' as const,
          modeN: 'free' as const,
          modeH: 'free' as const,
          sigmaM: reference.sigmaM,
          source: 'ATS34 workbook header',
        }] : [];
      });
  }
  draft.step = 3;
  return store.saveDraft(draft);
}

function renderWizard(draftId: string) {
  const router = createMemoryRouter(
    [{ path: '/create/:draftId', element: <WizardPage /> }],
    { initialEntries: [`/create/${draftId}`] },
  );
  return render(<AppProviders><RouterProvider router={router} /></AppProviders>);
}

const stored = (draftId: string) => demoStore().getDraft(draftId)!;

describe('Targets & Measurements: dense, editable in bulk, and the owner of the datum', () => {
  beforeEach(() => {
    queryClient.clear();
    demoStore().reset();
  });

  it('states each sight without mounting a form control per value', async () => {
    /**
     * The whole reason for the rebuild: a station carries up to a hundred prisms, and the old row put
     * roughly ten inputs on each of them. A row now states its configuration — the only controls left
     * are the three checkboxes and the datum tokens.
     */
    const draft = draftAtTargets();
    renderWizard(draft.id);
    const group = await screen.findByTestId('station-group-NTE_ATS34', {}, { timeout: 20_000 });

    const rows = within(group).getAllByTestId(/^target-row-/);
    expect(rows.length).toBeGreaterThan(5);
    // No text input inside a row: the numbers are read, not typed here.
    expect(within(rows[0]).queryByRole('textbox')).toBeNull();
    expect(within(rows[0]).queryByRole('spinbutton')).toBeNull();
    expect(within(rows[0]).getAllByRole('checkbox')).toHaveLength(3);
  }, 40_000);

  it('weights every sight from the station instrument, and says so', async () => {
    /**
     * The standard errors moved to the Instruments step. A sight that says nothing is weighted by its
     * instrument — 1.0 mm + 1 ppm and 2.5″ for the UK supplied project — and the header states it so
     * the number is never anonymous.
     */
    const draft = draftAtTargets();
    renderWizard(draft.id);
    const group = await screen.findByTestId('station-group-NTE_ATS34', {}, { timeout: 20_000 });

    expect(group).toHaveTextContent(/1\.00 mm \+ 1\.0 ppm/);
    expect(group).toHaveTextContent(/2\.50″/);
    // Nothing overrides anything on a fresh draft.
    expect(screen.queryByText(/σ propre|own σ/)).toBeNull();
  }, 40_000);

  it('holds the network with the known references, and never with a station', async () => {
    const user = userEvent.setup();
    const draft = draftAtTargets(true);
    renderWizard(draft.id);
    await screen.findByTestId('station-group-NTE_ATS34', {}, { timeout: 20_000 });

    await user.click(screen.getByTestId('apply-recommended-datum'));

    await waitFor(() => {
      const controls = stored(draft.id).initialisation.references;
      expect(controls.length).toBeGreaterThanOrEqual(2);
      expect(controls.every((control) => control.modeE === 'weak' && control.modeH === 'weak')).toBe(true);
      // A station without a record is a station STAR*NET will solve.
      expect(controls.some((control) => control.pointKey === stationPointId('NTE_ATS34'))).toBe(false);
    }, { timeout: 15_000 });
  }, 60_000);

  it('frees a point by removing its record, one component at a time', async () => {
    const user = userEvent.setup();
    const draft = draftAtTargets(true);
    renderWizard(draft.id);
    await screen.findByTestId('station-group-NTE_ATS34', {}, { timeout: 20_000 });
    await user.click(screen.getByTestId('apply-recommended-datum'));

    let released = '';
    await waitFor(() => {
      released = stored(draft.id).initialisation.references[0]?.pointKey ?? '';
      expect(released).not.toBe('');
    }, { timeout: 15_000 });

    for (const component of ['H', 'E', 'N'] as const) {
      await user.click(screen.getByTestId(`constraint-${released}-${component}`));
      await user.click(screen.getByRole('menuitem', { name: 'Free' }));
    }

    // Freeing the last held component of a point removes its record entirely: a free point needs
    // no `C` line at all.
    await waitFor(() => {
      const records = stored(draft.id).initialisation.references;
      expect(records.some((control) => control.pointKey === released)).toBe(false);
    }, { timeout: 15_000 });
  }, 90_000);

  it('writes the reflector and its constant to a whole selection in one gesture', async () => {
    /**
     * A hundred prisms cannot be configured one row at a time. Picking the reflector from the country
     * template is what sets the constant — 8.9 mm for the UK L-bar — so the two can never disagree.
     */
    const user = userEvent.setup();
    const draft = draftAtTargets();
    renderWizard(draft.id);
    await screen.findByTestId('station-group-NTE_ATS34', {}, { timeout: 20_000 });

    // Filtering first is the real gesture: the surveyor narrows to the sights they mean, then
    // selects what is visible. It also keeps the assertion about *which* rows were written honest.
    await user.click(screen.getByRole('combobox', { name: 'Role' }));
    await user.click(screen.getByRole('option', { name: 'Reference point' }));
    await user.click(screen.getByTestId('select-all-visible'));
    await screen.findByTestId('target-bulk-bar');
    await user.click(screen.getByTestId('open-bulk-editor'));
    await user.click(screen.getByTestId('bulk-reflector'));
    await user.click(screen.getByRole('option', { name: /L-bar/ }));
    await user.click(screen.getByTestId('apply-bulk-edit'));

    await waitFor(() => {
      const targets = stored(draft.id).targets;
      const references = targets.filter((target) => target.role === 'reference');
      expect(references.length).toBeGreaterThan(0);
      expect(references.every((target) => target.measurementSetupId === 'uk-lbar-8_9')).toBe(true);
      expect(references.every((target) => Math.abs(target.requiredConstantM - 0.0089) < 1e-9)).toBe(true);
      // The monitored sights were not selected, so they were not touched.
      expect(targets.some((target) => target.role !== 'reference' && target.measurementSetupId !== 'uk-lbar-8_9')).toBe(true);
    }, { timeout: 20_000 });
  }, 120_000);

  it('hands a restated standard error back to the instrument', async () => {
    const user = userEvent.setup();
    const store = demoStore();
    const draft = draftAtTargets();
    // One sight measured differently — the case the per-sight override exists for.
    draft.targets[0].distanceStdErrMm = 4;
    store.saveDraft(draft);

    renderWizard(draft.id);
    await screen.findByTestId('station-group-NTE_ATS34', {}, { timeout: 20_000 });

    await user.click(screen.getByTestId('select-all-visible'));
    await user.click(screen.getByTestId('open-bulk-editor'));
    await user.click(within(screen.getByTestId('bulk-follow-instrument')).getByRole('checkbox'));
    await user.click(screen.getByTestId('apply-bulk-edit'));

    await waitFor(() => {
      expect(stored(draft.id).targets.every((target) => target.distanceStdErrMm === undefined)).toBe(true);
    }, { timeout: 15_000 });
  }, 90_000);
});

vi.setConfig({ testTimeout: 90_000 });
