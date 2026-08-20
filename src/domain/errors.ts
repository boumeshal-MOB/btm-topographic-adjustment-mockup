/**
 * Two distinct error shapes (audit item 2):
 *
 * - `DomainIssue` — a *business-rule* violation. `ruleId` is MANDATORY: every business
 *   validation must cite the numbered rule it enforces (CORR-002, INIT-005, ...) so
 *   `VALIDATION.md` rule-counter auditing works by grepping test/code.
 * - `SchemaIssue` — a *technical* schema/shape violation with no business meaning (a generic
 *   Zod issue: wrong type, missing key). It carries no `ruleId`; conflating the two would let a
 *   business error ship without a rule reference.
 *
 * Both share `code`, `fieldPath`, `message` (`DOMAINE-ET-STARNET.md`: "Les erreurs sont typées avec
 * code, fieldPath, ruleId et message localisable.").
 */

interface IssueBase {
  code: string;
  fieldPath: string;
  message: string;
}

/** Business-rule violation. `ruleId` is required. */
export interface DomainIssue extends IssueBase {
  ruleId: string;
}

/** Technical schema/shape violation. Never carries a business rule ID. */
export interface SchemaIssue extends IssueBase {
  ruleId?: never;
}

export type AnyIssue = DomainIssue | SchemaIssue;

export function domainIssue(issue: DomainIssue): DomainIssue {
  return issue;
}

export function schemaIssue(issue: Omit<SchemaIssue, 'ruleId'>): SchemaIssue {
  return issue;
}

export function isDomainIssue(issue: AnyIssue): issue is DomainIssue {
  return typeof issue.ruleId === 'string';
}

export class DomainValidationError extends Error {
  readonly issues: AnyIssue[];

  constructor(issues: AnyIssue[]) {
    super(issues.map((i) => `${i.fieldPath}: ${i.message}`).join('; '));
    this.name = 'DomainValidationError';
    this.issues = issues;
  }
}
