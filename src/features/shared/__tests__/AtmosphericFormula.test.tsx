import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AtmosphericPolicy } from '@/domain/entities';
import { STANDARD_PPM_COEFFICIENTS, atmosphericPpm } from '@/domain/corrections/atmosphere';
import { AtmosphericFormula } from '@/features/shared/AtmosphericFormula';

/**
 * The whole point of this block is that it states what will *actually* be applied. Two things are
 * therefore worth a test: that a template label disagreeing with the code is surfaced rather than
 * trusted, and that the coefficients on screen come from the domain instead of a second copy.
 */
describe('atmospheric formula', () => {
  const policy = (over: Partial<AtmosphericPolicy> = {}): AtmosphericPolicy => ({
    mode: 'cycle-temperature-pressure',
    missingPolicy: 'wait-or-fail',
    marksResultProvisional: false,
    formulaId: 'standard-ppm-v1',
    formulaVersion: 1,
    ...over,
  });

  it('typesets the coefficients the domain actually computes with', () => {
    render(<AtmosphericFormula policy={policy()} />);
    expect(screen.getByText(new RegExp(String(STANDARD_PPM_COEFFICIENTS.refractivityPpm)))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(String(STANDARD_PPM_COEFFICIENTS.pressurePerHPa)))).toBeInTheDocument();
  });

  it('flags a template that declares a formula the mode does not apply', () => {
    // The FR template ships exactly this: `none-already-applied` on a station switched to cycle T/P.
    render(<AtmosphericFormula policy={policy({ formulaId: 'none-already-applied' })} />);
    const warning = screen.getByTestId('formula-mismatch');
    expect(warning).toHaveTextContent('none-already-applied');
    expect(warning).toHaveTextContent('standard-ppm-v1');
  });

  it('says nothing is applied when the station corrected the distances itself', () => {
    render(<AtmosphericFormula policy={policy({ mode: 'already-applied', formulaId: 'none' })} />);
    expect(screen.getByText(/already corrected/)).toBeInTheDocument();
    expect(screen.queryByTestId('formula-mismatch')).not.toBeInTheDocument();
  });

  it('works the formula on the station’s own values when they are fixed', () => {
    render(
      <AtmosphericFormula
        policy={policy({ mode: 'fixed-temperature-pressure', fixedTemperatureC: 25, fixedPressureHPa: 990 })}
      />,
    );
    const expected = atmosphericPpm(25, 990).toFixed(2);
    expect(screen.getByText(new RegExp(`${expected} ppm`))).toBeInTheDocument();
    expect(screen.getByText(/25.0 °C/)).toBeInTheDocument();
  });
});
