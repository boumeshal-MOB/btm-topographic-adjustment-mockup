/** Injectable clock so domain/application code never calls `Date.now()`/`new Date()` directly. */
export interface Clock {
  /** Current instant, ISO-8601 UTC. */
  now(): string;
}

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
