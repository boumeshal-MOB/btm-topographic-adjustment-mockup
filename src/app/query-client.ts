import { QueryClient } from '@tanstack/react-query';

/**
 * Single application query cache.
 *
 * Kept in its own module so it can be imported without pulling in a component — and so tests can
 * clear it between cases. It is shared process-wide, which means a stale entry would otherwise
 * leak from one test into the next.
 */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
