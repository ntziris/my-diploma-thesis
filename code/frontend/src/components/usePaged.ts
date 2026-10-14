import { useState } from 'react';

// Client-side paging: the first `size` rows, then `size` more per click of MoreButton
export function usePaged<T>(items: readonly T[], size = 10) {
  const [shown, setShown] = useState(size);
  return {
    rows: items.slice(0, shown),
    remaining: Math.max(0, items.length - shown),
    more: () => setShown((n) => n + size),
  };
}
