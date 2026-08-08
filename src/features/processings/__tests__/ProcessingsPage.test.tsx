import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/app/providers';
import { demoStore } from '@/demo/store';
import ProcessingsPage from '@/features/processings/ProcessingsPage';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...await importOriginal<typeof import('react-router-dom')>(),
  useNavigate: () => navigate,
}));

describe('Processings page', () => {
  beforeEach(() => {
    demoStore().reset();
    navigate.mockReset();
  });

  it('opens a processing Analysis Lab directly from the main list', async () => {
    const processing = demoStore().listProcessings()[0];
    const user = userEvent.setup();

    render(<AppProviders><ProcessingsPage /></AppProviders>);

    await user.click(await screen.findByTestId(`open-analysis-lab-${processing.id}`));
    expect(navigate).toHaveBeenCalledWith(`/processing/topographic-adjustment/${processing.id}/analysis`);
  });
});
