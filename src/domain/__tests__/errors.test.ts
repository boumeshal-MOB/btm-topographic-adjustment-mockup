import { describe, expect, it } from 'vitest';
import { DomainValidationError, domainIssue } from '@/domain/errors';

describe('DomainIssue / DomainValidationError', () => {
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

  it('DomainValidationError aggregates issues into a readable message', () => {
    const error = new DomainValidationError([
      domainIssue({ ruleId: 'INIT-002', code: 'required', fieldPath: 'anchor.eastingM', message: 'Easting is required' }),
    ]);
    expect(error.issues).toHaveLength(1);
    expect(error.message).toContain('anchor.eastingM');
  });
});
