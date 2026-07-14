import { describe, expect, it } from 'vitest';
import {
  DomainValidationError,
  domainIssue,
  isDomainIssue,
  schemaIssue,
  type DomainIssue,
} from '@/domain/errors';

describe('DomainIssue (business) — ruleId is mandatory (audit item 2)', () => {
  it('carries ruleId, code, fieldPath and message', () => {
    const issue = domainIssue({
      ruleId: 'CORR-002',
      code: 'invalid-delta',
      fieldPath: 'measurementSetup.prismDeltaM',
      message: 'prismDelta must equal requiredConstant - alreadyAppliedConstant',
    });
    expect(issue.ruleId).toBe('CORR-002');
    expect(issue.code).toBe('invalid-delta');
    expect(issue.fieldPath).toBe('measurementSetup.prismDeltaM');
  });

  it('is recognised as a business issue by isDomainIssue', () => {
    const issue = domainIssue({
      ruleId: 'INIT-005',
      code: 'not-a-median',
      fieldPath: 'initialisation',
      message: 'representative must be the window median',
    });
    expect(isDomainIssue(issue)).toBe(true);
  });

  it('type-checks: every business issue must supply a ruleId', () => {
    // @ts-expect-error — a DomainIssue without ruleId is a compile error (audit item 2).
    const invalid: DomainIssue = { code: 'x', fieldPath: 'y', message: 'z' };
    expect(invalid.code).toBe('x');
  });
});

describe('SchemaIssue (technical) — never carries a ruleId', () => {
  it('is not treated as a business issue', () => {
    const issue = schemaIssue({ code: 'invalid_type', fieldPath: 'stationBindings', message: 'Required' });
    expect(isDomainIssue(issue)).toBe(false);
    expect(issue).not.toHaveProperty('ruleId');
  });
});

describe('DomainValidationError', () => {
  it('aggregates mixed business and technical issues into a readable message', () => {
    const error = new DomainValidationError([
      domainIssue({ ruleId: 'INIT-002', code: 'required', fieldPath: 'anchor.eastingM', message: 'Easting is required' }),
      schemaIssue({ code: 'invalid_type', fieldPath: 'runPolicy', message: 'Expected object' }),
    ]);
    expect(error.issues).toHaveLength(1 + 1);
    expect(error.message).toContain('anchor.eastingM');
    expect(error.issues.filter(isDomainIssue)).toHaveLength(1);
  });
});
