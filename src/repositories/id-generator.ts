/** Injectable ID generator so domain/application code and tests stay deterministic. */
export interface IdGenerator {
  next(prefix?: string): string;
}

/** Deterministic, test-friendly generator: `prefix-000001`, `prefix-000002`, ... */
export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  next(prefix = 'id'): string {
    this.counter += 1;
    return `${prefix}-${String(this.counter).padStart(6, '0')}`;
  }

  reset(): void {
    this.counter = 0;
  }
}
