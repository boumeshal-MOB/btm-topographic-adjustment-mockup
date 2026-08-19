import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { NativeFilesPanel } from '@/features/shared/NativeFilesPanel';

describe('native files panel', () => {
  const files = [
    { name: 'input.dat', content: 'C  REF01  10.0000  20.0000  30.0000  0.0015  0.0015  *\n' },
    { name: 'project.prj', content: '*STAR*NET 2\n[DataFileList]\n3 "input.dat"\n' },
  ];

  it('shows the first file and switches on demand', async () => {
    const user = userEvent.setup();
    render(<NativeFilesPanel files={files} />);

    expect(screen.getByLabelText('input.dat')).toHaveTextContent(/C REF01 10.0000/);
    await user.click(screen.getByRole('button', { name: 'project.prj' }));
    expect(screen.getByLabelText('project.prj')).toHaveTextContent('[DataFileList]');
  });

  it('hides an empty file instead of offering a blank viewer', () => {
    render(<NativeFilesPanel files={[files[0], { name: 'project.prj', content: '' }]} />);
    expect(screen.queryByRole('button', { name: 'project.prj' })).not.toBeInTheDocument();
  });

  it('reports why the files are missing and offers nothing to read', () => {
    render(<NativeFilesPanel files={[{ name: 'input.dat', content: '' }]} error="a direction set requires at least two directions" />);
    expect(screen.getByText(/at least two directions/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('surfaces what the native format cannot express', () => {
    render(<NativeFilesPanel files={files} warnings={['STAR*NET adjusts the complete sight']} />);
    expect(screen.getByText('STAR*NET adjusts the complete sight')).toBeInTheDocument();
  });

  it('colours the tokens that decide the datum and names them', () => {
    render(<NativeFilesPanel files={files} />);
    const dat = screen.getByLabelText('input.dat');
    // The free component is its own span, so it can be coloured without touching the raw text.
    const free = within(dat).getByText('*');
    expect(free).toHaveStyle({ color: 'rgb(230, 81, 0)' });
    expect(screen.getByText('! fixed')).toBeVisible();
    expect(screen.getByText('* free')).toBeVisible();
    // The gutter numbers every line, matching what STAR*NET reports.
    expect(within(dat).getByText('1')).toBeVisible();
  });

  it('keeps only the decisive lines of a listing when asked', async () => {
    const user = userEvent.setup();
    const listing = [
      'STAR*NET-PRO Run Date 2026-08-19',
      'Solution Has Converged in 4 Iterations',
      'Adjusted Coordinates',
      'Chi-Square Test at 5.00% Level Passed',
    ].join('\n');
    render(<NativeFilesPanel files={[{ name: 'project.lst', content: listing }]} />);

    expect(screen.getByLabelText('project.lst')).toHaveTextContent('Adjusted Coordinates');
    await user.click(screen.getByTestId('native-files-notable'));
    expect(screen.getByLabelText('project.lst')).not.toHaveTextContent('Adjusted Coordinates');
    expect(screen.getByLabelText('project.lst')).toHaveTextContent('Solution Has Converged');
    expect(screen.getByText('2 of 4 lines')).toBeVisible();
  });

  it('says nothing is available yet rather than showing an empty box', () => {
    render(<NativeFilesPanel files={[]} emptyMessage="No output file yet." />);
    expect(screen.getByText('No output file yet.')).toBeInTheDocument();
  });
});
