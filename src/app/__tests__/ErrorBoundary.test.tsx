import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/app/ErrorBoundary';

function Bomb({ live }: { live: boolean }) {
  if (live) throw new Error('points.filter is not a function');
  return <p>panel content</p>;
}

afterEach(() => vi.restoreAllMocks());

describe('error boundary', () => {
  it('contains a panel failure, names the section and keeps the rest of the screen', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <p>the rest of the workspace</p>
        <ErrorBoundary label="Network map">
          <Bomb live />
        </ErrorBoundary>
      </div>,
    );

    // The neighbouring content — and, in the Analysis Lab, the trials held with it — survive.
    expect(screen.getByText('the rest of the workspace')).toBeVisible();
    expect(screen.getByTestId('panel-error')).toHaveTextContent('"Network map" could not be displayed');
    // The technical cause stays visible: a minified `f.find is not a function` in a console nobody
    // opens is what made the original report impossible to place.
    expect(screen.getByText('points.filter is not a function')).toBeVisible();
  });

  it('re-renders the panel on demand without reloading the page', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();

    let failing = true;
    const Recovering = () => <Bomb live={failing} />;

    render(<ErrorBoundary label="Points"><Recovering /></ErrorBoundary>);
    expect(screen.getByTestId('panel-error')).toBeVisible();

    // Whatever made the payload wrong has been refetched in the meantime.
    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(screen.getByText('panel content')).toBeVisible();
    expect(screen.queryByTestId('panel-error')).not.toBeInTheDocument();
  });

  it('replaces the shell when it has no label', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Bomb live /></ErrorBoundary>);
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
    expect(screen.queryByTestId('panel-error')).not.toBeInTheDocument();
  });
});
