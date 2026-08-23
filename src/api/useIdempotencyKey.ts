import { useRef } from 'react';

import { newIdempotencyKey } from './idempotency';

/**
 * A stable Idempotency-Key for one create/action form instance. Held in a ref so
 * a manual retry after a dropped response reuses the SAME key (the Control Plane
 * dedupes → no duplicate resource). Call `reset()` on success so the next
 * distinct action gets a fresh key (otherwise a second create through the same
 * mounted form would be deduped as the first).
 */
export function useIdempotencyKey(): {
  header: () => { 'Idempotency-Key': string };
  reset: () => void;
} {
  const ref = useRef(newIdempotencyKey());
  return {
    header: () => ({ 'Idempotency-Key': ref.current }),
    reset: () => {
      ref.current = newIdempotencyKey();
    },
  };
}
