import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppProviders } from '@/app/providers';
import i18n from '@/app/i18n';
import type {
  AdjustmentDiagnostic,
  DiagnosticPoint,
  DiagnosticResidual,
} from '@/domain/engine/run-input';
import { NetworkView } from '@/features/shared/components';

const point = (
  engineName: string,
  role: DiagnosticPoint['role'],
  eastingM: number,
  northingM: number,
  observedByStations: string[] = [],
  identityState: DiagnosticPoint['identityState'] = role === 'station' ? 'station' : 'individual',
): DiagnosticPoint => ({
  engineName,
  role,
  eastingM,
  northingM,
  heightM: 10,
  sigmaEM: 0.001,
  sigmaNM: 0.001,
  sigmaHM: 0.001,
  ellipseSemiMajorM: 0.002,
  ellipseSemiMinorM: 0.001,
  ellipseOrientationDeg: 0,
  observationCount: observedByStations.length * 3,
  observedByStations,
  identityState,
  singleRay: role !== 'station' && observedByStations.length <= 1,
});

const residual = (stationEngineName: string, targetEngineName: string): DiagnosticResidual => ({
  scalarObservationId: `${stationEngineName}-${targetEngineName}:hz`,
  observationId: `${stationEngineName}-${targetEngineName}`,
  stationEngineName,
  targetEngineName,
  kind: 'hz',
  residual: 0,
  sigma: 1,
  stdResidual: 0,
  normalizedResidual: 0,
  redundancy: 0.5,
});

const diagnostic: AdjustmentDiagnostic = {
  engineLabel: 'test',
  ok: true,
  converged: true,
  iterations: 2,
  observationCount: 12,
  constraintCount: 3,
  unknownCount: 9,
  rank: 9,
  rankDeficiency: 0,
  deficientUnknowns: [],
  degreesOfFreedom: 3,
  chiSquareStatus: 'passed',
  chiSquareLower: 0,
  chiSquareUpper: 10,
  weightedSSR: 1,
  varianceFactor: 1,
  maxStdResidual: 0,
  points: [
    point('STA1', 'station', 0, 0),
    point('STA2', 'station', 100, 0),
    point('COMMON', 'monitoring', 50, 50, ['STA1', 'STA2'], 'shared'),
    point('ONLY_1', 'monitoring', 15, 30, ['STA1']),
    point('ONLY_2', 'auxiliary', 85, 30, ['STA2']),
  ],
  residuals: [
    residual('STA1', 'COMMON'),
    residual('STA2', 'COMMON'),
    residual('STA1', 'ONLY_1'),
    residual('STA2', 'ONLY_2'),
  ],
  autoAdjustAttempts: [],
  warnings: [],
};

function renderMap() {
  return render(
    <AppProviders>
      <NetworkView diagnostic={diagnostic} height={420} />
    </AppProviders>,
  );
}

function renderComparisonMap() {
  return render(
    <AppProviders>
      <NetworkView
        diagnostic={diagnostic}
        height={420}
        initialPoints={diagnostic.points.map((candidate) => ({
          engineName: candidate.engineName,
          eastingM: candidate.engineName === 'COMMON' ? candidate.eastingM - 0.004 : candidate.eastingM,
          northingM: candidate.northingM,
          heightM: candidate.heightM,
        }))}
      />
    </AppProviders>,
  );
}

describe('NetworkView filters', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders configured shared identity and keeps only shared targets with station context', async () => {
    const user = userEvent.setup();
    renderMap();

    expect(screen.getByTestId('network-filter-controls')).toContainElement(screen.getByTestId('role-filter-all'));
    const common = screen.getByTestId('network-point-COMMON');
    expect(common).toHaveAttribute('data-shared', 'true');
    expect(common.querySelector('[stroke="#C026D3"]')).not.toBeNull();

    await user.click(screen.getByTestId('shared-points-filter'));

    expect(screen.getByTestId('network-point-STA1')).toBeVisible();
    expect(screen.getByTestId('network-point-STA2')).toBeVisible();
    expect(screen.getByTestId('network-point-COMMON')).toBeVisible();
    expect(screen.queryByTestId('network-point-ONLY_1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('network-point-ONLY_2')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^network-ray-/)).toHaveLength(2);
    expect(screen.getByTestId('shared-points-filter')).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows one selected station, only its observed points and only its sight lines', async () => {
    const user = userEvent.setup();
    renderMap();

    await user.click(screen.getByRole('combobox', { name: 'Observed from station' }));
    await user.click(screen.getByRole('option', { name: 'STA1' }));

    expect(screen.getByTestId('network-point-STA1')).toBeVisible();
    expect(screen.queryByTestId('network-point-STA2')).not.toBeInTheDocument();
    expect(screen.getByTestId('network-point-COMMON')).toBeVisible();
    expect(screen.getByTestId('network-point-ONLY_1')).toBeVisible();
    expect(screen.queryByTestId('network-point-ONLY_2')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^network-ray-/)).toHaveLength(2);
    expect(screen.getByTestId('network-point-COMMON')).toHaveAttribute('data-observed-by', 'STA1,STA2');

    await user.click(screen.getByTestId('shared-points-filter'));
    expect(screen.getByTestId('network-point-STA1')).toBeVisible();
    expect(screen.getByTestId('network-point-COMMON')).toBeVisible();
    expect(screen.queryByTestId('network-point-ONLY_1')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^network-ray-/)).toHaveLength(1);
  });

  it('colours a point from the selected standardised correction component', async () => {
    const user = userEvent.setup();
    renderComparisonMap();

    const common = screen.getByTestId('network-point-COMMON');
    expect(common).toHaveAttribute('data-delta-score', '2.309');
    expect(common.querySelector('[fill="#009B55"]')).not.toBeNull();

    await user.click(screen.getByTestId('delta-colour-mode-e'));
    expect(common).toHaveAttribute('data-delta-score', '4.000');
    expect(common.querySelector('[fill="#F59E0B"]')).not.toBeNull();

    await user.click(screen.getByTestId('delta-colour-mode-role'));
    expect(common.querySelector('[fill="#202938"]')).not.toBeNull();
  });
});
