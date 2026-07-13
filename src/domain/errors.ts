/**
 * Every domain validation error carries a stable rule ID, a machine-readable code, the
 * offending field path and a human message (protocol §How to execute this plan, item 4;
 * `domain/21-CONTRATS-DE-DONNEES.md §12`: "Les erreurs sont typées avec code, fieldPath, ruleId
 * et message localisable.").
 */
export interface DomainIssue {
  /** Stable business rule ID, e.g. "CORR-002", "INIT-005". Absent for pure schema issues. */
  ruleId?: string;
  code: string;
  fieldPath: string;
  message: string;
}

export function domainIssue(issue: DomainIssue): DomainIssue {
  return issue;
}

export class DomainValidationError extends Error {
  readonly issues: DomainIssue[];

  constructor(issues: DomainIssue[]) {
    super(issues.map((i) => `${i.fieldPath}: ${i.message}`).join('; '));
    this.name = 'DomainValidationError';
    this.issues = issues;
  }
}
