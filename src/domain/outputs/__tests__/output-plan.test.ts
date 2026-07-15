import { describe, expect, it } from 'vitest';
import { buildOutputVariablePlan, deltaComponent, targetAvailabilityPercent } from '@/domain/outputs/output-plan';
import type { OutputPolicy } from '@/domain/entities';

const policy: Pick<OutputPolicy, 'targetComponents' | 'globalComponents'> = {
  targetComponents: ['adjusted-x', 'adjusted-y', 'adjusted-z', 'delta-x', 'delta-y', 'delta-z', 'sigma-x', 'sigma-y', 'sigma-z'],
  globalComponents: ['chi2-passed', 'variance-factor', 'references-available', 'target-availability', 'provisional-flag'],
};

describe('buildOutputVariablePlan (OUT-001/002/003/005)', () => {
  it('OUT-003 creates 9 components per published target plus the global components', () => {
    const plan = buildOutputVariablePlan(
      [
        { prismSensorId: 1, publishOutput: true },
        { prismSensorId: 2, publishOutput: true },
        { prismSensorId: 3, publishOutput: false }, // not published -> no variables
      ],
      policy,
    );
    expect(plan.filter((v) => v.scope === 'target')).toHaveLength(18);
    expect(plan.filter((v) => v.scope === 'global')).toHaveLength(5);
  });

  it('OUT-002 the plan is idempotent and version-independent: identical inputs give identical keys', () => {
    const bindings = [{ prismSensorId: 7, publishOutput: true }];
    const first = buildOutputVariablePlan(bindings, policy).map((v) => v.key);
    const second = buildOutputVariablePlan(bindings, policy).map((v) => v.key);
    expect(second).toEqual(first);
    // a duplicated binding for the same sensor creates no extra variables
    const dup = buildOutputVariablePlan([...bindings, ...bindings], policy);
    expect(dup.filter((v) => v.scope === 'target')).toHaveLength(9);
  });
});

describe('output value semantics (OUT-004/006/007)', () => {
  it('OUT-004 Delta = adjusted − initial of the slot version', () => {
    expect(deltaComponent(100.0125, 100.0)).toBeCloseTo(0.0125, 9);
  });

  it('OUT-006 Target Availability uses the active output target denominator', () => {
    expect(targetAvailabilityPercent(30, 40)).toBeCloseTo(75, 9);
    expect(targetAvailabilityPercent(0, 0)).toBe(0);
  });
});
